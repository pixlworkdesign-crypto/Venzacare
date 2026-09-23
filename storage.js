/* =============================================================
   Venza Care UK — file storage (CVs, and later home photos)
   -------------------------------------------------------------
   Two backends, chosen by environment:

     • Supabase Storage — when SUPABASE_URL and
       SUPABASE_SERVICE_ROLE_KEY are set. Files go into a PRIVATE
       bucket and are only reachable through short-lived signed
       links generated for a logged-in admin.
     • Local disk — the development fallback, writing to
       data/uploads (outside public/, so nothing is served
       statically and CVs can't be fetched by guessing a URL).

   Either way, applicants' CVs are never publicly downloadable.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CV_BUCKET = process.env.SUPABASE_CV_BUCKET || 'cvs';
const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'home-photos';

const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

// CVs live outside public/ on purpose — see header. Home photos are meant to
// be seen, so those go under public/ and are served like any other image.
const LOCAL_BASE = process.env.VERCEL ? '/tmp' : __dirname;
const LOCAL_DIR = path.join(LOCAL_BASE, 'data', 'uploads');
const PHOTO_DIR = path.join(LOCAL_BASE, 'public', 'images', 'uploads');

let client = null;
function supabase() {
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

function safeName(original) {
  const cleaned = (original || 'cv').replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-80);
  return Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + cleaned;
}

/* Save an uploaded file (multer memoryStorage gives us file.buffer).
   Returns { filename, key } — filename for display, key for retrieval. */
async function saveCv(file) {
  if (!file || !file.buffer) return { filename: '', key: '' };
  const key = safeName(file.originalname);

  if (useSupabase) {
    const { error } = await supabase()
      .storage
      .from(CV_BUCKET)
      .upload(key, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw new Error('CV upload failed: ' + error.message);
    return { filename: file.originalname, key };
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, key), file.buffer);
  return { filename: file.originalname, key };
}

/* A short-lived download link for an admin. Supabase returns a signed
   URL; locally we stream the file back through the admin route. */
async function cvDownloadUrl(key, seconds = 120) {
  if (!key) return null;
  if (!useSupabase) return null; // caller streams from disk instead
  const { data, error } = await supabase().storage.from(CV_BUCKET).createSignedUrl(key, seconds);
  if (error) throw new Error('Could not create download link: ' + error.message);
  return data.signedUrl;
}

/* Home photos — public, unlike CVs. Returns a URL the site can render
   directly, whether that's a Supabase public URL or a local /images path. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

async function savePhoto(file) {
  if (!file || !file.buffer) return '';
  if (file.mimetype && PHOTO_TYPES.indexOf(file.mimetype) === -1) {
    throw new Error('That file is not an image. Use a JPG, PNG or WebP.');
  }
  const key = safeName(file.originalname);

  if (useSupabase) {
    const { error } = await supabase()
      .storage
      .from(PHOTO_BUCKET)
      .upload(key, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
    if (error) throw new Error('Photo upload failed: ' + error.message);
    const { data } = supabase().storage.from(PHOTO_BUCKET).getPublicUrl(key);
    return data.publicUrl;
  }

  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, key), file.buffer);
  return '/images/uploads/' + key;
}

/* Remove a CV for good — used when someone asks to be forgotten, and by the
   retention sweep. Missing files are not an error: the goal is that it's gone. */
async function deleteCv(key) {
  if (!key) return true;
  if (useSupabase) {
    const { error } = await supabase().storage.from(CV_BUCKET).remove([key]);
    if (error) {
      console.error('[storage] could not delete CV:', error.message);
      return false;
    }
    return true;
  }
  try {
    const full = path.join(LOCAL_DIR, path.basename(key));
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return true;
  } catch (err) {
    console.error('[storage] could not delete CV:', err.message);
    return false;
  }
}

function localCvPath(key) {
  if (!key) return null;
  const full = path.join(LOCAL_DIR, path.basename(key));
  return fs.existsSync(full) ? full : null;
}

module.exports = {
  saveCv,
  cvDownloadUrl,
  deleteCv,
  localCvPath,
  savePhoto,
  backendKind: useSupabase ? 'supabase' : 'local',
};
