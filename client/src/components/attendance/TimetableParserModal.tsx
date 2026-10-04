import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Trash2,
  Clock,
  MapPin,
  CheckSquare,
  Square,
  RotateCcw,
  Layers,
  User,
  Hash,
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
  onApplySlots: (slots: TimetableSlot[], replaceExisting?: boolean) => Promise<void>;
}

export interface ExtractedSubjectReview {
  key: string;
  name: string;
  shortName: string;
  code: string;
  teacher: string;
  room: string;
  matchedSubjectId: string | null;
  slotCount: number;
}

/** Generate a sensible 2-8 letter acronym from a course name */
function generateShortName(name: string): string {
  if (!name) return "";
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 6).toUpperCase();
  }
  const stopWords = new Set(["and", "of", "in", "for", "the", "to", "on", "a", "an", "with", "lab", "practical"]);
  const significant = words.filter((w) => !stopWords.has(w.toLowerCase()));
  const acronym = (significant.length > 0 ? significant : words)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const isLab = /\blab\b|\bpractical\b/i.test(name);
  const base = acronym.slice(0, 6);
  return isLab ? `${base} L` : base;
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
  const [detectedSubjects, setDetectedSubjects] = useState<ExtractedSubjectReview[]>([]);
  const [parsedSlots, setParsedSlots] = useState<ParsedTimetableSlotResult[]>([]);
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [overrideExisting, setOverrideExisting] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDiscard = () => {
    setFileName(null);
    setDetectedDoc(null);
    setDetectedSubjects([]);
    setParsedSlots([]);
    setSelectedSlotKeys(new Set());
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
      setExtractionProgress({
        stage: "ocr",
        progress: 50,
        message: "Scanning document text via OCR…",
      });

      const { text } = await extractSyllabusFromFile(selectedFile, (p) => {
        setExtractionProgress(p);
      });
      const result = parseTimetableDocFromText(text, subjects);
      const detectedSlots = result.slots.map((slot) => {
        const matchedSubject = subjects.find((subject) => subject._id === slot.matchedSubjectId);
        const groupKey = matchedSubject
          ? `subject:${matchedSubject._id}`
          : `new:${slot.subjectName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

        return { ...slot, rawText: groupKey };
      });

      setDetectedDoc(result);
      setParsedSlots(detectedSlots);
      setSelectedSlotKeys(new Set(detectedSlots.map((slot) => `${slot.weekday}_${slot.slotIndex}`)));

      const synthesized = new Map<string, ExtractedSubjectReview>();
      for (const slot of detectedSlots) {
        if (!slot.subjectName.trim()) continue;
        const matchedSubject = subjects.find((subject) => subject._id === slot.matchedSubjectId);
        const existing = synthesized.get(slot.rawText);
        if (existing) {
          existing.slotCount += 1;
          if (!existing.room && slot.room) existing.room = slot.room;
          continue;
        }

        synthesized.set(slot.rawText, {
          key: slot.rawText,
          name: matchedSubject?.name || slot.subjectName,
          shortName: matchedSubject?.shortName || slot.shortName || generateShortName(slot.subjectName),
          code: matchedSubject?.code || slot.code || "",
          teacher: matchedSubject?.teacher || slot.teacher || "",
          room: slot.room || matchedSubject?.defaultRoom || "",
          matchedSubjectId: matchedSubject?._id || null,
          slotCount: 1,
        });
      }
      setDetectedSubjects(Array.from(synthesized.values()));

      if (detectedSlots.length === 0) {
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  /** Update detected subject metadata & propagate to matching slots */
  const handleSubjectMetaChange = (
    key: string,
    field: "name" | "shortName" | "code" | "teacher" | "room",
    value: string
  ) => {
    setDetectedSubjects((prev) =>
      prev.map((subj) => {
        if (subj.key === key) {
          return { ...subj, [field]: value };
        }
        return subj;
      })
    );

    setParsedSlots((prev) =>
      prev.map((s) => {
        if (s.rawText === key) {
          if (field === "name") return { ...s, subjectName: value };
          if (field === "shortName") return { ...s, shortName: value };
          if (field === "code") return { ...s, code: value };
          if (field === "teacher") return { ...s, teacher: value };
          if (field === "room") return { ...s, room: value };
        }
        return s;
      })
    );
  };

  /** Change mapping for an entire detected subject */
  const handleSubjectMappingChange = (key: string, newSubjectId: string) => {
    const isNew = newSubjectId === "__new__";
    const matchedSubj = isNew ? null : subjects.find((s) => s._id === newSubjectId);

    setDetectedSubjects((prev) =>
      prev.map((subj) => {
        if (subj.key === key) {
          return {
            ...subj,
            matchedSubjectId: isNew ? null : newSubjectId,
            name: matchedSubj ? matchedSubj.name : subj.name,
            shortName: subj.shortName || matchedSubj?.shortName || "",
            code: subj.code || matchedSubj?.code || "",
            teacher: subj.teacher || matchedSubj?.teacher || "",
            room: subj.room || matchedSubj?.defaultRoom || "",
          };
        }
        return subj;
      })
    );

    setParsedSlots((prev) =>
      prev.map((s) => {
        if (s.rawText === key) {
          return {
            ...s,
            matchedSubjectId: isNew ? null : newSubjectId,
            subjectName: matchedSubj ? matchedSubj.name : s.subjectName,
            shortName: matchedSubj?.shortName || s.shortName,
            code: matchedSubj?.code || s.code,
            teacher: matchedSubj?.teacher || s.teacher,
            room: matchedSubj?.defaultRoom || s.room,
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

      // 3. Process Subjects (Create new ones & prefill / sync existing ones)
      const SUBJECT_PALETTE = [
        "#0A84FF",
        "#BF5AF2",
        "#30D158",
        "#FF9F0A",
        "#FF375F",
        "#64D2FF",
        "#FFD60A",
        "#FF6B35",
        "#32ADE6",
      ];
      let colorIdx = 0;
      const subjectIdMap: Record<string, string> = {};

      for (const subj of detectedSubjects) {
        if (!subj.matchedSubjectId || subj.matchedSubjectId === "__new__") {
          // Auto-create new subject with all extracted info
          try {
            const newSubj = await attendanceApi.createSubject({
              name: subj.name.trim(),
              code: (subj.code || "").trim(),
              shortName: (subj.shortName || "").trim().slice(0, 12),
              teacher: (subj.teacher || "").trim(),
              defaultRoom: (subj.room || "").trim(),
              color: SUBJECT_PALETTE[colorIdx % SUBJECT_PALETTE.length],
              minPercent: detectedDoc?.defaultMinPercent || 75,
            });
            subjectIdMap[subj.key] = newSubj._id;
            colorIdx++;
          } catch (err) {
            console.error("Auto-create subject error:", subj.name, err);
          }
        } else {
          // Existing subject matched
          subjectIdMap[subj.key] = subj.matchedSubjectId;

          if (overrideExisting) {
            // Prefill / sync subject details without corrupting canonical subject name
            try {
              const updates: Partial<{
                code: string;
                shortName: string;
                teacher: string;
                defaultRoom: string;
              }> = {};

              if (subj.code && subj.code.trim()) updates.code = subj.code.trim();
              if (subj.shortName && subj.shortName.trim()) updates.shortName = subj.shortName.trim().slice(0, 12);
              if (subj.teacher && subj.teacher.trim()) updates.teacher = subj.teacher.trim();
              if (subj.room && subj.room.trim()) updates.defaultRoom = subj.room.trim();

              if (Object.keys(updates).length > 0) {
                await attendanceApi.updateSubject(subj.matchedSubjectId, updates);
              }
            } catch (err) {
              console.error("Failed to update matched subject", subj.name, err);
            }
          }
        }
      }

      // 4. Construct final TimetableSlot array
      const timetableSlots: TimetableSlot[] = slotsToApply.map((s) => {
        const mappedId = s.matchedSubjectId || subjectIdMap[s.rawText] || null;
        return {
          weekday: s.weekday,
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room || "",
          slotType: s.slotType,
          subjectId: mappedId,
          blockId: s.blockId,
          blockSpan: s.blockSpan,
        };
      });

      await onApplySlots(timetableSlots, replaceExisting);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#18181B] border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl relative max-h-[94vh] overflow-y-auto space-y-4 sm:space-y-5">
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
              AI Timetable Scanner
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Scans the timetable locally, then lets you review and correct subjects before importing
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
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center">
              <UploadCloud size={28} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Drop your class routine photo or PDF here
              </p>
              <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed max-w-sm mx-auto">
                Automatically reads the timetable text and lets you review subjects, codes, faculty, and rooms
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0A84FF] bg-[#0A84FF]/10 px-2.5 py-1 rounded-full border border-[#0A84FF]/20">
                <CheckCircle2 size={10} /> Local OCR parser
              </span>
              <span className="text-[10px] text-white/30">·</span>
              <span className="text-[10px] text-white/40">JPG · PNG · PDF supported</span>
            </div>
          </div>
        )}

        {/* Extraction Progress */}
        {extracting && extractionProgress && (
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3 text-center">
            <div className="w-9 h-9 mx-auto border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-white">{extractionProgress.message}</p>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#0A84FF] transition-all duration-500"
                style={{ width: `${extractionProgress.progress}%` }}
              />
            </div>
            <p className="text-[11px] text-[#8E8E93]">
              Reading schedule grid and extracting course information…
            </p>
          </div>
        )}

        {/* Parsed Slots & Subjects Review */}
        {parsedSlots.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Detected {parsedSlots.length} Classes ({detectedSubjects.length} Courses){" "}
                  {fileName && (
                    <span className="text-[#8E8E93] font-normal font-mono text-[10px]">
                      ({fileName})
                    </span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDiscard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/25 text-white/70 hover:text-rose-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Discard &amp; Scan Another</span>
              </button>
            </div>

            {/* Sync / Override Options Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Replace Timetable Option */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">Replace Timetable</span>
                  <span className="text-[10px] text-[#8E8E93] block">
                    Wipes previously saved slots and applies this routine
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0A84FF]" />
                </label>
              </div>

              {/* Prefill / Override Subject Info Option */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white block">Sync Subject Details</span>
                  <span className="text-[10px] text-[#8E8E93] block">
                    Prefill / override Code, BName, Teacher &amp; Room in Subjects list
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                  <input
                    type="checkbox"
                    checked={overrideExisting}
                    onChange={(e) => setOverrideExisting(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>
            </div>

            {/* Extracted Subjects & Metadata Review Card */}
            {detectedSubjects.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#0A84FF]/5 border border-[#0A84FF]/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-[#0A84FF]" />
                    <div>
                      <h4 className="text-xs font-extrabold text-white">
                        Extracted Courses &amp; Details ({detectedSubjects.length})
                      </h4>
                      <p className="text-[10px] text-[#8E8E93]">
                        Review or edit extracted Short Names (BNames), Course Codes, Faculty &amp; Rooms before applying
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#0A84FF] bg-[#0A84FF]/10 px-2 py-0.5 rounded-full border border-[#0A84FF]/20 shrink-0">
                    Editable Fields
                  </span>
                </div>

                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {detectedSubjects.map((subj) => (
                    <div
                      key={subj.key}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/15 transition-all space-y-2.5"
                    >
                      {/* Subject Header with Name & Slot Count */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] shrink-0" />
                          <input
                            type="text"
                            value={subj.name}
                            onChange={(e) =>
                              handleSubjectMetaChange(subj.key, "name", e.target.value)
                            }
                            className="font-bold text-white text-xs bg-transparent border-b border-transparent hover:border-white/20 focus:border-[#0A84FF] focus:bg-white/5 px-1 py-0.5 rounded outline-none w-full truncate"
                            placeholder="Subject Name"
                            title="Click to edit full subject name"
                          />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-[#8E8E93] border border-white/10 shrink-0">
                          {subj.slotCount} {subj.slotCount === 1 ? "period" : "periods"}
                        </span>
                      </div>

                      {/* Metadata Subgrid: BName, Code, Faculty, Room */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-0.5 font-medium flex items-center gap-1">
                            <Layers size={10} /> BName (Short)
                          </label>
                          <input
                            type="text"
                            maxLength={12}
                            value={subj.shortName}
                            onChange={(e) =>
                              handleSubjectMetaChange(
                                subj.key,
                                "shortName",
                                e.target.value.toUpperCase()
                              )
                            }
                            placeholder="e.g. DBMS"
                            className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-[11px] focus:outline-none focus:border-[#0A84FF]"
                            title="Short abbreviation displayed in timetable slots"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-0.5 font-medium flex items-center gap-1">
                            <Hash size={10} /> Course Code
                          </label>
                          <input
                            type="text"
                            value={subj.code}
                            onChange={(e) =>
                              handleSubjectMetaChange(
                                subj.key,
                                "code",
                                e.target.value.toUpperCase()
                              )
                            }
                            placeholder="e.g. CS-401"
                            className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-[11px] focus:outline-none focus:border-[#0A84FF]"
                            title="University Course Code"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-0.5 font-medium flex items-center gap-1">
                            <User size={10} /> Teacher / Faculty
                          </label>
                          <input
                            type="text"
                            value={subj.teacher}
                            onChange={(e) =>
                              handleSubjectMetaChange(subj.key, "teacher", e.target.value)
                            }
                            placeholder="e.g. Dr. Manvi"
                            className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-[11px] focus:outline-none focus:border-[#0A84FF]"
                            title="Faculty or Professor name"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-0.5 font-medium flex items-center gap-1">
                            <MapPin size={10} /> Default Room
                          </label>
                          <input
                            type="text"
                            value={subj.room}
                            onChange={(e) =>
                              handleSubjectMetaChange(subj.key, "room", e.target.value)
                            }
                            placeholder="e.g. LT04"
                            className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-[11px] focus:outline-none focus:border-[#0A84FF]"
                            title="Classroom / Lab number"
                          />
                        </div>
                      </div>

                      {/* Mapping Dropdown */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <span className="text-[10px] text-[#8E8E93] shrink-0">Map to:</span>
                        <select
                          value={subj.matchedSubjectId || "__new__"}
                          onChange={(e) => handleSubjectMappingChange(subj.key, e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-[#0A84FF] cursor-pointer flex-1 truncate"
                        >
                          <option value="__new__" className="bg-[#1C1C1E] text-amber-300">
                            ✨ + Create As New Subject: "{subj.name}"
                          </option>
                          {subjects.map((sub) => (
                            <option key={sub._id} value={sub._id} className="bg-[#1C1C1E] text-white">
                              Link to: {sub.name} {sub.shortName ? `[${sub.shortName}]` : ""} {sub.code ? `(${sub.code})` : ""}
                            </option>
                          ))}
                        </select>
                        {subj.matchedSubjectId ? (
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
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Select Bar for Periods */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-xs">
              <span className="text-[#8E8E93]">
                <strong className="text-white">{selectedCount}</strong> of {parsedSlots.length} periods selected
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
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
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
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                          isChecked
                            ? "bg-[#0A84FF] border-[#0A84FF] text-white"
                            : "border-white/20 bg-white/5 hover:border-white/40"
                        }`}
                      >
                        {isChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white truncate">{s.subjectName}</span>
                          {s.shortName && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#0A84FF]/20 text-[#0A84FF] border border-[#0A84FF]/30">
                              {s.shortName}
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                              s.slotType === "lab"
                                ? "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                : s.slotType === "tutorial"
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/25"
                                : "bg-blue-500/15 text-blue-300 border-blue-500/25"
                            }`}
                          >
                            {s.slotType.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#8E8E93] mt-0.5">
                          <span className="font-semibold text-white/70">{s.weekdayName}</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock size={11} className="text-[#0A84FF]" />
                            {s.startTime} – {s.endTime}
                          </span>
                          {s.room && (
                            <span className="flex items-center gap-1 font-mono text-white/60">
                              <MapPin size={11} />
                              {s.room}
                            </span>
                          )}
                          {s.teacher && (
                            <span className="text-white/60">• {s.teacher}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSlot(key)}
                      className="p-1.5 rounded-xl hover:bg-rose-500/15 text-white/40 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                      title="Remove this slot from import"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.08] gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>

          {parsedSlots.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying || selectedCount === 0}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 disabled:opacity-50 cursor-pointer"
              >
                {isApplying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Applying Timetable…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Apply {selectedCount} Classes to Routine</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
