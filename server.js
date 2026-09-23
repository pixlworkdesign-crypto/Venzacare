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
function signAdminToken() {
  const payload = 'admin.' + (Date.now() + 1000 * 60 * 60 * 8); // 8-hour expiry
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}
function verifyAdminToken(token) {
  if (!token || token.split('.').length !== 3) return false;
  const [who, exp, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(who + '.' + exp).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (who !== 'admin' || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return parseInt(exp, 10) > Date.now();
}
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

  await db.addApplication({
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
  if (isAdmin(req)) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  if (ADMIN_DISABLED) return adminUnavailable(res);
  if (isAdmin(req)) return res.redirect('/admin');
  res.render('admin/login', { error: null, showDemo: !IS_PROD });
});

app.post('/admin/login', (req, res) => {
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

// Applications
app.get('/admin/applications', requireAuth, wrap(async (req, res) => {
  const jobId = (req.query.job || '').toString();
  res.render('admin/applications', {
    title: 'Applications',
    applications: await db.applications(jobId),
    jobs: await db.jobs(),
    jobId,
  });
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
  res.render('admin/messages', { title: 'Enquiries', messages: await db.messages() });
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
