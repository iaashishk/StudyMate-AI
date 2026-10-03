/**
 * calendar-engine.js
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for calendar days and sessions.
 * Pure functions on pre-fetched/batched data. Zero per-day DB queries.
 * ─────────────────────────────────────────────────────────────────
 */

import {
  parseCivil,
  weekdayOf,
  rangeCivil,
  addDaysCivil,
  diffDaysCivil,
} from "../utils/civil-date.js";

/**
 * Determines what kind of day a given civil date string is,
 * and what scheduled sessions apply.
 *
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {Object} context Pre-fetched batch data:
 *   - semester: { startDate, endDate, name }
 *   - holidayMap: Map<string, { label, _id }>
 *   - slots: Array of TimetableSlot objects
 * @returns {Object} DayInfo
 */
export function evaluateDay(dateStr, context) {
  const { semester, holidayMap, slots } = context;
  const weekday = weekdayOf(dateStr);

  const semStart = semester?.startDate || null;
  const semEnd = semester?.endDate || null;

  // 1. Outside semester boundaries
  if (semStart && dateStr < semStart) {
    return {
      date: dateStr,
      type: "outside_semester",
      label: "Before Semester Start",
      weekday,
      sessions: [],
    };
  }

  if (semEnd && dateStr > semEnd) {
    return {
      date: dateStr,
      type: "outside_semester",
      label: "After Semester End",
      weekday,
      sessions: [],
    };
  }

  // 2. Declared holiday
  if (holidayMap && holidayMap.has(dateStr)) {
    const hol = holidayMap.get(dateStr);
    return {
      date: dateStr,
      type: "holiday",
      label: hol.label,
      holidayId: hol._id,
      weekday,
      sessions: [],
    };
  }

  // 3. Weekend check
  // Check if user has active timetable slots on this weekday
  const activeSlotsOnDay = (slots || []).filter((s) => {
    if (s.weekday !== weekday) return false;
    if (s.effectiveFrom && s.effectiveFrom > dateStr) return false;
    if (s.effectiveTo && s.effectiveTo < dateStr) return false;
    if (!s.subjectId) return false;
    return true;
  });

  const isSunday = weekday === 0;
  const isSaturday = weekday === 6;

  if (isSunday || (isSaturday && activeSlotsOnDay.length === 0)) {
    return {
      date: dateStr,
      type: "weekend",
      label: isSunday ? "Sunday" : "Saturday",
      weekday,
      sessions: [],
    };
  }

  // 4. Teaching day
  return {
    date: dateStr,
    type: "teaching",
    label: null,
    weekday,
    sessions: activeSlotsOnDay,
  };
}

/**
 * Evaluates an entire civil date range in memory with ONE batched evaluation.
 *
 * @param {string} fromDate 'YYYY-MM-DD'
 * @param {string} toDate 'YYYY-MM-DD'
 * @param {Object} context { semester, holidayMap, slots }
 * @returns {Array<Object>} Array of DayInfo objects
 */
export function evaluateDateRange(fromDate, toDate, context) {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const dates = rangeCivil(fromDate, toDate);
  return dates.map((d) => evaluateDay(d, context));
}

/**
 * Counts remaining scheduled teaching sessions per subject between fromDate and toDate.
 *
 * @param {string} fromDate 'YYYY-MM-DD'
 * @param {string} toDate 'YYYY-MM-DD'
 * @param {Object} context { semester, holidayMap, slots }
 * @returns {Map<string, number>} Map of subjectId string -> session count
 */
export function countRemainingSessionsBySubject(fromDate, toDate, context) {
  const counts = new Map();
  const days = evaluateDateRange(fromDate, toDate, context);

  for (const day of days) {
    if (day.type !== "teaching") continue;
    for (const slot of day.sessions) {
      const subjId = String(slot.subjectId._id || slot.subjectId);
      counts.set(subjId, (counts.get(subjId) || 0) + 1);
    }
  }

  return counts;
}
