/* =============================================================
   Venza Care UK — outgoing email (optional)
   -------------------------------------------------------------
   Sends through Resend (resend.com) when RESEND_API_KEY and
   EMAIL_FROM are set. Without them every send is a no-op that
   returns false, and the staff hub shows invite / reset links on
   screen for a manager to pass on instead.
   ============================================================= */

const API_KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM = (process.env.EMAIL_FROM || '').trim();

function configured() {
  return !!(API_KEY && FROM);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A plain, readable layout: a heading, paragraphs, and an optional button.
function render({ heading, lines = [], button }) {
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f302c;line-height:1.5">' +
    '<h2 style="color:#0d4f5c;font-size:20px">' + escapeHtml(heading) + '</h2>' +
    lines.map((l) => '<p>' + escapeHtml(l) + '</p>').join('') +
    (button ? '<p><a href="' + escapeHtml(button.url) + '" style="display:inline-block;background:#16808f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">' + escapeHtml(button.label) + '</a></p><p style="font-size:13px;color:#5a6b66">Or copy this link: ' + escapeHtml(button.url) + '</p>' : '') +
    '<p style="font-size:13px;color:#5a6b66">Venza Care UK</p></div>';
  const text = [heading, ...lines, button ? button.label + ': ' + button.url : ''].filter(Boolean).join('\n\n');
  return { html, text };
}

/* Send one email. Returns true if it was accepted for delivery. */
async function send({ to, subject, heading, lines, button }) {
  if (!configured() || !to) return false;
  const body = render({ heading: heading || subject, lines, button });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: body.html, text: body.text }),
    });
    if (!r.ok) console.error('[mail] send failed', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return false;
  }
}

/* Send the same message to many people, one email each (so addresses are
   never shared), in batches of 100. Returns how many were accepted. */
async function sendMany(recipients, message) {
  if (!configured() || !recipients.length) return 0;
  const body = render(message);
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100).map((to) => ({
      from: FROM, to: [to], subject: message.subject, html: body.html, text: body.text,
    }));
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (r.ok) sent += batch.length;
      else console.error('[mail] batch failed', r.status, await r.text().catch(() => ''));
    } catch (err) {
      console.error('[mail] batch failed:', err.message);
    }
  }
  return sent;
}

module.exports = { configured, send, sendMany };
