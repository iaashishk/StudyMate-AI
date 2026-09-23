import { Router } from "express";
import { body } from "express-validator";
import {
  signup,
  login,
  logout,
  refreshAccessToken,
  getMe,
  updateProfile,
  deleteAccount,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";

const router = Router();

// Public routes
router.post(
  "/signup",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  validate,
  signup
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  login
);

router.post("/refresh-token", refreshAccessToken);

// Protected routes
router.use(verifyJWT);

router.post("/logout", logout);
router.get("/me", getMe);
router.patch(
  "/me",
  [
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("dailyStudyHours")
      .optional()
      .isFloat({ min: 0.5, max: 16 })
      .withMessage("Daily hours must be between 0.5 and 16"),
  ],
  validate,
  updateProfile
);
router.delete("/me", deleteAccount);

export default router;

