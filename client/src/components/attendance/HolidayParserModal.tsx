import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Palmtree,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { extractSyllabusFromFile, type ExtractionProgress } from "../../lib/file-extractor";
import {
  parseAcademicDocFromText,
  type ParsedHolidayResult,
  type ParsedAcademicDocResult,
} from "../../lib/holiday-parser";
import { attendanceApi } from "../../lib/attendance-api";

interface HolidayParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function HolidayParserModal({
  isOpen,
  onClose,
  onImported,
}: HolidayParserModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [parsedDoc, setParsedDoc] = useState<ParsedAcademicDocResult | null>(null);
  const [parsedHolidays, setParsedHolidays] = useState<ParsedHolidayResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
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
    setExtractionProgress({ stage: "reading", progress: 10, message: "Reading academic notice…" });

    try {
      const { text } = await extractSyllabusFromFile(selectedFile, (p) => {
        setExtractionProgress(p);
      });

      const doc = parseAcademicDocFromText(text);
      setParsedDoc(doc);
      setParsedHolidays(doc.holidays);

      if (doc.holidays.length === 0 && !doc.semesterStartDate) {
        setError(
          "We read the file, but could not detect holiday dates or semester duration. Ensure the image has clear dates like '26 January' or '05/01/2026'."
        );
      }
    } catch (err: unknown) {
      console.error("Extraction error", err);
      setError((err as Error)?.message || "Failed to parse holiday calendar.");
    } finally {
      setExtracting(false);
    }
  };

  const handleImport = async () => {
    if (parsedHolidays.length === 0 && !parsedDoc?.semesterStartDate) return;
    setIsImporting(true);
    try {
      // 1. Auto-sync detected semester dates and term name
      if (parsedDoc?.semesterStartDate) {
        await attendanceApi.updateSemester({
          startDate: parsedDoc.semesterStartDate,
          endDate: parsedDoc.semesterEndDate || undefined,
          name: parsedDoc.semesterName || undefined,
        });
      }

      // 2. Auto-sync detected minimum attendance target
      if (parsedDoc?.defaultMinPercent) {
        await attendanceApi.updateSettings({
          defaultMinPercent: parsedDoc.defaultMinPercent,
        });
      }

      // 3. Auto-sync all holidays
      for (const h of parsedHolidays) {
        await attendanceApi.addHoliday(h.date, h.label);
      }

      onImported();
      onClose();
    } catch (err) {
      console.error("Import holidays failed", err);
      setError("Failed to import holidays and settings");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
            <Palmtree size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Scan Academic Calendar &amp; Holidays
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Upload university holiday notice or academic circular (Image or PDF)
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
        {parsedHolidays.length === 0 && !extracting && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-amber-400/60 rounded-3xl p-8 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer space-y-3"
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
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Drag &amp; drop your holiday list PDF or photo here
              </p>
              <p className="text-xs text-[#8E8E93] mt-1">
                Reads dates, festival names, and semester break schedules automatically
              </p>
            </div>
          </div>
        )}

        {/* Extraction Progress */}
        {extracting && extractionProgress && (
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3 text-center">
            <div className="w-8 h-8 mx-auto border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-white">{extractionProgress.message}</p>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${extractionProgress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Parsed Results Preview */}
        {(parsedHolidays.length > 0 || parsedDoc?.semesterStartDate) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Detected {parsedHolidays.length} Holidays {fileName && <span className="text-[#8E8E93] font-normal font-mono text-[10px]">({fileName})</span>}
                </span>
              </div>
              <button
                onClick={() => {
                  setParsedDoc(null);
                  setParsedHolidays([]);
                  setFileName(null);
                }}
                className="text-xs text-[#8E8E93] hover:text-white cursor-pointer"
              >
                Scan Another
              </button>
            </div>

            {/* Auto-Detected Academic Settings Card */}
            {(parsedDoc?.semesterStartDate || parsedDoc?.defaultMinPercent || parsedDoc?.semesterName) && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <Sparkles size={14} />
                  <span>Auto-Detected Academic Settings &amp; Span</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {parsedDoc?.semesterStartDate && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Semester Duration</span>
                      <span className="font-mono text-white font-semibold">
                        {parsedDoc.semesterStartDate} {parsedDoc.semesterEndDate ? `→ ${parsedDoc.semesterEndDate}` : ""}
                      </span>
                    </div>
                  )}
                  {parsedDoc?.defaultMinPercent && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Min Attendance Requirement</span>
                      <span className="font-mono text-emerald-400 font-semibold">{parsedDoc.defaultMinPercent}%</span>
                    </div>
                  )}
                  {parsedDoc?.semesterName && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5 sm:col-span-2">
                      <span className="text-[#8E8E93] block text-[10px]">Term / Session</span>
                      <span className="text-white font-semibold">{parsedDoc.semesterName}</span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-amber-300/80">
                  ✓ Semester dates and attendance criteria will automatically sync to tracker settings on apply.
                </p>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {parsedHolidays.map((h, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-white">{h.label}</p>
                    <p className="text-[11px] font-mono text-amber-400">{h.date}</p>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono truncate max-w-[150px]">
                    {h.rawLine}
                  </span>
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
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-500/90 text-black text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>
                  {isImporting
                    ? "Syncing Settings..."
                    : `Sync Settings & Apply Calendar`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
