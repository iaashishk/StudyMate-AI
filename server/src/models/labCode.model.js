import mongoose, { Schema } from "mongoose";

const vivaSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: true }
);

const labCodeSchema = new Schema(
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
    experimentNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    title: {
      type: String,
      required: [true, "Experiment title is required"],
      trim: true,
    },
    aim: {
      type: String,
      default: "",
      trim: true,
    },
    language: {
      type: String,
      enum: ["cpp", "c", "python", "java", "sql", "javascript", "bash", "other"],
      default: "cpp",
    },
    teacherPrompt: {
      type: String,
      default: "",
    },
    code: {
      type: String,
      default: "",
    },
    algorithm: {
      type: String,
      default: "",
    },
    sampleInput: {
      type: String,
      default: "",
    },
    sampleOutput: {
      type: String,
      default: "",
    },
    complexity: {
      time: { type: String, default: "" },
      space: { type: String, default: "" },
    },
    vivaQuestions: [vivaSchema],
    status: {
      type: String,
      enum: ["pending", "verified", "completed"],
      default: "pending",
    },
    rawDocText: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export const LabCode = mongoose.model("LabCode", labCodeSchema);
