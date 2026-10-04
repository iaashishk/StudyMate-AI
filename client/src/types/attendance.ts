export type AttendanceStatus = "present" | "absent" | "cancelled";
export type BunkStatusType = "safe" | "edge" | "danger";

export interface SubjectStats {
  attended: number;
  conducted: number;
  cancelled: number;
  percentage: number;
  rawPercentage: number;
  hasData: boolean;
  minPercent: number;
  safetyMargin: number;
  effectiveLimit: number;
  status: BunkStatusType;
  classesToAttend: number | string;
  classesToAttendNumber: number;
  safeToMiss: number;
  message: string;
  projectedSkippedPct: number;
  canBunkNext: boolean;
}

export interface AttendanceSubject {
  _id: string;
  name: string;
  code?: string;
  shortName?: string;
  teacher?: string;
  defaultRoom?: string;
  color: string;
  minPercent: number;
  openingAttended: number;
  openingConducted: number;
  archivedAt?: string | null;
  stats?: SubjectStats;
  createdAt?: string;
  updatedAt?: string;
}

export interface OverallStats {
  totalAttended: number;
  totalConducted: number;
  totalCancelled: number;
  overallPercentage: number;
  overallBunkBudget: number;
  hasData: boolean;
}

export interface BunkBadge {
  canBunk: boolean;
  projectedPct: number;
  limit: number;
  text: string;
}

export interface AttendanceSession {
  slotId: string | null;
  subjectId: string | null;
  subject?: AttendanceSubject | null;
  slotIndex: number;
  startTime: string;
  endTime: string;
  room?: string;
  slotType?: "lecture" | "lab" | "tutorial";
  status: AttendanceStatus | null;
  entryId?: string | null;
  source?: "scheduled" | "extra" | "backfill" | "import";
  notes?: string;
  bunkBadge?: BunkBadge | null;
}

export interface DaySessionsResponse {
  date: string;
  weekday: number;
  holiday: { label: string; id: string } | null;
  isHoliday: boolean;
  sessions: AttendanceSession[];
  allMarked: boolean;
}

export interface TimetableSlot {
  _id?: string;
  subjectId?: string | AttendanceSubject | null;
  weekday: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
  room?: string;
  slotType?: "lecture" | "lab" | "tutorial";
  effectiveFrom?: string;
  effectiveTo?: string | null;
  weekType?: "all" | "A" | "B";
  blockId?: string;
  blockSpan?: number;
}

export interface SemesterInfo {
  _id?: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  active: boolean;
}

export interface HolidayItem {
  _id: string;
  date: string;
  label: string;
}

export interface AttendanceSettings {
  defaultMinPercent: number;
  safetyMargin: number;
  weekStart: number;
  maxSlots: number;
  dailyReminderTime: string;
  weeklyReportDay: number;
  weeklyReportEnabled: boolean;
}

export interface PendingDay {
  date: string;
  weekday: number;
  unmarkedCount: number;
  totalSlots: number;
}

export interface ForecastItem {
  _id: string;
  name: string;
  code?: string;
  color: string;
  minPercent: number;
  attended: number;
  conducted: number;
  remainingSessions: number;
  maxBunksLeft: number;
  minimumToAttend: number;
  isRecoverable: boolean;
  plannedBunks: number;
  projectedFinalPct: number;
  breachesLimit: boolean;
}

export interface BunkPlanItem {
  _id?: string;
  date: string;
  subjectId: string;
  slotId?: string | null;
  slotIndex?: number;
}

export interface BunkPlan {
  _id: string;
  name: string;
  items: BunkPlanItem[];
  createdAt: string;
}

export interface WeeklyDailyBreakdown {
  date: string;
  weekday: number;
  present: number;
  absent: number;
  cancelled: number;
  total: number;
}
