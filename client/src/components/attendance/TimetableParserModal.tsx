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
    setExtractionProgress({ stage: "reading", progress: 10, message: "Reading file…" });

    try {
      const { text } = await extractSyllabusFromFile(selectedFile, (p) => {
        setExtractionProgress(p);
      });

      const res = parseTimetableDocFromText(text, subjects);
      setDetectedDoc(res);
      setParsedSlots(res.slots);

      if (res.slots.length === 0) {
        setError(
          "We read the file, but could not detect lecture times or days. You can paste the timetable text directly below."
        );
      }
    } catch (err: unknown) {
      console.error("Extraction error", err);
      setError((err as Error)?.message || "Failed to parse timetable file.");
    } finally {
      setExtracting(false);
    }
  };

  const handleApply = async () => {
    if (parsedSlots.length === 0) return;
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

      const timetableSlots: TimetableSlot[] = parsedSlots.map((s) => ({
        weekday: s.weekday,
        slotIndex: s.slotIndex,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        slotType: s.slotType,
        subjectId: s.matchedSubjectId,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF]">
            <CalendarDays size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Scan &amp; Auto-Parse Timetable
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Upload a screenshot or PDF of your college timetable to auto-populate the weekly grid
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
                Drag &amp; drop your timetable image or PDF here
              </p>
              <p className="text-xs text-[#8E8E93] mt-1">
                Supports screenshots, photo of class routine, PNG, JPG, or PDF schedule
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Detected {parsedSlots.length} Timetable Sessions {fileName && <span className="text-[#8E8E93] font-normal font-mono text-[10px]">({fileName})</span>}
                </span>
              </div>
              <button
                onClick={() => {
                  setDetectedDoc(null);
                  setParsedSlots([]);
                  setFileName(null);
                }}
                className="text-xs text-[#8E8E93] hover:text-white cursor-pointer"
              >
                Scan Another File
              </button>
            </div>

            {/* Auto-Detected Timetable & Semester Settings Card */}
            {(detectedDoc?.effectiveStartDate || detectedDoc?.defaultMinPercent || (detectedDoc?.maxSlotsPerDay && detectedDoc.maxSlotsPerDay > 6)) && (
              <div className="p-3.5 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/25 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0A84FF]">
                  <Sparkles size={14} />
                  <span>Auto-Detected Timetable Settings</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {detectedDoc?.effectiveStartDate && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Effective Semester Start</span>
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
                <p className="text-[10px] text-[#0A84FF]/80">
                  ✓ Semester start date and daily slot limits will automatically sync to tracker settings on apply.
                </p>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {parsedSlots.map((s, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono">{s.weekdayName}</span>
                      <span className="text-[#8E8E93] font-mono">
                        {s.startTime} – {s.endTime}
                      </span>
                      {s.slotType === "lab" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                          <FlaskConical size={10} /> LAB
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#8E8E93]">
                          <BookOpen size={10} /> LECTURE
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-white/90">
                      {s.subjectName} {s.room ? `(${s.room})` : ""}
                    </p>
                  </div>

                  {s.matchedSubjectId ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Matched
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      New Subject
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>
                  {isApplying
                    ? "Applying..."
                    : `Apply All ${parsedSlots.length} Sessions to Timetable`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
