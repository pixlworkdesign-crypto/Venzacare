/* =============================================================
   Venza Care UK — password hashing
   -------------------------------------------------------------
   Uses scrypt from Node's own crypto module, so there's no
   native dependency to build on a serverless host.

   Stored form:  scrypt$<salt hex>$<hash hex>
   ============================================================= */

const crypto = require('crypto');

const KEYLEN = 64;
const SALT_BYTES = 16;

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

/* Comparison is constant-time, so a wrong password can't be narrowed down by
   how long the check takes. */
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  try {
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(String(password), parts[1], expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (err) {
    return false;
  }
}

/* Long enough to matter, short enough that people will actually use it. */
function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 10) return 'Use at least 10 characters.';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Include at least one letter and one number.';
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem };
