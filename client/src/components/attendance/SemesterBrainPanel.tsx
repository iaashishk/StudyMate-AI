/**
 * SemesterBrainPanel.tsx
 * ───────────────────────────────────────────────────────────────
 * Smart cross-sync dashboard panel: semester + holidays + timetable
 * + attendance — all synchronized and analyzed in one place.
 * ───────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertCircle,
  Calendar,
  Clock,
  BookOpen,
  Palmtree,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  RefreshCw,
} from "lucide-react";
import { attendanceApi } from "../../lib/attendance-api";
import {
  computeAcademicBrain,
  type AcademicBrainResult,
  type SubjectProjection,
  type SyncConflict,
} from "../../lib/academic-brain";
import { SemesterInfo, HolidayItem, TimetableSlot, AttendanceSubject } from "../../types/attendance";

// ── helpers ──────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

function statusColor(s: SubjectProjection["status"]) {
  if (s === "safe") return "text-emerald-400";
  if (s === "edge") return "text-amber-400";
  if (s === "danger") return "text-orange-400";
  return "text-rose-400";
}

function statusBg(s: SubjectProjection["status"]) {
  if (s === "safe") return "bg-emerald-500/10 border-emerald-500/20";
  if (s === "edge") return "bg-amber-500/10 border-amber-500/20";
  if (s === "danger") return "bg-orange-500/10 border-orange-500/20";
  return "bg-rose-500/10 border-rose-500/20";
}

function StatusIcon({ s }: { s: SubjectProjection["status"] }) {
  if (s === "safe") return <TrendingUp size={12} className="text-emerald-400" />;
  if (s === "edge") return <Minus size={12} className="text-amber-400" />;
  if (s === "danger") return <TrendingDown size={12} className="text-orange-400" />;
  return <AlertCircle size={12} className="text-rose-400" />;
}

function ConflictRow({ c }: { c: SyncConflict }) {
  const icon =
    c.severity === "error" ? (
      <AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />
    ) : c.severity === "warning" ? (
      <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
    ) : (
      <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
    );

  const bg =
    c.severity === "error"
      ? "bg-rose-500/8 border-rose-500/15"
      : c.severity === "warning"
      ? "bg-amber-500/8 border-amber-500/15"
      : "bg-blue-500/6 border-blue-500/12";

  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-xl border text-[11px] ${bg}`}>
      {icon}
      <span className="text-white/70 leading-relaxed">{c.message}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────

interface SemesterBrainPanelProps {
  onNavigateTab?: (tab: string) => void;
}

export default function SemesterBrainPanel({ onNavigateTab }: SemesterBrainPanelProps) {
  const [brain, setBrain] = useState<AcademicBrainResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Section collapse states
  const [showConflicts, setShowConflicts] = useState(true);
  const [showSubjects, setShowSubjects] = useState(true);
  const [showNudges, setShowNudges] = useState(true);

  const loadBrain = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsData, statsData, ttData] = await Promise.all([
        attendanceApi.getSettings(),
        attendanceApi.getStats(),
        attendanceApi.getTimetable(),
      ]);

      const semester: SemesterInfo = settingsData.semester;
      const holidays: HolidayItem[] = settingsData.holidays;
      const slots: TimetableSlot[] = ttData.slots;

      // Merge stats into subjects
      const subjects: AttendanceSubject[] = statsData.subjects;

      const result = computeAcademicBrain({
        semester,
        holidays,
        slots,
        subjects,
        examDates: [],
      });

      setBrain(result);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Academic Brain load failed", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrain();
  }, [loadBrain]);

  if (isLoading) {
    return (
      <div className="p-8 rounded-3xl bg-[#141414] border border-white/[0.07] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#8E8E93]">Syncing academic data…</p>
      </div>
    );
  }

  if (!brain) return null;

  const {
    semesterStartDate,
    semesterEndDate,
    semesterName,
    totalWorkingDays,
    totalHolidayDays,
    daysElapsed,
    daysRemaining,
    semesterProgressPct,
    weeklySessionCount,
    projectedTotalSessions,
    subjectProjections,
    conflicts,
    upcomingExams,
    nextExamDaysAway,
    nudges,
    syncScore,
    isSynced,
  } = brain;

  const errorConflicts = conflicts.filter((c) => c.severity === "error");
  const warnConflicts = conflicts.filter((c) => c.severity === "warning");
  const infoConflicts = conflicts.filter((c) => c.severity === "info" && c.type !== "holiday_on_weekend");

  const visibleConflicts = [...errorConflicts, ...warnConflicts, ...infoConflicts];

  const syncColor =
    syncScore >= 80 ? "text-emerald-400" : syncScore >= 50 ? "text-amber-400" : "text-rose-400";
  const syncBg =
    syncScore >= 80
      ? "bg-emerald-500/10 border-emerald-500/20"
      : syncScore >= 50
      ? "bg-amber-500/10 border-amber-500/20"
      : "bg-rose-500/10 border-rose-500/20";

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-purple-950/50 via-[#141414] to-[#141414] border border-purple-500/20 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400">
              <Brain size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-white tracking-tight">
                  Academic Brain
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${syncBg} ${syncColor}`}
                >
                  {syncScore}% SYNCED
                </span>
                {!isSynced && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    SETUP NEEDED
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8E8E93] mt-0.5">
                Semester · Holidays · Timetable · Attendance — all cross-synced
              </p>
            </div>
          </div>

          <button
            onClick={loadBrain}
            title="Refresh sync"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Sync score bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#8E8E93]">Setup completeness</span>
            <span className={`font-mono font-bold ${syncColor}`}>{syncScore}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                syncScore >= 80
                  ? "bg-emerald-400"
                  : syncScore >= 50
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
              style={{ width: `${syncScore}%` }}
            />
          </div>
        </div>

        {/* Setup quick links */}
        {!isSynced && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {!semesterStartDate && (
              <button
                onClick={() => onNavigateTab?.("settings")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                <Calendar size={11} />
                Set Semester Dates
              </button>
            )}
            {weeklySessionCount === 0 && (
              <button
                onClick={() => onNavigateTab?.("timetable")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-300 hover:bg-blue-500/25 transition-colors cursor-pointer"
              >
                <CalendarDays size={11} />
                Setup Timetable
              </button>
            )}
            {totalHolidayDays === 0 && (
              <button
                onClick={() => onNavigateTab?.("holidays")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
              >
                <Palmtree size={11} />
                Add Holidays
              </button>
            )}
          </div>
        )}

        {/* Last refreshed */}
        <p className="text-[10px] text-white/25 text-right font-mono">
          Synced {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* ── Semester Timeline ────────────────────────────── */}
      {semesterStartDate && (
        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Calendar size={14} className="text-[#0A84FF]" />
            <span>Semester Timeline — {semesterName}</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#8E8E93]">
              <span>{fmtDate(semesterStartDate)}</span>
              <span className="font-mono text-white font-semibold">{semesterProgressPct}% done</span>
              <span>{semesterEndDate ? fmtDate(semesterEndDate) : "End not set"}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0A84FF] to-purple-400 transition-all duration-700"
                style={{ width: `${semesterProgressPct}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Working Days", value: totalWorkingDays, icon: <CalendarDays size={13} className="text-[#0A84FF]" /> },
              { label: "Days Elapsed", value: daysElapsed, icon: <Clock size={13} className="text-amber-400" /> },
              { label: "Days Left", value: daysRemaining, icon: <Zap size={13} className="text-emerald-400" /> },
              { label: "Holidays", value: totalHolidayDays, icon: <Palmtree size={13} className="text-purple-400" /> },
            ].map(({ label, value, icon }) => (
              <div
                key={label}
                className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-1 text-center"
              >
                <div className="flex justify-center">{icon}</div>
                <p className="text-lg font-black text-white">{value}</p>
                <p className="text-[10px] text-[#8E8E93]">{label}</p>
              </div>
            ))}
          </div>

          {/* Timetable density */}
          {weeklySessionCount > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs">
              <div className="flex items-center gap-2 text-[#8E8E93]">
                <BookOpen size={13} className="text-purple-400" />
                <span>Weekly sessions</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-black text-white">{weeklySessionCount}</span>
                <span className="text-white/20">•</span>
                <span className="text-[#8E8E93]">
                  <span className="font-bold text-white">{projectedTotalSessions}</span> remaining from today
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming Exams ───────────────────────────────── */}
      {upcomingExams.length > 0 && (
        <div className="p-4 rounded-3xl bg-rose-950/30 border border-rose-500/20 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
            <AlertTriangle size={14} />
            <span>Upcoming Exams / Deadlines (Next 14 Days)</span>
          </div>
          {upcomingExams.map((ex, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/8 border border-rose-500/15 text-xs"
            >
              <span className="text-white font-semibold">{ex.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-rose-300">{fmtDate(ex.date)}</span>
                {nextExamDaysAway === 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">TODAY</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                    {daysBetween(new Date(), new Date(ex.date))}d away
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Smart Nudges ─────────────────────────────────── */}
      {nudges.length > 0 && (
        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3">
          <button
            onClick={() => setShowNudges((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-white cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span>AI Nudges</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold border border-amber-500/20">
                {nudges.length}
              </span>
            </div>
            {showNudges ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
          </button>

          {showNudges && (
            <div className="space-y-2">
              {nudges.map((n, i) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-[11px] text-white/80 leading-relaxed"
                >
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Conflicts & Warnings ─────────────────────────── */}
      {visibleConflicts.length > 0 && (
        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3">
          <button
            onClick={() => setShowConflicts((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-white cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <span>Sync Conflicts & Warnings</span>
              {errorConflicts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-semibold border border-rose-500/20">
                  {errorConflicts.length} error{errorConflicts.length !== 1 ? "s" : ""}
                </span>
              )}
              {warnConflicts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold border border-amber-500/20">
                  {warnConflicts.length} warning{warnConflicts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {showConflicts ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
          </button>

          {showConflicts && (
            <div className="space-y-2">
              {visibleConflicts.map((c, i) => (
                <ConflictRow key={i} c={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Subject Projections ──────────────────────────── */}
      {subjectProjections.length > 0 && (
        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3">
          <button
            onClick={() => setShowSubjects((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-white cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-400" />
              <span>End-of-Semester Attendance Projections</span>
            </div>
            {showSubjects ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
          </button>

          {showSubjects && (
            <div className="space-y-2">
              {subjectProjections.map((proj) => (
                <div
                  key={proj.subjectId}
                  className={`p-3 rounded-2xl border ${statusBg(proj.status)} space-y-2`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: proj.color }}
                      />
                      <span className="text-xs font-bold text-white truncate">{proj.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusIcon s={proj.status} />
                      <span className={`text-xs font-black font-mono ${statusColor(proj.status)}`}>
                        {proj.projectedFinalPct}%
                      </span>
                      <span className="text-[10px] text-white/30">proj.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px] text-[#8E8E93]">
                    <div>
                      <span className="text-white font-bold">{proj.currentPct}%</span>
                      <span className="block">Current</span>
                    </div>
                    <div>
                      <span className="text-white font-bold">{proj.sessionsLeft}</span>
                      <span className="block">Sessions left</span>
                    </div>
                    <div>
                      {proj.status === "safe" || proj.status === "edge" ? (
                        <>
                          <span className="text-emerald-400 font-bold">{proj.maxSkippable}</span>
                          <span className="block">Can skip</span>
                        </>
                      ) : (
                        <>
                          <span className="text-rose-400 font-bold">{proj.mustAttend}</span>
                          <span className="block">Must attend</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mini progress bar: current vs target */}
                  <div className="space-y-0.5">
                    <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          proj.status === "safe"
                            ? "bg-emerald-400"
                            : proj.status === "edge"
                            ? "bg-amber-400"
                            : proj.status === "danger"
                            ? "bg-orange-400"
                            : "bg-rose-400"
                        }`}
                        style={{ width: `${Math.min(proj.projectedFinalPct, 100)}%` }}
                      />
                    </div>
                    <div
                      className="w-px h-2 bg-white/40 absolute"
                      style={{ left: `${proj.target}%`, marginTop: "-6px", position: "relative" }}
                    />
                  </div>

                  {proj.status === "critical" && (
                    <p className="text-[10px] text-rose-300 font-semibold">
                      ⚠️ Even with 100% attendance, projected final is below {proj.target}% target.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── All-synced state ─────────────────────────────── */}
      {isSynced && conflicts.filter((c) => c.severity !== "info").length === 0 && nudges.every((n) => n.startsWith("✅")) && (
        <div className="p-4 rounded-3xl bg-emerald-950/30 border border-emerald-500/20 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-white">Academic data fully synced ✓</p>
            <p className="text-[10px] text-emerald-300/70">
              Semester, holidays, timetable and attendance are all cross-linked.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// tiny helper used inside JSX
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
