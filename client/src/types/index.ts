// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  _id: string;
  name: string;
  email: string;
  dailyStudyHours: number;
  onboardingComplete: boolean;
  createdAt?: string;
}

// ── Subject & Topic ───────────────────────────────────────────────────────────
export interface Topic {
  _id: string;
  title: string;
  confidenceScore: number; // 1–5
  estimatedMinutes: number;
  completed: boolean;
}

export interface Subject {
  _id: string;
  userId: string;
  name: string;
  examDate: string; // ISO date string
  colorTag: string;
  topics: Topic[];
  daysUntilExam?: number; // virtual from backend
  createdAt?: string;
  updatedAt?: string;
}

// ── Study Plan ────────────────────────────────────────────────────────────────
export type EntryStatus = "pending" | "done" | "missed";

export interface PlanEntry {
  _id: string;
  date: string; // ISO date string
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  topicId: string;
  topicTitle: string;
  estimatedMinutes: number;
  status: EntryStatus;
  priorityScore?: number;
}

export interface StudyPlan {
  _id: string;
  userId: string;
  generatedAt: string;
  dailyHoursAvailable: number;
  planEntries: PlanEntry[];
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface SubjectStat {
  subjectId: string;
  name: string;
  color: string;
  totalTopics: number;
  completedTopics: number;
  pendingMinutes: number;
  daysUntilExam: number;
}

export interface HistoryPoint {
  date: string;
  done: number;
  total: number;
  pct: number | null;
}

export interface DashboardSummary {
  completionPct: number;
  totalTopics: number;
  completedTopics: number;
  todayTotal: number;
  todayDone: number;
  streak: number;
  subjectStats: SubjectStat[];
  history: HistoryPoint[];
}

// ── API response wrapper ──────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

