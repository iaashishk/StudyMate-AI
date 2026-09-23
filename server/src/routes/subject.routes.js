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
} from "../controllers/subject.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";

const router = Router();

// All subject routes require auth
router.use(verifyJWT);

router.get("/", getSubjects);

router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Subject name is required"),
    body("examDate").isISO8601().withMessage("Valid exam date is required"),
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

export default router;

