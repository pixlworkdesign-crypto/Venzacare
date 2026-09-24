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
const mountHub = require('./hub/routes');
const visits = require('./visits');
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

/* The staff hub needs SESSION_SECRET to sign sign-in cookies. Without it in
   production the hub is sealed shut (the public site stays up — it's the
   shop window). ADMIN_PASS is only the emergency owner login: without it,
   people still sign in with their own accounts. */
const HUB_SEALED = IS_PROD && !SESSION_SECRET;
const MISSING_ADMIN_VARS = [!SESSION_SECRET && 'SESSION_SECRET'].filter(Boolean);
const DEPLOY_ENV = process.env.VERCEL_ENV || (process.env.VERCEL ? 'unknown' : 'local');
/* Say exactly what's missing, and which Vercel environment this deployment is
   — variables scoped to "Production" are invisible to Preview deployments,
   which is the usual reason sign-in is off on a *.vercel.app link. */
function adminSetupHint() {
  const missing = MISSING_ADMIN_VARS.join(' and ');
  const where = DEPLOY_ENV === 'preview'
    ? ` This is a Preview deployment: in Vercel → Settings → Environment Variables, edit ${missing} and tick "Preview" as well as "Production" — or sign in on your main (production) web address instead.`
    : DEPLOY_ENV === 'production'
      ? ` This is the Production deployment: check ${missing} is set for "Production" in this Vercel project and not blank, then redeploy.`
      : ` Set ${missing} in the hosting environment, then redeploy.`;
  return `Sign-in is switched off because ${missing} is not set on this deployment.` + where;
}
if (HUB_SEALED) {
  console.error(
    '\n  STAFF HUB DISABLED: SESSION_SECRET is not set.\n' +
    '  The public site is running, but nobody can sign in to /admin.\n' +
    '  Set it in Vercel → Settings → Environment Variables, then redeploy.\n'
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

// Constant-time string comparison, so response timing leaks nothing.
function sameText(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* The public address of the site, for canonical links, the sitemap and
   social cards. Set SITE_URL in production; otherwise use the request host. */
/* Vercel gives every deployment its own address (project-abc123xyz-team…)
   and every branch a preview address (project-git-branch-team…). Both are
   usually behind Vercel's login and never change to newer versions, so
   they must not be used for links people are sent. */
function isOneOffVercelHost(host) {
  return /^[a-z0-9-]+-(git-[a-z0-9-]+|[a-z0-9]{9})-[a-z0-9-]+\.vercel\.app$/i.test(String(host || ''));
}

// SITE_URL as set, tidied: "https://" added if missing, trailing "/" removed.
function configuredSiteUrl() {
  let v = env('SITE_URL').replace(/\/+$/, '');
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  return v;
}
function siteUrlProblem() {
  const v = configuredSiteUrl();
  if (!v) return null;
  let host = '';
  try { host = new URL(v).host; } catch (e) { return 'SITE_URL (' + v + ') isn’t a valid web address, so it’s being ignored.'; }
  if (isOneOffVercelHost(host)) {
    return 'SITE_URL is set to ' + host + ', which is a single Vercel deployment or preview (behind Vercel’s login), so it’s being ignored. Set it to your main address, e.g. https://venzacare.vercel.app, and redeploy.';
  }
  return null;
}

function siteUrl(req) {
  if (configuredSiteUrl() && !siteUrlProblem()) return configuredSiteUrl();
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return proto + '://' + req.get('host');
}

// Tell the enquiries inbox about a new submission (only if email is set up).
function alert(req, res, subject, rows, replyTo, path) {
  if (!mailer.configured()) return;
  mailer.alertInbox(res.locals.SITE.email, {
    subject, heading: subject, rows, replyTo,
    link: { label: 'Open the staff hub', url: siteUrl(req) + (path || '/admin/enquiries') },
  });
}

const CARE_TYPES = ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'];
const lower = (s) => (s || '').toLowerCase();

// Shared locals available to every view
app.use(wrap(async (req, res, next) => {
  res.locals.SITE = await db.settings();
  // Region filters list the regions the homes are actually in.
  const liveHomes = await db.homes();
  res.locals.homeRegions = [...new Set(liveHomes.map((h) => h.region).filter(Boolean))].sort();
  // …and the "Type of care" filters list the care the homes actually offer.
  res.locals.homeCareTypes = CARE_TYPES.filter((c) => liveHomes.some((h) => (h.careTypes || []).includes(c)));
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
    slots: await visits.openSlots(home),
    booked: null,
    bookForm: {},
    bookError: null,
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
  const day = /^\d{4}-\d{2}-\d{2}$/.test(f.date || '')
    ? new Date(f.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const when = [day, f.time].filter(Boolean).join(', ') || 'Any time';
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
  alert(req, res, 'Visit request — ' + home.name, [['Name', name], ['Phone', phone], ['Email', email], ['Preferred', when], ['Care needed', f.careType], ['Notes', f.notes]], email);
  res.render('home', await homeLocals(req, res, home, { visitSent: true }));
}));

// Book a visit instantly: the family picks a free slot and it's confirmed.
app.post('/care-homes/:id/book', wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return notFound(res);
  const f = req.body || {};
  if (f.website) return res.redirect('/care-homes/' + home.id); // honeypot
  const name = String(f.name || '').trim().slice(0, 120);
  const phone = String(f.phone || '').trim().slice(0, 40);
  const email = String(f.email || '').trim().slice(0, 200);
  const [date, time] = String(f.slot || '').split('|');
  const again = (msg) => homeLocals(req, res, home, { bookForm: f, bookError: msg }).then((l) => res.render('home', l));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return again('Pick a day and a time for your visit.');
  if (!name || (!phone && !email)) return again('Please give us your name and a phone number or email, so we can reach you if anything changes.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return again('That email address doesn’t look right.');
  if (!(await visits.isOffered(home, date, time))) return again('Sorry — that time has just been taken. Please pick another.');
  const claimId = await visits.claim(home, date, time, { name });
  if (!claimId) return again('Sorry — that time has just been taken. Please pick another.');

  const when = visits.whenLabel(date, time);
  const msg = await db.addMessage({
    kind: 'visit', name, email, phone,
    subject: 'Visit booked online — ' + home.name,
    bestTime: when,
    home: home.name,
    message: `Booked a visit to ${home.name} on ${when}.` +
      (f.careType ? ` Care needed: ${String(f.careType).slice(0, 60)}.` : '') +
      (f.notes ? ` Notes: ${String(f.notes).slice(0, 2000)}` : ''),
  });
  await db.records.put('visit_slots', claimId, { homeId: home.id, date, time, name, enquiryId: msg.id });
  await db.records.put('enquiry_progress', msg.id, {
    stage: 'Visit booked', visitAt: date + 'T' + time, claimId, online: true,
    note: 'Booked online by the family for ' + when + '.',
    updatedAt: new Date().toISOString(), updatedBy: 'Family (online)',
  });

  // Emails (only if email is set up): the family, and staff who cover this home.
  const SITE = res.locals.SITE;
  const phoneHome = (home.details && home.details.phone) || SITE.phone;
  const directions = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(home.name + ', ' + home.town + ' ' + home.postcode);
  if (email) {
    mailer.send({
      to: email,
      subject: 'Your visit to ' + home.name + ' — ' + when,
      heading: 'Your visit is booked',
      lines: ['Hi ' + name.split(' ')[0] + ',', 'You’re booked to visit ' + home.name + ', ' + home.town + ' ' + home.postcode + ' on ' + when + '.', 'If you need to change the time, call us on ' + phoneHome + '.'],
      button: { label: 'Get directions', url: directions },
    }).catch(() => {});
  }
  alert(req, res, 'Visit booked online — ' + home.name + ', ' + when, [['Name', name], ['Phone', phone], ['Email', email], ['Care needed', f.careType], ['Notes', f.notes]], email, '/admin/enquiries?tab=progress');
  if (mailer.configured()) {
    const hubAuth = require('./hub/auth'), access = require('./hub/access');
    const staff = (await hubAuth.allUsers()).filter((u) => u.status === 'active' && u.email && access.can(u, 'enquiries', 'view') && access.covers(u, home.id));
    mailer.sendMany(staff.map((u) => u.email), {
      subject: 'New visit booked: ' + name + ' — ' + when,
      heading: 'New visit booked online',
      lines: [name + ' has booked to visit ' + home.name + ' on ' + when + '.', [phone, email].filter(Boolean).join(' · ')],
      button: { label: 'Open enquiries', url: siteUrl(req) + '/admin/enquiries?tab=progress' },
    }).catch(() => {});
  }

  res.render('home', await homeLocals(req, res, home, {
    booked: {
      when, name,
      ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(visits.calendarFile(home, date, time, SITE.name)),
      directions, phone: phoneHome,
    },
  }));
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
  alert(req, res, 'Careers question: ' + (f.topic || 'General question'), [['Name', name], ['Email', email], ['Phone', f.phone], ['Role', f.role], ['Home', f.home], ['Message', message]], email, '/admin/applications');
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
  alert(req, res, 'New application: ' + job.title, [['Name', name], ['Email', email], ['Phone', phone], ['Right to work', rightToWork], ['CV', cv.filename ? 'Uploaded — open it in the staff hub' : 'None'], ['Message', message]], email, '/admin/applications?job=' + encodeURIComponent(job.id));

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
    alert(req, res, 'New enquiry: ' + (subject || 'General enquiry'), [['Name', name], ['Email', email], ['Phone', phone], ['Message', message]], email);
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
    alert(req, res, 'Callback request: ' + name, [['Name', name], ['Phone', phone], ['Best time', time || 'Anytime'], ['Home', home]]);
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

// Friendly addresses for the staff hub
app.get(['/staff', '/hub'], (req, res) => res.redirect('/admin'));

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
  const siteProblem = siteUrlProblem();
  if (siteProblem) h.problems.push(siteProblem);
  res.status(h.ok ? 200 : 503).json({
    ok: h.ok,
    database: h.backend === 'postgres' ? 'Supabase / Postgres' : 'local file (not persistent)',
    deployment: DEPLOY_ENV,
    linksUse: siteUrl(req) + (configuredSiteUrl() && !siteUrlProblem() ? '' : ' (the address this page was opened on — set SITE_URL to your main address)'),
    openedOn: req.get('host'),
    adminSignIn: HUB_SEALED ? 'disabled — SESSION_SECRET not set on this deployment' : 'enabled',
    emergencyOwnerLogin: ADMIN_PASS ? 'set' : 'not set (ADMIN_PASS)',
    email: require('./mailer').configured() ? 'set up' : 'not set up — invite and reset links are shown on screen instead',
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
        `Page: /care-homes/${h.id} — families can book a visit there instantly by picking a free time. ` +
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
   STAFF HUB  (/admin — see hub/routes.js)
   ============================================================= */
mountHub(app, {
  wrap,
  siteUrl,
  isOneOffVercelHost,
  sameText,
  CARE_TYPES,
  config: { ADMIN_USER, ADMIN_PASS, SESSION_SECRET, IS_PROD, SEALED: HUB_SEALED, sealedHint: adminSetupHint },
});

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
    return res.status(400).send('Upload error: ' + err.message + ' (max 8 MB for CVs, 10 MB for documents).');
  }
  console.error(err);
  // The staff hub's table is missing — usually an existing Supabase database
  // that hasn't had the latest sql/schema.sql run. Say so instead of a bare 500.
  if (req.path.startsWith('/admin') && /relation .* does not exist/i.test(err.message || '')) {
    return res.status(503).render('admin/login', {
      error: 'The staff hub’s database tables haven’t been created yet. Open Supabase → SQL editor, paste in the whole of sql/schema.sql from the repository and press Run. It’s safe to run again.',
      showDemo: false, notice: null, identifier: '',
    });
  }
  res.status(500).send('Something went wrong.');
});

// Local dev / Render: run a listening server. On Vercel the app is exported
// below and invoked as a serverless function, so we must NOT call listen there.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Venza Care UK running:`);
    console.log(`  → Public site:  http://localhost:${PORT}`);
    console.log(`  → Staff hub:    http://localhost:${PORT}/admin/login  (emergency owner login: ${ADMIN_USER} / ${ADMIN_PASS})\n`);
  });
}

module.exports = app;
