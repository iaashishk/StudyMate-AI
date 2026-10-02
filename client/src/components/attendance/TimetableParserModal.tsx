import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Sparkles,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  BookOpen,
  Trash2,
  Clock,
  MapPin,
  CheckSquare,
  Square,
} from "lucide-react";
import { AttendanceSubject, TimetableSlot } from "../../types/attendance";
import { extractSyllabusFromFile, type ExtractionProgress } from "../../lib/file-extractor";
import {
  parseTimetableDocFromText,
  type ParsedTimetableSlotResult,
  type ParsedTimetableDocResult,
} from "../../lib/timetable-parser";
import { attendanceApi } from "../../lib/attendance-api";

interface TimetableParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: AttendanceSubject[];
  onApplySlots: (slots: TimetableSlot[]) => Promise<void>;
}

export default function TimetableParserModal({
  isOpen,
  onClose,
  subjects,
  onApplySlots,
}: TimetableParserModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [detectedDoc, setDetectedDoc] = useState<ParsedTimetableDocResult | null>(null);
  const [parsedSlots, setParsedSlots] = useState<ParsedTimetableSlotResult[]>([]);
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = async (selectedFile: File) => {
    setFileName(selectedFile.name);
    setError(null);
    setExtracting(true);
    setExtractionProgress({ stage: "reading", progress: 10, message: "Reading timetable circular…" });

    try {
      const { text } = await extractSyllabusFromFile(selectedFile, (p) => {
        setExtractionProgress(p);
      });

      const res = parseTimetableDocFromText(text, subjects);
      setDetectedDoc(res);
      setParsedSlots(res.slots);

      // Select all detected slots by default
      const allKeys = new Set(res.slots.map((s) => `${s.weekday}_${s.slotIndex}`));
      setSelectedSlotKeys(allKeys);

      if (res.slots.length === 0) {
        setError(
          "We read the file, but could not detect timetable periods. Ensure the schedule has clear subject codes, days, or time intervals."
        );
      }
    } catch (err: unknown) {
      console.error("Extraction error", err);
      setError((err as Error)?.message || "Failed to parse timetable file.");
    } finally {
      setExtracting(false);
    }
  };

  const toggleSelectSlot = (key: string) => {
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedSlotKeys(new Set(parsedSlots.map((s) => `${s.weekday}_${s.slotIndex}`)));
  };

  const handleDeselectAll = () => {
    setSelectedSlotKeys(new Set());
  };

  const handleDeleteSlot = (key: string) => {
    setParsedSlots((prev) => prev.filter((s) => `${s.weekday}_${s.slotIndex}` !== key));
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleSubjectChange = (slotKey: string, newSubjectId: string) => {
    setParsedSlots((prev) =>
      prev.map((s) => {
        if (`${s.weekday}_${s.slotIndex}` === slotKey) {
          if (newSubjectId === "__new__") {
            return { ...s, matchedSubjectId: null };
          }
          const matchedSubj = subjects.find((sub) => sub._id === newSubjectId);
          return {
            ...s,
            matchedSubjectId: newSubjectId,
            subjectName: matchedSubj ? matchedSubj.name : s.subjectName,
          };
        }
        return s;
      })
    );
  };

  const handleApply = async () => {
    const slotsToApply = parsedSlots.filter((s) =>
      selectedSlotKeys.has(`${s.weekday}_${s.slotIndex}`)
    );
    if (slotsToApply.length === 0) return;

    setIsApplying(true);
    try {
      // 1. Auto-sync effective semester start date if detected in timetable header
      if (detectedDoc?.effectiveStartDate) {
        await attendanceApi.updateSemester({ startDate: detectedDoc.effectiveStartDate });
      }

      // 2. Auto-sync max slots per day and minimum attendance requirement
      if (detectedDoc?.maxSlotsPerDay || detectedDoc?.defaultMinPercent) {
        await attendanceApi.updateSettings({
          maxSlots: detectedDoc.maxSlotsPerDay,
          defaultMinPercent: detectedDoc.defaultMinPercent,
        });
      }

      // 3. Auto-create any missing subjects so slots aren't blank!
      const unmappedNames = Array.from(
        new Set(
          slotsToApply
            .filter((s) => !s.matchedSubjectId && s.subjectName.trim().length > 0)
            .map((s) => s.subjectName.trim())
        )
      );

      const newlyCreatedMap: Record<string, string> = {};
      for (const name of unmappedNames) {
        try {
          const newSubj = await attendanceApi.createSubject({
            name,
            code: "",
            teacher: "",
          });
          newlyCreatedMap[name] = newSubj._id;
        } catch (err) {
          console.error("Auto-create subject error:", name, err);
        }
      }

      // 4. Construct final TimetableSlot array
      const timetableSlots: TimetableSlot[] = slotsToApply.map((s) => ({
        weekday: s.weekday,
        slotIndex: s.slotIndex,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        slotType: s.slotType,
        subjectId: s.matchedSubjectId || newlyCreatedMap[s.subjectName.trim()] || null,
      }));

      await onApplySlots(timetableSlots);
      onClose();
    } catch (err) {
      console.error("Apply slots failed", err);
      setError("Failed to apply slots to timetable");
    } finally {
      setIsApplying(false);
    }
  };

  const selectedCount = parsedSlots.filter((s) =>
    selectedSlotKeys.has(`${s.weekday}_${s.slotIndex}`)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#18181B] border border-white/10 rounded-3xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF]">
            <CalendarDays size={20} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white tracking-tight">
              Universal Timetable Scanner
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Supports all university grid formats: Days as Rows, Days as Columns, or Period Lists.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload Drop Zone */}
        {parsedSlots.length === 0 && !extracting && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-[#0A84FF]/60 rounded-3xl p-8 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Drag &amp; drop your class routine photo or PDF here
              </p>
              <p className="text-xs text-[#8E8E93] mt-1">
                Auto-detects timing grids, filters lunch breaks, assigns rooms, and matches subjects
              </p>
            </div>
          </div>
        )}

        {/* Extraction Progress */}
        {extracting && extractionProgress && (
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-white">{extractionProgress.message}</p>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#0A84FF] transition-all duration-300"
                style={{ width: `${extractionProgress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Parsed Slots Preview */}
        {parsedSlots.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Detected {parsedSlots.length} Classes {fileName && <span className="text-[#8E8E93] font-normal font-mono text-[10px]">({fileName})</span>}
                </span>
              </div>
              <button
                onClick={() => {
                  setDetectedDoc(null);
                  setParsedSlots([]);
                  setSelectedSlotKeys(new Set());
                  setFileName(null);
                }}
                className="text-xs text-[#8E8E93] hover:text-white cursor-pointer"
              >
                Scan Another Schedule
              </button>
            </div>

            {/* Auto-Detected Timetable & Semester Settings Card */}
            {(detectedDoc?.effectiveStartDate || detectedDoc?.defaultMinPercent || (detectedDoc?.maxSlotsPerDay && detectedDoc.maxSlotsPerDay > 6)) && (
              <div className="p-3.5 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/25 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0A84FF]">
                  <Sparkles size={14} />
                  <span>Auto-Detected Academic Parameters</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {detectedDoc?.effectiveStartDate && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Semester Commencement (W.E.F.)</span>
                      <span className="font-mono text-white font-semibold">{detectedDoc.effectiveStartDate}</span>
                    </div>
                  )}
                  {detectedDoc?.defaultMinPercent && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Min Attendance Target</span>
                      <span className="font-mono text-emerald-400 font-semibold">{detectedDoc.defaultMinPercent}%</span>
                    </div>
                  )}
                  {detectedDoc?.maxSlotsPerDay && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Daily Capacity</span>
                      <span className="font-mono text-white font-semibold">{detectedDoc.maxSlotsPerDay} slots/day</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bulk Select Bar */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-xs">
              <span className="text-[#8E8E93]">
                <strong className="text-white">{selectedCount}</strong> of {parsedSlots.length} sessions selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[#0A84FF] hover:underline cursor-pointer font-medium"
                >
                  Select All
                </button>
                <span className="text-white/20">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-[#8E8E93] hover:text-white cursor-pointer font-medium"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* List of Detected Sessions */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {parsedSlots.map((s, idx) => {
                const key = `${s.weekday}_${s.slotIndex}`;
                const isChecked = selectedSlotKeys.has(key);

                return (
                  <div
                    key={`${key}-${idx}`}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 text-xs ${
                      isChecked
                        ? "bg-white/[0.04] border-white/10"
                        : "bg-white/[0.01] border-white/5 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleSelectSlot(key)}
                        className="text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
                      >
                        {isChecked ? (
                          <CheckSquare size={16} className="text-[#0A84FF]" />
                        ) : (
                          <Square size={16} className="text-white/30" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white font-mono bg-white/10 px-2 py-0.5 rounded-md text-[11px]">
                            {s.weekdayName.slice(0, 3).toUpperCase()}
                          </span>

                          <span className="text-[#8E8E93] font-mono flex items-center gap-1 text-[11px]">
                            <Clock size={11} />
                            {s.startTime} – {s.endTime}
                          </span>

                          {s.slotType === "lab" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              <FlaskConical size={10} /> LAB
                            </span>
                          ) : s.slotType === "tutorial" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              <BookOpen size={10} /> TUTORIAL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8E8E93] border border-white/10">
                              <BookOpen size={10} /> LECTURE
                            </span>
                          )}

                          {s.room && (
                            <span className="text-[10px] font-mono text-white/50 flex items-center gap-0.5">
                              <MapPin size={10} /> {s.room}
                            </span>
                          )}
                        </div>

                        {/* Subject Selector & Title */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <select
                            value={s.matchedSubjectId || "__new__"}
                            onChange={(e) => handleSubjectChange(key, e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-white text-xs focus:outline-none focus:border-[#0A84FF] cursor-pointer max-w-[260px] truncate"
                          >
                            <option value="__new__" className="bg-[#1C1C1E] text-amber-300">
                              + Auto-Create: "{s.subjectName}"
                            </option>
                            {subjects.map((sub) => (
                              <option key={sub._id} value={sub._id} className="bg-[#1C1C1E] text-white">
                                Map to: {sub.name} {sub.code ? `(${sub.code})` : ""}
                              </option>
                            ))}
                          </select>

                          {s.matchedSubjectId ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                              Linked
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 shrink-0">
                              New Subject
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(key)}
                      className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                      title="Remove session"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
              <span className="text-xs text-[#8E8E93]">
                Missing subjects will be automatically created on apply.
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying || selectedCount === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  <span>
                    {isApplying
                      ? "Applying Schedule..."
                      : `Apply ${selectedCount} Classes to Timetable`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
