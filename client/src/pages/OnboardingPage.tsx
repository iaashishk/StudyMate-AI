import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import ConfidenceRating from "../components/ConfidenceRating";

// ── Step schemas ──────────────────────────────────────────────────────────────
const step1Schema = z.object({
  subjectName: z.string().min(1, "Subject name is required"),
  examDate: z.string().min(1, "Exam date is required"),
});

type Step1Data = z.infer<typeof step1Schema>;

const STEPS = ["Subject", "Topics", "Schedule"];

export default function OnboardingPage() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topics, setTopics] = useState([
    { title: "", confidenceScore: 3, estimatedMinutes: 30 },
  ]);
  const [dailyHours, setDailyHours] = useState(2);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    register: r1,
    handleSubmit: hs1,
    formState: { errors: e1 },
  } = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });

  // ── Step 1: Create subject ────────────────────────────────────────────────
  const submitStep1 = async (data: Step1Data) => {
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/subjects", {
        name: data.subjectName,
        examDate: data.examDate,
      });
      setSubjectId(res.data.data.subject._id);
      setStep(1);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create subject"
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Save topics ───────────────────────────────────────────────────
  const submitStep2 = async () => {
    if (!subjectId) return;
    const valid = topics.every((t) => t.title.trim().length > 0);
    if (!valid) {
      setError("All topic titles must be filled in");
      return;
    }
    setSaving(true);
    setError("");
    try {
      for (const topic of topics) {
        await api.post(`/subjects/${subjectId}/topics`, topic);
      }
      setStep(2);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to save topics"
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Step 3: Set daily hours + complete onboarding ─────────────────────────
  const submitStep3 = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch("/auth/me", {
        dailyStudyHours: dailyHours,
        onboardingComplete: true,
      });
      updateUser({ dailyStudyHours: dailyHours, onboardingComplete: true });
      navigate("/");
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const addTopic = () =>
    setTopics((prev) => [
      ...prev,
      { title: "", confidenceScore: 3, estimatedMinutes: 30 },
    ]);

  const removeTopic = (i: number) =>
    setTopics((prev) => prev.filter((_, idx) => idx !== i));

  const updateTopic = (i: number, field: string, value: string | number) =>
    setTopics((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t))
    );

  return (
    <div className="min-h-screen bg-fog flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-body font-semibold transition-colors ${
                  i < step
                    ? "bg-confidence text-white"
                    : i === step
                    ? "bg-lamp text-ink"
                    : "bg-ink/10 text-ink-60"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs font-body hidden sm:block ${
                  i === step ? "text-ink font-medium" : "text-ink-60"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-px ${i < step ? "bg-confidence" : "bg-ink/15"}`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-ink/8">
          {/* ── Step 1 ────────────────────────────────────────────────────── */}
          {step === 0 && (
            <form onSubmit={hs1(submitStep1)} noValidate className="space-y-5">
              <div>
                <h2 className="font-display text-2xl text-ink font-semibold">
                  Add your first subject
                </h2>
                <p className="font-body text-sm text-ink-60 mt-1">
                  You can add more subjects after onboarding.
                </p>
              </div>

              <div>
                <label className="block font-body text-sm text-ink mb-1">
                  Subject name
                </label>
                <input
                  {...r1("subjectName")}
                  placeholder="e.g. Database Management Systems"
                  className="w-full px-3 py-2.5 rounded-lg border border-ink/15 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
                />
                {e1.subjectName && (
                  <p className="mt-1 text-xs text-deadline">{e1.subjectName.message}</p>
                )}
              </div>

              <div>
                <label className="block font-body text-sm text-ink mb-1">
                  Exam date
                </label>
                <input
                  type="date"
                  {...r1("examDate")}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 rounded-lg border border-ink/15 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
                />
                {e1.examDate && (
                  <p className="mt-1 text-xs text-deadline">{e1.examDate.message}</p>
                )}
              </div>

              {error && <p className="text-xs text-deadline">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Next — add topics"}
              </button>
            </form>
          )}

          {/* ── Step 2 ────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl text-ink font-semibold">
                  Add topics
                </h2>
                <p className="font-body text-sm text-ink-60 mt-1">
                  Rate your confidence for each topic — this drives the plan.
                </p>
              </div>

              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {topics.map((topic, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl border border-ink/10 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={topic.title}
                        onChange={(e) => updateTopic(i, "title", e.target.value)}
                        placeholder={`Topic ${i + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-ink/15 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
                      />
                      {topics.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTopic(i)}
                          className="text-ink-60 hover:text-deadline text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-xs font-body text-ink-60 mb-1">
                          Confidence
                        </p>
                        <ConfidenceRating
                          value={topic.confidenceScore}
                          onChange={(v) => updateTopic(i, "confidenceScore", v)}
                          size={16}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-body text-ink-60 block mb-1">
                          Est. minutes
                        </label>
                        <input
                          type="number"
                          min={5}
                          value={topic.estimatedMinutes}
                          onChange={(e) =>
                            updateTopic(i, "estimatedMinutes", Number(e.target.value))
                          }
                          className="w-20 px-2 py-1 rounded-lg border border-ink/15 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addTopic}
                className="text-lamp font-body text-sm font-medium hover:underline"
              >
                + Add another topic
              </button>

              {error && <p className="text-xs text-deadline">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 py-2.5 rounded-lg border border-ink/15 font-body text-sm text-ink-60"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submitStep2}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Next — set schedule"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl text-ink font-semibold">
                  How much can you study per day?
                </h2>
                <p className="font-body text-sm text-ink-60 mt-1">
                  Be realistic — you can change this anytime in Settings.
                </p>
              </div>

              <div className="text-center">
                <span className="font-mono text-5xl font-medium text-ink">
                  {dailyHours}
                </span>
                <span className="font-body text-lg text-ink-60 ml-2">
                  hour{dailyHours !== 1 ? "s" : ""} / day
                </span>
              </div>

              <input
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(Number(e.target.value))}
                className="w-full accent-lamp"
              />
              <div className="flex justify-between text-xs font-body text-ink-60">
                <span>30 min</span>
                <span>8 hours</span>
              </div>

              {error && <p className="text-xs text-deadline">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-lg border border-ink/15 font-body text-sm text-ink-60"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submitStep3}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
                >
                  {saving ? "Setting up…" : "Generate my first plan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
