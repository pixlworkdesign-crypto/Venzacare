/* =============================================================
   Venza Care UK — Express server (public site + admin backoffice)
   ============================================================= */

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'venza2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'venza-dev-secret-change-me';

/* ---------- View engine ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ---------- Middleware ---------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);

// Shared locals available to every view
app.use((req, res, next) => {
  res.locals.SITE = db.SITE;
  res.locals.year = new Date().getFullYear();
  res.locals.currentPath = req.path;
  res.locals.title = '';
  next();
});

/* ---------- CV uploads ---------- */
// On read-only serverless hosts (e.g. Vercel) only /tmp is writable.
const WRITABLE_BASE = process.env.VERCEL ? '/tmp' : __dirname;
const UPLOAD_DIR = path.join(WRITABLE_BASE, 'public', 'uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* read-only fs */ }
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safe);
  },
});
const ALLOWED = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.odt'];
const upload = multer({
  storage,
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
app.get('/', (req, res) => {
  const featuredJobs = db.openJobs().filter((j) => j.featured).slice(0, 3);
  res.render('index', {
    homes: db.homes(),
    jobs: featuredJobs,
    openCount: db.openJobs().length,
    stats: db.siteStats(),
  });
});

// Our care
app.get('/our-care', (req, res) => {
  res.render('our-care', { title: 'Our care' });
});

// Find a home (directory + filters)
app.get('/care-homes', (req, res) => {
  const q = (req.query.q || '').toString();
  const region = (req.query.region || '').toString();
  const careType = (req.query.careType || '').toString();
  res.render('care-homes', {
    title: 'Find a care home',
    homes: db.filterHomes({ q, region, careType }),
    q,
    region,
    careType,
  });
});

// Individual home
app.get('/care-homes/:id', (req, res) => {
  const home = db.home(req.params.id);
  if (!home) return notFound(res);
  res.render('home', {
    title: home.name,
    home,
    jobs: db.jobsForHome(home.id),
  });
});

// Careers (filterable jobs board)
app.get('/careers', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const service = (req.query.service || '').toString();
  const location = (req.query.location || '').toString();

  let jobs = db.openJobs();
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

  const services = [...new Set(db.openJobs().map((j) => j.service).filter(Boolean))].sort();

  res.render('careers', {
    title: 'Careers',
    jobs,
    services,
    locations: db.jobLocations(),
    q: req.query.q || '',
    service,
    location,
  });
});

// Single job + application form
app.get('/careers/:id', (req, res) => {
  const job = db.job(req.params.id);
  if (!job || job.status !== 'open') return notFound(res);
  res.render('job', { title: job.title, job, form: {}, error: null });
});

// Submit application
app.post('/careers/:id/apply', upload.single('cv'), (req, res) => {
  const job = db.job(req.params.id);
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

  db.addApplication({
    jobId: job.id,
    jobTitle: job.title,
    name,
    email,
    phone,
    rightToWork,
    message,
    cvFilename: req.file ? req.file.filename : '',
  });

  res.render('apply-success', { title: 'Application received', job });
});

// Contact
function contactLocals(extra) {
  return Object.assign({ title: 'Contact us', sent: false, form: {}, callbackSent: false, cbForm: {}, homes: db.homes() }, extra);
}

app.get('/contact', (req, res) => {
  res.render('contact', contactLocals());
});

app.post('/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (name && email && message) {
    db.addMessage({ name, email, phone, subject, message });
    return res.render('contact', contactLocals({ sent: true }));
  }
  res.render('contact', contactLocals({ form: req.body }));
});

// Request a callback
app.post('/callback', (req, res) => {
  const { name, phone, time, home } = req.body;
  if (name && phone) {
    db.addMessage({
      name,
      phone,
      subject: 'Callback request',
      message: `Please call me back. Best time: ${time || 'Anytime'}.` + (home ? ` Home of interest: ${home}.` : ''),
    });
    return res.render('contact', contactLocals({ callbackSent: true }));
  }
  res.render('contact', contactLocals({ cbForm: req.body }));
});

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
function buildKnowledge() {
  const S = db.SITE;
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
  db.homes().forEach((h) => {
    const cqc = (h.cqc === 'Good' || h.cqc === 'Outstanding') ? `CQC ${h.cqc}` : 'CQC registered';
    lines.push(
      `- ${h.name} (${h.town}, ${h.postcode}, ${h.region}): ${h.beds} beds, ${cqc}. ` +
        `Care types: ${h.careTypes.join(', ')}. ${h.blurb}` +
        (h.specialisms && h.specialisms.length ? ` Specialisms: ${h.specialisms.join(', ')}.` : '') +
        (h.dementiaNote ? ` ${h.dementiaNote}` : '')
    );
  });

  const jobs = db.openJobs();
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
          `In the meantime, call us on ${db.SITE.phone} or send an enquiry via the contact page.`,
      });
    }

    const system =
      `You are the friendly online assistant for ${db.SITE.name}, a UK care-home group. ` +
      `Answer questions ONLY using the information below, which is everything published on this website. ` +
      `If the answer isn't in this information, say you don't have that detail and invite the person to call ${db.SITE.phone} or use the contact page — do not guess or invent homes, prices, names or facts. ` +
      `Be warm, concise and reassuring (families researching care are often anxious). Use British English. ` +
      `When relevant, point people to the right page (e.g. /care-homes, /careers, /contact).\n\n` +
      buildKnowledge();

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
        reply: `I'm not able to help with that one. For anything about our care or homes, call ${db.SITE.phone} and our team will be glad to help.`,
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

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Incorrect username or password.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Dashboard
app.get('/admin', requireAuth, (req, res) => {
  res.render('admin/dashboard', {
    title: 'Dashboard',
    stats: db.stats(),
    jobs: db.jobs(),
    counts: db.applicationCounts(),
  });
});

// New job form
app.get('/admin/jobs/new', requireAuth, (req, res) => {
  res.render('admin/job-form', { title: 'Post a job', mode: 'new', job: {} });
});

// Create job
app.post('/admin/jobs', requireAuth, (req, res) => {
  db.createJob(req.body);
  res.redirect('/admin');
});

// Edit job form
app.get('/admin/jobs/:id/edit', requireAuth, (req, res) => {
  const job = db.job(req.params.id);
  if (!job) return res.redirect('/admin');
  res.render('admin/job-form', { title: 'Edit vacancy', mode: 'edit', job });
});

// Update job
app.post('/admin/jobs/:id', requireAuth, (req, res) => {
  db.updateJob(req.params.id, req.body);
  res.redirect('/admin');
});

// Toggle open/closed
app.post('/admin/jobs/:id/toggle', requireAuth, (req, res) => {
  db.toggleJob(req.params.id);
  res.redirect('/admin');
});

// Delete job
app.post('/admin/jobs/:id/delete', requireAuth, (req, res) => {
  db.deleteJob(req.params.id);
  res.redirect('/admin');
});

// Applications
app.get('/admin/applications', requireAuth, (req, res) => {
  const jobId = (req.query.job || '').toString();
  res.render('admin/applications', {
    title: 'Applications',
    applications: db.applications(jobId),
    jobs: db.jobs(),
    jobId,
  });
});

// Enquiries
app.get('/admin/messages', requireAuth, (req, res) => {
  res.render('admin/messages', { title: 'Enquiries', messages: db.messages() });
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
