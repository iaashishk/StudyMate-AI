import React, { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Palmtree,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Info,
  CheckSquare,
  Square,
  Calendar,
} from "lucide-react";
import { extractSyllabusFromFile, type ExtractionProgress } from "../../lib/file-extractor";
import {
  parseAcademicDocFromText,
  cleanHolidayDisplay,
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
  const [items, setItems] = useState<ParsedHolidayResult[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"off_days" | "all" | "skipped">("off_days");
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);
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
    setExtractionProgress({ stage: "reading", progress: 10, message: "Reading circular text…" });

    try {
      const { text } = await extractSyllabusFromFile(selectedFile, (p) => {
        setExtractionProgress(p);
      });

      const doc = parseAcademicDocFromText(text);
      setParsedDoc(doc);

      const allItems = doc.allExtractedItems.length > 0 ? doc.allExtractedItems : doc.holidays;
      setItems(allItems);

      // Default checked: only official off-days (Gazetted + Observed Restricted)
      const offDayDates = new Set(doc.holidays.map((h) => h.date));
      setSelectedDates(offDayDates);

      if (allItems.length === 0 && !doc.semesterStartDate) {
        setError(
          "We read the file, but could not detect holiday dates. Ensure the circular has clear dates like '26 January' or '05/01/2026'."
        );
      } else if (allItems.length === 0 && doc.semesterStartDate) {
        // Academic calendar doc — only semester dates were extracted, no holidays
        setError(null); // Not an error, but let the semesterStartDate card show
      }
    } catch (err: unknown) {
      console.error("Extraction error", err);
      setError((err as Error)?.message || "Failed to parse holiday calendar.");
    } finally {
      setExtracting(false);
    }
  };

  const toggleSelectDate = (date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const handleSelectAll = (visibleItems: ParsedHolidayResult[]) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      visibleItems.forEach((it) => next.add(it.date));
      return next;
    });
  };

  const handleDeselectAll = (visibleItems: ParsedHolidayResult[]) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      visibleItems.forEach((it) => next.delete(it.date));
      return next;
    });
  };

  const handleDeleteItem = (date: string) => {
    setItems((prev) => prev.filter((it) => it.date !== date));
    setSelectedDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
  };

  const handleImport = async () => {
    const holidaysToImport = items.filter((it) => selectedDates.has(it.date));
    if (holidaysToImport.length === 0 && !parsedDoc?.semesterStartDate) return;

    setIsImporting(true);
    try {
      const chosenVariant =
        parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants[selectedVariantIndex]
          ? parsedDoc.semesterDateVariants[selectedVariantIndex]
          : null;

      const effectiveStartDate = chosenVariant ? chosenVariant.startDate : parsedDoc?.semesterStartDate;
      const effectiveEndDate = chosenVariant ? chosenVariant.endDate : parsedDoc?.semesterEndDate;
      const semesterDisplayName = chosenVariant
        ? `${parsedDoc?.semesterName || "Semester"} - ${chosenVariant.shortLabel}`
        : parsedDoc?.semesterName;

      // 1. Auto-sync detected semester duration and name
      if (effectiveStartDate) {
        await attendanceApi.updateSemester({
          startDate: effectiveStartDate,
          endDate: effectiveEndDate || undefined,
          name: semesterDisplayName || undefined,
        });
      }

      // 2. Auto-sync detected minimum attendance target
      if (parsedDoc?.defaultMinPercent) {
        await attendanceApi.updateSettings({
          defaultMinPercent: parsedDoc.defaultMinPercent,
        });
      }

      // 3. Auto-sync all selected holidays
      for (const h of holidaysToImport) {
        await attendanceApi.addHoliday(h.date, cleanHolidayDisplay(h.label));
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

  // Filter items by active tab
  const offDayItems = items.filter((it) => it.isOffDay === true);
  const skippedItems = parsedDoc?.skippedSpecialDays || [];

  let visibleList: ParsedHolidayResult[] = [];
  if (activeTab === "off_days") {
    visibleList = offDayItems;
  } else if (activeTab === "skipped") {
    visibleList = skippedItems;
  } else {
    visibleList = items;
  }

  const selectedCount = items.filter((it) => selectedDates.has(it.date)).length;

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
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
            <Palmtree size={20} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white tracking-tight">
              Academic Circular &amp; Holiday Importer
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Upload university holiday notices or academic calendars to sync semester dates and off-days.
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
        {items.length === 0 && !extracting && (
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
                Drag &amp; drop your holiday circular PDF or photo here
              </p>
              <p className="text-xs text-[#8E8E93] mt-1">
                Reads gazetted dates, handles restricted lists, removes numbering &amp; pipes automatically
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
        {(items.length > 0 || parsedDoc?.semesterStartDate) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  {items.length === 0
                    ? "Academic Calendar Detected"
                    : `Found ${items.length} Holidays`}{" "}
                  {fileName && <span className="text-[#8E8E93] font-normal font-mono text-[10px]">({fileName})</span>}
                </span>
                {parsedDoc?.detectedYear && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-amber-300 font-mono text-[10px] font-bold">
                    Year {parsedDoc.detectedYear}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setParsedDoc(null);
                  setItems([]);
                  setSelectedDates(new Set());
                  setSelectedVariantIndex(0);
                  setFileName(null);
                }}
                className="text-xs text-[#8E8E93] hover:text-white cursor-pointer"
              >
                Scan Another Notice
              </button>
            </div>

            {/* Academic Calendar Notice */}
            {items.length === 0 && parsedDoc?.semesterStartDate && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2.5">
                <Info size={16} className="shrink-0 text-emerald-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white text-[11px]">
                    Academic Calendar Detected — Semester Dates Extracted
                  </p>
                  <p className="text-[10px] text-emerald-200/80 leading-relaxed">
                    This looks like a Teaching Calendar / Academic Schedule (with Teaching Terms, Class Tests, Exam dates). No holidays are listed in this document — only semester date range has been extracted. To import holidays, upload your university&apos;s Holiday Circular instead.
                  </p>
                </div>
              </div>
            )}

            {/* Smart Exclusion Notice (Schedule-IV Special Days) */}
            {skippedItems.length > 0 && (
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2.5">
                <Info size={16} className="shrink-0 text-blue-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white text-[11px]">
                    Excluded {skippedItems.length} Restricted Celebration Days (Classes Conducted)
                  </p>
                  <p className="text-[10px] text-blue-200/80 leading-relaxed">
                    Notice states <em>"there would be no public holiday on these dates"</em> (e.g. Netaji Jayanti, Sant Ravidas Jayanti). Classes run normally, so they have been excluded to keep attendance accurate.
                  </p>
                </div>
              </div>
            )}

            {/* Auto-Detected Academic Settings Card */}
            {(parsedDoc?.semesterStartDate || parsedDoc?.defaultMinPercent || parsedDoc?.semesterName) && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Sparkles size={14} />
                    <span>Auto-Detected Academic Settings &amp; Span</span>
                  </div>
                  {parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants.length > 1 && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Multi-Cohort Detected
                    </span>
                  )}
                </div>

                {/* Cohort Selector (e.g. 1st Sem MCA/PG vs 3rd-7th Sem Senior) */}
                {parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants.length > 1 && (
                  <div className="space-y-1.5 p-2.5 rounded-xl bg-black/25 border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/90 font-bold block">
                        Select Your Semester / Batch:
                      </span>
                      <span className="text-[9px] text-amber-300/80">
                        Tap your batch to sync dates
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {parsedDoc.semesterDateVariants.map((v, i) => {
                        const isSelected = selectedVariantIndex === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedVariantIndex(i)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-amber-500/25 border-amber-400 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-400"
                                : "bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-xs text-white truncate">{v.shortLabel}</span>
                              {isSelected && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-400 text-black shrink-0">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#8E8E93] mt-0.5 line-clamp-1">{v.label}</p>
                            <p className="text-[10px] font-mono text-amber-300 font-semibold mt-1">
                              {v.startDate} {v.endDate ? `→ ${v.endDate}` : ""}
                              {v.teachingDays ? ` (${v.teachingDays} teaching days)` : ""}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {/* Semester Duration Display */}
                  <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                    <span className="text-[#8E8E93] block text-[10px]">
                      {parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants[selectedVariantIndex]
                        ? `Semester Duration (${parsedDoc.semesterDateVariants[selectedVariantIndex].shortLabel})`
                        : "Semester Duration"}
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants[selectedVariantIndex]
                        ? `${parsedDoc.semesterDateVariants[selectedVariantIndex].startDate} → ${parsedDoc.semesterDateVariants[selectedVariantIndex].endDate || "TBD"}`
                        : `${parsedDoc?.semesterStartDate} ${parsedDoc?.semesterEndDate ? `→ ${parsedDoc.semesterEndDate}` : ""}`}
                    </span>
                  </div>
                  {parsedDoc?.defaultMinPercent && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                      <span className="text-[#8E8E93] block text-[10px]">Min Attendance Requirement</span>
                      <span className="font-mono text-emerald-400 font-semibold">{parsedDoc.defaultMinPercent}%</span>
                    </div>
                  )}
                  {parsedDoc?.semesterName && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5 sm:col-span-2">
                      <span className="text-[#8E8E93] block text-[10px]">Term / Session</span>
                      <span className="text-white font-semibold">
                        {parsedDoc.semesterName}
                        {parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants[selectedVariantIndex] && (
                          <span className="text-amber-400 text-xs ml-1.5 font-normal">
                            • {parsedDoc.semesterDateVariants[selectedVariantIndex].shortLabel}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filter Tabs & Bulk Select */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("off_days")}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    activeTab === "off_days"
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Official Off-Days ({offDayItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    activeTab === "all"
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  All Detected ({items.length})
                </button>
                {skippedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("skipped")}
                    className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      activeTab === "skipped"
                        ? "bg-blue-500/30 text-blue-200 border border-blue-400/40"
                        : "text-[#8E8E93] hover:text-white"
                    }`}
                  >
                    Skipped Celebration Days ({skippedItems.length})
                  </button>
                )}
              </div>

              {activeTab !== "skipped" && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(visibleList)}
                    className="text-[#0A84FF] hover:underline cursor-pointer font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-white/20">|</span>
                  <button
                    type="button"
                    onClick={() => handleDeselectAll(visibleList)}
                    className="text-[#8E8E93] hover:text-white cursor-pointer font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              )}
            </div>

            {/* List of Holidays */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {visibleList.map((h, idx) => {
                const isChecked = selectedDates.has(h.date);
                const isSkippedTab = activeTab === "skipped";

                return (
                  <div
                    key={`${h.date}-${idx}`}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 text-xs ${
                      isChecked
                        ? "bg-white/[0.04] border-white/10"
                        : "bg-white/[0.01] border-white/5 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {!isSkippedTab && (
                        <button
                          type="button"
                          onClick={() => toggleSelectDate(h.date)}
                          className="text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare size={16} className="text-amber-400" />
                          ) : (
                            <Square size={16} className="text-white/30" />
                          )}
                        </button>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white truncate text-sm">
                            {cleanHolidayDisplay(h.label)}
                          </p>

                          {/* Category Badge */}
                          {h.category === "gazetted" && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-semibold">
                              Gazetted
                            </span>
                          )}
                          {h.category === "observed_restricted" && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-300 text-[10px] font-semibold">
                              Observed Holiday
                            </span>
                          )}
                          {h.category === "restricted" && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-semibold">
                              Restricted (RH)
                            </span>
                          )}
                          {h.category === "weekend" && (
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[#8E8E93] text-[10px] font-semibold">
                              Weekend
                            </span>
                          )}
                          {h.category === "special_day" && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold">
                              Classes Held
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-amber-400 text-[11px] flex items-center gap-1">
                            <Calendar size={11} /> {h.date}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isSkippedTab && (
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(h.date)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                        title="Delete from import list"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
              <span className="text-xs text-[#8E8E93]">
                <strong className="text-white">{selectedCount}</strong> holidays selected for import
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
                  onClick={handleImport}
                  disabled={isImporting || (selectedCount === 0 && !parsedDoc?.semesterStartDate)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-500/90 text-black text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  <span>
                    {isImporting
                      ? "Applying..."
                      : selectedCount === 0 && parsedDoc?.semesterDateVariants && parsedDoc.semesterDateVariants[selectedVariantIndex]
                      ? `Apply ${parsedDoc.semesterDateVariants[selectedVariantIndex].shortLabel} Settings`
                      : selectedCount === 0 && parsedDoc?.semesterStartDate
                      ? "Apply Semester Settings"
                      : `Import ${selectedCount} Holidays & Sync Settings`}
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

