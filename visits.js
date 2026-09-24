/* =============================================================
   Venza Care UK — instant visit booking
   -------------------------------------------------------------
   Each home has visiting times (days of the week, start times,
   how many visits per slot, notice needed, how far ahead, and
   closed dates). Families pick a free slot and it's booked on
   the spot.

   Times are UK wall-clock times ("2026-10-02" + "14:00") and are
   never converted through the server's own time zone, so a slot
   is always the time the home means — BST or GMT.

   A booked slot is a "claim" record with id home|date|time|n,
   n = 1..visits-per-slot. Claims are created insert-if-free, so
   the database stops two families taking the same slot.
   ============================================================= */

const db = require('./db');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULTS = Object.freeze({
  enabled: true,
  days: [0, 1, 2, 3, 4, 5, 6],          // 0 = Sunday
  times: ['10:00', '11:00', '14:00', '15:00', '16:00'],
  perSlot: 1,                           // visits that can share one time
  noticeHours: 24,                      // earliest bookable time from now
  weeksAhead: 3,
  closedDates: [],                      // 'YYYY-MM-DD'
});

function settingsFor(home) {
  const v = (home.details && home.details.visits) || {};
  const out = Object.assign({}, DEFAULTS, v);
  out.days = Array.isArray(v.days) ? v.days.filter((d) => d >= 0 && d <= 6) : DEFAULTS.days.slice();
  out.times = (Array.isArray(v.times) ? v.times : DEFAULTS.times).filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  out.closedDates = Array.isArray(v.closedDates) ? v.closedDates : [];
  out.perSlot = Math.min(Math.max(parseInt(out.perSlot, 10) || 1, 1), 10);
  out.noticeHours = Math.min(Math.max(parseInt(out.noticeHours, 10) || 0, 0), 24 * 14);
  out.weeksAhead = Math.min(Math.max(parseInt(out.weeksAhead, 10) || 3, 1), 12);
  return out;
}

/* The current UK date and time as "YYYY-MM-DDTHH:MM", optionally offset. */
function ukStamp(offsetMs) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + (offsetMs || 0)));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay();

// "Thursday 2 October" / "2pm" / "Thursday 2 October at 2pm" — no time-zone maths.
function dayLabel(dateStr, short) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long',
  });
}
function timeLabel(t) {
  const [h, m] = t.split(':').map(Number);
  const hr = h % 12 || 12;
  return hr + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm');
}
const whenLabel = (date, time) => dayLabel(date) + ' at ' + timeLabel(time);

const claimPrefix = (homeId, date, time) => `${homeId}|${date}|${time}|`;

async function claimsFor(homeId) {
  return (await db.records.list('visit_slots')).filter((c) => c.id.startsWith(homeId + '|'));
}

/* Free slots for a home, grouped by day: [{ date, label, short, times: [{time, label}] }] */
async function openSlots(home) {
  const s = settingsFor(home);
  if (!s.enabled || !s.times.length || !s.days.length) return [];
  const earliest = ukStamp(s.noticeHours * 3600 * 1000);
  const today = ukStamp().slice(0, 10);
  const taken = new Map();
  (await claimsFor(home.id)).forEach((c) => {
    const key = c.id.split('|').slice(1, 3).join('|');
    taken.set(key, (taken.get(key) || 0) + 1);
  });
  const days = [];
  for (let i = 0; i <= s.weeksAhead * 7; i++) {
    const date = addDays(today, i);
    if (!s.days.includes(weekday(date)) || s.closedDates.includes(date)) continue;
    const times = s.times
      .filter((t) => `${date}T${t}` >= earliest && (taken.get(`${date}|${t}`) || 0) < s.perSlot)
      .map((t) => ({ time: t, label: timeLabel(t) }));
    if (times.length) days.push({ date, label: dayLabel(date), short: dayLabel(date, true), times });
  }
  return days;
}

/* Is this exact slot currently offered? (re-checked when a family submits) */
async function isOffered(home, date, time) {
  return (await openSlots(home)).some((d) => d.date === date && d.times.some((t) => t.time === time));
}

/* Take one place in the slot. Returns the claim id, or null if it's full. */
async function claim(home, date, time, data) {
  const s = settingsFor(home);
  for (let n = 1; n <= s.perSlot; n++) {
    const id = claimPrefix(home.id, date, time) + n;
    if (await db.records.create('visit_slots', id, Object.assign({ homeId: home.id, date, time }, data || {}))) return id;
  }
  return null;
}

async function release(claimId) {
  if (claimId) await db.records.remove('visit_slots', claimId);
}

/* An .ics calendar file for the visit (UK local time). */
function calendarFile(home, date, time, siteName) {
  const stamp = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
  const [h, m] = time.split(':').map(Number);
  const end = String(h + 1).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const esc = (s) => String(s).replace(/[,;\\]/g, (c) => '\\' + c);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Venza Care UK//Visit//EN', 'BEGIN:VEVENT',
    'UID:' + home.id + '-' + stamp(date, time) + '@venzacare',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART;TZID=Europe/London:' + stamp(date, time),
    'DTEND;TZID=Europe/London:' + stamp(date, end),
    'SUMMARY:' + esc('Visit to ' + home.name),
    'LOCATION:' + esc(home.name + ', ' + home.town + ' ' + home.postcode),
    'DESCRIPTION:' + esc('Your visit to ' + home.name + ' (' + siteName + ').'),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = {
  DAY_NAMES, DEFAULTS, settingsFor, openSlots, isOffered, claim, release,
  dayLabel, timeLabel, whenLabel, ukStamp, calendarFile,
};
