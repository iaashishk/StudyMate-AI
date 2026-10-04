import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { askHelpBot } from "../controllers/helpbot.controller.js";

const router = Router();

// HelpBot requires user auth
router.use(verifyJWT);

router.post("/chat", askHelpBot);

export default router;

