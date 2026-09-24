/**
 * StudyMate AI — Pedagogical Brain & Scheduling Engine
 * ──────────────────────────────────────────────────
 * Generates a day-by-day, step-by-step study roadmap using pedagogical logic,
 * prerequisite progression, and cognitive load theory.
 *
 * Pedagogical Ordering Logic:
 * 1. Urgency: Subjects with closer exam targets get primary daily focus.
 * 2. Prerequisite Sequence (Unit Progression): Unit 1 (Foundations) → Unit 2 → Unit 3 → Unit 4.
 * 3. Cognitive Phase within Units:
 *    - Phase 1 (Foundations & Primers): Intro, Architecture, Models, Basics
 *    - Phase 2 (Core Concepts & Mechanics): Core algorithms, tables, queries
 *    - Phase 3 (Advanced Synthesis & Recovery): Optimization, Concurrency, Distributed systems
 * 4. Deliberate Practice: Inside each phase, lower-confidence topics (1–2) are tackled first
 *    with extra dedicated time to close knowledge gaps before the exam.
 * 5. Transparent Reasoning: Every plan entry includes `whyLogic` explaining why to study it now.
 */

function classifyTopic(title) {
  const lower = title.toLowerCase();
  // Phase 1: Foundation / Primer
  if (
    lower.includes("introduction") ||
    lower.includes("overview") ||
    lower.includes("basics") ||
    lower.includes("fundamentals") ||
    lower.includes("concept") ||
    lower.includes("architecture") ||
    lower.includes("model") ||
    lower.includes("structure") ||
    lower.includes("representation") ||
    lower.includes("adt")
  ) {
    return { phase: 1, label: "Foundations" };
  }

  // Phase 3: Advanced / Synthesis
  if (
    lower.includes("optimization") ||
    lower.includes("recovery") ||
    lower.includes("deadlock") ||
    lower.includes("concurrency") ||
    lower.includes("distributed") ||
    lower.includes("advanced") ||
    lower.includes("decomposition") ||
    lower.includes("synthesis") ||
    lower.includes("security") ||
    lower.includes("protocol")
  ) {
    return { phase: 3, label: "Advanced Mastery" };
  }

  // Phase 2: Core Concepts
  return { phase: 2, label: "Core Concept" };
}

function generateWhyLogic(title, unitNumber, unitTitle, phase, confidence) {
  const cleanUnit = unitTitle || `Unit ${unitNumber}`;

  if (phase === 1) {
    return `Foundational anchor for ${cleanUnit} — builds baseline understanding required before advancing to core mechanics.`;
  }
  if (confidence <= 2) {
    return `High-yield focus area: User rated weak confidence (${confidence}/5) — allocated early within ${cleanUnit} for deliberate practice.`;
  }
  if (phase === 3) {
    return `Advanced module synthesis — applies foundational principles from earlier units to tackle complex exam numericals & system design.`;
  }
  return `Core curriculum milestone — advances ${cleanUnit} mastery and prepares for unit checkpoint review.`;
}

/**
 * @param {Array} subjects  — populated Subject documents (with .topics[])
 * @param {Date}  startDate — first day of the plan (usually today)
 * @param {number} dailyHours — hours available per day
 * @returns {Array} planEntries — sorted array of PlanEntry objects
 */
export function generateStudyPlan(subjects, startDate, dailyHours) {
  const dailyMinutes = dailyHours * 60;

  // ── 1. Sort subjects by Exam Urgency (nearest exam first) ─────────────────
  const sortedSubjects = [...subjects].sort((a, b) => {
    const aDate = new Date(a.examDate).getTime();
    const bDate = new Date(b.examDate).getTime();
    return aDate - bDate;
  });

  // ── 2. Collect and pedagogically sequence all topics ──────────────────────
  const sequencedTopics = [];

  for (const subject of sortedSubjects) {
    const examDate = new Date(subject.examDate);
    const now = new Date(startDate);
    const daysUntilExam = Math.max(
      Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)),
      1
    );
    const urgency = 1 / daysUntilExam;

    const pendingTopics = subject.topics.filter((t) => !t.completed);
    const totalSubjectMinutes = pendingTopics.reduce(
      (sum, t) => sum + (t.estimatedMinutes || 30),
      0
    );

    // Group pending topics by Unit Number
    const unitMap = new Map();
    for (const t of pendingTopics) {
      const uNum = t.unitNumber || 1;
      if (!unitMap.has(uNum)) unitMap.set(uNum, []);
      unitMap.get(uNum).push(t);
    }

    // Sort unit numbers in ascending order: Unit 1 → Unit 2 → Unit 3 → Unit 4
    const sortedUnitNums = Array.from(unitMap.keys()).sort((a, b) => a - b);

    for (const uNum of sortedUnitNums) {
      const unitTopics = unitMap.get(uNum);

      // Within this unit, sort by:
      // 1. Cognitive Phase (1: Foundations → 2: Core → 3: Advanced)
      // 2. Confidence Score (1, 2 first so weaker topics are practiced early)
      unitTopics.sort((a, b) => {
        const classA = classifyTopic(a.title);
        const classB = classifyTopic(b.title);
        if (classA.phase !== classB.phase) {
          return classA.phase - classB.phase;
        }
        return (a.confidenceScore || 3) - (b.confidenceScore || 3);
      });

      for (const topic of unitTopics) {
        const topicMinutes = topic.estimatedMinutes || 30;
        const topicWeight = totalSubjectMinutes > 0 ? topicMinutes / totalSubjectMinutes : 1;
        const score = urgency * (6 - (topic.confidenceScore || 3)) * topicWeight;
        const { phase } = classifyTopic(topic.title);
        const why = generateWhyLogic(
          topic.title,
          uNum,
          topic.unitTitle,
          phase,
          topic.confidenceScore || 3
        );

        sequencedTopics.push({
          subjectId: subject._id,
          subjectName: subject.name,
          subjectColor: subject.colorTag || "#0A84FF",
          topicId: topic._id,
          topicTitle: topic.title,
          unitNumber: uNum,
          unitTitle: topic.unitTitle || `Unit ${uNum}`,
          estimatedMinutes: topicMinutes,
          priorityScore: parseFloat(score.toFixed(4)),
          daysUntilExam,
          confidence: topic.confidenceScore || 3,
          whyLogic: why,
          xpReward: (topic.confidenceScore || 3) <= 2 ? 75 : 50, // Higher XP reward for conquering weak topics!
        });
      }
    }
  }

  // ── 3. Greedily assign sequenced topics to calendar days ──────────────────
  const planEntries = [];
  let currentDay = new Date(startDate);
  currentDay.setHours(0, 0, 0, 0);
  let minutesUsedToday = 0;
  let orderIndex = 1;

  for (const topic of sequencedTopics) {
    let remaining = topic.estimatedMinutes;

    while (remaining > 0) {
      const availableToday = dailyMinutes - minutesUsedToday;

      if (availableToday <= 0) {
        // Advance to next day
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
        unitNumber: topic.unitNumber,
        unitTitle: topic.unitTitle,
        estimatedMinutes: chunk,
        status: "pending",
        priorityScore: topic.priorityScore,
        whyLogic: topic.whyLogic,
        orderIndex: orderIndex++,
        xpReward: topic.xpReward,
      });

      minutesUsedToday += chunk;
      remaining -= chunk;
    }
  }

  return planEntries;
}

/**
 * Reschedule missed entries starting from today.
 */
export function rescheduleMissedEntries(existingEntries, missedEntryIds, today, dailyHours) {
  const dailyMinutes = dailyHours * 60;
  const missedSet = new Set(missedEntryIds.map(String));

  const updatedExisting = existingEntries.map((e) => {
    if (missedSet.has(String(e._id))) {
      const obj = typeof e.toObject === "function" ? e.toObject() : { ...e };
      obj.status = "missed";
      return obj;
    }
    return e;
  });

  const missedTasks = existingEntries.filter((e) => missedSet.has(String(e._id)));
  if (missedTasks.length === 0) return updatedExisting;

  let currentDay = new Date(today);
  currentDay.setHours(0, 0, 0, 0);
  // Reschedule missed tasks starting from tomorrow so Today's agenda is not duplicated
  currentDay.setDate(currentDay.getDate() + 1);

  const existingTomorrowMinutes = existingEntries
    .filter((e) => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === currentDay.getTime() && e.status === "pending";
    })
    .reduce((sum, e) => sum + (e.estimatedMinutes || 30), 0);

  let minutesUsedToday = existingTomorrowMinutes;
  const rescheduledEntries = [];

  for (const task of missedTasks) {
    let remaining = task.estimatedMinutes || 30;

    while (remaining > 0) {
      const availableToday = dailyMinutes - minutesUsedToday;

      if (availableToday <= 0) {
        currentDay = new Date(currentDay);
        currentDay.setDate(currentDay.getDate() + 1);
        minutesUsedToday = 0;
        continue;
      }

      const chunk = Math.min(remaining, availableToday);

      rescheduledEntries.push({
        date: new Date(currentDay),
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        subjectColor: task.subjectColor,
        topicId: task.topicId,
        topicTitle: task.topicTitle,
        unitNumber: task.unitNumber || 1,
        unitTitle: task.unitTitle || "",
        estimatedMinutes: chunk,
        status: "pending",
        priorityScore: (task.priorityScore || 1) * 1.2, // bump priority for missed tasks
        whyLogic: task.whyLogic || "Rescheduled from earlier missed session.",
        orderIndex: task.orderIndex || 1,
        xpReward: task.xpReward || 50,
      });

      minutesUsedToday += chunk;
      remaining -= chunk;
    }
  }

  return [...updatedExisting, ...rescheduledEntries];
}

/**
 * Generate cognitive study insights and analytics
 */
export function generateInsights(subjects, planEntries, user) {
  const totalTasks = planEntries.length;
  const completedTasks = planEntries.filter((e) => e.status === "done").length;
  const missedTasks = planEntries.filter((e) => e.status === "missed").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const subjectUrgency = subjects.map((s) => {
    const diff = new Date(s.examDate).getTime() - Date.now();
    const days = Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
    const incomplete = s.topics.filter((t) => !t.completed).length;
    return {
      name: s.name,
      daysLeft: days,
      incompleteTopics: incomplete,
      urgencyLabel: days <= 7 ? "Critical" : days <= 14 ? "High" : "Moderate",
    };
  });

  return {
    completionRate,
    totalTasks,
    completedTasks,
    missedTasks,
    subjectUrgency,
    dailyHours: user.dailyStudyHours,
  };
}
