import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  X,
  Settings2,
  Calendar,
  Shield,
  Palmtree,
  Trash2,
  AlertOctagon,
  Save,
  Plus,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { HolidayItem } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";
import { extractSyllabusFromFile } from "../../lib/file-extractor";
import { parseAcademicDocFromText } from "../../lib/holiday-parser";
import { parseTimetableDocFromText } from "../../lib/timetable-parser";

interface AttendanceSettingsModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function AttendanceSettingsModal({
  onClose,
  onSaved,
}: AttendanceSettingsModalProps) {
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);

  const [defaultMin, setDefaultMin] = useState(75);
  const [safetyMargin, setSafetyMargin] = useState(0);
  const [maxSlots, setMaxSlots] = useState(6);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    attendanceApi
      .getSettings()
      .then((data) => {
        setHolidays(data.holidays);
        setDefaultMin(data.settings.defaultMinPercent);
        setSafetyMargin(data.settings.safetyMargin);
        setMaxSlots(data.settings.maxSlots);
        setStartDate(data.semester.startDate || "");
        setEndDate(data.semester.endDate || "");
      })
      .catch((err) => console.error("Failed to load settings", err));
  }, []);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        attendanceApi.updateSettings({
          defaultMinPercent: Number(defaultMin),
          safetyMargin: Number(safetyMargin),
          maxSlots: Number(maxSlots),
        }),
        attendanceApi.updateSemester({
          startDate,
          endDate: endDate || undefined,
        }),
      ]);
      setMessage("Settings saved successfully!");
      onSaved();
    } catch (err) {
      console.error("Save settings failed", err);
      setMessage("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHolidayDate || !newHolidayLabel.trim()) return;
    try {
      const res = await attendanceApi.addHoliday(newHolidayDate, newHolidayLabel.trim());
      setHolidays((prev) => [...prev.filter((h) => h.date !== res.date), res]);
      setNewHolidayDate("");
      setNewHolidayLabel("");
    } catch (err) {
      console.error("Add holiday failed", err);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await attendanceApi.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h._id !== id));
    } catch (err) {
      console.error("Delete holiday failed", err);
    }
  };

  const handleAutoSyncDoc = async (selectedFile: File) => {
    setIsExtractingDoc(true);
    setMessage(null);
    try {
      const { text } = await extractSyllabusFromFile(selectedFile);
      const academicDoc = parseAcademicDocFromText(text);
      const timetableDoc = parseTimetableDocFromText(text, []);

      let detectedFieldsCount = 0;

      if (academicDoc.semesterStartDate) {
        setStartDate(academicDoc.semesterStartDate);
        detectedFieldsCount++;
      } else if (timetableDoc.effectiveStartDate) {
        setStartDate(timetableDoc.effectiveStartDate);
        detectedFieldsCount++;
      }

      if (academicDoc.semesterEndDate) {
        setEndDate(academicDoc.semesterEndDate);
        detectedFieldsCount++;
      }

      if (academicDoc.defaultMinPercent) {
        setDefaultMin(academicDoc.defaultMinPercent);
        detectedFieldsCount++;
      } else if (timetableDoc.defaultMinPercent) {
        setDefaultMin(timetableDoc.defaultMinPercent);
        detectedFieldsCount++;
      }

      if (timetableDoc.maxSlotsPerDay && timetableDoc.maxSlotsPerDay >= 4) {
        setMaxSlots(timetableDoc.maxSlotsPerDay);
        detectedFieldsCount++;
      }

      if (academicDoc.holidays && academicDoc.holidays.length > 0) {
        for (const h of academicDoc.holidays) {
          await attendanceApi.addHoliday(h.date, h.label);
        }
        const updated = await attendanceApi.getSettings();
        setHolidays(updated.holidays);
        detectedFieldsCount += academicDoc.holidays.length;
      }

      setMessage(
        `Auto-extracted from "${selectedFile.name}": Synced ${detectedFieldsCount} academic settings and holidays!`
      );
    } catch (err: unknown) {
      console.error("Auto sync doc error", err);
      setMessage("Could not parse file. You can still set dates manually below.");
    } finally {
      setIsExtractingDoc(false);
    }
  };

  const handleResetSemester = async (action: "clear_records" | "archive_subjects") => {
    const confirmText =
      action === "clear_records"
        ? "Clear all attendance entries and timetable?"
        : "Archive all subjects and clear attendance entries?";
    if (window.confirm(`WARNING: ${confirmText}\nThis action cannot be undone.`)) {
      try {
        await attendanceApi.resetSemester(action);
        alert("Semester reset successfully");
        onSaved();
        onClose();
      } catch (err) {
        console.error("Reset failed", err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-6">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white">
            <Settings2 size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Attendance Settings &amp; Semester
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Configure limits, safety margins, semester span, and holidays
            </p>
          </div>
        </div>

        {/* 1-Click Auto-Sync from Doc Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0A84FF]/10 via-[#0A84FF]/5 to-amber-500/10 border border-[#0A84FF]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#0A84FF]" />
              Auto-Sync from Document (Image/PDF)
            </p>
            <p className="text-[11px] text-[#8E8E93]">
              Upload university calendar notice or timetable to auto-fill semester span, target %, and breaks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            disabled={isExtractingDoc}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 self-start sm:self-auto"
          >
            <UploadCloud size={14} className="text-[#0A84FF]" />
            <span>{isExtractingDoc ? "Parsing Doc…" : "Upload Doc"}</span>
          </button>
          <input
            ref={docInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleAutoSyncDoc(e.target.files[0]);
              }
            }}
          />
        </div>

        {message && (
          <div className="p-3 rounded-xl bg-[#0A84FF]/20 border border-[#0A84FF]/30 text-[#0A84FF] text-xs font-semibold">
            {message}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-5">
          {/* Semester Dates */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Calendar size={14} className="text-[#0A84FF]" />
              Semester Span (FR-B1)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/70 mb-1">Semester Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/70 mb-1">
                  Semester End Date (Forecast)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Limits & Margins */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Shield size={14} className="text-emerald-400" />
              Attendance Rules &amp; Safety Buffer (FR-K9)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/70 mb-1">
                  Default Minimum Limit (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={defaultMin}
                  onChange={(e) => setDefaultMin(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/70 mb-1">
                  Safety Margin Buffer (+%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={safetyMargin}
                  onChange={(e) => setSafetyMargin(Number(e.target.value))}
                  placeholder="e.g. 2 for 77% target"
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#8E8E93]">
              Safety margin (e.g. +2%) keeps you safely above the line when calculating bunk budgets.
            </p>
          </div>

          {/* Holidays */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Palmtree size={14} className="text-amber-400" />
              Holidays &amp; Academic Breaks (FR-A6)
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none"
              />
              <input
                type="text"
                placeholder="Holiday name"
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddHoliday}
                className="px-3 py-2 rounded-xl bg-[#0A84FF] text-white text-xs font-bold hover:bg-[#0A84FF]/90 cursor-pointer"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {holidays.map((h) => (
                <div
                  key={h._id}
                  className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-white/5"
                >
                  <span className="font-mono text-white/80">
                    {h.date} — {h.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(h._id)}
                    className="text-white/40 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} />
              <span>{isSaving ? "Saving..." : "Save Preferences"}</span>
            </button>
          </div>
        </form>

        {/* Reset Semester (FR-G4) */}
        <div className="pt-4 border-t border-white/[0.08] space-y-2">
          <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
            <AlertOctagon size={14} /> Danger Zone: Semester Reset
          </h4>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleResetSemester("clear_records")}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold cursor-pointer"
            >
              Clear Records Only
            </button>
            <button
              type="button"
              onClick={() => handleResetSemester("archive_subjects")}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold cursor-pointer"
            >
              Archive All Subjects &amp; Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
