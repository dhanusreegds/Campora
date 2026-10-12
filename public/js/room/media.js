// Audio, video and screen sharing for the Help Room, using WebRTC with "perfect negotiation".
// Signalling messages travel through the Campora server (send / handleSignal), so a different transport,
// or a hosted video service, can replace this one file without touching the room page.
//
// Contract with the page:
//   new MediaSession({ iceServers, polite, send(data), onRemote(kind, stream|null), onPeerState(state), onStatus(text) })
//   kind: 'local' (own camera preview), 'localScreen', 'audio', 'cam', 'screen' (the partner's)
//
// The connection has three fixed transceivers (audio, camera, screen) in the same order on both sides, so
// switching the camera or screen on and off never needs a new connection.

const SLOTS = ['audio', 'cam', 'screen'];

export class MediaSession {
  constructor({ iceServers = [], polite = false, send, onRemote, onPeerState, onStatus } = {}) {
    this.iceServers = iceServers;
    this.polite = polite;
    this.rawSend = send || (async () => {});
    this.onRemote = onRemote || (() => {});
    this.onPeerState = onPeerState || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onLocalScreenEnded = () => {};
    this.pc = null;
    this.remoteSid = null;
    this.tx = null;
    this.mic = null;
    this.cam = null;
    this.screen = null;
    this.hasMic = false;
    this.hasCam = false;
    this.sharing = false;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingCandidates = [];
    this.remoteStreams = {};
    this.peer = { mic: true, cam: true, screen: false };
    this.queue = Promise.resolve();
    this.destroyed = false;
  }

  static get supported() { return typeof RTCPeerConnection !== 'undefined'; }

  // Signals are sent strictly in order, so a candidate can never overtake its description.
  send(data) {
    this.queue = this.queue.then(() => this.rawSend(data)).catch(() => {});
    return this.queue;
  }

  // ------------------------------------------------------------ local devices
  async start() {
    if (!MediaSession.supported) { this.onStatus('This browser cannot do video calls. Chat, whiteboard, notes and code still work.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.onStatus('Camera and microphone need a secure (HTTPS) page. Chat, whiteboard, notes and code still work.');
    } else {
      const attempts = [[{ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } }], [{ audio: true }], [{ video: true }]];
      let stream = null;
      for (const [c] of attempts.map((a) => a)) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch { /* try the next option */ }
      }
      if (this.destroyed) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
      if (stream) {
        this.mic = stream.getAudioTracks()[0] || null;
        this.cam = stream.getVideoTracks()[0] || null;
        this.hasMic = !!this.mic;
        this.hasCam = !!this.cam;
        if (this.cam) this.onRemote('local', new MediaStream([this.cam]));
        if (!this.mic && !this.cam) this.onStatus('No camera or microphone found.');
        else if (!this.cam) this.onStatus('Camera unavailable. Joined with audio only.');
        else if (!this.mic) this.onStatus('Microphone unavailable. Joined with video only.');
      } else {
        this.onStatus('Camera and microphone are blocked or missing. You can still chat and use the shared tools.');
      }
    }
    await this.hello();
  }

  hello(reply = true) { return this.send({ type: 'hello', reply }); }

  toggleMic() {
    if (!this.mic) return false;
    this.mic.enabled = !this.mic.enabled;
    this._announce();
    return this.mic.enabled;
  }

  toggleCam() {
    if (!this.cam) return false;
    this.cam.enabled = !this.cam.enabled;
    this._announce();
    return this.cam.enabled;
  }

  _announce() { this.send({ type: 'state', mic: !!(this.mic && this.mic.enabled), cam: !!(this.cam && this.cam.enabled) }); }

  async startScreen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Screen sharing is not supported in this browser.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    if (this.screen) this.screen.stop();
    this.screen = track;
    this.sharing = true;
    track.onended = () => { if (this.screen === track) { this.stopScreen(); this.onLocalScreenEnded(); } };
    if (this.tx) await this.tx[2].sender.replaceTrack(track);
    this.onRemote('localScreen', new MediaStream([track]));
    this.send({ type: 'screen', on: true });
  }

  async stopScreen() {
    if (this.screen) { this.screen.onended = null; this.screen.stop(); this.screen = null; }
    const was = this.sharing;
    this.sharing = false;
    if (this.tx) { try { await this.tx[2].sender.replaceTrack(null); } catch { /* connection closed */ } }
    this.onRemote('localScreen', null);
    if (was) this.send({ type: 'screen', on: false });
  }

  // ------------------------------------------------------------ connection
  _build() {
    this._close();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    this.tx = null;
    // The seeker (offerer) creates the three transceivers. The helper (answerer) adopts the ones from the offer,
    // see adoptTransceivers(), because browsers do not reliably pair locally created ones with a remote offer.
    if (!this.polite) {
      this.tx = SLOTS.map((s) => pc.addTransceiver(s === 'audio' ? 'audio' : 'video', { direction: 'sendrecv' }));
      this._attachLocal();
    }

    // The seeker always makes the offer and the helper only answers. That removes offer collisions in the
    // normal case; the "perfect negotiation" handling in handleSignal still covers the rare ones.
    pc.onnegotiationneeded = async () => {
      if (this.polite) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ type: 'description', description: pc.localDescription });
      } catch { /* a newer negotiation replaces this one */ } finally { this.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send({ type: 'candidate', candidate }); };
    pc.ontrack = (e) => {
      const i = pc.getTransceivers().indexOf(e.transceiver);
      const kind = SLOTS[i] || (e.track.kind === 'audio' ? 'audio' : 'cam');
      const stream = new MediaStream([e.track]);
      this.remoteStreams[kind] = stream;
      this.onRemote(kind, stream);
      e.track.onunmute = () => this.onRemote(kind, stream);
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'connected') this.onStatus('connected');
      else if (s === 'connecting') this.onStatus('connecting');
      else if (s === 'disconnected') this.onStatus('reconnecting');
      else if (s === 'failed') { this.onStatus('reconnecting'); try { if (!this.polite) pc.restartIce(); } catch { /* ignore */ } }
    };
    this._announce();
    if (this.sharing) this.send({ type: 'screen', on: true });
  }

  _attachLocal() {
    if (!this.tx) return;
    if (this.mic) this.tx[0].sender.replaceTrack(this.mic).catch(() => {});
    if (this.cam) this.tx[1].sender.replaceTrack(this.cam).catch(() => {});
    if (this.screen) this.tx[2].sender.replaceTrack(this.screen).catch(() => {});
  }

  adoptTransceivers() {
    if (this.tx || !this.pc) return;
    const list = this.pc.getTransceivers();
    if (list.length < 3) return;
    this.tx = list.slice(0, 3);
    this.tx.forEach((t) => { try { t.direction = 'sendrecv'; } catch { /* stopped */ } });
    this._attachLocal();
  }

  _close() {
    if (this.pc) { this.pc.onnegotiationneeded = this.pc.onicecandidate = this.pc.ontrack = this.pc.onconnectionstatechange = null; try { this.pc.close(); } catch { /* closed */ } }
    this.pc = null;
    this.tx = null;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingCandidates = [];
  }

  _resetRemote() {
    for (const k of ['audio', 'cam', 'screen']) { if (this.remoteStreams[k]) this.onRemote(k, null); }
    this.remoteStreams = {};
    this.peer = { mic: true, cam: true, screen: false };
    this.onPeerState({ ...this.peer, present: false });
  }

  async handleSignal(fromSid, data) {
    if (this.destroyed || !data) return;
    try {
      if (data.type === 'hello') {
        if (this.remoteSid !== fromSid || !this.pc) {
          if (this.remoteSid && this.remoteSid !== fromSid) this._resetRemote();
          this.remoteSid = fromSid;
          this._build();
          this.onPeerState({ ...this.peer, present: true });
        }
        if (data.reply !== false) this.hello(false);
        return;
      }
      if (fromSid !== this.remoteSid) return; // signals from a tab I have not said hello to
      if (data.type === 'bye') { this._close(); this.remoteSid = null; this._resetRemote(); return; }
      if (data.type === 'state') { this.peer.mic = !!data.mic; this.peer.cam = !!data.cam; this.onPeerState({ ...this.peer, present: true }); return; }
      if (data.type === 'screen') { this.peer.screen = !!data.on; this.onPeerState({ ...this.peer, present: true }); return; }
      const pc = this.pc;
      if (!pc) return;
      if (data.type === 'description') {
        const d = data.description;
        const collision = d.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') this.adoptTransceivers();
        for (const c of this.pendingCandidates.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* stale */ } }
        if (d.type === 'offer') {
          await pc.setLocalDescription();
          this.send({ type: 'description', description: pc.localDescription });
        }
      } else if (data.type === 'candidate') {
        if (!pc.remoteDescription) { this.pendingCandidates.push(data.candidate); return; }
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!this.ignoreOffer) throw e; }
      }
    } catch { /* one bad signal must not break the call; negotiation retries on the next change */ }
  }

  destroy() {
    if (this.destroyed) return;
    try { Promise.resolve(this.rawSend({ type: 'bye' })).catch(() => {}); } catch { /* leaving anyway */ }
    this.destroyed = true;
    [this.mic, this.cam, this.screen].forEach((t) => { if (t) { t.onended = null; t.stop(); } });
    this._close();
  }
}
