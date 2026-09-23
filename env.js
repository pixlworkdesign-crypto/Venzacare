/* =============================================================
   Loads a local .env file into process.env (development only).
   -------------------------------------------------------------
   Hosting platforms like Vercel set real environment variables,
   which always win — a value already in process.env is never
   overwritten. Lines look like KEY=value; "# comments" after a
   space are ignored, and surrounding quotes are removed.
   ============================================================= */

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '.env');
if (fs.existsSync(file)) {
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]] !== undefined) return;
    let value = m[2];
    const quoted = value.match(/^(["'])(.*)\1\s*(#.*)?$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim();
    process.env[m[1]] = value;
  });
}
