import { AttendanceSubject } from "../types/attendance";

const DAY_KEYWORDS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 0,
  sun: 0,
};

const DEFAULT_SLOT_TIMES = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:15", end: "12:15" },
  { start: "12:15", end: "13:15" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
];

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
  matchedSubjectId: string | null;
}

export interface ParsedTimetableDocResult {
  slots: ParsedTimetableSlotResult[];
  effectiveStartDate?: string;
  maxSlotsPerDay?: number;
  defaultMinPercent?: number;
}

/**
 * Intelligent client-side timetable extractor for text extracted via OCR or PDF.
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

  const parsedSlots: ParsedTimetableSlotResult[] = [];
  let currentWeekday: number = 1; // Default Monday
  let currentSlotIndex = 0;

  // Time pattern like: 9:00 - 10:00, 09:00-10:00, 9am - 10am, 9.00 to 10.00
  const timeRegex = /(\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i;

  const normalizeTime = (tStr: string): string => {
    let clean = tStr.trim().toLowerCase().replace(".", ":");
    const isPM = clean.includes("pm");
    const isAM = clean.includes("am");
    clean = clean.replace(/(am|pm)/g, "").trim();
    let [h, m] = clean.split(":").map(Number);
    if (isNaN(m)) m = 0;
    if (isNaN(h)) h = 9;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line indicates a day of the week
    for (const [dayKey, dayNum] of Object.entries(DAY_KEYWORDS)) {
      const dayWordRegex = new RegExp(`\\b${dayKey}\\b`, "i");
      if (dayWordRegex.test(line)) {
        currentWeekday = dayNum;
        currentSlotIndex = 0;
        break;
      }
    }

    // Check if line contains a time interval
    const timeMatch = line.match(timeRegex);
    let startTime = DEFAULT_SLOT_TIMES[currentSlotIndex % 6].start;
    let endTime = DEFAULT_SLOT_TIMES[currentSlotIndex % 6].end;

    if (timeMatch) {
      startTime = normalizeTime(timeMatch[1]);
      endTime = normalizeTime(timeMatch[2]);
    }

    // Check for room/hall patterns e.g. Room 302, Hall B, LH-1, Lab 4
    const roomMatch = line.match(/\b(?:room|lab|hall|lh|lt|cr)[-:\s]*([a-z0-9]+)\b/i);
    const room = roomMatch ? roomMatch[0].toUpperCase() : "";

    // Check if this is a Lab or Tutorial or Lecture
    let slotType: "lecture" | "lab" | "tutorial" = "lecture";
    if (/\b(lab|practical|workshop|pr|hands-on)\b/i.test(line)) {
      slotType = "lab";
    } else if (/\b(tutorial|tut|discussion|seminar)\b/i.test(line)) {
      slotType = "tutorial";
    }

    // Clean text to identify subject
    let cleanedCandidate = line
      .replace(timeRegex, "")
      .replace(/\b(?:room|lab|hall|lh|lt|cr)[-:\s]*([a-z0-9]+)\b/gi, "")
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, "")
      .replace(/\b(lecture|lab|practical|tutorial|period|slot|sem|semester)\b/gi, "")
      .replace(/[^a-zA-Z0-9\s&+-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanedCandidate.length >= 2 && !/^\d+$/.test(cleanedCandidate)) {
      // Find best matching subject from user's subjects
      let matchedSubjectId: string | null = null;
      let matchedName = cleanedCandidate;

      const lowerCand = cleanedCandidate.toLowerCase();
      for (const subj of existingSubjects) {
        const sName = subj.name.toLowerCase();
        const sCode = (subj.code || "").toLowerCase();

        if (
          lowerCand.includes(sName) ||
          sName.includes(lowerCand) ||
          (sCode && lowerCand.includes(sCode))
        ) {
          matchedSubjectId = subj._id;
          matchedName = subj.name;
          break;
        }
      }

      parsedSlots.push({
        weekday: currentWeekday,
        weekdayName:
          Object.keys(DAY_KEYWORDS).find((k) => DAY_KEYWORDS[k] === currentWeekday)?.toUpperCase() ||
          "MONDAY",
        slotIndex: currentSlotIndex % 6,
        startTime,
        endTime,
        room,
        slotType,
        rawText: line,
        subjectName: matchedName,
        matchedSubjectId,
      });

      currentSlotIndex++;
    }
  }

  // Deduplicate slots on same (weekday, slotIndex)
  const uniqueMap = new Map<string, ParsedTimetableSlotResult>();
  for (const s of parsedSlots) {
    const key = `${s.weekday}_${s.slotIndex}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, s);
    }
  }

  // 1. Detect effective date (e.g. "w.e.f. 05/01/2026" or "effective from: 05-01-2026")
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
  const attMatch = rawText.match(
    /(?:minimum|mandatory|required)?\s*attendance(?:\s*(?:is|requirement|criteria|of))?\s*[:\-]?\s*(\d{2})%/i
  ) || rawText.match(/\b([6789]\d)%\s*(?:minimum\s*)?attendance\b/i);
  if (attMatch) {
    const pct = parseInt(attMatch[1], 10);
    if (pct >= 50 && pct <= 95) defaultMinPercent = pct;
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
