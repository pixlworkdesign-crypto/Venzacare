/* =============================================================
   Venza Care UK — private file storage (CVs, staff documents, certificates)
   -------------------------------------------------------------
   Two backends, chosen by environment:

     • Supabase Storage — when SUPABASE_URL and
       SUPABASE_SERVICE_ROLE_KEY are set. Files go into a PRIVATE
       bucket and are only reachable through short-lived signed
       links generated for a logged-in admin.
     • Local disk — the development fallback, writing to
       data/uploads (outside public/, so nothing is served
       statically and CVs can't be fetched by guessing a URL).

   Either way, nothing stored here is ever publicly downloadable.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CV_BUCKET = process.env.SUPABASE_CV_BUCKET || 'cvs';

const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

// Local fallback lives outside public/ on purpose — see header.
const LOCAL_BASE = process.env.VERCEL ? '/tmp' : __dirname;
const LOCAL_DIR = path.join(LOCAL_BASE, 'data', 'uploads');

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

/* Save an uploaded file (multer memoryStorage gives us file.buffer) under a
   folder such as 'cvs', 'documents' or 'certificates'. Returns
   { filename, key } — filename for display, key for retrieval. */
async function saveFile(folder, file) {
  if (!file || !file.buffer) return { filename: '', key: '' };
  const key = (folder ? folder + '/' : '') + safeName(file.originalname);

  if (useSupabase) {
    const { error } = await supabase()
      .storage
      .from(CV_BUCKET)
      .upload(key, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw new Error('Upload failed: ' + error.message);
    return { filename: file.originalname, key };
  }

  const full = localPath(key, true);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, file.buffer);
  return { filename: file.originalname, key };
}

// CVs keep their original flat layout so existing keys still resolve.
async function saveCv(file) {
  return saveFile('', file);
}

/* A short-lived download link for a signed-in user. Supabase returns a signed
   URL; locally the caller streams the file from disk instead. */
async function downloadUrl(key, seconds = 120) {
  if (!key) return null;
  if (!useSupabase) return null;
  const { data, error } = await supabase().storage.from(CV_BUCKET).createSignedUrl(key, seconds);
  if (error) throw new Error('Could not create download link: ' + error.message);
  return data.signedUrl;
}

async function removeFile(key) {
  if (!key) return;
  try {
    if (useSupabase) {
      await supabase().storage.from(CV_BUCKET).remove([key]);
    } else {
      const full = localPath(key);
      if (full) fs.unlinkSync(full);
    }
  } catch (err) {
    console.error('[storage] could not remove ' + key + ':', err.message);
  }
}

/* Resolve a key to a path inside the local upload folder, refusing anything
   that would escape it (e.g. "../"). */
function localPath(key, forWriting) {
  if (!key) return null;
  const full = path.resolve(LOCAL_DIR, key);
  if (!full.startsWith(path.resolve(LOCAL_DIR) + path.sep)) return null;
  if (forWriting) return full;
  return fs.existsSync(full) ? full : null;
}

module.exports = {
  saveFile, saveCv, downloadUrl, removeFile, localPath,
  cvDownloadUrl: downloadUrl,
  localCvPath: localPath,
  backendKind: useSupabase ? 'supabase' : 'local',
};
