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
  initialDate?: string;
  onInitialDateConsumed?: () => void;
}

function getContiguousClassIndices(sessions: AttendanceSession[], index: number): number[] {
  const current = sessions[index];
  if (!current?.subjectId || current.source === "extra") return [index];

  const isSameContinuousClass = (candidate: AttendanceSession | undefined) =>
    Boolean(
      candidate &&
        candidate.source !== "extra" &&
        candidate.subjectId === current.subjectId &&
        (candidate.slotType || "lecture") === (current.slotType || "lecture") &&
        (candidate.room || "") === (current.room || "")
    );

  let start = index;
  while (start > 0) {
    const previous = sessions[start - 1];
    if (!isSameContinuousClass(previous) || previous.endTime !== sessions[start].startTime) break;
    start--;
  }

  let end = index;
  while (end < sessions.length - 1) {
    const next = sessions[end + 1];
    if (!isSameContinuousClass(next) || sessions[end].endTime !== next.startTime) break;
    end++;
  }

  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

export default function TodayTab({
  onNavigateTab,
  pendingCount,
  initialDate,
  onInitialDateConsumed,
}: TodayTabProps) {
  const [currentDate, setCurrentDate] = useState<string>(initialDate || todayLocalCivil());
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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

  const loadDay = useCallback(async (date: string, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await attendanceApi.getDaySessions(date);
      setData(res);
    } catch (err) {
      console.error("Failed to load day attendance", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(currentDate);
  }, [currentDate, loadDay]);

  useEffect(() => {
    if (!initialDate) return;
    setCurrentDate(initialDate);
    onInitialDateConsumed?.();
  }, [initialDate, onInitialDateConsumed]);

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
    const previousEntryId = session.entryId;
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
      status === "present" ? "Present" : status === "absent" ? "Absent" : "Cancelled";
    showUndoToast(`Marked ${subjectName} as ${statusLabel}`, {
      sessionIndex,
      previousStatus,
      session,
      subjectName,
    });

    // 2. Background Sync
    try {
      const res = (await attendanceApi.markAttendance({
        date: currentDate,
        slotId: session.slotId,
        subjectId: session.subjectId,
        status,
      })) as { _id?: string } | undefined;

      const newEntryId = res?._id;
      if (newEntryId) {
        setData((prev) => {
          if (!prev) return prev;
          const nextSessions = [...prev.sessions];
          if (nextSessions[sessionIndex]) {
            nextSessions[sessionIndex] = {
              ...nextSessions[sessionIndex],
              entryId: newEntryId,
            };
          }
          return { ...prev, sessions: nextSessions };
        });
      }
    } catch (err) {
      console.error("Mark failed, rolling back", err);
      // Revert optimistic update on error
      const reverted = [...data.sessions];
      reverted[sessionIndex] = { ...session, status: previousStatus, entryId: previousEntryId };
      setData({ ...data, sessions: reverted });
      showUndoToast("Failed to save mark. Changes reverted.");
    }
  };

  // Mark all periods in a continuous class block together.
  const handleMarkBlock = async (indices: number[], status: AttendanceStatus) => {
    if (!data) return;
    const targetSessions = indices
      .map((i) => ({ index: i, session: data.sessions[i] }))
      .filter((s) => s.session && s.session.subjectId);
    if (targetSessions.length === 0) return;

    const subjectName = targetSessions[0].session.subject?.name || "Block";
    const previousSessions = [...data.sessions];

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
      status === "present" ? "Present" : status === "absent" ? "Absent" : "Cancelled";
    showUndoToast(
      targetSessions.length > 1
        ? `Marked ${subjectName} (${targetSessions.length} periods) as ${statusLabel}`
        : `Marked ${subjectName} as ${statusLabel}`
    );

    // 2. Background Sync
    try {
      const results = await Promise.all(
        targetSessions.map(async ({ session, index }) => {
          const res = (await attendanceApi.markAttendance({
            date: currentDate,
            slotId: session.slotId,
            subjectId: session.subjectId!,
            status,
          })) as { _id?: string } | undefined;
          return { index, entryId: res?._id };
        })
      );

      setData((prev) => {
        if (!prev) return prev;
        const nextSessions = [...prev.sessions];
        for (const item of results) {
          if (item && item.entryId && nextSessions[item.index]) {
            nextSessions[item.index] = {
              ...nextSessions[item.index],
              entryId: item.entryId,
            };
          }
        }
        return { ...prev, sessions: nextSessions };
      });
    } catch (err) {
      console.error("Batch mark failed, rolling back", err);
      setData((prev) => (prev ? { ...prev, sessions: previousSessions } : prev));
      showUndoToast("Failed to save block marks. Reverting...");
    }
  };

  const handleUnmarkBlock = async (indices: number[]) => {
    if (!data) return;
    const targetSessions = indices
      .map((index) => ({ index, session: data.sessions[index] }))
      .filter(({ session }) => session?.subjectId);
    if (targetSessions.length === 0) return;

    const previousSessions = [...data.sessions];

    // 1. Optimistic Update: immediately clear status and entryId
    const updatedSessions = [...data.sessions];
    for (const { index, session } of targetSessions) {
      updatedSessions[index] = { ...session, status: null, entryId: null };
    }
    setData({
      ...data,
      sessions: updatedSessions,
      allMarked: updatedSessions.every((session) => session.status !== null),
    });

    try {
      let entries = targetSessions.filter(({ session }) => session.entryId);
      // Fallback if entryId was missing (e.g., mark request still in flight)
      if (entries.length !== targetSessions.length) {
        const fresh = await attendanceApi.getDaySessions(currentDate);
        entries = indices
          .map((index) => ({ index, session: fresh.sessions[index] }))
          .filter(({ session }) => session?.subjectId && session?.entryId);
      }

      if (entries.length > 0) {
        await Promise.all(entries.map(({ session }) => attendanceApi.deleteEntry(session.entryId!)));
      }
      showUndoToast("Attendance mark cleared");
      // 2. Silent background sync (no table unmount / loading spinner)
      await loadDay(currentDate, true);
    } catch (err) {
      console.error("Unmark attendance failed", err);
      setData((prev) => (prev ? { ...prev, sessions: previousSessions } : prev));
      showUndoToast("Could not clear the mark. Changes restored.");
      await loadDay(currentDate, true);
    }
  };

  const handleToggleBlockMark = (
    indices: number[],
    status: AttendanceStatus,
    isAlreadySelected: boolean
  ) => {
    if (isAlreadySelected) {
      void handleUnmarkBlock(indices);
    } else if (indices.length === 1) {
      void handleMark(indices[0], status);
    } else {
      void handleMarkBlock(indices, status);
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
        const res = (await attendanceApi.markAttendance({
          date: currentDate,
          slotId: session.slotId,
          subjectId: session.subjectId!,
          status: previousStatus,
        })) as { _id?: string } | undefined;
        if (res?._id) {
          setData((prev) => {
            if (!prev) return prev;
            const next = [...prev.sessions];
            if (next[sessionIndex]) next[sessionIndex] = { ...next[sessionIndex], entryId: res._id };
            return { ...prev, sessions: next };
          });
        }
      } else if (session.entryId) {
        await attendanceApi.deleteEntry(session.entryId);
      }
      showUndoToast(`Reverted ${subjectName} to ${previousStatus || "Unmarked"}`);
      await loadDay(currentDate, true);
    } catch (err) {
      console.error("Undo failed", err);
      await loadDay(currentDate, true);
    }
  };

  // Bulk Mark All Present
  const handleBulkPresent = async () => {
    setActionLoading(true);
    try {
      const res = await attendanceApi.bulkMarkDayPresent(currentDate);
      showUndoToast(`All ${res.count} sessions marked Present!`);
      await loadDay(currentDate, true);
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

      await loadDay(currentDate, true);
    } catch (err) {
      console.error("Holiday mark failed", err);
      showUndoToast("Failed to mark holiday.");
    } finally {
      setActionLoading(false);
    }
  };

  // Clear / Reset all marks for the current date
  const handleClearDayMarks = async () => {
    setActionLoading(true);
    try {
      await attendanceApi.clearDayMarks(currentDate);
      showUndoToast(`Attendance marks cleared for ${currentDate}`);
      setShowClearConfirm(false);
      await loadDay(currentDate, true);
    } catch (err) {
      console.error("Clear marks failed", err);
      showUndoToast("Failed to clear marks.");
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

        const classIndices = getContiguousClassIndices(data.sessions, idx);
        if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          if (classIndices.length === 1) handleMark(idx, "present");
          else handleMarkBlock(classIndices, "present");
        } else if (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "a") {
          e.preventDefault();
          if (classIndices.length === 1) handleMark(idx, "absent");
          else handleMarkBlock(classIndices, "absent");
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          if (classIndices.length === 1) handleMark(idx, "cancelled");
          else handleMarkBlock(classIndices, "cancelled");
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Date Selector Header */}
          <div className="flex items-center justify-between gap-2 w-full lg:w-auto">
            <button
              onClick={() => changeDateBy(-1)}
              className="p-2 sm:p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Previous Day (Arrow Left)"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex items-center gap-2.5 text-center px-1 min-w-0">
              <CalendarIcon size={18} className="text-[#0A84FF] shrink-0 hidden sm:block" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 justify-center flex-wrap">
                  <span className="font-bold text-white text-base sm:text-lg tracking-tight truncate">
                    {dayName}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30 shrink-0">
                      TODAY
                    </span>
                  )}
                  {data?.isHoliday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 truncate max-w-[150px]">
                      {data.holiday?.label || "Holiday"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8E8E93] font-mono">{currentDate}</p>
              </div>
            </div>

            <button
              onClick={() => changeDateBy(1)}
              className="p-2 sm:p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Next Day (Arrow Right)"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Date Picker & Fast Actions Toolbar */}
          <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 scrollbar-none sm:overflow-visible sm:pb-0 sm:flex-wrap lg:justify-end">
            <input
              type="date"
              value={currentDate}
              onChange={(e) => e.target.value && setCurrentDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer shrink-0"
            />

            {!isToday && (
              <button
                onClick={() => setCurrentDate(todayLocalCivil())}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
              >
                Today
              </button>
            )}

            <button
              onClick={handleBulkPresent}
              disabled={actionLoading || totalClasses === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A84FF]/15 hover:bg-[#0A84FF]/25 border border-[#0A84FF]/30 text-[#0A84FF] text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shrink-0 whitespace-nowrap"
              title="Mark all today's sessions as Present"
            >
              <CheckCheck size={14} />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={handleHoliday}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              title="Mark date as holiday or off-day"
            >
              <Palmtree size={13} className="text-amber-400" />
              <span>Holiday</span>
            </button>

            <button
              onClick={() => setIsExtraModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              title="Add an extra session or surprise test"
            >
              <Plus size={13} />
              <span>Extra Class</span>
            </button>

            {(presentCount > 0 || absentCount > 0 || cancelledCount > 0 || data?.isHoliday) && (
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                title="Clear all marks & reset this date to unmarked"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Day Summary Progress Badges Strip ──────────────────────────────── */}
        {totalClasses > 0 && (
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full sm:w-auto">
              <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[#8E8E93] text-[11px] font-medium shrink-0">
                {totalClasses} Classes
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold shrink-0">
                <CheckCircle2 size={12} /> {presentCount} Present
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-bold shrink-0">
                <XCircle size={12} /> {absentCount} Absent
              </span>
              {cancelledCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold shrink-0">
                  <Ban size={12} /> {cancelledCount} Cancelled
                </span>
              )}
              {pendingClasses > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-white/5 text-white/60 text-[11px] font-medium shrink-0">
                  {pendingClasses} Pending
                </span>
              )}
            </div>

            {/* Keyboard shortcut hint badge */}
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-[#8E8E93] bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/5 shrink-0">
              <Keyboard size={12} className="text-white/60" />
              <span>Shortcuts: <b>P</b> Present, <b>B</b> Absent, <b>C</b> Cancelled</span>
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
          <div className="flex flex-col items-stretch justify-center gap-2 pt-2 sm:flex-row sm:items-center sm:gap-3">
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
        <div role="table" aria-label={`Attendance for ${dayName}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#141414]">
          <div
            role="row"
            className="hidden sm:grid sm:grid-cols-[minmax(145px,0.8fr)_minmax(220px,1.8fr)_minmax(155px,1fr)_auto] border-b border-white/10 bg-white/[0.035] text-[10px] font-bold uppercase tracking-wider text-white/45"
          >
            <span role="columnheader" className="px-4 py-2.5">Time</span>
            <span role="columnheader" className="px-4 py-2.5">Class</span>
            <span role="columnheader" className="px-4 py-2.5">Details</span>
            <span role="columnheader" className="px-4 py-2.5 text-center">Attendance</span>
          </div>
          {(() => {
            const getBlockInfo = (idx: number) => {
              if (!data?.sessions) return null;
              const curr = data.sessions[idx];
              if (!curr || !curr.subjectId) return null;

              const indices = getContiguousClassIndices(data.sessions, idx);
              const start = indices[0];
              const end = indices[indices.length - 1];
              const span = indices.length;
              return {
                start,
                end,
                span,
                isFirst: idx === start,
                indices,
                startTime: data.sessions[start].startTime,
                endTime: data.sessions[end].endTime,
              };
            };

            return data?.sessions.map((session, index) => {
              const blockInfo = getBlockInfo(index);
              if (blockInfo && !blockInfo.isFirst) return null;

              const blockIndices = blockInfo?.indices || [index];
              const blockSessions = blockIndices.map((sessionIndex) => data!.sessions[sessionIndex]);
              const isPresent = blockSessions.every((item) => item.status === "present");
              const isAbsent = blockSessions.every((item) => item.status === "absent");
              const isCancelled = blockSessions.every((item) => item.status === "cancelled");
              const hasMixedStatus = new Set(blockSessions.map((item) => item.status)).size > 1;
              const subjColor = session.subject?.color || "#0A84FF";

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
            <div
              key={session.slotId || session.entryId || index}
              role="row"
              className="grid grid-cols-1 sm:grid-cols-[minmax(145px,0.8fr)_minmax(220px,1.8fr)_minmax(155px,1fr)_auto] sm:items-center border-b border-white/[0.07] last:border-b-0 hover:bg-white/[0.025] transition-colors"
            >
                  <div role="cell" className="px-4 pt-3 sm:py-4">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:hidden">Time</span>
                    <span className="font-mono text-sm font-semibold text-white/90">
                      {blockInfo?.startTime || session.startTime}–{blockInfo?.endTime || session.endTime}
                    </span>
                    {blockInfo && blockInfo.span > 1 && (
                      <span className="ml-2 text-[10px] text-white/45">{blockInfo.span} periods</span>
                    )}
                  </div>

                  <div role="cell" className="flex min-w-0 items-start gap-2.5 px-4 py-2 sm:py-4">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subjColor }} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="font-bold text-white text-sm sm:text-base tracking-tight">
                          {session.subject?.name || "Free Slot"}
                        </h4>
                        {session.subject?.shortName && (
                          <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-white/75">
                            {session.subject.shortName}
                          </span>
                        )}
                        {session.subject?.code && (
                          <span className="rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono text-white/50">
                            {session.subject.code}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${slotTypeConfig.badge}`}>
                          <SlotIcon size={10} />
                          {slotTypeConfig.label}
                        </span>
                        {session.source === "extra" && (
                          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-400">
                            EXTRA CLASS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div role="cell" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-xs text-white/55 sm:py-4">
                    <span className="mb-1 w-full text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:hidden">Details</span>
                    {session.room && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-white/45" />
                        {session.room}
                      </span>
                    )}
                    {session.subject?.teacher && <span>{session.subject.teacher}</span>}
                  </div>

                  <div role="cell" className="flex flex-col gap-1.5 px-4 pb-3 sm:flex-row sm:items-center sm:gap-1.5 sm:py-3 sm:pr-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:hidden">Mark attendance</span>
                    <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:flex-1">
                    {/* Present Button */}
                    <button
                      onClick={() => handleToggleBlockMark(blockIndices, "present", isPresent)}
                      aria-pressed={isPresent}
                      title={isPresent ? "Tap again to clear this mark" : "Mark present"}
                      className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer sm:flex-1 sm:px-3 sm:text-xs ${
                        isPresent
                          ? "border border-emerald-400/50 bg-emerald-500 text-white"
                          : hasMixedStatus
                          ? "bg-amber-500/10 text-amber-200 border border-amber-500/30"
                          : "bg-white/5 hover:bg-emerald-500/15 text-white/70 hover:text-emerald-400 border border-white/5"
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      <span>Present</span>
                    </button>

                    {/* Absent Button */}
                    <button
                      onClick={() => handleToggleBlockMark(blockIndices, "absent", isAbsent)}
                      aria-pressed={isAbsent}
                      title={isAbsent ? "Tap again to clear this mark" : "Mark absent"}
                      className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer sm:flex-1 sm:px-3 sm:text-xs ${
                        isAbsent
                          ? "border border-rose-400/50 bg-rose-500 text-white"
                          : hasMixedStatus
                          ? "bg-amber-500/10 text-amber-200 border border-amber-500/30"
                          : "bg-white/5 hover:bg-rose-500/15 text-white/70 hover:text-rose-400 border border-white/5"
                      }`}
                    >
                      <XCircle size={14} />
                      <span>Absent</span>
                    </button>

                    {/* Cancelled Button */}
                    <button
                      onClick={() => handleToggleBlockMark(blockIndices, "cancelled", isCancelled)}
                      aria-pressed={isCancelled}
                      className={`flex min-w-0 items-center justify-center gap-1 px-1 py-2 rounded-xl text-[10px] font-medium transition-all cursor-pointer sm:flex-1 sm:px-2.5 sm:text-xs ${
                        isCancelled
                          ? "border border-amber-400/50 bg-amber-500 text-white"
                          : hasMixedStatus
                          ? "bg-amber-500/10 text-amber-200 border border-amber-500/30"
                          : "bg-white/5 hover:bg-amber-500/15 text-white/70 hover:text-amber-400 border border-white/5"
                      }`}
                      title="Class cancelled or holiday"
                    >
                      <Ban size={14} />
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

            <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
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

      {/* Confirm Clear Marks Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#1C1C1E] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400">
                <RotateCcw size={20} />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Reset Day Attendance?</h4>
                <p className="text-xs text-[#8E8E93]">{dayName} ({currentDate})</p>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              This will remove all Present, Absent, or Cancelled marks recorded for this date and restore scheduled classes to an unmarked state.
            </p>

            <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDayMarks}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer transition-colors shadow-lg shadow-rose-500/25 disabled:opacity-50"
              >
                {actionLoading ? "Clearing..." : "Reset All Marks"}
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
            loadDay(currentDate, true);
            showUndoToast("Extra session added");
          }}
        />
      )}
    </div>
  );
}
