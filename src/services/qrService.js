const crypto = require('crypto');
const QRCode = require('qrcode');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters

function generateRedemptionId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) id += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `CAMP-${id}`;
}

// The QR payload is a plain demo string. It is not a real voucher or payment code.
function buildQrPayload(redemptionId) {
  return `CAMPORA-DEMO:${redemptionId}`;
}

function toDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: { dark: '#2F4858', light: '#FFFFFF' },
  });
}

// Accepts "CAMP-ABC123", "camp-abc123" or the full "CAMPORA-DEMO:CAMP-ABC123" payload.
function normalizeCode(input) {
  const s = String(input || '').trim().toUpperCase().replace(/^CAMPORA-DEMO:/, '');
  return /^CAMP-[A-Z0-9]{6}$/.test(s) ? s : null;
}

module.exports = { generateRedemptionId, buildQrPayload, toDataUrl, normalizeCode };
