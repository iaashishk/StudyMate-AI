import { useState, useEffect, useRef, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Plus,
  Palmtree,
  CheckCheck,
  AlertCircle,
  Clock,
  MapPin,
  Sparkles,
  RotateCcw,
  FlaskConical,
  BookOpen,
  GraduationCap,
  Keyboard,
} from "lucide-react";
import { DaySessionsResponse, AttendanceSession, AttendanceStatus } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";
import { todayLocalCivil, addDaysCivil } from "../../lib/civil-date";
import ExtraSessionModal from "./ExtraSessionModal";

interface TodayTabProps {
  onNavigateTab: (tab: string) => void;
  pendingCount: number;
}

export default function TodayTab({ onNavigateTab, pendingCount }: TodayTabProps) {
  const [currentDate, setCurrentDate] = useState<string>(todayLocalCivil());
  const [data, setData] = useState<DaySessionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);

  // Undo Stack state (FR-A9: Undo toast after a mark)
  const [lastAction, setLastAction] = useState<{
    sessionIndex: number;
    previousStatus: AttendanceStatus | null;
    session: AttendanceSession;
    subjectName: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [holidayLabel, setHolidayLabel] = useState("");

  const showUndoToast = (
    msg: string,
    actionPayload?: {
      sessionIndex: number;
      previousStatus: AttendanceStatus | null;
      session: AttendanceSession;
      subjectName: string;
    }
  ) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    if (actionPayload) setLastAction(actionPayload);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      setLastAction(null);
    }, 4500);
  };

  const loadDay = useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.getDaySessions(date);
      setData(res);
    } catch (err) {
      console.error("Failed to load day attendance", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(currentDate);
  }, [currentDate, loadDay]);

  const changeDateBy = (offset: number) => {
    setCurrentDate(addDaysCivil(currentDate, offset));
  };

  // Instant 0ms Optimistic Marking
  const handleMark = async (
    sessionIndex: number,
    status: AttendanceStatus
  ) => {
    if (!data) return;
    const session = data.sessions[sessionIndex];
    if (!session || !session.subjectId) return;

    const previousStatus = session.status;
    const subjectName = session.subject?.name || "Session";

    // 1. Optimistic Update (Immediate UI reaction)
    const updatedSessions = [...data.sessions];
    updatedSessions[sessionIndex] = {
      ...session,
      status,
    };
    setData({
      ...data,
      sessions: updatedSessions,
      allMarked: updatedSessions.every((s) => s.status !== null),
    });

    const statusLabel =
      status === "present" ? "Present" : status === "absent" ? "Bunked" : "Cancelled";
    showUndoToast(`Marked ${subjectName} as ${statusLabel}`, {
      sessionIndex,
      previousStatus,
      session,
      subjectName,
    });

    // 2. Background Sync
    try {
      await attendanceApi.markAttendance({
        date: currentDate,
        slotId: session.slotId,
        subjectId: session.subjectId,
        status,
      });
    } catch (err) {
      console.error("Mark failed, rolling back", err);
      // Revert optimistic update on error
      const reverted = [...data.sessions];
      reverted[sessionIndex] = { ...session, status: previousStatus };
      setData({ ...data, sessions: reverted });
      showUndoToast("Failed to save mark. Changes reverted.");
    }
  };

  // Batch Mark Multi-Hour Block (e.g. 4-hour lab or 2-hour class)
  const handleMarkBlock = async (indices: number[], status: AttendanceStatus) => {
    if (!data) return;
    const targetSessions = indices
      .map((i) => ({ index: i, session: data.sessions[i] }))
      .filter((s) => s.session && s.session.subjectId);
    if (targetSessions.length === 0) return;

    const subjectName = targetSessions[0].session.subject?.name || "Block";

    // 1. Optimistic Update
    const updatedSessions = [...data.sessions];
    for (const { index, session } of targetSessions) {
      updatedSessions[index] = { ...session, status };
    }
    setData({
      ...data,
      sessions: updatedSessions,
      allMarked: updatedSessions.every((s) => s.status !== null),
    });

    const statusLabel =
      status === "present" ? "Present" : status === "absent" ? "Bunked" : "Cancelled";
    showUndoToast(
      `Marked all ${targetSessions.length} periods of ${subjectName} as ${statusLabel}`
    );

    // 2. Background Sync
    try {
      await Promise.all(
        targetSessions.map(({ session }) =>
          attendanceApi.markAttendance({
            date: currentDate,
            slotId: session.slotId,
            subjectId: session.subjectId!,
            status,
          })
        )
      );
    } catch (err) {
      console.error("Batch mark failed, rolling back", err);
      loadDay(currentDate);
      showUndoToast("Failed to save block marks. Reverting...");
    }
  };

  // 1-Click Undo Handler
  const handleUndo = async () => {
    if (!lastAction || !data) return;
    const { sessionIndex, previousStatus, session, subjectName } = lastAction;

    const updatedSessions = [...data.sessions];
    updatedSessions[sessionIndex] = {
      ...session,
      status: previousStatus,
    };
    setData({
      ...data,
      sessions: updatedSessions,
      allMarked: updatedSessions.every((s) => s.status !== null),
    });

    setToastMessage(null);
    setLastAction(null);

    try {
      if (previousStatus) {
        await attendanceApi.markAttendance({
          date: currentDate,
          slotId: session.slotId,
          subjectId: session.subjectId!,
          status: previousStatus,
        });
      } else if (session.entryId) {
        await attendanceApi.deleteEntry(session.entryId);
      }
      showUndoToast(`Reverted ${subjectName} to ${previousStatus || "Unmarked"}`);
    } catch (err) {
      console.error("Undo failed", err);
    }
  };

  // Bulk Mark All Present
  const handleBulkPresent = async () => {
    setActionLoading(true);
    try {
      const res = await attendanceApi.bulkMarkDayPresent(currentDate);
      showUndoToast(`All ${res.count} sessions marked Present!`);
      await loadDay(currentDate);
    } catch (err) {
      console.error("Bulk present failed", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Holiday Dialog
  const handleHoliday = () => {
    setHolidayLabel("");
    setHolidayDialogOpen(true);
  };

  // Confirm Holiday: mark day + auto-cancel all sessions
  const handleConfirmHoliday = async () => {
    const label = holidayLabel.trim() || "Academic Holiday";
    setHolidayDialogOpen(false);
    setActionLoading(true);
    try {
      // 1. Mark the day as a holiday in the calendar
      await attendanceApi.markDayHoliday(currentDate, label);

      // 2. Auto-cancel all scheduled sessions for this day (holiday sync)
      if (data && data.sessions.length > 0) {
        const cancellable = data.sessions.filter(
          (s) => s.subjectId && s.status !== "cancelled"
        );
        await Promise.all(
          cancellable.map((s) =>
            attendanceApi.markAttendance({
              date: currentDate,
              slotId: s.slotId,
              subjectId: s.subjectId!,
              status: "cancelled",
              notes: `Holiday: ${label}`,
            })
          )
        );
        showUndoToast(
          `"${label}" set — ${cancellable.length} class${cancellable.length !== 1 ? "es" : ""} auto-cancelled ✓`
        );
      } else {
        showUndoToast(`Marked ${currentDate} as "${label}"`);
      }

      await loadDay(currentDate);
    } catch (err) {
      console.error("Holiday mark failed", err);
      showUndoToast("Failed to mark holiday.");
    } finally {
      setActionLoading(false);
    }
  };

  // Global Keyboard Shortcuts (P = Present, B/A = Bunk/Absent, C = Cancelled on first unmarked session)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === "ArrowLeft") {
        changeDateBy(-1);
      } else if (e.key === "ArrowRight") {
        changeDateBy(1);
      } else if (data && data.sessions.length > 0) {
        // Find first unmarked session or first session
        const targetIdx = data.sessions.findIndex((s) => s.status === null);
        const idx = targetIdx >= 0 ? targetIdx : 0;

        if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          handleMark(idx, "present");
        } else if (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "a") {
          e.preventDefault();
          handleMark(idx, "absent");
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          handleMark(idx, "cancelled");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data, currentDate]);

  const isToday = currentDate === todayLocalCivil();
  const dayName = new Date(
    Number(currentDate.split("-")[0]),
    Number(currentDate.split("-")[1]) - 1,
    Number(currentDate.split("-")[2])
  ).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  // Day Statistics Summary
  const presentCount = data?.sessions.filter((s) => s.status === "present").length || 0;
  const absentCount = data?.sessions.filter((s) => s.status === "absent").length || 0;
  const cancelledCount = data?.sessions.filter((s) => s.status === "cancelled").length || 0;
  const pendingClasses = data?.sessions.filter((s) => s.status === null).length || 0;
  const totalClasses = data?.sessions.length || 0;

  return (
    <div className="space-y-6">
      {/* ── Undo Toast Floating Alert (FR-A9) ──────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1C1C1E] border border-white/15 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3.5 text-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Sparkles size={17} className="text-[#0A84FF] shrink-0" />
          <span className="font-medium text-xs sm:text-sm">{toastMessage}</span>
          {lastAction && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[#0A84FF] hover:text-white text-xs font-bold transition-all border border-white/10 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Undo</span>
            </button>
          )}
        </div>
      )}

      {/* ── Pending Days Notification Banner ───────────────────────────────── */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={20} className="shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-sm">
                {pendingCount} past day{pendingCount > 1 ? "s" : ""} pending attendance
              </p>
              <p className="text-xs text-amber-200/80">
                Mark your past days to keep your calculated percentages 100% accurate.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab("backfill")}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Review &amp; Fill Now
          </button>
        </div>
      )}

      {/* ── Date Navigator & Fast Controls ─────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Date Selector */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
            <button
              onClick={() => changeDateBy(-1)}
              className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Previous Day (Arrow Left)"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-3 text-center px-1">
              <CalendarIcon size={20} className="text-[#0A84FF]" />
              <div>
                <div className="flex items-center gap-2 justify-center">
                  <span className="font-bold text-white text-base sm:text-lg tracking-tight">
                    {dayName}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30">
                      TODAY
                    </span>
                  )}
                  {data?.isHoliday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      HOLIDAY: {data.holiday?.label}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E93] font-mono">{currentDate}</p>
              </div>
            </div>

            <button
              onClick={() => changeDateBy(1)}
              className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Next Day (Arrow Right)"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Quick Date Switcher & Fast Actions */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            {!isToday && (
              <button
                onClick={() => setCurrentDate(todayLocalCivil())}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Go to Today
              </button>
            )}

            <input
              type="date"
              value={currentDate}
              onChange={(e) => e.target.value && setCurrentDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
            />

            <button
              onClick={handleBulkPresent}
              disabled={actionLoading || totalClasses === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0A84FF]/15 hover:bg-[#0A84FF]/25 border border-[#0A84FF]/30 text-[#0A84FF] text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
              title="Mark all today's sessions as Present"
            >
              <CheckCheck size={15} />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={handleHoliday}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-colors cursor-pointer"
              title="Mark date as holiday or off-day"
            >
              <Palmtree size={14} className="text-amber-400" />
              <span>Holiday</span>
            </button>

            <button
              onClick={() => setIsExtraModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors cursor-pointer"
              title="Add an extra session or surprise test"
            >
              <Plus size={14} />
              <span>Extra Class</span>
            </button>
          </div>
        </div>

        {/* ── Day Summary Progress Strip ─────────────────────────────────────── */}
        {totalClasses > 0 && (
          <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[#8E8E93]">
                {totalClasses} Classes Scheduled:
              </span>
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <CheckCircle2 size={13} /> {presentCount} Present
              </span>
              <span className="flex items-center gap-1 font-semibold text-rose-400">
                <XCircle size={13} /> {absentCount} Bunked
              </span>
              {cancelledCount > 0 && (
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Ban size={13} /> {cancelledCount} Cancelled
                </span>
              )}
              {pendingClasses > 0 && (
                <span className="font-semibold text-white/60">
                  • {pendingClasses} Pending
                </span>
              )}
            </div>

            {/* Keyboard shortcut hint badge */}
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-[#8E8E93] bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/5">
              <Keyboard size={12} className="text-white/60" />
              <span>Shortcuts: Press <b>P</b> for Present, <b>B</b> for Bunk, <b>C</b> for Cancelled</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Sessions List / Daily Schedule ─────────────────────────────────── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#8E8E93]">Loading today's schedule...</p>
        </div>
      ) : totalClasses === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-white/5 flex items-center justify-center text-[#8E8E93]">
            <CalendarIcon size={30} />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">No classes on {dayName}</h3>
            <p className="text-xs text-[#8E8E93]">
              No lectures or labs are scheduled in your timetable for this day. You can add an
              extra lecture, mark as holiday, or adjust your timetable.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setIsExtraModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold cursor-pointer"
            >
              Add Extra Session
            </button>
            <button
              onClick={() => onNavigateTab("timetable")}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-medium cursor-pointer"
            >
              Configure Timetable
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {(() => {
            const getBlockInfo = (idx: number) => {
              if (!data?.sessions) return null;
              const curr = data.sessions[idx];
              if (!curr || !curr.subjectId) return null;

              let start = idx;
              while (
                start > 0 &&
                data.sessions[start - 1]?.subjectId === curr.subjectId &&
                data.sessions[start - 1]?.slotType === curr.slotType
              ) {
                start--;
              }

              let end = idx;
              while (
                end < data.sessions.length - 1 &&
                data.sessions[end + 1]?.subjectId === curr.subjectId &&
                data.sessions[end + 1]?.slotType === curr.slotType
              ) {
                end++;
              }

              const span = end - start + 1;
              if (span <= 1) return null;

              return {
                start,
                end,
                span,
                isFirst: idx === start,
                positionInBlock: idx - start + 1,
                indices: Array.from({ length: span }, (_, i) => start + i),
                startTime: data.sessions[start].startTime,
                endTime: data.sessions[end].endTime,
              };
            };

            return data?.sessions.map((session, index) => {
              const isPresent = session.status === "present";
              const isAbsent = session.status === "absent";
              const isCancelled = session.status === "cancelled";
              const subjColor = session.subject?.color || "#0A84FF";
              const blockInfo = getBlockInfo(index);

              const sessionDurationHours = (() => {
                if (!session.startTime || !session.endTime) return 1;
                const [sh, sm] = session.startTime.split(":").map(Number);
                const [eh, em] = session.endTime.split(":").map(Number);
                const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
                return Math.max(1, Math.round(diff / 60));
              })();

              const slotType = session.slotType || "lecture";
            const slotTypeConfig = {
              lab: {
                label: "LAB / PRACTICAL",
                icon: FlaskConical,
                badge: "bg-purple-500/15 text-purple-300 border-purple-500/25",
              },
              tutorial: {
                label: "TUTORIAL",
                icon: GraduationCap,
                badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
              },
              lecture: {
                label: "LECTURE",
                icon: BookOpen,
                badge: "bg-white/5 text-[#8E8E93] border-white/10",
              },
            }[slotType] || {
              label: "LECTURE",
              icon: BookOpen,
              badge: "bg-white/5 text-[#8E8E93] border-white/10",
            };

            const SlotIcon = slotTypeConfig.icon;

            return (
              <div key={session.slotId || session.entryId || index} className="space-y-2">
                {blockInfo && blockInfo.isFirst && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-purple-950/20 border border-purple-500/30 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                      <span className="font-extrabold text-white">
                        {blockInfo.span}-Hour {slotType === "lab" ? "Lab Practical" : "Class"} Block
                      </span>
                      <span className="text-purple-300/80 font-mono text-[11px]">
                        ({blockInfo.startTime} – {blockInfo.endTime} · {blockInfo.span} Periods)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleMarkBlock(blockInfo.indices, "present")}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                        title={`Mark all ${blockInfo.span} periods Present in 1 click`}
                      >
                        <CheckCircle2 size={13} />
                        <span>Mark All {blockInfo.span}h Present</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkBlock(blockInfo.indices, "absent")}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                        title={`Mark all ${blockInfo.span} periods Bunked in 1 click`}
                      >
                        <XCircle size={13} />
                        <span>Bunk All {blockInfo.span}h</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="group relative p-4 sm:p-5 rounded-3xl bg-[#141414] hover:bg-[#181818] border border-white/[0.08] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                  {/* Subject color accent bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 rounded-l-3xl"
                    style={{ backgroundColor: subjColor }}
                  />

                  {/* Session Meta */}
                  <div className="space-y-2 pl-2 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: subjColor }}
                      />
                      <h4 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                        {session.subject?.name || "Free Slot"}
                      </h4>
                      {session.subject?.code && (
                        <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                          {session.subject.code}
                        </span>
                      )}

                      {/* Lecture vs Lab Chip */}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${slotTypeConfig.badge}`}
                      >
                        <SlotIcon size={11} />
                        {slotTypeConfig.label}
                        {sessionDurationHours > 1 ? ` · ${sessionDurationHours} HRS` : ""}
                      </span>

                      {blockInfo && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
                          Period {blockInfo.positionInBlock} of {blockInfo.span}
                        </span>
                      )}

                      {session.source === "extra" && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          EXTRA CLASS
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#8E8E93] flex-wrap">
                      <span className="flex items-center gap-1 font-mono text-white/90">
                        <Clock size={13} className="text-[#0A84FF]" />
                        {session.startTime} – {session.endTime}
                      </span>
                      {session.room && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} className="text-white/60" />
                          {session.room}
                        </span>
                      )}
                      {session.subject?.teacher && (
                        <span>Faculty: {session.subject.teacher}</span>
                      )}
                    </div>

                    {/* "Can I Bunk?" Live Live Smart Indicator (FR-K2) */}
                    {session.bunkBadge && (
                      <div className="pt-0.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-xl border font-semibold ${
                            session.bunkBadge.canBunk
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                              : "bg-rose-500/15 border-rose-500/30 text-rose-300 font-bold"
                          }`}
                        >
                          <Sparkles size={13} />
                          {session.bunkBadge.text}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── 1-Tap Tactile Marking Buttons ───────────────────────────── */}
                  <div className="flex items-center gap-2 pl-2 md:pl-0 shrink-0 w-full md:w-auto">
                    {/* Present Button */}
                    <button
                      onClick={() => handleMark(index, "present")}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                        isPresent
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400 scale-[1.02]"
                          : "bg-white/5 hover:bg-emerald-500/15 text-white/70 hover:text-emerald-400 border border-white/5"
                      }`}
                    >
                      <CheckCircle2 size={16} />
                      <span>Present</span>
                    </button>

                    {/* Bunk / Absent Button */}
                    <button
                      onClick={() => handleMark(index, "absent")}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                        isAbsent
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 ring-2 ring-rose-400 scale-[1.02]"
                          : "bg-white/5 hover:bg-rose-500/15 text-white/70 hover:text-rose-400 border border-white/5"
                      }`}
                    >
                      <XCircle size={16} />
                      <span>Bunk</span>
                    </button>

                    {/* Cancelled Button */}
                    <button
                      onClick={() => handleMark(index, "cancelled")}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                        isCancelled
                          ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-400 scale-[1.02]"
                          : "bg-white/5 hover:bg-amber-500/15 text-white/70 hover:text-amber-400 border border-white/5"
                      }`}
                      title="Class cancelled or holiday"
                    >
                      <Ban size={15} />
                      <span>Cancelled</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          });
        })()}
        </div>
      )}

      {/* ── Holiday Dialog Modal ──────────────────────────────────────────── */}
      {holidayDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 text-lg">
                🌴
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Mark Day as Holiday</h3>
                <p className="text-[11px] text-[#8E8E93]">{dayName} — all classes will be auto-cancelled</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-[#8E8E93] font-medium">Holiday Name / Reason</label>
              <input
                type="text"
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirmHoliday()}
                placeholder="e.g. Diwali Break, College Fest, Bandh..."
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-colors"
                autoFocus
              />
              <p className="text-[10px] text-white/30">Leave blank to use "Academic Holiday"</p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={() => setHolidayDialogOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHoliday}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold cursor-pointer transition-colors"
              >
                🌴 Mark Holiday & Cancel Classes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extra Session Modal */}
      {isExtraModalOpen && (
        <ExtraSessionModal
          date={currentDate}
          onClose={() => setIsExtraModalOpen(false)}
          onAdded={() => {
            setIsExtraModalOpen(false);
            loadDay(currentDate);
            showUndoToast("Extra session added");
          }}
        />
      )}
    </div>
  );
}
