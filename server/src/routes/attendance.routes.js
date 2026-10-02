import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getAttendanceSubjects,
  createAttendanceSubject,
  updateAttendanceSubject,
  deleteAttendanceSubject,
  getTimetable,
  saveTimetable,
  getDaySessions,
  markAttendance,
  bulkMarkDayPresent,
  markDayHoliday,
  addExtraSession,
  deleteAttendanceEntry,
  getAttendanceStats,
  getPendingDays,
  previewBackfill,
  commitBackfill,
  undoBackfillBatch,
  importCsv,
  getSemesterForecast,
  projectBunkPlan,
  getBunkPlans,
  saveBunkPlan,
  deleteBunkPlan,
  getWeeklyReport,
  getAttendanceSettings,
  updateAttendanceSettings,
  updateSemesterDates,
  addHoliday,
  deleteHoliday,
  clearAllHolidays,
  autoPopulateHolidays,
  resetSemester,
  exportAttendanceData,
} from "../controllers/attendance.controller.js";

const router = Router();

// All attendance routes require JWT authentication
router.use(verifyJWT);

// Subjects
router.get("/subjects", getAttendanceSubjects);
router.post("/subjects", createAttendanceSubject);
router.patch("/subjects/:id", updateAttendanceSubject);
router.delete("/subjects/:id", deleteAttendanceSubject);

// Timetable
router.get("/timetable", getTimetable);
router.put("/timetable", saveTimetable);

// Day Sessions & Marking
router.get("/day/:date", getDaySessions);
router.put("/mark", markAttendance);
router.post("/day/:date/bulk-present", bulkMarkDayPresent);
router.post("/day/:date/holiday", markDayHoliday);
router.post("/extra", addExtraSession);
router.delete("/entry/:id", deleteAttendanceEntry);

// Stats & Dashboard
router.get("/stats", getAttendanceStats);

// Pending Days
router.get("/pending-days", getPendingDays);

// Back-fill & Batch Undo
router.post("/backfill/preview", previewBackfill);
router.post("/backfill/commit", commitBackfill);
router.delete("/backfill/:batchId", undoBackfillBatch);

// CSV Import
router.post("/import/csv", importCsv);

// Bunk Planner & Semester Forecast
router.get("/bunk/forecast", getSemesterForecast);
router.post("/bunk/project", projectBunkPlan);
router.get("/bunk/plans", getBunkPlans);
router.post("/bunk/plans", saveBunkPlan);
router.delete("/bunk/plans/:id", deleteBunkPlan);

// Weekly Reports
router.get("/reports/weekly", getWeeklyReport);

// Settings, Holidays & Semester
router.get("/settings", getAttendanceSettings);
router.put("/settings", updateAttendanceSettings);
router.put("/settings/semester", updateSemesterDates);
router.post("/holidays", addHoliday);
router.delete("/holidays", clearAllHolidays);
router.delete("/holidays/:id", deleteHoliday);
router.post("/holidays/auto-populate", autoPopulateHolidays);
router.post("/reset", resetSemester);

// Data Export
router.get("/export", exportAttendanceData);

export default router;
