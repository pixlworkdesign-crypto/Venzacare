#!/usr/bin/env node
/* =============================================================
   Venza Care UK — database setup / migration
   -------------------------------------------------------------
   Usage:  DATABASE_URL="postgresql://..." npm run migrate

   What it does:
     1. Creates the tables (safe to re-run — nothing is dropped)
     2. Seeds site settings, if they aren't there yet
     3. Copies the care homes from db.js into the database, but
        only ones that don't already exist — so re-running never
        overwrites edits made through the admin

   It deliberately creates NO vacancies. The careers board starts
   empty and is filled in through the admin.
   ============================================================= */

require('../env');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const db = require('../db.js');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL is not set.\n');
  console.error('  Find it in Supabase: Project Settings → Database → Connection string');
  console.error('  (use the "Connection pooling" / Transaction-mode string).\n');
  console.error('  Then run:  DATABASE_URL="postgresql://..." npm run migrate\n');
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
db.connectionProblems(url).forEach((p) => console.error('  ! ' + p));
const pool = new Pool({ connectionString: db.stripSslParams(url), ssl: isLocal ? false : { rejectUnauthorized: false } });

(async () => {
  console.log('\n→ Connecting…');
  await pool.query('select 1');
  console.log('  connected.');

  console.log('→ Creating tables…');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('  tables ready.');

  console.log('→ Site settings…');
  const existing = await pool.query("select value from settings where key = 'site'");
  if (existing.rows.length) {
    console.log('  already set — left alone.');
  } else {
    await pool.query("insert into settings (key, value) values ('site', $1)", [JSON.stringify(db.DEFAULT_SITE)]);
    console.log('  seeded from db.js defaults.');
  }

  console.log('→ Care homes…');
  let added = 0;
  let skipped = 0;
  for (const [i, h] of db.DEFAULT_HOMES.entries()) {
    const found = await pool.query('select 1 from homes where id = $1', [h.id]);
    if (found.rows.length) { skipped++; continue; }
    await pool.query(
      `insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                          care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [h.id, h.name, h.town, h.postcode, h.region, h.lat, h.lng, h.beds, h.cqc,
       h.careTypes || [], h.specialisms || [], h.blurb || '', h.dementiaNote || '',
       h.photo || '', h.gallery || [], i]
    );
    added++;
  }
  console.log(`  ${added} added, ${skipped} already there.`);

  const jobCount = await pool.query('select count(*)::int as n from jobs');
  console.log(`\n✓ Done. Vacancies in the database: ${jobCount.rows[0].n}`);
  console.log('  (Post real vacancies through /admin — none are seeded.)\n');

  await pool.end();
})().catch((err) => {
  console.error('\n✗ Migration failed:', err.message, '\n');
  process.exit(1);
});
