/* =============================================================
   Venza Care UK — shared page content and structured data
   -------------------------------------------------------------
   FAQ copy lives here (not in the templates) because it is used
   twice: rendered on the page, and emitted as schema.org
   FAQPage data so search engines can show it.
   ============================================================= */

/* ---------- CQC ratings ---------- */
const CQC_RATINGS = ['Outstanding', 'Good', 'Requires improvement', 'Inadequate'];

// A home's rating as it must be shown: the real rating whatever it is, or
// "not yet rated" for a newly registered home.
function cqcLabel(home) {
  return CQC_RATINGS.includes(home.cqc) ? home.cqc : 'Not yet rated';
}
function cqcClass(home) {
  return ({ Outstanding: 'is-outstanding', Good: 'is-good', 'Requires improvement': 'is-ri', Inadequate: 'is-inadequate' })[home.cqc] || 'is-unrated';
}
function cqcReportUrl(home) {
  const id = home.details && home.details.cqcLocationId;
  return id ? 'https://www.cqc.org.uk/location/' + encodeURIComponent(id) : 'https://www.cqc.org.uk/search/services/care-homes?query=' + encodeURIComponent(home.name + ' ' + home.postcode);
}

/* A home's full postal address on one line: "12 Victoria Road, Worksop S80 2BJ". */
function homeAddress(home) {
  const street = (home.details && home.details.address) || '';
  return [street, home.town].filter(Boolean).join(', ') + (home.postcode ? ' ' + home.postcode : '');
}

/* ---------- Photos ----------
   A home photo is either a file bundled with the site ("albany/01.webp",
   served from /images/) or an uploaded one stored as a full URL. */
function photoSrc(p) {
  if (!p) return '';
  return /^(https?:)?\/\//.test(p) || p.startsWith('/') ? p : '/images/' + p;
}
// For sharing cards and structured data, which need an absolute address.
function photoAbs(p, base) {
  const src = photoSrc(p);
  return src && src.startsWith('/') && !src.startsWith('//') ? base + src : src;
}

/* ---------- Site images ----------
   The fixed pictures around the website. Admins can swap any of them in the
   staff hub (Site images); the choice is kept in site settings as
   SITE.images[key], and a blank means the original picture bundled here. */
const SITE_IMAGES = [
  { key: 'hero', label: 'Homepage banner', where: 'The big picture at the top of the homepage. Also used when the site is shared on social media.', file: 'hero-home.jpg' },
  { key: 'about', label: 'About us', where: 'Homepage, next to “Care that starts with getting to know you”.', file: 'about.webp' },
  { key: 'careResidential', label: 'Residential care', where: 'Our care page.', file: 'care-residential.webp' },
  { key: 'careNursing', label: 'Nursing care', where: 'Our care page.', file: 'care-nursing.webp' },
  { key: 'careDementia', label: 'Dementia care', where: 'Our care page.', file: 'care-dementia.webp' },
  { key: 'careRespite', label: 'Respite care', where: 'Our care page.', file: 'life.webp' },
  { key: 'carePalliative', label: 'End-of-life care', where: 'Our care page.', file: 'care-palliative.webp' },
  { key: 'careers', label: 'Careers sharing picture', where: 'Shown when a careers or job page is shared on social media or in a message.', file: 'careers.jpg' },
];

// The address of a site image: the uploaded replacement if there is one,
// otherwise the original.
function siteImage(SITE, key) {
  const slot = SITE_IMAGES.find((s) => s.key === key);
  const custom = SITE && SITE.images && SITE.images[key];
  return photoSrc(custom || (slot ? slot.file : ''));
}

/* ---------- Types of care ----------
   The main types of care, managed in the staff hub (Types of care) and kept
   in site settings as SITE.careTypes. Each has a description and picture
   for the Our care page; the picture is an uploaded URL or a Site images
   slot key. SITE.specialistCare is the list of extra conditions a home can
   tick (ABI, ARBD…). Blank settings mean these defaults. */
const DEFAULT_CARE_TYPES = [
  { name: 'Residential Care', image: 'careResidential', position: 'center 22%',
    description: 'For people who no longer manage easily at home, residential care offers help with everyday things — washing, dressing, meals and medication — in a comfortable home, with a team on hand day and night. You keep your own routines and as much independence as you like.' },
  { name: 'Nursing Care', image: 'careNursing', position: 'center 22%',
    description: 'When health needs go beyond day-to-day support, our registered nurses provide care around the clock — for long-term conditions, recovery after a hospital stay, and ongoing clinical needs — working closely with local GPs and community health teams.' },
  { name: 'Dementia Care', image: 'careDementia', position: 'center 22%',
    description: 'Our teams are experienced in caring for people living with dementia, in calm, familiar surroundings designed to feel safe. We take time to learn each resident\'s history and routines, so they are known and understood — including on the harder days.' },
  { name: 'Respite Care', image: 'careRespite', position: 'center',
    description: 'A short stay — to recover after a hospital visit, to give a family carer a break, or simply to try a home before deciding. Respite guests get exactly the same care, meals and activities as everyone else, for as long or short a stay as you need, subject to a room being free.' },
  { name: 'End-of-life Care', image: 'carePalliative', position: 'center',
    description: 'In someone\'s final months, our focus is comfort, dignity and choice. We work closely with your GP, district nurses and family to manage symptoms and make sure no one is alone.' },
];
const DEFAULT_SPECIALIST_CARE = [
  'Acquired brain injury (ABI)', 'Alcohol-related brain damage (ARBD)', 'Alcohol & substance misuse', 'Bariatric care',
  'Cancer care', 'Complex care', 'Convalescent care', 'COPD & pulmonary disease', 'Diabetes', 'Epilepsy',
  'Huntington’s disease', 'Learning disabilities', 'Mental health support', 'Motor neurone disease', 'Multiple sclerosis',
  'Parkinson’s disease', 'Physical disability', 'Stroke recovery', 'Visual & hearing impairment', 'Younger adults (18–65)',
];
function careTypesOf(SITE) {
  const list = (SITE && Array.isArray(SITE.careTypes) && SITE.careTypes.length) ? SITE.careTypes : DEFAULT_CARE_TYPES;
  // The original dementia text named one home; drop that sentence if it was saved.
  return list.map((c) => (c.description && c.description.includes('Fieldway in Mitcham')
    ? Object.assign({}, c, { description: c.description.replace(/\s*At Fieldway in Mitcham, a dedicated floor specialises in dementia care\./, '') })
    : c));
}
function careTypeNames(SITE) { return careTypesOf(SITE).map((c) => c.name); }
function specialistCareOf(SITE) {
  return (SITE && Array.isArray(SITE.specialistCare)) ? SITE.specialistCare : DEFAULT_SPECIALIST_CARE;
}
// A care type's picture: an uploaded one, a Site images slot, or none.
function careImage(SITE, c) {
  if (!c.image) return '';
  return SITE_IMAGES.some((s) => s.key === c.image) ? siteImage(SITE, c.image) : photoSrc(c.image);
}

/* ---------- Fees ---------- */
const FEE_ROWS = [
  { key: 'residential', label: 'Residential care' },
  { key: 'nursing', label: 'Nursing care' },
  { key: 'dementia', label: 'Dementia care' },
  { key: 'respite', label: 'Respite (per week)' },
];

function gbp(n) {
  return '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

// The lowest published weekly fee for a home, or null.
function fromPrice(home) {
  const f = (home.details && home.details.fees) || {};
  const vals = FEE_ROWS.map((r) => f[r.key]).filter((v) => typeof v === 'number' && v > 0);
  return vals.length ? Math.min.apply(null, vals) : null;
}

const INCLUDED = [
  'Your room, with all heating, lighting, water and council tax',
  'All the care set out in your care plan, 24 hours a day',
  'Three freshly cooked meals a day, snacks and drinks, and special diets',
  'Laundry, including personal clothing',
  'Daily cleaning of your room',
  'The home’s activities programme, and most in-house events',
  'Wi-Fi throughout the home',
];

const EXTRAS = [
  'Hairdressing, beauty treatments and chiropody',
  'Newspapers, magazines and personal toiletries of your choice',
  'Private phone line or TV licence in your room',
  'Trips with an entrance fee, and escorts to non-NHS appointments',
  'Dry cleaning',
];

/* ---------- Facilities and what the fee covers ----------
   Site-wide lists managed in the staff hub (Care & facilities), with each
   home ticking its own: details.facilities (names) and details.feeItems
   ({ name: 'included' | 'extra' | 'no' }). A home that hasn't been set up
   yet shows the defaults. */
const FACILITY_GROUPS = [
  { name: 'Rooms', icon: 'M3 12h18v6M3 18v-8a1 1 0 0 1 1-1h7v5' },
  { name: 'Indoor spaces', icon: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' },
  { name: 'Outdoors', icon: 'M12 22V12M12 12c-4 0-6-3-6-6 3 0 6 2 6 6zm0 0c4 0 6-3 6-6-3 0-6 2-6 6zM5 22h14' },
  { name: 'Food & dining', icon: 'M3 12h18a9 9 0 0 1-18 0zM8 4v3M12 3v4M16 4v3' },
  { name: 'Daily life', icon: 'M9 18V6l12-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
  { name: 'Health & wellbeing', icon: 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z' },
  { name: 'Building & accessibility', icon: 'M12 5a2 2 0 1 0 0-.01M9 9h6l-1 5h-4zM10 14l-2 7M14 14l2 7' },
  { name: 'Visiting', icon: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { name: 'Other', icon: 'M20 6 9 17l-5-5' },
];
const DEFAULT_FACILITIES = [
  ['Rooms', ['En-suite rooms', 'Rooms with an en-suite wet room or shower', 'Rooms you can personalise with your own furniture', 'Ground-floor rooms', 'Double or companion rooms', 'TV point in every room', 'Phone line available in rooms', 'Nurse call system in every room']],
  ['Indoor spaces', ['Comfortable lounges', 'Quiet lounge or library', 'Dining room', 'Café or bistro', 'Hair salon', 'Cinema room', 'Sensory room', 'Activity and craft room', 'Private room for family visits']],
  ['Outdoors', ['Gardens', 'Secure garden', 'Wheelchair-accessible garden paths', 'Patio or terrace with seating', 'Raised flower beds for gardening', 'Sensory garden']],
  ['Food & dining', ['Freshly cooked meals made on site', 'Special diets catered for (e.g. diabetic, soft, puréed)', 'Cultural and religious diets catered for', 'Snacks and drinks available any time', 'Private dining for family occasions']],
  ['Daily life', ['Daily activities programme', 'Trips and outings', 'Exercise and movement classes', 'Visiting entertainers', 'Religious services and faith support', 'Pets welcome by arrangement', 'Minibus', 'Wi-Fi throughout']],
  ['Health & wellbeing', ['Regular GP visits', 'Physiotherapy', 'Chiropody', 'Dentist and optician visits', 'Assisted bathrooms with specialist baths', 'Hoists and specialist beds']],
  ['Building & accessibility', ['Lift to all floors', 'Wheelchair accessible throughout', 'Secure entry system', 'Dementia-friendly design and signage', 'Visitor parking']],
  ['Visiting', ['Open visiting — family welcome any time', 'Family welcome to join for meals']],
].flatMap(([group, names]) => names.map((name) => ({ name, group })));
// The five lines the site used before: kept working for anything saved with them.
const OLD_FACILITIES = {
  'Comfortable lounges & gardens': ['Comfortable lounges', 'Gardens'],
  'Freshly prepared meals, special diets catered for': ['Freshly cooked meals made on site', 'Special diets catered for (e.g. diabetic, soft, puréed)'],
  'Daily activities & outings': ['Daily activities programme', 'Trips and outings'],
  'En-suite rooms you can make your own': ['En-suite rooms', 'Rooms you can personalise with your own furniture'],
  'Open visiting — family welcome any time': ['Open visiting — family welcome any time'],
};
// What a home shows before anyone has ticked its facilities (the old five lines).
const DEFAULT_TICKED = [...new Set(Object.values(OLD_FACILITIES).flat())];
const upgradeNames = (names) => [...new Set(names.flatMap((n) => OLD_FACILITIES[n] || [n]))];

// The master list: [{ name, group }].
function facilitiesOf(SITE) {
  const saved = SITE && Array.isArray(SITE.facilities) ? SITE.facilities : null;
  if (!saved) return DEFAULT_FACILITIES;
  if (saved.every((x) => typeof x === 'string')) {
    // Saved before groups existed: the detailed list plus anything custom.
    const custom = saved.filter((x) => !OLD_FACILITIES[x]).map((name) => ({ name, group: 'Other' }));
    return DEFAULT_FACILITIES.concat(custom.filter((c) => !DEFAULT_FACILITIES.some((d) => d.name === c.name)));
  }
  return saved.filter((x) => x && x.name).map((x) => ({ name: x.name, group: FACILITY_GROUPS.some((g) => g.name === x.group) ? x.group : 'Other' }));
}
function facilityNames(SITE) { return facilitiesOf(SITE).map((f) => f.name); }
// The names a home has ticked (or the old defaults if it's never been set).
function homeFacilityNames(home) {
  const picked = home.details && home.details.facilities;
  return Array.isArray(picked) ? upgradeNames(picked) : DEFAULT_TICKED;
}
// A home's facilities grouped for its page: [{ group, icon, items: [names] }].
function homeFacilities(SITE, home) {
  const mine = homeFacilityNames(home);
  const all = facilitiesOf(SITE);
  return FACILITY_GROUPS.map((g) => ({ group: g.name, icon: g.icon, items: all.filter((f) => f.group === g.name && mine.includes(f.name)).map((f) => f.name) }))
    .filter((g) => g.items.length);
}
function feeItemsOf(SITE) {
  if (SITE && Array.isArray(SITE.feeItems)) return SITE.feeItems;
  return INCLUDED.map((name) => ({ name, usually: 'included' })).concat(EXTRAS.map((name) => ({ name, usually: 'extra' })));
}
// The site-wide "usually" lists (Fees & funding page) or one home's own.
function feeLists(SITE, home) {
  const own = home && home.details && home.details.feeItems;
  const out = { included: [], extras: [] };
  for (const item of feeItemsOf(SITE)) {
    const how = own && own[item.name] ? own[item.name] : item.usually;
    if (how === 'included') out.included.push(item.name);
    else if (how === 'extra') out.extras.push(item.name);
  }
  return out;
}

/* ---------- Website text ----------
   Homepage wording, FAQs and the moving-in checklist, editable in the staff
   hub (Website text) and kept in site settings. Blank settings mean these
   defaults. */
const DEFAULT_TEXT = {
  heroTitle: 'The care home you’d choose for your own family',
  heroLead: '',  // blank: "Warm, welcoming care homes across <live areas>, …"
  homesTitle: '', // blank: "Homes with their own character"
  homesLead: 'Every home offers residential, nursing and dementia care, so as needs change your loved one rarely has to move. Prices and CQC ratings are shown up front.',
  aboutTitle: 'Care that starts with getting to know you',
  aboutText: 'Across our homes, people live the way they want to — a lie-in if they fancy one, a garden to potter in, a cup of tea made just how they like it. Our carers and nurses take time to learn the little things: a grandchild’s name, a favourite song, the routine that makes a day feel right.',
  aboutPoints: ['A regular programme of activities and outings', 'Freshly prepared meals, with special diets catered for', 'Comfortable lounges and gardens to enjoy', 'Residential, nursing, dementia and respite care'],
  stats: [{ num: '100%', label: 'CQC-registered homes' }, { num: '', label: 'Types of care, from residential to nursing' }, { num: '24/7', label: 'Registered nursing on site' }],
};
function textOf(SITE) {
  return Object.assign({}, DEFAULT_TEXT, (SITE && SITE.text) || {});
}
function faqsOf(SITE) { return SITE && Array.isArray(SITE.faqs) ? SITE.faqs : GENERAL_FAQS; }
function feeFaqsOf(SITE) { return SITE && Array.isArray(SITE.feeFaqs) ? SITE.feeFaqs : FEE_FAQS; }
function whatToBringOf(SITE) { return SITE && Array.isArray(SITE.whatToBring) ? SITE.whatToBring : WHAT_TO_BRING; }

/* ---------- FAQs ---------- */
const FEE_FAQS = [
  {
    q: 'Why is the fee shown as “from”?',
    a: 'Every resident’s fee is set after a free care-needs assessment, and depends on the level of care needed and the room chosen. The “from” price is the lowest weekly fee for that type of care at that home. We confirm your exact fee in writing before you agree to anything.',
  },
  {
    q: 'Do you ask for a deposit?',
    a: 'We do not charge an upfront admin or assessment fee. If you want to hold a room before moving in, we will explain any reservation charge in writing first — it is always deducted from your first invoice, and refunded if we cannot meet the care needs we agreed.',
  },
  {
    q: 'How and when do fees go up?',
    a: 'Fees are reviewed once a year, in April. We give at least 28 days’ written notice of any change and explain the reason. Fees may also change if care needs change significantly — we will always talk this through with you first.',
  },
  {
    q: 'What happens to fees after a resident dies?',
    a: 'Fees stop three days after a resident passes away, giving the family time to collect belongings without rushing. We never charge for a room that has been cleared.',
  },
  {
    q: 'Does the NHS pay towards nursing care?',
    a: 'If you need nursing care, the NHS pays a weekly contribution called NHS-funded nursing care (FNC) directly to the home. Our nursing prices show clearly whether FNC is included. If your needs are mainly health needs, you may qualify for NHS Continuing Healthcare, which covers the full cost.',
  },
  {
    q: 'What help is there if I cannot pay the full fee?',
    a: 'In England, your local council may help if your savings and assets are below the upper capital limit (currently £23,250). Your home may be counted, but not if a partner or certain relatives still live there. A deferred payment agreement can let you pay later from the sale of your home. Self-funders can usually claim Attendance Allowance, whatever their savings.',
  },
  {
    q: 'Do you accept council-funded residents?',
    a: 'Yes. Where the council’s rate is lower than our fee, a family member or friend may be able to pay the difference (a “top-up”). We will be open about this before any decision is made.',
  },
];

const GENERAL_FAQS = [
  {
    q: 'Can we visit before deciding?',
    a: 'Please do. You can book a visit online or call us — we show you round, you can meet the manager and the team, and there is no obligation. Just tell us what day and time suits you.',
  },
  {
    q: 'When can family visit?',
    a: 'Family and friends are welcome any time. We only ask that visitors sign in, and that you give the team a heads-up if you plan to join for a meal.',
  },
  {
    q: 'How quickly can someone move in?',
    a: 'Often within a few days of the first call. We will do a free care-needs assessment first — at home, in hospital or by video — so we are sure we can meet the person’s needs. In an emergency or on hospital discharge, we can sometimes move faster.',
  },
  {
    q: 'Can my relative bring their own furniture?',
    a: 'Yes — photos, a favourite chair, pictures and bedding all help a room feel like home. Larger furniture is welcome if it is safe and fits. Pets can sometimes visit; ask the home manager.',
  },
  {
    q: 'What happens if care needs change?',
    a: 'All our homes offer residential, nursing and dementia care, so people rarely have to move again. We review each care plan at least monthly and whenever needs change, and involve the family.',
  },
  {
    q: 'Do residents keep their own GP?',
    a: 'Where the GP practice covers the home’s area, yes. Otherwise we help register with a local practice that visits the home regularly.',
  },
  {
    q: 'How do you care for people living with dementia?',
    a: 'Our teams are trained in dementia care, and we learn each person’s life story, routines and what calms them. Our homes offer care for people living with mild, moderate and advanced dementia.',
  },
  {
    q: 'Do you offer short stays?',
    a: 'Yes. Respite stays — usually from one week — are available at every home, subject to a free room. They are a good way to try a home, or to give a family carer a break.',
  },
  {
    q: 'How do I raise a concern or complaint?',
    a: 'Speak to the home manager first — most things can be put right quickly. If you are not happy with the answer, write to our head office and we will respond within 28 days. You can also contact the Local Government and Social Care Ombudsman or the Care Quality Commission.',
  },
];

const WHAT_TO_BRING = [
  'Clothing for a week or two, labelled if possible (we can label for you)',
  'Comfortable shoes and slippers with a good grip',
  'Toiletries, glasses, hearing aids, dentures — and their cases',
  'Current medication, in its original packaging',
  'Photographs, pictures, a favourite blanket or cushion',
  'A radio, tablet or music player, and chargers',
  'Contact details for family, GP and any other professionals',
  'A copy of any power of attorney or advance care plan',
];

/* ---------- schema.org ---------- */
function faqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function orgJsonLd(SITE, base) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    legalName: SITE.legalName || undefined,
    url: base + '/',
    logo: base + '/images/logo.png',
    telephone: SITE.phone,
    email: SITE.email,
    address: { '@type': 'PostalAddress', streetAddress: SITE.address, addressCountry: 'GB' },
  };
}

function homeJsonLd(home, SITE, base) {
  const d = home.details || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': base + '/care-homes/' + home.id,
    name: home.name,
    description: home.blurb,
    url: base + '/care-homes/' + home.id,
    telephone: d.phone || SITE.phone,
    email: d.email || undefined,
    image: home.photo ? photoAbs(home.photo, base) : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: d.address || undefined,
      addressLocality: home.town,
      postalCode: home.postcode,
      addressRegion: home.region,
      addressCountry: 'GB',
    },
    parentOrganization: { '@type': 'Organization', name: SITE.name, url: base + '/' },
    sameAs: [d.googleUrl, d.carehomeUrl].filter(Boolean).length ? [d.googleUrl, d.carehomeUrl].filter(Boolean) : undefined,
  };
  if (typeof home.lat === 'number' && typeof home.lng === 'number') {
    data.geo = { '@type': 'GeoCoordinates', latitude: home.lat, longitude: home.lng };
  }
  const from = fromPrice(home);
  if (from) data.priceRange = 'From ' + gbp(from) + ' per week';
  return data;
}

// JSON for a <script type="application/ld+json"> block. Escapes "<" so a
// value containing "</script>" can't break out of the tag.
function ldScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

module.exports = {
  CQC_RATINGS, cqcLabel, cqcClass, cqcReportUrl, homeAddress,
  photoSrc, photoAbs, SITE_IMAGES, siteImage,
  DEFAULT_CARE_TYPES, DEFAULT_SPECIALIST_CARE, careTypesOf, careTypeNames, specialistCareOf, careImage,
  FACILITY_GROUPS, facilitiesOf, facilityNames, homeFacilityNames, homeFacilities, feeItemsOf, feeLists,
  FEE_ROWS, gbp, fromPrice, INCLUDED, EXTRAS,
  FEE_FAQS, GENERAL_FAQS, WHAT_TO_BRING, DEFAULT_TEXT, textOf, faqsOf, feeFaqsOf, whatToBringOf,
  faqJsonLd, orgJsonLd, homeJsonLd, ldScript,
};
