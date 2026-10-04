import { AttendanceSubject } from "../types/attendance";

export const DAY_KEYWORDS: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 0, sun: 0,
};

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_SLOT_TIMES = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "12:00", end: "13:00" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
  { start: "17:00", end: "18:00" },
  { start: "18:00", end: "19:00" },
];

export const NON_CLASS_KEYWORDS = [
  "lunch",
  "lunch break",
  "recess",
  "tea break",
  "short break",
  "break",
  "interval",
  "tiffin",
  "free",
  "nil",
  "off",
  "library",
  "sports",
  "mentoring",
  "remedial",
  "assembly",
  "leisure",
  "self study",
  "seminar / sports",
  "sports / seminar",
  "zero period",
  "counselling",
  "prep leave",
];

export const TIME_REGEX = /(\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i;

export interface ParsedTimetableSlotResult {
  weekday: number;
  weekdayName: string;
  slotIndex: number;
  startTime: string;
  endTime: string;
  room: string;
  slotType: "lecture" | "lab" | "tutorial";
  rawText: string;
  subjectName: string;
  shortName?: string;
  code?: string;
  teacher?: string;
  matchedSubjectId: string | null;
  blockId?: string;
  blockSpan?: number;
}

export interface ParsedTimetableDocResult {
  slots: ParsedTimetableSlotResult[];
  effectiveStartDate?: string;
  maxSlotsPerDay?: number;
  defaultMinPercent?: number;
}

/**
 * Normalizes time strings like "9:00", "09:00", "1:00", "2.00 PM" into 24-hr "HH:MM".
 * Uses smart heuristic: hours 1 to 7 without AM/PM in college schedule context are treated as PM (13:00 - 19:00).
 */
export function normalizeTime(tStr: string, isEnd = false, startHourRef: number | null = null): string {
  let clean = tStr.trim().toLowerCase().replace(".", ":");
  const hasPM = clean.includes("pm");
  const hasAM = clean.includes("am");
  clean = clean.replace(/(am|pm)/g, "").trim();
  let [h, m] = clean.split(":").map(Number);
  if (isNaN(m)) m = 0;
  if (isNaN(h)) h = 9;

  if (hasPM && h < 12) {
    h += 12;
  } else if (hasAM && h === 12) {
    h = 0;
  } else if (!hasAM && !hasPM) {
    if (h >= 1 && h <= 7) {
      h += 12;
    }
  }

  if (isEnd && startHourRef !== null && h < startHourRef) {
    h += 12;
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTimeRange(timeStr: string): { start: string; end: string } | null {
  const m = timeStr.match(TIME_REGEX);
  if (!m) return null;
  const start = normalizeTime(m[1], false);
  const startHour = parseInt(start.split(":")[0], 10);
  const end = normalizeTime(m[2], true, startHour);
  return { start, end };
}

export function isNonClassCell(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  const lower = text.toLowerCase().trim();
  if (["-", "--", "---", "x", "nil", "n/a", "na", "."].includes(lower)) return true;
  for (const kw of NON_CLASS_KEYWORDS) {
    if (lower === kw) return true;
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lower)) return true;
  }
  return false;
}

export function cleanSubjectName(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText
    // Remove time intervals
    .replace(TIME_REGEX, "")
    // Remove period labels: Period 1, P-1, 1st, 2nd
    .replace(/\b(?:period|slot|p)\s*[-:]?\s*\d+\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)?\s+(?:period|slot)\b/gi, "")
    // Remove room patterns: Room 302, LT-1, LH-2, Hall B, Lab 2
    .replace(/\b(?:room|lab|hall|lh|lt|cr|hw\s*lab|cs\s*lab)[-:\s]*([a-z0-9]+)?\b/gi, "")
    // Remove teacher patterns: Prof. Gupta, Dr. PK, Dr. Verma, Mr. Sharma, Ms. Roy
    .replace(/\b(?:prof\.?|dr\.?|mr\.?|ms\.?|mrs\.?)\s+[a-z.]+(?:\s+[a-z]+)?\b/gi, "")
    // Remove parenthesis with teacher initials: e.g. (Dr. PK), (PK), (GS)
    .replace(/\((?:dr\.?|prof\.?|[a-z]{1,4})\)/gi, "")
    // Remove leading numbering: 1., 2., __6., (1)
    .replace(/^[\s\-_~|#*]*\d+[\s.\-_|)\/]+/, "")
    // Remove day names
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, "")
    // Remove pipes, brackets, excessive punctuation
    .replace(/[|[\](){}]/g, " ")
    .replace(/[-_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Clean leading/trailing colons or hyphens
  cleaned = cleaned.replace(/^[:\-\s]+/, "").replace(/[:\-\s]+$/, "").trim();

  const isLab = /\b(lab|practical|workshop)\b/i.test(rawText);

  // Proper Title Case
  let result = cleaned
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => {
      const up = w.toUpperCase();
      if (/^[A-Z0-9-]{2,8}$/.test(up) && /\d/.test(up)) {
        return up; // e.g. CS401, MA201, CS-401
      }
      if (["DBMS", "OS", "CN", "TOC", "OOP", "AI", "ML", "DS", "WT", "COA", "DAA"].includes(up)) {
        return up;
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");

  if (isLab && !/\blab\b/i.test(result)) {
    result += " Lab";
  }

  return result;
}

export function detectRoom(text: string): string {
  const roomMatch =
    text.match(/\b(?:room|lab|hall|lh|lt|cr)[-:\s]*([a-z0-9]+)\b/i) ||
    text.match(/\b(hw\s*lab|cs\s*lab\s*\d*|lab\s*\d*)\b/i);
  return roomMatch ? roomMatch[0].trim().toUpperCase() : "";
}

export function detectSlotType(text: string): "lecture" | "lab" | "tutorial" {
  if (/\b(lab|practical|workshop|hands-on|lab\s*\d+)\b/i.test(text)) return "lab";
  if (/\b(tutorial|tut|discussion|seminar)\b/i.test(text)) return "tutorial";
  return "lecture";
}

export function splitRowCells(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim()).filter((c) => c.length > 0);
  }
  if (line.includes("|")) {
    return line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
  }
  // Otherwise multi-space
  return line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0);
}

export function matchExistingSubject(
  candidateName: string,
  existingSubjects: AttendanceSubject[] = []
): { matchedId: string | null; name: string } {
  if (!candidateName) return { matchedId: null, name: candidateName };

  const candClean = candidateName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const subj of existingSubjects) {
    const sNameClean = subj.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const sCodeClean = (subj.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    if (sCodeClean && (candClean.includes(sCodeClean) || sCodeClean.includes(candClean))) {
      return { matchedId: subj._id, name: subj.name };
    }
    if (candClean === sNameClean || candClean.includes(sNameClean) || sNameClean.includes(candClean)) {
      return { matchedId: subj._id, name: subj.name };
    }
  }

  // Acronym map for common engineering / university subjects
  const acronyms: Record<string, string> = {
    os: "Operating Systems",
    dbms: "Database Management Systems",
    cn: "Computer Networks",
    toc: "Theory of Computation",
    ds: "Data Structures",
    oop: "Object Oriented Programming",
    wt: "Web Technologies",
    coa: "Computer Organization & Architecture",
    daa: "Design & Analysis of Algorithms",
    ai: "Artificial Intelligence",
    ml: "Machine Learning",
  };

  for (const [acr, full] of Object.entries(acronyms)) {
    if (candClean === acr || candClean.startsWith(acr + " ") || candClean.endsWith(" " + acr)) {
      const existing = existingSubjects.find(
        (s) =>
          s.name.toLowerCase().includes(acr) ||
          s.name.toLowerCase().includes(full.toLowerCase())
      );
      if (existing) {
        return { matchedId: existing._id, name: existing.name };
      }
      return { matchedId: null, name: full };
    }
  }

  return { matchedId: null, name: candidateName };
}

/**
 * Universal university timetable parser supporting:
 * 1. Days as Rows, Time intervals as Columns
 * 2. Days as Columns, Time intervals as Rows
 * 3. Grouped List (Sequential Day blocks with time lines)
 * 4. Period Number headers (P1, P2, P3...) with master or fallback timings
 */
export function parseTimetableDocFromText(
  rawText: string,
  existingSubjects: AttendanceSubject[]
): ParsedTimetableDocResult {
  if (!rawText || !rawText.trim()) return { slots: [] };

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const slots: ParsedTimetableSlotResult[] = [];

  // 1. Detect effective date (w.e.f.)
  let effectiveStartDate: string | undefined;
  const wefMatch = rawText.match(
    /(?:w\.?e\.?f\.?|effective\s*(?:from|date)?|commencing\s*(?:from|on)?)\s*[:\-]?\s*(\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b)/i
  );
  if (wefMatch) {
    const rawD = wefMatch[1];
    const parts = rawD.split(/[-/.]/);
    const d = String(parts[0]).padStart(2, "0");
    const m = String(parts[1]).padStart(2, "0");
    let y = parts[2] ? parts[2] : String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    effectiveStartDate = `${y}-${m}-${d}`;
  }

  // 2. Detect attendance target % (e.g. "75% attendance mandatory")
  let defaultMinPercent: number | undefined;
  const attMatch =
    rawText.match(
      /(?:minimum|mandatory|required)?\s*attendance(?:\s*(?:is|requirement|criteria|of))?\s*[:\-]?\s*(\d{2})%/i
    ) || rawText.match(/\b([6789]\d)%\s*(?:minimum\s*)?attendance\b/i);
  if (attMatch) {
    defaultMinPercent = parseInt(attMatch[1], 10);
  }

  // 3. Grid Layout Detection
  let timeColumnsHeaderIndex = -1;
  let timeColumns: Array<{ colIndex: number; start: string; end: string }> = [];

  let dayColumnsHeaderIndex = -1;
  let dayColumns: Array<{ colIndex: number; weekday: number }> = [];

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    const cells = splitRowCells(line);

    // Look for row with multiple time ranges
    const timesFound: Array<{ colIndex: number; start: string; end: string }> = [];
    cells.forEach((c, idx) => {
      const tr = parseTimeRange(c);
      if (tr) timesFound.push({ colIndex: idx, ...tr });
    });

    if (timesFound.length >= 2 && timeColumnsHeaderIndex === -1) {
      timeColumnsHeaderIndex = i;
      timeColumns = timesFound;
      continue;
    }

    // Look for row with multiple day names
    const daysFound: Array<{ colIndex: number; weekday: number }> = [];
    cells.forEach((c, idx) => {
      const lower = c.toLowerCase();
      for (const [dk, dnum] of Object.entries(DAY_KEYWORDS)) {
        if (
          new RegExp(`^${dk}$`, "i").test(lower) ||
          new RegExp(`\\b${dk}\\b`, "i").test(lower)
        ) {
          if (!daysFound.some((df) => df.weekday === dnum)) {
            daysFound.push({ colIndex: idx, weekday: dnum });
          }
          break;
        }
      }
    });

    if (daysFound.length >= 3 && dayColumnsHeaderIndex === -1) {
      dayColumnsHeaderIndex = i;
      dayColumns = daysFound;
      continue;
    }
  }

  // Layout Branch 1: Days as Rows, Time intervals as Columns
  if (timeColumns.length >= 2) {
    for (let i = timeColumnsHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = splitRowCells(line);
      if (cells.length < 2) continue;

      let rowDay: number | null = null;
      for (const [dk, dnum] of Object.entries(DAY_KEYWORDS)) {
        if (new RegExp(`\\b${dk}\\b`, "i").test(cells[0])) {
          rowDay = dnum;
          break;
        }
      }

      if (rowDay === null) continue;

      let slotIdx = 0;
      for (let cIdx = 1; cIdx < cells.length; cIdx++) {
        const cellText = cells[cIdx];
        if (isNonClassCell(cellText)) {
          slotIdx++;
          continue;
        }

        const matchedTimeCol =
          timeColumns.find((tc) => tc.colIndex === cIdx) ||
          timeColumns[slotIdx % timeColumns.length] ||
          DEFAULT_SLOT_TIMES[slotIdx % DEFAULT_SLOT_TIMES.length];

        const room = detectRoom(cellText);
        const slotType = detectSlotType(cellText);
        const cleanName = cleanSubjectName(cellText);
        if (cleanName.length < 2) {
          slotIdx++;
          continue;
        }

        const { matchedId, name } = matchExistingSubject(cleanName, existingSubjects);

        // Check if cell or header has an embedded multi-hour time range (e.g. 09:00 - 13:00 = 4 hours)
        const cellTime = parseTimeRange(cellText) || matchedTimeCol;
        const [sh, sm] = (cellTime?.start || "09:00").split(":").map(Number);
        const [eh, em] = (cellTime?.end || "10:00").split(":").map(Number);
        const spanHours = Math.max(
          1,
          Math.min(6, Math.round(((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / 60))
        );

        for (let k = 0; k < spanHours; k++) {
          const targetSlotIdx = slotIdx + k;
          // Prefer detected time column from document, otherwise shift proportionally
          const detectedCol =
            timeColumns.find((tc) => tc.colIndex === cIdx + k) ||
            timeColumns[targetSlotIdx];

          let slotStart: string;
          let slotEnd: string;

          if (detectedCol?.start && detectedCol?.end) {
            slotStart = detectedCol.start;
            slotEnd = detectedCol.end;
          } else if (cellTime?.start && cellTime?.end) {
            const periodDur = Math.round(((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / spanHours);
            const startMins = sh * 60 + (sm || 0) + k * periodDur;
            const endMins = startMins + periodDur;
            slotStart = `${String(Math.floor(startMins / 60)).padStart(2, "0")}:${String(startMins % 60).padStart(2, "0")}`;
            slotEnd = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
          } else {
            const defTime = DEFAULT_SLOT_TIMES[targetSlotIdx % DEFAULT_SLOT_TIMES.length];
            slotStart = defTime.start;
            slotEnd = defTime.end;
          }

          slots.push({
            weekday: rowDay,
            weekdayName: DAY_NAMES[rowDay],
            slotIndex: targetSlotIdx,
            startTime: slotStart,
            endTime: slotEnd,
            room,
            slotType,
            subjectName: name,
            matchedSubjectId: matchedId,
            rawText: cellText,
          });
        }

        slotIdx += spanHours;
      }
    }
  }
  // Layout Branch 2: Days as Columns, Time intervals as Rows
  else if (dayColumns.length >= 3) {
    let rowSlotIndex = 0;

    for (let i = dayColumnsHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const cells = splitRowCells(line);
      if (cells.length < 2) continue;

      const timeRange =
        parseTimeRange(cells[0]) ||
        DEFAULT_SLOT_TIMES[rowSlotIndex % DEFAULT_SLOT_TIMES.length];

      for (const dc of dayColumns) {
        if (dc.colIndex >= cells.length) continue;
        const cellText = cells[dc.colIndex];
        if (isNonClassCell(cellText)) continue;

        const room = detectRoom(cellText);
        const slotType = detectSlotType(cellText);
        const cleanName = cleanSubjectName(cellText);
        if (cleanName.length < 2) continue;

        const { matchedId, name } = matchExistingSubject(cleanName, existingSubjects);

        slots.push({
          weekday: dc.weekday,
          weekdayName: DAY_NAMES[dc.weekday],
          slotIndex: rowSlotIndex,
          startTime: timeRange.start,
          endTime: timeRange.end,
          room,
          slotType,
          subjectName: name,
          matchedSubjectId: matchedId,
          rawText: cellText,
        });
      }

      rowSlotIndex++;
    }
  }
  // Layout Branch 3: Grouped List / Sequential Day Schedule
  else {
    let currentWeekday: number | null = null;
    let currentSlotIndex = 0;

    for (const line of lines) {
      // Check if line declares a day
      let daySwitched = false;
      for (const [dk, dnum] of Object.entries(DAY_KEYWORDS)) {
        if (
          new RegExp(`^\\s*${dk}\\b`, "i").test(line) ||
          new RegExp(`\\b${dk}\\s*:`, "i").test(line)
        ) {
          currentWeekday = dnum;
          currentSlotIndex = 0;
          daySwitched = true;
          break;
        }
      }
      if (daySwitched) continue;

      // Ignore lines prior to first day header
      if (currentWeekday === null) continue;

      if (isNonClassCell(line)) continue;

      const timeRange =
        parseTimeRange(line) ||
        DEFAULT_SLOT_TIMES[currentSlotIndex % DEFAULT_SLOT_TIMES.length];

      const room = detectRoom(line);
      const slotType = detectSlotType(line);
      const cleanName = cleanSubjectName(line);

      if (cleanName.length < 2 || /^\d+$/.test(cleanName)) continue;

      const { matchedId, name } = matchExistingSubject(cleanName, existingSubjects);

      const [sh, sm] = (timeRange.start || "09:00").split(":").map(Number);
      const [eh, em] = (timeRange.end || "10:00").split(":").map(Number);
      const spanHours = Math.max(
        1,
        Math.min(6, Math.round(((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / 60))
      );

      for (let k = 0; k < spanHours; k++) {
        let slotStart = timeRange.start;
        let slotEnd = timeRange.end;

        if (spanHours > 1) {
          const periodDur = Math.round(((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / spanHours);
          const startMins = sh * 60 + (sm || 0) + k * periodDur;
          const endMins = startMins + periodDur;
          slotStart = `${String(Math.floor(startMins / 60)).padStart(2, "0")}:${String(startMins % 60).padStart(2, "0")}`;
          slotEnd = `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
        }

        slots.push({
          weekday: currentWeekday,
          weekdayName: DAY_NAMES[currentWeekday],
          slotIndex: currentSlotIndex + k,
          startTime: slotStart,
          endTime: slotEnd,
          room,
          slotType,
          subjectName: name,
          matchedSubjectId: matchedId,
          rawText: line,
        });
      }

      currentSlotIndex += spanHours;
    }
  }

  // Deduplicate on (weekday, slotIndex)
  const uniqueMap = new Map<string, ParsedTimetableSlotResult>();
  for (const s of slots) {
    const key = `${s.weekday}_${s.slotIndex}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, s);
    }
  }

  const sortedSlots = Array.from(uniqueMap.values()).sort(
    (a, b) => a.weekday - b.weekday || a.slotIndex - b.slotIndex
  );

  const maxSlotFound = sortedSlots.reduce((max, s) => Math.max(max, s.slotIndex), 0);
  const maxSlotsPerDay = maxSlotFound > 0 ? Math.max(6, maxSlotFound + 1) : 6;

  return {
    slots: sortedSlots,
    effectiveStartDate,
    maxSlotsPerDay,
    defaultMinPercent,
  };
}

export function parseTimetableFromText(
  rawText: string,
  existingSubjects: AttendanceSubject[]
): ParsedTimetableSlotResult[] {
  return parseTimetableDocFromText(rawText, existingSubjects).slots;
}
