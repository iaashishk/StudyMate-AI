import { Subject } from "../models/subject.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

// ── GET /api/subjects ─────────────────────────────────────────────────────────
export const getSubjects = asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ userId: req.user._id }).sort({ examDate: 1 });
  return res.status(200).json(new ApiResponse(200, { subjects }, "Subjects fetched"));
});

// ── POST /api/subjects ────────────────────────────────────────────────────────
export const createSubject = asyncHandler(async (req, res) => {
  const { name, examDate, colorTag, topics } = req.body;

  if (new Date(examDate) <= new Date()) {
    throw new ApiError(400, "Exam date must be in the future");
  }

  const subject = await Subject.create({
    userId: req.user._id,
    name,
    examDate,
    colorTag: colorTag || "#5C8368",
    topics: topics || [],
  });

  return res.status(201).json(new ApiResponse(201, { subject }, "Subject created"));
});

// ── GET /api/subjects/:id ─────────────────────────────────────────────────────
export const getSubjectById = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!subject) throw new ApiError(404, "Subject not found");

  return res.status(200).json(new ApiResponse(200, { subject }, "Subject fetched"));
});

// ── PUT /api/subjects/:id ─────────────────────────────────────────────────────
export const updateSubject = asyncHandler(async (req, res) => {
  const { name, examDate, colorTag } = req.body;

  if (examDate && new Date(examDate) <= new Date()) {
    throw new ApiError(400, "Exam date must be in the future");
  }

  const subject = await Subject.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { name, examDate, colorTag },
    { new: true, runValidators: true }
  );

  if (!subject) throw new ApiError(404, "Subject not found");

  return res.status(200).json(new ApiResponse(200, { subject }, "Subject updated"));
});

// ── DELETE /api/subjects/:id ──────────────────────────────────────────────────
export const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!subject) throw new ApiError(404, "Subject not found");

  return res.status(200).json(new ApiResponse(200, {}, "Subject deleted"));
});

// ── POST /api/subjects/:id/topics ─────────────────────────────────────────────
export const addTopic = asyncHandler(async (req, res) => {
  const { title, confidenceScore, estimatedMinutes } = req.body;

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.topics.push({ title, confidenceScore, estimatedMinutes });
  await subject.save();

  return res.status(201).json(new ApiResponse(201, { subject }, "Topic added"));
});

// ── PUT /api/subjects/:id/topics/:topicId ─────────────────────────────────────
export const updateTopic = asyncHandler(async (req, res) => {
  const { title, confidenceScore, estimatedMinutes, completed } = req.body;

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  const topic = subject.topics.id(req.params.topicId);
  if (!topic) throw new ApiError(404, "Topic not found");

  if (title !== undefined) topic.title = title;
  if (confidenceScore !== undefined) topic.confidenceScore = confidenceScore;
  if (estimatedMinutes !== undefined) topic.estimatedMinutes = estimatedMinutes;
  if (completed !== undefined) topic.completed = completed;

  await subject.save();

  return res.status(200).json(new ApiResponse(200, { subject }, "Topic updated"));
});

// ── DELETE /api/subjects/:id/topics/:topicId ──────────────────────────────────
export const deleteTopic = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.topics.pull({ _id: req.params.topicId });
  await subject.save();

  return res.status(200).json(new ApiResponse(200, { subject }, "Topic deleted"));
});

