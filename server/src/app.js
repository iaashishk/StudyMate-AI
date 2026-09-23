import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : ["http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Routes ──────────────────────────────────────────────────────────────────
import authRouter from "./routes/auth.routes.js";
import subjectRouter from "./routes/subject.routes.js";
import planRouter from "./routes/plan.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";

app.use("/api/auth", authRouter);
app.use("/api/subjects", subjectRouter);
app.use("/api/plan", planRouter);
app.use("/api/dashboard", dashboardRouter);

// ── Health check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "StudyMate AI", time: new Date().toISOString() });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
  });
});

export default app;

