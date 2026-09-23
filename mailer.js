/* =============================================================
   Venza Care UK — outbound email
   -------------------------------------------------------------
   Sends a short alert to the enquiry inbox whenever someone uses
   a form on the site, so nobody has to remember to check the
   backoffice.

   Configured with three environment variables:
     RESEND_API_KEY  — from resend.com
     MAIL_FROM       — e.g. "Venza Care website <site@venzacare.co.uk>"
                       The domain must be verified in Resend, or
                       the message will be rejected or junked.
     MAIL_TO         — optional; defaults to the site's own
                       enquiries address.

   With no API key it quietly does nothing and says so in the log.
   Email must never be the reason a form submission fails, so every
   send is best-effort: the caller is told it didn't work, and
   carries on regardless.
   ============================================================= */

const API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || '';
const MAIL_TO = process.env.MAIL_TO || '';

const enabled = !!(API_KEY && MAIL_FROM);

const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Build both a plain-text and an HTML body from the same rows, so the
   message reads properly whatever the recipient's mail client prefers. */
function render(heading, rows, body, link) {
  const text = [heading, '']
    .concat(rows.filter((r) => r[1]).map((r) => r[0] + ': ' + r[1]))
    .concat(body ? ['', body] : [])
    .concat(link ? ['', link.label + ': ' + link.url] : [])
    .join('\n');

  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#20312c;line-height:1.6;">' +
    '<h2 style="font-size:17px;color:#0d4f5c;margin:0 0 14px;">' + escapeHtml(heading) + '</h2>' +
    '<table style="border-collapse:collapse;">' +
    rows
      .filter((r) => r[1])
      .map(
        (r) =>
          '<tr><td style="padding:3px 14px 3px 0;color:#5c6b66;vertical-align:top;">' +
          escapeHtml(r[0]) +
          '</td><td style="padding:3px 0;font-weight:600;">' +
          escapeHtml(r[1]) +
          '</td></tr>'
      )
      .join('') +
    '</table>' +
    (body
      ? '<p style="margin:16px 0 0;padding:12px 14px;background:#f3f8f7;border-radius:8px;white-space:pre-wrap;">' +
        escapeHtml(body) +
        '</p>'
      : '') +
    (link
      ? '<p style="margin:18px 0 0;"><a href="' +
        escapeHtml(link.url) +
        '" style="background:#16808f;color:#fff;text-decoration:none;padding:9px 16px;border-radius:999px;display:inline-block;font-weight:600;">' +
        escapeHtml(link.label) +
        '</a></p>'
      : '') +
    '</div>';

  return { text, html };
}

async function send({ to, subject, heading, rows, body, link, replyTo }) {
  if (!enabled) {
    console.log('[mail] not configured — would have sent:', subject);
    return false;
  }

  const { text, html } = render(heading || subject, rows || [], body, link);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [MAIL_TO || to].filter(Boolean),
        subject,
        text,
        html,
        // So hitting Reply in the inbox writes back to the person, not to us.
        reply_to: replyTo || undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[mail] send failed:', res.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return false;
  }
}

/* Never let a failed alert break the form the visitor just submitted. */
function sendQuietly(opts) {
  return send(opts).catch((err) => {
    console.error('[mail] unexpected send error:', err.message);
    return false;
  });
}

module.exports = { send, sendQuietly, enabled };
