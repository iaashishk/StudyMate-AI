import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, Zap, Flame, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import FocusRing from "../components/FocusRing";
import TaskItem from "../components/TaskItem";
import EmptyState from "../components/EmptyState";
import type { PlanEntry, DashboardSummary } from "../types";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [todayEntries, setTodayEntries] = useState<PlanEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, todayRes] = await Promise.all([
        api.get("/dashboard/summary"),
        api.get("/plan/today"),
      ]);
      setSummary(summaryRes.data.data);
      setTodayEntries(todayRes.data.data.entries);
    } catch {
      setError("Failed to load dashboard. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGeneratePlan = async () => {
    setGenerating(true);
    setError("");
    try {
      await api.post("/plan/generate", {});
      await fetchData();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to generate plan"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleEntryUpdate = (entryId: string, status: PlanEntry["status"]) => {
    setTodayEntries((prev) =>
      prev.map((e) => (e._id === entryId ? { ...e, status } : e))
    );
    api.get("/dashboard/summary").then((res) => setSummary(res.data.data));
  };

  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Good morning"
      : today.getHours() < 17
      ? "Good afternoon"
      : "Good evening";

  const dateStr = today.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="bg-ink px-6 pt-8 pb-12 md:px-10 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-32 mb-3" />
          <div className="h-8 bg-white/10 rounded w-60 mb-10" />
          <div className="flex justify-center"><div className="w-40 h-40 rounded-full bg-white/5" /></div>
        </div>
        <div className="px-6 md:px-10 pt-6 max-w-2xl space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 bg-ink/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const todayDone = todayEntries.filter((e) => e.status === "done").length;
  const todayPct =
    todayEntries.length > 0
      ? Math.round((todayDone / todayEntries.length) * 100)
      : 0;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* ── Hero section ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-ink px-6 pt-8 pb-12 md:px-10 relative overflow-hidden"
      >
        {/* Decorative gradient glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-lamp/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Date + greeting */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="font-body text-xs text-white/40 uppercase tracking-widest mb-1">
                {dateStr}
              </p>
              <h1 className="font-display text-3xl md:text-4xl text-fog font-semibold">
                {greeting}, {user?.name?.split(" ")[0]}
              </h1>
            </div>

            {/* Streak badge */}
            {summary && summary.streak > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="flex items-center gap-1.5 bg-lamp/15 border border-lamp/25 px-3 py-1.5 rounded-full"
              >
                <Flame size={14} className="text-lamp" />
                <span className="font-mono text-sm text-lamp font-medium">
                  {summary.streak}
                </span>
                <span className="font-body text-[10px] text-lamp/70">day streak</span>
              </motion.div>
            )}
          </div>

          {/* Focus Ring + stats */}
          <div className="flex flex-col items-center">
            <FocusRing pct={todayPct} size={160} />
            <p className="font-body text-sm text-white/50 mt-4">
              <span className="font-mono text-fog font-medium">{todayDone}</span>
              {" "}of{" "}
              <span className="font-mono text-fog font-medium">{todayEntries.length}</span>
              {" "}tasks done today
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Quick stats bar ────────────────────────────────────────────── */}
      {summary && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="px-6 md:px-10 -mt-5 max-w-2xl"
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Overall", value: `${summary.completionPct}%`, color: "text-confidence" },
              { label: "Today", value: `${todayDone}/${todayEntries.length}`, color: "text-lamp" },
              { label: "Subjects", value: summary.subjectStats.length, color: "text-ink" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-ink/8 p-3 text-center shadow-sm">
                <p className="font-body text-[10px] text-ink-60 uppercase tracking-wider">{label}</p>
                <p className={`font-mono text-xl font-medium ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Task list ──────────────────────────────────────────────────── */}
      <div className="px-6 md:px-10 pt-8 max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl text-ink font-semibold">
            Today's focus
          </h2>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-body font-medium text-lamp hover:text-lamp/80 transition-colors disabled:opacity-60"
          >
            <Zap size={13} />
            {generating ? "Generating…" : "Regenerate"}
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-deadline/10 border border-deadline/20">
            <p className="text-xs text-deadline font-body">{error}</p>
          </div>
        )}

        {todayEntries.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            message="Nothing scheduled for today"
            subMessage="Generate a study plan to see today's tasks here."
            action={
              <button
                onClick={handleGeneratePlan}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60 hover:bg-lamp/90 active:scale-[0.98] transition-all"
              >
                <Sparkles size={15} />
                {generating ? "Generating…" : "Generate study plan"}
              </button>
            }
          />
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {todayEntries.map((entry) => (
              <motion.div
                key={entry._id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <TaskItem entry={entry} onUpdate={handleEntryUpdate} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Subject summary chips */}
        {summary && summary.subjectStats.length > 0 && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="mt-10"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-body text-xs text-ink-60 uppercase tracking-widest">
                Subjects
              </h3>
              <Link to="/subjects" className="text-xs font-body text-lamp hover:underline flex items-center gap-0.5">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.subjectStats.map((s) => {
                const urgentColor = s.daysUntilExam <= 3 ? "#B14B3A" : s.daysUntilExam <= 7 ? "#E8A23C" : s.color;
                return (
                  <Link
                    key={s.subjectId}
                    to={`/subjects/${s.subjectId}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-ink/8 hover:border-ink/15 transition-colors group"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="font-body text-xs text-ink group-hover:text-ink/80">{s.name}</span>
                    <span
                      className="font-mono text-xs font-medium"
                      style={{ color: urgentColor }}
                    >
                      {s.daysUntilExam}d
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
