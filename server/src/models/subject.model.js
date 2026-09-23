import mongoose, { Schema } from "mongoose";

// ── Topic sub-document ───────────────────────────────────────────────────────
const topicSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Topic title is required"],
      trim: true,
    },
    // User's self-rated confidence: 1 (very low) → 5 (mastered)
    confidenceScore: {
      type: Number,
      required: true,
      min: [1, "Confidence must be between 1 and 5"],
      max: [5, "Confidence must be between 1 and 5"],
      default: 3,
    },
    // Estimated time to study this topic, in minutes
    estimatedMinutes: {
      type: Number,
      default: 30,
      min: 5,
    },
    // Marked true when the student completes the topic
    completed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

// ── Subject document ─────────────────────────────────────────────────────────
const subjectSchema = new Schema(
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
    examDate: {
      type: Date,
      required: [true, "Exam date is required"],
    },
    // Color used in charts to differentiate subjects
    colorTag: {
      type: String,
      default: "#5C8368",
    },
    topics: [topicSchema],
  },
  { timestamps: true }
);

// ── Virtual: days until exam ─────────────────────────────────────────────────
subjectSchema.virtual("daysUntilExam").get(function () {
  const now = new Date();
  const diff = this.examDate - now;
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
});

subjectSchema.set("toJSON", { virtuals: true });
subjectSchema.set("toObject", { virtuals: true });

export const Subject = mongoose.model("Subject", subjectSchema);

