import { Router } from "express";
import { body } from "express-validator";
import {
  generatePlan,
  getTodaysPlan,
  getWeekPlan,
  getFullPlan,
  updateEntry,
  getInsights,
} from "../controllers/plan.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post(
  "/generate",
  [
    body("dailyHoursAvailable")
      .optional()
      .isFloat({ min: 0.5, max: 16 })
      .withMessage("Daily hours must be between 0.5 and 16"),
  ],
  validate,
  generatePlan
);

router.get("/today", getTodaysPlan);
router.get("/week", getWeekPlan);
router.get("/all", getFullPlan);
router.get("/insights", getInsights);

router.patch(
  "/entries/:entryId",
  [
    body("status")
      .isIn(["pending", "done", "missed"])
      .withMessage("Status must be pending, done, or missed"),
  ],
  validate,
  updateEntry
);

export default router;

