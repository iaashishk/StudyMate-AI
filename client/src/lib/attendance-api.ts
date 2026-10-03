import api from "./api";
import {
  AttendanceSubject,
  DaySessionsResponse,
  TimetableSlot,
  AttendanceSettings,
  SemesterInfo,
  HolidayItem,
  OverallStats,
  PendingDay,
  ForecastItem,
  BunkPlan,
  WeeklyDailyBreakdown,
  AttendanceStatus,
} from "../types/attendance";

export const attendanceApi = {
  // Subjects
  getSubjects: async (includeArchived = false) => {
    const res = await api.get<{ data: { subjects: AttendanceSubject[] } }>(
      `/attendance/subjects?includeArchived=${includeArchived}`
    );
    return res.data.data.subjects;
  },

  createSubject: async (payload: {
    name: string;
    code?: string;
    teacher?: string;
    color?: string;
    minPercent?: number;
    openingAttended?: number;
    openingConducted?: number;
  }) => {
    const res = await api.post<{ data: { subject: AttendanceSubject } }>(
      "/attendance/subjects",
      payload
    );
    return res.data.data.subject;
  },

  updateSubject: async (
    id: string,
    payload: Partial<{
      name: string;
      code: string;
      teacher: string;
      color: string;
      minPercent: number;
      openingAttended: number;
      openingConducted: number;
      archivedAt: string | null;
    }>
  ) => {
    const res = await api.patch<{ data: { subject: AttendanceSubject } }>(
      `/attendance/subjects/${id}`,
      payload
    );
    return res.data.data.subject;
  },

  deleteSubject: async (id: string, permanent = false) => {
    const res = await api.delete<{ data: { archived?: boolean; deleted?: boolean } }>(
      `/attendance/subjects/${id}?permanent=${permanent}`
    );
    return res.data.data;
  },

  // Timetable
  getTimetable: async (date?: string) => {
    const url = date ? `/attendance/timetable?date=${date}` : "/attendance/timetable";
    const res = await api.get<{
      data: {
        date: string;
        slots: TimetableSlot[];
        weekStart: number;
        maxSlots: number;
      };
    }>(url);
    return res.data.data;
  },

  saveTimetable: async (slots: TimetableSlot[], applyFrom?: string) => {
    const res = await api.put<{
      data: { count: number; applyFrom: string };
    }>("/attendance/timetable", { slots, applyFrom });
    return res.data.data;
  },

  // Day & Marking
  getDaySessions: async (date: string) => {
    const res = await api.get<{ data: DaySessionsResponse }>(`/attendance/day/${date}`);
    return res.data.data;
  },

  markAttendance: async (payload: {
    date: string;
    slotId?: string | null;
    subjectId: string;
    status: AttendanceStatus;
    notes?: string;
  }) => {
    const res = await api.put<{ data: { entry: unknown } }>("/attendance/mark", payload);
    return res.data.data.entry;
  },

  bulkMarkDayPresent: async (date: string) => {
    const res = await api.post<{ data: { count: number } }>(
      `/attendance/day/${date}/bulk-present`
    );
    return res.data.data;
  },

  markDayHoliday: async (date: string, label?: string) => {
    const res = await api.post<{ data: { holiday: HolidayItem } }>(
      `/attendance/day/${date}/holiday`,
      { label }
    );
    return res.data.data.holiday;
  },

  addExtraSession: async (payload: {
    date: string;
    subjectId: string;
    startTime?: string;
    endTime?: string;
    notes?: string;
    status?: AttendanceStatus;
  }) => {
    const res = await api.post<{ data: { entry: unknown } }>("/attendance/extra", payload);
    return res.data.data.entry;
  },

  deleteEntry: async (id: string) => {
    const res = await api.delete<{ data: { deleted: boolean } }>(`/attendance/entry/${id}`);
    return res.data.data;
  },

  // Stats
  getStats: async () => {
    const res = await api.get<{
      data: {
        overall: OverallStats;
        subjects: AttendanceSubject[];
        safetyMargin: number;
      };
    }>("/attendance/stats");
    return res.data.data;
  },

  // Pending Days
  getPendingDays: async (today?: string) => {
    const url = today ? `/attendance/pending-days?today=${today}` : "/attendance/pending-days";
    const res = await api.get<{
      data: {
        pendingCount: number;
        pendingDays: PendingDay[];
      };
    }>(url);
    return res.data.data;
  },

  // Back-fill & Undo
  previewBackfill: async (payload: {
    startDate: string;
    endDate: string;
    defaultStatus?: AttendanceStatus;
  }) => {
    const res = await api.post<{
      data: {
        totalSessions: number;
        hasOpeningConflict: boolean;
        openingWarning: string | null;
        sessions: Array<{
          date: string;
          slotId: string;
          subjectId: string;
          subjectName: string;
          color: string;
          startTime: string;
          endTime: string;
          status: AttendanceStatus;
        }>;
      };
    }>("/attendance/backfill/preview", payload);
    return res.data.data;
  },

  commitBackfill: async (payload: {
    entries: Array<{
      date: string;
      slotId?: string | null;
      subjectId: string;
      status: AttendanceStatus;
      notes?: string;
    }>;
    clearOpeningBalances?: boolean;
  }) => {
    const res = await api.post<{
      data: {
        batchId: string;
        recordedSessions: number;
      };
    }>("/attendance/backfill/commit", payload);
    return res.data.data;
  },

  undoBackfillBatch: async (batchId: string) => {
    const res = await api.delete<{
      data: { deletedCount: number; batchId: string };
    }>(`/attendance/backfill/${batchId}`);
    return res.data.data;
  },

  // CSV Import
  importCsv: async (rows: Array<{ date: string; subject: string; status: string }>) => {
    const res = await api.post<{
      data: {
        importedCount: number;
        errorCount: number;
        batchId: string;
        errors: Array<{ row: number; error: string }>;
      };
    }>("/attendance/import/csv", { rows });
    return res.data.data;
  },

  // Bunk Planner & Forecast
  getSemesterForecast: async (today?: string) => {
    const url = today ? `/attendance/bunk/forecast?today=${today}` : "/attendance/bunk/forecast";
    const res = await api.get<{
      data: {
        semesterStartDate: string;
        semesterEndDate: string | null;
        forecasts: ForecastItem[];
      };
    }>(url);
    return res.data.data;
  },

  projectBunkPlan: async (plannedSkips: Array<{ date: string; subjectId: string }>) => {
    const res = await api.post<{
      data: {
        firstBreach: {
          date: string;
          subjectName: string;
          projectedPct: number;
          limit: number;
          message: string;
        } | null;
        timeline: Array<{
          date: string;
          subjectId: string;
          subjectName: string;
          projectedPct: number;
          isBreach: boolean;
        }>;
        hasBreach: boolean;
      };
    }>("/attendance/bunk/project", { plannedSkips });
    return res.data.data;
  },

  getBunkPlans: async () => {
    const res = await api.get<{ data: { plans: BunkPlan[] } }>("/attendance/bunk/plans");
    return res.data.data.plans;
  },

  saveBunkPlan: async (payload: { name: string; items: unknown[] }) => {
    const res = await api.post<{ data: { plan: BunkPlan } }>(
      "/attendance/bunk/plans",
      payload
    );
    return res.data.data.plan;
  },

  deleteBunkPlan: async (id: string) => {
    const res = await api.delete<{ data: { deleted: boolean } }>(
      `/attendance/bunk/plans/${id}`
    );
    return res.data.data;
  },

  // Weekly Reports
  getWeeklyReport: async (weekStart?: string) => {
    const url = weekStart
      ? `/attendance/reports/weekly?week_start=${weekStart}`
      : "/attendance/reports/weekly";
    const res = await api.get<{
      data: {
        weekStart: string;
        dailyBreakdown: WeeklyDailyBreakdown[];
      };
    }>(url);
    return res.data.data;
  },

  // Settings & Holidays
  getSettings: async () => {
    const res = await api.get<{
      data: {
        settings: AttendanceSettings;
        semester: SemesterInfo;
        holidays: HolidayItem[];
      };
    }>("/attendance/settings");
    return res.data.data;
  },

  updateSettings: async (payload: Partial<AttendanceSettings>) => {
    const res = await api.put<{ data: { settings: AttendanceSettings } }>(
      "/attendance/settings",
      payload
    );
    return res.data.data.settings;
  },

  updateSemester: async (payload: { startDate: string; endDate?: string; name?: string }) => {
    const res = await api.put<{ data: { semester: SemesterInfo } }>(
      "/attendance/settings/semester",
      payload
    );
    return res.data.data.semester;
  },

  addHoliday: async (date: string, label: string) => {
    const res = await api.post<{ data: { holiday: HolidayItem } }>("/attendance/holidays", {
      date,
      label,
    });
    return res.data.data.holiday;
  },

  deleteHoliday: async (id: string) => {
    const res = await api.delete<{ data: { deleted: boolean } }>(
      `/attendance/holidays/${id}`
    );
    return res.data.data;
  },

  clearAllHolidays: async () => {
    const res = await api.delete<{ data: { deletedCount: number } }>(
      "/attendance/holidays"
    );
    return res.data.data;
  },

  autoPopulateHolidays: async (year?: number) => {
    const res = await api.post<{
      data: { addedCount: number; totalHolidays: number; holidays: HolidayItem[] };
    }>("/attendance/holidays/auto-populate", { year });
    return res.data.data;
  },

  resetSemester: async (action: "clear_records" | "archive_subjects") => {
    const res = await api.post<{ data: { reset: boolean } }>("/attendance/reset", {
      action,
    });
    return res.data.data;
  },

  exportData: async () => {
    const res = await api.get<{
      data: {
        exportDate: string;
        subjects: unknown[];
        slots: unknown[];
        entries: unknown[];
      };
    }>("/attendance/export");
    return res.data.data;
  },

  getSyncReport: async (today?: string) => {
    const url = today ? `/attendance/sync-report?today=${today}` : "/attendance/sync-report";
    const res = await api.get<{
      data: {
        semester: SemesterInfo | null;
        calendarSummary: {
          totalCalendarDays: number;
          teachingDays: number;
          holidaysCount: number;
          weekendDays: number;
        };
        perSubject: Array<{
          subjectId: string;
          name: string;
          code: string;
          color: string;
          weeklySlots: number;
          attended: number;
          conducted: number;
          sessionsLeft: number;
          currentPct: number;
          target: number;
          maxSkippable: number;
          mustAttend: number;
        }>;
        conflicts: Array<{
          type: string;
          severity: string;
          message: string;
          date?: string;
          label?: string;
        }>;
        syncScore: number;
      };
    }>(url);
    return res.data.data;
  },
};
