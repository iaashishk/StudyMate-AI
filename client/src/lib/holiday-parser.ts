const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export type HolidayCategory =
  | "gazetted"
  | "observed_restricted"
  | "restricted"
  | "weekend"
  | "special_day";

export interface ParsedHolidayResult {
  date: string; // 'YYYY-MM-DD'
  label: string;
  rawLine: string;
  category?: HolidayCategory;
  categoryLabel?: string;
  isOffDay?: boolean;
  dayOfWeek?: string;
}

/** One column variant from a multi-column academic calendar (e.g. 1st Sem vs 3rd–7th Sem) */
export interface SemesterDateVariant {
  label: string;        // e.g. "All UG & PG 1st Sem (Fresh Batch)"
  shortLabel: string;   // e.g. "1st Sem"
  startDate: string;    // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  teachingDays?: number;
}

export interface ParsedAcademicDocResult {
  holidays: ParsedHolidayResult[]; // Official off-days by default (Gazetted + Observed Restricted)
  allExtractedItems: ParsedHolidayResult[]; // All items detected
  skippedSpecialDays: ParsedHolidayResult[]; // Special celebration days (where classes are held / no public holiday)
  semesterStartDate?: string;
  semesterEndDate?: string;
  defaultMinPercent?: number;
  semesterName?: string;
  detectedYear?: number;
  /** Present when the calendar has multiple columns (e.g. 1st sem vs 3rd–7th sem) */
  semesterDateVariants?: SemesterDateVariant[];
}

const KNOWN_FESTIVALS = [
  "Republic Day",
  "Independence Day",
  "Mahatma Gandhi Jayanti",
  "Maharaja Agrasen Jayanti",
  "Maharishi Valmiki Jayanti",
  "Dr. B.R. Ambedkar Jayanti",
  "Sir Chhotu Ram Jayanti",
  "Diwali",
  "Deepavali",
  "Dussehra",
  "Vijayadashami",
  "Maha Shivratri",
  "Holi",
  "Good Friday",
  "Buddha Purnima",
  "Eid-ul-Fitr",
  "Id-ul-Fitr",
  "Eid-ul-Adha",
  "Bakrid",
  "Muharram",
  "Milad-un-Nabi",
  "Eid-e-Milad",
  "Raksha Bandhan",
  "Janmashtami",
  "Guru Nanak Jayanti",
  "Guru Gobind Singh Jayanti",
  "Christmas",
  "Karva Chauth",
  "Goverdhan Puja",
  "Govardhan Puja",
  "Bhai Dooj",
  "Haryana Day",
  "Mahavir Jayanti",
  "Basant Panchami",
  "New Year's Day",
];

/**
 * Strips numbering, pipes, underscores, dates, and trailing weekday noise.
 * Formats holiday titles cleanly.
 */
export function cleanHolidayLabel(rawText: string, _detectedDateStr?: string): string {
  if (!rawText) return "Academic Holiday";

  let label = rawText;

  // 1. Remove table header words and schedule markers
  label = label.replace(
    /\b(sr\.?\s*no\.?|s\.?\s*no\.?|name\s+of\s+(?:the\s+)?holiday|date\s+on\s+which\s+they\s+fall|day\s+of\s+(?:the\s+)?week|remarks|schedule-[ivx]+)\b/gi,
    ""
  );

  // 2. Remove standard date patterns from string
  label = label
    .replace(/(\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b)|(\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b)/g, "")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/gi, "")
    .replace(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?\b/gi, "");

  // 3. Remove leading numbers, pipes, underscores, dots, e.g. "15. | ", "__6. | ", "(1) "
  label = label.replace(/^[\s\-_~|#*]*\d+[\s.\-_|)\/]+/, "");

  // 4. Remove trailing weekday names and day fragments (e.g. "| Friday", "| Sunda", "Friday", "Mon")
  // Protect "Good Friday"
  if (!/\bgood\s+friday\b/i.test(label)) {
    label = label.replace(
      /[\s|,-]+\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|sunda|frid|thurs|wednes|tues|mon|tue|wed|thu|fri|sat|sun)\b[\s|.]*$/i,
      ""
    );
  }

  // 5. Remove lingering standalone pipes or brackets at boundaries
  label = label
    .replace(/^[\s|:;.,_\-~/*#[\]()]+/, "")
    .replace(/[\s|:;.,_\-~/*#[\]()]+$/, "");

  // 6. Remove redundant words like "holiday", "closed", "vacation" if part of noise
  label = label.replace(/\b(holiday|vacation|closed|recess|gazetted)\b/gi, "").trim();

  // 7. Strip stray pipes in between (e.g. "Mahatma Gandhi | Jayanti" -> "Mahatma Gandhi Jayanti")
  label = label.replace(/\|/g, " ").replace(/\s+/g, " ").trim();

  if (!label || label.length < 2) {
    return "Academic Holiday";
  }

  // Check against known festival canonical names
  const lower = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const fest of KNOWN_FESTIVALS) {
    const festClean = fest.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lower === festClean || lower.includes(festClean) || festClean.includes(lower)) {
      if (Math.abs(lower.length - festClean.length) <= 4) {
        return fest;
      }
    }
  }

  // Proper Title Case formatting
  return label
    .split(" ")
    .map((w) => {
      const up = w.toUpperCase();
      if (up === "B.R." || up === "DR." || up === "ID" || up === "EID" || up === "RH") {
        return w;
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Cleans a holiday label for clean display in attendance components.
 */
export function cleanHolidayDisplay(label: string): string {
  return cleanHolidayLabel(label);
}

// Helper to extract a date string (YYYY-MM-DD) from a snippet of text
function extractDateFromSnippet(
  textSnippet: string,
  referenceYear = new Date().getFullYear()
): string | null {
  if (!textSnippet) return null;

  // DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY or DD.MM.YYYY
  const standardDateRegex = /(\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b)|(\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b)/;
  const match1 = textSnippet.match(standardDateRegex);
  if (match1) {
    const rawD = match1[0];
    const parts = rawD.split(/[-/.]/);
    if (parts[0].length === 4) {
      const y = parts[0];
      const m = String(parts[1]).padStart(2, "0");
      const d = String(parts[2]).padStart(2, "0");
      return `${y}-${m}-${d}`;
    } else {
      const d = String(parts[0]).padStart(2, "0");
      const m = String(parts[1]).padStart(2, "0");
      let y = parts[2] ? parts[2] : String(referenceYear);
      if (y.length === 2) y = `20${y}`;
      return `${y}-${m}-${d}`;
    }
  }

  // "26 January 2026" or "January 26, 2026" or "26 January"
  const monthNameRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b|\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?\b/i;
  const match2 = textSnippet.match(monthNameRegex);
  if (match2) {
    let day: number;
    let monthName: string;
    let year = referenceYear;

    if (match2[1] && match2[2]) {
      day = parseInt(match2[1], 10);
      monthName = match2[2].toLowerCase();
      if (match2[3]) year = parseInt(match2[3], 10);
    } else {
      monthName = match2[4].toLowerCase();
      day = parseInt(match2[5], 10);
      if (match2[6]) year = parseInt(match2[6], 10);
    }

    const mNum = MONTH_MAP[monthName];
    if (mNum && day >= 1 && day <= 31) {
      return `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Detects whether a line contains administrative letterhead or signatory noise.
 */
function isNoiseOrSignatoryLine(line: string): boolean {
  const l = line.toLowerCase();
  const noiseMarkers = [
    "deputy registrar",
    "assistant registrar",
    "registrar",
    "vice chancellor",
    "vice-chancellor",
    "establishment branch",
    "establishment",
    "dated:",
    "dated :",
    "endst. no",
    "endst no",
    "ref. no",
    "ref no",
    "circular no",
    "copy of above",
    "copy forwarded",
    "information and necessary action",
    "superintendent",
    "controller of exam",
    "dean academic",
    "epri pee er",
    "sindy rie te",
    "haryana state",
    "government of haryana",
    "chandigarh",
    "signature",
    "sd/-",
    "sd/",
    "order of the",
    // Note: "notification" intentionally excluded — it's the circular's own header
    // Note: "faridabad" excluded — appears in uni address but also in holiday text
  ];
  return noiseMarkers.some((marker) => l.includes(marker));
}

/**
 * Parses full academic calendar / notices, extracting holidays, semester start/end dates,
 * minimum attendance requirements, and term labels with state-aware circular intelligence.
 */
export function parseAcademicDocFromText(
  rawText: string,
  fallbackYear = new Date().getFullYear()
): ParsedAcademicDocResult {
  if (!rawText || !rawText.trim()) {
    return {
      holidays: [],
      allExtractedItems: [],
      skippedSpecialDays: [],
    };
  }

  // ── Detect if this is an ACADEMIC CALENDAR (schedule/exam timetable) ───────
  // Academic calendars have semester dates, exam periods — NOT holiday lists.
  // Holiday circulars use "Gazetted", "Schedule-I", "Restricted" keywords.
  const upperText = rawText.toUpperCase();
  const isAcademicCalendar =
    (upperText.includes("TEACHING TERM") ||
      upperText.includes("TEACHING PERIOD") ||
      upperText.includes("CLASS TEST") ||
      upperText.includes("PREPARATORY LEAVE") ||
      upperText.includes("PREPARATORY LEAVES") ||
      upperText.includes("END-TERM EXAM") ||
      upperText.includes("END TERM EXAM") ||
      upperText.includes("END-TERM PRACTICAL") ||
      upperText.includes("END TERM PRACTICAL") ||
      upperText.includes("END SEMESTER EXAM") ||
      upperText.includes("WINTER VACATION") ||
      upperText.includes("SUMMER VACATION") ||
      upperText.includes("MID-SEMESTER") ||
      upperText.includes("MIDSEMESTER") ||
      upperText.includes("COMMENCEMENT OF NEXT SEMESTER") ||
      upperText.includes("ACADEMIC CALENDAR")) &&
    !upperText.includes("GAZETTED") &&
    !upperText.includes("SCHEDULE-I") &&
    !upperText.includes("SCHEDULE I") &&
    !upperText.includes("RESTRICTED HOLIDAY");

  // Detect dominant calendar year in circular (e.g. 2026)
  let detectedYear = fallbackYear;
  const yearMatch =
    rawText.match(/\b(?:calendar\s*year|during\s*the\s*year|academic\s*year|session|year)\s*[:\-]?\s*(20\d\d)\b/i) ||
    rawText.match(/\b(202[4-9]|203[0-5])\b/);
  if (yearMatch) {
    detectedYear = parseInt(yearMatch[1], 10);
  }

  // ── For Academic Calendar docs: extract semester dates only, NO holiday entries ─
  if (isAcademicCalendar) {
    let semesterStartDate: string | undefined;
    let semesterEndDate: string | undefined;
    let semesterName: string | undefined;
    let defaultMinPercent: number | undefined;
    const semesterDateVariants: SemesterDateVariant[] = [];

    const attendancePctMatch =
      rawText.match(/(?:minimum|mandatory|compulsory|required)?\s*attendance(?:\s*(?:is|requirement|criteria|of))?\s*[:\-]?\s*(\d{2})%/i) ||
      rawText.match(/\b([6789]\d)%\s*(?:minimum\s*)?attendance\b/i);
    if (attendancePctMatch) {
      const pct = parseInt(attendancePctMatch[1], 10);
      if (pct >= 50 && pct <= 95) defaultMinPercent = pct;
    }

    const semNameMatch =
      rawText.match(/\b((?:odd|even|monsoon|spring|winter|autumn|summer)\s*semester\s*(?:\d{4}[-–]\d{2,4})?)/i) ||
      rawText.match(/\b(academic\s*session\s*\d{4}[-–]\d{2,4})/i) ||
      rawText.match(/ACADEMIC CALENDAR\s*\(([^)]+)\)/i);
    if (semNameMatch) {
      semesterName = semNameMatch[1]
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    // ── Detect column headers in the document ───────────────────────────
    // YMCA-style: "UG & PG 3rd, 5th & 7th Sem" | "All UG & PG 1st Sem."
    // We infer column roles from the full document text

    // Regex to extract ALL date ranges from a single line
    const ALL_RANGES_RE = /(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*(?:to|-|–)\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/gi;

    let col0Label = "UG & PG 3rd, 5th & 7th Sem (Senior Batches)";
    let col0Short = "3rd–7th Sem";
    let col1Label = "All UG & PG 1st Sem (MCA, M.Tech, B.Tech Fresh Batch)";
    let col1Short = "1st Sem (Fresh Batch)";

    const upperFull = rawText.toUpperCase();
    if (upperFull.includes("1ST SEM") || upperFull.includes("FIRST SEM") || upperFull.includes("FIRST YEAR")) {
      col1Label = "All UG & PG 1st Sem (MCA, M.Tech, B.Tech, M.Sc)";
      col1Short = "1st Sem (MCA/PG/UG)";
    }
    if (upperFull.includes("3RD") && upperFull.includes("5TH")) {
      col0Label = "UG & PG 3rd, 5th & 7th Sem (incl. B.Tech)";
      col0Short = "3rd/5th/7th Sem";
    }

    const acLines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of acLines) {
      const lower = line.toLowerCase();
      const isTermLine =
        lower.includes("teaching term") ||
        lower.includes("term-i") ||
        lower.includes("term i") ||
        lower.includes("term-ii") ||
        lower.includes("term ii") ||
        (lower.includes("term") && lower.includes("teaching"));

      if (isTermLine) {
        const allRanges: Array<{ start: string; end: string; teachingDays?: number }> = [];
        let m: RegExpExecArray | null;
        ALL_RANGES_RE.lastIndex = 0;

        const dayCountMatches = [...line.matchAll(/\b(\d{2,3})\s*(?:days?)?\b/g)]
          .map((dm) => parseInt(dm[1], 10))
          .filter((n) => n >= 10 && n <= 200);

        while ((m = ALL_RANGES_RE.exec(line)) !== null) {
          const d1 = extractDateFromSnippet(m[1], detectedYear);
          const d2 = extractDateFromSnippet(m[2], detectedYear);
          if (d1 && d2 && d1 < d2) {
            allRanges.push({ start: d1, end: d2 });
          }
        }

        if (allRanges.length > 0) {
          if (semesterDateVariants.length === 0) {
            // First Teaching Term (Teaching Term-I): initialize variants
            if (allRanges.length === 1) {
              semesterDateVariants.push({
                label: "This Semester",
                shortLabel: "Semester",
                startDate: allRanges[0].start,
                endDate: allRanges[0].end,
                teachingDays: dayCountMatches[0],
              });
            } else {
              const labels = [
                { label: col0Label, shortLabel: col0Short },
                { label: col1Label, shortLabel: col1Short },
              ];
              allRanges.forEach((range, i) => {
                const lbl = labels[i] || { label: `Option ${i + 1}`, shortLabel: `Option ${i + 1}` };
                semesterDateVariants.push({
                  label: lbl.label,
                  shortLabel: lbl.shortLabel,
                  startDate: range.start,
                  endDate: range.end,
                  teachingDays: dayCountMatches[i],
                });
              });
            }
          } else {
            // Subsequent Teaching Term (e.g. Teaching Term-II): extend the tentative end date
            allRanges.forEach((range, i) => {
              if (semesterDateVariants[i]) {
                if (!semesterDateVariants[i].endDate || range.end > semesterDateVariants[i].endDate!) {
                  semesterDateVariants[i].endDate = range.end;
                }
                if (dayCountMatches[i] && semesterDateVariants[i].teachingDays) {
                  semesterDateVariants[i].teachingDays! += dayCountMatches[i];
                }
              }
            });
          }
        }
        continue;
      }

      // Check for exam / semester conclusion markers (End-Term, Preparatory, Last day of teaching)
      const isExamOrEnd =
        lower.includes("preparatory leave") ||
        lower.includes("end-term") ||
        lower.includes("end term") ||
        lower.includes("theory examination") ||
        lower.includes("last day of teaching");

      if (isExamOrEnd && semesterDateVariants.length > 0) {
        const dateRegex = /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g;
        const lineDates = [...line.matchAll(dateRegex)]
          .map((dm) => extractDateFromSnippet(dm[1], detectedYear))
          .filter((d): d is string => !!d);

        if (lineDates.length >= 4 && semesterDateVariants.length >= 2) {
          // Two date ranges on this row: Col 0 end = lineDates[1], Col 1 end = lineDates[3]
          if (lineDates[1] > (semesterDateVariants[0].endDate || "")) semesterDateVariants[0].endDate = lineDates[1];
          if (lineDates[3] > (semesterDateVariants[1].endDate || "")) semesterDateVariants[1].endDate = lineDates[3];
        } else if (lineDates.length >= 2 && semesterDateVariants.length >= 2) {
          // Two dates: Col 0 date = lineDates[0], Col 1 date = lineDates[1]
          if (lineDates[0] > (semesterDateVariants[0].endDate || "")) semesterDateVariants[0].endDate = lineDates[0];
          if (lineDates[1] > (semesterDateVariants[1].endDate || "")) semesterDateVariants[1].endDate = lineDates[1];
        } else if (lineDates.length === 1 && semesterDateVariants.length > 0) {
          for (const v of semesterDateVariants) {
            if (!v.endDate || lineDates[0] > v.endDate) {
              v.endDate = lineDates[0];
            }
          }
        }
      }
    }

    // Default top-level dates for backward compatibility
    if (semesterDateVariants.length > 0) {
      semesterStartDate = semesterDateVariants[0].startDate;
      semesterEndDate = semesterDateVariants[0].endDate;
    }

    return {
      holidays: [],
      allExtractedItems: [],
      skippedSpecialDays: [],
      semesterStartDate,
      semesterEndDate,
      defaultMinPercent,
      semesterName,
      detectedYear,
      semesterDateVariants: semesterDateVariants.length > 1 ? semesterDateVariants : undefined,
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);


  const allExtractedItems: ParsedHolidayResult[] = [];
  const skippedSpecialDays: ParsedHolidayResult[] = [];
  const seenDates = new Set<string>();

  let semesterStartDate: string | undefined;
  let semesterEndDate: string | undefined;
  let defaultMinPercent: number | undefined;
  let semesterName: string | undefined;

  // 1. Detect minimum attendance requirement (e.g. "75% attendance mandatory")
  const attendancePctMatch =
    rawText.match(
      /(?:minimum|mandatory|compulsory|required)?\s*attendance(?:\s*(?:is|requirement|criteria|of))?\s*[:\-]?\s*(\d{2})%/i
    ) || rawText.match(/\b([6789]\d)%\s*(?:minimum\s*)?attendance\b/i);

  if (attendancePctMatch) {
    const pct = parseInt(attendancePctMatch[1], 10);
    if (pct >= 50 && pct <= 95) {
      defaultMinPercent = pct;
    }
  }

  // 2. Detect Semester / Term Name
  const semNameMatch =
    rawText.match(
      /\b((?:odd|even|monsoon|spring|winter|autumn|summer)\s*semester\s*(?:\d{4}[-–]\d{2,4})?)/i
    ) || rawText.match(/\b(academic\s*session\s*\d{4}[-–]\d{2,4})/i);

  if (semNameMatch) {
    semesterName = semNameMatch[1]
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  let currentSection:
    | "GAZETTED"
    | "WEEKEND"
    | "RESTRICTED"
    | "SPECIAL_DAYS"
    | "OBSERVED_RESTRICTED" = "GAZETTED";

  // 3. Scan line-by-line
  for (const line of lines) {
    const lower = line.toLowerCase();

    // Check if line indicates semester commencement
    const isCommencement =
      lower.includes("commence") ||
      lower.includes("commencement") ||
      lower.includes("classes begin") ||
      lower.includes("semester start") ||
      lower.includes("classes start") ||
      lower.includes("session begin") ||
      lower.includes("term begin");

    if (isCommencement && !semesterStartDate) {
      const d = extractDateFromSnippet(line, detectedYear);
      if (d) {
        semesterStartDate = d;
        continue;
      }
    }

    // Check if line indicates semester conclusion or exam period
    const isConclusion =
      lower.includes("classes end") ||
      lower.includes("semester end") ||
      lower.includes("term end") ||
      lower.includes("last working day") ||
      lower.includes("last day of instruction") ||
      lower.includes("preparatory leave") ||
      lower.includes("end term exam");

    if (isConclusion && !semesterEndDate) {
      const d = extractDateFromSnippet(line, detectedYear);
      if (d) {
        semesterEndDate = d;
        continue;
      }
    }

    // Check section transitions using precise regexes
    if (
      /\bSCHEDULE[- ]*IV\b/i.test(line) ||
      /SPECIAL\s*DAYS/i.test(line) ||
      /NO\s*PUBLIC\s*HOLIDAY/i.test(line)
    ) {
      currentSection = "SPECIAL_DAYS";
      continue;
    }

    if (
      (/OBSERVED\s*AS\s*HOLIDAYS/i.test(line) && /RESTRICTED/i.test(line)) ||
      /ON\s*ACCOUNT\s*OF\s*RESTRICTED/i.test(line) ||
      /FOLLOWING\s*THREE\s*DAYS\s*SHALL\s*BE\s*OBSERVED/i.test(line)
    ) {
      currentSection = "OBSERVED_RESTRICTED";
      continue; // Don't parse the header line as a holiday entry
    } else if (
      /\bSCHEDULE[- ]*II\b/i.test(line) ||
      /RESTRICTED\s*HOLIDAYS?/i.test(line)
    ) {
      currentSection = "RESTRICTED";
      continue;
    } else if (
      /FALLS?\s*ON\s*SATURDAYS?\s*(?:\/|AND)?\s*SUNDAYS?/i.test(line) ||
      /WEEKEND\s*HOLIDAYS?/i.test(line) ||
      /ADMISSIBLE\s*TO\s*THOSE\s*NORMALLY\s*WORK/i.test(line)
    ) {
      currentSection = "WEEKEND";
      continue;
    } else if (
      /\bSCHEDULE[- ]*I\b/i.test(line) ||
      /GAZETTED\s*HOLIDAYS?/i.test(line) ||
      /PUBLIC\s*HOLIDAYS?/i.test(line)
    ) {
      currentSection = "GAZETTED";
      continue;
    }

    // Ignore administrative noise and letterhead metadata
    if (isNoiseOrSignatoryLine(line)) {
      continue;
    }

    // ── Inline list detection ────────────────────────────────────────────
    // Handles formats like:
    //   "April 03, 2026 (Good Friday)"     ← with year
    //   "April 03 (Good Friday)"           ← without year
    //   "April 03, 2026 (Good Friday), May 01, 2026 (Buddha Purnima)"  ← multiple
    const inlineMatches = [
      // With optional ", YYYY" after the day number
      ...line.matchAll(/\b([a-z]{3,9})\s+(\d{1,2})(?:\s*,\s*\d{4})?\s*\(([^)]+)\)/gi),
    ];
    if (inlineMatches.length > 0) {
      for (const m of inlineMatches) {
        const monthName = m[1].toLowerCase();
        const day = parseInt(m[2], 10);
        const festName = m[3].trim();
        const mNum = MONTH_MAP[monthName];
        if (mNum && day >= 1 && day <= 31) {
          const dateStr = `${detectedYear}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const cleanLabel = cleanHolidayLabel(festName, dateStr);

          // OBSERVED_RESTRICTED can override a prior RESTRICTED entry for same date
          if (currentSection === "OBSERVED_RESTRICTED" && seenDates.has(dateStr)) {
            const existingIdx = allExtractedItems.findIndex((it) => it.date === dateStr);
            if (existingIdx >= 0 && allExtractedItems[existingIdx].category === "restricted") {
              // Upgrade: restricted → observed_restricted (it IS an off-day)
              allExtractedItems[existingIdx] = {
                ...allExtractedItems[existingIdx],
                label: cleanLabel,
                category: "observed_restricted",
                categoryLabel: "Observed Holiday (RH)",
                isOffDay: true,
              };
            }
            continue;
          }

          if (!seenDates.has(dateStr)) {
            seenDates.add(dateStr);
            const cat = currentSection === "OBSERVED_RESTRICTED" ? "observed_restricted" : "gazetted";
            allExtractedItems.push({
              date: dateStr,
              label: cleanLabel,
              category: cat,
              categoryLabel: cat === "observed_restricted" ? "Observed Holiday (RH)" : "Gazetted Holiday",
              isOffDay: true,
              rawLine: line,
            });
          }
        }
      }
      continue;
    }

    // Standard date detection
    const detectedDateStr = extractDateFromSnippet(line, detectedYear);
    if (!detectedDateStr) continue;

    // Reject dates that come from metadata lines (e.g. "Dated: 05/02/2026")
    if (/\b(?:dated|ref\.?\s*no|endst\.?\s*no)\b/i.test(line)) {
      continue;
    }

    // If currently in Schedule IV (Special Days - explicitly no public holiday)
    if (currentSection === "SPECIAL_DAYS") {
      const cleanLabel = cleanHolidayLabel(line, detectedDateStr);
      skippedSpecialDays.push({
        date: detectedDateStr,
        label: cleanLabel,
        category: "special_day",
        categoryLabel: "Special Celebration Day (College Open)",
        isOffDay: false,
        rawLine: line,
      });
      continue; // Exclude from real holidays!
    }

    // OBSERVED_RESTRICTED can override a prior RESTRICTED entry for the same date
    if (currentSection === "OBSERVED_RESTRICTED" && seenDates.has(detectedDateStr)) {
      const existingIdx = allExtractedItems.findIndex((it) => it.date === detectedDateStr);
      if (existingIdx >= 0 && allExtractedItems[existingIdx].category === "restricted") {
        const cleanLabel = cleanHolidayLabel(line, detectedDateStr);
        if (cleanLabel.length >= 3) {
          allExtractedItems[existingIdx] = {
            ...allExtractedItems[existingIdx],
            label: cleanLabel,
            category: "observed_restricted",
            categoryLabel: "Observed Holiday (RH)",
            isOffDay: true,
          };
        }
      }
      continue;
    }

    if (seenDates.has(detectedDateStr)) continue;

    const cleanLabel = cleanHolidayLabel(line, detectedDateStr);
    if (cleanLabel.length < 3 || isNoiseOrSignatoryLine(cleanLabel)) {
      continue;
    }

    seenDates.add(detectedDateStr);

    let category: HolidayCategory = "gazetted";
    let categoryLabel = "Gazetted Holiday";
    let isOffDay = true;

    if (currentSection === "WEEKEND") {
      category = "weekend";
      categoryLabel = "Weekend (Sat/Sun)";
      isOffDay = false;
    } else if (currentSection === "RESTRICTED") {
      category = "restricted";
      categoryLabel = "Restricted (Optional)";
      isOffDay = false;
    } else if (currentSection === "OBSERVED_RESTRICTED") {
      category = "observed_restricted";
      categoryLabel = "Observed Holiday (RH)";
      isOffDay = true;
    }

    allExtractedItems.push({
      date: detectedDateStr,
      label: cleanLabel,
      category,
      categoryLabel,
      isOffDay,
      rawLine: line,
    });
  }

  // Fallback for date range pattern: "Jan 2026 - May 2026"
  if (!semesterStartDate || !semesterEndDate) {
    const rangeMatch = rawText.match(
      /\b([a-z]{3,9})\.?\s*(\d{4})\s*(?:to|-|–)\s*([a-z]{3,9})\.?\s*(\d{4})\b/i
    );
    if (rangeMatch) {
      const startM = MONTH_MAP[rangeMatch[1].toLowerCase()];
      const startY = rangeMatch[2];
      const endM = MONTH_MAP[rangeMatch[3].toLowerCase()];
      const endY = rangeMatch[4];

      if (startM && !semesterStartDate) {
        semesterStartDate = `${startY}-${String(startM).padStart(2, "0")}-01`;
      }
      if (endM && !semesterEndDate) {
        const lastDay = new Date(parseInt(endY, 10), endM, 0).getDate();
        semesterEndDate = `${endY}-${String(endM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }

  allExtractedItems.sort((a, b) => a.date.localeCompare(b.date));
  skippedSpecialDays.sort((a, b) => a.date.localeCompare(b.date));

  // The primary holidays are off-days (Gazetted + Observed Restricted)
  // If no sections were distinguished, fallback to all valid extracted items
  const hasSections = allExtractedItems.some((h) => h.category !== "gazetted");
  const holidays = hasSections
    ? allExtractedItems.filter((h) => h.isOffDay === true)
    : allExtractedItems;

  return {
    holidays,
    allExtractedItems,
    skippedSpecialDays,
    semesterStartDate,
    semesterEndDate,
    defaultMinPercent,
    semesterName,
    detectedYear,
  };
}

/**
 * Backward compatible wrapper for parseHolidaysFromText
 */
export function parseHolidaysFromText(
  rawText: string,
  referenceYear = new Date().getFullYear()
): ParsedHolidayResult[] {
  return parseAcademicDocFromText(rawText, referenceYear).holidays;
}

