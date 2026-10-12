import { api } from '../api.js';
import { html, icon, avatar, chips, verifiedBadge, setHTML, onClick, academicLine, fmtDate, cap } from '../ui.js';
import { openRequestModal } from './shared.js';
import { openBookingModal } from './sessionBooking.js';

export default async function helperProfilePage({ root, param, user }) {
  const { helper: h, contributions } = await api.get(`/helpers/${param}`);
  const isSeeker = user.role === 'seeker';
  setHTML(root, html`
    <p style="margin-bottom:14px"><a href="${isSeeker ? '#/search' : '#/leaderboard'}" class="row" style="display:inline-flex;gap:6px;text-decoration:none;font-weight:600">${icon('back', 16)} ${isSeeker ? 'Back to search' : 'Back to leaderboard'}</a></p>
    <section class="profile-hero">
      ${avatar(h, 'xl')}
      <div>
        <h1>${h.name} ${h.verified ? verifiedBadge() : ''}</h1>
        <div class="muted">@${h.username}</div>
        <div style="margin-top:4px">${academicLine(h)}</div>
        <div class="profile-facts">
          <div><b>${h.studentsHelped}</b><span>students helped</span></div>
          <div><b>${h.points}</b><span>points earned</span></div>
          <div><b>${contributions.length}</b><span>recent contributions</span></div>
        </div>
      </div>
      ${isSeeker ? html`<div class="actions stack" style="align-items:stretch">
        ${h.relation === 'pending'
          ? html`<button class="btn btn-soft" disabled>Request pending</button>`
          : html`<button class="btn btn-primary" id="send">Send help request</button>`}
        <button class="btn btn-ghost" id="book">${icon('video', 16)} Book a Help Session</button>
        ${h.relation === 'connected'
          ? html`<a class="btn btn-soft" href="#/chat/${h._id}">${icon('chat', 16)} Start chat</a>`
          : html`<span class="muted small" style="max-width:200px">Chat opens after ${h.name.split(' ')[0]} accepts one of your requests.</span>`}
      </div>` : ''}
    </section>

    <div class="cols" style="margin-top:22px">
      <div class="stack">
        <section class="panel"><h2 style="margin-bottom:10px">About</h2><p>${h.bio || 'This Helper has not written a bio yet.'}</p></section>
        <section class="panel"><h2 style="margin-bottom:10px">Expertise</h2>${h.expertise ? html`<p style="margin-bottom:14px">${h.expertise}</p>` : ''}${chips(h.skills || [], { max: 20 })}</section>
        <section class="panel">
          <h2 style="margin-bottom:10px">Previous contributions</h2>
          ${contributions.length
            ? contributions.map((c) => html`<div class="contrib"><div><strong>${c.title}</strong><div class="muted small">${c.category}</div></div><div class="muted small" style="text-align:right">${fmtDate(c.completedAt)}<br>+${c.pointsValue} points</div></div>`)
            : html`<p class="muted">No completed help requests yet.</p>`}
        </section>
      </div>
      <aside class="panel">
        <h2 style="margin-bottom:12px">Details</h2>
        <dl class="detail-list">
          <dt>Department</dt><dd>${h.department || 'Not set'}</dd>
          <dt>Course</dt><dd>${h.course || 'Not set'}</dd>
          <dt>Year</dt><dd>${h.year ? `Year ${h.year}` : 'Not set'}</dd>
          <dt>Availability</dt><dd>${h.availability || 'Not set'}</dd>
          <dt>Verification</dt><dd>${h.verified ? 'Verified (demo badge)' : 'Not verified'}</dd>
        </dl>
        <p class="muted small" style="margin-top:14px">Verified badges are assigned manually in this prototype and do not confirm real academic credentials.</p>
      </aside>
    </div>`);

  root.querySelector('#book')?.addEventListener('click', () => openBookingModal({ helper: h, onDone: () => { location.hash = '#/sessions'; } }));
  root.querySelector('#send')?.addEventListener('click', () => openRequestModal(h, () => window.dispatchEvent(new HashChangeEvent('hashchange'))));
}
