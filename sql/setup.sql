-- =============================================================
-- Venza Care UK — one-shot database setup
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once: nothing is dropped or overwritten.
-- =============================================================

-- =============================================================
-- Venza Care UK — database schema
-- Runs on Supabase (Postgres). Safe to re-run: every statement
-- is guarded with IF NOT EXISTS.
-- =============================================================

create table if not exists settings (
  key    text primary key,
  value  jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists homes (
  id            text primary key,
  name          text not null,
  town          text not null default '',
  postcode      text not null default '',
  region        text not null default '',
  lat           double precision,
  lng           double precision,
  beds          integer,
  cqc           text not null default 'Registered',
  care_types    text[] not null default '{}',
  specialisms   text[] not null default '{}',
  blurb         text not null default '',
  dementia_note text not null default '',
  photo         text not null default '',
  gallery       text[] not null default '{}',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists jobs (
  id               text primary key,
  title            text not null,
  service          text not null default 'Residential Care',
  location         text not null default '',
  home_id          text references homes(id) on delete set null,
  employment_type  text not null default 'Full-time',
  salary           text not null default '',
  hours            text not null default '',
  closing_date     text not null default '',
  summary          text not null default '',
  description      text not null default '',
  responsibilities text[] not null default '{}',
  requirements     text[] not null default '{}',
  status           text not null default 'open' check (status in ('open','closed')),
  featured         boolean not null default false,
  posted_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists jobs_status_idx on jobs (status, posted_at desc);
create index if not exists jobs_home_idx on jobs (home_id);

create table if not exists applications (
  id            text primary key,
  job_id        text references jobs(id) on delete cascade,
  job_title     text not null default '',
  name          text not null default '',
  email         text not null default '',
  phone         text not null default '',
  right_to_work text not null default '',
  message       text not null default '',
  cv_filename   text not null default '',
  cv_path       text not null default '',
  status        text not null default 'new',
  notes         text not null default '',
  applied_at    timestamptz not null default now()
);
create index if not exists applications_job_idx on applications (job_id, applied_at desc);
create index if not exists applications_applied_idx on applications (applied_at desc);

create table if not exists messages (
  id         text primary key,
  kind       text not null default 'enquiry' check (kind in ('enquiry','callback')),
  name       text not null default '',
  email      text not null default '',
  phone      text not null default '',
  subject    text not null default '',
  message    text not null default '',
  best_time  text not null default '',
  home       text not null default '',
  status     text not null default 'new',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists messages_created_idx on messages (created_at desc);

-- ---------- Site settings ----------
insert into settings (key, value) values ('site', '{"name":"Venza Care UK","phone":"0800 470 1925","email":"enquiries@venzacare.co.uk","address":"Venza Care UK Ltd, 1 Croydon Gateway, Croydon CR0 2AB","regions":["London","Kent","Cambridgeshire"]}'::jsonb) on conflict (key) do nothing;

-- ---------- Care homes ----------
insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                   care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)
values ('croydon-house', 'Albany Lodge', 'Croydon', 'CR0 2BZ', 'London', 51.3727, -0.1099, 100, 'Registered',
        array['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care']::text[], array['Parkinson’s disease', 'Stroke recovery', 'COPD & pulmonary disease', 'Convalescent care', 'Mental health support', 'Physical disability', 'Visual & hearing impairment']::text[], 'One of our largest homes, a warm and busy place in the heart of Croydon, offering residential, nursing and dementia care for up to 100 residents.', 'Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.', 'albany/exterior.webp', array['albany/01.webp', 'albany/02.webp', 'albany/03.webp', 'albany/04.webp']::text[], 0)
on conflict (id) do nothing;

insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                   care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)
values ('ealing-lodge', 'Kippingtons', 'Sevenoaks', 'TN13 2PG', 'Kent', 51.2722, 0.19, 55, 'Good',
        array['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care']::text[], array['Parkinson’s disease', 'Stroke recovery', 'COPD & pulmonary disease', 'Convalescent care', 'Acquired brain injury (ABI)']::text[], 'A welcoming care home set in a characterful manor in the heart of Sevenoaks, offering residential, nursing and dementia care.', 'Residential and nursing dementia care, for people living with mild to moderate dementia.', 'kippingtons/exterior.webp', array['kippingtons/01.webp', 'kippingtons/02.webp', 'kippingtons/03.webp', 'kippingtons/04.webp', 'kippingtons/05.webp', 'kippingtons/06.webp', 'kippingtons/07.webp', 'kippingtons/08.webp', 'kippingtons/09.webp', 'kippingtons/10.webp', 'kippingtons/11.webp']::text[], 1)
on conflict (id) do nothing;

insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                   care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)
values ('enfield-court', 'Kentford Manor', 'Newmarket', 'CB8 8JY', 'Cambridgeshire', 52.2453, 0.404, 88, 'Good',
        array['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care']::text[], array['Convalescent care', 'Physical disability']::text[], 'A spacious, modern home near Newmarket offering residential, nursing, dementia and end-of-life care.', 'Residential and nursing dementia care, for people living with mild, moderate and advanced dementia.', 'kentford/exterior.webp', array['kentford/01.webp', 'kentford/02.webp', 'kentford/03.webp', 'kentford/04.webp', 'kentford/05.webp', 'kentford/06.webp', 'kentford/07.webp', 'kentford/08.webp', 'kentford/09.webp', 'kentford/10.webp', 'kentford/11.webp', 'kentford/12.webp', 'kentford/13.webp', 'kentford/14.webp', 'kentford/15.webp', 'kentford/16.webp', 'kentford/17.webp']::text[], 2)
on conflict (id) do nothing;

insert into homes (id, name, town, postcode, region, lat, lng, beds, cqc,
                   care_types, specialisms, blurb, dementia_note, photo, gallery, sort_order)
values ('bedford-grange', 'Fieldway', 'Mitcham', 'CR4 4SJ', 'London', 51.4006, -0.154, 68, 'Good',
        array['Residential Care', 'Nursing Care', 'Dementia Care', 'Respite Care', 'End-of-life Care']::text[], array['Parkinson’s disease', 'Stroke recovery', 'Convalescent care', 'Physical disability', 'Visual & hearing impairment']::text[], 'A friendly home in Mitcham offering residential, nursing and dementia care, with a dedicated dementia floor.', 'Residential and nursing dementia care, for people living with moderate dementia. Fieldway has a dedicated dementia floor.', 'fieldway/exterior.webp', array['fieldway/01.webp', 'fieldway/02.webp', 'fieldway/03.webp', 'fieldway/04.webp', 'fieldway/05.webp', 'fieldway/06.webp']::text[], 3)
on conflict (id) do nothing;

-- No vacancies are created. Post real ones through /admin.
