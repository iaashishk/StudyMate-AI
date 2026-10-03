/**
 * academic-brain.ts
 * ─────────────────────────────────────────────────────────────────
 * The "Academic Brain" — a pure-client cross-sync intelligence engine.
 *
 * Given semester dates + holidays + timetable slots + attendance stats,
 * it computes:
 *   • Total working / teaching days in the semester
 *   • Days elapsed and days remaining
 *   • Weekly teaching sessions count (from timetable)
 *   • Per-subject remaining sessions projection
 *   • Attendance target feasibility
 *   • Holiday-vs-schedule conflict warnings
 *   • Exam / deadline proximity alerts
 *   • Smart nudges (e.g. "attend next 3 classes to recover")
 * ─────────────────────────────────────────────────────────────────
 */

import { HolidayItem, SemesterInfo, TimetableSlot, AttendanceSubject } from "../types/attendance";

// ── Public types ─────────────────────────────────────────────────

export interface ExamDate {
  date: string;        // YYYY-MM-DD
  label: string;       // e.g. "End-Term Exam — MATH"
  subjectId?: string;
}

export interface SyncConflict {
  type:
    | "holiday_on_exam"
    | "holiday_on_weekend"
    | "semester_not_set"
    | "timetable_empty"
    | "holiday_outside_semester"
    | "exam_outside_semester";
  severity: "error" | "warning" | "info";
  message: string;
  date?: string;
  label?: string;
}

export interface SubjectProjection {
  subjectId: string;
  name: string;
  color: string;
  weeklySlots: number;         // slots per week per this subject
  sessionsLeft: number;        // projected sessions remaining in semester
  currentPct: number;          // current attendance %
  projectedFinalPct: number;   // if they attend everything remaining
  maxSkippable: number;        // sessions they can skip and still hit target
  mustAttend: number;          // sessions they must attend to recover
  status: "safe" | "edge" | "danger" | "critical";
  target: number;
}

export interface AcademicBrainResult {
  // Semester timeline
  semesterStartDate: string | null;
  semesterEndDate: string | null;
  semesterName: string;
  totalCalendarDays: number;
  totalHolidayDays: number;   // holidays within semester
  totalWeekendDays: number;
  totalWorkingDays: number;   // calendar - weekends - holidays
  daysElapsed: number;
  daysRemaining: number;
  semesterProgressPct: number;

  // Timetable density
  weeklySessionCount: number;        // total sessions per week (all subjects)
  projectedTotalSessions: number;    // sessions from today to semester end

  // Per-subject projections
  subjectProjections: SubjectProjection[];

  // Conflicts & warnings
  conflicts: SyncConflict[];

  // Exam dates
  examDates: ExamDate[];
  upcomingExams: ExamDate[];          // within next 14 days
  nextExamDaysAway: number | null;

  // Smart nudges
  nudges: string[];

  // Sync status
  isSynced: boolean;
  syncScore: number; // 0-100 — how "complete" the academic setup is
}

import {
  todayLocalCivil,
  rangeCivil,
  diffDaysCivil,
  weekdayOf,
} from "./civil-date";

// ── Helpers ──────────────────────────────────────────────────────

/** Map weekday name/number used in timetable to JS Date.getDay() */
function timetableWeekdayToJsDay(weekday: number): number {
  // Backend stores: 0=Sun, 1=Mon, ..., 6=Sat (standard)
  return weekday;
}

// ── Main engine ──────────────────────────────────────────────────

export interface AcademicBrainInput {
  semester: SemesterInfo | null;
  holidays: HolidayItem[];
  slots: TimetableSlot[];
  subjects: AttendanceSubject[];
  examDates?: ExamDate[];
  today?: string; // YYYY-MM-DD, defaults to current date
}

export function computeAcademicBrain(input: AcademicBrainInput): AcademicBrainResult {
  const {
    semester,
    holidays,
    slots,
    subjects,
    examDates: rawExams = [],
  } = input;

  const today = input.today || todayLocalCivil();
  const conflicts: SyncConflict[] = [];
  const nudges: string[] = [];

  // ── 1. Semester validation ────────────────────────────────────
  const semStart = semester?.startDate || null;
  const semEnd = semester?.endDate || null;
  const semesterName = semester?.name || "Current Semester";

  if (!semStart) {
    conflicts.push({
      type: "semester_not_set",
      severity: "error",
      message: "Semester start date is not set. Please configure it in Tracker Settings.",
    });
  }

  // ── 2. Calendar math ─────────────────────────────────────────
  let totalCalendarDays = 0;
  let totalWeekendDays = 0;
  let totalHolidayDays = 0;
  let totalWorkingDays = 0;
  let daysElapsed = 0;
  let daysRemaining = 0;
  let semesterProgressPct = 0;

  const holidayDateSet = new Set(holidays.map((h) => h.date));

  // Determine if student has classes scheduled on Saturday
  const activeSlots = slots.filter((s) => s.subjectId);
  const hasSaturdaySlots = activeSlots.some((s) => s.weekday === 6);

  if (semStart) {
    const effectiveEnd = semEnd || today;

    totalCalendarDays = Math.max(0, diffDaysCivil(semStart, effectiveEnd) + 1);

    // Count weekends and holidays in semester range
    const allDates = rangeCivil(semStart, effectiveEnd);
    for (const d of allDates) {
      const day = weekdayOf(d);
      // Sunday is always a weekend; Saturday is a weekend only if student has no Saturday classes
      const isWeekend = day === 0 || (day === 6 && !hasSaturdaySlots);
      if (isWeekend) {
        totalWeekendDays++;
      } else if (holidayDateSet.has(d)) {
        totalHolidayDays++;
      }
    }

    totalWorkingDays = Math.max(0, totalCalendarDays - totalWeekendDays - totalHolidayDays);

    daysElapsed = Math.max(0, Math.min(diffDaysCivil(semStart, today), totalCalendarDays));
    daysRemaining = Math.max(0, diffDaysCivil(today, effectiveEnd));
    semesterProgressPct =
      totalCalendarDays > 0 ? Math.round((daysElapsed / totalCalendarDays) * 100) : 0;
  }

  // ── 3. Timetable density ──────────────────────────────────────
  if (activeSlots.length === 0) {
    conflicts.push({
      type: "timetable_empty",
      severity: "warning",
      message: "Timetable is empty. Set up your weekly schedule for accurate projections.",
    });
  }

  const weeklySessionCount = activeSlots.length; // total sessions across all weekdays

  // Remaining sessions: from today to end, count active timetable days
  let projectedTotalSessions = 0;
  if (semStart && daysRemaining >= 0) {
    const endBound = semEnd || today;
    const futureDates = rangeCivil(today, endBound).slice(1); // exclude today
    for (const d of futureDates) {
      if (holidayDateSet.has(d)) continue;
      const jsDay = weekdayOf(d);
      if (jsDay === 0 || (jsDay === 6 && !hasSaturdaySlots)) continue;
      const daySlots = activeSlots.filter((s) => timetableWeekdayToJsDay(s.weekday) === jsDay);
      projectedTotalSessions += daySlots.length;
    }
  }

  // ── 4. Per-subject projections ────────────────────────────────
  const subjectProjections: SubjectProjection[] = [];

  for (const subj of subjects) {
    if (subj.archivedAt) continue;
    const stats = subj.stats;
    if (!stats) continue;

    // How many slots does this subject have per week?
    const subjWeeklySlots = activeSlots.filter(
      (s) => String(s.subjectId) === String(subj._id)
    ).length;

    // Remaining sessions for this subject
    let sessionsLeft = 0;
    if (semStart) {
      const endBound = semEnd || today;
      const futureDates = rangeCivil(today, endBound).slice(1);
      for (const d of futureDates) {
        if (holidayDateSet.has(d)) continue;
        const jsDay = weekdayOf(d);
        if (jsDay === 0 || (jsDay === 6 && !hasSaturdaySlots)) continue;
        const daySlots = activeSlots.filter(
          (s) =>
            timetableWeekdayToJsDay(s.weekday) === jsDay &&
            String(s.subjectId) === String(subj._id)
        );
        sessionsLeft += daySlots.length;
      }
    }

    const target = subj.minPercent || 75;
    const attended = stats.attended;
    const conducted = stats.conducted;
    const currentPct = conducted > 0 ? (attended / conducted) * 100 : 100;

    // Projected final % if they attend ALL remaining
    const projectedFinalPct =
      conducted + sessionsLeft > 0
        ? Math.round(((attended + sessionsLeft) / (conducted + sessionsLeft)) * 100)
        : currentPct;

    // How many can they skip and still hit target?
    // Need: (attended + attend_future) / (conducted + sessionsLeft) >= target/100
    // attend_future = sessionsLeft - skip
    // => (attended + sessionsLeft - skip) / (conducted + sessionsLeft) >= target/100
    // => skip <= attended + sessionsLeft - target/100 * (conducted + sessionsLeft)
    const totalFutureConducted = conducted + sessionsLeft;
    const maxSkippable = Math.max(
      0,
      Math.floor(attended + sessionsLeft - (target / 100) * totalFutureConducted)
    );

    // How many must they still attend to reach target?
    // mustAttend = ceil((target/100 * (conducted + sessionsLeft)) - attended)
    const mustAttend = Math.max(
      0,
      Math.ceil((target / 100) * totalFutureConducted - attended)
    );

    let status: "safe" | "edge" | "danger" | "critical" = "safe";
    if (projectedFinalPct < target - 5) status = "critical";
    else if (projectedFinalPct < target) status = "danger";
    else if (currentPct < target) status = "edge";
    else status = "safe";

    subjectProjections.push({
      subjectId: String(subj._id),
      name: subj.name,
      color: subj.color,
      weeklySlots: subjWeeklySlots,
      sessionsLeft,
      currentPct: Math.round(currentPct),
      projectedFinalPct,
      maxSkippable,
      mustAttend,
      status,
      target,
    });
  }

  // ── 5. Holiday conflicts ──────────────────────────────────────
  for (const h of holidays) {
    const day = weekdayOf(h.date);
    const isWeekend = day === 0 || (day === 6 && !hasSaturdaySlots);
    if (isWeekend) {
      // This holiday falls on a weekend — informational
      conflicts.push({
        type: "holiday_on_weekend",
        severity: "info",
        message: `"${h.label}" falls on a ${day === 0 ? "Sunday" : "Saturday"} — no weekday impact.`,
        date: h.date,
        label: h.label,
      });
    }

    if (semStart && semEnd) {
      if (h.date < semStart || h.date > semEnd) {
        conflicts.push({
          type: "holiday_outside_semester",
          severity: "info",
          message: `"${h.label}" (${h.date}) is outside the semester range and won't affect attendance.`,
          date: h.date,
          label: h.label,
        });
      }
    }
  }

  // ── 6. Exam date analysis ─────────────────────────────────────
  const examDates = rawExams;

  // Flag exams on holidays
  for (const exam of examDates) {
    if (holidayDateSet.has(exam.date)) {
      const holiday = holidays.find((h) => h.date === exam.date);
      conflicts.push({
        type: "holiday_on_exam",
        severity: "error",
        message: `⚠️ "${exam.label}" (${exam.date}) falls on a holiday: "${holiday?.label}". Verify with your university.`,
        date: exam.date,
        label: exam.label,
      });
    }

    if (semStart && semEnd && (exam.date < semStart || exam.date > semEnd)) {
      conflicts.push({
        type: "exam_outside_semester",
        severity: "warning",
        message: `"${exam.label}" (${exam.date}) is outside the configured semester dates.`,
        date: exam.date,
        label: exam.label,
      });
    }
  }

  // Upcoming exams in next 14 days
  const upcomingExams = examDates.filter((e) => {
    const diff = diffDaysCivil(today, e.date);
    return diff >= 0 && diff <= 14;
  });
  upcomingExams.sort((a, b) => a.date.localeCompare(b.date));

  let nextExamDaysAway: number | null = null;
  if (upcomingExams.length > 0) {
    nextExamDaysAway = diffDaysCivil(today, upcomingExams[0].date);
  }

  // ── 7. Smart nudges ───────────────────────────────────────────
  if (!semStart) {
    nudges.push("📅 Set your semester start date to unlock all sync features.");
  }

  if (daysRemaining > 0 && daysRemaining <= 14) {
    nudges.push(`⏰ Only ${daysRemaining} days left in the semester! Final push time.`);
  }

  for (const proj of subjectProjections) {
    if (proj.status === "critical") {
      nudges.push(
        `🚨 ${proj.name}: Need to attend ${proj.mustAttend} more classes to meet ${proj.target}% target — currently not recoverable even with perfect attendance!`
      );
    } else if (proj.status === "danger") {
      nudges.push(
        `⚠️ ${proj.name}: Must attend next ${proj.mustAttend} class${proj.mustAttend !== 1 ? "es" : ""} without missing any to reach ${proj.target}%.`
      );
    } else if (proj.status === "edge" && proj.maxSkippable > 0) {
      nudges.push(
        `💛 ${proj.name}: On edge — can safely skip ${proj.maxSkippable} more class${proj.maxSkippable !== 1 ? "es" : ""} this semester.`
      );
    } else if (proj.status === "safe" && proj.maxSkippable > 3) {
      nudges.push(
        `✅ ${proj.name}: Good shape! ${proj.maxSkippable} bunkable classes remaining.`
      );
    }
  }

  if (nextExamDaysAway !== null && nextExamDaysAway <= 7) {
    nudges.push(
      `📝 Exam in ${nextExamDaysAway} day${nextExamDaysAway !== 1 ? "s" : ""}: "${upcomingExams[0]?.label}" — stay sharp!`
    );
  }

  if (totalHolidayDays === 0 && semStart) {
    nudges.push("🎉 No holidays configured in this semester — add them for accurate projections.");
  }

  // ── 8. Sync score ─────────────────────────────────────────────
  let syncScore = 0;
  if (semStart) syncScore += 30;
  if (semEnd) syncScore += 15;
  if (weeklySessionCount > 0) syncScore += 25;
  if (subjects.length > 0) syncScore += 10;
  if (holidays.length > 0) syncScore += 10;
  if (rawExams.length > 0) syncScore += 10;

  const isSynced = syncScore >= 70;

  return {
    semesterStartDate: semStart,
    semesterEndDate: semEnd,
    semesterName,
    totalCalendarDays,
    totalHolidayDays,
    totalWeekendDays,
    totalWorkingDays,
    daysElapsed,
    daysRemaining,
    semesterProgressPct,
    weeklySessionCount,
    projectedTotalSessions,
    subjectProjections,
    conflicts,
    examDates,
    upcomingExams,
    nextExamDaysAway,
    nudges,
    isSynced,
    syncScore,
  };
}
