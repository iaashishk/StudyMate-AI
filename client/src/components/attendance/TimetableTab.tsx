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
  Trash2,
  UploadCloud,
  Plus,
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

export interface TimetableClass {
  id: string;
  weekday: number;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "13:00"
  subjectId: string | null;
  slotType: "lecture" | "lab" | "tutorial";
  room: string;
}

/** Parses "HH:mm" to total minutes */
function parseMins(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Formats minutes back to "HH:mm" */
function formatMins(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Calculates duration in hours (rounded to 1 decimal if non-integer) */
function getDurationHours(startTime: string, endTime: string): number {
  const start = parseMins(startTime);
  const end = parseMins(endTime);
  const diff = Math.max(30, end - start);
  const hrs = diff / 60;
  return Number(hrs.toFixed(1));
}

/** Compact native time input */
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
      title="Click to edit bell time"
    >
      <span
        onClick={() => ref.current?.showPicker?.() ?? ref.current?.click()}
        className="text-white font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 group-hover:text-[#0A84FF] transition-colors border border-white/10"
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

/**
 * Consolidates raw database slots into dynamic Class blocks.
 * If 4 consecutive 1-hour slots are for the same subject & type,
 * they are merged into ONE single 4-hour class (e.g. 09:00 to 13:00).
 */
function consolidateSlots(rawSlots: TimetableSlot[]): TimetableClass[] {
  const classes: TimetableClass[] = [];

  for (const wd of WEEKDAYS) {
    const daySlots = rawSlots
      .filter((s) => s.weekday === wd.day && s.subjectId)
      .sort((a, b) => a.slotIndex - b.slotIndex || parseMins(a.startTime) - parseMins(b.startTime));

    for (const slot of daySlots) {
      const subjId =
        typeof slot.subjectId === "object" && slot.subjectId !== null
          ? (slot.subjectId as any)._id
          : slot.subjectId;

      const lastClass = classes[classes.length - 1];

      // Merge if same day, same non-null subject, and same slotType
      const canMerge =
        lastClass &&
        lastClass.weekday === wd.day &&
        lastClass.subjectId === subjId &&
        lastClass.slotType === (slot.slotType || "lecture");

      if (canMerge) {
        lastClass.endTime = slot.endTime || lastClass.endTime;
        if (!lastClass.room && slot.room) lastClass.room = slot.room;
      } else {
        classes.push({
          id: slot._id || `${wd.day}_${classes.length}_${Date.now()}`,
          weekday: wd.day,
          startTime: slot.startTime || "09:00",
          endTime: slot.endTime || "10:00",
          subjectId: subjId || null,
          slotType: slot.slotType || "lecture",
          room: slot.room || "",
        });
      }
    }
  }

  return classes;
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
  const [classes, setClasses] = useState<TimetableClass[]>([]);
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
        const consolidated = consolidateSlots(ttData.slots);
        setClasses(consolidated);
      } catch (err) {
        console.error("Failed to load timetable", err);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const addClass = (
    weekday: number,
    preset?: {
      startTime: string;
      endTime: string;
      slotType: "lecture" | "lab" | "tutorial";
    }
  ) => {
    const dayClasses = classes.filter((c) => c.weekday === weekday);
    let startTime = "09:00";
    let endTime = "10:00";
    let slotType: "lecture" | "lab" | "tutorial" = preset?.slotType || "lecture";

    if (preset) {
      startTime = preset.startTime;
      endTime = preset.endTime;
    } else if (dayClasses.length > 0) {
      // Auto-set start time to the end time of the previous class
      const lastClass = dayClasses[dayClasses.length - 1];
      startTime = lastClass.endTime;
      const endMins = parseMins(startTime) + 60;
      endTime = formatMins(endMins);
    }

    const newClass: TimetableClass = {
      id: `class_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      weekday,
      startTime,
      endTime,
      subjectId: subjects[0]?._id || null,
      slotType,
      room: "",
    };

    setClasses((prev) => [...prev, newClass]);
    showToast(
      `Added ${getDurationHours(startTime, endTime)}h ${slotType === "lab" ? "Lab" : "Class"}`
    );
  };

  const updateClass = (id: string, changes: Partial<TimetableClass>) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c))
    );
  };

  const setClassDuration = (id: string, targetHours: number) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const startMins = parseMins(c.startTime);
        const newEndMins = startMins + targetHours * 60;
        return {
          ...c,
          endTime: formatMins(newEndMins),
          slotType: targetHours >= 3 ? "lab" : c.slotType,
        };
      })
    );
    showToast(`Class duration adjusted to ${targetHours} Hours`);
  };

  const deleteClass = (id: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    showToast("Class removed from schedule");
  };

  const handleClearDay = (weekday: number) => {
    setClasses((prev) => prev.filter((c) => c.weekday !== weekday));
    showToast("All classes cleared for this day");
  };

  const handleClearAll = () => {
    setClasses([]);
    setShowClearAllConfirm(false);
    showToast("Cleared all weekly classes. Click 'Save Timetable' to commit.");
  };

  const handleCopyMonday = () => {
    const mondayClasses = classes.filter((c) => c.weekday === 1);
    if (mondayClasses.length === 0) {
      showToast("Monday schedule is empty. Please configure Monday first!");
      return;
    }

    setClasses((prev) => {
      const others = prev.filter((c) => ![2, 3, 4, 5].includes(c.weekday));
      const copied: TimetableClass[] = [];

      for (let day = 2; day <= 5; day++) {
        mondayClasses.forEach((mc) => {
          copied.push({
            ...mc,
            id: `copy_${day}_${mc.id}_${Math.random().toString(36).substring(2, 5)}`,
            weekday: day,
          });
        });
      }
      return [...others, ...copied];
    });

    showToast("Copied Monday classes (including multi-hour labs) to Tue–Fri!");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Map classes into backend TimetableSlots
      const validSlots: Array<Partial<TimetableSlot>> = [];

      for (const wd of WEEKDAYS) {
        const dayClasses = classes
          .filter((c) => c.weekday === wd.day && c.subjectId)
          .sort((a, b) => parseMins(a.startTime) - parseMins(b.startTime));

        dayClasses.forEach((c, slotIndex) => {
          validSlots.push({
            weekday: c.weekday,
            slotIndex,
            startTime: c.startTime,
            endTime: c.endTime,
            room: c.room || "",
            slotType: c.slotType,
            subjectId: c.subjectId,
          });
        });
      }

      const res = await attendanceApi.saveTimetable(validSlots as TimetableSlot[], applyFrom);
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

      {/* ── Toolbar Header ─────────────────────────────────────────────────── */}
      <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-[#0A84FF]" />
              <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                Weekly Timetable Builder
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93]">
              Dynamic schedule builder. Multi-hour labs and classes are rendered in unified, continuous blocks.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
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
              title="Scan routine PDF or image"
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
            <button
              onClick={handleCopyMonday}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Copy Monday's schedule to Tuesday through Friday"
            >
              <Copy size={13} className="text-[#0A84FF]" />
              <span>Copy Monday to Tue–Fri</span>
            </button>

            {classes.length > 0 && (
              <button
                onClick={() => setShowClearAllConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 transition-colors cursor-pointer"
                title="Clear all weekly classes"
              >
                <Trash2 size={13} className="text-rose-400" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-[#8E8E93] hidden md:flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Lab Practical
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] inline-block" /> Lecture
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Tutorial
            </span>
          </div>
        </div>
      </div>

      {/* ── Dynamic Weekly Routine Rows ────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#8E8E93]">Loading weekly timetable...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {WEEKDAYS.map((wd) => {
            const dayClasses = classes
              .filter((c) => c.weekday === wd.day)
              .sort((a, b) => parseMins(a.startTime) - parseMins(b.startTime));

            const totalHours = dayClasses.reduce(
              (sum, c) => sum + getDurationHours(c.startTime, c.endTime),
              0
            );

            return (
              <div
                key={wd.day}
                className="p-4 sm:p-5 rounded-3xl bg-[#141414] border border-white/[0.07] space-y-3.5 shadow-sm"
              >
                {/* Day Header Row */}
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-extrabold text-white text-base tracking-tight">
                      {wd.name}
                    </span>
                    <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md">
                      {dayClasses.length} class{dayClasses.length === 1 ? "" : "es"}
                      {totalHours > 0 ? ` · ${totalHours} hrs` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addClass(wd.day)}
                      className="flex items-center gap-1 text-xs text-[#0A84FF] hover:text-[#0A84FF]/80 font-semibold px-2 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      title="Add a class or lab to this day"
                    >
                      <Plus size={14} />
                      <span>Add Class</span>
                    </button>

                    {dayClasses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearDay(wd.day)}
                        className="flex items-center gap-1 text-xs text-[#8E8E93] hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                        title="Clear all classes for this day"
                      >
                        <Trash2 size={13} />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Day Classes: Dynamic Proportional Rectangles (NO HORIZONTAL OVERFLOW) */}
                {dayClasses.length === 0 ? (
                  <div className="py-4 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <span className="text-[#8E8E93]">No classes scheduled for {wd.name}.</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          addClass(wd.day, {
                            startTime: "09:00",
                            endTime: "13:00",
                            slotType: "lab",
                          })
                        }
                        className="px-2.5 py-1 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 font-semibold transition-colors cursor-pointer"
                      >
                        + 4h Lab (09:00 – 13:00)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addClass(wd.day, {
                            startTime: "13:00",
                            endTime: "15:00",
                            slotType: "lecture",
                          })
                        }
                        className="px-2.5 py-1 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-semibold transition-colors cursor-pointer"
                      >
                        + 2h Class (13:00 – 15:00)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addClass(wd.day, {
                            startTime: "15:00",
                            endTime: "17:00",
                            slotType: "lecture",
                          })
                        }
                        className="px-2.5 py-1 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-semibold transition-colors cursor-pointer"
                      >
                        + 2h Class (15:00 – 17:00)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row items-stretch gap-3 w-full">
                    {dayClasses.map((item) => {
                      const duration = getDurationHours(item.startTime, item.endTime);
                      const isLab = item.slotType === "lab";
                      const isTutorial = item.slotType === "tutorial";
                      const selectedSubj = subjects.find(
                        (s) => String(s._id) === String(item.subjectId)
                      );
                      const isDimmed =
                        selectedSubjectFilter !== "all" &&
                        item.subjectId &&
                        String(item.subjectId) !== selectedSubjectFilter;

                      // Proportional flex basis based on duration (e.g. 4h lab gets 2x width of 2h class)
                      const flexGrowClass =
                        duration >= 4
                          ? "flex-[4] min-w-[260px]"
                          : duration >= 3
                          ? "flex-[3] min-w-[220px]"
                          : duration >= 2
                          ? "flex-[2] min-w-[190px]"
                          : "flex-[1] min-w-[150px]";

                      return (
                        <div
                          key={item.id}
                          className={`${flexGrowClass} p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 relative ${
                            isLab
                              ? "bg-purple-950/20 border-purple-500/35 hover:border-purple-500/50 shadow-md shadow-purple-950/20"
                              : isTutorial
                              ? "bg-cyan-950/20 border-cyan-500/35 hover:border-cyan-500/50"
                              : "bg-white/[0.04] border-white/10 hover:border-white/20"
                          } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                        >
                          {/* Top Row: Time Range & Duration Tag */}
                          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <TimeInput
                                value={item.startTime}
                                onChange={(v) => updateClass(item.id, { startTime: v })}
                              />
                              <span className="text-white/40">–</span>
                              <TimeInput
                                value={item.endTime}
                                onChange={(v) => updateClass(item.id, { endTime: v })}
                              />
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Duration Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-tight border flex items-center gap-1 ${
                                  isLab
                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                    : isTutorial
                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                    : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                }`}
                              >
                                {isLab ? (
                                  <FlaskConical size={10} />
                                ) : isTutorial ? (
                                  <GraduationCap size={10} />
                                ) : (
                                  <BookOpen size={10} />
                                )}
                                <span>
                                  {duration} {duration === 1 ? "Hr" : "Hrs"}{" "}
                                  {isLab ? "Lab" : "Class"}
                                </span>
                              </span>

                              {/* Delete Class Button */}
                              <button
                                type="button"
                                onClick={() => deleteClass(item.id)}
                                className="p-1 rounded-md text-white/40 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                                title="Remove this class"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Middle: Subject Selector */}
                          <div className="space-y-2 flex-1">
                            <div>
                              <select
                                value={item.subjectId ? String(item.subjectId) : ""}
                                onChange={(e) =>
                                  updateClass(item.id, {
                                    subjectId: e.target.value ? e.target.value : null,
                                  })
                                }
                                className="w-full text-xs font-bold rounded-xl bg-white/5 border border-white/10 py-1.5 px-2.5 text-white focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                                style={{
                                  color: selectedSubj ? selectedSubj.color : "#FFFFFF",
                                }}
                              >
                                <option value="" className="bg-[#1C1C1E] text-[#8E8E93]">
                                  Select Subject...
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

                            {/* Room / Lab Name */}
                            <div>
                              <input
                                type="text"
                                placeholder={
                                  isLab ? "Lab Name (e.g. Lab 4)" : "Room (e.g. LH-101)"
                                }
                                value={item.room || ""}
                                onChange={(e) => updateClass(item.id, { room: e.target.value })}
                                className="w-full text-[11px] bg-transparent border-b border-white/10 py-0.5 text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#0A84FF]"
                              />
                            </div>
                          </div>

                          {/* Bottom Row: Type Switcher & Quick Duration Adjuster */}
                          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-1 flex-wrap text-[10px]">
                            {/* Type Switcher */}
                            <div className="flex items-center gap-1">
                              {(["lab", "lecture", "tutorial"] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => updateClass(item.id, { slotType: t })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold capitalize transition-all cursor-pointer ${
                                    item.slotType === t
                                      ? t === "lab"
                                        ? "bg-purple-500 text-white"
                                        : t === "tutorial"
                                        ? "bg-cyan-500 text-black"
                                        : "bg-[#0A84FF] text-white"
                                      : "bg-white/5 text-white/50 hover:text-white"
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>

                            {/* Quick Duration Preset Buttons */}
                            <div className="flex items-center gap-1 ml-auto">
                              <span className="text-white/40 text-[9px]">Set:</span>
                              {[1, 2, 3, 4].map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setClassDuration(item.id, h)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                    duration === h
                                      ? "bg-white/20 text-white border border-white/30"
                                      : "bg-white/5 text-white/50 hover:text-white hover:bg-white/10"
                                  }`}
                                  title={`Set duration to ${h} hour${h > 1 ? "s" : ""}`}
                                >
                                  {h}h
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
                onClick={handleClearAll}
                className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-lg shadow-rose-500/25 cursor-pointer"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timetable Scanner Modal */}
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

            const consolidated = consolidateSlots(newSlots);
            setClasses((prev) => {
              const merged = [...prev];
              for (const c of consolidated) {
                const idx = merged.findIndex(
                  (m) => m.weekday === c.weekday && m.startTime === c.startTime
                );
                if (idx >= 0) merged[idx] = c;
                else merged.push(c);
              }
              return merged;
            });

            showToast(
              `Imported ${consolidated.length} classes! Click "Save Timetable" to commit.`
            );
          }}
        />
      )}
    </div>
  );
}
