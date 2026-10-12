import { api } from '../api.js';
import { html, icon, setHTML, onClick, openModal, confirmDialog, toast, fmtDateTime, statusBadge, cap, emptyState, raw } from '../ui.js';

export default async function benefitsPage({ root, user: initialUser, refreshUser }) {
  let user = await refreshUser();
  let benefits = [];
  let redemptions = [];
  let validatorMsg = null;

  async function load() {
    [{ benefits }, { redemptions }] = await Promise.all([api.get('/benefits'), api.get('/redemptions')]);
    paint();
  }

  function ticket(b) {
    const out = b.availability < 1;
    const short = b.pointsRequired - user.points;
    return html`
      <article class="ticket" aria-label="${b.name}">
        <div class="body">
          <span class="ico">${icon(b.icon, 22)}</span>
          <h3>${b.name}</h3>
          <p class="muted small">${b.description}</p>
          <span class="left">${out ? 'Out of stock' : `${b.availability} available`}</span>
          <button class="btn btn-primary btn-sm" data-redeem="${b._id}" ${out || short > 0 ? 'disabled' : ''}>Redeem</button>
          ${!out && short > 0 ? html`<span class="small muted">You need ${short} more points.</span>` : ''}
        </div>
        <div class="stub"><b>${b.pointsRequired}</b><span>points</span></div>
      </article>`;
  }

  function paint() {
    setHTML(root, html`
      <header class="page-head"><div><h1>Campus benefits</h1><p class="muted">Spend your points on demo campus perks. Each redemption gets a unique code and QR image.</p></div></header>
      <section class="balance" aria-label="Your points"><div><span>Your balance</span><br><b>${user.points}</b> <span>points</span></div><p style="max-width:44ch;color:var(--accent-soft)">${user.role === 'helper' ? 'Earn more points by completing help requests.' : 'Seekers earn a small bonus each time one of their requests is completed.'}</p></section>

      <div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${benefits.map(ticket)}</div>
      <p class="muted small" style="margin-top:12px">These are demo benefits. QR codes carry a unique redemption ID and are not valid coupons anywhere.</p>

      <div class="cols" style="margin-top:32px">
        <section aria-labelledby="hist-h">
          <h2 id="hist-h" style="margin-bottom:14px">Redemption history</h2>
          ${redemptions.length ? html`
          <div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Benefit</th><th>Points</th><th>Date</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${redemptions.map((r) => html`<tr><td class="code">${r.redemptionId}</td><td>${r.benefitName}</td><td>${r.pointsUsed}</td><td>${fmtDateTime(r.createdAt)}</td><td>${statusBadge(r.status)}</td><td><button class="btn btn-ghost btn-sm" data-qr="${r.redemptionId}">View QR</button></td></tr>`)}
          </tbody></table></div>` : emptyState('No redemptions yet', 'Redeem a benefit above and it will show up here with its QR code.')}
        </section>
        <section class="panel" aria-labelledby="val-h">
          <h2 id="val-h" style="margin-bottom:6px">Demo code checker</h2>
          <p class="muted small" style="margin-bottom:14px">Simulates a campus counter. Check whether a code exists and has been used, or mark it as used. A code works only once.</p>
          <form id="validator" class="stack" novalidate>
            <div class="field"><label for="code">Redemption code</label><input class="input code" id="code" placeholder="CAMP-XXXXXX" maxlength="30" autocomplete="off"></div>
            <div class="row wrap"><button class="btn btn-soft btn-sm" type="submit">Check code</button><button class="btn btn-ghost btn-sm" type="button" id="use-code">Mark as used</button></div>
            ${validatorMsg ? html`<div class="${validatorMsg.ok ? 'notice' : 'form-error'}" role="status">${validatorMsg.text}</div>` : ''}
          </form>
        </section>
      </div>`);
  }

  function showQr({ redemption, qrImage, title, extra }) {
    openModal({
      title,
      body: html`
        <div class="qr-box">
          <img src="${qrImage}" alt="QR code containing redemption ID ${redemption.redemptionId}">
          <span class="code">${redemption.redemptionId}</span>
        </div>
        <dl class="receipt">
          <dt>Benefit</dt><dd>${redemption.benefitName}</dd>
          <dt>Points used</dt><dd>${redemption.pointsUsed}</dd>
          <dt>Redemption ID</dt><dd class="code">${redemption.redemptionId}</dd>
          <dt>Status</dt><dd>${cap(redemption.status)}</dd>
          <dt>Created</dt><dd>${fmtDateTime(redemption.createdAt)}</dd>
        </dl>
        ${extra || ''}
        <p class="notice" style="margin-top:14px">Demo redemption only. This is not a real coupon or voucher.</p>`,
      footer: html`<button class="btn btn-primary" data-close>Done</button>`,
    });
  }

  async function redeem(id) {
    const b = benefits.find((x) => x._id === id);
    const ok = await confirmDialog({
      title: `Redeem ${b.name}?`,
      message: html`<p>This costs <strong>${b.pointsRequired} points</strong>.</p><p class="muted" style="margin-top:6px">Your balance: ${user.points} points. After redeeming: ${user.points - b.pointsRequired} points.</p><p class="muted small" style="margin-top:10px">Points are only deducted after you confirm.</p>`,
      confirmText: `Confirm and spend ${b.pointsRequired} points`,
    });
    if (!ok) return;
    try {
      const res = await api.post(`/benefits/${id}/redeem`, { confirm: true });
      user = await refreshUser();
      await load();
      showQr({ redemption: res.redemption, qrImage: res.qrImage, title: 'Redemption successful!', extra: html`<p class="small muted" style="margin-top:10px">Remaining balance: ${res.remainingPoints} points.</p>` });
    } catch (err) {
      toast(err.message, { type: 'error' });
      await load();
    }
  }

  onClick(root, '[data-redeem]', (el) => redeem(el.dataset.redeem));
  onClick(root, '[data-qr]', async (el) => {
    try {
      const res = await api.get(`/redemptions/${el.dataset.qr}`);
      showQr({ redemption: res.redemption, qrImage: res.qrImage, title: 'Your QR code' });
    } catch (err) { toast(err.message, { type: 'error' }); }
  });

  async function checkCode(markUsed) {
    const code = root.querySelector('#code').value;
    try {
      if (markUsed) {
        const res = await api.post('/redemptions/use', { code });
        validatorMsg = { ok: true, text: res.message };
      } else {
        const res = await api.post('/redemptions/validate', { code });
        validatorMsg = { ok: res.valid, text: res.benefitName ? `${res.benefitName}: ${res.message}` : res.message };
      }
    } catch (err) {
      validatorMsg = { ok: false, text: err.message };
    }
    const keep = root.querySelector('#code')?.value;
    if (markUsed) await load(); else paint();
    root.querySelector('#code').value = keep || code;
  }
  root.addEventListener('submit', (e) => { if (e.target.id === 'validator') { e.preventDefault(); checkCode(false); } });
  onClick(root, '#use-code', () => checkCode(true));

  await load();
}
