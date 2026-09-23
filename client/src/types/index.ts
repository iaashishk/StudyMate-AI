// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  _id: string;
  name: string;
  email: string;
  dailyStudyHours: number;
  onboardingComplete: boolean;
  createdAt?: string;
}

// ── Resource Vault (Documents, Video Playlists, Books, PDFs) ─────────────
export type ResourceType = "drive" | "youtube" | "pdf" | "book" | "link";

export interface Resource {
  _id: string;
  title: string;
  type: ResourceType;
  url: string;
  createdAt?: string;
}

// ── Cloud Notes (Cloud-backed per user) ─────────────────────────────────────
export interface SubjectNote {
  _id: string;
  title: string;
  content: string;
  linkUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalNote extends SubjectNote {
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  semesterOrTrack?: string;
}

// ── Subject & Topic ───────────────────────────────────────────────────────────
export interface Topic {
  _id: string;
  title: string;
  unitNumber?: number;
  confidenceScore: number; // 1–5
  estimatedMinutes: number;
  completed: boolean;
  notes?: string;
  resourceQuery?: string;
}

export interface Subject {
  _id: string;
  userId: string;
  name: string;
  semesterOrTrack?: string; // e.g. "Semester 1", "Core Studies"
  category?: "exam" | "course" | "tech_stack" | "certification";
  examDate: string; // ISO date string
  colorTag: string;
  topics: Topic[];
  resources?: Resource[];
  notes?: SubjectNote[];
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
  resourceQuery?: string;
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
  semesterOrTrack?: string;
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
