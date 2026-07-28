// Timezone handling for a multi-region deployment.
//
// The rule is the one every serious system uses: store everything in UTC (Mongo
// already does), and convert to the shop's own timezone only at the edges —
// when a report is read or a date range is filtered. That way the same database
// serves a shop in Dublin and a shop in Karachi correctly, and a sale at 1am
// local never lands in the wrong day on a report.
//
// Built on the platform's Intl API, so there is no dependency and DST is handled
// by the OS's own timezone database.

// Offset, in milliseconds, of `tz` from UTC at a given instant. Positive means
// the zone is ahead of UTC. Computed by asking Intl what the wall-clock time is
// in that zone and diffing it against the instant.
function tzOffset(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = {};
  for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  // Real zone offsets are a whole number of minutes. Round to one so the
  // sub-second part of `date` (which Intl can't report) doesn't leak into the
  // offset and throw an end-of-day boundary off by ~1 second.
  return Math.round((asIfUtc - date.getTime()) / 60000) * 60000;
}

// The UTC instant for a wall-clock moment in `tz`. Guess by treating the wall
// time as if it were UTC, then correct by the zone's offset. Re-checking the
// offset at the corrected instant makes it right across a DST change too.
function zonedToUtc(y, mo, d, h, mi, s, ms, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const firstOffset = tzOffset(new Date(guess), tz);
  const corrected = guess - firstOffset;
  const secondOffset = tzOffset(new Date(corrected), tz);
  return new Date(guess - secondOffset);
}

const parseYmd = (value) => String(value).split("-").map(Number);

// Start / end of a calendar day ("YYYY-MM-DD") in the shop's timezone, returned
// as the matching UTC instants for a Mongo query.
function startOfDay(dateStr, tz = "UTC") {
  const [y, m, d] = parseYmd(dateStr);
  return zonedToUtc(y, m, d, 0, 0, 0, 0, tz);
}

function endOfDay(dateStr, tz = "UTC") {
  const [y, m, d] = parseYmd(dateStr);
  return zonedToUtc(y, m, d, 23, 59, 59, 999, tz);
}

// Render a UTC instant as wall-clock text in `tz`. en-CA gives an ISO-ish
// YYYY-MM-DD, which is what the reports already use.
function formatInZone(value, tz = "UTC", withTime = true) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : {}),
  });

  const parts = {};
  for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;

  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return withTime ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}

// The next local midnight (00:00 of tomorrow in `tz`) as a UTC instant. Used to
// end every staff session at the close of the business day: a login at any time
// today expires when the shop's calendar rolls over to the next day, in the
// shop's own timezone — not the server's.
function nextMidnight(tz = "UTC", now = new Date()) {
  const [y, m, d] = parseYmd(formatInZone(now, tz, false)); // today's Y-M-D in tz
  // Day-of-month + 1 rolls over months/years correctly via Date.UTC inside
  // zonedToUtc, and the offset re-check there keeps it right across a DST change.
  return zonedToUtc(y, m, d + 1, 0, 0, 0, 0, tz);
}

// Does the platform recognise this timezone? Used to validate what the owner
// picks, rather than hard-coding a list that goes stale.
function isValidZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = { startOfDay, endOfDay, nextMidnight, formatInZone, isValidZone, tzOffset };
