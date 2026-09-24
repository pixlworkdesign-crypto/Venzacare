/* =============================================================
   Staff hub — every /admin page
   -------------------------------------------------------------
   Sign-in, the people & access screens, homes, enquiries, jobs,
   applications, the noticeboard, documents, certificates, the
   staff directory and the activity log.

   Every route checks two things on the server, whatever the page
   shows: the person's level for the area (none / view / edit),
   and whether they cover the home the thing belongs to.
   ============================================================= */

const path = require('path');
const multer = require('multer');
const db = require('../db');
const storage = require('../storage');
const mailer = require('../mailer');
const visits = require('../visits');
const auth = require('./auth');
const access = require('./access');

const { AREAS, PRESETS, PRESET_NAMES, MANAGER_PRESETS, LEVEL_WORDS, BUILTIN_OWNER, can, covers, isCustom, homesLabel } = access;

const CQC_OPTIONS = ['Outstanding', 'Good', 'Requires improvement', 'Inadequate', 'Registered'];
const STEPS = ['New', 'Called', 'Visit booked', 'Visited', 'Moved in'];
const NEXT_STEP = { New: 'Called', Called: 'Visit booked', 'Visit booked': 'Visited', Visited: 'Moved in' };
const STEP_WORDS = { New: 'Needs a call', Called: 'Called', 'Visit booked': 'Visit booked', Visited: 'Visited', 'Moved in': 'Moved in', 'Not going ahead': 'Not going ahead' };
const DOC_FOLDERS = ['Policies', 'Staff handbook', 'Forms', 'Training', 'Managers'];
const DOC_TYPES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.txt', '.rtf', '.jpg', '.jpeg', '.png'];
const CERT_TYPES = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.webp', '.doc', '.docx'];

const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 500);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'home';

function uploader(types) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, types.includes(path.extname(file.originalname).toLowerCase())),
  });
}
const docUpload = uploader(DOC_TYPES);
const certUpload = uploader(CERT_TYPES);
const csvUpload = uploader(['.csv', '.txt']);
const photoUpload = uploader(['.jpg', '.jpeg', '.png', '.webp', '.avif']).fields([
  { name: 'photoFile', maxCount: 1 },
  { name: 'galleryFiles', maxCount: 20 },
]);

/* Map position from a UK postcode (postcodes.io, free, no key). Best effort. */
async function geocode(postcode) {
  const pc = String(postcode || '').replace(/\s+/g, '');
  if (!pc) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc), { signal: ctl.signal });
    clearTimeout(t);
    const d = r.ok ? await r.json() : null;
    return d && d.result ? { lat: d.result.latitude, lng: d.result.longitude } : null;
  } catch (e) { return null; }
}

module.exports = function mountHub(app, deps) {
  const { wrap, siteUrl, CARE_TYPES, config } = deps;
  const { ADMIN_USER, ADMIN_PASS, SESSION_SECRET, SEALED, sealedHint } = config;

  /* ---------- Shared helpers ---------- */
  async function log(actor, textLine) {
    await db.records.put('activity', db.uid('act'), {
      at: new Date().toISOString(),
      actorId: actor ? actor.id : '',
      actorName: actor ? actor.name : 'System',
      text: textLine,
    });
  }

  function deny(res, message) {
    res.status(403).render('hub/denied', { title: 'Not available', message: message || 'Your access doesn’t include this page. Ask an admin if you need it.' });
  }

  // Middleware: must be signed in (and, optionally, have a level for an area).
  function need(area, level) {
    return wrap(async (req, res, next) => {
      if (SEALED) return res.status(503).render('admin/login', { error: sealedHint(), showDemo: false, notice: null, identifier: '' });
      const me = await auth.currentUser(req, SESSION_SECRET);
      if (!me) return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
      req.me = me;
      retentionSweep(me); // at most once a day; never blocks the page
      await shellLocals(req, res);
      if (area && !(Array.isArray(area) ? area.some((a) => can(me, a, level)) : can(me, area, level))) return deny(res);
      next();
    });
  }

  async function shellLocals(req, res) {
    const me = req.me;
    const [posts, reads] = await Promise.all([visiblePosts(me), db.records.list('post_reads')]);
    const readSet = new Set(reads.filter((r) => r.userId === me.id).map((r) => r.postId));
    let newEnquiries = 0;
    if (can(me, 'enquiries', 'view')) {
      newEnquiries = (await enquiryList(me)).filter((e) => e.stage === 'New').length;
    }
    Object.assign(res.locals, {
      me,
      hubCan: (a, l) => can(me, a, l),
      navCounts: {
        noticeboard: posts.filter((p) => p.mustRead && !readSet.has(p.id)).length,
        enquiries: newEnquiries,
      },
      homesLabel: (u) => homesLabel(u, res.locals.hubHomes),
      hubHomes: await db.allHomes(),
      AREAS, PRESETS, PRESET_NAMES, LEVEL_WORDS, STEP_WORDS, STEPS,
      mailOn: mailer.configured(),
      flash: req.query.done || '',
    });
  }

  function back(res, url, message) {
    res.redirect(url + (url.includes('?') ? '&' : '?') + 'done=' + encodeURIComponent(message));
  }

  // Can `viewer` see things belonging to `person`? (same home, or company-wide)
  function coversPerson(viewer, person) {
    if (viewer.homes === 'all') return true;
    if (person.homes === 'all') return false;
    return (person.homes || []).some((h) => covers(viewer, h));
  }

  const homeIdByName = async (name) => {
    const h = (await db.allHomes()).find((x) => x.name === name);
    return h ? h.id : '';
  };

  /* ---------- Sign in / out ---------- */
  app.get('/admin/login', wrap(async (req, res) => {
    if (SEALED) return res.status(503).render('admin/login', { error: sealedHint(), showDemo: false, notice: null, identifier: '' });
    if (await auth.currentUser(req, SESSION_SECRET)) return res.redirect('/admin');
    res.render('admin/login', {
      error: null, identifier: '',
      notice: req.query.done || null,
      showDemo: !config.IS_PROD,
    });
  }));

  app.post('/admin/login', wrap(async (req, res) => {
    if (SEALED) return res.status(503).render('admin/login', { error: sealedHint(), showDemo: false, notice: null, identifier: '' });
    const identifier = text(req.body.identifier || req.body.username, 200);
    const password = String(req.body.password || '');
    const fail = (msg) => res.status(401).render('admin/login', { error: msg, identifier, notice: null, showDemo: !config.IS_PROD });

    if (auth.isLockedOut(req, identifier)) return fail('Too many wrong attempts. Wait 15 minutes, or ask a manager to send you a new sign-in link.');

    // Emergency owner login from the hosting settings.
    if (ADMIN_PASS && identifier.toLowerCase() === ADMIN_USER.toLowerCase() && deps.sameText(password, ADMIN_PASS)) {
      auth.clearFailures(req, identifier);
      auth.setSessionCookie(res, SESSION_SECRET, BUILTIN_OWNER);
      return res.redirect(safeNext(req.query.next));
    }

    const user = await auth.findByEmail(identifier);
    // Check a password even when there's no such account, so the reply takes
    // the same time either way and can't be used to find out who works here.
    const good = await auth.verifyPassword(password, (user && user.passwordHash) || auth.DUMMY_HASH);
    if (user && user.passwordHash && good) {
      if (user.status === 'paused') return fail('Your account is paused. Speak to your manager if you think this is a mistake.');
      auth.clearFailures(req, identifier);
      user.lastActive = new Date().toISOString();
      await auth.saveUser(user);
      auth.setSessionCookie(res, SESSION_SECRET, user);
      return res.redirect(safeNext(req.query.next));
    }
    auth.recordFailure(req, identifier);
    if (auth.isLockedOut(req, identifier)) {
      await log(null, 'Sign-in locked for 15 minutes after 5 wrong passwords for “' + identifier.slice(0, 120) + '”');
    }
    fail('That email and password don’t match. Check for typos, or use “Forgotten your password?”. New here? Use the link in your invite.');
  }));

  function safeNext(n) {
    n = String(n || '');
    return /^\/admin(\/|$|\?)/.test(n) ? n : '/admin';
  }

  app.post('/admin/logout', (req, res) => {
    auth.clearSessionCookie(res);
    res.redirect('/admin/login?done=' + encodeURIComponent('You’ve signed out.'));
  });

  /* ---------- Invite & reset links ---------- */
  async function userByToken(kind, token) {
    const h = auth.hashToken(token);
    const u = (await auth.allUsers()).find((x) => x[kind + 'TokenHash'] === h);
    if (!u) return null;
    if (!u[kind + 'Expires'] || new Date(u[kind + 'Expires']) < new Date()) return null;
    return u;
  }

  /* Links are built from SITE_URL, or else the address the page was opened
     on. A *.vercel.app deployment or preview address is usually behind
     Vercel's own login, so a link built from it asks people to sign in to
     Vercel. Say so, instead of leaving it to be discovered. */
  function linkWarning(req) {
    if ((process.env.SITE_URL || '').trim()) return null;
    const host = (req.get('host') || '').toLowerCase();
    if (!host.endsWith('.vercel.app')) return null;
    return host;
  }

  async function issueLink(req, user, kind) {
    const token = auth.newToken();
    user[kind + 'TokenHash'] = auth.hashToken(token);
    user[kind + 'Expires'] = new Date(Date.now() + (kind === 'invite' ? 7 : 1) * 86400000).toISOString();
    await auth.saveUser(user);
    const url = siteUrl(req) + '/admin/' + kind + '/' + token;
    const emailed = await mailer.send({
      to: user.email,
      subject: kind === 'invite' ? 'You’re invited to the Venza Care staff hub' : 'Reset your Venza Care staff hub password',
      heading: kind === 'invite' ? 'Welcome to the Venza Care staff hub' : 'Reset your password',
      lines: kind === 'invite'
        ? ['Hi ' + user.name.split(' ')[0] + ',', 'You’ve been given access to the Venza Care staff hub, where you’ll find the noticeboard, policies and your training certificates.', 'Use the button below to set your password. The link works for 7 days.']
        : ['Hi ' + user.name.split(' ')[0] + ',', 'Use the button below to choose a new password. The link works for 24 hours. If you didn’t ask for this, you can ignore this email.'],
      button: { label: kind === 'invite' ? 'Set my password' : 'Choose a new password', url },
    });
    return { url, emailed };
  }

  for (const kind of ['invite', 'reset']) {
    app.get('/admin/' + kind + '/:token', wrap(async (req, res) => {
      const user = await userByToken(kind, req.params.token);
      res.render('hub/set-password', { title: 'Set your password', kind, user, error: user ? null : 'This link has expired or has already been used. Ask your manager to send a new one.' });
    }));
    app.post('/admin/' + kind + '/:token', wrap(async (req, res) => {
      const user = await userByToken(kind, req.params.token);
      if (!user) return res.render('hub/set-password', { title: 'Set your password', kind, user: null, error: 'This link has expired or has already been used. Ask your manager to send a new one.' });
      const pw = String(req.body.password || '');
      const problem = auth.passwordProblem(pw) || (pw !== String(req.body.confirm || '') ? 'The two passwords don’t match.' : null);
      if (problem) return res.render('hub/set-password', { title: 'Set your password', kind, user, error: problem });
      user.passwordHash = await auth.hashPassword(pw);
      delete user.inviteTokenHash; delete user.inviteExpires; delete user.resetTokenHash; delete user.resetExpires;
      if (user.status === 'invited') user.status = 'active';
      user.sessionVersion = (user.sessionVersion || 0) + 1; // signs out any other devices
      user.lastActive = new Date().toISOString();
      await auth.saveUser(user);
      await log(user, kind === 'invite' ? user.name + ' accepted their invite' : user.name + ' reset their password');
      if (user.status !== 'active') return res.redirect('/admin/login?done=' + encodeURIComponent('Password saved. Your account is paused, so you can’t sign in yet.'));
      auth.setSessionCookie(res, SESSION_SECRET, user);
      res.redirect('/admin?done=' + encodeURIComponent('Welcome, ' + user.name.split(' ')[0] + '! Your password is set.'));
    }));
  }

  app.get('/admin/forgot', (req, res) => {
    res.render('hub/forgot', { title: 'Forgotten password', sent: false, mailOn: mailer.configured() });
  });
  app.post('/admin/forgot', wrap(async (req, res) => {
    const user = await auth.findByEmail(req.body.email);
    if (user && user.status === 'active' && mailer.configured()) await issueLink(req, user, 'reset');
    // Same answer whether or not the email exists, so it can't be used to check who works here.
    res.render('hub/forgot', { title: 'Forgotten password', sent: true, mailOn: mailer.configured() });
  }));

  /* ---------- Overview ---------- */
  app.get('/admin', need(), wrap(async (req, res) => {
    const me = req.me;
    const posts = await visiblePosts(me);
    const reads = new Set((await db.records.list('post_reads')).filter((r) => r.userId === me.id).map((r) => r.postId));
    const certs = await visibleCertificates(me);
    const due = certs.filter((c) => ['expired', 'soon'].includes(certState(c).key));
    const users = can(me, 'people', 'view') ? await auth.allUsers() : [];
    res.render('hub/overview', {
      title: 'Overview',
      unread: posts.filter((p) => p.mustRead && !reads.has(p.id)),
      pinned: posts.filter((p) => p.pinned).slice(0, 3),
      due,
      waiting: can(me, 'enquiries', 'view') ? (await enquiryList(me)).filter((e) => e.stage === 'New') : null,
      upcoming: can(me, 'enquiries', 'view')
        ? (await enquiryList(me))
          .filter((e) => e.stage === 'Visit booked' && e.visitAt && e.visitAt.slice(0, 10) >= visits.ukStamp().slice(0, 10))
          .sort((a, b) => (a.visitAt < b.visitAt ? -1 : 1))
          .slice(0, 8)
          .map((e) => Object.assign(e, { whenText: e.visitAt.length > 10 ? visits.whenLabel(e.visitAt.slice(0, 10), e.visitAt.slice(11, 16)) : visits.dayLabel(e.visitAt) }))
        : null,
      pendingInvites: users.filter((u) => u.status === 'invited').length,
      noRealOwner: me.builtin && !users.some((u) => u.preset === 'Owner' && u.status === 'active'),
      health: can(me, 'people', 'edit') ? await db.health() : null,
    });
  }));

  /* ---------- Homes ---------- */
  app.get('/admin/homes', need(['homes', 'fees', 'availability'], 'view'), wrap(async (req, res) => {
    const list = (await db.allHomes()).filter((h) => covers(req.me, h.id));
    res.render('admin/homes', { title: 'Homes', homes: list });
  }));

  app.get('/admin/homes/new', need('homes', 'edit'), (req, res) => {
    if (req.me.homes !== 'all') return deny(res, 'Only people who cover the whole company can add a home.');
    res.render('hub/home-new', { title: 'Add a home', regions: [...new Set((res.locals.SITE.regions || []).concat(res.locals.hubHomes.map((h) => h.region)).filter(Boolean))].sort(), careTypes: CARE_TYPES, form: {}, error: null });
  });

  app.post('/admin/homes/new', need('homes', 'edit'), wrap(async (req, res) => {
    if (req.me.homes !== 'all') return deny(res, 'Only people who cover the whole company can add a home.');
    const f = req.body;
    const name = text(f.name, 80);
    if (!name || !text(f.town)) {
      return res.render('hub/home-new', { title: 'Add a home', regions: [...new Set((res.locals.SITE.regions || []).concat(res.locals.hubHomes.map((h) => h.region)).filter(Boolean))].sort(), careTypes: CARE_TYPES, form: f, error: 'Give the home a name and a town.' });
    }
    let id = slug(name);
    const existing = await db.allHomes();
    while (existing.some((h) => h.id === id)) id = slug(name) + '-' + Math.random().toString(36).slice(2, 5);
    const careTypes = [].concat(f.careTypes || []).filter((c) => CARE_TYPES.includes(c));
    const pt = await geocode(f.postcode);
    await db.saveHome({
      id, name, town: text(f.town, 60), postcode: text(f.postcode, 12).toUpperCase(), region: text(f.region, 40),
      lat: pt ? pt.lat : null, lng: pt ? pt.lng : null,
      beds: parseInt(f.beds, 10) || null, cqc: 'Registered', careTypes, specialisms: [], blurb: text(f.blurb, 600),
      dementiaNote: '', photo: '', gallery: [], sortOrder: existing.length,
      details: { archived: true },
    });
    await log(req.me, req.me.name + ' added ' + name + ' (hidden from the website until it’s made live)');
    back(res, '/admin/homes/' + id + '/edit', name + ' added. It’s hidden from the website until you press “Make live”.');
  }));

  app.get('/admin/homes/:id/edit', need(['homes', 'fees', 'availability'], 'view'), wrap(async (req, res) => {
    const home = await db.anyHome(req.params.id);
    if (!home || !covers(req.me, home.id)) return res.redirect('/admin/homes');
    res.render('admin/home-form', {
      title: 'Edit ' + home.name, home, careTypes: CARE_TYPES, error: null,
      visitSettings: visits.settingsFor(home), DAY_NAMES: visits.DAY_NAMES, timeLabel: visits.timeLabel,
      jobCount: (await db.jobs()).filter((j) => j.homeId === home.id).length,
      canHomes: can(req.me, 'homes', 'edit'), canFees: can(req.me, 'fees', 'edit'), canAvail: can(req.me, 'availability', 'edit'),
      seeFees: can(req.me, 'fees', 'view'), seeAvail: can(req.me, 'availability', 'view'),
    });
  }));

  app.post('/admin/homes/:id', need(['homes', 'fees', 'availability'], 'edit'), photoUpload, wrap(async (req, res) => {
    const home = await db.anyHome(req.params.id);
    if (!home || !covers(req.me, home.id)) return res.redirect('/admin/homes');
    const me = req.me, f = req.body;
    const price = (v) => {
      const n = parseFloat(String(v || '').replace(/[£,\s]/g, ''));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    const details = Object.assign({}, home.details);
    const next = Object.assign({}, home);
    const changed = [];

    if (can(me, 'availability', 'edit')) {
      details.availability = ['available', 'limited', 'waitlist'].includes(f.availability) ? f.availability : '';
      details.availabilityNote = text(f.availabilityNote, 200);
      if (details.availability !== home.details.availability || details.availabilityNote !== home.details.availabilityNote) changed.push('availability');
    }
    if (can(me, 'fees', 'edit')) {
      const fees = { residential: price(f.feeResidential), nursing: price(f.feeNursing), dementia: price(f.feeDementia), respite: price(f.feeRespite) };
      if (JSON.stringify(fees) !== JSON.stringify(home.details.fees) || text(f.feesUpdated, 40) !== home.details.feesUpdated || text(f.feesNote, 400) !== home.details.feesNote) changed.push('fees');
      details.fees = fees;
      details.feesUpdated = text(f.feesUpdated, 40);
      details.feesNote = text(f.feesNote, 400);
    }
    if (can(me, 'homes', 'edit')) {
      Object.assign(details, {
        phone: text(f.phone, 40),
        cqcLocationId: text(f.cqcLocationId, 30).replace(/[^0-9A-Za-z-]/g, ''),
        cqcRatedOn: text(f.cqcRatedOn, 40),
        managerName: text(f.managerName, 80),
        managerBio: text(f.managerBio, 800),
        managerPhoto: text(f.managerPhoto, 300),
        carehomeUrl: /^https:\/\/(www\.)?carehome\.co\.uk\//.test(text(f.carehomeUrl, 300)) ? text(f.carehomeUrl, 300) : '',
        reviewScore: text(f.reviewScore, 6),
        reviewCount: text(f.reviewCount, 8),
        parking: text(f.parking, 400),
        visits: {
          enabled: !!f.visitsEnabled,
          days: [].concat(f.visitDays || []).map(Number).filter((d) => d >= 0 && d <= 6),
          times: parseTimes(f.visitTimes),
          perSlot: parseInt(f.visitPerSlot, 10) || 1,
          noticeHours: parseInt(f.visitNotice, 10) || 0,
          weeksAhead: parseInt(f.visitWeeks, 10) || 3,
          closedDates: String(f.visitClosed || '').split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        },
      });
      const careTypes = [].concat(f.careTypes || []).filter((c) => CARE_TYPES.includes(c));
      const cqc = CQC_OPTIONS.includes(f.cqc) ? f.cqc : home.cqc;

      // Location: an empty map position is looked up from the postcode.
      const postcode = text(f.postcode, 12).toUpperCase() || home.postcode;
      const num = (v) => (String(v || '').trim() === '' ? null : Number(v));
      let lat = num(f.lat), lng = num(f.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || postcode !== home.postcode && f.lat == home.lat) {
        const pt = await geocode(postcode);
        if (pt) { lat = pt.lat; lng = pt.lng; } else if (!Number.isFinite(lat) || !Number.isFinite(lng)) { lat = home.lat; lng = home.lng; }
      }

      // Photos: a new main photo replaces the old one; ticked gallery photos
      // are kept and new uploads are added after them.
      let photo = home.photo, gallery = home.gallery || [];
      if (f.photosSection) {
        const files = req.files || {};
        try {
          if (files.photoFile && files.photoFile[0]) photo = await storage.savePhoto(files.photoFile[0]);
          const keep = new Set([].concat(f.keepGallery || []));
          gallery = gallery.filter((g) => keep.has(g));
          for (const file of files.galleryFiles || []) gallery.push(await storage.savePhoto(file));
        } catch (err) {
          return back(res, '/admin/homes/' + home.id + '/edit', err.message);
        }
        if (photo !== home.photo || gallery.length !== (home.gallery || []).length) changed.push('photos');
      }
      if (cqc !== home.cqc) changed.push('CQC rating (now ' + (cqc === 'Registered' ? 'not yet rated' : cqc) + ')');
      Object.assign(next, {
        name: text(f.name, 80) || home.name,
        blurb: text(f.blurb, 600) || home.blurb,
        beds: parseInt(f.beds, 10) || home.beds,
        cqc,
        careTypes: careTypes.length ? careTypes : home.careTypes,
        town: text(f.town, 60) || home.town,
        postcode,
        region: text(f.region, 40) || home.region,
        lat, lng,
        specialisms: String(f.specialisms == null ? (home.specialisms || []).join('\n') : f.specialisms).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30),
        dementiaNote: f.dementiaNote == null ? home.dementiaNote : text(f.dementiaNote, 300),
        photo, gallery,
      });
      changed.push('details');
    }
    next.details = details;
    await db.saveHome(next);
    await log(me, me.name + ' updated ' + home.name + ' — ' + [...new Set(changed)].join(', '));
    back(res, '/admin/homes', 'Saved ' + home.name + '. The website shows the change within 30 seconds.');
  }));

  /* "10, 11:30, 2pm, 14.00" → ['10:00', '11:30', '14:00'] */
  function parseTimes(raw) {
    const out = new Set();
    String(raw || '').split(/[,;\s]+/).forEach((t) => {
      const m = t.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
      if (!m) return;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2] || '0', 10);
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      if (h > 23 || min > 59) return;
      out.add(String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'));
    });
    return [...out].sort();
  }

  app.post('/admin/homes/:id/delete', need('homes', 'edit'), wrap(async (req, res) => {
    const home = await db.anyHome(req.params.id);
    if (!home || req.me.homes !== 'all') return res.redirect('/admin/homes');
    if (!home.details.archived) return back(res, '/admin/homes/' + home.id + '/edit', 'Archive the home before deleting it');
    const attached = (await db.jobs()).filter((j) => j.homeId === home.id).length;
    if (attached) return back(res, '/admin/homes/' + home.id + '/edit', home.name + ' still has ' + attached + ' job(s) attached');
    if (text(req.body.confirm, 120).toLowerCase() !== home.name.toLowerCase()) return back(res, '/admin/homes/' + home.id + '/edit', 'Type the home’s name exactly to delete it');
    await db.removeHome(home.id);
    await log(req.me, req.me.name + ' deleted the home ' + home.name);
    back(res, '/admin/homes', 'Deleted ' + home.name);
  }));

  for (const [action, archived] of [['archive', true], ['restore', false]]) {
    app.post('/admin/homes/:id/' + action, need('homes', 'edit'), wrap(async (req, res) => {
      const home = await db.anyHome(req.params.id);
      if (!home || !covers(req.me, home.id)) return res.redirect('/admin/homes');
      await db.saveHome(Object.assign({}, home, { details: Object.assign({}, home.details, { archived }) }));
      await log(req.me, req.me.name + (archived ? ' archived ' + home.name + ' (hidden from the website)' : ' made ' + home.name + ' live on the website'));
      back(res, '/admin/homes', archived ? home.name + ' is hidden from the website.' : home.name + ' is live on the website.');
    }));
  }

  /* ---------- Enquiries ---------- */
  const isCareers = (m) => /^Careers:/i.test(m.subject || '');

  async function enquiryList(me) {
    const [msgs, progress, homes] = await Promise.all([db.messages(), db.records.list('enquiry_progress'), db.allHomes()]);
    const byId = new Map(progress.map((p) => [p.id, p]));
    return msgs.filter((m) => !isCareers(m)).map((m) => {
      const home = homes.find((h) => h.name === m.home);
      const p = byId.get(m.id) || {};
      return Object.assign({}, m, {
        homeId: home ? home.id : '',
        stage: p.stage || 'New',
        note: p.note || '',
        visitAt: p.visitAt || '',
        online: !!p.online,
        claimId: p.claimId || '',
        stageUpdatedAt: p.updatedAt || '',
      });
    }).filter((e) => covers(me, e.homeId));
  }
  const enqGroup = (e) => (e.stage === 'New' ? 'todo' : ['Moved in', 'Not going ahead'].includes(e.stage) ? 'done' : 'progress');

  app.get('/admin/messages', (req, res) => res.redirect('/admin/enquiries'));

  app.get('/admin/enquiries', need('enquiries', 'view'), wrap(async (req, res) => {
    const tab = ['todo', 'progress', 'done'].includes(req.query.tab) ? req.query.tab : 'todo';
    const all = await enquiryList(req.me);
    const counts = { todo: 0, progress: 0, done: 0 };
    all.forEach((e) => counts[enqGroup(e)]++);
    res.render('hub/enquiries', {
      title: 'Enquiries',
      tab, counts,
      list: all.filter((e) => enqGroup(e) === tab),
      canEdit: can(req.me, 'enquiries', 'edit'),
      NEXT_STEP,
      dayMs: 86400000,
    });
  }));

  async function saveProgress(me, e, patch) {
    const prev = await db.records.get('enquiry_progress', e.id) || {};
    await db.records.put('enquiry_progress', e.id, Object.assign({ stage: 'New', note: '' }, prev, patch, { updatedAt: new Date().toISOString(), updatedBy: me.name }));
  }

  app.post('/admin/enquiries/:id/step', need('enquiries', 'edit'), wrap(async (req, res) => {
    const e = (await enquiryList(req.me)).find((x) => x.id === req.params.id);
    if (!e) return res.redirect('/admin/enquiries');
    const action = req.body.action;
    let stage = e.stage;
    if (action === 'next' && NEXT_STEP[e.stage]) stage = NEXT_STEP[e.stage];
    else if (action === 'stop') stage = 'Not going ahead';
    else if (action === 'reopen') stage = 'New';
    if (stage === 'Visit booked') return res.redirect('/admin/enquiries/' + e.id + '/book');
    const note = text(req.body.note, 500) || (stage === 'Called' ? 'Called by ' + req.me.name + '.' : e.note);
    const patch = { stage, note };
    // Cancelling or reopening frees the visit slot for someone else.
    if (e.claimId && (stage === 'Not going ahead' || stage === 'New')) {
      await visits.release(e.claimId);
      patch.claimId = '';
    }
    await saveProgress(req.me, e, patch);
    await log(req.me, req.me.name + ' moved ' + e.name + ' from “' + STEP_WORDS[e.stage] + '” to “' + STEP_WORDS[stage] + '”');
    back(res, '/admin/enquiries?tab=' + enqGroup({ stage }), e.name + ': ' + STEP_WORDS[stage]);
  }));

  app.post('/admin/enquiries/:id/note', need('enquiries', 'edit'), wrap(async (req, res) => {
    const e = (await enquiryList(req.me)).find((x) => x.id === req.params.id);
    if (!e) return res.redirect('/admin/enquiries');
    await saveProgress(req.me, e, { note: text(req.body.note, 500) });
    back(res, '/admin/enquiries?tab=' + enqGroup(e), 'Note saved');
  }));

  app.get('/admin/enquiries/:id/book', need('enquiries', 'edit'), wrap(async (req, res) => {
    const e = (await enquiryList(req.me)).find((x) => x.id === req.params.id);
    if (!e) return res.redirect('/admin/enquiries');
    res.render('hub/book-visit', { title: 'Book a visit', e, error: null });
  }));

  app.post('/admin/enquiries/:id/book', need('enquiries', 'edit'), wrap(async (req, res) => {
    const e = (await enquiryList(req.me)).find((x) => x.id === req.params.id);
    if (!e) return res.redirect('/admin/enquiries');
    const date = text(req.body.date, 10), time = text(req.body.time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.render('hub/book-visit', { title: 'Book a visit', e, error: 'Pick the day of the visit.' });
    const hasTime = /^\d{2}:\d{2}$/.test(time);
    const when = hasTime ? visits.whenLabel(date, time) : visits.dayLabel(date);
    // Take the slot so online bookings can't clash with it (staff can still
    // overbook on purpose — it's noted if the slot was already full).
    if (e.claimId) await visits.release(e.claimId);
    const home = await db.anyHome(e.homeId);
    const claimId = home && hasTime ? await visits.claim(home, date, time, { name: e.name, enquiryId: e.id }) : null;
    const full = home && hasTime && !claimId;
    await saveProgress(req.me, e, {
      stage: 'Visit booked', visitAt: date + (hasTime ? 'T' + time : ''), claimId: claimId || '',
      note: 'Visit booked for ' + when + ' by ' + req.me.name + '.' + (full ? ' (That time was already fully booked.)' : ''),
    });
    let emailed = false;
    if (req.body.confirm && e.email) {
      emailed = await mailer.send({
        to: e.email,
        subject: 'Your visit to ' + (home ? home.name : 'Venza Care'),
        heading: 'Your visit is booked',
        lines: ['Hi ' + e.name.split(' ')[0] + ',', 'Thank you for arranging to visit' + (home ? ' ' + home.name + ', ' + home.town + ' ' + home.postcode : '') + ' on ' + when + '.', 'If you need to change the time, just reply to this email or call ' + res.locals.SITE.phone + '. We look forward to meeting you.'],
        button: home ? { label: 'Get directions', url: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(home.name + ', ' + home.town + ' ' + home.postcode) } : null,
      });
    }
    await log(req.me, req.me.name + ' booked a visit for ' + e.name + ' (' + when + ')');
    back(res, '/admin/enquiries?tab=progress', 'Visit booked for ' + when + (emailed ? '. Confirmation emailed.' : '.'));
  }));

  /* ---------- Jobs & applications ---------- */
  const jobInScope = (me, job) => covers(me, job.homeId);

  app.get('/admin/jobs', need(['jobs', 'applications'], 'view'), wrap(async (req, res) => {
    const jobs = (await db.jobs()).filter((j) => jobInScope(req.me, j));
    res.render('admin/dashboard', { title: 'Jobs', jobs, counts: await db.applicationCounts(), canEdit: can(req.me, 'jobs', 'edit'), canApps: can(req.me, 'applications', 'view') });
  }));

  function jobHomes(me, homes) { return homes.filter((h) => covers(me, h.id)); }

  app.get('/admin/jobs/new', need('jobs', 'edit'), wrap(async (req, res) => {
    res.render('admin/job-form', { title: 'Post a job', mode: 'new', job: {}, homes: jobHomes(req.me, await db.allHomes()), allowNoHome: req.me.homes === 'all' });
  }));

  async function jobBody(req) {
    const b = Object.assign({}, req.body);
    const home = b.homeId ? await db.anyHome(b.homeId) : null;
    if (!home || !covers(req.me, home.id)) b.homeId = req.me.homes === 'all' ? '' : null;
    if (b.homeId === null) return null;
    if (home && !text(b.location)) b.location = home.town;
    return b;
  }

  app.post('/admin/jobs', need('jobs', 'edit'), wrap(async (req, res) => {
    const b = await jobBody(req);
    if (!b) return deny(res, 'Choose one of your homes for this job.');
    const job = await db.createJob(b);
    await log(req.me, req.me.name + ' posted the job “' + job.title + '”');
    back(res, '/admin/jobs', 'Job posted');
  }));

  async function scopedJob(req) {
    const job = await db.job(req.params.id);
    return job && jobInScope(req.me, job) ? job : null;
  }

  app.get('/admin/jobs/:id/edit', need('jobs', 'edit'), wrap(async (req, res) => {
    const job = await scopedJob(req);
    if (!job) return res.redirect('/admin/jobs');
    res.render('admin/job-form', { title: 'Edit vacancy', mode: 'edit', job, homes: jobHomes(req.me, await db.allHomes()), allowNoHome: req.me.homes === 'all' });
  }));

  app.post('/admin/jobs/:id', need('jobs', 'edit'), wrap(async (req, res) => {
    const job = await scopedJob(req);
    if (!job) return res.redirect('/admin/jobs');
    const b = await jobBody(req);
    if (!b) return deny(res, 'Choose one of your homes for this job.');
    await db.updateJob(job.id, b);
    await log(req.me, req.me.name + ' edited the job “' + job.title + '”');
    back(res, '/admin/jobs', 'Job saved');
  }));

  app.post('/admin/jobs/:id/toggle', need('jobs', 'edit'), wrap(async (req, res) => {
    const job = await scopedJob(req);
    if (!job) return res.redirect('/admin/jobs');
    await db.toggleJob(job.id);
    await log(req.me, req.me.name + (job.status === 'open' ? ' closed' : ' reopened') + ' the job “' + job.title + '”');
    back(res, '/admin/jobs', job.status === 'open' ? 'Job closed' : 'Job reopened');
  }));

  app.post('/admin/jobs/:id/delete', need('jobs', 'edit'), wrap(async (req, res) => {
    const job = await scopedJob(req);
    if (!job) return res.redirect('/admin/jobs');
    await db.deleteJob(job.id);
    await log(req.me, req.me.name + ' deleted the job “' + job.title + '” and its applications');
    back(res, '/admin/jobs', 'Job deleted');
  }));

  app.get('/admin/applications', need('applications', 'view'), wrap(async (req, res) => {
    const jobId = text(req.query.job, 80);
    const jobs = (await db.jobs()).filter((j) => jobInScope(req.me, j));
    const ids = new Set(jobs.map((j) => j.id));
    const status = text(req.query.status, 20);
    const inScope = (await db.applications(jobId)).filter((a) => ids.has(a.jobId));
    const apps = status ? inScope.filter((a) => (a.status || 'new') === status) : inScope;
    // Messages sent through the careers "Contact HR" form.
    const recruitMsgs = (await db.messages()).filter((m) => isCareers(m) && covers(req.me, (res.locals.hubHomes.find((h) => h.name === m.home) || {}).id));
    res.render('admin/applications', {
      title: 'Applications', applications: apps, jobs, jobId, recruitMsgs, status,
      STATUSES: db.APPLICATION_STATUSES, canEdit: can(req.me, 'applications', 'edit'),
      statusCounts: db.APPLICATION_STATUSES.reduce((m, x) => (m[x.value] = inScope.filter((a) => (a.status || 'new') === x.value).length, m), {}),
    });
  }));

  app.post('/admin/applications/:id', need('applications', 'edit'), wrap(async (req, res) => {
    const application = (await db.applications()).find((a) => a.id === req.params.id);
    const job = application && (await db.job(application.jobId));
    if (!application || !job || !jobInScope(req.me, job)) return deny(res, 'That application isn’t available to you.');
    const updated = await db.updateApplication(application.id, { status: req.body.status, notes: req.body.notes });
    const label = (db.APPLICATION_STATUSES.find((x) => x.value === updated.status) || {}).label || updated.status;
    if (updated.status !== application.status) await log(req.me, req.me.name + ' moved ' + application.name + '’s application for ' + application.jobTitle + ' to “' + label + '”');
    const q = new URLSearchParams({ job: text(req.body.job, 80), status: text(req.body.filter, 20) }).toString();
    back(res, '/admin/applications?' + q, 'Saved ' + application.name);
  }));

  app.get('/admin/applications/:id/cv', need('applications', 'view'), wrap(async (req, res) => {
    const application = (await db.applications()).find((a) => a.id === req.params.id);
    const job = application && (await db.job(application.jobId));
    if (!application || !application.cvPath || !job || !jobInScope(req.me, job)) return deny(res, 'That CV isn’t available to you.');
    await sendFile(res, application.cvPath, application.cvFilename || 'cv');
  }));

  async function sendFile(res, key, filename) {
    const signed = await storage.downloadUrl(key);
    if (signed) return res.redirect(signed);
    const local = storage.localPath(key);
    if (!local) return res.status(404).render('hub/denied', { title: 'File missing', message: 'That file couldn’t be found. It may have been removed.' });
    res.download(local, filename);
  }

  /* ---------- Noticeboard ---------- */
  function postVisible(post, user) {
    if (['Owner', 'Admin'].includes(user.preset)) return true;
    const a = post.audience || { type: 'all' };
    if (a.type === 'homes') return user.homes === 'all' || (a.homes || []).some((h) => covers(user, h));
    if (a.type === 'roles') return (a.roles || []).includes(user.preset);
    return true;
  }
  function postLive(post) {
    return !post.expiresOn || new Date(post.expiresOn + 'T23:59:59') >= new Date();
  }
  async function visiblePosts(user) {
    const editor = can(user, 'noticeboard', 'edit');
    return (await db.records.list('posts'))
      .filter((p) => postVisible(p, user) && (editor || postLive(p)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
  }
  function audienceLabel(a, homes) {
    if (!a || a.type === 'all') return 'Everyone';
    if (a.type === 'homes') return (a.homes || []).map((id) => (homes.find((h) => h.id === id) || { name: id }).name).join(', ');
    return (a.roles || []).join(', ');
  }

  app.get('/admin/noticeboard', need(), wrap(async (req, res) => {
    const me = req.me;
    const [posts, reads, users] = await Promise.all([visiblePosts(me), db.records.list('post_reads'), auth.allUsers()]);
    const active = users.filter((u) => u.status === 'active');
    const view = posts.map((p) => {
      const audience = active.filter((u) => postVisible(p, u));
      const readers = new Set(reads.filter((r) => r.postId === p.id).map((r) => r.userId));
      return Object.assign({}, p, {
        audienceText: audienceLabel(p.audience, res.locals.hubHomes),
        total: audience.length,
        seen: audience.filter((u) => readers.has(u.id)).length,
        notSeen: audience.filter((u) => !readers.has(u.id)).map((u) => u.name),
        mine: readers.has(me.id),
        live: postLive(p),
      });
    });
    const myHomes = res.locals.hubHomes.filter((h) => !h.details.archived && covers(me, h.id));
    res.render('hub/noticeboard', { title: 'Noticeboard', posts: view, canPost: can(me, 'noticeboard', 'edit'), myHomes, companyWide: me.homes === 'all' });
  }));

  app.post('/admin/noticeboard', need('noticeboard', 'edit'), wrap(async (req, res) => {
    const me = req.me, f = req.body;
    const title = text(f.title, 140), body = text(f.body, 5000);
    if (!title || !body) return back(res, '/admin/noticeboard', 'Add a title and a message');
    let audience = { type: 'all' };
    const aud = String(f.audience || 'all');
    if (aud.startsWith('home:')) audience = { type: 'homes', homes: [aud.slice(5)] };
    else if (aud.startsWith('role:') && PRESETS[aud.slice(5)]) audience = { type: 'roles', roles: [aud.slice(5)] };
    // People who don't cover the whole company can only post to their own homes.
    if (me.homes !== 'all' && (audience.type !== 'homes' || !covers(me, audience.homes[0]))) {
      audience = { type: 'homes', homes: me.homes.slice() };
    }
    const id = db.uid('post');
    const post = {
      title, body, audience,
      authorId: me.id, authorName: me.name,
      pinned: !!f.pinned, mustRead: !!f.mustRead,
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(f.expiresOn || '') ? f.expiresOn : '',
    };
    await db.records.put('posts', id, post);
    await db.records.put('post_reads', id + ':' + me.id, { postId: id, userId: me.id, at: new Date().toISOString() });
    let emailed = 0;
    if (f.email && mailer.configured()) {
      const to = (await auth.allUsers()).filter((u) => u.status === 'active' && u.email && u.id !== me.id && postVisible(post, u)).map((u) => u.email);
      emailed = await mailer.sendMany(to, {
        subject: (post.mustRead ? 'Please read: ' : '') + title,
        heading: title,
        lines: body.split(/\n+/).concat(['— ' + me.name]),
        button: { label: 'Open the noticeboard', url: siteUrl(req) + '/admin/noticeboard' },
      });
    }
    await log(me, me.name + ' posted “' + title + '” to ' + audienceLabel(audience, res.locals.hubHomes));
    back(res, '/admin/noticeboard', 'Posted' + (emailed ? ' and emailed to ' + emailed + ' people' : ''));
  }));

  app.post('/admin/noticeboard/:id/read', need(), wrap(async (req, res) => {
    const post = await db.records.get('posts', req.params.id);
    if (post && postVisible(post, req.me)) {
      await db.records.put('post_reads', post.id + ':' + req.me.id, { postId: post.id, userId: req.me.id, at: new Date().toISOString() });
    }
    back(res, '/admin/noticeboard', 'Marked as read');
  }));

  app.post('/admin/noticeboard/:id/pin', need('noticeboard', 'edit'), wrap(async (req, res) => {
    const post = await db.records.get('posts', req.params.id);
    if (!post || !postVisible(post, req.me)) return res.redirect('/admin/noticeboard');
    post.pinned = !post.pinned;
    await db.records.put('posts', post.id, post);
    back(res, '/admin/noticeboard', post.pinned ? 'Pinned to the top' : 'Unpinned');
  }));

  app.post('/admin/noticeboard/:id/delete', need('noticeboard', 'edit'), wrap(async (req, res) => {
    const post = await db.records.get('posts', req.params.id);
    if (!post || !postVisible(post, req.me)) return res.redirect('/admin/noticeboard');
    if (req.me.homes !== 'all' && post.authorId !== req.me.id) return deny(res, 'You can only remove posts you wrote.');
    await db.records.remove('posts', post.id);
    for (const r of (await db.records.list('post_reads')).filter((x) => x.postId === post.id)) await db.records.remove('post_reads', r.id);
    await log(req.me, req.me.name + ' removed the post “' + post.title + '”');
    back(res, '/admin/noticeboard', 'Post removed');
  }));

  /* ---------- Documents ---------- */
  function docVisible(doc, user) {
    return doc.visibleTo !== 'managers' || MANAGER_PRESETS.includes(user.preset) || can(user, 'documents', 'edit');
  }

  app.get('/admin/documents', need(), wrap(async (req, res) => {
    const me = req.me;
    const tab = req.query.tab === 'certificates' ? 'certificates' : 'shared';
    const docs = (await db.records.list('documents')).filter((d) => docVisible(d, me)).sort((a, b) => a.name.localeCompare(b.name));
    const certs = (await visibleCertificates(me)).map((c) => Object.assign({}, c, { state: certState(c) }))
      .sort((a, b) => (a.expiresOn || '9999') < (b.expiresOn || '9999') ? -1 : 1);
    const users = await auth.allUsers();
    const uploadFor = can(me, 'certificates', 'edit') ? users.filter((u) => u.id !== me.id && coversPerson(me, u)) : [];
    res.render('hub/documents', {
      title: 'Documents', tab, docs, certs, folders: DOC_FOLDERS,
      canEdit: can(me, 'documents', 'edit'), seeOthers: can(me, 'certificates', 'view'), canEditCerts: can(me, 'certificates', 'edit'),
      people: new Map(users.map((u) => [u.id, u])), uploadFor, docTypes: DOC_TYPES.join(','), certTypes: CERT_TYPES.join(','),
    });
  }));

  app.post('/admin/documents', need('documents', 'edit'), docUpload.single('file'), wrap(async (req, res) => {
    if (!req.file) return back(res, '/admin/documents', 'Choose a file to upload (PDF, Word, Excel, PowerPoint or an image, up to 10 MB)');
    const saved = await storage.saveFile('documents', req.file);
    const name = text(req.body.name, 140) || req.file.originalname.replace(/\.[^.]+$/, '');
    const id = db.uid('doc');
    await db.records.put('documents', id, {
      name,
      folder: DOC_FOLDERS.includes(req.body.folder) ? req.body.folder : DOC_FOLDERS[0],
      visibleTo: req.body.visibleTo === 'managers' ? 'managers' : 'everyone',
      versions: [{ version: 1, key: saved.key, filename: saved.filename, uploadedBy: req.me.name, at: new Date().toISOString() }],
    });
    await log(req.me, req.me.name + ' uploaded “' + name + '”');
    back(res, '/admin/documents', 'Uploaded “' + name + '”');
  }));

  app.post('/admin/documents/:id/replace', need('documents', 'edit'), docUpload.single('file'), wrap(async (req, res) => {
    const doc = await db.records.get('documents', req.params.id);
    if (!doc) return res.redirect('/admin/documents');
    if (!req.file) return back(res, '/admin/documents', 'Choose the new file to upload');
    const saved = await storage.saveFile('documents', req.file);
    const version = (doc.versions[doc.versions.length - 1] || { version: 0 }).version + 1;
    doc.versions.push({ version, key: saved.key, filename: saved.filename, uploadedBy: req.me.name, at: new Date().toISOString() });
    await db.records.put('documents', doc.id, doc);
    await log(req.me, req.me.name + ' replaced “' + doc.name + '” (version ' + version + ')');
    back(res, '/admin/documents', 'Version ' + version + ' of “' + doc.name + '” uploaded. Earlier versions are kept.');
  }));

  app.post('/admin/documents/:id/delete', need('documents', 'edit'), wrap(async (req, res) => {
    const doc = await db.records.get('documents', req.params.id);
    if (!doc) return res.redirect('/admin/documents');
    for (const v of doc.versions || []) await storage.removeFile(v.key);
    await db.records.remove('documents', doc.id);
    await log(req.me, req.me.name + ' deleted the document “' + doc.name + '”');
    back(res, '/admin/documents', 'Deleted “' + doc.name + '”');
  }));

  app.get('/admin/documents/:id/file', need(), wrap(async (req, res) => {
    const doc = await db.records.get('documents', req.params.id);
    if (!doc || !docVisible(doc, req.me)) return deny(res, 'That document isn’t shared with you.');
    const wanted = parseInt(req.query.v, 10);
    const v = (wanted && doc.versions.find((x) => x.version === wanted)) || doc.versions[doc.versions.length - 1];
    if (!v) return deny(res, 'That document has no file.');
    await sendFile(res, v.key, v.filename);
  }));

  /* ---------- Training certificates ---------- */
  function certState(c) {
    if (!c.expiresOn) return { key: 'none', text: 'No expiry' };
    const days = Math.ceil((new Date(c.expiresOn + 'T23:59:59') - new Date()) / 86400000);
    if (days < 0) return { key: 'expired', text: 'Expired' };
    if (days <= 30) return { key: 'soon', text: 'Renew within ' + days + ' day' + (days === 1 ? '' : 's') };
    return { key: 'ok', text: 'Valid' };
  }
  async function visibleCertificates(me) {
    const [certs, users] = await Promise.all([db.records.list('certificates'), auth.allUsers()]);
    const byId = new Map(users.map((u) => [u.id, u]));
    return certs.filter((c) => {
      if (c.userId === me.id) return true;
      if (!can(me, 'certificates', 'view')) return false;
      const owner = byId.get(c.userId);
      return owner && coversPerson(me, owner);
    });
  }

  app.post('/admin/certificates', need(), certUpload.single('file'), wrap(async (req, res) => {
    const me = req.me;
    if (me.builtin) return back(res, '/admin/documents?tab=certificates', 'The emergency owner login has no profile to hold certificates');
    let forId = me.id;
    if (req.body.userId && req.body.userId !== me.id) {
      const target = await auth.getUser(req.body.userId);
      if (!target || !can(me, 'certificates', 'edit') || !coversPerson(me, target)) return deny(res, 'You can only upload certificates for people in your homes.');
      forId = target.id;
    }
    if (!req.file) return back(res, '/admin/documents?tab=certificates', 'Choose a photo or PDF of the certificate');
    const name = text(req.body.name, 120);
    if (!name) return back(res, '/admin/documents?tab=certificates', 'Say which certificate this is');
    const saved = await storage.saveFile('certificates', req.file);
    const owner = await auth.getUser(forId);
    await db.records.put('certificates', db.uid('cert'), {
      userId: forId, name,
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(req.body.expiresOn || '') ? req.body.expiresOn : '',
      key: saved.key, filename: saved.filename, uploadedBy: me.name,
    });
    await log(me, me.name + ' uploaded the certificate “' + name + '”' + (forId !== me.id ? ' for ' + owner.name : ''));
    back(res, '/admin/documents?tab=certificates', 'Certificate added');
  }));

  async function scopedCert(req) {
    const c = await db.records.get('certificates', req.params.id);
    if (!c) return null;
    const visible = await visibleCertificates(req.me);
    return visible.some((x) => x.id === c.id) ? c : null;
  }

  app.get('/admin/certificates/:id/file', need(), wrap(async (req, res) => {
    const c = await scopedCert(req);
    if (!c) return deny(res, 'That certificate isn’t available to you.');
    await sendFile(res, c.key, c.filename);
  }));

  app.post('/admin/certificates/:id/delete', need(), wrap(async (req, res) => {
    const c = await scopedCert(req);
    if (!c || (c.userId !== req.me.id && !can(req.me, 'certificates', 'edit'))) return deny(res, 'You can’t remove that certificate.');
    await storage.removeFile(c.key);
    await db.records.remove('certificates', c.id);
    await log(req.me, req.me.name + ' removed the certificate “' + c.name + '”');
    back(res, '/admin/documents?tab=certificates', 'Certificate removed');
  }));

  /* ---------- Staff directory ---------- */
  app.get('/admin/directory', need(), wrap(async (req, res) => {
    const users = (await auth.allUsers()).filter((u) => u.status !== 'invited').sort((a, b) => a.name.localeCompare(b.name));
    const homes = res.locals.hubHomes.filter((h) => !h.details.archived);
    const filter = text(req.query.home, 60) || 'everyone';
    const groups = [{ key: 'all', label: 'Head office' }].concat(homes.map((h) => ({ key: h.id, label: h.name })))
      .filter((g) => filter === 'everyone' || filter === g.key)
      .map((g) => Object.assign(g, { people: users.filter((u) => (g.key === 'all' ? u.homes === 'all' : u.homes !== 'all' && u.homes.includes(g.key))) }))
      .filter((g) => g.people.length);
    res.render('hub/directory', { title: 'Staff directory', groups, homes, filter });
  }));

  /* ---------- My account ---------- */
  app.get('/admin/account', need(), (req, res) => {
    res.render('hub/account', { title: 'My account', error: null });
  });
  app.post('/admin/account', need(), wrap(async (req, res) => {
    if (req.me.builtin) return back(res, '/admin/account', 'The emergency owner login can’t be edited');
    const me = await auth.getUser(req.me.id);
    me.phone = text(req.body.phone, 40);
    if (me.preset !== 'Carer / staff') me.title = text(req.body.title, 80) || me.title;
    await auth.saveUser(me);
    back(res, '/admin/account', 'Saved');
  }));
  app.post('/admin/account/password', need(), wrap(async (req, res) => {
    if (req.me.builtin) return back(res, '/admin/account', 'Change the emergency password in your hosting settings (ADMIN_PASS)');
    const me = await auth.getUser(req.me.id);
    const ok = await auth.verifyPassword(String(req.body.current || ''), me.passwordHash);
    const pw = String(req.body.password || '');
    const problem = !ok ? 'Your current password isn’t right.' : auth.passwordProblem(pw) || (pw !== String(req.body.confirm || '') ? 'The two new passwords don’t match.' : null);
    if (problem) return res.render('hub/account', { title: 'My account', error: problem });
    me.passwordHash = await auth.hashPassword(pw);
    me.sessionVersion = (me.sessionVersion || 0) + 1;
    await auth.saveUser(me);
    auth.setSessionCookie(res, SESSION_SECRET, me);
    await log(me, me.name + ' changed their password');
    back(res, '/admin/account', 'Password changed. Any other devices have been signed out.');
  }));

  /* ---------- People & access ---------- */
  /* Rules that stop anyone locking the business out.
     Owner accounts are locked: nobody in the hub can change, pause, delete
     or reset an owner — only the emergency owner login from the hosting
     settings can, so an owner who leaves can still be removed. */
  async function protection(me, target) {
    if (target.id === me.id) return 'You can’t change, pause or delete your own account. Ask another admin.';
    if (target.preset === 'Owner' && !me.builtin) {
      return 'Owner accounts are locked — nobody can change, pause or delete an owner from here. To change an owner, sign in with the emergency owner login from your hosting settings.';
    }
    return null;
  }
  // Only owners can make someone an owner.
  const canGrantOwner = (me) => me.builtin || me.preset === 'Owner';

  function parseHomes(f, homes) {
    if (f.scope === 'all') return 'all';
    const valid = new Set(homes.map((h) => h.id));
    return [].concat(f.homes || []).filter((h) => valid.has(h));
  }

  app.get('/admin/people', need('people', 'view'), wrap(async (req, res) => {
    const users = (await auth.allUsers()).sort((a, b) => ({ active: 0, invited: 1, paused: 2 }[a.status] - { active: 0, invited: 1, paused: 2 }[b.status]) || a.name.localeCompare(b.name));
    res.render('hub/people', { title: 'People & access', users, canEdit: can(req.me, 'people', 'edit'), isCustom, error: null, form: {}, grantOwner: canGrantOwner(req.me) });
  }));

  async function createPerson(req, { name, email, preset, homes, title }) {
    const user = {
      id: db.uid('user'), name, email: email.toLowerCase(), preset,
      title: title || { Owner: 'Owner', Admin: 'Admin', 'Home manager': 'Home manager', 'Recruitment / HR': 'HR adviser', Reception: 'Receptionist', 'Carer / staff': 'Care assistant' }[preset],
      perms: Object.assign({}, PRESETS[preset]), homes, status: 'invited', sessionVersion: 0, phone: '',
    };
    await auth.saveUser(user);
    const link = await issueLink(req, user, 'invite');
    return { user, link };
  }

  app.post('/admin/people/invite', need('people', 'edit'), wrap(async (req, res) => {
    const f = req.body;
    const homes = parseHomes(f, res.locals.hubHomes);
    const name = text(f.name, 80), email = text(f.email, 200);
    const preset = PRESETS[f.preset] ? f.preset : 'Carer / staff';
    const users = await auth.allUsers();
    let error = null;
    if (preset === 'Owner' && !canGrantOwner(req.me)) error = 'Only an owner can invite another owner.';
    else if (!name) error = 'Add their full name.';
    else if (!isEmail(email)) error = 'That email address doesn’t look right.';
    else if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) error = 'Someone with that email already has an account.';
    else if (homes !== 'all' && !homes.length) error = 'Choose at least one home, or Whole company.';
    if (error) return res.render('hub/people', { title: 'People & access', users, canEdit: true, isCustom, error, form: f, grantOwner: canGrantOwner(req.me) });
    const { user, link } = await createPerson(req, { name, email, preset, homes, title: text(f.title, 80) });
    await log(req.me, req.me.name + ' invited ' + name + ' (' + preset + ', ' + homesLabel(user, res.locals.hubHomes) + ')');
    res.render('hub/link-issued', { title: 'Invite created', person: user, link, kind: 'invite', linkWarning: linkWarning(req) });
  }));

  app.get('/admin/people/bulk', need('people', 'edit'), (req, res) => {
    res.render('hub/bulk', { title: 'Invite from a spreadsheet', results: null, csv: '' });
  });

  app.post('/admin/people/bulk', need('people', 'edit'), csvUpload.single('file'), wrap(async (req, res) => {
    const csv = req.file ? req.file.buffer.toString('utf8') : String(req.body.csv || '');
    const homes = res.locals.hubHomes;
    const users = await auth.allUsers();
    const taken = new Set(users.map((u) => u.email.toLowerCase()));
    const results = [];
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
    for (const line of lines) {
      const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (/^name$/i.test(cells[0])) continue; // header row
      const [name, email, homeName, level] = cells;
      const row = { name, email, ok: false };
      const home = (homeName || '').toLowerCase();
      const scope = !home || /head office|whole company|all/.test(home) ? 'all' : (homes.find((h) => h.name.toLowerCase() === home) || {}).id;
      const preset = PRESET_NAMES.find((p) => p.toLowerCase() === String(level || '').toLowerCase()) || 'Carer / staff';
      if (!name) row.error = 'No name';
      else if (!isEmail(email)) row.error = 'Email doesn’t look right';
      else if (taken.has(email.toLowerCase())) row.error = 'Already has an account';
      else if (!scope) row.error = 'Home “' + homeName + '” not found';
      else if (preset === 'Owner') row.error = 'Owners must be invited one at a time';
      if (!row.error) {
        const { user, link } = await createPerson(req, { name, email, preset, homes: scope === 'all' ? 'all' : [scope] });
        taken.add(email.toLowerCase());
        Object.assign(row, { ok: true, link, preset, where: homesLabel(user, homes) });
      }
      results.push(row);
    }
    const n = results.filter((r) => r.ok).length;
    if (n) await log(req.me, req.me.name + ' invited ' + n + ' people from a spreadsheet');
    res.render('hub/bulk', { title: 'Invite from a spreadsheet', results, csv: '' });
  }));

  async function personOr404(req, res) {
    const p = await auth.getUser(req.params.id);
    if (!p || p.builtin) { res.redirect('/admin/people'); return null; }
    return p;
  }

  app.get('/admin/people/:id', need('people', 'view'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const certs = (await db.records.list('certificates')).filter((c) => c.userId === p.id);
    res.render('hub/person', {
      title: p.name, p, certs, isCustom: isCustom(p),
      canEdit: can(req.me, 'people', 'edit'),
      protect: await protection(req.me, p),
      grantOwner: canGrantOwner(req.me),
    });
  }));

  app.post('/admin/people/:id/access', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const f = req.body;
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    const preset = PRESETS[f.preset] ? f.preset : p.preset;
    if (preset === 'Owner' && p.preset !== 'Owner' && !canGrantOwner(req.me)) return back(res, '/admin/people/' + p.id, 'Only an owner can make someone an owner');
    const homes = parseHomes(f, res.locals.hubHomes);
    if (homes !== 'all' && !homes.length) return back(res, '/admin/people/' + p.id, 'Choose at least one home, or Whole company');
    const perms = {};
    AREAS.forEach((a) => { perms[a.key] = a.levels.includes(f['perm_' + a.key]) ? f['perm_' + a.key] : PRESETS[preset][a.key]; });

    const changes = [];
    if (preset !== p.preset) changes.push('access level ' + p.preset + ' → ' + preset);
    if (JSON.stringify(homes) !== JSON.stringify(p.homes)) changes.push('homes → ' + homesLabel({ homes }, res.locals.hubHomes));
    AREAS.forEach((a) => { if (perms[a.key] !== p.perms[a.key]) changes.push(a.label + ' ' + LEVEL_WORDS[p.perms[a.key]] + ' → ' + LEVEL_WORDS[perms[a.key]]); });
    const title = text(f.title, 80);
    if (title && title !== p.title) changes.push('job title → ' + title);
    Object.assign(p, { preset, homes, perms, title: title || p.title });
    await auth.saveUser(p);
    if (changes.length) await log(req.me, req.me.name + ' changed ' + p.name + ': ' + changes.join('; '));
    back(res, '/admin/people/' + p.id, changes.length ? 'Saved ' + p.name + '’s access' : 'No changes');
  }));

  app.post('/admin/people/:id/pause', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    p.pausedFrom = p.status;
    p.status = 'paused';
    p.sessionVersion = (p.sessionVersion || 0) + 1;
    await auth.saveUser(p);
    await log(req.me, req.me.name + ' paused ' + p.name + '’s account');
    back(res, '/admin/people/' + p.id, p.name + ' is paused and has been signed out');
  }));

  app.post('/admin/people/:id/unpause', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    p.status = p.passwordHash ? 'active' : 'invited';
    delete p.pausedFrom;
    await auth.saveUser(p);
    await log(req.me, req.me.name + ' unpaused ' + p.name + '’s account');
    back(res, '/admin/people/' + p.id, p.status === 'active' ? p.name + ' can sign in again' : p.name + ' is unpaused — they still need to accept their invite');
  }));

  app.post('/admin/people/:id/link', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    if (p.id === req.me.id) return back(res, '/admin/people/' + p.id, 'Use “My account” to change your own password');
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    const kind = p.passwordHash ? 'reset' : 'invite';
    const link = await issueLink(req, p, kind);
    await log(req.me, req.me.name + (kind === 'invite' ? ' sent a new invite link to ' : ' sent a password reset link to ') + p.name);
    res.render('hub/link-issued', { title: kind === 'invite' ? 'New invite link' : 'Password reset link', person: p, link, kind, linkWarning: linkWarning(req) });
  }));

  app.get('/admin/people/:id/delete', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    const certs = (await db.records.list('certificates')).filter((c) => c.userId === p.id);
    res.render('hub/delete-person', { title: 'Delete ' + p.name, p, certs, error: null });
  }));

  app.post('/admin/people/:id/delete', need('people', 'edit'), wrap(async (req, res) => {
    const p = await personOr404(req, res);
    if (!p) return;
    const blocked = await protection(req.me, p);
    if (blocked) return back(res, '/admin/people/' + p.id, blocked);
    const certs = (await db.records.list('certificates')).filter((c) => c.userId === p.id);
    if (text(req.body.confirm, 120).toLowerCase() !== p.name.toLowerCase()) {
      return res.render('hub/delete-person', { title: 'Delete ' + p.name, p, certs, error: 'Type their name exactly as shown to confirm.' });
    }
    for (const c of certs) { await storage.removeFile(c.key); await db.records.remove('certificates', c.id); }
    for (const r of (await db.records.list('post_reads')).filter((x) => x.userId === p.id)) await db.records.remove('post_reads', r.id);
    await db.records.remove('users', p.id);
    await log(req.me, req.me.name + ' deleted ' + p.name + '’s account' + (certs.length ? ' and ' + certs.length + ' certificate' + (certs.length > 1 ? 's' : '') : ''));
    back(res, '/admin/people', 'Deleted ' + p.name + '’s account');
  }));

  /* ---------- Data requests (UK GDPR) ----------
     Find everything held about a family member or applicant, download it
     for a subject access request, or delete it — CVs included. Job
     applications are also cleared out automatically after RETENTION_DAYS
     (365 by default; 0 switches it off). */
  const RETENTION_DAYS = process.env.RETENTION_DAYS === undefined ? 365 : parseInt(process.env.RETENTION_DAYS, 10) || 0;
  let lastSweep = 0;

  async function clearOld(actor) {
    const removed = await db.expireApplications(RETENTION_DAYS);
    for (const key of removed.cvPaths) await storage.removeFile(key);
    if (removed.count) await log(actor, (actor ? actor.name : 'Automatic clear-out') + ' removed ' + removed.count + ' job application(s) older than ' + RETENTION_DAYS + ' days');
    return removed.count;
  }
  function retentionSweep(actor) {
    if (!RETENTION_DAYS || Date.now() - lastSweep < 86400000) return;
    lastSweep = Date.now();
    clearOld(null).catch((err) => console.error('[retention] sweep failed:', err.message));
  }

  function personQuery(src) {
    return { email: text(src.email, 200), phone: text(src.phone, 40) };
  }

  app.get('/admin/data', need('privacy', 'view'), wrap(async (req, res) => {
    const query = personQuery(req.query);
    const searched = !!(query.email || query.phone);
    const found = searched ? await db.findPersonData(query) : null;
    res.render('hub/data', { title: 'Data requests', query, found, searched, retentionDays: RETENTION_DAYS, canEdit: can(req.me, 'privacy', 'edit') });
  }));

  app.get('/admin/data/export', need('privacy', 'view'), wrap(async (req, res) => {
    const query = personQuery(req.query);
    if (!query.email && !query.phone) return res.redirect('/admin/data');
    const found = await db.findPersonData(query);
    await log(req.me, req.me.name + ' downloaded the personal data held for ' + (query.email || query.phone));
    const who = (query.email || query.phone).replace(/[^a-z0-9.@-]/gi, '_');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="venza-data-' + who + '.json"');
    res.send(JSON.stringify({
      searchedFor: query, exportedAt: new Date().toISOString(), exportedBy: req.me.name,
      jobApplications: found.applications.map((a) => Object.assign({}, a, { cvPath: undefined, cv: a.cvFilename ? a.cvFilename + ' (download separately from the staff hub)' : '' })),
      enquiriesAndVisits: found.messages,
      enquiryProgress: found.progress,
    }, null, 2));
  }));

  app.post('/admin/data/delete', need('privacy', 'edit'), wrap(async (req, res) => {
    const query = personQuery(req.body);
    if (!query.email && !query.phone) return res.redirect('/admin/data');
    if (text(req.body.confirm, 20).toLowerCase() !== 'delete') {
      return back(res, '/admin/data?email=' + encodeURIComponent(query.email) + '&phone=' + encodeURIComponent(query.phone), 'Type DELETE to confirm');
    }
    const removed = await db.deletePersonData(query);
    for (const key of removed.cvPaths) await storage.removeFile(key);
    for (const id of removed.claimIds) await visits.release(id);
    await log(req.me, req.me.name + ' deleted the personal data held for ' + (query.email || query.phone) + ' — ' + removed.applications + ' application(s), ' + removed.messages + ' enquiry/visit record(s)');
    back(res, '/admin/data', 'Deleted ' + (removed.applications + removed.messages) + ' record(s). Nothing about that person remains.');
  }));

  app.post('/admin/data/sweep', need('privacy', 'edit'), wrap(async (req, res) => {
    if (!RETENTION_DAYS) return res.redirect('/admin/data');
    const n = await clearOld(req.me);
    lastSweep = Date.now();
    back(res, '/admin/data', n ? 'Removed ' + n + ' job application(s) older than ' + RETENTION_DAYS + ' days.' : 'Nothing was old enough to remove.');
  }));

  /* ---------- Activity log ---------- */
  app.get('/admin/activity', need('activity', 'view'), wrap(async (req, res) => {
    const entries = (await db.records.list('activity')).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 500);
    res.render('hub/activity', { title: 'Activity log', entries });
  }));

  /* ---------- Certificate reminders (daily, optional) ----------
     Point a daily scheduler (Vercel Cron, or any uptime service) at
     /api/cron/certificates with "Authorization: Bearer <CRON_SECRET>".
     Each certificate is reminded about once at 30 days and once when it
     expires; managers covering that person's home get the email. */
  app.get('/api/cron/certificates', wrap(async (req, res) => {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret || req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ error: 'Not authorised' });
    if (!mailer.configured()) return res.json({ sent: 0, note: 'Email is not set up (RESEND_API_KEY, EMAIL_FROM).' });
    const [certs, users] = await Promise.all([db.records.list('certificates'), auth.allUsers()]);
    const active = users.filter((u) => u.status === 'active');
    let sent = 0;
    for (const c of certs) {
      const st = certState(c).key;
      const stage = st === 'expired' ? 'expired' : st === 'soon' ? 'soon' : null;
      if (!stage || c['reminded_' + stage]) continue;
      const owner = users.find((u) => u.id === c.userId);
      if (!owner) continue;
      const managers = active.filter((u) => u.id !== owner.id && can(u, 'certificates', 'view') && coversPerson(u, owner) && u.email);
      const to = [owner.email].concat(managers.map((m) => m.email)).filter(Boolean);
      sent += await mailer.sendMany(to, {
        subject: (stage === 'expired' ? 'Expired: ' : 'Renew soon: ') + c.name + ' — ' + owner.name,
        heading: stage === 'expired' ? 'A training certificate has expired' : 'A training certificate needs renewing',
        lines: [owner.name + '’s “' + c.name + '” ' + (stage === 'expired' ? 'expired on ' : 'expires on ') + new Date(c.expiresOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '.', 'Once it’s renewed, upload the new certificate in the staff hub.'],
        button: { label: 'Open certificates', url: siteUrl(req) + '/admin/documents?tab=certificates' },
      });
      c['reminded_' + stage] = new Date().toISOString();
      await db.records.put('certificates', c.id, c);
    }
    res.json({ sent });
  }));

  return { certState };
};
