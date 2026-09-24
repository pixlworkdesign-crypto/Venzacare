/* =============================================================
   Venza Care UK — Express server (public site + admin backoffice)
   ============================================================= */

require('./env'); // local .env (development); real environment variables win
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('./db');
const content = require('./content');
const { FEE_FAQS, GENERAL_FAQS, faqJsonLd, homeJsonLd } = content;
const storage = require('./storage');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');

/* The admin credentials and session secret MUST come from the environment in
   production. This repository is public, so a hardcoded fallback would be a
   published password — refuse to start rather than run with a known one. */
// Values pasted into a hosting dashboard often pick up a stray space or line
// break, which silently makes the password "wrong" — so trim them.
const env = (k) => (process.env[k] || '').trim();
const ADMIN_USER = env('ADMIN_USER') || 'admin';
const ADMIN_PASS = env('ADMIN_PASS') || (IS_PROD ? '' : 'venza2026');
const SESSION_SECRET = env('SESSION_SECRET') || (IS_PROD ? '' : 'venza-dev-secret-change-me');

/* If they're missing in production the public site stays up — it's the shop
   window and shouldn't go dark over an admin setting — but the backoffice is
   sealed shut rather than left on a password anyone can read in the repo. */
const ADMIN_DISABLED = IS_PROD && (!ADMIN_PASS || !SESSION_SECRET);
if (ADMIN_DISABLED) {
  console.error(
    '\n  ADMIN DISABLED: ADMIN_PASS and/or SESSION_SECRET are not set.\n' +
    '  The public site is running, but nobody can sign in to /admin.\n' +
    '  Set them in Vercel → Settings → Environment Variables, then redeploy.\n'
  );
}

/* Wrap an async route so a rejected promise becomes a normal Express error
   instead of an unhandled rejection that hangs the request. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* How long applications are kept before being deleted automatically. Applicant
   data is personal data, and keeping it indefinitely is not defensible. Set
   RETENTION_DAYS=0 to switch the sweep off. */
const RETENTION_DAYS = process.env.RETENTION_DAYS === undefined ? 365 : parseInt(process.env.RETENTION_DAYS, 10);

/* There is no cron on a serverless host, so the sweep runs opportunistically
   when an admin page is loaded — at most once a day per running instance. */
let lastSweep = 0;
async function runRetentionSweep(actor) {
  if (!RETENTION_DAYS || RETENTION_DAYS < 1) return;
  if (Date.now() - lastSweep < 24 * 60 * 60 * 1000) return;
  lastSweep = Date.now();
  try {
    const removed = await db.expireApplications(RETENTION_DAYS);
    if (removed.count) {
      for (const key of removed.cvPaths) await storage.deleteCv(key);
      await db.audit(actor || 'system', 'retention sweep', removed.count + ' application(s) past ' + RETENTION_DAYS + ' days');
      console.log('[retention] removed', removed.count, 'application(s) older than', RETENTION_DAYS, 'days');
    }
  } catch (err) {
    console.error('[retention] sweep failed:', err.message);
  }
}

/* Links in alert emails need the full address, not a site-relative path. */
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const absolute = (req, pathname) =>
  (SITE_URL || req.protocol + '://' + req.get('host')) + pathname;

/* ---------- View engine ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Helpers every template can use (CQC labels, fee formatting, FAQ copy…)
Object.assign(app.locals, content);

/* ---------- Middleware ---------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Stateless admin auth (signed cookie — works on serverless hosts) ---------- */
function signAdminToken(who) {
  const payload = (who || 'admin') + '.' + (Date.now() + 1000 * 60 * 60 * 8); // 8-hour expiry
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

/* Returns who the cookie says is signed in, or null. The signature is checked
   before anything in the token is believed. */
function readAdminToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [who, exp, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(who + '.' + exp).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!(parseInt(exp, 10) > Date.now())) return null;
  return who;
}
function verifyAdminToken(token) { return readAdminToken(token) !== null; }
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
// Constant-time string comparison, so response timing leaks nothing.
function sameText(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function isAdmin(req) { return verifyAdminToken(readCookie(req, 'vc_admin')); }
function adminIdentity(req) { return readAdminToken(readCookie(req, 'vc_admin')); }

/* The account behind the session, when signing in used one. The environment
   login (used to bootstrap the first account) has no database record. */
async function currentUser(req) {
  const who = adminIdentity(req);
  if (!who || who === 'admin') return null;
  return db.userById(who);
}

/* The public address of the site, for canonical links, the sitemap and
   social cards. Set SITE_URL in production; otherwise use the request host. */
function siteUrl(req) {
  const fixed = env('SITE_URL').replace(/\/$/, '');
  if (fixed) return fixed;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return proto + '://' + req.get('host');
}

const CARE_TYPES = ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'];
const lower = (s) => (s || '').toLowerCase();

// Shared locals available to every view
app.use(wrap(async (req, res, next) => {
  res.locals.SITE = await db.settings();
  res.locals.year = new Date().getFullYear();
  /* Home photos are either bundled with the site ("albany/exterior.webp") or
     uploaded through the admin (a full URL, or /images/uploads/...). */
  res.locals.photoUrl = function (p) {
    if (!p) return '';
    return /^(https?:)?\/\//.test(p) || p.charAt(0) === '/' ? p : '/images/' + p;
  };
  res.locals.currentPath = req.path;
  res.locals.title = '';
  res.locals.description = '';
  res.locals.baseUrl = siteUrl(req);
  res.locals.canonical = res.locals.baseUrl + (req.path === '/' ? '/' : req.path.replace(/\/$/, ''));
  res.locals.jsonLd = null;
  next();
}));

/* ---------- CV uploads ---------- */
// Files are held in memory just long enough to hand them to storage.js, which
// puts them in a private bucket. They are deliberately NOT served statically:
// CVs are personal data and are only reachable via /admin/applications/:id/cv.
const ALLOWED = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.odt'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED.includes(ext));
  },
});

/* ---------- Home photo uploads (admin) ---------- */
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 13 }, // one exterior + up to 12 gallery
  fileFilter: (req, file, cb) => {
    cb(null, IMAGE_EXT.includes(path.extname(file.originalname).toLowerCase()));
  },
});

/* =============================================================
   PUBLIC SITE
   ============================================================= */

// Homepage
app.get('/', wrap(async (req, res) => {
  const openJobs = await db.openJobs();
  res.render('index', {
    jsonLd: content.orgJsonLd(res.locals.SITE, res.locals.baseUrl),
    description: 'Venza Care UK runs care homes in Croydon, Mitcham, Sevenoaks and Newmarket — residential, nursing, dementia, respite and end-of-life care. See fees and CQC ratings, and book a visit.',
    homes: await db.homes(),
    jobs: openJobs.filter((j) => j.featured).slice(0, 3),
    openCount: openJobs.length,
    stats: await db.siteStats(),
  });
}));

// Our care
app.get('/our-care', wrap(async (req, res) => {
  res.render('our-care', {
    title: 'Our care',
    description: 'Residential, nursing, dementia, respite and end-of-life care at Venza Care UK homes in London, Kent and Cambridgeshire — what each type of care means and where it is offered.',
    homes: await db.homes(),
  });
}));

// Fees & funding (CMA: indicative prices, what's included, extras, deposits)
app.get('/fees-and-funding', wrap(async (req, res) => {
  const faqs = FEE_FAQS;
  res.render('fees', {
    title: 'Fees & funding',
    description: 'Weekly care-home fees at every Venza Care UK home, what is included, optional extras, deposits, fee reviews and the funding help available — in plain English.',
    homes: await db.homes(),
    faqs,
    jsonLd: faqJsonLd(faqs),
  });
}));

// CQC ratings (Regulation 20A: every location's rating, one click from the menu)
app.get('/cqc-ratings', wrap(async (req, res) => {
  res.render('cqc-ratings', {
    title: 'CQC ratings',
    description: 'The latest Care Quality Commission rating for every Venza Care UK home, with links to the full inspection reports.',
    homes: await db.homes(),
  });
}));

// FAQs + moving-in checklist
app.get('/faqs', (req, res) => {
  res.render('faqs', {
    title: 'Questions families ask',
    description: 'Answers to the questions families ask most about Venza Care UK homes — visiting, fees, moving in, what to bring, dementia care and more.',
    faqs: GENERAL_FAQS,
    jsonLd: faqJsonLd(GENERAL_FAQS),
  });
});

// Find a home (directory + filters)
app.get('/care-homes', wrap(async (req, res) => {
  const q = (req.query.q || '').toString();
  const region = (req.query.region || '').toString();
  const careType = (req.query.careType || '').toString();
  res.render('care-homes', {
    title: 'Find a care home',
    description: 'Find a Venza Care UK care home near you. Search by town or postcode, filter by type of care, and compare homes on a map.',
    // Every home is rendered and the non-matches hidden, so "Clear" in the
    // browser can bring them back without a reload.
    homes: await db.homes(),
    shownIds: (await db.filterHomes({ q, region, careType })).map((h) => h.id),
    q,
    region,
    careType,
  });
}));

// Individual home
app.get('/care-homes/:id', wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return notFound(res);
  res.render('home', await homeLocals(req, res, home));
}));

async function homeLocals(req, res, home, extra) {
  const SITE = res.locals.SITE;
  return Object.assign({
    title: home.name + ' care home, ' + home.town,
    description: `${home.name} is a ${home.beds}-bed care home in ${home.town} (${home.postcode}) offering ${home.careTypes.map(lower).join(', ')}. See fees, photos and the CQC rating, and book a visit.`,
    home,
    jobs: await db.jobsForHome(home.id),
    jsonLd: homeJsonLd(home, SITE, res.locals.baseUrl),
    visitSent: false,
    visitForm: {},
    visitError: null,
  }, extra || {});
}

// Book a visit to a specific home
app.post('/care-homes/:id/visit', wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return notFound(res);
  const f = req.body || {};
  const name = (f.name || '').trim();
  const phone = (f.phone || '').trim();
  const email = (f.email || '').trim();
  if (f.website) return res.redirect('/care-homes/' + home.id); // honeypot: bots fill every field
  if (!name || (!phone && !email)) {
    return res.render('home', await homeLocals(req, res, home, {
      visitForm: f,
      visitError: 'Please give us your name and a phone number or email so we can confirm your visit.',
    }));
  }
  const when = [f.date, f.time].filter(Boolean).join(', ') || 'Any time';
  await db.addMessage({
    kind: 'visit',
    name,
    email,
    phone,
    subject: 'Visit request — ' + home.name,
    bestTime: when,
    home: home.name,
    message:
      `Would like to visit ${home.name}. Preferred: ${when}.` +
      (f.careType ? ` Care needed: ${f.careType}.` : '') +
      (f.notes ? ` Notes: ${String(f.notes).slice(0, 2000)}` : ''),
  });
  res.render('home', await homeLocals(req, res, home, { visitSent: true }));
}));

// Careers (filterable jobs board)
app.get('/careers', wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const service = (req.query.service || '').toString();
  const location = (req.query.location || '').toString();

  const allOpen = await db.openJobs();
  let jobs = allOpen;
  if (q) {
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.summary.toLowerCase().includes(q) ||
        (j.service || '').toLowerCase().includes(q)
    );
  }
  if (service) jobs = jobs.filter((j) => j.service === service);
  if (location) jobs = jobs.filter((j) => j.location === location);

  const services = [...new Set(allOpen.map((j) => j.service).filter(Boolean))].sort();

  res.render('careers', {
    title: 'Careers',
    description: 'Care jobs at Venza Care UK homes in Croydon, Mitcham, Sevenoaks and Newmarket — carers, nurses, chefs and managers. Funded qualifications and real progression.',
    jobs,
    services,
    locations: await db.jobLocations(),
    q: req.query.q || '',
    service,
    location,
  });
}));

// Careers contact — questions for the recruitment team, and "register your interest"
app.get('/careers/contact', wrap(async (req, res) => {
  res.render('careers-contact', {
    title: 'Contact our recruitment team',
    description: 'Questions about working at Venza Care UK, or no suitable vacancy right now? Contact our recruitment team or register your interest.',
    homes: await db.homes(),
    form: { topic: req.query.topic === 'interest' ? 'Register my interest' : '' },
    sent: false, error: null,
  });
}));

app.post('/careers/contact', wrap(async (req, res) => {
  const f = req.body || {};
  const homes = await db.homes();
  if (f.website) return res.redirect('/careers/contact'); // honeypot
  const name = (f.name || '').trim();
  const email = (f.email || '').trim();
  const message = (f.message || '').trim();
  if (!name || !email || !message) {
    return res.render('careers-contact', {
      title: 'Contact our recruitment team', homes, form: f, sent: false,
      error: 'Please fill in your name, email and a short message.',
    });
  }
  await db.addMessage({
    kind: 'enquiry',
    name,
    email,
    phone: (f.phone || '').trim(),
    subject: 'Careers: ' + (f.topic || 'General question'),
    home: f.home || '',
    message: (f.role ? `Role of interest: ${String(f.role).slice(0, 120)}. ` : '') + message.slice(0, 4000),
  });
  res.render('careers-contact', { title: 'Contact our recruitment team', homes, form: {}, sent: true, error: null });
}));

// Single job + application form
app.get('/careers/:id', wrap(async (req, res) => {
  const job = await db.job(req.params.id);
  if (!job || job.status !== 'open') return notFound(res);
  res.render('job', {
    title: job.title,
    description: `${job.title} — ${job.location}, ${job.employmentType}${job.salary ? ', ' + job.salary : ''}. ${job.summary}`,
    jsonLd: jobJsonLd(job, res.locals.SITE, await db.home(job.homeId)),
    job, form: {}, error: null,
  });
}));

// Submit application
app.post('/careers/:id/apply', upload.single('cv'), wrap(async (req, res) => {
  const job = await db.job(req.params.id);
  if (!job || job.status !== 'open') return notFound(res);

  const { name, email, phone, rightToWork, message } = req.body;
  if (!name || !email) {
    return res.render('job', {
      title: job.title,
      job,
      form: req.body,
      error: 'Please give us your name and email so we can get back to you.',
    });
  }

  const cv = await storage.saveCv(req.file);

  const application = await db.addApplication({
    jobId: job.id,
    jobTitle: job.title,
    name,
    email,
    phone,
    rightToWork,
    message,
    cvFilename: cv.filename,
    cvPath: cv.key,
  });

  // The CV link needs an admin sign-in, so the file itself never travels by email.
  mailer.sendQuietly({
    subject: 'New application: ' + job.title + ' — ' + name,
    heading: 'New job application',
    replyTo: email,
    rows: [
      ['Role', job.title],
      ['Applicant', name],
      ['Email', email],
      ['Phone', phone],
      ['Right to work', rightToWork],
      ['CV', cv.filename ? 'Attached — open in the backoffice' : 'None supplied'],
    ],
    body: message,
    link: { label: 'Open in the backoffice', url: absolute(req, '/admin/applications#' + application.id) },
  });

  res.render('apply-success', { title: 'Application received', job });
}));

// Contact
async function contactLocals(extra) {
  return Object.assign(
    { title: 'Contact us', sent: false, form: {}, callbackSent: false, cbForm: {}, homes: await db.homes() },
    extra
  );
}

app.get('/contact', wrap(async (req, res) => {
  res.render('contact', await contactLocals());
}));

app.post('/contact', wrap(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (name && email && message) {
    await db.addMessage({ name, email, phone, subject, message });
    mailer.sendQuietly({
      subject: 'New enquiry: ' + (subject || 'General enquiry') + ' — ' + name,
      heading: 'New website enquiry',
      replyTo: email,
      rows: [['Name', name], ['Email', email], ['Phone', phone], ['Subject', subject]],
      body: message,
      link: { label: 'Open in the backoffice', url: absolute(req, '/admin/messages') },
    });
    return res.render('contact', await contactLocals({ sent: true }));
  }
  res.render('contact', await contactLocals({ form: req.body }));
}));

// Request a callback
app.post('/callback', wrap(async (req, res) => {
  const { name, phone, time, home } = req.body;
  if (name && phone) {
    await db.addMessage({
      kind: 'callback',
      name,
      phone,
      subject: 'Callback request',
      bestTime: time || 'Anytime',
      home: home || '',
      message: `Please call me back. Best time: ${time || 'Anytime'}.` + (home ? ` Home of interest: ${home}.` : ''),
    });
    mailer.sendQuietly({
      subject: 'Callback request — ' + name,
      heading: 'Someone would like a call back',
      rows: [
        ['Name', name],
        ['Phone', phone],
        ['Best time to call', time || 'Anytime'],
        ['Home of interest', home],
      ],
      link: { label: 'Open in the backoffice', url: absolute(req, '/admin/messages') },
    });
    return res.render('contact', await contactLocals({ callbackSent: true }));
  }
  res.render('contact', await contactLocals({ cbForm: req.body }));
}));

/* Google for Jobs listing for a vacancy. Salary is only included when it can
   be read as numbers, so nothing misleading is published. */
function jobJsonLd(job, SITE, home) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: [job.description, ...(job.responsibilities || []), ...(job.requirements || [])].join('\n'),
    datePosted: new Date(job.postedAt || Date.now()).toISOString().slice(0, 10),
    employmentType: /part/i.test(job.employmentType) ? 'PART_TIME' : /full/i.test(job.employmentType) ? 'FULL_TIME' : 'OTHER',
    hiringOrganization: { '@type': 'Organization', name: SITE.name },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: home ? home.town : job.location,
        postalCode: home ? home.postcode : undefined,
        addressCountry: 'GB',
      },
    },
  };
  const nums = (job.salary || '').replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (nums) {
    data.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'GBP',
      value: {
        '@type': 'QuantitativeValue',
        minValue: parseFloat(nums[0]),
        maxValue: parseFloat(nums[nums.length - 1]),
        unitText: /hour/i.test(job.salary) ? 'HOUR' : 'YEAR',
      },
    };
  }
  return data;
}

/* ---------- SEO plumbing ---------- */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ' + siteUrl(req) + '/sitemap.xml\n'
  );
});

app.get('/sitemap.xml', wrap(async (req, res) => {
  const base = siteUrl(req);
  const paths = ['/', '/our-care', '/care-homes', '/fees-and-funding', '/cqc-ratings', '/faqs', '/careers', '/contact',
    '/privacy', '/cookies', '/accessibility'];
  (await db.homes()).forEach((h) => paths.push('/care-homes/' + h.id));
  (await db.openJobs()).forEach((j) => paths.push('/careers/' + j.id));
  const esc = (u) => u.replace(/&/g, '&amp;');
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      paths.map((p) => '  <url><loc>' + esc(base + p) + '</loc></url>').join('\n') +
      '\n</urlset>\n'
  );
}));

// Is the database connected? Plain-English answers, no secrets.
app.get('/api/health', wrap(async (req, res) => {
  const h = await db.health();
  res.status(h.ok ? 200 : 503).json({
    ok: h.ok,
    database: h.backend === 'postgres' ? 'Supabase / Postgres' : 'local file (not persistent)',
    adminSignIn: ADMIN_DISABLED ? 'disabled — ADMIN_PASS and/or SESSION_SECRET not set' : 'enabled',
    problems: h.problems,
  });
}));

// Legal / policy pages
app.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy policy' });
});
app.get('/cookies', (req, res) => {
  res.render('cookies', { title: 'Cookie policy' });
});
app.get('/accessibility', (req, res) => {
  res.render('accessibility', { title: 'Accessibility statement' });
});

/* =============================================================
   AI ASSISTANT  (grounded in everything registered on the site)
   ============================================================= */

const CHAT_MODEL = process.env.CHAT_MODEL || 'claude-opus-4-8';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Compile a knowledge base from the site's own data (homes, jobs, care, contact)
async function buildKnowledge() {
  const S = await db.settings();
  const lines = [];
  lines.push(`# ${S.name} — website information`);
  lines.push(`Phone: ${S.phone} | Email: ${S.email} | Head office: ${S.address}`);
  lines.push(`Regions served: ${S.regions.join(', ')}. Phone lines open Mon–Sun, 8am–8pm.`);

  lines.push(`\n## Types of care we provide`);
  lines.push(`- Residential care: help with everyday things (washing, dressing, meals, medication) in a comfortable home, keeping independence.`);
  lines.push(`- Nursing care: 24-hour care from registered nurses for ongoing medical needs and long-term conditions.`);
  lines.push(`- Dementia care: specialist teams in calm, familiar surroundings for people living with dementia.`);
  lines.push(`- Respite & short stays: flexible short-term and convalescent care.`);
  lines.push(`- End-of-life care: gentle, dignified palliative care working with GPs and family.`);

  lines.push(`\n## Our care homes`);
  (await db.homes()).forEach((h) => {
    const cqc = 'CQC rating: ' + content.cqcLabel(h);
    const d = h.details || {};
    const fees = content.FEE_ROWS.filter((r) => d.fees && d.fees[r.key])
      .map((r) => `${r.label} from ${content.gbp(d.fees[r.key])}/week`).join('; ');
    const avail = { available: 'rooms available now', limited: 'limited availability', waitlist: 'waiting list' }[d.availability];
    lines.push(
      `- ${h.name} (${h.town}, ${h.postcode}, ${h.region}): ${h.beds} beds, ${cqc}. ` +
        (fees ? `Fees: ${fees}${d.feesUpdated ? ' (as of ' + d.feesUpdated + ')' : ''}. ` : 'Fees: not published yet — ask people to call. ') +
        (avail ? `Availability: ${avail}${d.availabilityNote ? ' — ' + d.availabilityNote : ''}. ` : '') +
        (d.managerName ? `Home manager: ${d.managerName}. ` : '') +
        `Page: /care-homes/${h.id} (book a visit there). ` +
        `Care types: ${h.careTypes.join(', ')}. ${h.blurb}` +
        (h.specialisms && h.specialisms.length ? ` Specialisms: ${h.specialisms.join(', ')}.` : '') +
        (h.dementiaNote ? ` ${h.dementiaNote}` : '')
    );
  });

  const jobs = await db.openJobs();
  lines.push(`\n## Current job vacancies (${jobs.length} open)`);
  if (jobs.length) {
    jobs.forEach((j) => {
      lines.push(
        `- ${j.title} — ${j.service}, ${j.location}, ${j.employmentType}` +
          (j.salary ? `, ${j.salary}` : '') + `. ${j.summary} Apply online at /careers/${j.id}.`
      );
    });
  } else {
    lines.push(`- No open vacancies right now; candidates can register interest via the contact page.`);
  }

  lines.push(`\n## How to get in touch / next steps`);
  lines.push(`- Find a home and filter by region/care type at /care-homes.`);
  lines.push(`- Fees, what's included and funding help: /fees-and-funding. CQC ratings: /cqc-ratings. Common questions: /faqs.`);
  lines.push(`- Book a visit or send an enquiry at /contact, or call ${S.phone}.`);
  lines.push(`- Browse and apply for jobs at /careers.`);
  return lines.join('\n');
}

app.post('/api/chat', async (req, res) => {
  try {
    const SITE = await db.settings();
    const incoming = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
    // sanitise to {role, content} text turns, cap history length
    const history = incoming
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (!history.length || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Please include a user message.' });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.json({
        reply:
          "The assistant isn't switched on yet — it needs an Anthropic API key. " +
          `In the meantime, call us on ${SITE.phone} or send an enquiry via the contact page.`,
      });
    }

    const system =
      `You are the friendly online assistant for ${SITE.name}, a UK care-home group. ` +
      `Answer questions ONLY using the information below, which is everything published on this website. ` +
      `If the answer isn't in this information, say you don't have that detail and invite the person to call ${SITE.phone} or use the contact page — do not guess or invent homes, prices, names or facts. ` +
      `Be warm, concise and reassuring (families researching care are often anxious). Use British English. ` +
      `When relevant, point people to the right page (e.g. /care-homes, /careers, /contact).\n\n` +
      (await buildKnowledge());

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system,
        messages: history,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Anthropic API error', r.status, detail);
      return res.status(502).json({
        error: 'The assistant is unavailable right now. Please try again, or call us.',
      });
    }

    const data = await r.json();
    if (data.stop_reason === 'refusal') {
      return res.json({
        reply: `I'm not able to help with that one. For anything about our care or homes, call ${SITE.phone} and our team will be glad to help.`,
      });
    }
    const reply = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.json({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/* =============================================================
   ADMIN BACKOFFICE
   ============================================================= */

function adminUnavailable(res) {
  res.status(503).render('admin/login', {
    error: 'The backoffice is not configured yet. Set ADMIN_PASS and SESSION_SECRET in the hosting environment, then redeploy.',
  });
}

function requireAuth(req, res, next) {
  if (ADMIN_DISABLED) return adminUnavailable(res);
  if (!isAdmin(req)) return res.redirect('/admin/login');
  Promise.resolve(currentUser(req))
    .then((user) => {
      req.adminUser = user;
      // Signing in through the environment login grants owner-level access.
      req.adminRole = user ? user.role : 'owner';
      req.adminLabel = user ? (user.name || user.email) : ADMIN_USER;
      res.locals.adminUser = user;
      res.locals.adminRole = req.adminRole;
      res.locals.adminLabel = req.adminLabel;
      next();
    })
    .catch(next);
}

/* Adding and removing colleagues is for owners only. */
function requireOwner(req, res, next) {
  if (req.adminRole === 'owner') return next();
  res.status(403).render('admin/forbidden', { title: 'Not allowed' });
}

app.get('/admin/login', (req, res) => {
  if (ADMIN_DISABLED) return adminUnavailable(res);
  if (isAdmin(req)) return res.redirect('/admin');
  res.render('admin/login', { error: null, showDemo: !IS_PROD });
});

function startSession(res, who) {
  res.cookie('vc_admin', signAdminToken(who), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.VERCEL,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/',
  });
}

app.post('/admin/login', wrap(async (req, res) => {
  if (ADMIN_DISABLED) return adminUnavailable(res);
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (sameText(username.toLowerCase(), ADMIN_USER.toLowerCase()) && sameText(password, ADMIN_PASS)) {
    res.cookie('vc_admin', signAdminToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!process.env.VERCEL,
      maxAge: 1000 * 60 * 60 * 8,
      path: '/',
    });
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    error: 'Incorrect username or password. The password is the ADMIN_PASS value set in your hosting settings (Vercel → Settings → Environment Variables) — not your Supabase password.',
    showDemo: !IS_PROD,
  });
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('vc_admin', { path: '/' });
  res.redirect('/admin/login');
});

// Dashboard
app.get('/admin', requireAuth, wrap(async (req, res) => {
  runRetentionSweep(req.adminLabel); // deliberately not awaited
  res.render('admin/dashboard', {
    title: 'Dashboard',
    health: await db.health(),
    stats: await db.stats(),
    jobs: await db.jobs(),
    counts: await db.applicationCounts(),
  });
}));

// New job form
app.get('/admin/jobs/new', requireAuth, (req, res) => {
  res.render('admin/job-form', { title: 'Post a job', mode: 'new', job: {} });
});

// Create job
app.post('/admin/jobs', requireAuth, wrap(async (req, res) => {
  await db.createJob(req.body);
  res.redirect('/admin');
}));

// Edit job form
app.get('/admin/jobs/:id/edit', requireAuth, wrap(async (req, res) => {
  const job = await db.job(req.params.id);
  if (!job) return res.redirect('/admin');
  res.render('admin/job-form', { title: 'Edit vacancy', mode: 'edit', job });
}));

// Update job
app.post('/admin/jobs/:id', requireAuth, wrap(async (req, res) => {
  await db.updateJob(req.params.id, req.body);
  res.redirect('/admin');
}));

// Toggle open/closed
app.post('/admin/jobs/:id/toggle', requireAuth, wrap(async (req, res) => {
  await db.toggleJob(req.params.id);
  res.redirect('/admin');
}));

// Delete job
app.post('/admin/jobs/:id/delete', requireAuth, wrap(async (req, res) => {
  await db.deleteJob(req.params.id);
  res.redirect('/admin');
}));

/* ---------- Staff accounts ---------- */

app.get('/admin/users', requireAuth, requireOwner, wrap(async (req, res) => {
  res.render('admin/users', {
    title: 'Staff accounts',
    users: await db.users(),
    audit: await db.recentAudit(25),
    error: null,
    notice: req.query.added ? 'Account created.' : null,
  });
}));

app.post('/admin/users', requireAuth, requireOwner, wrap(async (req, res) => {
  try {
    const user = await db.createUser({
      email: req.body.email,
      name: req.body.name,
      password: req.body.password,
      role: req.body.role,
    });
    await db.audit(req.adminLabel, 'created an account', user.email);
    return res.redirect('/admin/users?added=1');
  } catch (err) {
    return res.status(400).render('admin/users', {
      title: 'Staff accounts',
      users: await db.users(),
      audit: await db.recentAudit(25),
      error: err.message,
      notice: null,
    });
  }
}));

app.post('/admin/users/:id/delete', requireAuth, requireOwner, wrap(async (req, res) => {
  const user = await db.userById(req.params.id);
  if (!user) return res.redirect('/admin/users');

  // Don't let the last owner be removed — that would lock everyone out.
  const owners = (await db.users()).filter((u) => u.role === 'owner');
  if (user.role === 'owner' && owners.length <= 1) {
    return res.status(400).render('admin/users', {
      title: 'Staff accounts',
      users: await db.users(),
      audit: await db.recentAudit(25),
      error: 'That is the only owner account. Make someone else an owner first.',
      notice: null,
    });
  }

  await db.deleteUser(user.id);
  await db.audit(req.adminLabel, 'removed an account', user.email);
  res.redirect('/admin/users');
}));

/* Changing your own password — available to everyone, owner or not. */
app.get('/admin/password', requireAuth, wrap(async (req, res) => {
  res.render('admin/password', { title: 'Change password', error: null, notice: null });
}));

app.post('/admin/password', requireAuth, wrap(async (req, res) => {
  const render = (extra) => res.render('admin/password', Object.assign({ title: 'Change password', error: null, notice: null }, extra));

  if (!req.adminUser) {
    return res.status(400).render('admin/password', {
      title: 'Change password',
      error: 'You are signed in with the environment login, which has no password stored here. Change ADMIN_PASS in the hosting settings instead.',
      notice: null,
    });
  }
  if (!(await db.authenticate(req.adminUser.email, req.body.current))) {
    return res.status(400).render('admin/password', { title: 'Change password', error: 'Your current password was not correct.', notice: null });
  }
  if (req.body.next !== req.body.confirm) {
    return res.status(400).render('admin/password', { title: 'Change password', error: 'The two new passwords do not match.', notice: null });
  }
  try {
    await db.setUserPassword(req.adminUser.id, req.body.next);
    await db.audit(req.adminLabel, 'changed their password', '');
    return render({ notice: 'Password changed.' });
  } catch (err) {
    return res.status(400).render('admin/password', { title: 'Change password', error: err.message, notice: null });
  }
}));

/* ---------- Data protection ---------- */

app.get('/admin/data', requireAuth, requireOwner, wrap(async (req, res) => {
  const email = (req.query.email || '').toString().trim();
  const found = email ? await db.findPersonData(email) : null;
  res.render('admin/data', {
    title: 'Data requests',
    email,
    found,
    retentionDays: RETENTION_DAYS,
    notice: req.query.deleted
      ? 'Deleted ' + req.query.deleted + ' record(s). Nothing about that person remains.'
      : req.query.swept !== undefined
        ? (req.query.swept === '0'
            ? 'Nothing was old enough to remove.'
            : 'Cleared out ' + req.query.swept + ' application(s) past the retention period.')
        : null,
  });
}));

/* A subject access request: everything held about one person, as a file. */
app.get('/admin/data/export', requireAuth, requireOwner, wrap(async (req, res) => {
  const email = (req.query.email || '').toString().trim();
  if (!email) return res.redirect('/admin/data');
  const found = await db.findPersonData(email);
  await db.audit(req.adminLabel, 'exported personal data', email);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="venza-data-' + email.replace(/[^a-z0-9.@-]/gi, '_') + '.json"');
  res.send(JSON.stringify({ email, exportedAt: new Date().toISOString(), ...found }, null, 2));
}));

/* The automatic sweep runs at most once a day per instance, so this is the way
   to make it happen now — and to prove to yourself that it works. */
app.post('/admin/data/sweep', requireAuth, requireOwner, wrap(async (req, res) => {
  if (!RETENTION_DAYS || RETENTION_DAYS < 1) return res.redirect('/admin/data');
  const removed = await db.expireApplications(RETENTION_DAYS);
  for (const key of removed.cvPaths) await storage.deleteCv(key);
  lastSweep = Date.now();
  await db.audit(req.adminLabel, 'ran the clear-out', removed.count + ' application(s) past ' + RETENTION_DAYS + ' days');
  res.redirect('/admin/data?swept=' + removed.count);
}));

app.post('/admin/data/delete', requireAuth, requireOwner, wrap(async (req, res) => {
  const email = (req.body.email || '').toString().trim();
  if (!email) return res.redirect('/admin/data');
  const removed = await db.deletePersonData(email);
  for (const key of removed.cvPaths) await storage.deleteCv(key);
  await db.audit(req.adminLabel, 'deleted personal data', email + ' — ' + removed.applications + ' application(s), ' + removed.messages + ' message(s)');
  res.redirect('/admin/data?deleted=' + (removed.applications + removed.messages));
}));

/* ---------- Care homes ---------- */

app.get('/admin/homes', requireAuth, wrap(async (req, res) => {
  const homes = await db.homes();
  const jobs = await db.jobs();
  const jobCounts = {};
  jobs.forEach((j) => { if (j.homeId) jobCounts[j.homeId] = (jobCounts[j.homeId] || 0) + 1; });
  res.render('admin/homes', { title: 'Care homes', homes, jobCounts });
}));

app.get('/admin/homes/new', requireAuth, wrap(async (req, res) => {
  res.render('admin/home-form', {
    title: 'Add a home',
    mode: 'new',
    home: {},
    careTypes: db.CARE_TYPES,
    error: null,
  });
}));

app.get('/admin/homes/:id/edit', requireAuth, wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return res.redirect('/admin/homes');
  res.render('admin/home-form', {
    title: 'Edit ' + home.name,
    mode: 'edit',
    home,
    careTypes: db.CARE_TYPES,
    error: null,
  });
}));

/* Turn a home into the URL-safe id used in /care-homes/<id>. */
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'home';
}

const homePhotoFields = photoUpload.fields([
  { name: 'photoFile', maxCount: 1 },
  { name: 'galleryFiles', maxCount: 12 },
]);

async function saveHomeFromForm(req, existing) {
  const body = req.body;
  const files = req.files || {};

  const photoFile = (files.photoFile || [])[0];
  const galleryFiles = files.galleryFiles || [];

  // Uploading a new exterior shot replaces the old one; otherwise keep what's there.
  const photo = photoFile ? await storage.savePhoto(photoFile) : (body.photo || '').trim();

  // New gallery images are added to the ones kept via the checkboxes on the form.
  const kept = [].concat(body.keepGallery || []).filter(Boolean);
  const added = [];
  for (const f of galleryFiles) added.push(await storage.savePhoto(f));

  const careTypes = [].concat(body.careTypes || []).filter(Boolean);

  return db.saveHome({
    id: existing ? existing.id : slugify(body.name),
    name: (body.name || '').trim(),
    town: (body.town || '').trim(),
    postcode: (body.postcode || '').trim(),
    region: (body.region || '').trim(),
    lat: body.lat === '' ? null : Number(body.lat),
    lng: body.lng === '' ? null : Number(body.lng),
    beds: body.beds === '' ? null : parseInt(body.beds, 10),
    cqc: body.cqc || 'Registered',
    careTypes,
    specialisms: body.specialisms,
    blurb: (body.blurb || '').trim(),
    dementiaNote: (body.dementiaNote || '').trim(),
    photo,
    gallery: kept.concat(added),
    sortOrder: body.sortOrder === '' ? 0 : parseInt(body.sortOrder, 10) || 0,
  });
}

app.post('/admin/homes', requireAuth, homePhotoFields, wrap(async (req, res) => {
  if (!req.body.name || !req.body.town) {
    return res.status(400).render('admin/home-form', {
      title: 'Add a home',
      mode: 'new',
      home: req.body,
      careTypes: db.CARE_TYPES,
      error: 'A home needs at least a name and a town.',
    });
  }
  const existing = await db.home(slugify(req.body.name));
  if (existing) {
    return res.status(400).render('admin/home-form', {
      title: 'Add a home',
      mode: 'new',
      home: req.body,
      careTypes: db.CARE_TYPES,
      error: 'There is already a home called ' + existing.name + '. Edit that one, or use a different name.',
    });
  }
  await saveHomeFromForm(req, null);
  res.redirect('/admin/homes');
}));

app.post('/admin/homes/:id', requireAuth, homePhotoFields, wrap(async (req, res) => {
  const existing = await db.home(req.params.id);
  if (!existing) return res.redirect('/admin/homes');
  if (!req.body.name || !req.body.town) {
    return res.status(400).render('admin/home-form', {
      title: 'Edit ' + existing.name,
      mode: 'edit',
      home: Object.assign({}, existing, req.body),
      careTypes: db.CARE_TYPES,
      error: 'A home needs at least a name and a town.',
    });
  }
  await saveHomeFromForm(req, existing);
  res.redirect('/admin/homes');
}));

app.post('/admin/homes/:id/delete', requireAuth, wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return res.redirect('/admin/homes');

  // Deleting a home would leave its vacancies pointing at nothing, so say so
  // rather than quietly orphaning them.
  const attached = (await db.jobs()).filter((j) => j.homeId === home.id);
  if (attached.length) {
    const homes = await db.homes();
    const jobs = await db.jobs();
    const jobCounts = {};
    jobs.forEach((j) => { if (j.homeId) jobCounts[j.homeId] = (jobCounts[j.homeId] || 0) + 1; });
    return res.status(400).render('admin/homes', {
      title: 'Care homes',
      homes,
      jobCounts,
      error:
        home.name + ' still has ' + attached.length + ' vacanc' + (attached.length === 1 ? 'y' : 'ies') +
        ' attached. Move or delete those first.',
    });
  }

  await db.removeHome(home.id);
  res.redirect('/admin/homes');
}));

// Applications
app.get('/admin/applications', requireAuth, wrap(async (req, res) => {
  const jobId = (req.query.job || '').toString();
  const status = (req.query.status || '').toString();
  let applications = await db.applications(jobId);
  if (status) applications = applications.filter((a) => (a.status || 'new') === status);
  res.render('admin/applications', {
    title: 'Applications',
    applications,
    jobs: await db.jobs(),
    statuses: db.APPLICATION_STATUSES,
    jobId,
    status,
  });
}));

app.post('/admin/applications/:id/status', requireAuth, wrap(async (req, res) => {
  await db.setApplicationStatus(req.params.id, req.body.status, req.body.notes);
  const back = '/admin/applications' + (req.body.back ? '?' + req.body.back : '');
  res.redirect(back + '#' + req.params.id);
}));

/* CV download — the only way to reach an applicant's CV. Admin-only, and the
   underlying file is never served statically. */
app.get('/admin/applications/:id/cv', requireAuth, wrap(async (req, res) => {
  const all = await db.applications();
  const application = all.find((a) => a.id === req.params.id);
  if (!application || !application.cvPath) return notFound(res);

  const signed = await storage.cvDownloadUrl(application.cvPath);
  if (signed) return res.redirect(signed);

  const local = storage.localCvPath(application.cvPath);
  if (!local) return notFound(res);
  res.download(local, application.cvFilename || 'cv');
}));

// Homes — the details families look for most, editable without a redeploy
app.get('/admin/homes', requireAuth, wrap(async (req, res) => {
  res.render('admin/homes', { title: 'Homes', homes: await db.homes(), saved: req.query.saved || '' });
}));

app.get('/admin/homes/:id/edit', requireAuth, wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return res.redirect('/admin/homes');
  res.render('admin/home-form', { title: 'Edit ' + home.name, home, careTypes: CARE_TYPES, error: null });
}));

app.post('/admin/homes/:id', requireAuth, wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return res.redirect('/admin/homes');
  const f = req.body;
  const price = (v) => {
    const n = parseFloat(String(v || '').replace(/[£,\s]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const text = (v, max) => String(v || '').trim().slice(0, max || 500);
  const careTypes = [].concat(f.careTypes || []).filter((c) => CARE_TYPES.includes(c));
  const details = Object.assign({}, home.details, {
    phone: text(f.phone, 40),
    availability: ['available', 'limited', 'waitlist'].includes(f.availability) ? f.availability : '',
    availabilityNote: text(f.availabilityNote, 200),
    fees: {
      residential: price(f.feeResidential),
      nursing: price(f.feeNursing),
      dementia: price(f.feeDementia),
      respite: price(f.feeRespite),
    },
    feesUpdated: text(f.feesUpdated, 40),
    feesNote: text(f.feesNote, 400),
    cqcLocationId: text(f.cqcLocationId, 30).replace(/[^0-9A-Za-z-]/g, ''),
    cqcRatedOn: text(f.cqcRatedOn, 40),
    managerName: text(f.managerName, 80),
    managerBio: text(f.managerBio, 800),
    managerPhoto: text(f.managerPhoto, 300),
    carehomeUrl: /^https:\/\/(www\.)?carehome\.co\.uk\//.test(text(f.carehomeUrl, 300)) ? text(f.carehomeUrl, 300) : '',
    reviewScore: text(f.reviewScore, 6),
    reviewCount: text(f.reviewCount, 8),
    parking: text(f.parking, 400),
  });
  await db.saveHome(Object.assign({}, home, {
    name: text(f.name, 80) || home.name,
    blurb: text(f.blurb, 600) || home.blurb,
    beds: parseInt(f.beds, 10) || home.beds,
    cqc: ['Outstanding', 'Good', 'Requires improvement', 'Inadequate', 'Registered'].includes(f.cqc) ? f.cqc : home.cqc,
    careTypes: careTypes.length ? careTypes : home.careTypes,
    details,
  }));
  res.redirect('/admin/homes?saved=' + encodeURIComponent(home.id));
}));

// Enquiries
app.get('/admin/messages', requireAuth, wrap(async (req, res) => {
  const kind = (req.query.kind || '').toString();
  const status = (req.query.status || '').toString();
  let messages = await db.messages();
  if (kind) messages = messages.filter((m) => (m.kind || 'enquiry') === kind);
  if (status) messages = messages.filter((m) => (m.status || 'new') === status);
  res.render('admin/messages', {
    title: 'Enquiries',
    messages,
    statuses: db.MESSAGE_STATUSES,
    kind,
    status,
  });
}));

app.post('/admin/messages/:id/status', requireAuth, wrap(async (req, res) => {
  await db.setMessageStatus(req.params.id, req.body.status, req.body.notes);
  const back = '/admin/messages' + (req.body.back ? '?' + req.body.back : '');
  res.redirect(back + '#' + req.params.id);
}));

/* =============================================================
   404 + errors
   ============================================================= */
function notFound(res) {
  res.status(404).render('404', { title: 'Page not found' });
}

app.use((req, res) => notFound(res));

// Multer / upload errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).send('Upload error: ' + err.message + ' (max 8 MB).');
  }
  console.error(err);
  res.status(500).send('Something went wrong.');
});

// Local dev / Render: run a listening server. On Vercel the app is exported
// below and invoked as a serverless function, so we must NOT call listen there.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Venza Care UK running:`);
    console.log(`  → Public site:  http://localhost:${PORT}`);
    console.log(`  → Admin login:  http://localhost:${PORT}/admin/login  (${ADMIN_USER} / ${ADMIN_PASS})\n`);
  });
}

module.exports = app;
