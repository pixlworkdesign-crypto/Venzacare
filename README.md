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
- **Contact** — enquiry form and callback requests
- **Fees & funding** — weekly prices per home, what's included, extras, deposits and funding help
- **CQC ratings** — every home's rating with links to the reports (and the CQC widget when a location ID is set)
- **FAQs** — common questions plus a "what to bring" checklist
- **Book a visit** — a form on every home page

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
| `ADMIN_USER`, `ADMIN_PASS` | Admin sign-in. **Required** — without them the public site runs but `/admin` is switched off, because this repo is public |
| `SESSION_SECRET` | Signs the admin session cookie. Long and random |
| `DATABASE_URL` | Supabase Postgres. Without it, data is lost on every cold start |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | CV storage |

| `SITE_URL` | The live address, e.g. `https://www.venzacare.co.uk` — used for canonical links, the sitemap and social previews |

**4. Check it worked**

Open `/api/health` on the live site. It says whether the database is connected
and, if not, what's wrong in plain English. The admin dashboard shows the same
warning at the top.

### "My password isn't working" — checklist

- **The admin password is `ADMIN_PASS`, not your Supabase password.** Supabase's
  database password only goes inside `DATABASE_URL`. You sign in to `/admin` with
  `ADMIN_USER` / `ADMIN_PASS` from Vercel's environment variables.
- **Redeploy after changing environment variables.** Vercel only picks up new
  values on the next deployment.
- **Make sure the Supabase code is what's deployed.** If Vercel deploys `main`,
  this branch has to be merged first.
- **Use the Transaction pooler string** (host `…pooler.supabase.com`, port
  `6543`, user `postgres.<project-ref>`). The direct `db.<ref>.supabase.co` host
  is IPv6-only and Vercel can't reach it.
- **URL-encode special characters in the database password** — `@` → `%40`,
  `#` → `%23`, `/` → `%2F`, `?` → `%3F`, `%` → `%25` — or reset it in Supabase to
  letters and numbers only.
- **Run the migration** (step 2). Without the tables, the site falls back to the
  built-in homes and nothing saves.

### Content to confirm before going live

- Fee terms in `content.js` (what's included, extras, deposits, fee reviews,
  fees after death) are typical CMA-compliant wording, **not** confirmed policy.
  They must match your residents' contract.
- Fees, availability, CQC ratings and location IDs, managers and review links are
  entered per home in **Admin → Homes**. Blank fields are simply hidden.

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
