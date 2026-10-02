import { useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Edit2,
  Archive,
  Trash2,
  Sparkles,
} from "lucide-react";
import { AttendanceSubject, OverallStats } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";
import AddSubjectModal from "./AddSubjectModal";

interface SubjectsTabProps {
  onRefreshStats?: () => void;
}

export default function SubjectsTab({ onRefreshStats }: SubjectsTabProps) {
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [safetyMargin, setSafetyMargin] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [modalSubject, setModalSubject] = useState<AttendanceSubject | null | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedSubjects, setArchivedSubjects] = useState<AttendanceSubject[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const statsRes = await attendanceApi.getStats();
      setOverall(statsRes.overall);
      setSubjects(statsRes.subjects);
      setSafetyMargin(statsRes.safetyMargin);

      // Also fetch archived subjects if toggle is enabled
      const allSubjs = await attendanceApi.getSubjects(true);
      const archived = allSubjs.filter((s) => Boolean(s.archivedAt));
      setArchivedSubjects(archived);

      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("Failed to load subjects", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    const confirmDelete = window.confirm(
      `Do you want to archive "${name}"?\n(If you want to delete permanently and erase all records, choose Cancel then use permanent delete)`
    );
    if (confirmDelete) {
      try {
        await attendanceApi.deleteSubject(id, false);
        await loadData();
      } catch (err) {
        console.error("Archive failed", err);
      }
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    const really = window.confirm(
      `WARNING: Permanently delete "${name}" and all associated attendance entries? This cannot be undone.`
    );
    if (really) {
      try {
        await attendanceApi.deleteSubject(id, true);
        await loadData();
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  };

  const handleRestore = async (subj: AttendanceSubject) => {
    try {
      await attendanceApi.updateSubject(subj._id, { archivedAt: null });
      await loadData();
    } catch (err) {
      console.error("Restore failed", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Header Summary Card (FR-C1, FR-K3) */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-[#141414] to-[#1C1C1E] border border-white/[0.08] shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-[#0A84FF]/10 to-transparent pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30">
                OVERALL METRICS
              </span>
              {safetyMargin > 0 && (
                <span className="text-xs font-mono text-amber-400">
                  +{safetyMargin}% safety margin active
                </span>
              )}
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight flex items-baseline gap-2">
              {overall?.overallPercentage.toFixed(1) || "0.0"}%
              <span className="text-xs text-[#8E8E93] font-normal">Attendance across all subjects</span>
            </h2>
            <p className="text-xs text-white/70">
              {overall?.totalAttended || 0} attended out of {overall?.totalConducted || 0} conducted sessions
            </p>
          </div>

          {/* Quick Metrics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
            {/* Overall Safe Bunk Budget (FR-K3) */}
            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] text-left">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold mb-1">
                <Sparkles size={14} />
                <span>Bunk Budget</span>
              </div>
              <p className="text-xl font-extrabold text-white">
                {overall?.overallBunkBudget || 0}
              </p>
              <p className="text-[10px] text-[#8E8E93]">Safe skips left total</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] text-left">
              <div className="flex items-center gap-1.5 text-[#0A84FF] text-xs font-bold mb-1">
                <BookOpen size={14} />
                <span>Active Subjects</span>
              </div>
              <p className="text-xl font-extrabold text-white">{subjects.length}</p>
              <p className="text-[10px] text-[#8E8E93]">Tracked courses</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.07] text-left col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-1">
                <Flame size={14} />
                <span>Status</span>
              </div>
              <p className="text-base font-bold text-white">
                {overall && overall.overallPercentage >= 75 ? "On Track 🟢" : "Needs Work 🔴"}
              </p>
              <p className="text-[10px] text-[#8E8E93]">Target 75%+</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Your Subjects</h3>
          <p className="text-xs text-[#8E8E93]">
            Percentages, safe bunk limits, and recovery targets
          </p>
        </div>
        <button
          onClick={() => setModalSubject(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/20 cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Subject</span>
        </button>
      </div>

      {/* Subjects Grid */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#8E8E93]">Loading subjects and calculating stats...</p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 flex items-center justify-center text-[#8E8E93]">
            <BookOpen size={28} />
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h4 className="text-base font-semibold text-white">No subjects added yet</h4>
            <p className="text-xs text-[#8E8E93]">
              Add your university subjects and minimum attendance criteria to start tracking.
            </p>
          </div>
          <button
            onClick={() => setModalSubject(null)}
            className="px-5 py-2.5 rounded-2xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-semibold cursor-pointer"
          >
            Add First Subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subj) => {
            const stats = subj.stats;
            const pct = stats?.percentage ?? 0;
            const status = stats?.status ?? "edge";
            const min = subj.minPercent || 75;

            // Bunk status chip colors (FR-K1)
            const statusBadgeConfig = {
              safe: {
                bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
                icon: ShieldCheck,
                label: "SAFE",
              },
              edge: {
                bg: "bg-amber-500/15 border-amber-500/30 text-amber-400",
                icon: AlertTriangle,
                label: "ON THE EDGE",
              },
              danger: {
                bg: "bg-rose-500/15 border-rose-500/30 text-rose-400",
                icon: Flame,
                label: "DANGER",
              },
            }[status];

            const StatusIcon = statusBadgeConfig.icon;

            return (
              <div
                key={subj._id}
                className="relative p-5 rounded-3xl bg-[#141414] hover:bg-[#181818] border border-white/[0.08] transition-all flex flex-col justify-between gap-4 group"
              >
                {/* Accent top stripe */}
                <div
                  className="absolute top-0 left-6 right-6 h-1 rounded-b-full"
                  style={{ backgroundColor: subj.color }}
                />

                {/* Top: Name & Status Chip */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: subj.color }}
                        />
                        <h4 className="font-bold text-white text-base tracking-tight truncate max-w-[190px]">
                          {subj.name}
                        </h4>
                      </div>
                      {subj.code && (
                        <p className="text-[11px] font-mono text-[#8E8E93] pl-4.5">
                          {subj.code} {subj.teacher ? `• ${subj.teacher}` : ""}
                        </p>
                      )}
                    </div>

                    {/* Status Chip */}
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeConfig.bg}`}
                    >
                      <StatusIcon size={11} />
                      {statusBadgeConfig.label}
                    </span>
                  </div>

                  {/* Percentage & Progress bar */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black text-white font-mono">
                        {stats?.hasData ? `${pct.toFixed(1)}%` : "No data"}
                      </span>
                      <span className="text-xs text-[#8E8E93]">
                        {stats?.attended || 0} / {stats?.conducted || 0} classes
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          backgroundColor: subj.color,
                        }}
                      />
                      {/* Limit indicator line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow"
                        style={{ left: `${min}%` }}
                        title={`Limit: ${min}%`}
                      />
                    </div>
                  </div>
                </div>

                {/* Smart Suggestion Message (FR-C2, FR-K1) */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-xs space-y-1">
                  <p className="font-semibold text-white/90">{stats?.message}</p>
                  <p className="text-[10px] text-[#8E8E93]">
                    Requirement: {min}% limit
                    {subj.openingConducted > 0 &&
                      ` (Opening: ${subj.openingAttended}/${subj.openingConducted})`}
                  </p>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                  <button
                    onClick={() => setModalSubject(subj)}
                    className="flex items-center gap-1.5 text-xs text-[#8E8E93] hover:text-white transition-colors cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(subj._id, subj.name)}
                      className="p-1.5 rounded-lg text-[#8E8E93] hover:text-amber-400 hover:bg-white/5 transition-colors cursor-pointer"
                      title="Archive subject"
                    >
                      <Archive size={14} />
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(subj._id, subj.name)}
                      className="p-1.5 rounded-lg text-[#8E8E93] hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                      title="Permanently delete subject"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived Subjects Section (FR-S4) */}
      {archivedSubjects.length > 0 && (
        <div className="pt-6 border-t border-white/[0.08]">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-xs font-semibold text-[#8E8E93] hover:text-white transition-colors cursor-pointer"
          >
            <Archive size={14} />
            <span>
              {showArchived ? "Hide" : "Show"} {archivedSubjects.length} Archived Subject{archivedSubjects.length > 1 ? "s" : ""}
            </span>
          </button>

          {showArchived && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              {archivedSubjects.map((s) => (
                <div
                  key={s._id}
                  className="p-4 rounded-2xl bg-[#121212] border border-white/5 opacity-75 hover:opacity-100 flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <h5 className="font-bold text-white text-sm">{s.name}</h5>
                    <p className="text-[11px] text-[#8E8E93]">Archived</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(s)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium cursor-pointer"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(s._id, s.name)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalSubject !== undefined && (
        <AddSubjectModal
          subjectToEdit={modalSubject}
          onClose={() => setModalSubject(undefined)}
          onSaved={() => {
            setModalSubject(undefined);
            loadData();
          }}
        />
      )}
    </div>
  );
}
