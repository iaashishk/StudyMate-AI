/**
 * civil-date.js
 * ─────────────────────────────────────────────────────────────────
 * Pure civil date utilities (YYYY-MM-DD) for server side.
 * Eliminates Date.toISOString() and local midnight drift.
 * ─────────────────────────────────────────────────────────────────
 */

/** Formats year, month (1-12), and day (1-31) to 'YYYY-MM-DD' */
export function toCivil(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses 'YYYY-MM-DD' into integer { year, month, day } */
export function parseCivil(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    throw new Error(`Invalid civil date string: ${dateStr}`);
  }
  const parts = dateStr.trim().split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid civil date format (expected YYYY-MM-DD): ${dateStr}`);
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Non-numeric parts in civil date: ${dateStr}`);
  }
  return { year, month, day };
}

/** Returns today's civil date string for a specific IANA timezone (default: Asia/Kolkata) */
export function todayForTimezone(timezone = "Asia/Kolkata") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD in en-CA locale
  } catch {
    const now = new Date();
    return toCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }
}

/** Adds or subtracts N days to/from a 'YYYY-MM-DD' string safely */
export function addDaysCivil(dateStr, days) {
  const { year, month, day } = parseCivil(dateStr);
  const ms = Date.UTC(year, month - 1, day) + days * 86400000;
  const d = new Date(ms);
  return toCivil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Returns weekday for 'YYYY-MM-DD': 0 = Sun, 1 = Mon, ..., 6 = Sat */
export function weekdayOf(dateStr) {
  const { year, month, day } = parseCivil(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Returns difference in days between two civil dates (end - start) */
export function diffDaysCivil(startStr, endStr) {
  const a = parseCivil(startStr);
  const b = parseCivil(endStr);
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86400000);
}

/** Returns inclusive array of all 'YYYY-MM-DD' dates between startStr and endStr */
export function rangeCivil(startStr, endStr) {
  if (startStr > endStr) return [];
  const results = [];
  let cur = startStr;
  while (cur <= endStr) {
    results.push(cur);
    cur = addDaysCivil(cur, 1);
  }
  return results;
}

/** Validates whether a string is a well-formed YYYY-MM-DD date */
export function isValidCivilDate(str) {
  if (typeof str !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  try {
    const { year, month, day } = parseCivil(str);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    return true;
  } catch {
    return false;
  }
}
