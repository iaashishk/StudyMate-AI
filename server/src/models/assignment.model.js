import mongoose, { Schema } from "mongoose";

const questionSchema = new Schema(
  {
    questionNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    question: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    answer: {
      type: String,
      default: "",
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    marks: {
      type: Number,
      default: 5,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: true, timestamps: true }
);

const assignmentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    subjectName: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Assignment title is required"],
      trim: true,
    },
    unitNumber: {
      type: Number,
      default: 1,
    },
    dueDate: {
      type: String, // 'YYYY-MM-DD'
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "submitted"],
      default: "pending",
    },
    questions: [questionSchema],
    rawDocText: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export const Assignment = mongoose.model("Assignment", assignmentSchema);
