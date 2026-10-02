/**
 * Attendance calculation engine implementing PRD Section 5 rules and formulas.
 * Single source of truth for both server responses and statistical projections.
 */

/**
 * Calculates attendance metrics and bunk status for a single subject.
 *
 * @param {Object} params
 * @param {number} params.openingAttended - Opening attended sessions (FR-S3)
 * @param {number} params.openingConducted - Opening conducted sessions (FR-S3)
 * @param {number} params.presentCount - Number of 'present' sessions
 * @param {number} params.absentCount - Number of 'absent' sessions
 * @param {number} [params.cancelledCount] - Number of 'cancelled' sessions (excluded from counts)
 * @param {number} params.minPercent - Subject minimum limit L (default 75)
 * @param {number} [params.safetyMargin=0] - Optional safety buffer m (e.g. +2%)
 */
export function calculateSubjectStats({
  openingAttended = 0,
  openingConducted = 0,
  presentCount = 0,
  absentCount = 0,
  cancelledCount = 0,
  minPercent = 75,
  safetyMargin = 0,
}) {
  const attended = Math.max(0, Number(openingAttended || 0) + Number(presentCount || 0));
  const conducted = Math.max(
    0,
    Number(openingConducted || 0) + Number(presentCount || 0) + Number(absentCount || 0)
  );

  const L = Math.min(Math.max(Number(minPercent) || 75, 1), 100);
  const m = Math.max(Number(safetyMargin) || 0, 0);
  const effectiveLimit = Math.min(L + m, 100);

  const hasData = conducted > 0;
  const rawPct = hasData ? (attended / conducted) * 100 : 0;
  const pct = Number(rawPct.toFixed(1));

  let status = "safe"; // 'safe' | 'edge' | 'danger'
  let classesToAttend = 0;
  let safeToMiss = 0;
  let message = "";

  if (!hasData) {
    status = "edge";
    message = "No attendance recorded yet";
  } else if (rawPct < effectiveLimit) {
    status = "danger";
    if (effectiveLimit >= 100) {
      classesToAttend = attended < conducted ? Infinity : 0;
      message = "100% required — cannot recover from missed classes";
    } else {
      const numerator = effectiveLimit * conducted - 100 * attended;
      const denominator = 100 - effectiveLimit;
      classesToAttend = Math.max(1, Math.ceil(numerator / denominator));
      message = `Attend next ${classesToAttend} class${classesToAttend === 1 ? "" : "es"} to recover`;
    }
  } else {
    // rawPct >= effectiveLimit
    if (effectiveLimit <= 0) {
      safeToMiss = 999;
      status = "safe";
      message = "Limit is 0%";
    } else {
      const maxMiss = Math.floor((100 * attended) / effectiveLimit - conducted);
      safeToMiss = Math.max(0, maxMiss);

      if (safeToMiss === 0) {
        status = "edge";
        message = "Don't miss the next class.";
      } else {
        status = "safe";
        message = `You can bunk ${safeToMiss} more class${safeToMiss === 1 ? "" : "es"}.`;
      }
    }
  }

  // "Can I bunk this class?" (FR-K2): projected % if skipped = attended / (conducted + 1)
  const projectedSkippedPct =
    conducted + 1 > 0 ? Number(((attended / (conducted + 1)) * 100).toFixed(1)) : 0;
  const canBunkNext = (attended / (conducted + 1)) * 100 >= effectiveLimit;

  return {
    attended,
    conducted,
    cancelled: Number(cancelledCount || 0),
    percentage: pct,
    rawPercentage: rawPct,
    hasData,
    minPercent: L,
    safetyMargin: m,
    effectiveLimit,
    status,
    classesToAttend: classesToAttend === Infinity ? "Cannot recover" : classesToAttend,
    classesToAttendNumber: classesToAttend,
    safeToMiss,
    message,
    projectedSkippedPct,
    canBunkNext,
  };
}

/**
 * Calculates overall attendance stats across all subjects.
 * (PRD Section 5: Overall % is sum of all attended / sum of all conducted)
 */
export function calculateOverallStats(subjectStatsList = []) {
  let totalAttended = 0;
  let totalConducted = 0;
  let totalCancelled = 0;
  let totalSafeBunks = 0;

  subjectStatsList.forEach((stat) => {
    totalAttended += stat.attended;
    totalConducted += stat.conducted;
    totalCancelled += stat.cancelled;
    if (stat.status === "safe") {
      totalSafeBunks += stat.safeToMiss;
    }
  });

  const overallPct =
    totalConducted > 0 ? Number(((totalAttended / totalConducted) * 100).toFixed(1)) : 0;

  return {
    totalAttended,
    totalConducted,
    totalCancelled,
    overallPercentage: overallPct,
    overallBunkBudget: totalSafeBunks, // FR-K3
    hasData: totalConducted > 0,
  };
}

/**
 * Calculates semester forecast and bunk projection (FR-K4, FR-K5).
 *
 * @param {Object} params
 * @param {number} params.attended - Currently attended count
 * @param {number} params.conducted - Currently conducted count
 * @param {number} params.remaining - Scheduled sessions from tomorrow to semester end
 * @param {number} params.minPercent - Subject limit L
 * @param {number} [params.safetyMargin=0]
 * @param {number} [params.plannedBunks=0] - Skips planned by the user
 */
export function calculateSemesterForecast({
  attended,
  conducted,
  remaining,
  minPercent = 75,
  safetyMargin = 0,
  plannedBunks = 0,
}) {
  const L = Math.min(Math.max(Number(minPercent) || 75, 1), 100);
  const m = Math.max(Number(safetyMargin) || 0, 0);
  const effectiveLimit = Math.min(L + m, 100);
  const R = Math.max(0, Number(remaining || 0));
  const b = Math.min(Math.max(0, Number(plannedBunks || 0)), R);

  const totalPossibleConducted = conducted + R;

  // Max bunks left in semester:
  // b_max = floor( attended + R - (L * (conducted + R) / 100) )
  const b_max_raw = Math.floor(
    attended + R - (effectiveLimit * totalPossibleConducted) / 100
  );
  const maxBunksLeft = Math.max(0, b_max_raw);

  // Minimum to attend:
  // need = max(0, ceil( (L * (conducted + R) / 100) - attended ))
  const need_raw = Math.ceil(
    (effectiveLimit * totalPossibleConducted) / 100 - attended
  );
  const minimumToAttend = Math.max(0, need_raw);
  const isRecoverable = minimumToAttend <= R;

  // Projected final percentage with planned bunks
  // projected = (attended + R - b) / (conducted + R) * 100
  const finalAttended = Math.max(0, attended + R - b);
  const projectedFinalPct =
    totalPossibleConducted > 0
      ? Number(((finalAttended / totalPossibleConducted) * 100).toFixed(1))
      : 0;

  return {
    remainingSessions: R,
    maxBunksLeft,
    minimumToAttend,
    isRecoverable,
    plannedBunks: b,
    projectedFinalPct,
    breachesLimit: projectedFinalPct < effectiveLimit,
  };
}
