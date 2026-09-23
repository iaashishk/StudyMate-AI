import { Subject } from "../models/subject.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

// ── GET /api/subjects ─────────────────────────────────────────────────────────
export const getSubjects = asyncHandler(async (req, res) => {
  const { semesterOrTrack, category } = req.query;
  const filter = { userId: req.user._id };

  if (semesterOrTrack) filter.semesterOrTrack = semesterOrTrack;
  if (category) filter.category = category;

  const subjects = await Subject.find(filter).sort({ examDate: 1 });
  return res.status(200).json(new ApiResponse(200, { subjects }, "Subjects fetched"));
});

// ── POST /api/subjects ────────────────────────────────────────────────────────
export const createSubject = asyncHandler(async (req, res) => {
  const { name, examDate, colorTag, topics, semesterOrTrack, category, resources } = req.body;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);

  if (exam < today) {
    throw new ApiError(400, "Exam or target date cannot be in the past");
  }

  const subject = await Subject.create({
    userId: req.user._id,
    name,
    examDate,
    semesterOrTrack: semesterOrTrack || "Core Curriculum",
    category: category || "exam",
    colorTag: colorTag || "#6366F1",
    topics: topics || [],
    resources: resources || [],
    notes: [],
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
  const { name, examDate, colorTag, semesterOrTrack, category } = req.body;

  if (examDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(examDate);
    exam.setHours(0, 0, 0, 0);

    if (exam < today) {
      throw new ApiError(400, "Exam or target date cannot be in the past");
    }
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (examDate !== undefined) updates.examDate = examDate;
  if (colorTag !== undefined) updates.colorTag = colorTag;
  if (semesterOrTrack !== undefined) updates.semesterOrTrack = semesterOrTrack;
  if (category !== undefined) updates.category = category;

  const subject = await Subject.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    updates,
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
  const { title, confidenceScore, estimatedMinutes, unitNumber, notes, resourceQuery } = req.body;

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.topics.push({
    title,
    confidenceScore: confidenceScore ?? 3,
    estimatedMinutes: estimatedMinutes ?? 30,
    unitNumber: unitNumber ?? 1,
    notes: notes || "",
    resourceQuery: resourceQuery || `${subject.name} ${title} tutorial`,
  });

  await subject.save();

  return res.status(201).json(new ApiResponse(201, { subject }, "Topic added"));
});

// ── PUT /api/subjects/:id/topics/:topicId ─────────────────────────────────────
export const updateTopic = asyncHandler(async (req, res) => {
  const { title, confidenceScore, estimatedMinutes, completed, unitNumber, notes, resourceQuery } = req.body;

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
  if (unitNumber !== undefined) topic.unitNumber = unitNumber;
  if (notes !== undefined) topic.notes = notes;
  if (resourceQuery !== undefined) topic.resourceQuery = resourceQuery;

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

// ── POST /api/subjects/:id/resources ──────────────────────────────────────────
export const addResource = asyncHandler(async (req, res) => {
  const { title, type, url } = req.body;

  if (!title || !url) {
    throw new ApiError(400, "Title and URL are required");
  }

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.resources.push({
    title,
    type: type || "drive",
    url,
  });

  await subject.save();

  return res.status(201).json(new ApiResponse(201, { subject }, "Resource added"));
});

// ── DELETE /api/subjects/:id/resources/:resourceId ────────────────────────────
export const deleteResource = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.resources.pull({ _id: req.params.resourceId });
  await subject.save();

  return res.status(200).json(new ApiResponse(200, { subject }, "Resource deleted"));
});

// ── POST /api/subjects/:id/notes ──────────────────────────────────────────────
export const addNote = asyncHandler(async (req, res) => {
  const { title, content, linkUrl } = req.body;

  if (!title) {
    throw new ApiError(400, "Note title is required");
  }

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.notes.push({
    title,
    content: content || "",
    linkUrl: linkUrl || "",
  });

  await subject.save();

  return res.status(201).json(new ApiResponse(201, { subject }, "Note added"));
});

// ── PUT /api/subjects/:id/notes/:noteId ───────────────────────────────────────
export const updateNote = asyncHandler(async (req, res) => {
  const { title, content, linkUrl } = req.body;

  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  const note = subject.notes.id(req.params.noteId);
  if (!note) throw new ApiError(404, "Note not found");

  if (title !== undefined) note.title = title;
  if (content !== undefined) note.content = content;
  if (linkUrl !== undefined) note.linkUrl = linkUrl;

  await subject.save();

  return res.status(200).json(new ApiResponse(200, { subject }, "Note updated"));
});

// ── DELETE /api/subjects/:id/notes/:noteId ────────────────────────────────────
export const deleteNote = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!subject) throw new ApiError(404, "Subject not found");

  subject.notes.pull({ _id: req.params.noteId });
  await subject.save();

  return res.status(200).json(new ApiResponse(200, { subject }, "Note deleted"));
});

// ── GET /api/subjects/notes/all (Centralized Cloud Notes across all subjects) ──
export const getAllNotes = asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ userId: req.user._id }).select("name colorTag semesterOrTrack notes");

  const allNotes = [];
  for (const s of subjects) {
    for (const n of s.notes) {
      allNotes.push({
        _id: n._id,
        subjectId: s._id,
        subjectName: s.name,
        subjectColor: s.colorTag,
        semesterOrTrack: s.semesterOrTrack,
        title: n.title,
        content: n.content,
        linkUrl: n.linkUrl,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      });
    }
  }

  // Sort most recently updated first
  allNotes.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  return res.status(200).json(new ApiResponse(200, { notes: allNotes }, "All notes fetched"));
});
