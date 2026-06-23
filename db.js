/* =============================================================
   Venza Care UK — data store
   -------------------------------------------------------------
   SITE settings and the care-home directory live here as code
   (edit them directly). Jobs, applications and contact enquiries
   are persisted to data/db.json (auto-created and seeded on first
   run). Delete data/db.json to reset jobs/applications/enquiries
   back to the seed below.

   >>> PLACEHOLDER CONTENT <<<
   Homes, phone, email, address and imagery are realistic
   placeholders. Swap them for the real Venza Care UK details
   (London homes + Bedford) once confirmed.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------- Site-wide settings ---------- */
const SITE = {
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
const HOMES = [
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

/* ---------- Seed data for the JSON store ---------- */
function seed() {
  const now = Date.now();
  const day = 86400000;
  return {
    jobs: [
      {
        id: 'rn-croydon',
        title: 'Registered Nurse (RGN)',
        service: 'Nursing Care',
        location: 'London — Croydon',
        homeId: 'croydon-house',
        employmentType: 'Full-time',
        salary: '£38,000 – £44,000 per year',
        hours: '36 hours/week, days or nights',
        closingDate: '',
        summary: 'Lead person-centred nursing care for residents at Albany Lodge in Croydon.',
        description: 'We’re looking for a compassionate Registered Nurse to join the team at Albany Lodge in Croydon. You’ll assess, plan and deliver high-quality nursing care, supporting residents with a range of needs while leading and mentoring the care team on shift.',
        responsibilities: [
          'Assess, plan, implement and evaluate individual care',
          'Lead and support the care team on shift',
          'Manage medication safely and accurately',
          'Work closely with GPs, families and community health teams',
        ],
        requirements: [
          'Valid NMC PIN',
          'Right to work in the UK',
          'A caring, person-centred approach',
          'Experience in a care home or similar setting (desirable)',
        ],
        status: 'open',
        featured: true,
        postedAt: now - 3 * day,
      },
      {
        id: 'carer-ealing',
        title: 'Care Assistant',
        service: 'Residential Care',
        location: 'Sevenoaks',
        homeId: 'ealing-lodge',
        employmentType: 'Full-time',
        salary: '£12.60 – £13.40 per hour',
        hours: 'Full and part-time, days or nights',
        closingDate: '',
        summary: 'Help residents at Kippingtons live well, with kindness and dignity, every day.',
        description: 'As a Care Assistant at Kippingtons in Sevenoaks, you’ll support residents with daily living — washing, dressing, meals and companionship — helping them keep their independence and enjoy their day. No experience needed; we fund your Care Certificate.',
        responsibilities: [
          'Support residents with personal care and daily routines',
          'Help at mealtimes and with activities',
          'Build genuine relationships with residents and families',
          'Keep accurate care records',
        ],
        requirements: [
          'A warm, caring nature',
          'Right to work in the UK',
          'No experience required — full training given',
        ],
        status: 'open',
        featured: true,
        postedAt: now - 6 * day,
      },
      {
        id: 'senior-carer-bedford',
        title: 'Senior Care Assistant',
        service: 'Dementia Care',
        location: 'Mitcham',
        homeId: 'bedford-grange',
        employmentType: 'Full-time',
        salary: '£13.80 – £14.60 per hour',
        hours: '38.5 hours/week',
        closingDate: '',
        summary: 'Lead a dedicated care team in our dementia household at Fieldway in Mitcham.',
        description: 'We’re seeking an experienced Senior Care Assistant to help lead our dementia household at Fieldway in Mitcham. You’ll supervise shifts, support medication rounds and mentor newer carers, while delivering outstanding hands-on care.',
        responsibilities: [
          'Supervise and support the care team on shift',
          'Lead person-centred dementia care',
          'Administer medication in line with policy',
          'Mentor and induct new colleagues',
        ],
        requirements: [
          'NVQ/Diploma Level 3 in Health & Social Care (or working towards)',
          'Experience in dementia care',
          'Right to work in the UK',
        ],
        status: 'open',
        featured: false,
        postedAt: now - 9 * day,
      },
      {
        id: 'home-manager-enfield',
        title: 'Home Manager',
        service: 'Leadership',
        location: 'Newmarket',
        homeId: 'enfield-court',
        employmentType: 'Full-time',
        salary: '£55,000 – £65,000 per year',
        hours: '40 hours/week',
        closingDate: '',
        summary: 'Lead Kentford Manor, with full operational and clinical responsibility for the home.',
        description: 'An exciting opportunity for an experienced Home Manager to lead Kentford Manor near Newmarket. You’ll hold overall responsibility for the home’s quality, compliance, people and commercial performance, ensuring outstanding care for every resident.',
        responsibilities: [
          'Lead all aspects of the home’s operation',
          'Ensure CQC compliance and continuous improvement',
          'Develop, support and retain a high-performing team',
          'Build relationships with families, commissioners and the community',
        ],
        requirements: [
          'Proven registered manager experience',
          'NMC PIN or relevant management qualification',
          'Strong knowledge of CQC standards',
          'Right to work in the UK',
        ],
        status: 'open',
        featured: false,
        postedAt: now - 12 * day,
      },
      {
        id: 'chef-croydon',
        title: 'Head Chef',
        service: 'Hospitality & Support',
        location: 'London — Croydon',
        homeId: 'croydon-house',
        employmentType: 'Full-time',
        salary: '£32,000 per year',
        hours: '40 hours/week',
        closingDate: '',
        summary: 'Create nutritious, delicious meals residents look forward to at Albany Lodge.',
        description: 'We’re looking for a Head Chef to lead the kitchen at Albany Lodge in Croydon. You’ll design seasonal menus, cater for special dietary needs and create the kind of food that makes mealtimes a highlight of the day.',
        responsibilities: [
          'Plan and cook fresh, seasonal menus',
          'Cater for special diets (texture-modified, diabetic, etc.)',
          'Manage kitchen stock, budgets and food safety',
          'Lead and develop the kitchen team',
        ],
        requirements: [
          'Professional cookery qualification',
          'Experience catering for special diets (desirable)',
          'Food hygiene certificate',
          'Right to work in the UK',
        ],
        status: 'open',
        featured: false,
        postedAt: now - 15 * day,
      },
      {
        id: 'activities-bedford',
        title: 'Activities Coordinator',
        service: 'Hospitality & Support',
        location: 'Mitcham',
        homeId: 'bedford-grange',
        employmentType: 'Part-time',
        salary: '£12.80 per hour',
        hours: '24 hours/week',
        closingDate: '',
        summary: 'Bring energy, fun and meaning to residents’ days at Fieldway in Mitcham.',
        description: 'Help our Fieldway residents in Mitcham live full, engaged lives. You’ll plan and run a varied programme of activities and outings shaped around what residents actually enjoy — from gardening and music to trips out and one-to-one time.',
        responsibilities: [
          'Plan and deliver a varied activities programme',
          'Organise outings and special events',
          'Support residents one-to-one, including those living with dementia',
          'Involve families and the local community',
        ],
        requirements: [
          'Creative, energetic and warm',
          'Experience in a similar role (desirable)',
          'Right to work in the UK',
        ],
        status: 'open',
        featured: false,
        postedAt: now - 18 * day,
      },
    ],
    applications: [],
    messages: [],
  };
}

/* ---------- Persistence ---------- */
let store;

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      store = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // make sure all collections exist
      store.jobs = store.jobs || [];
      store.applications = store.applications || [];
      store.messages = store.messages || [];
    } else {
      store = seed();
      save();
    }
  } catch (err) {
    console.error('Could not read data/db.json, reseeding:', err.message);
    store = seed();
    save();
  }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

load();

/* ---------- Public API ---------- */
module.exports = {
  SITE,

  /* Headline figures — computed from real site data so they're always accurate.
     (No invented numbers. If you want to publish a "residents cared for" figure,
     set residentsServed to the real number and surface it in the views.) */
  siteStats() {
    const careTypeSet = new Set();
    HOMES.forEach((h) => (h.careTypes || []).forEach((c) => careTypeSet.add(c)));
    return {
      homes: HOMES.length,
      beds: HOMES.reduce((sum, h) => sum + (h.beds || 0), 0),
      towns: new Set(HOMES.map((h) => h.town)).size,
      regions: SITE.regions.length,
      careTypes: careTypeSet.size,
      openJobs: HOMES.length ? store.jobs.filter((j) => j.status === 'open').length : 0,
      residentsServed: null,
    };
  },

  /* Homes */
  homes: () => HOMES,
  home: (id) => HOMES.find((h) => h.id === id),
  filterHomes({ q = '', region = '', careType = '' } = {}) {
    const needle = q.trim().toLowerCase();
    return HOMES.filter((h) => {
      const matchesQ =
        !needle ||
        h.town.toLowerCase().includes(needle) ||
        h.name.toLowerCase().includes(needle) ||
        h.postcode.toLowerCase().replace(/\s/g, '').includes(needle.replace(/\s/g, ''));
      const matchesRegion = !region || h.region === region;
      const matchesCare = !careType || h.careTypes.includes(careType);
      return matchesQ && matchesRegion && matchesCare;
    });
  },

  /* Jobs */
  jobs: () => store.jobs.slice().sort((a, b) => b.postedAt - a.postedAt),
  openJobs() {
    return this.jobs().filter((j) => j.status === 'open');
  },
  job: (id) => store.jobs.find((j) => j.id === id),
  jobsForHome(homeId) {
    return this.openJobs().filter((j) => j.homeId === homeId);
  },
  jobLocations() {
    return [...new Set(store.jobs.map((j) => j.location).filter(Boolean))].sort();
  },
  createJob(data) {
    const job = {
      id: uid('job'),
      title: data.title || 'Untitled role',
      service: data.service || 'Residential Care',
      location: data.location || '',
      homeId: data.homeId || '',
      employmentType: data.employmentType || 'Full-time',
      salary: data.salary || '',
      hours: data.hours || '',
      closingDate: data.closingDate || '',
      summary: data.summary || '',
      description: data.description || '',
      responsibilities: splitLines(data.responsibilities),
      requirements: splitLines(data.requirements),
      status: data.status === 'closed' ? 'closed' : 'open',
      featured: !!data.featured,
      postedAt: Date.now(),
    };
    store.jobs.push(job);
    save();
    return job;
  },
  updateJob(id, data) {
    const job = this.job(id);
    if (!job) return null;
    Object.assign(job, {
      title: data.title || job.title,
      service: data.service || job.service,
      location: data.location || job.location,
      homeId: data.homeId !== undefined ? data.homeId : job.homeId,
      employmentType: data.employmentType || job.employmentType,
      salary: data.salary || '',
      hours: data.hours || '',
      closingDate: data.closingDate || '',
      summary: data.summary || job.summary,
      description: data.description || job.description,
      responsibilities: splitLines(data.responsibilities),
      requirements: splitLines(data.requirements),
      status: data.status === 'closed' ? 'closed' : 'open',
      featured: !!data.featured,
    });
    save();
    return job;
  },
  toggleJob(id) {
    const job = this.job(id);
    if (!job) return null;
    job.status = job.status === 'open' ? 'closed' : 'open';
    save();
    return job;
  },
  deleteJob(id) {
    store.jobs = store.jobs.filter((j) => j.id !== id);
    store.applications = store.applications.filter((a) => a.jobId !== id);
    save();
  },

  /* Applications */
  applications(jobId) {
    let list = store.applications.slice().sort((a, b) => b.appliedAt - a.appliedAt);
    if (jobId) list = list.filter((a) => a.jobId === jobId);
    return list;
  },
  applicationCounts() {
    const counts = {};
    store.applications.forEach((a) => {
      counts[a.jobId] = (counts[a.jobId] || 0) + 1;
    });
    return counts;
  },
  addApplication(data) {
    const app = {
      id: uid('app'),
      jobId: data.jobId,
      jobTitle: data.jobTitle || '',
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      rightToWork: data.rightToWork || '',
      message: data.message || '',
      cvFilename: data.cvFilename || '',
      appliedAt: Date.now(),
    };
    store.applications.push(app);
    save();
    return app;
  },

  /* Messages / enquiries */
  messages() {
    return store.messages.slice().sort((a, b) => b.createdAt - a.createdAt);
  },
  addMessage(data) {
    const msg = {
      id: uid('msg'),
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      subject: data.subject || '',
      message: data.message || '',
      createdAt: Date.now(),
    };
    store.messages.push(msg);
    save();
    return msg;
  },

  /* Dashboard stats */
  stats() {
    return {
      open: store.jobs.filter((j) => j.status === 'open').length,
      closed: store.jobs.filter((j) => j.status === 'closed').length,
      applications: store.applications.length,
      messages: store.messages.length,
    };
  },
};

function splitLines(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val !== 'string') return [];
  return val
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
