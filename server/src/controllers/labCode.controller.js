import { LabCode } from "../models/labCode.model.js";
import { Subject } from "../models/subject.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { deriveLabCodeSolution } from "../services/academic-ai.service.js";

// ── GET /api/labs ────────────────────────────────────────────────────────────
export const getLabCodes = asyncHandler(async (req, res) => {
  const { subjectId } = req.query;
  const filter = { userId: req.user._id };
  if (subjectId) filter.subjectId = subjectId;

  const labs = await LabCode.find(filter).sort({ experimentNumber: 1, createdAt: 1 });

  return res.status(200).json(
    new ApiResponse(200, { labs }, "Lab codes fetched successfully")
  );
});

// ── GET /api/labs/:id ────────────────────────────────────────────────────────
export const getLabCodeById = asyncHandler(async (req, res) => {
  const lab = await LabCode.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!lab) throw new ApiError(404, "Lab experiment not found");

  return res.status(200).json(
    new ApiResponse(200, { lab }, "Lab experiment fetched successfully")
  );
});

// ── POST /api/labs ───────────────────────────────────────────────────────────
export const createLabCode = asyncHandler(async (req, res) => {
  const {
    subjectId,
    experimentNumber,
    title,
    aim,
    language,
    teacherPrompt,
    code,
    algorithm,
    sampleInput,
    sampleOutput,
    complexity,
    vivaQuestions,
    rawDocText,
    autoDerive,
  } = req.body;

  if (!subjectId || !title?.trim()) {
    throw new ApiError(400, "Subject and experiment title are required");
  }

  const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
  if (!subject) throw new ApiError(404, "Subject not found");

  let derived = {
    aim: aim || "",
    algorithm: algorithm || "",
    code: code || "",
    sampleInput: sampleInput || "",
    sampleOutput: sampleOutput || "",
    complexity: complexity || { time: "", space: "" },
    vivaQuestions: vivaQuestions || [],
  };

  if (autoDerive) {
    const aiRes = await deriveLabCodeSolution({
      subjectName: subject.name,
      title: title.trim(),
      aim,
      language: language || "cpp",
      teacherPrompt,
    });
    derived = aiRes;
  }

  const lab = await LabCode.create({
    userId: req.user._id,
    subjectId: subject._id,
    subjectName: subject.name,
    experimentNumber: Number(experimentNumber) || 1,
    title: title.trim(),
    aim: derived.aim || aim || "",
    language: language || "cpp",
    teacherPrompt: teacherPrompt || "",
    code: derived.code || "",
    algorithm: derived.algorithm || "",
    sampleInput: derived.sampleInput || "",
    sampleOutput: derived.sampleOutput || "",
    complexity: derived.complexity || { time: "", space: "" },
    vivaQuestions: derived.vivaQuestions || [],
    rawDocText: rawDocText || "",
  });

  return res.status(201).json(
    new ApiResponse(201, { lab }, "Lab experiment created successfully")
  );
});

// ── PATCH /api/labs/:id ──────────────────────────────────────────────────────
export const updateLabCode = asyncHandler(async (req, res) => {
  const {
    experimentNumber,
    title,
    aim,
    language,
    teacherPrompt,
    code,
    algorithm,
    sampleInput,
    sampleOutput,
    complexity,
    vivaQuestions,
    status,
  } = req.body;

  const lab = await LabCode.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!lab) throw new ApiError(404, "Lab experiment not found");

  if (experimentNumber !== undefined) lab.experimentNumber = Number(experimentNumber);
  if (title) lab.title = title.trim();
  if (aim !== undefined) lab.aim = aim;
  if (language) lab.language = language;
  if (teacherPrompt !== undefined) lab.teacherPrompt = teacherPrompt;
  if (code !== undefined) lab.code = code;
  if (algorithm !== undefined) lab.algorithm = algorithm;
  if (sampleInput !== undefined) lab.sampleInput = sampleInput;
  if (sampleOutput !== undefined) lab.sampleOutput = sampleOutput;
  if (complexity !== undefined) lab.complexity = complexity;
  if (vivaQuestions !== undefined) lab.vivaQuestions = vivaQuestions;
  if (status) lab.status = status;

  await lab.save();

  return res.status(200).json(
    new ApiResponse(200, { lab }, "Lab experiment updated successfully")
  );
});

// ── DELETE /api/labs/:id ─────────────────────────────────────────────────────
export const deleteLabCode = asyncHandler(async (req, res) => {
  const result = await LabCode.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (result.deletedCount === 0) throw new ApiError(404, "Lab experiment not found");

  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Lab experiment deleted")
  );
});

// ── POST /api/labs/:id/derive-ai ─────────────────────────────────────────────
export const deriveLabCodeWithAI = asyncHandler(async (req, res) => {
  const lab = await LabCode.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!lab) throw new ApiError(404, "Lab experiment not found");

  const aiRes = await deriveLabCodeSolution({
    subjectName: lab.subjectName,
    title: lab.title,
    aim: lab.aim,
    language: lab.language,
    teacherPrompt: lab.teacherPrompt,
  });

  lab.aim = aiRes.aim || lab.aim;
  lab.algorithm = aiRes.algorithm || lab.algorithm;
  lab.code = aiRes.code || lab.code;
  lab.sampleInput = aiRes.sampleInput || lab.sampleInput;
  lab.sampleOutput = aiRes.sampleOutput || lab.sampleOutput;
  lab.complexity = aiRes.complexity || lab.complexity;
  lab.vivaQuestions = aiRes.vivaQuestions || lab.vivaQuestions;
  lab.status = "verified";

  await lab.save();

  return res.status(200).json(
    new ApiResponse(200, { lab }, "Code solution and viva derived with AI")
  );
});

// ── POST /api/labs/derive-quick ──────────────────────────────────────────────
export const deriveQuickLabCode = asyncHandler(async (req, res) => {
  const { subjectName, title, aim, language, teacherPrompt } = req.body;

  if (!title || !title.trim()) {
    throw new ApiError(400, "Experiment title or topic is required");
  }

  const aiRes = await deriveLabCodeSolution({
    subjectName: subjectName || "Computer Science Lab",
    title: title.trim(),
    aim: aim || "",
    language: language || "cpp",
    teacherPrompt: teacherPrompt || "",
  });

  return res.status(200).json(
    new ApiResponse(200, { solution: aiRes }, "Quick lab code solution derived")
  );
});
