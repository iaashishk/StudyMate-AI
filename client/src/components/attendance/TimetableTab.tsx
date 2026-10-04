import { useState, useEffect, useRef } from "react";
import {
  CalendarDays,
  Save,
  Sparkles,
  Filter,
  Calendar,
  FlaskConical,
  BookOpen,
  GraduationCap,
  Copy,
  Clock,
  Trash2,
  UploadCloud,
  Columns,
  LayoutGrid,
  ArrowLeftRight,
  Rows3,
  Table,
  Edit2,
  User,
  MapPin,
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

/** Standard bell timings up to 10 periods/day */
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
  blockId?: string;
}

/**
 * Universal dynamic block grouping for timetable grids.
 * Works dynamically for ANY duration (1h, 2h, 3h, 4h) and ANY type (Lecture, Lab, Tutorial).
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
    const slotBlockId = (slot as any).blockId || null;

    const lastBlock = blocks[blocks.length - 1];

    // Universal Dynamic Merge condition:
    // When mergedView is ON:
    // 1. Explicit multi-hour blockId match (created by 1h, 2h, 3h, 4h buttons)
    // 2. OR both share the same non-null assigned subject and same slotType
    // 3. OR both share matching slotType with matching subject and matching room
    const canMerge =
      mergedView &&
      lastBlock &&
      (
        // Condition 1: Explicit block ID link
        (slotBlockId && lastBlock.blockId && slotBlockId === lastBlock.blockId) ||
        // Condition 2: Both have the same non-null assigned subject and same slotType
        (slotSubj !== null &&
          lastBlock.subjectId !== null &&
          String(lastBlock.subjectId) === slotSubj &&
          lastBlock.slotType === slotType) ||
        // Condition 3: Matching slotType and matching subject (both null or both same) and matching room
        (slotType === lastBlock.slotType &&
          String(lastBlock.subjectId || "") === String(slotSubj || "") &&
          (lastBlock.room || "") === slotRoom &&
          (slotBlockId !== null || slotType === "lab"))
      );

    if (canMerge) {
      lastBlock.endSlotIndex = idx;
      lastBlock.span += 1;
      lastBlock.endTime = slot.endTime || lastBlock.endTime;
      lastBlock.slotIndices.push(idx);
    } else {
      blocks.push({
        id: slotBlockId || `${weekday}_${idx}`,
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
        blockId: slotBlockId,
      });
    }
  }

  return blocks;
}

/** Native time picker trigger */
function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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
  const [layoutMode, setLayoutMode] = useState<"vertical" | "grid">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "vertical";
    }
    return "grid";
  });
  const [activeDayFilter, setActiveDayFilter] = useState<number | "all">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      const today = new Date().getDay();
      return today === 0 ? 1 : today;
    }
    return "all";
  });
  const [applyFrom, setApplyFrom] = useState<string>(getTodayStr());
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
        const [subjs, ttData, settingsData] = await Promise.all([
          attendanceApi.getSubjects(),
          attendanceApi.getTimetable(),
          attendanceApi.getSettings().catch(() => null),
        ]);
        setSubjects(subjs);

        if (settingsData?.semester?.startDate) {
          setApplyFrom(settingsData.semester.startDate);
        }

        const loadedSlots: TimetableSlot[] = ttData.slots.map((s) => ({
          _id: s._id,
          weekday: s.weekday,
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room,
          slotType: s.slotType || "lecture",
          blockId: (s as any).blockId || null,
          blockSpan: (s as any).blockSpan || 1,
          subjectId:
            typeof s.subjectId === "object" && s.subjectId !== null
              ? (s.subjectId as any)._id
              : s.subjectId || null,
        }));
        setSlots(loadedSlots);

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

  const getPeriodTiming = (periodIdx: number) => {
    const sampleSlot = slots.find(
      (s) => s.slotIndex === periodIdx && s.startTime && s.endTime
    );
    if (sampleSlot) {
      return { start: sampleSlot.startTime, end: sampleSlot.endTime };
    }
    return (
      DEFAULT_TIMES[periodIdx] || {
        start: `${String(9 + periodIdx).padStart(2, "0")}:00`,
        end: `${String(10 + periodIdx).padStart(2, "0")}:00`,
      }
    );
  };

  const updatePeriodTiming = (periodIdx: number, start: string, end: string) => {
    setSlots((prev) => {
      return prev.map((s) => {
        if (s.slotIndex === periodIdx) {
          return { ...s, startTime: start, endTime: end };
        }
        return s;
      });
    });
    showToast(`Updated Period ${periodIdx + 1} timing to ${start} – ${end}`);
  };

  const getSlot = (weekday: number, slotIndex: number): TimetableSlot => {
    const found = slots.find((s) => s.weekday === weekday && s.slotIndex === slotIndex);
    if (found) return found;
    const defaultTime = getPeriodTiming(slotIndex);
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
   * Updates all constituent slots in a multi-hour block uniformly
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
   * Sets the span of a block (e.g. 1h, 2h, 3h, 4h).
   * Works dynamically for ANY duration and ANY type (Lecture, Lab, Tutorial).
   * Smoothly expands, shrinks, or resets accidental clicks.
   */
  const setBlockSpan = (
    weekday: number,
    block: SlotBlock,
    targetSpan: number,
    forcedType?: "lecture" | "lab" | "tutorial"
  ) => {
    const startIdx = block.startSlotIndex;
    const currentSubjectId = block.subjectId || null;
    const targetType = forcedType || block.slotType || "lecture";
    const room = block.room || "";
    // Create an explicit block link ID whenever duration > 1
    const newBlockId = targetSpan > 1 ? `blk_${weekday}_${startIdx}` : undefined;

    if (startIdx + targetSpan > maxSlots) {
      setMaxSlots(Math.min(10, startIdx + targetSpan));
    }

    setSlots((prev) => {
      const updated = [...prev];
      const limit = Math.min(10, Math.max(maxSlots, startIdx + targetSpan));

      // 1. Assign targetSpan slots starting from startIdx
      for (let i = 0; i < targetSpan && startIdx + i < limit; i++) {
        const slotIdx = startIdx + i;
        const periodTiming = getPeriodTiming(slotIdx);
        const existingIdx = updated.findIndex(
          (s) => s.weekday === weekday && s.slotIndex === slotIdx
        );

        const slotData = {
          weekday,
          slotIndex: slotIdx,
          startTime: periodTiming.start,
          endTime: periodTiming.end,
          subjectId: currentSubjectId,
          slotType: targetType,
          room: room,
          blockId: newBlockId,
          blockSpan: targetSpan,
        };

        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            ...slotData,
            room: room || updated[existingIdx].room,
          };
        } else {
          updated.push(slotData);
        }
      }

      // 2. If shrinking (e.g. from 4h to 2h, or from 4h to 1h, or from 3h to 1h):
      // Safely reset trailing slots back to regular 1-hour free lecture slots!
      const previousSpan = block.span || block.slotIndices.length || 1;
      if (previousSpan > targetSpan) {
        for (let i = targetSpan; i < previousSpan; i++) {
          const slotIdx = startIdx + i;
          const periodTiming = getPeriodTiming(slotIdx);
          const existingIdx = updated.findIndex(
            (s) => s.weekday === weekday && s.slotIndex === slotIdx
          );
          if (existingIdx >= 0) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              subjectId: null,
              slotType: "lecture", // reset to default 1h lecture
              room: "",
              blockId: undefined,
              blockSpan: 1,
              startTime: periodTiming.start,
              endTime: periodTiming.end,
            };
          }
        }
      }

      // 3. If resetting to 1-hour slot:
      if (targetSpan === 1) {
        const existingIdx = updated.findIndex(
          (s) => s.weekday === weekday && s.slotIndex === startIdx
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            blockId: undefined,
            blockSpan: 1,
            ...(forcedType ? { slotType: forcedType } : {}),
          };
        }
      }

      return updated;
    });

    const typeLabel = targetType === "lab" ? "Lab" : targetType === "tutorial" ? "Tutorial" : "Class";
    showToast(
      targetSpan > 1
        ? `Combined into ${targetSpan}-hour ${typeLabel} (${targetSpan} periods merged)`
        : `Reset to 1-hour slot`
    );
  };

  const clearBlock = (weekday: number, block: SlotBlock) => {
    setSlots((prev) => {
      const updated = [...prev];
      for (const slotIdx of block.slotIndices) {
        const periodTiming = getPeriodTiming(slotIdx);
        const existingIdx = updated.findIndex(
          (s) => s.weekday === weekday && s.slotIndex === slotIdx
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            subjectId: null,
            slotType: "lecture",
            room: "",
            blockId: undefined,
            blockSpan: 1,
            startTime: periodTiming.start,
            endTime: periodTiming.end,
          };
        }
      }
      return updated;
    });
    showToast("Cleared slot");
  };

  const handleCopyMonday = () => {
    const mondaySlots = slots.filter((s) => s.weekday === 1);
    if (mondaySlots.length === 0) {
      showToast("Monday timetable is empty. Please configure Monday first!");
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

    showToast("Copied Monday schedule (including multi-hour labs & classes) to Tue–Fri!");
  };

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

  const handleClearDay = (weekday: number) => {
    setSlots((prev) => prev.filter((s) => s.weekday !== weekday));
    showToast("Day cleared");
  };

  const handleClearAllSlots = async () => {
    setIsClearing(true);
    try {
      await attendanceApi.clearTimetable();
      setSlots([]);
      setShowClearAllConfirm(false);
      showToast("Timetable completely cleared from database!");
    } catch (err) {
      console.error("Clear timetable error:", err);
      try {
        await attendanceApi.saveTimetable([], applyFrom);
        setSlots([]);
        setShowClearAllConfirm(false);
        showToast("Timetable cleared and saved!");
      } catch (err2) {
        showToast("Failed to clear timetable on server");
      }
    } finally {
      setIsClearing(false);
    }
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
        blockId: (s as any).blockId || null,
        blockSpan: Number((s as any).blockSpan) || 1,
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

  const visibleWeekdays =
    activeDayFilter === "all"
      ? WEEKDAYS
      : WEEKDAYS.filter((w) => w.day === activeDayFilter);

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1C1C1E] border border-white/15 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm animate-in fade-in duration-200">
          <Sparkles size={16} className="text-[#0A84FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Toolbar Header ─────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-[#0A84FF]" />
              <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                Weekly Timetable Matrix
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93]">
              Universal weekly timetable. Multi-hour labs (4h) and classes automatically combine into continuous visual cards.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
            {/* View Mode Toggle: Multi-Hour Blocks vs Single Slots */}
            <div className="flex items-center bg-white/5 border border-white/10 p-0.5 rounded-xl text-xs w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => setIsMergedView(true)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  isMergedView
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="Combine consecutive hours of the same lab or class into one big block"
              >
                <LayoutGrid size={13} />
                <span>Combined Blocks</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMergedView(false)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  !isMergedView
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="View each individual 1-hour period box"
              >
                <Columns size={13} />
                <span>Single 1-Hr Slots</span>
              </button>
            </div>

            {/* Layout Toggle: Vertical Cards vs Matrix Grid */}
            <div className="flex items-center bg-white/5 border border-white/10 p-0.5 rounded-xl text-xs w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => setLayoutMode("vertical")}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  layoutMode === "vertical"
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="Vertical stacked cards (ideal for mobile)"
              >
                <Rows3 size={13} />
                <span>Vertical Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  layoutMode === "grid"
                    ? "bg-[#0A84FF] text-white shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
                title="Horizontal full matrix grid (ideal for desktop)"
              >
                <Table size={13} />
                <span>Matrix Grid</span>
              </button>
            </div>

            {/* Filter by subject */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs flex-1 sm:flex-initial min-w-[130px]">
              <Filter size={13} className="text-[#8E8E93] shrink-0" />
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer w-full truncate"
              >
                <option value="all" className="bg-[#1C1C1E] text-white">
                  All Subjects
                </option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id} className="bg-[#1C1C1E] text-white">
                    {s.shortName ? `[${s.shortName}] ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Apply From Date Picker */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs flex-1 sm:flex-initial min-w-[150px]">
              <Calendar size={13} className="text-[#0A84FF] shrink-0" />
              <span className="text-white/70 shrink-0">From:</span>
              <input
                type="date"
                value={applyFrom}
                onChange={(e) => e.target.value && setApplyFrom(e.target.value)}
                className="bg-transparent text-white font-mono focus:outline-none cursor-pointer w-full text-xs"
              />
            </div>

            {/* Timetable Scanner */}
            <button
              onClick={() => setIsParserModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial"
              title="Scan PDF or image of routine to auto-populate timetable and subjects"
            >
              <UploadCloud size={14} />
              <span>Scan Routine</span>
            </button>

            {/* Edit Mode Toggle Button */}
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial ${
                isEditMode
                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25"
                  : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
              }`}
              title={isEditMode ? "Exit editing mode" : "Edit slots, rooms and duration"}
            >
              <Edit2 size={13} />
              <span>{isEditMode ? "Done Editing" : "Edit Timetable"}</span>
            </button>

            {/* Clear Routine Button */}
            {slots.length > 0 && (
              <button
                onClick={() => setShowClearAllConfirm(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer flex-1 sm:flex-initial"
                title="Clear and reset weekly timetable"
              >
                <Trash2 size={14} />
                <span>Clear Routine</span>
              </button>
            )}

            {/* Save Timetable */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 disabled:opacity-50 cursor-pointer w-full sm:w-auto"
            >
              <Save size={15} />
              <span>{isSaving ? "Saving..." : "Save Timetable"}</span>
            </button>
          </div>
        </div>

        {/* Edit Mode Active Banner */}
        {isEditMode && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Edit2 size={14} className="shrink-0 text-amber-400" />
              <span>
                <strong>Editing Mode Active:</strong> Assign subjects, switch between lecture/lab, customize room numbers, or change period duration (1h–4h). Click <strong>"Save Timetable"</strong> or <strong>"Done Editing"</strong> when finished.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px] hover:bg-amber-400 transition-colors shrink-0 cursor-pointer"
            >
              Done Editing
            </button>
          </div>
        )}

        {/* Quick Actions & Day Filter Bar */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Day Filter Pills */}
            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto max-w-full scrollbar-none gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveDayFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeDayFilter === "all"
                    ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25"
                    : "text-white/60 hover:text-white"
                }`}
              >
                All Week ({slots.filter((s) => s.subjectId).length})
              </button>
              {WEEKDAYS.map((wd) => {
                const daySlotCount = slots.filter((s) => s.weekday === wd.day && s.subjectId).length;
                return (
                  <button
                    key={wd.day}
                    type="button"
                    onClick={() => setActiveDayFilter(wd.day)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      activeDayFilter === wd.day
                        ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <span>{wd.short}</span>
                    {daySlotCount > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        activeDayFilter === wd.day ? "bg-white/20 text-white" : "bg-white/10 text-white/50"
                      }`}>
                        {daySlotCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />

            <button
              onClick={handleCopyMonday}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Copy Monday's schedule to Tuesday through Friday"
            >
              <Copy size={13} className="text-[#0A84FF]" />
              <span>Copy Mon to Tue–Fri</span>
            </button>

            <button
              onClick={handleApplyStandardTimings}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Reset slot timings to standard 9 AM - 5 PM periods"
            >
              <Clock size={13} className="text-amber-400" />
              <span>Reset 9 AM – 5 PM</span>
            </button>

            {slots.length > 0 && (
              <button
                onClick={() => setShowClearAllConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 transition-colors cursor-pointer"
                title="Clear all weekly classes and reset timetable"
              >
                <Trash2 size={13} className="text-rose-400" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {/* Periods per Day Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#8E8E93] text-xs">Periods:</span>
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
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Timetable Grid Matrix ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#8E8E93]">Loading weekly timetable...</p>
        </div>
      ) : layoutMode === "vertical" ? (
        /* ── Mobile / Vertical Stacked Cards View ────────────────────────────── */
        <div className="space-y-4">
          {/* Helpful notice for mobile layout */}
          <div className="flex sm:hidden items-center justify-between px-3.5 py-2 rounded-2xl bg-white/[0.03] border border-white/5 text-[11px] text-[#8E8E93]">
            <span className="flex items-center gap-1.5 font-medium text-white/70">
              <Rows3 size={13} className="text-[#0A84FF] shrink-0" />
              <span>Vertical Schedule &bull; Tap day above to switch</span>
            </span>
            <span className="text-[10px] font-mono text-[#0A84FF] bg-[#0A84FF]/10 px-2 py-0.5 rounded-full border border-[#0A84FF]/20 font-bold shrink-0">
              {visibleWeekdays.length === 1 ? visibleWeekdays[0].name : "All Days"}
            </span>
          </div>

          {visibleWeekdays.map((wd) => {
            const dayBlocks = getDayBlocks(wd.day, maxSlots, getSlot, isMergedView);
            const activeSlotsCount = slots.filter((s) => s.weekday === wd.day && s.subjectId).length;
            const multiHourCount = dayBlocks.filter((b) => b.span > 1 && b.subjectId).length;

            return (
              <div
                key={wd.day}
                className="p-4 rounded-3xl bg-[#121212] border border-white/[0.08] shadow-xl space-y-3.5"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-base tracking-tight">
                      {wd.name}
                    </span>
                    <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md">
                      {activeSlotsCount} class{activeSlotsCount === 1 ? "" : "es"}
                    </span>
                    {multiHourCount > 0 && (
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-md">
                        {multiHourCount} multi-hour
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleClearDay(wd.day)}
                    className="flex items-center gap-1 text-[11px] text-[#8E8E93] hover:text-rose-400 transition-colors cursor-pointer"
                    title="Clear all classes on this day"
                  >
                    <Trash2 size={12} />
                    <span>Clear Day</span>
                  </button>
                </div>

                {/* Vertical Stack of Period Cards */}
                <div className="space-y-3">
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
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                          selectedSubj
                            ? isLab
                              ? "bg-purple-950/25 border-purple-500/40 shadow-lg shadow-purple-950/20"
                              : isTutorial
                              ? "bg-cyan-950/25 border-cyan-500/40 shadow-lg"
                              : "bg-white/[0.04] border-white/10 shadow-sm"
                            : isLab
                            ? "bg-purple-950/15 border-purple-500/30"
                            : "bg-white/[0.015] border-white/5 border-dashed"
                        } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                      >
                        {/* Top Bar: Period / Time / Span badge / Clear */}
                        <div className="flex items-center justify-between gap-2 text-xs font-mono border-b border-white/[0.06] pb-2 mb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Period Badge */}
                            {isMultiHour ? (
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-tight uppercase border flex items-center gap-1 ${
                                  isLab
                                    ? "bg-purple-500/25 text-purple-300 border-purple-500/35"
                                    : isTutorial
                                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-500/35"
                                    : "bg-blue-500/25 text-blue-300 border-blue-500/35"
                                }`}
                              >
                                {isLab ? (
                                  <FlaskConical size={11} />
                                ) : isTutorial ? (
                                  <GraduationCap size={11} />
                                ) : (
                                  <BookOpen size={11} />
                                )}
                                <span>
                                  {block.span}h (P{block.startSlotIndex + 1}–{block.endSlotIndex + 1})
                                </span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/90 font-mono font-bold bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                                Period {block.startSlotIndex + 1}
                              </span>
                            )}

                            {/* Time Range */}
                            <div className="flex items-center gap-1 text-[11px] text-white/70 bg-white/5 px-2 py-0.5 rounded-md">
                              <Clock size={11} className="text-[#8E8E93]" />
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
                          </div>

                          {(block.subjectId || isMultiHour) && (
                            <button
                              type="button"
                              onClick={() => clearBlock(wd.day, block)}
                              className="text-white/40 hover:text-rose-400 p-1 rounded-md transition-colors cursor-pointer"
                              title="Clear slot / block"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {!isEditMode ? (
                          <div className="space-y-2 py-0.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {selectedSubj && (
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: selectedSubj.color }}
                                    />
                                  )}
                                  <h4 className="font-extrabold text-white text-base tracking-tight truncate">
                                    {selectedSubj
                                      ? selectedSubj.name
                                      : isMultiHour
                                      ? `${block.span}-Hour Class`
                                      : "Free Period"}
                                  </h4>
                                  {selectedSubj?.shortName && (
                                    <span className="text-[11px] font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-lg border border-white/15 shrink-0">
                                      {selectedSubj.shortName}
                                    </span>
                                  )}
                                  {selectedSubj?.code && (
                                    <span className="text-[10px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md border border-white/5 shrink-0">
                                      {selectedSubj.code}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-xs text-[#8E8E93] flex-wrap pt-0.5">
                                  {(block.room || selectedSubj?.defaultRoom) && (
                                    <span className="flex items-center gap-1 text-white/80">
                                      <MapPin size={12} className="text-[#0A84FF]" />
                                      <span>Room: {block.room || selectedSubj?.defaultRoom}</span>
                                    </span>
                                  )}
                                  {selectedSubj?.teacher && (
                                    <span className="flex items-center gap-1 text-white/60">
                                      <User size={12} />
                                      <span>Faculty: {selectedSubj.teacher}</span>
                                    </span>
                                  )}
                                  {!selectedSubj && (
                                    <span className="text-white/40 italic">Free slot (Tap Edit Timetable to assign)</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                    isLab
                                      ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                                      : isTutorial
                                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                                      : "bg-blue-500/15 border-blue-500/30 text-blue-300"
                                  }`}
                                >
                                  {isLab ? <FlaskConical size={12} /> : isTutorial ? <GraduationCap size={12} /> : <BookOpen size={12} />}
                                  <span>{isLab ? "Lab Practical" : isTutorial ? "Tutorial" : "Lecture"}</span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => setIsEditMode(true)}
                                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                  title="Edit schedule"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Subject Selection */}
                            <div className="space-y-2">
                              <div>
                                <select
                                  value={block.subjectId ? String(block.subjectId) : ""}
                                  onChange={(e) =>
                                    updateBlock(wd.day, block, {
                                      subjectId: e.target.value ? e.target.value : null,
                                    })
                                  }
                                  className="w-full text-sm font-bold rounded-xl bg-white/5 border border-white/10 py-2 px-3 text-white focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                                  style={{
                                    color: selectedSubj ? selectedSubj.color : "#8E8E93",
                                  }}
                                >
                                  <option value="" className="bg-[#1C1C1E] text-[#8E8E93]">
                                    {isMultiHour
                                      ? isLab
                                        ? `${block.span}-Hour Lab Practical`
                                        : isTutorial
                                        ? `${block.span}-Hour Tutorial`
                                        : `${block.span}-Hour Combined Class`
                                      : "Free Period (Tap to assign subject)"}
                                  </option>
                                  {subjects.map((subj) => (
                                    <option
                                      key={subj._id}
                                      value={subj._id}
                                      className="bg-[#1C1C1E] text-white"
                                    >
                                      {subj.shortName ? `[${subj.shortName}] ${subj.name}` : subj.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {selectedSubj && (
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/60 px-0.5">
                                  {selectedSubj.shortName && (
                                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono font-bold text-[10px]">
                                      {selectedSubj.shortName}
                                    </span>
                                  )}
                                  {selectedSubj.code && (
                                    <span className="text-white/40 font-mono text-[10px]">
                                      {selectedSubj.code}
                                    </span>
                                  )}
                                  {selectedSubj.teacher && (
                                    <span className="truncate max-w-[160px] text-white/50 text-[11px]">
                                      • {selectedSubj.teacher}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Type Toggle & Room in a 2-column grid */}
                              <div className="grid grid-cols-2 gap-2">
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
                                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer truncate ${
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
                                      <FlaskConical size={12} className="text-purple-300 shrink-0" />
                                      <span>Lab</span>
                                    </>
                                  ) : isTutorial ? (
                                    <>
                                      <GraduationCap size={12} className="text-cyan-300 shrink-0" />
                                      <span>Tutorial</span>
                                    </>
                                  ) : (
                                    <>
                                      <BookOpen size={12} className="text-blue-300 shrink-0" />
                                      <span>Lecture</span>
                                    </>
                                  )}
                                </button>

                                <input
                                  type="text"
                                  placeholder={isLab ? "Lab (e.g. Lab 3)" : "Room (e.g. LH-1)"}
                                  value={block.room || ""}
                                  onChange={(e) =>
                                    updateBlock(wd.day, block, { room: e.target.value })
                                  }
                                  className="text-xs bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#0A84FF] truncate"
                                />
                              </div>
                            </div>

                            {/* Duration Selector */}
                            <div className="pt-2.5 mt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                                  Duration
                                </span>
                                {isMultiHour && (
                                  <button
                                    type="button"
                                    onClick={() => setBlockSpan(wd.day, block, 1, "lecture")}
                                    className="text-[10px] text-rose-400/90 hover:text-rose-300 font-semibold transition-colors cursor-pointer"
                                    title="Split back to 1-hour slots"
                                  >
                                    Split 1h
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {([1, 2, 3, 4] as const).map((s) => {
                                  const isActive = block.span === s;
                                  return (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => setBlockSpan(wd.day, block, s)}
                                      className={`px-2.5 py-1 text-center rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                        isActive
                                          ? isLab
                                            ? "bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-600/30"
                                            : isTutorial
                                            ? "bg-cyan-500 text-black border-cyan-400 font-extrabold"
                                            : "bg-[#0A84FF] text-white border-[#0A84FF] shadow-sm shadow-[#0A84FF]/25"
                                          : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                                      }`}
                                      title={`Set duration to ${s} period${s > 1 ? "s" : ""} (${s} hour${s > 1 ? "s" : ""})`}
                                    >
                                      {s}h
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Mobile Swipe Hint */}
          <div className="flex sm:hidden items-center justify-between px-3.5 py-2 rounded-2xl bg-white/[0.03] border border-white/5 text-[11px] text-[#8E8E93]">
            <span className="flex items-center gap-1.5 font-medium text-white/70">
              <ArrowLeftRight size={13} className="text-[#0A84FF] shrink-0" />
              <span>Swipe horizontally to view all periods</span>
            </span>
            <span className="text-[10px] font-mono text-[#0A84FF] bg-[#0A84FF]/10 px-2 py-0.5 rounded-full border border-[#0A84FF]/20 font-bold shrink-0">
              P1 – P{maxSlots}
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-3xl border border-white/[0.08] bg-[#121212] shadow-xl scrollbar-thin">
          <div
            className="p-4 sm:p-5 space-y-3.5"
            style={{ minWidth: `${Math.max(1040, maxSlots * 140)}px` }}
          >
            {/* Bell Timings Header Strip */}
            <div
              className="grid gap-2.5 px-3 py-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-[11px] font-mono text-[#8E8E93]"
              style={{
                gridTemplateColumns: `repeat(${maxSlots}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: maxSlots }).map((_, i) => {
                const timing = getPeriodTiming(i);
                return (
                  <div
                    key={i}
                    className="text-center py-1.5 px-1 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  >
                    <span className="text-white/80 font-bold block text-xs">Period {i + 1}</span>
                    <div className="flex items-center justify-center gap-1 text-[10px] text-white/50 font-mono mt-0.5">
                      <TimeInput
                        value={timing.start}
                        onChange={(v) => updatePeriodTiming(i, v, timing.end)}
                      />
                      <span className="text-white/20">–</span>
                      <TimeInput
                        value={timing.end}
                        onChange={(v) => updatePeriodTiming(i, timing.start, v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Weekday Rows */}
            {visibleWeekdays.map((wd) => {
              const dayBlocks = getDayBlocks(wd.day, maxSlots, getSlot, isMergedView);
              const activeSlotsCount = slots.filter((s) => s.weekday === wd.day && s.subjectId).length;
              const multiHourCount = dayBlocks.filter((b) => b.span > 1 && b.subjectId).length;

              return (
                <div
                  key={wd.day}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3"
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-extrabold text-white text-sm sm:text-base tracking-tight">
                        {wd.name}
                      </span>
                      <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md">
                        {activeSlotsCount} class{activeSlotsCount === 1 ? "" : "es"}
                      </span>
                      {multiHourCount > 0 && (
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-md">
                          {multiHourCount} multi-hour
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

                  {/* Day Slots Grid: Multi-hour cards span proportionally across periods */}
                  <div
                    className="grid gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${maxSlots}, minmax(0, 1fr))`,
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
                          className={`p-2.5 rounded-2xl border transition-all flex flex-col justify-between relative group overflow-hidden ${
                            selectedSubj
                              ? isLab
                                ? "bg-purple-950/25 border-purple-500/40 hover:border-purple-500/60 shadow-lg shadow-purple-950/20"
                                : isTutorial
                                ? "bg-cyan-950/25 border-cyan-500/40 hover:border-cyan-500/60 shadow-lg"
                                : "bg-white/[0.04] border-white/10 hover:border-white/20 shadow-sm"
                              : isLab
                              ? "bg-purple-950/15 border-purple-500/30 hover:border-purple-500/50"
                              : "bg-white/[0.01] border-white/5 border-dashed hover:border-white/15"
                          } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                        >
                          {/* Top Row: Time Range + Period Badge + Delete */}
                          <div className="flex items-center justify-between gap-1 text-[10px] font-mono border-b border-white/[0.06] pb-1.5 mb-1.5">
                            <div className="flex items-center gap-0.5 min-w-0">
                              <TimeInput
                                value={block.startTime}
                                onChange={(v) =>
                                  updateSlot(wd.day, block.startSlotIndex, { startTime: v })
                                }
                              />
                              <span className="text-white/30 text-[9px]">–</span>
                              <TimeInput
                                value={block.endTime}
                                onChange={(v) =>
                                  updateSlot(wd.day, block.endSlotIndex, { endTime: v })
                                }
                              />
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Period Span Tag */}
                              {isMultiHour ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-tight uppercase border flex items-center gap-0.5 ${
                                    isLab
                                      ? "bg-purple-500/25 text-purple-300 border-purple-500/35"
                                      : isTutorial
                                      ? "bg-cyan-500/25 text-cyan-300 border-cyan-500/35"
                                      : "bg-blue-500/25 text-blue-300 border-blue-500/35"
                                  }`}
                                >
                                  {isLab ? <FlaskConical size={10} /> : isTutorial ? <GraduationCap size={10} /> : <BookOpen size={10} />}
                                  <span>
                                    {block.span}h (P{block.startSlotIndex + 1}–{block.endSlotIndex + 1})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-[9px] text-[#8E8E93] font-mono font-bold bg-white/5 px-1 py-0.5 rounded">
                                  P{block.startSlotIndex + 1}
                                </span>
                              )}

                              {(block.subjectId || isMultiHour) && (
                                <button
                                  type="button"
                                  onClick={() => clearBlock(wd.day, block)}
                                  className="text-white/30 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                                  title="Clear slot / block"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>

                          {!isEditMode ? (
                            <div className="space-y-1.5 flex-1 min-w-0 flex flex-col justify-between py-0.5">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {selectedSubj && (
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: selectedSubj.color }}
                                    />
                                  )}
                                  <h4 className="font-extrabold text-white text-xs tracking-tight truncate">
                                    {selectedSubj
                                      ? (selectedSubj.shortName ? `[${selectedSubj.shortName}] ${selectedSubj.name}` : selectedSubj.name)
                                      : isMultiHour
                                      ? `${block.span}-Hour Period`
                                      : "Free"}
                                  </h4>
                                </div>

                                <div className="space-y-0.5 pt-1 text-[10px] text-[#8E8E93]">
                                  {(block.room || selectedSubj?.defaultRoom) && (
                                    <p className="flex items-center gap-1 text-white/80 truncate">
                                      <MapPin size={10} className="text-[#0A84FF] shrink-0" />
                                      <span className="truncate">{block.room || selectedSubj?.defaultRoom}</span>
                                    </p>
                                  )}
                                  {selectedSubj?.teacher && (
                                    <p className="flex items-center gap-1 text-white/50 truncate">
                                      <User size={10} className="shrink-0" />
                                      <span className="truncate">{selectedSubj.teacher}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="pt-1 flex items-center justify-between gap-1 border-t border-white/[0.04]">
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border truncate ${
                                    isLab
                                      ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                                      : isTutorial
                                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                                      : "bg-blue-500/15 border-blue-500/30 text-blue-300"
                                  }`}
                                >
                                  {isLab ? "Lab" : isTutorial ? "Tutorial" : "Lecture"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setIsEditMode(true)}
                                  className="text-white/30 hover:text-white p-0.5 transition-colors cursor-pointer"
                                  title="Edit slot"
                                >
                                  <Edit2 size={10} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Middle: Subject & Room */}
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div>
                                  <select
                                    value={block.subjectId ? String(block.subjectId) : ""}
                                    onChange={(e) =>
                                      updateBlock(wd.day, block, {
                                        subjectId: e.target.value ? e.target.value : null,
                                      })
                                    }
                                    className="w-full text-xs font-bold rounded-xl bg-white/5 border border-white/10 py-1.5 px-2 text-white focus:outline-none focus:border-[#0A84FF] cursor-pointer truncate"
                                    style={{
                                      color: selectedSubj ? selectedSubj.color : "#8E8E93",
                                    }}
                                  >
                                    <option value="" className="bg-[#1C1C1E] text-[#8E8E93]">
                                      {isMultiHour
                                        ? isLab
                                          ? `${block.span}-Hour Lab Practical`
                                          : isTutorial
                                          ? `${block.span}-Hour Tutorial`
                                          : `${block.span}-Hour Combined Class`
                                        : "Free Slot"}
                                    </option>
                                    {subjects.map((subj) => (
                                      <option
                                        key={subj._id}
                                        value={subj._id}
                                        className="bg-[#1C1C1E] text-white"
                                      >
                                        {subj.shortName ? `[${subj.shortName}] ${subj.name}` : subj.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {selectedSubj && (
                                  <div className="flex items-center gap-1 text-[10px] text-white/50 truncate px-0.5">
                                    {selectedSubj.shortName && (
                                      <span className="px-1 py-0.2 rounded bg-white/10 text-white font-mono font-bold text-[9px] shrink-0">
                                        {selectedSubj.shortName}
                                      </span>
                                    )}
                                    {selectedSubj.teacher && (
                                      <span className="truncate text-white/40">
                                        {selectedSubj.teacher}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Slot Type Toggle */}
                                <div className="flex items-center gap-1">
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
                                    className={`w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer truncate ${
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
                                        <FlaskConical size={11} className="text-purple-300 shrink-0" />
                                        <span>Lab</span>
                                      </>
                                    ) : isTutorial ? (
                                      <>
                                        <GraduationCap size={11} className="text-cyan-300 shrink-0" />
                                        <span>Tutorial</span>
                                      </>
                                    ) : (
                                      <>
                                        <BookOpen size={11} className="text-blue-300 shrink-0" />
                                        <span>Lecture</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                {/* Room Input */}
                                <div>
                                  <input
                                    type="text"
                                    placeholder={isLab ? "Lab (e.g. Lab 3)" : "Room (e.g. LH-1)"}
                                    value={block.room || ""}
                                    onChange={(e) =>
                                      updateBlock(wd.day, block, { room: e.target.value })
                                    }
                                    className="w-full text-[11px] bg-transparent border-b border-white/10 py-0.5 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#0A84FF] truncate"
                                  />
                                </div>
                              </div>

                              {/* Bottom Row: Duration Adjuster Grid & Reset Action */}
                              <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
                                <div className="flex items-center justify-between text-[9px] text-white/40">
                                  <span className="font-semibold uppercase tracking-wider text-[8px]">Duration</span>
                                  {isMultiHour ? (
                                    <button
                                      type="button"
                                      onClick={() => setBlockSpan(wd.day, block, 1, "lecture")}
                                      className="text-[9px] text-rose-400/90 hover:text-rose-300 font-semibold transition-colors cursor-pointer"
                                      title="Split back to 1-hour slots"
                                    >
                                      Split 1h
                                    </button>
                                  ) : (
                                    <span className="text-[8px] text-white/30 font-mono">1 period</span>
                                  )}
                                </div>

                                <div className="grid grid-cols-4 gap-1 w-full">
                                  {([1, 2, 3, 4] as const).map((s) => {
                                    const isActive = block.span === s;
                                    return (
                                      <button
                                        key={s}
                                        type="button"
                                        onClick={() => setBlockSpan(wd.day, block, s)}
                                        className={`w-full py-1 text-center rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                          isActive
                                            ? isLab
                                              ? "bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-600/30"
                                              : isTutorial
                                              ? "bg-cyan-500 text-black border-cyan-400 font-extrabold"
                                              : "bg-[#0A84FF] text-white border-[#0A84FF] shadow-sm shadow-[#0A84FF]/25"
                                            : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                                        }`}
                                        title={`Set duration to ${s} period${s > 1 ? "s" : ""} (${s} hour${s > 1 ? "s" : ""})`}
                                      >
                                        {s}h
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
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
              <h3 className="text-base font-bold text-white">Reset & Clear Weekly Timetable?</h3>
              <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
                This will immediately remove all classes across Monday to Sunday from your account. You can then scan a new timetable or set up classes fresh.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                disabled={isClearing}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllSlots}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-lg shadow-rose-500/25 cursor-pointer disabled:opacity-50"
              >
                {isClearing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <span>Yes, Clear Everything</span>
                )}
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
          onApplySlots={async (newSlots, replaceExisting = true) => {
            try {
              const refreshedSubjects = await attendanceApi.getSubjects();
              setSubjects(refreshedSubjects);
            } catch (e) {
              console.error("Failed to refresh subjects", e);
            }

            const finalSlots = replaceExisting
              ? newSlots
              : (() => {
                  const prevMap = new Map<string, TimetableSlot>();
                  slots.forEach((s) => prevMap.set(`${s.weekday}_${s.slotIndex}`, s));
                  newSlots.forEach((s) => prevMap.set(`${s.weekday}_${s.slotIndex}`, s));
                  return Array.from(prevMap.values());
                })();

            setSlots(finalSlots);

            const maxIdx = Math.max(0, ...finalSlots.map((s) => s.slotIndex));
            if (maxIdx + 1 > maxSlots) {
              setMaxSlots(Math.min(10, maxIdx + 1));
            }

            // Immediately save to server so imported slots persist
            try {
              await attendanceApi.saveTimetable(finalSlots, applyFrom);
            } catch (err) {
              console.error("Auto-save imported timetable failed", err);
            }

            showToast(
              `Imported ${newSlots.length} periods & updated subjects! Saved to timetable.`
            );
          }}
        />
      )}
    </div>
  );
}
