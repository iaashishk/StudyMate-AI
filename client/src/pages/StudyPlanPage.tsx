import { useEffect, useState } from "react";
import { CalendarDays, Zap } from "lucide-react";
import api from "../lib/api";
import EmptyState from "../components/EmptyState";
import type { PlanEntry } from "../types";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-ink/10 bg-white",
  done: "border-confidence/20 bg-confidence/5",
  missed: "border-deadline/20 bg-deadline/5 opacity-60",
};

export default function StudyPlanPage() {
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const fetchPlan = async () => {
    try {
      const res = await api.get("/plan/week");
      setEntries(res.data.data.entries);
    } catch {
      setError("Failed to load study plan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, []);

  const generatePlan = async () => {
    setGenerating(true);
    setError("");
    try {
      await api.post("/plan/generate", {});
      await fetchPlan();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to generate plan"
      );
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (entryId: string, status: PlanEntry["status"]) => {
    setEntries((prev) =>
      prev.map((e) => (e._id === entryId ? { ...e, status } : e))
    );
    try {
      await api.patch(`/plan/entries/${entryId}`, { status });
      // Refresh to get rescheduled entries
      await fetchPlan();
    } catch {
      // revert optimistic update
      await fetchPlan();
    }
  };

  // Group entries by date
  const grouped = entries.reduce<Record<string, PlanEntry[]>>((acc, entry) => {
    const key = new Date(entry.date).toDateString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 py-8 max-w-2xl pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ink font-semibold">Study Plan</h1>
        <button
          onClick={generatePlan}
          disabled={generating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
        >
          <Zap size={14} />
          {generating ? "Generating…" : "Regenerate"}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-deadline/10 border border-deadline/20">
          <p className="text-xs text-deadline font-body">{error}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          message="No study plan generated yet"
          subMessage="Generate a plan to see your week-by-week schedule here."
          action={
            <button
              onClick={generatePlan}
              disabled={generating}
              className="px-5 py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate plan"}
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {dateKeys.map((dateKey) => {
            const date = new Date(dateKey);
            const isToday = date.toDateString() === new Date().toDateString();
            const dayEntries = grouped[dateKey];

            return (
              <div key={dateKey}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`px-2.5 py-1 rounded-lg font-body text-xs font-semibold ${
                      isToday
                        ? "bg-lamp text-ink"
                        : "bg-ink/8 text-ink-60"
                    }`}
                  >
                    {isToday
                      ? "Today"
                      : date.toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                  </div>
                  <div className="flex-1 h-px bg-ink/8" />
                  <span className="font-mono text-xs text-ink-60">
                    {dayEntries.reduce((s, e) => s + e.estimatedMinutes, 0)} min
                  </span>
                </div>

                {/* Day entries */}
                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        STATUS_STYLES[entry.status]
                      }`}
                    >
                      {/* Subject chip */}
                      <span
                        className="text-[11px] font-body font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          backgroundColor: entry.subjectColor + "22",
                          color: entry.subjectColor,
                        }}
                      >
                        {entry.subjectName}
                      </span>

                      {/* Topic */}
                      <span
                        className={`flex-1 font-body text-sm ${
                          entry.status === "done"
                            ? "line-through text-ink-60"
                            : entry.status === "missed"
                            ? "text-ink-60"
                            : "text-ink"
                        }`}
                      >
                        {entry.topicTitle}
                      </span>

                      {/* Time */}
                      <span className="font-mono text-xs text-ink-60 shrink-0">
                        {entry.estimatedMinutes}m
                      </span>

                      {/* Actions */}
                      {entry.status === "pending" && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => updateStatus(entry._id, "done")}
                            className="text-xs font-body text-confidence hover:underline"
                          >
                            Done
                          </button>
                          <span className="text-ink-60 text-xs">·</span>
                          <button
                            onClick={() => updateStatus(entry._id, "missed")}
                            className="text-xs font-body text-deadline hover:underline"
                          >
                            Missed
                          </button>
                        </div>
                      )}

                      {entry.status === "done" && (
                        <span className="text-confidence text-xs font-body shrink-0">
                          ✓
                        </span>
                      )}

                      {entry.status === "missed" && (
                        <span className="text-deadline text-xs font-body shrink-0">
                          Rescheduled
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

