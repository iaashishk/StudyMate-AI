import React, { useState, useRef, useMemo } from "react";
import {
  X,
  UploadCloud,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
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
  Users,
  Undo2,
} from "lucide-react";
import { AttendanceSubject, TimetableSlot } from "../../types/attendance";
import { extractSyllabusFromFile, type ExtractionProgress } from "../../lib/file-extractor";
import {
  parseTimetableDocFromText,
  DAY_NAMES,
  DEFAULT_SLOT_TIMES,
  type ParsedTimetableSlotResult,
  type ParsedTimetableDocResult,
} from "../../lib/timetable-parser";
import { attendanceApi } from "../../lib/attendance-api";

interface TimetableParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: AttendanceSubject[];
  onApplySlots: (slots: TimetableSlot[], replaceExisting?: boolean) => Promise<void>;
  onImportSuccess?: (batchId: string) => Promise<void>;
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
  color?: string;
}

interface IssueItem {
  id: string;
  field: string;
  message: string;
  severity: "green" | "amber" | "red";
  suggestions?: string[];
  resolved?: boolean;
}

const MODERN_SUBJECT_PALETTE = [
  "#0A84FF", // Blue
  "#30D158", // Green
  "#BF5AF2", // Purple
  "#FF9F0A", // Orange / Amber
  "#64D2FF", // Cyan
  "#5E5CE6", // Indigo
  "#FF375F", // Rose
  "#40C8E0", // Teal
  "#FFD60A", // Yellow
];

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function optimizeImageFile(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    if (file.type === "application/pdf") {
      fileToBase64(file).then((base64) => resolve({ base64, mimeType: "application/pdf" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 2200;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
        } else {
          const raw = (e.target?.result as string).split(",")[1];
          resolve({ base64: raw, mimeType: file.type || "image/jpeg" });
        }
      };
      img.onerror = () => {
        const raw = (e.target?.result as string).split(",")[1];
        resolve({ base64: raw, mimeType: file.type || "image/jpeg" });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function pdfPageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (pdfjsLib?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    await (page as any).render({ canvasContext: ctx, viewport } as any).promise;
    const dataUrl = canvas.toDataURL("image/png");
    return { base64: dataUrl.split(",")[1], mimeType: "image/png" };
  } catch {
    const rawB64 = await fileToBase64(file);
    return { base64: rawB64, mimeType: "application/pdf" };
  }
}

const DAY_NAME_TO_WEEKDAY: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export default function TimetableParserModal({
  isOpen,
  onClose,
  subjects,
  onApplySlots,
  onImportSuccess,
}: TimetableParserModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [stepperStage, setStepperStage] = useState<number>(0);
  const [stepperMessage, setStepperMessage] = useState<string>("");
  const [, setDetectedDoc] = useState<ParsedTimetableDocResult | null>(null);
  const [detectedSubjects, setDetectedSubjects] = useState<ExtractedSubjectReview[]>([]);
  const [parsedSlots, setParsedSlots] = useState<ParsedTimetableSlotResult[]>([]);
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [batchId, setBatchId] = useState<string | null>(null);
  const [hasBatchSplits, setHasBatchSplits] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [createStudyPlannerSubjects, setCreateStudyPlannerSubjects] = useState(true);
  const [overrideExisting, setOverrideExisting] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedBatchId, setAppliedBatchId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDiscard = () => {
    setFileName(null);
    setDetectedDoc(null);
    setDetectedSubjects([]);
    setParsedSlots([]);
    setSelectedSlotKeys(new Set());
    setBatchId(null);
    setHasBatchSplits(false);
    setAvailableBatches([]);
    setSelectedBatch("all");
    setIssues([]);
    setError(null);
    setSuccessMessage(null);
    setAppliedBatchId(null);
    setStepperStage(0);
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
    setSuccessMessage(null);
    setExtracting(true);
    setStepperStage(1);
    setStepperMessage("Reading schedule document…");

    try {
      const isPdf =
        selectedFile.type === "application/pdf" ||
        selectedFile.name.toLowerCase().endsWith(".pdf");

      let imageBase64 = "";
      let mimeType = "image/jpeg";

      if (isPdf) {
        setStepperMessage("Rendering PDF routine for vision analysis…");
        const res = await pdfPageToBase64(selectedFile);
        imageBase64 = res.base64;
        mimeType = res.mimeType;
      } else {
        const res = await optimizeImageFile(selectedFile);
        imageBase64 = res.base64;
        mimeType = res.mimeType;
      }

      setStepperStage(2);
      setStepperMessage("Reading periods and timetable layout…");

      let aiSuccess = false;
      try {
        const aiRes = await attendanceApi.parseAiTimetable(imageBase64, mimeType);

        if (aiRes.success && aiRes.schedule && aiRes.schedule.length > 0) {
          aiSuccess = true;
          setStepperStage(3);
          setStepperMessage("Matching subjects with legend & faculty…");

          setBatchId(aiRes.batchId || null);
          setHasBatchSplits(Boolean(aiRes.hasBatchSplits));
          const batches = aiRes.availableBatches || [];
          setAvailableBatches(batches);
          if (batches.length > 0 && selectedBatch === "all") {
            // Default to Batch 1/2 if available
            const defaultBatch = batches.find((b) => b.includes("1/2")) || batches[0];
            setSelectedBatch(defaultBatch);
          }

          // Build Issues
          if (aiRes.issues && aiRes.issues.length > 0) {
            setIssues(
              aiRes.issues.map((iss, idx) => ({
                id: `issue_${idx}`,
                field: iss.field,
                message: iss.message,
                severity: iss.severity,
                suggestions: iss.suggestions || [],
                resolved: false,
              }))
            );
          } else {
            setIssues([]);
          }

          // Map detected subjects from AI
          const mappedSubjects: ExtractedSubjectReview[] = (aiRes.detectedSubjects || []).map((s, idx) => {
            const matched = subjects.find(
              (sub) =>
                sub._id === s.matchedSubjectId ||
                sub.name.toLowerCase().trim() === s.name.toLowerCase().trim() ||
                (s.shortName && sub.shortName?.toLowerCase().trim() === s.shortName.toLowerCase().trim())
            );

            return {
              key: s.key || `subj_${s.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
              name: matched?.name || s.name,
              shortName: matched?.shortName || s.shortName || generateShortName(s.name),
              code: matched?.code || s.code || "",
              teacher: matched?.teacher || s.teacher || "",
              room: matched?.defaultRoom || s.room || "",
              color: s.color || MODERN_SUBJECT_PALETTE[idx % MODERN_SUBJECT_PALETTE.length],
              matchedSubjectId: matched?._id || s.matchedSubjectId || null,
              slotCount: s.slotCount || 1,
            };
          });

          setDetectedSubjects(mappedSubjects);

          // Convert AI Schedule into ParsedTimetableSlotResult[]
          const generatedSlots: ParsedTimetableSlotResult[] = [];
          for (const day of aiRes.schedule) {
            const dayKey = (day.day || "").toLowerCase().trim();
            const weekday = DAY_NAME_TO_WEEKDAY[dayKey] ?? 1;

            for (const cls of day.classes || []) {
              const slotIndices = Array.isArray(cls.slots) && cls.slots.length > 0 ? cls.slots : [1];
              const blockSpan = cls.blockSpan || slotIndices.length;
              const blockId =
                cls.blockId ||
                (blockSpan > 1
                  ? `block_${dayKey}_${slotIndices[0]}_${slotIndices[slotIndices.length - 1]}`
                  : undefined);

              for (const sNum of slotIndices) {
                const zeroBasedIdx = Math.max(0, sNum - 1);
                const timing =
                  aiRes.timings?.find((t) => t.slot === sNum) ||
                  DEFAULT_SLOT_TIMES[zeroBasedIdx % DEFAULT_SLOT_TIMES.length] || {
                    start: "09:00",
                    end: "10:00",
                  };

                const matchedSub = mappedSubjects.find(
                  (ms) => ms.name.toLowerCase() === cls.subject.toLowerCase()
                );

                generatedSlots.push({
                  weekday,
                  weekdayName: DAY_NAMES[weekday],
                  slotIndex: zeroBasedIdx,
                  startTime: timing.start,
                  endTime: timing.end,
                  room: cls.room || matchedSub?.room || "",
                  slotType: cls.type || "lecture",
                  rawText: cls.subject,
                  subjectName: matchedSub?.name || cls.subject,
                  shortName: matchedSub?.shortName || cls.shortName || generateShortName(cls.subject),
                  code: matchedSub?.code || cls.code || "",
                  teacher: matchedSub?.teacher || cls.teacher || "",
                  matchedSubjectId: matchedSub?.matchedSubjectId || null,
                  batch: cls.batch || undefined,
                  confidence: cls.confidence,
                  blockId,
                  blockSpan,
                });
              }
            }
          }

          setParsedSlots(generatedSlots);
          setSelectedSlotKeys(
            new Set(generatedSlots.map((slot) => `${slot.weekday}_${slot.slotIndex}`))
          );
          setStepperStage(4);
          setStepperMessage("Timetable routine ready for review!");
        }
      } catch (aiErr) {
        console.warn("AI Vision call failed, falling back to offline OCR:", aiErr);
      }

      // Offline OCR Fallback
      if (!aiSuccess) {
        setStepperStage(2);
        setStepperMessage("Using local text recognition…");

        const { text } = await extractSyllabusFromFile(selectedFile, (p: ExtractionProgress) => {
          setStepperMessage(p.message);
        });

        setStepperStage(3);
        setStepperMessage("Structuring table text & detecting slots…");

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
        let cIdx = 0;
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
            color: MODERN_SUBJECT_PALETTE[cIdx % MODERN_SUBJECT_PALETTE.length],
          });
          cIdx++;
        }
        setDetectedSubjects(Array.from(synthesized.values()));

        if (detectedSlots.length === 0) {
          setError(
            "We scanned the file, but could not detect timetable periods. Ensure the schedule has clear subject codes, days, or time intervals."
          );
        }
        setStepperStage(4);
        setStepperMessage("Routine loaded via local scanner.");
      }
    } catch (err: unknown) {
      console.error("Extraction error", err);
      setError((err as Error)?.message || "Failed to parse timetable file.");
    } finally {
      setExtracting(false);
    }
  };

  /** Filter slots by batch selection (lectures apply to all) */
  const filteredSlots = useMemo(() => {
    if (selectedBatch === "all") return parsedSlots;
    return parsedSlots.filter((slot) => {
      if (!slot.batch) return true; // lectures and shared classes apply to all
      return (
        slot.batch.toLowerCase().trim() === selectedBatch.toLowerCase().trim() ||
        (selectedBatch.includes("1/2") && slot.batch.toLowerCase().includes("1/2")) ||
        (selectedBatch.includes("2/2") && slot.batch.toLowerCase().includes("2/2"))
      );
    });
  }, [parsedSlots, selectedBatch]);

  const selectedCount = useMemo(() => {
    return filteredSlots.filter((s) => selectedSlotKeys.has(`${s.weekday}_${s.slotIndex}`)).length;
  }, [filteredSlots, selectedSlotKeys]);

  const unresolvedIssues = useMemo(() => {
    return issues.filter((iss) => !iss.resolved);
  }, [issues]);

  const toggleSelectSlot = (key: string) => {
    setSelectedSlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedSlotKeys(new Set(filteredSlots.map((s) => `${s.weekday}_${s.slotIndex}`)));
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

  /** 1-tap suggested fix applied to issues */
  const handleApplySuggestedFix = (issueItem: IssueItem, suggestedName: string) => {
    // 1. Update detected subject
    setDetectedSubjects((prev) =>
      prev.map((subj) => {
        if (issueItem.field.toLowerCase().includes(subj.name.toLowerCase()) || subj.name.toLowerCase().includes(suggestedName.toLowerCase())) {
          return {
            ...subj,
            name: suggestedName,
            shortName: generateShortName(suggestedName),
          };
        }
        return subj;
      })
    );

    // 2. Propagate to slots
    setParsedSlots((prev) =>
      prev.map((s) => {
        if (issueItem.field.toLowerCase().includes(s.subjectName.toLowerCase())) {
          return {
            ...s,
            subjectName: suggestedName,
            shortName: generateShortName(suggestedName),
          };
        }
        return s;
      })
    );

    // 3. Mark issue resolved
    setIssues((prev) =>
      prev.map((i) => (i.id === issueItem.id ? { ...i, resolved: true } : i))
    );
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
        if (s.rawText === key || s.subjectName === key) {
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
        if (s.rawText === key || s.subjectName === key) {
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
    const slotsToApply = filteredSlots.filter((s) =>
      selectedSlotKeys.has(`${s.weekday}_${s.slotIndex}`)
    );
    if (slotsToApply.length === 0) return;

    setIsApplying(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Call Smart Import Apply Endpoint
      const applyResult = await attendanceApi.applySmartImport({
        batchId: batchId || undefined,
        selectedBatch,
        replaceExisting,
        createStudyPlannerSubjects,
        subjects: detectedSubjects.map((subj) => ({
          key: subj.key,
          name: subj.name,
          shortName: subj.shortName,
          code: subj.code,
          teacher: subj.teacher,
          room: subj.room,
          color: subj.color,
          matchedSubjectId: subj.matchedSubjectId,
          slotCount: subj.slotCount,
        })),
        slots: slotsToApply.map((s) => ({
          weekday: s.weekday,
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room || "",
          slotType: s.slotType,
          batch: s.batch,
          blockId: s.blockId,
          blockSpan: s.blockSpan,
          subject: s.subjectName,
          subjectName: s.subjectName,
          rawText: s.rawText,
          matchedSubjectId: s.matchedSubjectId,
        })),
      });

      setAppliedBatchId(applyResult.batchId);
      setSuccessMessage(
        `Applied timetable successfully! Saved ${applyResult.slotsCount} classes and synced ${applyResult.subjectsCount} courses.`
      );

      // 2. Prefill / Override subject metadata in background if requested
      if (overrideExisting) {
        for (const subj of detectedSubjects) {
          if (subj.matchedSubjectId) {
            try {
              const updates: Partial<{
                code: string;
                shortName: string;
                teacher: string;
                defaultRoom: string;
              }> = {};
              if (subj.code?.trim()) updates.code = subj.code.trim();
              if (subj.shortName?.trim()) updates.shortName = subj.shortName.trim().slice(0, 12);
              if (subj.teacher?.trim()) updates.teacher = subj.teacher.trim();
              if (subj.room?.trim()) updates.defaultRoom = subj.room.trim();

              if (Object.keys(updates).length > 0) {
                await attendanceApi.updateSubject(subj.matchedSubjectId, updates);
              }
            } catch (err) {
              console.warn("Could not sync subject meta:", subj.name, err);
            }
          }
        }
      }

      // 3. Notify parent component to reload state
      if (onImportSuccess) {
        await onImportSuccess(applyResult.batchId);
      } else {
        const timetableSlots: TimetableSlot[] = slotsToApply.map((s) => ({
          weekday: s.weekday,
          slotIndex: s.slotIndex,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room || "",
          slotType: s.slotType,
          subjectId: s.matchedSubjectId || null,
          blockId: s.blockId,
          blockSpan: s.blockSpan,
        }));
        await onApplySlots(timetableSlots, replaceExisting);
      }

      // Close modal smoothly after user sees confirmation
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      console.error("Apply smart import failed:", err);
      setError((err as Error)?.message || "Failed to apply slots to timetable");
    } finally {
      setIsApplying(false);
    }
  };

  const handleUndo = async () => {
    if (!appliedBatchId) return;
    setIsUndoing(true);
    try {
      await attendanceApi.undoSmartImport(appliedBatchId);
      setSuccessMessage("Import successfully reverted! Schedule restored.");
      setAppliedBatchId(null);
      if (onImportSuccess) {
        await onImportSuccess(appliedBatchId);
      }
    } catch (err) {
      console.error("Undo error:", err);
      setError("Failed to revert import.");
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#18181B] border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl relative max-h-[94vh] overflow-y-auto space-y-4 sm:space-y-5">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          title="Close dialog"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF] shrink-0">
            <CalendarDays size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                Import Timetable
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93]">
              Upload a timetable image or PDF, then review classes before saving.
            </p>
          </div>
        </div>

        {/* Success or Error Banner */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
            {appliedBatchId && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={isUndoing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-bold border border-emerald-500/30 cursor-pointer disabled:opacity-50"
              >
                <Undo2 size={12} />
                <span>{isUndoing ? "Reverting…" : "Undo Import"}</span>
              </button>
            )}
          </div>
        )}

        {/* Upload Drop Zone */}
        {parsedSlots.length === 0 && !extracting && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-white/15 hover:border-[#0A84FF]/60 rounded-2xl p-5 sm:p-6 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer space-y-2"
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
            <div className="w-11 h-11 mx-auto rounded-xl bg-[#0A84FF]/10 text-[#0A84FF] flex items-center justify-center">
              <UploadCloud size={22} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Choose a timetable photo or PDF
              </p>
              <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed max-w-md mx-auto">
                Drag and drop a file here, or tap to browse.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap text-[10px] text-white/40">
              <span>JPG</span>
              <span>PNG</span>
              <span>PDF</span>
            </div>

            <p className="pt-1 text-[10px] text-white/35">
              Your file is securely sent to Google Gemini for timetable extraction.
            </p>
          </div>
        )}

        {/* Stepper Progress Bar */}
        {extracting && (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-sm font-bold text-white">{stepperMessage}</p>
            </div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#0A84FF] transition-all duration-300"
                style={{ width: `${Math.max(10, stepperStage * 25)}%` }}
              />
            </div>
          </div>
        )}

        {/* Parsed Routine & Review UI */}
        {parsedSlots.length > 0 && (
          <div className="space-y-4">
            {/* Summary Card */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF] shrink-0">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">
                    {detectedSubjects.length} Courses • {filteredSlots.length} Classes Scheduled
                  </h4>
                  <p className="text-xs text-[#8E8E93]">
                    {fileName || "Review the detected classes"}
                    {unresolvedIssues.length > 0 ? ` • ${unresolvedIssues.length} items need attention` : " • All confidence checks passed"}
                  </p>
                </div>
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

            {/* Batch Picker for Practicals */}
            {(hasBatchSplits || availableBatches.length > 0) && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-purple-400 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Select Your Practical Lab Batch
                      </span>
                      <span className="text-[11px] text-[#8E8E93] block">
                        Labs are divided into batches. Selecting your batch schedules only your sessions.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setSelectedBatch("Batch 1/2")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedBatch.includes("1/2")
                          ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      Batch 1/2
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBatch("Batch 2/2")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedBatch.includes("2/2")
                          ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      Batch 2/2
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBatch("all")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedBatch === "all"
                          ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      Both / All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Review & Quality Check / Needs Attention Card */}
            {issues.length > 0 && unresolvedIssues.length > 0 ? (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs font-extrabold text-white block">
                        Needs Attention ({unresolvedIssues.length} items)
                      </span>
                      <span className="text-[10px] text-[#8E8E93] block">
                        Low confidence subject matches detected. Tap a suggested canonical name to fix in 1-tap.
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                    1-Tap Fixes
                  </span>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {unresolvedIssues.map((iss) => (
                    <div
                      key={iss.id}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white truncate">{iss.field}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase shrink-0 ${
                            iss.severity === "red"
                              ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                              : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {iss.severity === "red" ? "Check" : "Suggestion"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8E8E93]">{iss.message}</p>

                      {iss.suggestions && iss.suggestions.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] text-white/40">Suggested:</span>
                          {iss.suggestions.map((sug, sIdx) => (
                            <button
                              key={sIdx}
                              type="button"
                              onClick={() => handleApplySuggestedFix(iss, sug)}
                              className="px-2 py-0.5 rounded-md bg-[#0A84FF]/20 hover:bg-[#0A84FF]/35 text-[#0A84FF] hover:text-white border border-[#0A84FF]/30 text-[10px] font-bold transition-all cursor-pointer"
                            >
                              Fix to: {sug}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>All subjects &amp; timetable slots verified with high confidence.</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                  Confidence &gt; 95%
                </span>
              </div>
            )}

            {/* Sync / Override Options Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Replace Timetable Option */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-white block">Replace Timetable</span>
                  <span className="text-[10px] text-[#8E8E93] block">
                    Wipes previously saved slots from semester date
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0A84FF]" />
                </label>
              </div>

              {/* Study Planner Sync Option */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-white block">Add to Study Planner</span>
                  <span className="text-[10px] text-[#8E8E93] block">
                    Syncs courses into V1 Study Planner courses
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={createStudyPlannerSubjects}
                    onChange={(e) => setCreateStudyPlannerSubjects(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600" />
                </label>
              </div>

              {/* Sync Subject Info Option */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-white block">Sync Subject Info</span>
                  <span className="text-[10px] text-[#8E8E93] block">
                    Prefills Short name, Teacher &amp; Room
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={overrideExisting}
                    onChange={(e) => setOverrideExisting(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>
            </div>

            {/* Extracted Courses & Details (Renamed Short name) */}
            {detectedSubjects.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#0A84FF]/5 border border-[#0A84FF]/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-[#0A84FF]" />
                    <div>
                      <h4 className="text-xs font-extrabold text-white">
                        Detected Courses &amp; Faculty Details ({detectedSubjects.length})
                      </h4>
                      <p className="text-[10px] text-[#8E8E93]">
                        Review or adjust Course Names, Short names (abbreviations), Faculty &amp; Rooms
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
                      {/* Course Header with Name & Period Count */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: subj.color || "#0A84FF" }}
                          />
                          <input
                            type="text"
                            value={subj.name}
                            onChange={(e) =>
                              handleSubjectMetaChange(subj.key, "name", e.target.value)
                            }
                            className="font-bold text-white text-xs bg-transparent border-b border-transparent hover:border-white/20 focus:border-[#0A84FF] focus:bg-white/5 px-1 py-0.5 rounded outline-none w-full truncate"
                            placeholder="Course Name"
                            title="Click to edit full subject name"
                          />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-[#8E8E93] border border-white/10 shrink-0">
                          {subj.slotCount} {subj.slotCount === 1 ? "period" : "periods"}
                        </span>
                      </div>

                      {/* Metadata Subgrid: Short name, Code, Teacher, Room */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-0.5 font-medium flex items-center gap-1">
                            <Layers size={10} /> Short name
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
                            title="Short abbreviation displayed in timetable slot (e.g. DBMS)"
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
                            title="Classroom or Lab number"
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
                            ✨ + Create As New Course: "{subj.name}"
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
                            New Course
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Selection Bar for Scheduled Classes */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-xs">
              <span className="text-[#8E8E93]">
                <strong className="text-white">{selectedCount}</strong> of {filteredSlots.length} periods selected
                {selectedBatch !== "all" && (
                  <span className="ml-1 text-purple-400 font-medium">({selectedBatch})</span>
                )}
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
              {filteredSlots.map((s, idx) => {
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
                        title={isChecked ? "Deselect class" : "Select class"}
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
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                              s.slotType === "lab"
                                ? "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                : s.slotType === "tutorial"
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/25"
                                : "bg-blue-500/15 text-blue-300 border-blue-500/25"
                            }`}
                          >
                            {s.slotType}
                          </span>
                          {s.batch && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {s.batch}
                            </span>
                          )}
                          {s.blockSpan && s.blockSpan > 1 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                              {s.blockSpan}h Block
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#8E8E93] mt-0.5 flex-wrap">
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
