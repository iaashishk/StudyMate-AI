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

export interface ParsedHolidayResult {
  date: string; // 'YYYY-MM-DD'
  label: string;
  rawLine: string;
}

export interface ParsedAcademicDocResult {
  holidays: ParsedHolidayResult[];
  semesterStartDate?: string;
  semesterEndDate?: string;
  defaultMinPercent?: number;
  semesterName?: string;
}

// Helper to extract a date string (YYYY-MM-DD) from a snippet of text
function extractDateFromSnippet(
  textSnippet: string,
  referenceYear = new Date().getFullYear()
): string | null {
  if (!textSnippet) return null;

  // DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY
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

  // "26 January 2026" or "January 26, 2026"
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
 * Parses full academic calendar / notices, extracting holidays, semester start/end dates,
 * minimum attendance requirements, and term labels.
 */
export function parseAcademicDocFromText(
  rawText: string,
  referenceYear = new Date().getFullYear()
): ParsedAcademicDocResult {
  if (!rawText || !rawText.trim()) {
    return { holidays: [] };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const holidays: ParsedHolidayResult[] = [];
  const seenDates = new Set<string>();

  let semesterStartDate: string | undefined;
  let semesterEndDate: string | undefined;
  let defaultMinPercent: number | undefined;
  let semesterName: string | undefined;

  // 1. Detect minimum attendance requirement (e.g. "75% attendance mandatory")
  const attendancePctMatch = rawText.match(
    /(?:minimum|mandatory|compulsory|required)?\s*attendance(?:\s*(?:is|requirement|criteria|of))?\s*[:\-]?\s*(\d{2})%/i
  ) || rawText.match(/\b([6789]\d)%\s*(?:minimum\s*)?attendance\b/i);

  if (attendancePctMatch) {
    const pct = parseInt(attendancePctMatch[1], 10);
    if (pct >= 50 && pct <= 95) {
      defaultMinPercent = pct;
    }
  }

  // 2. Detect Semester / Term Name
  const semNameMatch = rawText.match(
    /\b((?:odd|even|monsoon|spring|winter|autumn|summer)\s*semester\s*(?:\d{4}[-–]\d{2,4})?)/i
  ) || rawText.match(/\b(academic\s*session\s*\d{4}[-–]\d{2,4})/i);

  if (semNameMatch) {
    semesterName = semNameMatch[1]
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  // 3. Scan line-by-line for semester start/end dates and holidays
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
      const d = extractDateFromSnippet(line, referenceYear);
      if (d) {
        semesterStartDate = d;
        continue; // don't count semester start as a holiday
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
      const d = extractDateFromSnippet(line, referenceYear);
      if (d) {
        semesterEndDate = d;
        continue;
      }
    }

    // Otherwise check for holiday
    const detectedDateStr = extractDateFromSnippet(line, referenceYear);
    if (detectedDateStr && !seenDates.has(detectedDateStr)) {
      // Clean up label
      let label = line
        .replace(/(\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b)|(\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b)/, "")
        .replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b|\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?\b/gi, "")
        .replace(/^[-:,\s|]+/, "")
        .replace(/[-:,\s|]+$/, "")
        .replace(/\b(holiday|vacation|closed|recess|gazetted)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!label || label.length < 2) {
        label = "Academic Holiday";
      } else {
        label = label
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }

      seenDates.add(detectedDateStr);
      holidays.push({
        date: detectedDateStr,
        label,
        rawLine: line,
      });
    }
  }

  // 4. Fallback for date range pattern: "Jan 2026 - May 2026"
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
        // approximate last day of end month
        const lastDay = new Date(parseInt(endY, 10), endM, 0).getDate();
        semesterEndDate = `${endY}-${String(endM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
    }
  }

  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return {
    holidays,
    semesterStartDate,
    semesterEndDate,
    defaultMinPercent,
    semesterName,
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
