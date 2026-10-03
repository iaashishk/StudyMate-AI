/**
 * doc-normalize.ts
 * ─────────────────────────────────────────────────────────────────
 * Document text normalization pipeline.
 * Repairs OCR line-wrap anomalies, merges sentences, cleans noisy tokens,
 * and fixes wrapped headers (e.g. YMCA observed restricted holidays notice).
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * Normalizes extracted raw text from PDF/OCR before passing to parsers.
 */
export function normalizeDocText(rawText: string): string {
  if (!rawText) return "";

  // 1. Unify newlines and strip non-printable characters
  let text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Fix common OCR character confusions inside potential date tokens (e.g. 2O26 -> 2026, l5.08 -> 15.08)
  text = text.replace(/\b([0-3]?[0-9])[./]([0-1]?[0-9])[./](2[0O][23][0-9])\b/g, (_m, d, mo, y) => {
    return `${d}.${mo}.${y.replace(/O/g, "0")}`;
  });

  // 3. Split into lines for structural normalization
  const rawLines = text.split("\n").map((l) => l.trim());
  const mergedLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    if (!current) continue;

    // Check if the current line wraps into the next line.
    // Specifically handles:
    // "In addition to above, the following three days shall be observed as holidays in the University on"
    // followed by
    // "account of Restricted Holidays notified by the State Government: -"
    const nextLine = rawLines[i + 1];
    if (nextLine) {
      const lowerCur = current.toLowerCase();
      const lowerNext = nextLine.toLowerCase();

      const endsWithConnector =
        lowerCur.endsWith(" on") ||
        lowerCur.endsWith(" on /") ||
        lowerCur.endsWith(" of") ||
        lowerCur.endsWith(" in the") ||
        lowerCur.endsWith(" under") ||
        lowerCur.endsWith(" and") ||
        lowerCur.endsWith(" for");

      const startsWithContinuation =
        lowerNext.startsWith("account of") ||
        lowerNext.startsWith("account of restricted") ||
        lowerNext.startsWith("notified by") ||
        lowerNext.startsWith("schedule-") ||
        (/^[a-z]/.test(nextLine) && !/^\d{1,2}[./-]/.test(nextLine));

      if (endsWithConnector || startsWithContinuation) {
        // Merge lines together
        mergedLines.push(`${current} ${nextLine}`);
        i++; // skip next line since it was merged
        continue;
      }
    }

    // Clean OCR bullet debris at line boundaries
    const cleaned = current
      .replace(/^[\s•*~_>|—-]+/, "")
      .replace(/[\s_>|—]+$/, "")
      .trim();

    if (cleaned) {
      mergedLines.push(cleaned);
    }
  }

  return mergedLines.join("\n");
}
