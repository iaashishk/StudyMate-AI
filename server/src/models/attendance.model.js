import mongoose, { Schema } from "mongoose";

// ── Attendance Subject ────────────────────────────────────────────────────────
const attendanceSubjectSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Subject name is required"],
      trim: true,
    },
    code: {
      type: String,
      default: "",
      trim: true,
    },
    teacher: {
      type: String,
      default: "",
      trim: true,
    },
    color: {
      type: String,
      default: "#0A84FF",
    },
    // Minimum attendance limit percentage (e.g. 75)
    minPercent: {
      type: Number,
      default: 75,
      min: [1, "Limit must be at least 1%"],
      max: [100, "Limit cannot exceed 100%"],
    },
    // Opening balance for students joining mid-semester (FR-S3)
    openingAttended: {
      type: Number,
      default: 0,
      min: 0,
    },
    openingConducted: {
      type: Number,
      default: 0,
      min: 0,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Timetable Slot with Effective Dating (FR-T1 to FR-T4) ────────────────────
const timetableSlotSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceSubject",
      default: null, // null means "Free" slot
    },
    weekday: {
      type: Number,
      required: true,
      min: 0, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      max: 6,
    },
    slotIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    startTime: {
      type: String,
      default: "09:00",
    },
    endTime: {
      type: String,
      default: "10:00",
    },
    room: {
      type: String,
      default: "",
    },
    slotType: {
      type: String,
      enum: ["lecture", "lab", "tutorial"],
      default: "lecture",
    },
    // Effective dating (FR-T4): fixes past records breaking on timetable edits
    effectiveFrom: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    effectiveTo: {
      type: String, // 'YYYY-MM-DD' or null if currently active
      default: null,
    },
    weekType: {
      type: String,
      enum: ["all", "A", "B"],
      default: "all",
    },
  },
  { timestamps: true }
);

timetableSlotSchema.index({ userId: 1, weekday: 1, slotIndex: 1, effectiveFrom: 1 });

// ── Semester Dates (FR-B1) ───────────────────────────────────────────────────
const semesterSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: "Current Semester",
    },
    startDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    endDate: {
      type: String, // 'YYYY-MM-DD'
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ── Holidays (FR-A6, FR-K5) ─────────────────────────────────────────────────
const holidaySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Attendance Entry (FR-A1 to FR-A9) ────────────────────────────────────────
const attendanceEntrySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceSubject",
      required: true,
      index: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      index: true,
    },
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "TimetableSlot",
      default: null,
    },
    status: {
      type: String,
      enum: ["present", "absent", "cancelled"],
      required: true,
    },
    source: {
      type: String,
      enum: ["scheduled", "extra", "backfill", "import"],
      default: "scheduled",
    },
    // Groups a back-fill / import batch for 1-click Undo (FR-B7, FR-B8)
    batchId: {
      type: String,
      default: null,
      index: true,
    },
    startTime: {
      type: String,
      default: null,
    },
    endTime: {
      type: String,
      default: null,
    },
    slotType: {
      type: String,
      enum: ["lecture", "lab", "tutorial"],
      default: "lecture",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

attendanceEntrySchema.index({ userId: 1, date: 1, slotId: 1 });

// ── Bunk Plan & Items (FR-K4) ────────────────────────────────────────────────
const bunkPlanItemSchema = new Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceSubject",
      required: true,
    },
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "TimetableSlot",
      default: null,
    },
    slotIndex: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const bunkPlanSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    items: [bunkPlanItemSchema],
  },
  { timestamps: true }
);

// ── Attendance User Settings (FR-G1 to FR-G4) ────────────────────────────────
const attendanceSettingsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    defaultMinPercent: {
      type: Number,
      default: 75,
      min: 1,
      max: 100,
    },
    safetyMargin: {
      type: Number,
      default: 0,
      min: 0,
      max: 20,
    },
    weekStart: {
      type: Number,
      default: 1, // 1 = Monday, 0 = Sunday
      enum: [0, 1],
    },
    maxSlots: {
      type: Number,
      default: 6,
      min: 1,
      max: 12,
    },
    dailyReminderTime: {
      type: String,
      default: "18:00",
    },
    weeklyReportDay: {
      type: Number,
      default: 0, // Sunday
      min: 0,
      max: 6,
    },
    weeklyReportEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const AttendanceSubject = mongoose.model(
  "AttendanceSubject",
  attendanceSubjectSchema
);
export const TimetableSlot = mongoose.model(
  "TimetableSlot",
  timetableSlotSchema
);
export const Semester = mongoose.model("Semester", semesterSchema);
export const Holiday = mongoose.model("Holiday", holidaySchema);
export const AttendanceEntry = mongoose.model(
  "AttendanceEntry",
  attendanceEntrySchema
);
export const BunkPlan = mongoose.model("BunkPlan", bunkPlanSchema);
export const AttendanceSettings = mongoose.model(
  "AttendanceSettings",
  attendanceSettingsSchema
);
