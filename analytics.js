/* =============================================================
   Venza Care UK — visitor stats (no cookies)
   -------------------------------------------------------------
   Counts public page views into one record per day: views, unique
   visitors, pages, where visitors came from, devices, homes viewed and
   Find a home searches. A visitor is recognised for one day only, by a
   scrambled fingerprint of their IP address and browser mixed with a
   secret and the date; the IP address itself is never stored. Bots
   and staff hub pages aren't counted. Figures are approximate.
   ============================================================= */

const crypto = require('crypto');
const db = require('./db');

const COLLECTION = 'site_stats';
const SECRET = process.env.SESSION_SECRET || process.env.ADMIN_PASS || 'venza-stats';
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch/i;
const SKIP = /^\/(admin|api|images|css|js|guides|team-photo|manager-photo|favicon|robots\.txt|sitemap\.xml)/;

const today = () => new Date().toISOString().slice(0, 10);
const bump = (obj, key, n = 1) => { if (key) obj[key] = (obj[key] || 0) + n; };

function device(ua) {
  if (/ipad|tablet|kindle|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'Tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

// Where a visit started: a search engine, a site that linked here, or Direct.
function source(req) {
  const utm = String(req.query.utm_source || '').toLowerCase();
  if (utm) return /google/.test(utm) ? 'Google' : /facebook|fb|instagram/.test(utm) ? 'Facebook' : utm.slice(0, 40);
  const ref = req.get('referer');
  if (!ref) return 'Direct';
  let host = '', refPath = '';
  try { const u = new URL(ref); host = u.hostname.replace(/^www\./, ''); refPath = u.pathname; } catch (e) { return 'Other'; }
  if (host === String(req.hostname || '').replace(/^www\./, '')) return null; // moving between our own pages
  if (/(^|\.)google\./.test(host)) return /^\/maps/.test(refPath) ? 'Google Maps' : 'Google';
  if (/(^|\.)bing\.com$|duckduckgo|yahoo\.|ecosia/.test(host)) return 'Other search engines';
  if (/carehome\.co\.uk$/.test(host)) return 'carehome.co.uk';
  if (/facebook\.com$|fb\.com$|instagram\.com$|messenger/.test(host)) return 'Facebook';
  if (/cqc\.org\.uk$/.test(host)) return 'CQC website';
  return host.slice(0, 60);
}

// Pages people view, grouped so each home is one line.
function pageKey(path) {
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

// One read-change-write at a time per server, so counts aren't lost.
let queue = Promise.resolve();
function update(fn) {
  const run = queue.then(async () => {
    const id = 'day-' + today();
    const rec = (await db.records.get(COLLECTION, id)) || { date: today(), views: 0, visitors: [], pages: {}, sources: {}, devices: {}, homes: {}, searches: {} };
    fn(rec);
    await db.records.put(COLLECTION, id, rec);
  });
  queue = run.catch(() => {});
  return run;
}

// Express middleware: count GET requests for public pages.
function track() {
  return async (req, res, next) => {
    try {
      const ua = req.get('user-agent') || '';
      if (req.method !== 'GET' || SKIP.test(req.path) || /\.[a-z0-9]{2,5}$/i.test(req.path) || BOT.test(ua) || req.get('purpose') === 'prefetch') return next();
      const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
      const visitor = crypto.createHash('sha256').update(SECRET + today() + ip + ua).digest('hex').slice(0, 12);
      const from = source(req);
      const path = pageKey(req.path);
      const homeMatch = path.match(/^\/care-homes\/([a-z0-9-]+)$/);
      await Promise.race([
        update((rec) => {
          rec.views++;
          bump(rec.pages, path);
          if (homeMatch) bump(rec.homes, homeMatch[1]);
          if (!rec.visitors.includes(visitor)) { rec.visitors.push(visitor); bump(rec.devices, device(ua)); }
          if (from) bump(rec.sources, from);
        }),
        new Promise((r) => setTimeout(r, 800)),
      ]);
    } catch (err) {
      console.error('[stats]', err.message);
    }
    next();
  };
}

// A Find a home search (sent from the page, since searching doesn't reload it).
async function search(term) {
  const q = String(term || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  if (q.length < 2) return;
  await update((rec) => bump(rec.searches, q));
}

// Totals for the last `days` days (and the same span before, for comparison).
async function summary(days) {
  const all = await db.records.list(COLLECTION);
  const dayStr = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const start = dayStr(days - 1), prevStart = dayStr(days * 2 - 1);
  const inRange = all.filter((r) => r.date >= start);
  const prev = all.filter((r) => r.date >= prevStart && r.date < start);
  const add = (list, field) => list.reduce((acc, r) => { for (const [k, v] of Object.entries(r[field] || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
  const daily = [];
  for (let n = days - 1; n >= 0; n--) {
    const d = dayStr(n), r = all.find((x) => x.date === d);
    daily.push({ date: d, visitors: r ? r.visitors.length : 0, views: r ? r.views : 0 });
  }
  return {
    days, start, daily,
    visitors: inRange.reduce((n, r) => n + r.visitors.length, 0),
    prevVisitors: prev.reduce((n, r) => n + r.visitors.length, 0),
    views: inRange.reduce((n, r) => n + r.views, 0),
    pages: add(inRange, 'pages'), sources: add(inRange, 'sources'), devices: add(inRange, 'devices'),
    homes: add(inRange, 'homes'), searches: add(inRange, 'searches'),
  };
}

// Old daily records are removed after 25 months.
async function tidy() {
  const cutoff = new Date(Date.now() - 760 * 864e5).toISOString().slice(0, 10);
  for (const r of await db.records.list(COLLECTION)) if (r.date < cutoff) await db.records.remove(COLLECTION, r.id);
}

module.exports = { track, search, summary, tidy };
