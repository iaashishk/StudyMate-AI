import { useState, useEffect } from "react";
import {
  Palmtree,
  Sparkles,
  Plus,
  Trash2,
  Calendar,
  CalendarDays,
  UploadCloud,
} from "lucide-react";
import { HolidayItem } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";
import HolidayParserModal from "./HolidayParserModal";

interface HolidayCalendarTabProps {
  onHolidaysUpdated?: () => void;
}

export default function HolidayCalendarTab({
  onHolidaysUpdated,
}: HolidayCalendarTabProps) {
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPopulating, setIsPopulating] = useState(false);
  const [isParserModalOpen, setIsParserModalOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadHolidays = async () => {
    setIsLoading(true);
    try {
      const data = await attendanceApi.getSettings();
      setHolidays(data.holidays || []);
    } catch (err) {
      console.error("Failed to load holidays", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, []);

  const handleAutoPopulate = async () => {
    setIsPopulating(true);
    try {
      const res = await attendanceApi.autoPopulateHolidays();
      setHolidays(res.holidays);
      showToast(
        `Added ${res.addedCount} academic holidays! (Total: ${res.totalHolidays})`
      );
      if (onHolidaysUpdated) onHolidaysUpdated();
    } catch (err) {
      console.error("Auto populate failed", err);
      showToast("Failed to auto-populate holidays");
    } finally {
      setIsPopulating(false);
    }
  };

  const handleAddCustomHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newLabel.trim()) return;

    try {
      const res = await attendanceApi.addHoliday(newDate, newLabel.trim());
      setHolidays((prev) => [...prev.filter((h) => h.date !== res.date), res]);
      setNewDate("");
      setNewLabel("");
      showToast(`Added holiday: "${res.label}" on ${res.date}`);
      if (onHolidaysUpdated) onHolidaysUpdated();
    } catch (err) {
      console.error("Add holiday failed", err);
      showToast("Failed to add holiday");
    }
  };

  const handleDeleteHoliday = async (id: string, label: string) => {
    try {
      await attendanceApi.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h._id !== id));
      showToast(`Removed "${label}"`);
      if (onHolidaysUpdated) onHolidaysUpdated();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const upcomingHolidays = holidays.filter((h) => h.date >= today);
  const pastHolidays = holidays.filter((h) => h.date < today);

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1C1C1E] border border-white/15 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm animate-in fade-in duration-200">
          <Sparkles size={16} className="text-[#0A84FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Top Hero Banner with 1-Click Auto-Populate ─────────────────────── */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-[#141414] to-[#1A1A22] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Palmtree size={22} className="text-amber-400" />
              <h3 className="text-xl font-extrabold text-white tracking-tight">
                Academic &amp; National Holiday Calendar
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93] max-w-xl">
              Classes scheduled on designated holidays are automatically cancelled and excluded
              from your attendance counts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={() => setIsParserModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Upload an image or PDF circular to automatically extract college holidays"
            >
              <UploadCloud size={15} className="text-[#0A84FF]" />
              <span>Scan Notice (Image/PDF)</span>
            </button>

            <button
              onClick={handleAutoPopulate}
              disabled={isPopulating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/35 text-amber-300 text-xs font-bold transition-all shadow-lg shadow-amber-500/10 cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={15} className="text-amber-400" />
              <span>
                {isPopulating
                  ? "Populating..."
                  : "Auto-Import Academic Holidays"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Holidays List & Upcoming ────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
                <CalendarDays size={18} className="text-[#0A84FF]" />
                Upcoming Holidays ({upcomingHolidays.length})
              </h4>
              <span className="text-xs text-[#8E8E93]">
                {holidays.length} Total Registered
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : holidays.length === 0 ? (
              <div className="p-10 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                <Palmtree size={32} className="mx-auto text-[#8E8E93]" />
                <p className="text-xs text-[#8E8E93]">
                  No holidays added yet. Click "Auto-Import Academic Holidays" above or add a
                  custom college break below.
                </p>
                <button
                  onClick={handleAutoPopulate}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold cursor-pointer"
                >
                  Import Standard Holidays
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {upcomingHolidays.map((h) => {
                  const [y, m, d] = h.date.split("-").map(Number);
                  const formatted = new Date(y, m - 1, d).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <div
                      key={h._id}
                      className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between gap-3 text-xs transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                          <Palmtree size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm tracking-tight">{h.label}</p>
                          <p className="text-[11px] font-mono text-[#8E8E93]">
                            {formatted} ({h.date})
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteHoliday(h._id, h.label)}
                        className="p-2 rounded-xl text-white/40 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                        title="Remove holiday"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}

                {pastHolidays.length > 0 && (
                  <div className="pt-4 border-t border-white/[0.06] space-y-2">
                    <p className="text-xs font-semibold text-[#8E8E93]">
                      Past Holidays ({pastHolidays.length})
                    </p>
                    {pastHolidays.map((h) => (
                      <div
                        key={h._id}
                        className="p-2.5 rounded-xl bg-white/[0.01] border border-white/5 opacity-60 hover:opacity-100 flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-medium text-white/80">
                          {h.label} — <span className="font-mono text-[#8E8E93]">{h.date}</span>
                        </span>
                        <button
                          onClick={() => handleDeleteHoliday(h._id, h.label)}
                          className="p-1 text-white/30 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Add Custom Holiday ───────────────────────────────────── */}
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4 shadow-xl">
            <h4 className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
              <Plus size={18} className="text-[#0A84FF]" />
              Add Custom College Holiday
            </h4>
            <p className="text-xs text-[#8E8E93]">
              Add exam prep leaves, college fests, sports events, or local breaks.
            </p>

            <form onSubmit={handleAddCustomHoliday} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={13} /> Date
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1.5">
                  Holiday / Event Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Annual Tech Fest, Sports Meet"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 cursor-pointer"
              >
                Add Holiday
              </button>
            </form>
          </div>
        </div>
      </div>

      <HolidayParserModal
        isOpen={isParserModalOpen}
        onClose={() => setIsParserModalOpen(false)}
        onImported={() => {
          loadHolidays();
          if (onHolidaysUpdated) onHolidaysUpdated();
        }}
      />
    </div>
  );
}
