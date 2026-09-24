/* =============================================================
   Staff hub — accounts, passwords and sessions
   -------------------------------------------------------------
   • Passwords are hashed with scrypt (built into Node) and a
     per-user salt; the plain password is never stored.
   • The session is a signed cookie naming the user and their
     "session version". Pausing, deleting or resetting a person
     bumps the version, which signs them out everywhere at once.
   • Invite and reset links carry a random token; only its hash is
     stored, and it expires.
   ============================================================= */

const crypto = require('crypto');
const db = require('../db');
const { BUILTIN_OWNER, normalisePerms } = require('./access');

const COOKIE = 'vc_admin';
const SESSION_HOURS = 12;

/* ---------- Passwords ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => {
      if (err) return reject(err);
      resolve(['scrypt', SCRYPT.N, salt.toString('base64'), key.toString('base64')].join('$'));
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return resolve(false);
    const N = parseInt(parts[1], 10);
    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    crypto.scrypt(String(password), salt, expected.length, { N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => {
      if (err) return resolve(false);
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

// A real scrypt hash of a random password, checked when an email has no
// account, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = 'scrypt$16384$' + crypto.randomBytes(16).toString('base64') + '$' + crypto.randomBytes(64).toString('base64');

function passwordProblem(password) {
  if (!password || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(password)) return 'Please choose a less predictable password.';
  return null;
}

/* ---------- One-time links (invite / reset) ---------- */
function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/* ---------- Session cookie ---------- */
function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function sessionToken(secret, user) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = ['v2', user.id, user.sessionVersion || 0, exp].join('.');
  return payload + '.' + sign(secret, payload);
}

function readSession(secret, token) {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v2') return null;
  const payload = parts.slice(0, 4).join('.');
  const a = Buffer.from(parts[4]);
  const b = Buffer.from(sign(secret, payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (parseInt(parts[3], 10) < Date.now()) return null;
  return { id: parts[1], version: parseInt(parts[2], 10) || 0 };
}

function setSessionCookie(res, secret, user) {
  res.cookie(COOKIE, sessionToken(secret, user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ---------- People ---------- */
function shapeUser(u) {
  if (!u) return null;
  return Object.assign({ homes: [], status: 'invited', sessionVersion: 0, title: '', phone: '' }, u, {
    perms: normalisePerms(u.perms, u.preset),
  });
}

async function allUsers() {
  return (await db.records.list('users')).map(shapeUser);
}

async function getUser(id) {
  if (id === BUILTIN_OWNER.id) return BUILTIN_OWNER;
  return shapeUser(await db.records.get('users', id));
}

async function findByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return (await allUsers()).find((u) => (u.email || '').toLowerCase() === e) || null;
}

async function saveUser(user) {
  const copy = Object.assign({}, user);
  delete copy.builtin;
  await db.records.put('users', user.id, copy);
}

// Who's signed in on this request (or null). Paused, deleted and signed-out
// people fail here even if their browser still holds an old cookie.
async function currentUser(req, secret) {
  const s = readSession(secret, readCookie(req, COOKIE));
  if (!s) return null;
  const user = await getUser(s.id);
  if (!user || user.status !== 'active') return null;
  if (!user.builtin && (user.sessionVersion || 0) !== s.version) return null;
  return user;
}

/* ---------- Sign-in throttling ---------- */
// Five wrong passwords for the same email from the same address locks that
// pair out for 15 minutes. Kept in memory: good enough to stop guessing.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function throttleKey(req, id) { return (req.ip || '') + '|' + String(id || '').toLowerCase(); }
function isLockedOut(req, id) {
  const a = attempts.get(throttleKey(req, id));
  return !!(a && a.count >= 5 && Date.now() - a.first < WINDOW_MS);
}
function recordFailure(req, id) {
  const k = throttleKey(req, id);
  const a = attempts.get(k);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(k, { count: 1, first: Date.now() });
  else a.count++;
}
function clearFailures(req, id) { attempts.delete(throttleKey(req, id)); }

module.exports = {
  COOKIE, DUMMY_HASH, hashPassword, verifyPassword, passwordProblem, newToken, hashToken,
  setSessionCookie, clearSessionCookie, currentUser,
  allUsers, getUser, findByEmail, saveUser, shapeUser,
  isLockedOut, recordFailure, clearFailures,
};
