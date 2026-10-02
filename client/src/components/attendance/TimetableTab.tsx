import { useState, useEffect } from "react";
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

const DEFAULT_TIMES = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:15", end: "12:15" },
  { start: "12:15", end: "13:15" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
];

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
  const [maxSlots, setMaxSlots] = useState(6);
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
        setMaxSlots(ttData.maxSlots || 6);

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

  // Quick Action: Copy Monday schedule to Tue-Fri
  const handleCopyMondayToWeekdays = () => {
    const mondaySlots = slots.filter((s) => s.weekday === 1);
    if (mondaySlots.length === 0) {
      showToast("Monday timetable is empty. Please set up Monday first!");
      return;
    }

    setSlots((prev) => {
      // Remove Tue-Fri slots
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

    showToast("Copied Monday schedule to Tuesday through Friday!");
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

      const res = await attendanceApi.saveTimetable(validSlots, applyFrom);
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-[#0A84FF]" />
              <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                Weekly Timetable Builder
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                SMART VERSIONING
              </span>
            </div>
            <p className="text-xs text-[#8E8E93] flex items-center gap-1.5">
              <Info size={13} className="shrink-0 text-white/50" />
              Changes are versioned by effective date. Past attendance logs remain 100% untouched.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Filter by subject (FR-T6) */}
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

            {/* Apply From Date Picker (FR-T4) */}
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

            <button
              onClick={() => setIsParserModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer"
              title="Scan photo or PDF of class routine to auto-populate timetable"
            >
              <UploadCloud size={14} />
              <span>Scan Timetable (Image/PDF)</span>
            </button>

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
        <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[#8E8E93]">Quick Helpers:</span>

          <button
            onClick={handleCopyMondayToWeekdays}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Copy Monday's lecture and lab schedule to Tuesday through Friday"
          >
            <Copy size={13} className="text-[#0A84FF]" />
            <span>Copy Mon to Tue-Fri</span>
          </button>

          <button
            onClick={handleApplyStandardTimings}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Reset slot timings to standard 9 AM - 4 PM periods"
          >
            <Clock size={13} className="text-amber-400" />
            <span>Reset 9 AM – 4 PM Timings</span>
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

          <span className="text-[#8E8E93] text-[11px] ml-auto hidden sm:inline">
            Tip: Toggle <b>Lab / Lecture / Tutorial</b> badge on any slot
          </span>
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
          <div className="min-w-[980px] space-y-4">
            {WEEKDAYS.map((wd) => {
              const daySlotsCount = slots.filter((s) => s.weekday === wd.day && s.subjectId).length;

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
                        {daySlotsCount} active session{daySlotsCount === 1 ? "" : "s"}
                      </span>
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

                  {/* Slots row */}
                  <div className="grid grid-cols-6 gap-3">
                    {Array.from({ length: maxSlots }).map((_, slotIdx) => {
                      const slot = getSlot(wd.day, slotIdx);
                      const selectedSubj = subjects.find(
                        (s) => String(s._id) === String(slot.subjectId)
                      );
                      const isDimmed =
                        selectedSubjectFilter !== "all" &&
                        slot.subjectId &&
                        String(slot.subjectId) !== selectedSubjectFilter;

                      const slotType = slot.slotType || "lecture";

                      return (
                        <div
                          key={slotIdx}
                          className={`p-3 rounded-2xl border transition-all space-y-2 relative ${
                            selectedSubj
                              ? "bg-white/[0.04] border-white/10"
                              : "bg-white/[0.01] border-white/5 border-dashed"
                          } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                        >
                          {/* Time Header */}
                          <div className="flex items-center justify-between gap-1 text-[10px] text-[#8E8E93] font-mono">
                            <div className="flex items-center gap-0.5">
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) =>
                                  updateSlot(wd.day, slotIdx, { startTime: e.target.value })
                                }
                                className="w-13 bg-transparent text-white/90 focus:outline-none"
                              />
                              <span>–</span>
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) =>
                                  updateSlot(wd.day, slotIdx, { endTime: e.target.value })
                                }
                                className="w-13 bg-transparent text-white/90 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Subject Picker */}
                          <div>
                            <select
                              value={slot.subjectId ? String(slot.subjectId) : ""}
                              onChange={(e) =>
                                updateSlot(wd.day, slotIdx, {
                                  subjectId: e.target.value ? e.target.value : null,
                                })
                              }
                              className="w-full text-xs font-bold rounded-xl bg-white/5 border border-white/10 py-1.5 px-2 text-white focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                              style={{
                                color: selectedSubj ? selectedSubj.color : "#8E8E93",
                              }}
                            >
                              <option value="" className="bg-[#1C1C1E] text-[#8E8E93]">
                                Free Slot
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

                          {/* Slot Type Toggle: Lecture / Lab / Tutorial */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const nextType =
                                  slotType === "lecture"
                                    ? "lab"
                                    : slotType === "lab"
                                    ? "tutorial"
                                    : "lecture";
                                updateSlot(wd.day, slotIdx, { slotType: nextType });
                              }}
                              className={`w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                slotType === "lab"
                                  ? "bg-purple-500/20 border-purple-500/35 text-purple-300"
                                  : slotType === "tutorial"
                                  ? "bg-cyan-500/20 border-cyan-500/35 text-cyan-300"
                                  : "bg-white/5 border-white/10 text-white/70 hover:text-white"
                              }`}
                              title="Click to toggle Lecture / Lab / Tutorial"
                            >
                              {slotType === "lab" ? (
                                <>
                                  <FlaskConical size={11} />
                                  <span>Lab</span>
                                </>
                              ) : slotType === "tutorial" ? (
                                <>
                                  <GraduationCap size={11} />
                                  <span>Tutorial</span>
                                </>
                              ) : (
                                <>
                                  <BookOpen size={11} />
                                  <span>Lecture</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Room input */}
                          <div>
                            <input
                              type="text"
                              placeholder="Room / Lab No."
                              value={slot.room || ""}
                              onChange={(e) =>
                                updateSlot(wd.day, slotIdx, { room: e.target.value })
                              }
                              className="w-full text-[11px] bg-transparent border-b border-white/10 py-0.5 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#0A84FF]"
                            />
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
                This will unassign all classes across Monday to Sunday. Click <strong>"Save Timetable"</strong> afterwards to commit the changes.
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
            showToast(`Imported ${newSlots.length} sessions! Click "Save Timetable" to commit.`);
          }}
        />
      )}
    </div>
  );
}
