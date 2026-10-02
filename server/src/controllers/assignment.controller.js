import { Assignment } from "../models/assignment.model.js";
import { Subject } from "../models/subject.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { solveAssignmentQuestion } from "../services/academic-ai.service.js";

// ── GET /api/assignments ─────────────────────────────────────────────────────
export const getAssignments = asyncHandler(async (req, res) => {
  const { subjectId } = req.query;
  const filter = { userId: req.user._id };
  if (subjectId) filter.subjectId = subjectId;

  const assignments = await Assignment.find(filter).sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, { assignments }, "Assignments fetched successfully")
  );
});

// ── GET /api/assignments/:id ─────────────────────────────────────────────────
export const getAssignmentById = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  return res.status(200).json(
    new ApiResponse(200, { assignment }, "Assignment details fetched")
  );
});

// ── POST /api/assignments ────────────────────────────────────────────────────
export const createAssignment = asyncHandler(async (req, res) => {
  const { subjectId, title, unitNumber, dueDate, questions, rawDocText } = req.body;

  if (!subjectId || !title?.trim()) {
    throw new ApiError(400, "Subject and assignment title are required");
  }

  const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
  if (!subject) throw new ApiError(404, "Subject not found");

  const formattedQuestions = (questions || []).map((q, idx) => ({
    questionNumber: q.questionNumber || idx + 1,
    question: q.question.trim(),
    answer: q.answer || "",
    marks: q.marks || 5,
    notes: q.notes || "",
  }));

  const assignment = await Assignment.create({
    userId: req.user._id,
    subjectId: subject._id,
    subjectName: subject.name,
    title: title.trim(),
    unitNumber: Number(unitNumber) || 1,
    dueDate: dueDate || null,
    questions: formattedQuestions,
    rawDocText: rawDocText || "",
  });

  return res.status(201).json(
    new ApiResponse(201, { assignment }, "Assignment created successfully")
  );
});

// ── PATCH /api/assignments/:id ───────────────────────────────────────────────
export const updateAssignment = asyncHandler(async (req, res) => {
  const { title, unitNumber, dueDate, status, questions } = req.body;

  const assignment = await Assignment.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  if (title) assignment.title = title.trim();
  if (unitNumber !== undefined) assignment.unitNumber = Number(unitNumber);
  if (dueDate !== undefined) assignment.dueDate = dueDate;
  if (status) assignment.status = status;
  if (questions) assignment.questions = questions;

  await assignment.save();

  return res.status(200).json(
    new ApiResponse(200, { assignment }, "Assignment updated successfully")
  );
});

// ── DELETE /api/assignments/:id ──────────────────────────────────────────────
export const deleteAssignment = asyncHandler(async (req, res) => {
  const result = await Assignment.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (result.deletedCount === 0) throw new ApiError(404, "Assignment not found");

  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Assignment deleted successfully")
  );
});

// ── POST /api/assignments/:id/questions ──────────────────────────────────────
export const addQuestionToAssignment = asyncHandler(async (req, res) => {
  const { question, marks, notes, autoSolve } = req.body;
  if (!question || !question.trim()) {
    throw new ApiError(400, "Question text is required");
  }

  const assignment = await Assignment.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  let answer = "";
  let aiGenerated = false;

  if (autoSolve) {
    answer = await solveAssignmentQuestion({
      subjectName: assignment.subjectName,
      question: question.trim(),
      marks: Number(marks) || 5,
    });
    aiGenerated = true;
  }

  const newQ = {
    questionNumber: assignment.questions.length + 1,
    question: question.trim(),
    answer,
    aiGenerated,
    marks: Number(marks) || 5,
    notes: notes || "",
  };

  assignment.questions.push(newQ);
  await assignment.save();

  return res.status(201).json(
    new ApiResponse(201, { assignment, addedQuestion: assignment.questions[assignment.questions.length - 1] }, "Question added")
  );
});

// ── PUT /api/assignments/:id/questions/:questionId ───────────────────────────
export const updateQuestion = asyncHandler(async (req, res) => {
  const { id, questionId } = req.params;
  const { question, answer, marks, notes } = req.body;

  const assignment = await Assignment.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  const q = assignment.questions.id(questionId);
  if (!q) throw new ApiError(404, "Question not found in assignment");

  if (question !== undefined) q.question = question.trim();
  if (answer !== undefined) q.answer = answer.trim();
  if (marks !== undefined) q.marks = Number(marks) || 5;
  if (notes !== undefined) q.notes = notes;

  await assignment.save();

  return res.status(200).json(
    new ApiResponse(200, { assignment, question: q }, "Question updated successfully")
  );
});

// ── POST /api/assignments/:id/questions/:questionId/solve ─────────────────────
export const solveQuestion = asyncHandler(async (req, res) => {
  const { id, questionId } = req.params;

  const assignment = await Assignment.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  const q = assignment.questions.id(questionId);
  if (!q) throw new ApiError(404, "Question not found in assignment");

  const answer = await solveAssignmentQuestion({
    subjectName: assignment.subjectName,
    question: q.question,
    marks: q.marks || 5,
  });

  q.answer = answer;
  q.aiGenerated = true;

  await assignment.save();

  return res.status(200).json(
    new ApiResponse(200, { assignment, question: q }, "Question solved with AI")
  );
});

// ── POST /api/assignments/:id/solve-all ───────────────────────────────────────
export const solveAllQuestions = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const assignment = await Assignment.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!assignment) throw new ApiError(404, "Assignment not found");

  for (const q of assignment.questions) {
    if (!q.answer || q.answer.trim().length === 0) {
      q.answer = await solveAssignmentQuestion({
        subjectName: assignment.subjectName,
        question: q.question,
        marks: q.marks || 5,
      });
      q.aiGenerated = true;
    }
  }

  await assignment.save();

  return res.status(200).json(
    new ApiResponse(200, { assignment }, "All assignment questions solved")
  );
});

// ── POST /api/assignments/generate-quick-answer ──────────────────────────────
export const generateQuickAnswer = asyncHandler(async (req, res) => {
  const { subjectName, question, marks } = req.body;
  if (!question || !question.trim()) {
    throw new ApiError(400, "Question is required");
  }

  const answer = await solveAssignmentQuestion({
    subjectName: subjectName || "General",
    question: question.trim(),
    marks: Number(marks) || 5,
  });

  return res.status(200).json(
    new ApiResponse(200, { answer }, "Academic answer generated successfully")
  );
});
