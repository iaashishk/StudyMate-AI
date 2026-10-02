import { Subject } from "../models/subject.model.js";
import { StudyPlan } from "../models/studyPlan.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  generateStudyPlan,
  rescheduleMissedEntries,
  generateInsights,
} from "../services/study-planner.js";

// ── POST /api/plan/generate ───────────────────────────────────────────────────
export const generatePlan = asyncHandler(async (req, res) => {
  const { dailyHoursAvailable } = req.body;
  const dailyHours = dailyHoursAvailable || req.user.dailyStudyHours || 2;

  // Fetch all subjects with pending topics
  const subjects = await Subject.find({ userId: req.user._id });

  if (subjects.length === 0) {
    throw new ApiError(400, "Add at least one subject before generating a plan");
  }

  const hasPendingTopics = subjects.some((s) =>
    s.topics.some((t) => !t.completed)
  );
  if (!hasPendingTopics) {
    throw new ApiError(400, "All topics are already completed — nothing to plan!");
  }

  // Preserve all past recorded entries and all completed entries (including today's done tasks)
  // so a change in daily study hours or plan regeneration never resets progress to zero!
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingPlan = await StudyPlan.findOne({ userId: req.user._id });
  const pastEntries = existingPlan
    ? existingPlan.planEntries.filter(
        (e) => new Date(e.date) < today || e.status === "done"
      )
    : [];

  // Identify topic IDs that are already completed
  const completedTopicIds = new Set(
    pastEntries.filter((e) => e.status === "done").map((e) => String(e.topicId))
  );

  // Queue only remaining uncompleted topics for the new schedule
  const uncompletedSubjects = subjects
    .map((subj) => {
      const s = subj.toObject ? subj.toObject() : { ...subj };
      s.topics = (s.topics || []).filter(
        (t) => !t.completed && !completedTopicIds.has(String(t._id))
      );
      return s;
    })
    .filter((s) => s.topics.length > 0);

  const planEntries =
    uncompletedSubjects.length > 0
      ? generateStudyPlan(uncompletedSubjects, new Date(), dailyHours)
      : [];

  // Replace existing plan for this user
  await StudyPlan.findOneAndDelete({ userId: req.user._id });

  const plan = await StudyPlan.create({
    userId: req.user._id,
    dailyHoursAvailable: dailyHours,
    planEntries: [...pastEntries, ...planEntries],
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { plan }, "Study plan generated successfully"));
});

// ── GET /api/plan/today ───────────────────────────────────────────────────────
export const getTodaysPlan = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });

  if (!plan) {
    return res
      .status(200)
      .json(new ApiResponse(200, { entries: [] }, "No plan generated yet"));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayEntries = plan.planEntries.filter((e) => {
    const entryDate = new Date(e.date);
    return entryDate >= today && entryDate < tomorrow;
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { entries: todayEntries }, "Today's plan fetched"));
});

// ── GET /api/plan/week ────────────────────────────────────────────────────────
export const getWeekPlan = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });

  if (!plan) {
    return res
      .status(200)
      .json(new ApiResponse(200, { entries: [] }, "No plan generated yet"));
  }

  // Default: next 7 days from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const weekEntries = plan.planEntries.filter((e) => {
    const d = new Date(e.date);
    return d >= today && d < endOfWeek;
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { entries: weekEntries }, "Week plan fetched"));
});

// ── PATCH /api/plan/entries/:entryId ──────────────────────────────────────────
export const updateEntry = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["pending", "done", "missed"].includes(status)) {
    throw new ApiError(400, "Status must be one of: pending, done, missed");
  }

  const plan = await StudyPlan.findOne({ userId: req.user._id });
  if (!plan) throw new ApiError(404, "No study plan found");

  const entry = plan.planEntries.id(req.params.entryId);
  if (!entry) throw new ApiError(404, "Plan entry not found");

  entry.status = status;

  // Sync topic completion with Subject model
  if (status === "done" && entry.subjectId && entry.topicId) {
    await Subject.updateOne(
      { _id: entry.subjectId, "topics._id": entry.topicId },
      { $set: { "topics.$.completed": true } }
    );
  } else if (status === "pending" && entry.subjectId && entry.topicId) {
    await Subject.updateOne(
      { _id: entry.subjectId, "topics._id": entry.topicId },
      { $set: { "topics.$.completed": false } }
    );
  }

  // If marking as missed → reschedule it automatically
  if (status === "missed") {
    const updated = rescheduleMissedEntries(
      plan.planEntries,
      [req.params.entryId],
      new Date(),
      plan.dailyHoursAvailable
    );
    plan.planEntries = updated;
  }

  await plan.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { plan }, "Entry updated"));
});

// ── GET /api/plan/insights ────────────────────────────────────────────────────
export const getInsights = asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ userId: req.user._id });
  const dailyHours = req.user.dailyStudyHours || 2;

  const insights = generateInsights(subjects, dailyHours);

  return res
    .status(200)
    .json(new ApiResponse(200, { insights }, "Insights generated"));
});

// ── GET /api/plan/all ─────────────────────────────────────────────────────────
export const getFullPlan = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });

  if (!plan) {
    return res
      .status(200)
      .json(new ApiResponse(200, { entries: [] }, "No plan generated yet"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { plan, entries: plan.planEntries }, "Full plan fetched"));
});

// ── DELETE /api/plan/entries/:entryId ─────────────────────────────────────────
export const deleteEntry = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });
  if (!plan) throw new ApiError(404, "No study plan found");

  const entry = plan.planEntries.id(req.params.entryId);
  if (!entry) throw new ApiError(404, "Plan entry not found");

  plan.planEntries.pull({ _id: req.params.entryId });
  await plan.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { plan, entries: plan.planEntries }, "Plan entry removed successfully"));
});

// ── DELETE /api/plan/clear ────────────────────────────────────────────────────
export const clearPlan = asyncHandler(async (req, res) => {
  await StudyPlan.findOneAndDelete({ userId: req.user._id });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Study plan cleared and database space freed"));
});

// ── POST /api/plan/pull-next ──────────────────────────────────────────────────
export const pullNextEntryToToday = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });
  if (!plan) throw new ApiError(404, "No study plan found. Generate a plan first!");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find future pending topics scheduled for tomorrow or later
  const futureEntries = plan.planEntries
    .filter((e) => {
      const d = new Date(e.date);
      return d >= tomorrow && e.status === "pending";
    })
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        (a.orderIndex || 0) - (b.orderIndex || 0)
    );

  if (futureEntries.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { pulledEntry: null, plan },
        "All future topics in your curriculum are already completed or scheduled for today!"
      )
    );
  }

  // Pull the next topic forward into today's agenda
  const nextEntry = futureEntries[0];
  const entryDoc = plan.planEntries.id(nextEntry._id);

  if (entryDoc) {
    entryDoc.date = new Date(); // Move to today
    entryDoc.xpReward = (entryDoc.xpReward || 50) + 25; // Bonus XP for proactive study ahead!
    entryDoc.whyLogic = `🚀 Early Study Accelerator: Pulled forward ahead of schedule with +25 Bonus XP because you conquered today's agenda early.`;
  }

  await plan.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { pulledEntry: entryDoc, plan },
      `Pulled "${entryDoc.topicTitle}" into today's agenda with +25 Bonus XP!`
    )
  );
});

// ── POST /api/plan/shift-today-to-tomorrow ───────────────────────────────────
export const shiftTodayAgendaToTomorrow = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });
  if (!plan) throw new ApiError(404, "No study plan found. Generate a plan first!");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find all pending entries for today or in the future
  const pendingEntriesFromToday = plan.planEntries.filter((e) => {
    const d = new Date(e.date);
    return d >= today && e.status === "pending";
  });

  if (pendingEntriesFromToday.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { shiftedCount: 0, plan }, "No pending study tasks to shift for today.")
    );
  }

  // Shift all pending tasks scheduled for today and later forward by +1 day (24 hours)
  pendingEntriesFromToday.forEach((entry) => {
    const curDate = new Date(entry.date);
    curDate.setDate(curDate.getDate() + 1);
    entry.date = curDate;
  });

  await plan.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { shiftedCount: pendingEntriesFromToday.length, plan },
      `Enjoy your off-day! Today's study agenda (${pendingEntriesFromToday.length} tasks) has been safely shifted to tomorrow.`
    )
  );
});

// ── POST /api/plan/switch-to-revision-mode ───────────────────────────────────
export const switchToRevisionMode = asyncHandler(async (req, res) => {
  const plan = await StudyPlan.findOne({ userId: req.user._id });
  if (!plan) throw new ApiError(404, "No study plan found. Generate a plan first!");

  const subjects = await Subject.find({ userId: req.user._id });
  if (subjects.length === 0) throw new ApiError(400, "No subjects found");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find today's entries
  const todayEntries = plan.planEntries.filter((e) => {
    const d = new Date(e.date);
    return d >= today && d < tomorrow;
  });

  // Check if today is already in revision mode
  const isAlreadyRevision = todayEntries.some(
    (e) => (e.topicTitle && e.topicTitle.startsWith("Revision:")) || e.sessionType === "revision"
  );

  if (isAlreadyRevision) {
    // Keep past entries and any completed tasks
    const pastEntries = plan.planEntries.filter(
      (e) => new Date(e.date) < today || e.status === "done"
    );
    const completedTopicIds = new Set(
      pastEntries.filter((e) => e.status === "done").map((e) => String(e.topicId))
    );
    const uncompletedSubjects = subjects
      .map((subj) => {
        const s = subj.toObject ? subj.toObject() : { ...subj };
        s.topics = (s.topics || []).filter(
          (t) => !t.completed && !completedTopicIds.has(String(t._id))
        );
        return s;
      })
      .filter((s) => s.topics.length > 0);

    const planEntries =
      uncompletedSubjects.length > 0
        ? generateStudyPlan(uncompletedSubjects, new Date(), dailyHours)
        : [];

    plan.planEntries = [...pastEntries, ...planEntries];
    await plan.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        { mode: "study", plan },
        "Switched back to standard new topic curriculum study plan!"
      )
    );
  }

  // Gather priority topics for revision: completed topics or topics with confidence <= 3
  const candidateTopics = [];
  subjects.forEach((subj) => {
    subj.topics.forEach((top) => {
      // Priority score for revision: lower confidence = higher urgency
      const revScore = (6 - (top.confidenceScore || 3)) * (top.completed ? 1.5 : 1.0);
      candidateTopics.push({
        subjectId: subj._id,
        subjectName: subj.name,
        colorTag: subj.colorTag || "#0A84FF",
        topicId: top._id,
        topicTitle: top.title,
        confidenceScore: top.confidenceScore || 3,
        estimatedMinutes: Math.min(top.estimatedMinutes || 30, 25), // quick review blocks
        revScore,
      });
    });
  });

  candidateTopics.sort((a, b) => b.revScore - a.revScore);

  if (candidateTopics.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { mode: "study", plan }, "No topics available for revision yet.")
    );
  }

  // Select top 2-3 topics for today's revision focus
  const countToRevise = Math.max(2, Math.min(todayEntries.length || 3, 4));
  const selectedForRevision = candidateTopics.slice(0, countToRevise);

  // Replace today's pending entries with targeted revision sessions
  // Remove existing pending entries on today
  const nonTodayEntries = plan.planEntries.filter((e) => {
    const d = new Date(e.date);
    return !(d >= today && d < tomorrow && e.status === "pending");
  });

  const revisionEntries = selectedForRevision.map((cand, idx) => ({
    subjectId: cand.subjectId,
    subjectName: cand.subjectName,
    subjectColor: cand.colorTag,
    topicId: cand.topicId,
    topicTitle: `Revision: ${cand.topicTitle}`,
    estimatedMinutes: cand.estimatedMinutes,
    date: new Date(),
    orderIndex: idx,
    status: "pending",
    sessionType: "revision",
    priorityScore: cand.revScore * 10,
    whyLogic: `🧠 Targeted Recall Revision: Reinforcing ${cand.subjectName} concepts (Confidence: ${cand.confidenceScore}/5) to solidify mastery.`,
    xpReward: 60,
  }));

  plan.planEntries = [...nonTodayEntries, ...revisionEntries];
  await plan.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { mode: "revision", count: revisionEntries.length, plan },
      `Switched today's agenda to Revision Mode! Focusing on ${revisionEntries.length} high-yield topics.`
    )
  );
});

