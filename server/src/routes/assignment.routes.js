import { Router } from "express";
import {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  addQuestionToAssignment,
  updateQuestion,
  solveQuestion,
  solveAllQuestions,
  generateQuickAnswer,
} from "../controllers/assignment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/", getAssignments);
router.post("/", createAssignment);
router.post("/generate-quick-answer", generateQuickAnswer);

router.get("/:id", getAssignmentById);
router.patch("/:id", updateAssignment);
router.delete("/:id", deleteAssignment);

router.post("/:id/questions", addQuestionToAssignment);
router.put("/:id/questions/:questionId", updateQuestion);
router.post("/:id/questions/:questionId/solve", solveQuestion);
router.post("/:id/solve-all", solveAllQuestions);

export default router;
