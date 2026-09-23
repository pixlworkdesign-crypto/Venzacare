/* =============================================================
   Venza Care UK — Express server (public site + admin backoffice)
   ============================================================= */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('./db');
const storage = require('./storage');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');

/* The admin credentials and session secret MUST come from the environment in
   production. This repository is public, so a hardcoded fallback would be a
   published password — refuse to start rather than run with a known one. */
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || (IS_PROD ? '' : 'venza2026');
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? '' : 'venza-dev-secret-change-me');

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

/* Links in alert emails need the full address, not a site-relative path. */
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const absolute = (req, pathname) =>
  (SITE_URL || req.protocol + '://' + req.get('host')) + pathname;

/* ---------- View engine ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
function isAdmin(req) { return verifyAdminToken(readCookie(req, 'vc_admin')); }

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
    homes: await db.homes(),
    jobs: openJobs.filter((j) => j.featured).slice(0, 3),
    openCount: openJobs.length,
    stats: await db.siteStats(),
  });
}));

// Our care
app.get('/our-care', (req, res) => {
  res.render('our-care', { title: 'Our care' });
});

// Find a home (directory + filters)
app.get('/care-homes', wrap(async (req, res) => {
  const q = (req.query.q || '').toString();
  const region = (req.query.region || '').toString();
  const careType = (req.query.careType || '').toString();
  res.render('care-homes', {
    title: 'Find a care home',
    homes: await db.filterHomes({ q, region, careType }),
    regions: await db.regions(),
    careTypes: db.CARE_TYPES,
    q,
    region,
    careType,
  });
}));

// Individual home
app.get('/care-homes/:id', wrap(async (req, res) => {
  const home = await db.home(req.params.id);
  if (!home) return notFound(res);
  res.render('home', {
    title: home.name,
    home,
    jobs: await db.jobsForHome(home.id),
  });
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
    jobs,
    services,
    locations: await db.jobLocations(),
    q: req.query.q || '',
    service,
    location,
  });
}));

// Single job + application form
app.get('/careers/:id', wrap(async (req, res) => {
  const job = await db.job(req.params.id);
  if (!job || job.status !== 'open') return notFound(res);
  res.render('job', { title: job.title, job, form: {}, error: null });
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
    const cqc = (h.cqc === 'Good' || h.cqc === 'Outstanding') ? `CQC ${h.cqc}` : 'CQC registered';
    lines.push(
      `- ${h.name} (${h.town}, ${h.postcode}, ${h.region}): ${h.beds} beds, ${cqc}. ` +
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
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (ADMIN_DISABLED) return adminUnavailable(res);
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.cookie('vc_admin', signAdminToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!process.env.VERCEL,
      maxAge: 1000 * 60 * 60 * 8,
      path: '/',
    });
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Incorrect username or password.' });
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('vc_admin', { path: '/' });
  res.redirect('/admin/login');
});

// Dashboard
app.get('/admin', requireAuth, wrap(async (req, res) => {
  res.render('admin/dashboard', {
    title: 'Dashboard',
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
