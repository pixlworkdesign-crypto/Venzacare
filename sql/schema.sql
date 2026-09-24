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

-- ---- Additions (safe to re-run on an existing database) ----------------

-- Per-home extras: fees, availability, manager, CQC location id, reviews.
alter table homes add column if not exists details jsonb not null default '{}'::jsonb;

-- Visit bookings arrive as their own kind of message.
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('enquiry','callback','visit'));

-- Supabase exposes every table in the public schema through its REST API.
-- This app talks to Postgres directly, so switch on row-level security with
-- no policies: the public API gets nothing, the server connection is unaffected.
alter table settings     enable row level security;
alter table homes        enable row level security;
alter table jobs         enable row level security;
alter table applications enable row level security;
alter table messages     enable row level security;

-- ---- Staff hub -----------------------------------------------------------
-- People, noticeboard posts, read receipts, documents, certificates,
-- enquiry progress and the activity log. Each is a small collection of
-- JSON records: the numbers are tiny (hundreds of rows), and one shape
-- keeps the local-file and Postgres backends identical.
create table if not exists hub_records (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists hub_records_collection_idx on hub_records (collection, created_at desc);
-- One account per email address.
create unique index if not exists hub_users_email_idx
  on hub_records (lower(data->>'email')) where collection = 'users';
alter table hub_records enable row level security;
