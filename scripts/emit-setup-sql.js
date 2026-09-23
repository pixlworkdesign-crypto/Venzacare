#!/usr/bin/env node
/* Emits the complete one-shot setup SQL (schema + settings + care homes) so it
   can be pasted into Supabase's SQL Editor. No credentials needed:
     node scripts/emit-setup-sql.js > sql/setup.sql                            */

const fs = require('fs');
const path = require('path');
const db = require('../db.js');

const q = (v) => (v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const arr = (list) => (!list || !list.length ? "'{}'" : 'array[' + list.map(q).join(', ') + ']::text[]');
const nm = (v) => (v === null || v === undefined || v === '' ? 'null' : Number(v));

const out = [];
out.push('-- =============================================================');
out.push('-- Venza Care UK — one-shot database setup');
out.push('-- Paste this whole file into Supabase → SQL Editor → Run.');
out.push('-- Safe to run more than once: nothing is dropped or overwritten.');
out.push('-- =============================================================');
out.push('');
out.push(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8').trim());
out.push('');
out.push('-- ---------- Site settings ----------');
out.push(
  "insert into settings (key, value) values ('site', " +
    q(JSON.stringify(db.DEFAULT_SITE)) +
    '::jsonb) on conflict (key) do nothing;'
);
out.push('');
out.push('-- ---------- Care homes ----------');
db.DEFAULT_HOMES.forEach((h, i) => {
  out.push(
    'insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,\n' +
      '                   care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)\n' +
      'values (' +
      [q(h.id), q(h.name), q(h.town), q(h.postcode), q(h.region), nm(h.lat), nm(h.lng), nm(h.beds), q(h.cqc)].join(', ') +
      ',\n        ' +
      [arr(h.careTypes), arr(h.specialisms), q(h.blurb), q(h.dementiaNote), q(h.photo), arr(h.gallery), i].join(', ') +
      ')\non conflict (id) do nothing;'
  );
  out.push('');
});
out.push('-- No vacancies are created. Post real ones through /admin.');
process.stdout.write(out.join('\n') + '\n');
