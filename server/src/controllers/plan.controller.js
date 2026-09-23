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

  // Run the scoring engine
  const planEntries = generateStudyPlan(subjects, new Date(), dailyHours);

  // Replace any existing plan for this user
  await StudyPlan.findOneAndDelete({ userId: req.user._id });

  const plan = await StudyPlan.create({
    userId: req.user._id,
    dailyHoursAvailable: dailyHours,
    planEntries,
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
    .json(new ApiResponse(200, { plan }, "Full plan fetched"));
});

