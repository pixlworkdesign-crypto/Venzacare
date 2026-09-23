/* =============================================================
   Staff hub — who can do what
   -------------------------------------------------------------
   Every person has a level for each AREA ("none", "view" or
   "edit") and a set of homes they cover ("all" = whole company).
   An access level (PRESET) only fills in the levels as a starting
   point; the levels themselves are what the app checks.
   ============================================================= */

const AREAS = [
  { key: 'homes', label: 'Homes', hint: 'Home details, CQC rating, manager, photos — add or archive a home', levels: ['none', 'view', 'edit'] },
  { key: 'fees', label: 'Fees', hint: 'Weekly prices shown on the website', levels: ['none', 'view', 'edit'] },
  { key: 'availability', label: 'Room availability', hint: 'The “rooms available” / “waiting list” badge on the website', levels: ['none', 'view', 'edit'] },
  { key: 'enquiries', label: 'Enquiries & visit requests', hint: 'Families asking about care, callbacks and visits', levels: ['none', 'view', 'edit'] },
  { key: 'jobs', label: 'Jobs', hint: 'Post, edit and close vacancies', levels: ['none', 'view', 'edit'] },
  { key: 'applications', label: 'Job applications & CVs', hint: 'Applicants’ details, CVs and recruitment messages', levels: ['none', 'view', 'edit'] },
  { key: 'noticeboard', label: 'Noticeboard', hint: 'Everyone can read. “Edit” means they can post announcements', levels: ['view', 'edit'] },
  { key: 'documents', label: 'Documents library', hint: 'Everyone can read what’s shared with them. “Edit” means upload and replace', levels: ['view', 'edit'] },
  { key: 'certificates', label: 'Other people’s training certificates', hint: 'Everyone can always see and upload their own', levels: ['none', 'view', 'edit'] },
  { key: 'people', label: 'People & access', hint: 'Invite people, change anyone’s access, pause or delete accounts', levels: ['none', 'view', 'edit'] },
  { key: 'activity', label: 'Activity log', hint: 'Who changed what, and when', levels: ['none', 'view'] },
];

const PRESETS = {
  'Owner':            { homes: 'edit', fees: 'edit', availability: 'edit', enquiries: 'edit', jobs: 'edit', applications: 'edit', noticeboard: 'edit', documents: 'edit', certificates: 'edit', people: 'edit', activity: 'view' },
  'Admin':            { homes: 'edit', fees: 'edit', availability: 'edit', enquiries: 'edit', jobs: 'edit', applications: 'edit', noticeboard: 'edit', documents: 'edit', certificates: 'edit', people: 'edit', activity: 'view' },
  'Home manager':     { homes: 'edit', fees: 'edit', availability: 'edit', enquiries: 'edit', jobs: 'edit', applications: 'view', noticeboard: 'edit', documents: 'view', certificates: 'view', people: 'none', activity: 'view' },
  'Recruitment / HR': { homes: 'view', fees: 'none', availability: 'none', enquiries: 'none', jobs: 'edit', applications: 'edit', noticeboard: 'view', documents: 'edit', certificates: 'edit', people: 'none', activity: 'none' },
  'Reception':        { homes: 'view', fees: 'view', availability: 'view', enquiries: 'edit', jobs: 'none', applications: 'none', noticeboard: 'view', documents: 'view', certificates: 'none', people: 'none', activity: 'none' },
  'Carer / staff':    { homes: 'none', fees: 'none', availability: 'none', enquiries: 'none', jobs: 'none', applications: 'none', noticeboard: 'view', documents: 'view', certificates: 'none', people: 'none', activity: 'none' },
};
const PRESET_NAMES = Object.keys(PRESETS);
// Access levels that count as "managers" for documents shared with managers only.
const MANAGER_PRESETS = ['Owner', 'Admin', 'Home manager'];

const RANK = { none: 0, view: 1, edit: 2 };
const LEVEL_WORDS = { none: 'No access', view: 'View', edit: 'Edit' };

/* The account used when someone signs in with ADMIN_USER / ADMIN_PASS from the
   hosting settings: full access, not stored anywhere, can't be paused. It's
   the way in on day one, and the emergency key if every owner is locked out. */
const BUILTIN_OWNER = Object.freeze({
  id: 'owner',
  builtin: true,
  name: 'Site owner',
  email: '',
  title: 'Emergency owner login',
  preset: 'Owner',
  perms: Object.assign({}, PRESETS.Owner),
  homes: 'all',
  status: 'active',
});

function normalisePerms(perms, preset) {
  const base = PRESETS[preset] || PRESETS['Carer / staff'];
  const out = {};
  AREAS.forEach((a) => {
    const v = perms && perms[a.key];
    out[a.key] = a.levels.includes(v) ? v : base[a.key];
  });
  return out;
}

function can(user, area, level) {
  if (!user) return false;
  const have = (user.perms && user.perms[area]) || 'none';
  return RANK[have] >= RANK[level || 'view'];
}

// Does this person cover the given home? Anything without a home (e.g. a
// general enquiry) is only visible to people who cover the whole company.
function covers(user, homeId) {
  if (!user) return false;
  if (user.homes === 'all') return true;
  if (!homeId) return false;
  return Array.isArray(user.homes) && user.homes.includes(homeId);
}

function isCustom(user) {
  const base = PRESETS[user.preset];
  if (!base) return false;
  return AREAS.some((a) => base[a.key] !== user.perms[a.key]);
}

function homesLabel(user, homeList) {
  if (user.homes === 'all') return 'Whole company';
  const names = (user.homes || []).map((id) => {
    const h = (homeList || []).find((x) => x.id === id);
    return h ? h.name : id;
  });
  return names.join(', ') || 'No homes';
}

module.exports = {
  AREAS, PRESETS, PRESET_NAMES, MANAGER_PRESETS, RANK, LEVEL_WORDS, BUILTIN_OWNER,
  normalisePerms, can, covers, isCustom, homesLabel,
};
