/**
 * StudyMate AI — Scoring Engine
 * ─────────────────────────────
 * Generates a day-by-day study plan using a weighted priority algorithm.
 *
 * Priority Score Formula:
 *   score = urgency × (6 - confidence) × topicWeight
 *
 * Where:
 *   urgency     = 1 / max(daysUntilExam, 1)        (closer exam → higher urgency)
 *   confidence  = user-rated 1–5 (lower = more priority)
 *   topicWeight = topic.estimatedMinutes / totalSubjectMinutes
 *
 * Higher score → topic appears earlier in the plan.
 *
 * This is fully explainable in an interview:
 *   "A topic with 2-day urgency, confidence 1, in a 100% weight slot scores
 *    (1/2) × 5 × 1.0 = 2.5 — far ahead of a comfortable topic weeks away."
 */

/**
 * @param {Array} subjects  — populated Subject documents (with .topics[])
 * @param {Date}  startDate — first day of the plan (usually today)
 * @param {number} dailyHours — hours available per day
 * @returns {Array} planEntries — sorted array of PlanEntry objects
 */
export function generateStudyPlan(subjects, startDate, dailyHours) {
  const dailyMinutes = dailyHours * 60;

  // ── 1. Score every pending topic ───────────────────────────────────────────
  const scoredTopics = [];

  for (const subject of subjects) {
    const examDate = new Date(subject.examDate);
    const now = new Date(startDate);
    const daysUntilExam = Math.max(
      Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)),
      1
    );

    const urgency = 1 / daysUntilExam;

    // Total estimated minutes across all incomplete topics in this subject
    const pendingTopics = subject.topics.filter((t) => !t.completed);
    const totalSubjectMinutes = pendingTopics.reduce(
      (sum, t) => sum + (t.estimatedMinutes || 30),
      0
    );

    for (const topic of pendingTopics) {
      const topicMinutes = topic.estimatedMinutes || 30;
      const topicWeight =
        totalSubjectMinutes > 0 ? topicMinutes / totalSubjectMinutes : 1;

      const score = urgency * (6 - topic.confidenceScore) * topicWeight;

      scoredTopics.push({
        subjectId: subject._id,
        subjectName: subject.name,
        subjectColor: subject.colorTag || "#5C8368",
        topicId: topic._id,
        topicTitle: topic.title,
        estimatedMinutes: topicMinutes,
        priorityScore: parseFloat(score.toFixed(4)),
        daysUntilExam,
        confidence: topic.confidenceScore,
      });
    }
  }

  // ── 2. Sort by priority score (highest first) ──────────────────────────────
  scoredTopics.sort((a, b) => b.priorityScore - a.priorityScore);

  // ── 3. Greedily assign topics to calendar days ────────────────────────────
  const planEntries = [];
  let currentDay = new Date(startDate);
  currentDay.setHours(0, 0, 0, 0);
  let minutesUsedToday = 0;

  for (const topic of scoredTopics) {
    let remaining = topic.estimatedMinutes;

    while (remaining > 0) {
      const availableToday = dailyMinutes - minutesUsedToday;

      if (availableToday <= 0) {
        // Move to next day
        currentDay = new Date(currentDay);
        currentDay.setDate(currentDay.getDate() + 1);
        minutesUsedToday = 0;
        continue;
      }

      const chunk = Math.min(remaining, availableToday);

      planEntries.push({
        date: new Date(currentDay),
        subjectId: topic.subjectId,
        subjectName: topic.subjectName,
        subjectColor: topic.subjectColor,
        topicId: topic.topicId,
        topicTitle: topic.topicTitle,
        estimatedMinutes: chunk,
        status: "pending",
        priorityScore: topic.priorityScore,
      });

      minutesUsedToday += chunk;
      remaining -= chunk;
    }
  }

  return planEntries;
}

/**
 * Reschedule missed entries starting from today.
 * Called when a user marks a task as "missed".
 *
 * @param {Array}  existingEntries  — current plan entries from DB
 * @param {Array}  missedEntryIds   — _id strings of missed entries to reschedule
 * @param {Date}   today
 * @param {number} dailyHours
 * @returns {Array} updated entries array
 */
export function rescheduleMissedEntries(existingEntries, missedEntryIds, today, dailyHours) {
  const dailyMinutes = dailyHours * 60;
  const missedSet = new Set(missedEntryIds.map(String));

  // Pull out the missed tasks; keep the rest
  const missedTasks = existingEntries.filter((e) => missedSet.has(String(e._id)));
  const remaining = existingEntries.filter((e) => !missedSet.has(String(e._id)));

  // Find the last scheduled day in remaining entries
  const futurePending = remaining
    .filter((e) => e.status === "pending" && new Date(e.date) >= today)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Calculate how many minutes are already used on each future day
  const dayMinutesMap = {};
  for (const entry of remaining) {
    const dateKey = new Date(entry.date).toDateString();
    if (!dayMinutesMap[dateKey]) dayMinutesMap[dateKey] = 0;
    if (entry.status === "pending") {
      dayMinutesMap[dateKey] += entry.estimatedMinutes;
    }
  }

  // Re-insert missed tasks into the earliest available slots
  const newEntries = [];
  let currentDay = new Date(today);
  currentDay.setHours(0, 0, 0, 0);

  for (const task of missedTasks) {
    let taskRemaining = task.estimatedMinutes;
    task.status = "pending"; // reset status

    while (taskRemaining > 0) {
      const dayKey = currentDay.toDateString();
      const usedMinutes = dayMinutesMap[dayKey] || 0;
      const available = dailyMinutes - usedMinutes;

      if (available <= 0) {
        currentDay = new Date(currentDay);
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }

      const chunk = Math.min(taskRemaining, available);
      dayMinutesMap[dayKey] = (dayMinutesMap[dayKey] || 0) + chunk;

      const entryData = task.toObject ? task.toObject() : { ...task };
      delete entryData._id;

      newEntries.push({
        ...entryData,
        date: new Date(currentDay),
        estimatedMinutes: chunk,
        status: "pending",
      });

      taskRemaining -= chunk;
    }
  }

  return [...remaining, ...newEntries];
}

/**
 * Generate human-readable AI Insights from scored topics.
 * Returns an array of insight strings — no LLM needed.
 *
 * @param {Array} scoredTopics — from generateStudyPlan internals
 * @returns {string[]} insight lines
 */
export function generateInsights(subjects, dailyHours) {
  const insights = [];
  const today = new Date();

  for (const subject of subjects) {
    const daysLeft = Math.max(
      Math.ceil((new Date(subject.examDate) - today) / (1000 * 60 * 60 * 24)),
      0
    );

    const pending = subject.topics.filter((t) => !t.completed);
    if (pending.length === 0) continue;

    const avgConfidence =
      pending.reduce((s, t) => s + t.confidenceScore, 0) / pending.length;
    const totalMinutes = pending.reduce((s, t) => s + t.estimatedMinutes, 0);
    const daysNeeded = Math.ceil(totalMinutes / (dailyHours * 60));

    const urgencyLabel =
      daysLeft <= 3 ? "🔴 Critical" : daysLeft <= 7 ? "🟡 Urgent" : "🟢 On track";

    insights.push(
      `${urgencyLabel} — ${subject.name}: exam in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}, ` +
        `avg confidence ${avgConfidence.toFixed(1)}/5, ` +
        `${pending.length} topic${pending.length !== 1 ? "s" : ""} remaining (~${daysNeeded} study day${daysNeeded !== 1 ? "s" : ""} needed).`
    );

    // Highlight the weakest topic
    const weakest = pending.sort((a, b) => a.confidenceScore - b.confidenceScore)[0];
    if (weakest && weakest.confidenceScore <= 2) {
      insights.push(
        `  ↳ Focus first on "${weakest.title}" — confidence ${weakest.confidenceScore}/5 means it's your biggest risk for ${subject.name}.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push("✅ All topics completed — nothing left to plan!");
  }

  return insights;
}

