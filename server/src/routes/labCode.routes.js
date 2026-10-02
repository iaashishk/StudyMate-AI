import { Router } from "express";
import {
  getLabCodes,
  getLabCodeById,
  createLabCode,
  updateLabCode,
  deleteLabCode,
  deriveLabCodeWithAI,
  deriveQuickLabCode,
} from "../controllers/labCode.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/", getLabCodes);
router.post("/", createLabCode);
router.post("/derive-quick", deriveQuickLabCode);

router.get("/:id", getLabCodeById);
router.patch("/:id", updateLabCode);
router.delete("/:id", deleteLabCode);

router.post("/:id/derive-ai", deriveLabCodeWithAI);

export default router;
