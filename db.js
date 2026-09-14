/* =============================================================
   Venza Care UK — data layer
   -------------------------------------------------------------
   Two interchangeable backends behind one async API:

     • Postgres  — used when DATABASE_URL is set (Supabase in
                   production). The real store: survives restarts,
                   shared across serverless instances.
     • JSON file — the fallback for local development with no
                   database configured. Writes to data/db.json.

   Everything below the backends is shared, so both behave
   identically. All read/write functions are async.

   Site settings and the care-home directory live in the database
   once migrated (see scripts/migrate.js); the DEFAULT_* values
   here are only the starting point that migration copies in.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const DEFAULT_SITE = {
  name: 'Venza Care UK',
  phone: '0800 470 1925',
  email: 'enquiries@venzacare.co.uk',
  address: 'Venza Care UK Ltd, 1 Croydon Gateway, Croydon CR0 2AB',
  regions: ['London', 'Kent', 'Cambridgeshire'],
};

/* ---------- Care-home directory ----------
   careTypes options used across the site:
   'Residential Care','Nursing Care','Dementia Care',
   'Respite Care','End-of-life Care'
   cqc: 'Outstanding' | 'Good' | 'Registered' (anything else = "registered")
*/
const DEFAULT_HOMES = [
  {
    id: 'croydon-house',
    name: 'Albany Lodge',
    town: 'Croydon',
    postcode: 'CR0 2BZ',
    region: 'London',
    lat: 51.3727,
    lng: -0.1099,
    beds: 100,
    cqc: 'Registered',
    careTypes: ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'],
    blurb: 'One of our largest homes, a warm and busy place in the heart of Croydon, offering residential, nursing and dementia care for up to 100 residents.',
    photo: 'albany/exterior.webp',
    dementiaNote: 'Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.',
    specialisms: ['Parkinson’s disease', 'Stroke recovery', 'COPD & pulmonary disease', 'Convalescent care', 'Mental health support', 'Physical disability', 'Visual & hearing impairment'],
    gallery: ['albany/01.webp', 'albany/02.webp', 'albany/03.webp', 'albany/04.webp'],
  },
  {
    id: 'ealing-lodge',
    name: 'Kippingtons',
    town: 'Sevenoaks',
    postcode: 'TN13 2PG',
    region: 'Kent',
    lat: 51.2722,
    lng: 0.1900,
    beds: 55,
    cqc: 'Good',
    careTypes: ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'],
    blurb: 'A welcoming care home set in a characterful manor in the heart of Sevenoaks, offering residential, nursing and dementia care.',
    photo: 'kippingtons/exterior.webp',
    dementiaNote: 'Residential and nursing dementia care, for people living with mild to moderate dementia.',
    specialisms: ['Parkinson’s disease', 'Stroke recovery', 'COPD & pulmonary disease', 'Convalescent care', 'Acquired brain injury (ABI)'],
    gallery: ['kippingtons/01.webp', 'kippingtons/02.webp', 'kippingtons/03.webp', 'kippingtons/04.webp', 'kippingtons/05.webp', 'kippingtons/06.webp', 'kippingtons/07.webp', 'kippingtons/08.webp', 'kippingtons/09.webp', 'kippingtons/10.webp', 'kippingtons/11.webp'],
  },
  {
    id: 'enfield-court',
    name: 'Kentford Manor',
    town: 'Newmarket',
    postcode: 'CB8 8JY',
    region: 'Cambridgeshire',
    lat: 52.2453,
    lng: 0.4040,
    beds: 88,
    cqc: 'Good',
    careTypes: ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'],
    blurb: 'A spacious, modern home near Newmarket offering residential, nursing, dementia and end-of-life care.',
    photo: 'kentford/exterior.webp',
    dementiaNote: 'Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.',
    specialisms: ['Convalescent care', 'Physical disability'],
    gallery: ['kentford/01.webp', 'kentford/02.webp', 'kentford/03.webp', 'kentford/04.webp', 'kentford/05.webp', 'kentford/06.webp', 'kentford/07.webp', 'kentford/08.webp', 'kentford/09.webp', 'kentford/10.webp', 'kentford/11.webp', 'kentford/12.webp', 'kentford/13.webp', 'kentford/14.webp', 'kentford/15.webp', 'kentford/16.webp', 'kentford/17.webp'],
  },
  {
    id: 'bedford-grange',
    name: 'Fieldway',
    town: 'Mitcham',
    postcode: 'CR4 4SJ',
    region: 'London',
    lat: 51.4006,
    lng: -0.1540,
    beds: 68,
    cqc: 'Good',
    careTypes: ['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care'],
    blurb: 'A friendly home in Mitcham offering residential, nursing and dementia care, with a dedicated dementia floor.',
    photo: 'fieldway/exterior.webp',
    dementiaNote: 'Residential and nursing dementia care, for people living with moderate dementia. Fieldway has a dedicated dementia floor.',
    specialisms: ['Parkinson’s disease', 'Stroke recovery', 'Convalescent care', 'Physical disability', 'Visual & hearing impairment'],
    gallery: ['fieldway/01.webp', 'fieldway/02.webp', 'fieldway/03.webp', 'fieldway/04.webp', 'fieldway/05.webp', 'fieldway/06.webp'],
  },
];

/* ---------- Small helpers ---------- */
function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function splitLines(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val !== 'string') return [];
  return val.split('\n').map((s) => s.trim()).filter(Boolean);
}

function toArray(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string' && val.trim()) return splitLines(val);
  return [];
}

function num(val, fallback = null) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return Number.isFinite(n) ? n : fallback;
}

/* =============================================================
   Backend A — Postgres (Supabase in production)
   ============================================================= */
function createPgBackend(connectionString) {
  const { Pool } = require('pg');

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new Pool({
    connectionString,
    // Supabase's pooler presents a certificate that isn't in Node's default
    // trust store, so verification is relaxed. The connection is still
    // TLS-encrypted. Local development connects without TLS at all.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 3, // serverless instances are short-lived; a small pool is plenty
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  const q = (text, params) => pool.query(text, params);

  /* Rows come back snake_case; the rest of the app speaks camelCase. */
  const toHome = (r) => ({
    id: r.id,
    name: r.name,
    town: r.town,
    postcode: r.postcode,
    region: r.region,
    lat: r.lat,
    lng: r.lng,
    beds: r.beds,
    cqc: r.cqc,
    careTypes: r.care_types || [],
    specialisms: r.specialisms || [],
    blurb: r.blurb,
    dementiaNote: r.dementia_note,
    photo: r.photo,
    gallery: r.gallery || [],
    sortOrder: r.sort_order,
  });

  const toJob = (r) => ({
    id: r.id,
    title: r.title,
    service: r.service,
    location: r.location,
    homeId: r.home_id || '',
    employmentType: r.employment_type,
    salary: r.salary,
    hours: r.hours,
    closingDate: r.closing_date,
    summary: r.summary,
    description: r.description,
    responsibilities: r.responsibilities || [],
    requirements: r.requirements || [],
    status: r.status,
    featured: r.featured,
    postedAt: r.posted_at,
  });

  const toApplication = (r) => ({
    id: r.id,
    jobId: r.job_id || '',
    jobTitle: r.job_title,
    name: r.name,
    email: r.email,
    phone: r.phone,
    rightToWork: r.right_to_work,
    message: r.message,
    cvFilename: r.cv_filename,
    cvPath: r.cv_path,
    status: r.status,
    notes: r.notes,
    appliedAt: r.applied_at,
  });

  const toMessage = (r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    email: r.email,
    phone: r.phone,
    subject: r.subject,
    message: r.message,
    bestTime: r.best_time,
    home: r.home,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
  });

  return {
    kind: 'postgres',

    async getSettings() {
      const { rows } = await q("select value from settings where key = 'site'");
      return rows.length ? rows[0].value : null;
    },
    async setSettings(value) {
      await q(
        `insert into settings (key, value, updated_at) values ('site', $1, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(value)]
      );
      return value;
    },

    async allHomes() {
      const { rows } = await q('select * from homes order by sort_order, name');
      return rows.map(toHome);
    },
    async upsertHome(h) {
      const { rows } = await q(
        `insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                            care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         on conflict (id) do update set
           name = excluded.name, town = excluded.town, postcode = excluded.postcode,
           region = excluded.region, lat = excluded.lat, lng = excluded.lng,
           beds = excluded.beds, cqc = excluded.cqc, care_types = excluded.care_types,
           specialisms = excluded.specialisms, blurb = excluded.blurb,
           dementia_note = excluded.dementia_note, photo = excluded.photo,
           gallery = excluded.gallery, sort_order = excluded.sort_order, updated_at = now()
         returning *`,
        [h.id, h.name, h.town || '', h.postcode || '', h.region || '', h.lat, h.lng,
         h.beds, h.cqc || 'Registered', toArray(h.careTypes), toArray(h.specialisms),
         h.blurb || '', h.dementiaNote || '', h.photo || '', toArray(h.gallery), h.sortOrder || 0]
      );
      return toHome(rows[0]);
    },
    async deleteHome(id) {
      await q('delete from homes where id = $1', [id]);
    },

    async allJobs() {
      const { rows } = await q('select * from jobs order by posted_at desc');
      return rows.map(toJob);
    },
    async insertJob(j) {
      const { rows } = await q(
        `insert into jobs (id, title, service, location, home_id, employment_type, salary, hours,
                           closing_date, summary, description, responsibilities, requirements,
                           status, featured, posted_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, coalesce($16, now()))
         returning *`,
        [j.id, j.title, j.service, j.location, j.homeId || null, j.employmentType, j.salary,
         j.hours, j.closingDate, j.summary, j.description, toArray(j.responsibilities),
         toArray(j.requirements), j.status, j.featured, j.postedAt || null]
      );
      return toJob(rows[0]);
    },
    async updateJobRow(id, j) {
      const { rows } = await q(
        `update jobs set title=$2, service=$3, location=$4, home_id=$5, employment_type=$6,
                         salary=$7, hours=$8, closing_date=$9, summary=$10, description=$11,
                         responsibilities=$12, requirements=$13, status=$14, featured=$15,
                         updated_at = now()
         where id = $1 returning *`,
        [id, j.title, j.service, j.location, j.homeId || null, j.employmentType, j.salary,
         j.hours, j.closingDate, j.summary, j.description, toArray(j.responsibilities),
         toArray(j.requirements), j.status, j.featured]
      );
      return rows.length ? toJob(rows[0]) : null;
    },
    async setJobStatus(id, status) {
      const { rows } = await q(
        'update jobs set status = $2, updated_at = now() where id = $1 returning *',
        [id, status]
      );
      return rows.length ? toJob(rows[0]) : null;
    },
    async deleteJobRow(id) {
      await q('delete from jobs where id = $1', [id]);
    },

    async allApplications(jobId) {
      const { rows } = jobId
        ? await q('select * from applications where job_id = $1 order by applied_at desc', [jobId])
        : await q('select * from applications order by applied_at desc');
      return rows.map(toApplication);
    },
    async countApplicationsByJob() {
      const { rows } = await q('select job_id, count(*)::int as n from applications group by job_id');
      const counts = {};
      rows.forEach((r) => { if (r.job_id) counts[r.job_id] = r.n; });
      return counts;
    },
    async insertApplication(a) {
      const { rows } = await q(
        `insert into applications (id, job_id, job_title, name, email, phone, right_to_work,
                                   message, cv_filename, cv_path, status, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [a.id, a.jobId || null, a.jobTitle, a.name, a.email, a.phone, a.rightToWork,
         a.message, a.cvFilename, a.cvPath || '', a.status || 'new', a.notes || '']
      );
      return toApplication(rows[0]);
    },

    async allMessages() {
      const { rows } = await q('select * from messages order by created_at desc');
      return rows.map(toMessage);
    },
    async insertMessage(m) {
      const { rows } = await q(
        `insert into messages (id, kind, name, email, phone, subject, message, best_time, home, status, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
        [m.id, m.kind || 'enquiry', m.name, m.email, m.phone, m.subject, m.message,
         m.bestTime || '', m.home || '', m.status || 'new', m.notes || '']
      );
      return toMessage(rows[0]);
    },

    async counts() {
      const { rows } = await q(`
        select
          (select count(*) from jobs where status = 'open')::int   as open_jobs,
          (select count(*) from jobs where status = 'closed')::int as closed_jobs,
          (select count(*) from applications)::int                 as applications,
          (select count(*) from messages)::int                     as messages
      `);
      const r = rows[0];
      return { open: r.open_jobs, closed: r.closed_jobs, applications: r.applications, messages: r.messages };
    },

    async close() { await pool.end(); },
  };
}

/* =============================================================
   Backend B — JSON file (local development fallback)
   -------------------------------------------------------------
   Used only when DATABASE_URL is unset. On a read-only or
   ephemeral filesystem this keeps data in memory for the life of
   the process, which is fine for `npm run dev` and useless in
   production — hence the warning at startup.
   ============================================================= */
function createFileBackend() {
  const DATA_DIR = path.join(process.env.VERCEL ? '/tmp' : __dirname, 'data');
  const DB_FILE = path.join(DATA_DIR, 'db.json');

  let store = { settings: null, homes: [], jobs: [], applications: [], messages: [] };

  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      store = Object.assign(store, parsed);
      ['homes', 'jobs', 'applications', 'messages'].forEach((k) => {
        if (!Array.isArray(store[k])) store[k] = [];
      });
    }
  } catch (err) {
    console.error('[db] could not read data/db.json, starting empty:', err.message);
  }

  /* First run with no database: start from the care homes and settings defined
     in this file, so `npm start` shows a working site. Vacancies are never
     seeded — the careers board starts empty and is filled in via the admin. */
  if (!store.homes.length && !store.settings) {
    store.settings = Object.assign({}, DEFAULT_SITE);
    store.homes = DEFAULT_HOMES.map((h, i) => Object.assign({}, h, { sortOrder: i }));
  }

  function save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
    } catch (err) {
      /* Read-only filesystem — in-memory only. */
    }
  }

  const byId = (list, id) => list.find((x) => x.id === id);

  return {
    kind: 'file',

    async getSettings() { return store.settings; },
    async setSettings(value) { store.settings = value; save(); return value; },

    async allHomes() {
      return store.homes.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
    },
    async upsertHome(h) {
      const home = {
        id: h.id, name: h.name, town: h.town || '', postcode: h.postcode || '',
        region: h.region || '', lat: h.lat, lng: h.lng, beds: h.beds,
        cqc: h.cqc || 'Registered', careTypes: toArray(h.careTypes),
        specialisms: toArray(h.specialisms), blurb: h.blurb || '',
        dementiaNote: h.dementiaNote || '', photo: h.photo || '',
        gallery: toArray(h.gallery), sortOrder: h.sortOrder || 0,
      };
      const existing = byId(store.homes, h.id);
      if (existing) Object.assign(existing, home);
      else store.homes.push(home);
      save();
      return home;
    },
    async deleteHome(id) {
      store.homes = store.homes.filter((h) => h.id !== id);
      save();
    },

    async allJobs() {
      return store.jobs.slice().sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
    },
    async insertJob(j) {
      const job = Object.assign({}, j, {
        responsibilities: toArray(j.responsibilities),
        requirements: toArray(j.requirements),
        postedAt: j.postedAt || new Date(),
      });
      store.jobs.push(job);
      save();
      return job;
    },
    async updateJobRow(id, j) {
      const job = byId(store.jobs, id);
      if (!job) return null;
      Object.assign(job, j, {
        responsibilities: toArray(j.responsibilities),
        requirements: toArray(j.requirements),
      });
      save();
      return job;
    },
    async setJobStatus(id, status) {
      const job = byId(store.jobs, id);
      if (!job) return null;
      job.status = status;
      save();
      return job;
    },
    async deleteJobRow(id) {
      store.jobs = store.jobs.filter((j) => j.id !== id);
      store.applications = store.applications.filter((a) => a.jobId !== id);
      save();
    },

    async allApplications(jobId) {
      let list = store.applications.slice().sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
      if (jobId) list = list.filter((a) => a.jobId === jobId);
      return list;
    },
    async countApplicationsByJob() {
      const counts = {};
      store.applications.forEach((a) => { if (a.jobId) counts[a.jobId] = (counts[a.jobId] || 0) + 1; });
      return counts;
    },
    async insertApplication(a) {
      const app = Object.assign({ status: 'new', notes: '', cvPath: '' }, a, { appliedAt: a.appliedAt || new Date() });
      store.applications.push(app);
      save();
      return app;
    },

    async allMessages() {
      return store.messages.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    async insertMessage(m) {
      const msg = Object.assign({ kind: 'enquiry', status: 'new', notes: '', bestTime: '', home: '' }, m, {
        createdAt: m.createdAt || new Date(),
      });
      store.messages.push(msg);
      save();
      return msg;
    },

    async counts() {
      return {
        open: store.jobs.filter((j) => j.status === 'open').length,
        closed: store.jobs.filter((j) => j.status === 'closed').length,
        applications: store.applications.length,
        messages: store.messages.length,
      };
    },

    async close() {},
  };
}

/* =============================================================
   Backend selection
   ============================================================= */
const backend = process.env.DATABASE_URL
  ? createPgBackend(process.env.DATABASE_URL)
  : createFileBackend();

if (backend.kind === 'file' && process.env.NODE_ENV === 'production') {
  console.warn(
    '[db] WARNING: no DATABASE_URL set. Running on the JSON-file store, which does NOT\n' +
    '     persist on serverless hosts — vacancies, applications and enquiries will be lost.\n' +
    '     Set DATABASE_URL to your Supabase connection string.'
  );
}

/* =============================================================
   Shared layer — identical behaviour on either backend
   -------------------------------------------------------------
   Settings and homes change rarely and are read on nearly every
   page, so they get a short in-process cache. Writes clear it.
   ============================================================= */
const CACHE_MS = 30000;
const cache = { settings: null, settingsAt: 0, homes: null, homesAt: 0 };
const fresh = (at) => Date.now() - at < CACHE_MS;

function clearCache() {
  cache.settings = null; cache.settingsAt = 0;
  cache.homes = null; cache.homesAt = 0;
}

async function settings() {
  if (cache.settings && fresh(cache.settingsAt)) return cache.settings;
  let value = null;
  try {
    value = await backend.getSettings();
  } catch (err) {
    console.error('[db] settings lookup failed, using defaults:', err.message);
  }
  cache.settings = Object.assign({}, DEFAULT_SITE, value || {});
  cache.settingsAt = Date.now();
  return cache.settings;
}

async function saveSettings(patch) {
  const current = await settings();
  const next = Object.assign({}, current, patch);
  await backend.setSettings(next);
  clearCache();
  return next;
}

async function homes() {
  if (cache.homes && fresh(cache.homesAt)) return cache.homes;
  const list = await backend.allHomes();
  cache.homes = list;
  cache.homesAt = Date.now();
  return list;
}

async function home(id) {
  return (await homes()).find((h) => h.id === id) || null;
}

async function saveHome(data) {
  const saved = await backend.upsertHome(Object.assign({ id: data.id || uid('home') }, data));
  clearCache();
  return saved;
}

async function removeHome(id) {
  await backend.deleteHome(id);
  clearCache();
}

async function filterHomes({ q = '', region = '', careType = '' } = {}) {
  const needle = q.trim().toLowerCase();
  const flat = (s) => (s || '').toLowerCase().replace(/\s/g, '');
  return (await homes()).filter((h) => {
    const matchesQ =
      !needle ||
      (h.town || '').toLowerCase().includes(needle) ||
      (h.name || '').toLowerCase().includes(needle) ||
      flat(h.postcode).includes(flat(needle));
    const matchesRegion = !region || h.region === region;
    const matchesCare = !careType || (h.careTypes || []).includes(careType);
    return matchesQ && matchesRegion && matchesCare;
  });
}

async function siteStats() {
  const list = await homes();
  const site = await settings();
  const careTypeSet = new Set();
  list.forEach((h) => (h.careTypes || []).forEach((c) => careTypeSet.add(c)));
  const open = (await jobs()).filter((j) => j.status === 'open').length;
  return {
    homes: list.length,
    beds: list.reduce((sum, h) => sum + (h.beds || 0), 0),
    towns: new Set(list.map((h) => h.town)).size,
    regions: (site.regions || []).length,
    careTypes: careTypeSet.size,
    openJobs: open,
    residentsServed: null,
  };
}

/* ---------- Jobs ---------- */
async function jobs() { return backend.allJobs(); }

async function openJobs() {
  return (await jobs()).filter((j) => j.status === 'open');
}

async function job(id) {
  return (await jobs()).find((j) => j.id === id) || null;
}

async function jobsForHome(homeId) {
  return (await openJobs()).filter((j) => j.homeId === homeId);
}

async function jobLocations() {
  return [...new Set((await jobs()).map((j) => j.location).filter(Boolean))].sort();
}

function jobFromForm(data, existing) {
  const base = existing || {};
  return {
    title: data.title || base.title || 'Untitled role',
    service: data.service || base.service || 'Residential Care',
    location: data.location || base.location || '',
    homeId: data.homeId !== undefined ? data.homeId : (base.homeId || ''),
    employmentType: data.employmentType || base.employmentType || 'Full-time',
    salary: data.salary || '',
    hours: data.hours || '',
    closingDate: data.closingDate || '',
    summary: data.summary || base.summary || '',
    description: data.description || base.description || '',
    responsibilities: splitLines(data.responsibilities),
    requirements: splitLines(data.requirements),
    status: data.status === 'closed' ? 'closed' : 'open',
    featured: !!data.featured,
  };
}

async function createJob(data) {
  return backend.insertJob(Object.assign({ id: uid('job'), postedAt: new Date() }, jobFromForm(data)));
}

async function updateJob(id, data) {
  const existing = await job(id);
  if (!existing) return null;
  return backend.updateJobRow(id, jobFromForm(data, existing));
}

async function toggleJob(id) {
  const existing = await job(id);
  if (!existing) return null;
  return backend.setJobStatus(id, existing.status === 'open' ? 'closed' : 'open');
}

async function deleteJob(id) { return backend.deleteJobRow(id); }

/* ---------- Applications ---------- */
async function applications(jobId) { return backend.allApplications(jobId); }
async function applicationCounts() { return backend.countApplicationsByJob(); }

async function addApplication(data) {
  return backend.insertApplication({
    id: uid('app'),
    jobId: data.jobId,
    jobTitle: data.jobTitle || '',
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    rightToWork: data.rightToWork || '',
    message: data.message || '',
    cvFilename: data.cvFilename || '',
    cvPath: data.cvPath || '',
  });
}

/* ---------- Messages / enquiries ---------- */
async function messages() { return backend.allMessages(); }

async function addMessage(data) {
  return backend.insertMessage({
    id: uid('msg'),
    kind: data.kind === 'callback' ? 'callback' : 'enquiry',
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    subject: data.subject || '',
    message: data.message || '',
    bestTime: data.bestTime || '',
    home: data.home || '',
  });
}

/* ---------- Dashboard ---------- */
async function stats() { return backend.counts(); }

module.exports = {
  DEFAULT_SITE,
  DEFAULT_HOMES,
  backendKind: backend.kind,

  settings, saveSettings,
  homes, home, saveHome, removeHome, filterHomes, siteStats,
  jobs, openJobs, job, jobsForHome, jobLocations, createJob, updateJob, toggleJob, deleteJob,
  applications, applicationCounts, addApplication,
  messages, addMessage,
  stats,
  close: () => backend.close(),
};
