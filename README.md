# Venza Care UK

A modern UK care-group website with a built-in **careers board** and an **admin backoffice** for managing vacancies and applications. Inspired by the best of UK care brands (e.g. Barchester), localised for the UK: CQC regulation, UK care terminology, £ salaries, UK spelling.

> All content is realistic **placeholder** data — swap names, locations, phone, address and imagery for the real thing before going live.

## What's inside

**Public site**
- Homepage — hero, care-home finder, care types, life-enrichment, stats, featured homes, guides, careers band, testimonials, awards
- **Our care** — the six care types (residential, nursing, complex & high-acuity, dementia, respite, palliative)
- **Find a home** — searchable/filterable care-home directory + individual home pages
- **Careers** — filterable jobs board pulling live from the backoffice
- **Job detail + application form** — with optional CV upload
- **Contact** — enquiry form

**Admin backoffice** (`/admin`)
- Secure login
- Dashboard with live stats
- Create / edit / close / delete vacancies — published jobs appear instantly on the public careers page
- Review all applications (with CV downloads), filterable by role
- Read contact enquiries

## Run it

```bash
npm install
npm start
```

Then open:
- Public site → http://localhost:3000
- Admin backoffice → http://localhost:3000/admin/login

**Local admin login:** `admin` / `venza2026` — development only. In production
these must be set in the environment; the app refuses to start otherwise.

With no `DATABASE_URL` set, the app runs on a local JSON file and seeds the four
care homes from `db.js` so you have something to look at. No vacancies are
seeded — post them through the admin.

## Production setup (Supabase)

The site runs on Vercel, where the filesystem is read-only and wiped between
requests. Anything the app saves — vacancies, applications, enquiries, CVs —
must therefore live outside the container. That's what Supabase is for.

**1. Create the Supabase project**

Sign up at supabase.com and create a project. Then:

- **Project Settings → Database → Connection string → Transaction pooler**
  Copy it; this is `DATABASE_URL`. Put your database password into the URL where
  it says `[YOUR-PASSWORD]`.
- **Project Settings → API** — copy the Project URL (`SUPABASE_URL`) and the
  `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`). The service role key bypasses
  row-level security, so it is server-side only — never put it in client code.
- **Storage → New bucket** — create one named `cvs` and leave it **private**.
  Applicants' CVs go here and are only reachable through short-lived signed links
  generated for a signed-in admin.

**2. Create the tables**

```bash
DATABASE_URL="postgresql://..." npm run migrate
```

This creates the schema (`sql/schema.sql`), seeds site settings, and copies the
care homes across. It is safe to re-run: nothing is dropped, and homes you've
since edited in the admin are left alone.

**3. Set the environment variables in Vercel**

Settings → Environment Variables, then redeploy. See `.env.example` for the full
list. At minimum:

| Variable | Why |
|---|---|
| `ADMIN_USER`, `ADMIN_PASS` | Admin sign-in. **Required** — the app won't boot without a password, because this repo is public |
| `SESSION_SECRET` | Signs the admin session cookie. Long and random |
| `DATABASE_URL` | Supabase Postgres. Without it, data is lost on every cold start |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | CV storage |

### Other optional settings

Set environment variables to override defaults:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASS` | `venza2026` | Admin password |
| `SESSION_SECRET` | dev value | Session signing secret |
| `ANTHROPIC_API_KEY` | _(none)_ | Enables the AI chat assistant. Get a key from console.anthropic.com. Without it, the chat widget politely says it isn't switched on. |
| `CHAT_MODEL` | `claude-opus-4-8` | Which Claude model the assistant uses. Set to `claude-haiku-4-5` for a cheaper/faster option. |

```bash
ADMIN_PASS=mySecret SESSION_SECRET=long-random-string ANTHROPIC_API_KEY=sk-ant-... npm start
```

## AI assistant

A chat bubble (bottom-right) lets visitors ask questions and get answers grounded **only** in the site's own content — the homes in `db.js`, the care types, the live job vacancies and the contact details. It calls the Claude Messages API from `POST /api/chat` in `server.js`; the knowledge base is assembled by `buildKnowledge()` there, so it stays in sync automatically as you edit `db.js`. Set `ANTHROPIC_API_KEY` to switch it on.

## How it works

- **Express + EJS** server-rendered pages — no build step, no native dependencies.
- **Data** is stored in `data/db.json` (auto-created and seeded on first run). Jobs, applications and enquiries all live here. Delete the file to reset to seed data.
- **CV uploads** are saved to `public/uploads/`.
- For production scale, swap the JSON store in `db.js` for SQLite/Postgres and put it behind HTTPS with a hashed admin password.

## Imagery

Most sections use a self-contained branded visual system — teal gradient meshes with the Venza "V" motif (in `public/css/styles.css`), so nothing depends on external images.

A few high-impact spots use **placeholder photography** stored in `public/images/`:

| File | Used on | Source |
|---|---|---|
| `hero.jpg` | Homepage hero | Pexels (free commercial licence) |
| `life.jpg` | Homepage "Meaningful moments" section | Pexels (free commercial licence) |
| `careers.jpg` | Careers page hero | Pexels (free commercial licence) |
| `logo.png`, `logo-white.png` | Brand logos | Venza Care |

These Pexels photos are free for commercial use and require no attribution — they're temporary placeholders. **To use your own photography**, just replace the files in `public/images/` keeping the same filenames (or update the `background-image` paths in `views/index.ejs` and `views/careers.ejs`). To add photos to more sections, swap a `.split__media` / `.home-card__media` background for an image the same way.

## Project structure

```
venza-care-uk/
├── server.js            # routes (public + admin)
├── db.js                # JSON data store + seed data
├── data/db.json         # generated on first run
├── public/
│   ├── css/styles.css   # design system
│   ├── js/main.js
│   └── uploads/         # submitted CVs
└── views/               # EJS templates (+ partials, + admin)
```
