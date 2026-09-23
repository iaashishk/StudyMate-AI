import { Router } from "express";
import { body } from "express-validator";
import {
  getSubjects,
  createSubject,
  getSubjectById,
  updateSubject,
  deleteSubject,
  addTopic,
  updateTopic,
  deleteTopic,
  addResource,
  deleteResource,
  addNote,
  updateNote,
  deleteNote,
  getAllNotes,
} from "../controllers/subject.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";

const router = Router();

// All subject routes require auth
router.use(verifyJWT);

// Centralized notes endpoint (must be before /:id)
router.get("/notes/all", getAllNotes);

router.get("/", getSubjects);

router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Subject name is required"),
    body("examDate").isISO8601().withMessage("Valid exam/target date is required"),
  ],
  validate,
  createSubject
);

router.get("/:id", getSubjectById);

router.put(
  "/:id",
  [
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("examDate").optional().isISO8601().withMessage("Valid exam date required"),
  ],
  validate,
  updateSubject
);

router.delete("/:id", deleteSubject);

// Topic sub-routes
router.post(
  "/:id/topics",
  [
    body("title").trim().notEmpty().withMessage("Topic title is required"),
    body("confidenceScore")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Confidence score must be 1–5"),
    body("estimatedMinutes")
      .optional()
      .isInt({ min: 5 })
      .withMessage("Estimated minutes must be at least 5"),
  ],
  validate,
  addTopic
);

router.put(
  "/:id/topics/:topicId",
  [
    body("confidenceScore")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Confidence score must be 1–5"),
    body("estimatedMinutes")
      .optional()
      .isInt({ min: 5 })
      .withMessage("Estimated minutes must be at least 5"),
  ],
  validate,
  updateTopic
);

router.delete("/:id/topics/:topicId", deleteTopic);

// Resource Vault sub-routes (Google Drive links, YouTube playlists, Books, PDFs)
router.post(
  "/:id/resources",
  [
    body("title").trim().notEmpty().withMessage("Resource title is required"),
    body("url").trim().notEmpty().withMessage("Valid resource URL is required"),
  ],
  validate,
  addResource
);

router.delete("/:id/resources/:resourceId", deleteResource);

// Cloud Notes sub-routes (Markdown notes stored per user)
router.post(
  "/:id/notes",
  [body("title").trim().notEmpty().withMessage("Note title is required")],
  validate,
  addNote
);

router.put("/:id/notes/:noteId", updateNote);

router.delete("/:id/notes/:noteId", deleteNote);

export default router;
