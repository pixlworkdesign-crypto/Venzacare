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
- **Book a visit instantly** — each home page shows free visiting times for the next few weeks; the family picks one and it's confirmed on the spot (with an add-to-calendar link). Double bookings are impossible, even when two people click at once. Each home sets its own days, times, visits per slot, notice and closed dates in the staff hub. "None of these times work?" still sends a request

**Staff hub** (`/admin`, also `/staff`)
- **Individual accounts** — invite people by email (or pass on the link yourself), passwords hashed with scrypt, forgotten-password links, pause and delete
- **Access for each person** — an access level (Owner, Admin, Home manager, Recruitment / HR, Reception, Carer / staff) fills in None / View / Edit for each area, and any of them can be changed per person. Each person covers the whole company or chosen homes, and only sees those homes' enquiries, jobs, applications and certificates
- **Owner accounts are locked** — nobody in the hub can change, pause, delete or reset an owner; only the emergency owner login can. Only owners can make someone an owner. Nobody can change their own access
- **Homes** — edit details, fees and availability (separate permissions), CQC and managers; add a home; archive / make live
- **Enquiries** — every visit request, callback and message, moved through Needs a call → Called → Visit booked → Visited → Moved in
- **Jobs & applications** — as before, now limited to the homes a person covers
- **Noticeboard** — posts for everyone, a home or a role; pin, must-read with "seen by", optional email
- **Documents** — policies, handbook and forms with folders, managers-only documents and version history
- **Training certificates** — everyone uploads their own; managers see their homes'; expiry warnings and optional email reminders
- **Staff directory** and an **activity log** of every change

## Run it

```bash
npm install
npm start
```

Then open:
- Public site → http://localhost:3000
- Admin backoffice → http://localhost:3000/admin/login

**Local emergency owner login:** `admin` / `venza2026` — development only. Sign
in with it, open **People & access**, invite yourself as an Owner, and use your
own account from then on.

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
| `SESSION_SECRET` | Signs sign-in cookies. **Required** — without it the staff hub is switched off. Long and random |
| `ADMIN_USER`, `ADMIN_PASS` | The **emergency owner login**: how you get in on day one, and the only way to change an owner's account. Keep it secret |
| `DATABASE_URL` | Supabase Postgres. Without it, data is lost on every cold start |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | CV storage |

| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Sends invite, reset, noticeboard, visit-confirmation and certificate emails through resend.com. Without them, invite and reset links are shown on screen to pass on |
| `CRON_SECRET` | Optional. Protects `/api/cron/certificates` — point a daily scheduler at it with `Authorization: Bearer <CRON_SECRET>` to email certificate reminders |
| `SITE_URL` | The live address, e.g. `https://www.venzacare.co.uk` — used for canonical links, the sitemap and social previews |

**4. Check it worked**

Open `/api/health` on the live site. It says whether the database is connected
and, if not, what's wrong in plain English. The admin dashboard shows the same
warning at the top.

### Updating an existing database

The staff hub adds a `hub_records` table. After deploying this version, run
`sql/schema.sql` again in the Supabase SQL editor (or `npm run migrate`). It's
safe to re-run: nothing is dropped. `/api/health` tells you if it's missing.

### "My password isn't working" — checklist

- **Staff sign in with their email and the password they chose from their invite.**
  The emergency owner login is `ADMIN_USER` / `ADMIN_PASS` from Vercel — not your
  Supabase password, which only goes inside `DATABASE_URL`.
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
