import { useState, useEffect, useRef } from "react";
import {
  CalendarDays,
  Save,
  Sparkles,
  Filter,
  Info,
  Calendar,
  FlaskConical,
  BookOpen,
  GraduationCap,
  Copy,
  Clock,
  Trash2,
  UploadCloud,
  LayoutGrid,
  Columns,
} from "lucide-react";
import { AttendanceSubject, TimetableSlot } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";
import TimetableParserModal from "./TimetableParserModal";

const WEEKDAYS = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
  { day: 0, name: "Sunday", short: "Sun" },
];

/** Standard bell timings up to 10 periods/day to fit 4h labs + full class days */
const DEFAULT_TIMES = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "12:00", end: "13:00" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
  { start: "17:00", end: "18:00" },
  { start: "18:00", end: "19:00" },
];

export interface SlotBlock {
  id: string;
  weekday: number;
  startSlotIndex: number;
  endSlotIndex: number;
  span: number;
  startTime: string;
  endTime: string;
  subjectId: string | null;
  slotType: "lecture" | "lab" | "tutorial";
  room: string;
  slotIndices: number[];
}

/**
 * Groups consecutive periods of identical subject & slotType into unified SlotBlocks.
 * When mergedView is active, a 4-hour lab (e.g. slots 0-3) occupies 1 continuous block spanning 4 columns.
 * Two 2-hour classes (slots 4-5 and 6-7) occupy continuous blocks spanning 2 columns each.
 */
function getDayBlocks(
  weekday: number,
  maxSlots: number,
  getSlot: (wd: number, idx: number) => TimetableSlot,
  mergedView: boolean
): SlotBlock[] {
  const blocks: SlotBlock[] = [];

  for (let idx = 0; idx < maxSlots; idx++) {
    const slot = getSlot(weekday, idx);
    const slotSubj = slot.subjectId ? String(slot.subjectId) : null;
    const slotType = slot.slotType || "lecture";
    const slotRoom = slot.room || "";

    const lastBlock = blocks[blocks.length - 1];

    // Merge condition:
    // When mergedView is ON, and slot has an assigned subject matching the previous block's subject & type
    const canMerge =
      mergedView &&
      lastBlock &&
      slotSubj !== null &&
      lastBlock.subjectId !== null &&
      String(lastBlock.subjectId) === slotSubj &&
      lastBlock.slotType === slotType;

    if (canMerge) {
      lastBlock.endSlotIndex = idx;
      lastBlock.span += 1;
      lastBlock.endTime = slot.endTime || lastBlock.endTime;
      lastBlock.slotIndices.push(idx);
    } else {
      blocks.push({
        id: `${weekday}_${idx}`,
        weekday,
        startSlotIndex: idx,
        endSlotIndex: idx,
        span: 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slotSubj,
        slotType,
        room: slotRoom,
        slotIndices: [idx],
      });
    }
  }

  return blocks;
}

/** Compact time display that shows "09:30" cleanly and opens a native picker on click. */
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  const display = (() => {
    if (!value) return "--:--";
    const [h, m] = value.split(":");
    return `${String(h || "0").padStart(2, "0")}:${String(m || "0").padStart(2, "0")}`;
  })();

  return (
    <span
      className="relative inline-flex items-center cursor-pointer group"
      title="Click to edit time"
    >
      <span
        onClick={() => ref.current?.showPicker?.() ?? ref.current?.click()}
        className="text-white/80 group-hover:text-[#0A84FF] transition-colors text-[10px] font-mono font-semibold px-1 py-0.5 rounded hover:bg-white/8"
      >
        {display}
      </span>
      <input
        ref={ref}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        tabIndex={-1}
      />
    </span>
  );
}

export default function TimetableTab() {
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [maxSlots, setMaxSlots] = useState<number>(8);
  const [isMergedView, setIsMergedView] = useState<boolean>(true);
  const [applyFrom, setApplyFrom] = useState<string>(getTodayStr());
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isParserModalOpen, setIsParserModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const [subjs, ttData] = await Promise.all([
          attendanceApi.getSubjects(),
          attendanceApi.getTimetable(),
        ]);
        setSubjects(subjs);

        // Normalize loaded slots into state
        const loadedSlots: TimetableSlot[] = ttData.slots.map((s) => ({
          _id: s._id,
          weekday: s.weekday,
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room,
          slotType: s.slotType || "lecture",
          subjectId:
            typeof s.subjectId === "object" && s.subjectId !== null
              ? (s.subjectId as any)._id
              : s.subjectId || null,
        }));
        setSlots(loadedSlots);

        // Calculate maxSlots needed (default to 8 for full-day routines)
        const highestSlotInDb = loadedSlots.reduce((m, s) => Math.max(m, s.slotIndex + 1), 0);
        const resolvedMax = Math.max(ttData.maxSlots || 8, highestSlotInDb, 8);
        setMaxSlots(resolvedMax);
      } catch (err) {
        console.error("Failed to load timetable", err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const getSlot = (weekday: number, slotIndex: number): TimetableSlot => {
    const found = slots.find((s) => s.weekday === weekday && s.slotIndex === slotIndex);
    if (found) return found;
    const defaultTime = DEFAULT_TIMES[slotIndex] || { start: "09:00", end: "10:00" };
    return {
      weekday,
      slotIndex,
      startTime: defaultTime.start,
      endTime: defaultTime.end,
      subjectId: null,
      slotType: "lecture",
      room: "",
    };
  };

  const updateSlot = (
    weekday: number,
    slotIndex: number,
    changes: Partial<TimetableSlot>
  ) => {
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.weekday === weekday && s.slotIndex === slotIndex);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...changes };
        return updated;
      } else {
        const defaultTime = DEFAULT_TIMES[slotIndex] || { start: "09:00", end: "10:00" };
        const newSlot: TimetableSlot = {
          weekday,
          slotIndex,
          startTime: defaultTime.start,
          endTime: defaultTime.end,
          subjectId: null,
          slotType: "lecture",
          room: "",
          ...changes,
        };
        return [...prev, newSlot];
      }
    });
  };

  /**
   * Update all constituent slots in a block uniformly (e.g. changing subject, room, or type)
   */
  const updateBlock = (
    weekday: number,
    block: SlotBlock,
    changes: Partial<TimetableSlot>
  ) => {
    setSlots((prev) => {
      const updated = [...prev];
      for (const slotIndex of block.slotIndices) {
        const idx = updated.findIndex((s) => s.weekday === weekday && s.slotIndex === slotIndex);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], ...changes };
        } else {
          const defaultTime = DEFAULT_TIMES[slotIndex] || { start: "09:00", end: "10:00" };
          updated.push({
            weekday,
            slotIndex,
            startTime: defaultTime.start,
            endTime: defaultTime.end,
            subjectId: null,
            slotType: "lecture",
            room: "",
            ...changes,
          });
        }
      }
      return updated;
    });
  };

  /**
   * Sets the span of a block (e.g. 1h, 2h, 3h, 4h Lab).
   * For a 4-hour Lab, sets slots [start, start+1, start+2, start+3] to the same subject & "lab" type.
   */
  const setBlockSpan = (
    weekday: number,
    block: SlotBlock,
    targetSpan: number,
    forcedType?: "lecture" | "lab" | "tutorial"
  ) => {
    const startIdx = block.startSlotIndex;
    const currentSubjectId = block.subjectId;
    const targetType = forcedType || block.slotType || (targetSpan >= 3 ? "lab" : "lecture");
    const room = block.room || "";

    // Automatically expand maxSlots if block exceeds current maxSlots
    if (startIdx + targetSpan > maxSlots) {
      setMaxSlots(Math.min(10, startIdx + targetSpan));
    }

    setSlots((prev) => {
      const updated = [...prev];
      const limit = Math.min(10, Math.max(maxSlots, startIdx + targetSpan));

      // 1. Expand / assign up to targetSpan
      for (let i = 0; i < targetSpan && startIdx + i < limit; i++) {
        const slotIdx = startIdx + i;
        const defaultTime = DEFAULT_TIMES[slotIdx] || { start: "09:00", end: "10:00" };
        const existingIdx = updated.findIndex(
          (s) => s.weekday === weekday && s.slotIndex === slotIdx
        );

        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            subjectId: currentSubjectId,
            slotType: targetType,
            room: room || updated[existingIdx].room,
          };
        } else {
          updated.push({
            weekday,
            slotIndex: slotIdx,
            startTime: defaultTime.start,
            endTime: defaultTime.end,
            subjectId: currentSubjectId,
            slotType: targetType,
            room,
          });
        }
      }

      // 2. If shrinking (e.g. from 4h to 1h), clear the trailing slots
      if (block.span > targetSpan) {
        for (let i = targetSpan; i < block.span; i++) {
          const slotIdx = startIdx + i;
          const existingIdx = updated.findIndex(
            (s) => s.weekday === weekday && s.slotIndex === slotIdx
          );
          if (existingIdx >= 0) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              subjectId: null,
              room: "",
            };
          }
        }
      }

      return updated;
    });

    const typeLabel = targetType === "lab" ? "Lab" : "Class";
    showToast(
      targetSpan > 1
        ? `Set to ${targetSpan}-hour ${typeLabel} (${targetSpan} continuous spaces occupied)`
        : `Split to 1-hour slot`
    );
  };

  // Quick Action: Copy Monday schedule to Tue-Fri
  const handleCopyMondayToWeekdays = () => {
    const mondaySlots = slots.filter((s) => s.weekday === 1);
    if (mondaySlots.length === 0) {
      showToast("Monday timetable is empty. Please set up Monday first!");
      return;
    }

    setSlots((prev) => {
      const others = prev.filter((s) => ![2, 3, 4, 5].includes(s.weekday));
      const copied: TimetableSlot[] = [];

      for (let day = 2; day <= 5; day++) {
        mondaySlots.forEach((ms) => {
          copied.push({
            ...ms,
            _id: undefined,
            weekday: day,
          });
        });
      }
      return [...others, ...copied];
    });

    showToast("Copied Monday schedule (including multi-hour labs & classes) to Tuesday through Friday!");
  };

  // Quick Action: Apply standard bell timings to all days
  const handleApplyStandardTimings = () => {
    setSlots((prev) =>
      prev.map((s) => {
        const defaultTime = DEFAULT_TIMES[s.slotIndex] || { start: "09:00", end: "10:00" };
        return {
          ...s,
          startTime: defaultTime.start,
          endTime: defaultTime.end,
        };
      })
    );
    showToast("Reset all slots to standard university timings!");
  };

  // Clear specific day
  const handleClearDay = (weekday: number) => {
    setSlots((prev) => prev.filter((s) => s.weekday !== weekday));
    showToast("Day cleared");
  };

  // Clear entire timetable
  const handleClearAllSlots = () => {
    setSlots([]);
    setShowClearAllConfirm(false);
    showToast("Cleared all timetable slots. Click 'Save Timetable' to commit.");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validSlots = slots.map((s) => ({
        weekday: s.weekday,
        slotIndex: s.slotIndex,
        startTime: s.startTime || "09:00",
        endTime: s.endTime || "10:00",
        room: s.room || "",
        slotType: s.slotType || "lecture",
        subjectId: s.subjectId || null,
      }));

      const [res] = await Promise.all([
        attendanceApi.saveTimetable(validSlots, applyFrom),
        attendanceApi.updateSettings({ maxSlots }).catch(() => null),
      ]);
      showToast(`Timetable saved! Changes effective from ${res.applyFrom}`);
    } catch (err) {
      console.error("Save timetable failed", err);
      showToast("Failed to save timetable");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1C1C1E] border border-white/15 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm animate-in fade-in duration-200">
          <Sparkles size={16} className="text-[#0A84FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Effective-Dating & Timetable Tools Bar ─────────────────────────── */}
      <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-[#0A84FF]" />
              <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                Weekly Timetable Builder
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                MULTI-HOUR SMART BLOCKS
              </span>
            </div>
            <p className="text-xs text-[#8E8E93] flex items-center gap-1.5">
              <Info size={13} className="shrink-0 text-white/50" />
              Multi-period labs (4h) and classes (2h) occupy continuous spaces in one unified card.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Toggle: Multi-Hour Blocks vs Single Slots */}
            <div className="flex items-center bg-white/5 border border-white/10 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setIsMergedView(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  isMergedView
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="Continuous Multi-Hour Blocks (4-hour lab occupies 4 spaces, 2-hour class occupies 2 spaces)"
              >
                <LayoutGrid size={13} />
                <span>Multi-Hour Blocks</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMergedView(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  !isMergedView
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="Individual 1-Hour Period Boxes"
              >
                <Columns size={13} />
                <span>Single 1-Hr Slots</span>
              </button>
            </div>

            {/* Filter by subject */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Filter size={13} className="text-[#8E8E93]" />
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#1C1C1E] text-white">
                  All Subjects
                </option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id} className="bg-[#1C1C1E] text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply From Date Picker */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Calendar size={13} className="text-[#0A84FF]" />
              <span className="text-white/70">Apply from:</span>
              <input
                type="date"
                value={applyFrom}
                onChange={(e) => e.target.value && setApplyFrom(e.target.value)}
                className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
              />
            </div>

            {/* Timetable Scanner */}
            <button
              onClick={() => setIsParserModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer"
              title="Scan photo or PDF of class routine to auto-populate timetable"
            >
              <UploadCloud size={14} />
              <span>Scan Routine</span>
            </button>

            {/* Save Timetable */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 disabled:opacity-50 cursor-pointer"
            >
              <Save size={15} />
              <span>{isSaving ? "Saving..." : "Save Timetable"}</span>
            </button>
          </div>
        </div>

        {/* Quick Helper Actions Strip */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#8E8E93]">Periods/Day:</span>
            {[6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setMaxSlots(num)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  maxSlots === num
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5"
                }`}
                title={`Configure timetable for ${num} periods/day`}
              >
                {num} {num === 8 ? "(Standard)" : ""}
              </button>
            ))}

            <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />

            <button
              onClick={handleCopyMondayToWeekdays}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Copy Monday's schedule (including 4h lab and 2h classes) to Tuesday through Friday"
            >
              <Copy size={13} className="text-[#0A84FF]" />
              <span>Copy Mon to Tue-Fri</span>
            </button>

            <button
              onClick={handleApplyStandardTimings}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Reset slot timings to standard 9 AM - 5 PM periods"
            >
              <Clock size={13} className="text-amber-400" />
              <span>Reset 9 AM – 5 PM Timings</span>
            </button>

            {slots.some((s) => s.subjectId) && (
              <button
                onClick={() => setShowClearAllConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 transition-colors cursor-pointer"
                title="Clear all weekly timetable slots"
              >
                <Trash2 size={13} className="text-rose-400" />
                <span>Clear Timetable</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-[#8E8E93] hidden md:flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> 4h/3h Lab
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] inline-block" /> 2h Class
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white/40 inline-block" /> 1h Slot
            </span>
          </div>
        </div>
      </div>

      {/* ── Weekly Timetable Matrix ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#8E8E93]">Loading weekly grid...</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[1100px] space-y-4">
            {/* Period Bell Timeline Guide Header */}
            <div
              className="grid gap-3 px-4 py-2 rounded-2xl bg-[#141414] border border-white/[0.05] text-[11px] font-mono text-[#8E8E93]"
              style={{
                gridTemplateColumns: `repeat(${maxSlots}, minmax(130px, 1fr))`,
              }}
            >
              {Array.from({ length: maxSlots }).map((_, i) => (
                <div
                  key={i}
                  className="text-center py-1.5 px-1 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-white/80 font-bold block">Period {i + 1}</span>
                  <span className="text-[10px] text-white/40 font-mono">
                    {DEFAULT_TIMES[i]?.start} – {DEFAULT_TIMES[i]?.end}
                  </span>
                </div>
              ))}
            </div>

            {/* Weekdays Rows */}
            {WEEKDAYS.map((wd) => {
              const daySlotsCount = slots.filter((s) => s.weekday === wd.day && s.subjectId).length;
              const dayBlocks = getDayBlocks(wd.day, maxSlots, getSlot, isMergedView);
              const multiHourCount = dayBlocks.filter((b) => b.span > 1 && b.subjectId).length;

              return (
                <div
                  key={wd.day}
                  className="p-4 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-extrabold text-white text-base tracking-tight">
                        {wd.name}
                      </span>
                      <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md">
                        {daySlotsCount} active period{daySlotsCount === 1 ? "" : "s"}
                      </span>
                      {multiHourCount > 0 && (
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                          {multiHourCount} Multi-Hour Block{multiHourCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleClearDay(wd.day)}
                      className="flex items-center gap-1 text-[11px] text-[#8E8E93] hover:text-rose-400 transition-colors cursor-pointer"
                      title="Clear all classes on this day"
                    >
                      <Trash2 size={12} />
                      <span>Clear Day</span>
                    </button>
                  </div>

                  {/* Slots / Blocks Grid */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${maxSlots}, minmax(130px, 1fr))`,
                    }}
                  >
                    {dayBlocks.map((block) => {
                      const selectedSubj = subjects.find(
                        (s) => String(s._id) === String(block.subjectId)
                      );
                      const isDimmed =
                        selectedSubjectFilter !== "all" &&
                        block.subjectId &&
                        String(block.subjectId) !== selectedSubjectFilter;

                      const isLab = block.slotType === "lab";
                      const isTutorial = block.slotType === "tutorial";
                      const isMultiHour = block.span > 1;

                      return (
                        <div
                          key={block.id}
                          style={{
                            gridColumn: `span ${block.span} / span ${block.span}`,
                          }}
                          className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                            selectedSubj
                              ? isLab
                                ? "bg-purple-950/25 border-purple-500/40 hover:border-purple-500/60 shadow-lg shadow-purple-950/20"
                                : isTutorial
                                ? "bg-cyan-950/25 border-cyan-500/40 hover:border-cyan-500/60 shadow-lg"
                                : "bg-white/[0.04] border-white/10 hover:border-white/20 shadow-sm"
                              : "bg-white/[0.01] border-white/5 border-dashed hover:border-white/15"
                          } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                        >
                          {/* Top Bar: Time Range + Span/Period indicator */}
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono border-b border-white/[0.06] pb-2 mb-2">
                            <div className="flex items-center gap-1">
                              <TimeInput
                                value={block.startTime}
                                onChange={(v) =>
                                  updateSlot(wd.day, block.startSlotIndex, { startTime: v })
                                }
                              />
                              <span className="text-white/30">–</span>
                              <TimeInput
                                value={block.endTime}
                                onChange={(v) =>
                                  updateSlot(wd.day, block.endSlotIndex, { endTime: v })
                                }
                              />
                            </div>

                            {/* Multi-slot Badge */}
                            {isMultiHour ? (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-tight uppercase border flex items-center gap-1 ${
                                  isLab
                                    ? "bg-purple-500/25 text-purple-300 border-purple-500/35"
                                    : isTutorial
                                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-500/35"
                                    : "bg-blue-500/25 text-blue-300 border-blue-500/35"
                                }`}
                              >
                                {isLab ? <FlaskConical size={10} /> : <BookOpen size={10} />}
                                <span>
                                  {block.span}h · {block.span} Spaces (P{block.startSlotIndex + 1}–P
                                  {block.endSlotIndex + 1})
                                </span>
                              </span>
                            ) : (
                              <span className="text-[9px] text-[#8E8E93] font-mono">
                                P{block.startSlotIndex + 1} (1h)
                              </span>
                            )}
                          </div>

                          {/* Middle Content */}
                          <div className="space-y-2 flex-1">
                            {/* Subject Select */}
                            <div>
                              <select
                                value={block.subjectId ? String(block.subjectId) : ""}
                                onChange={(e) =>
                                  updateBlock(wd.day, block, {
                                    subjectId: e.target.value ? e.target.value : null,
                                  })
                                }
                                className="w-full text-xs font-bold rounded-xl bg-white/5 border border-white/10 py-1.5 px-2 text-white focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                                style={{
                                  color: selectedSubj ? selectedSubj.color : "#8E8E93",
                                }}
                              >
                                <option value="" className="bg-[#1C1C1E] text-[#8E8E93]">
                                  {isMultiHour ? `${block.span}-Hour Free Block` : "Free Slot"}
                                </option>
                                {subjects.map((subj) => (
                                  <option
                                    key={subj._id}
                                    value={subj._id}
                                    className="bg-[#1C1C1E] text-white"
                                  >
                                    {subj.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Slot Type Toggle */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextType =
                                    block.slotType === "lecture"
                                      ? "lab"
                                      : block.slotType === "lab"
                                      ? "tutorial"
                                      : "lecture";
                                  updateBlock(wd.day, block, { slotType: nextType });
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  isLab
                                    ? "bg-purple-500/25 border-purple-500/40 text-purple-200"
                                    : isTutorial
                                    ? "bg-cyan-500/25 border-cyan-500/40 text-cyan-200"
                                    : "bg-white/5 border-white/10 text-white/70 hover:text-white"
                                }`}
                                title="Toggle Lecture / Lab / Tutorial"
                              >
                                {isLab ? (
                                  <>
                                    <FlaskConical size={11} className="text-purple-300" />
                                    <span>Lab Practical</span>
                                  </>
                                ) : isTutorial ? (
                                  <>
                                    <GraduationCap size={11} className="text-cyan-300" />
                                    <span>Tutorial</span>
                                  </>
                                ) : (
                                  <>
                                    <BookOpen size={11} className="text-blue-300" />
                                    <span>Lecture</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Room / Lab No. */}
                            <div>
                              <input
                                type="text"
                                placeholder={
                                  isLab ? "Lab Name / Room (e.g. Lab 4)" : "Room (e.g. LH-101)"
                                }
                                value={block.room || ""}
                                onChange={(e) =>
                                  updateBlock(wd.day, block, { room: e.target.value })
                                }
                                className="w-full text-[11px] bg-transparent border-b border-white/10 py-0.5 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#0A84FF]"
                              />
                            </div>
                          </div>

                          {/* Bottom Bar: Quick Duration / Span Selector & Split Action */}
                          <div className="pt-2.5 mt-2 border-t border-white/[0.06] flex items-center justify-between gap-1 flex-wrap">
                            <div className="flex items-center gap-1 text-[9px]">
                              <span className="text-white/40 text-[9px] mr-0.5">Span:</span>
                              {([1, 2, 3, 4] as const).map((s) => {
                                const isActive = block.span === s;
                                const isLabBtn = s === 4;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() =>
                                      setBlockSpan(wd.day, block, s, isLabBtn ? "lab" : undefined)
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                                      isActive
                                        ? isLabBtn || isLab
                                          ? "bg-purple-500 text-white border-purple-400 shadow-sm shadow-purple-500/30"
                                          : "bg-[#0A84FF] text-white border-[#0A84FF]"
                                        : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                                    }`}
                                    title={
                                      s === 4
                                        ? "Expand to 4-hour Lab (occupies 4 continuous spaces)"
                                        : `Set to ${s}-hour duration (${s} spaces)`
                                    }
                                  >
                                    {s === 4 ? "4h Lab" : `${s}h`}
                                  </button>
                                );
                              })}
                            </div>

                            {isMultiHour && (
                              <button
                                type="button"
                                onClick={() => setBlockSpan(wd.day, block, 1)}
                                className="text-[9px] text-[#8E8E93] hover:text-rose-400 transition-colors ml-auto cursor-pointer"
                                title="Split back to 1-hour slots"
                              >
                                Split 1h
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Clear Timetable Confirmation Modal */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400">
              <Trash2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Clear Weekly Timetable?</h3>
              <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
                This will unassign all classes across Monday to Sunday. Click{" "}
                <strong>"Save Timetable"</strong> afterwards to commit the changes.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllSlots}
                className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-lg shadow-rose-500/25 cursor-pointer"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timetable Parser Modal */}
      {isParserModalOpen && (
        <TimetableParserModal
          isOpen={isParserModalOpen}
          onClose={() => setIsParserModalOpen(false)}
          subjects={subjects}
          onApplySlots={async (newSlots) => {
            try {
              const refreshedSubjects = await attendanceApi.getSubjects();
              setSubjects(refreshedSubjects);
            } catch (e) {
              console.error("Failed to refresh subjects", e);
            }

            setSlots((prev) => {
              const prevMap = new Map<string, TimetableSlot>();
              prev.forEach((s) => prevMap.set(`${s.weekday}_${s.slotIndex}`, s));
              newSlots.forEach((s) => prevMap.set(`${s.weekday}_${s.slotIndex}`, s));
              return Array.from(prevMap.values());
            });

            const maxIdx = Math.max(0, ...newSlots.map((s) => s.slotIndex));
            if (maxIdx + 1 > maxSlots) {
              setMaxSlots(Math.min(10, maxIdx + 1));
            }
            showToast(`Imported ${newSlots.length} sessions! Click "Save Timetable" to commit.`);
          }}
        />
      )}
    </div>
  );
}
