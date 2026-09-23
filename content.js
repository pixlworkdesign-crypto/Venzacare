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
    a: 'Our teams are trained in dementia care, and we learn each person’s life story, routines and what calms them. Our homes offer care for people living with mild, moderate and advanced dementia; Fieldway in Mitcham has a dedicated dementia floor.',
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
    image: home.photo ? base + '/images/' + home.photo : undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: home.town,
      postalCode: home.postcode,
      addressRegion: home.region,
      addressCountry: 'GB',
    },
    parentOrganization: { '@type': 'Organization', name: SITE.name, url: base + '/' },
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
  CQC_RATINGS, cqcLabel, cqcClass, cqcReportUrl,
  FEE_ROWS, gbp, fromPrice, INCLUDED, EXTRAS,
  FEE_FAQS, GENERAL_FAQS, WHAT_TO_BRING,
  faqJsonLd, orgJsonLd, homeJsonLd, ldScript,
};
