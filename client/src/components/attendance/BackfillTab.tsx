import { useState, useEffect } from "react";
import {
  History,
  Calendar,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
  UploadCloud,
} from "lucide-react";
import { PendingDay, AttendanceStatus } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";

interface BackfillTabProps {
  onRefreshStats?: () => void;
  onNavigateToDay?: (date: string) => void;
}

export default function BackfillTab({
  onRefreshStats,
  onNavigateToDay,
}: BackfillTabProps) {
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getThreeWeeksAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [activeSubTab, setActiveSubTab] = useState<"autofill" | "pending" | "csv">("autofill");

  // Auto-fill Wizard State
  const [startDate, setStartDate] = useState(getThreeWeeksAgoStr());
  const [endDate, setEndDate] = useState(getYesterdayStr());
  const [defaultStatus, setDefaultStatus] = useState<AttendanceStatus>("present");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [clearOpeningBalances, setClearOpeningBalances] = useState(false);
  const [previewData, setPreviewData] = useState<{
    totalSessions: number;
    hasOpeningConflict: boolean;
    openingWarning: string | null;
    sessions: Array<{
      date: string;
      slotId: string;
      subjectId: string;
      subjectName: string;
      color: string;
      startTime: string;
      endTime: string;
      status: AttendanceStatus;
    }>;
  } | null>(null);

  // Pending Days State
  const [pendingDays, setPendingDays] = useState<PendingDay[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  // CSV Import State
  const [csvText, setCsvText] = useState("");
  const [csvResult, setCsvResult] = useState<{
    importedCount: number;
    errorCount: number;
    batchId: string;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Recent Batches & Undo
  const [recentBatches, setRecentBatches] = useState<Array<{ batchId: string; date: string }>>([]);
  const [undoLoading, setUndoLoading] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const res = await attendanceApi.getPendingDays();
      setPendingDays(res.pendingDays);
    } catch (err) {
      console.error("Failed to load pending days", err);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  // Step 1: Preview Auto-Fill
  const handleGeneratePreview = async () => {
    setIsPreviewing(true);
    try {
      const res = await attendanceApi.previewBackfill({
        startDate,
        endDate,
        defaultStatus,
      });
      setPreviewData(res);
      showToast(`Generated preview with ${res.totalSessions} sessions`);
    } catch (err: any) {
      console.error("Preview failed", err);
      showToast(err?.response?.data?.message || "Failed to generate preview");
    } finally {
      setIsPreviewing(false);
    }
  };

  // Step 2: Toggle exception status in preview
  const handleToggleSessionStatus = (index: number, newStatus: AttendanceStatus) => {
    if (!previewData) return;
    const updated = [...previewData.sessions];
    updated[index] = { ...updated[index], status: newStatus };
    setPreviewData({ ...previewData, sessions: updated });
  };

  // Step 3: Commit Backfill
  const handleCommitBackfill = async () => {
    if (!previewData || previewData.sessions.length === 0) return;
    setIsCommitting(true);
    try {
      const res = await attendanceApi.commitBackfill({
        entries: previewData.sessions.map((s) => ({
          date: s.date,
          slotId: s.slotId,
          subjectId: s.subjectId,
          status: s.status,
        })),
        clearOpeningBalances,
      });

      showToast(`Committed ${res.recordedSessions} sessions!`);
      setRecentBatches((prev) => [
        { batchId: res.batchId, date: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      setPreviewData(null);
      await loadPending();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("Commit backfill failed", err);
      showToast("Failed to commit back-fill");
    } finally {
      setIsCommitting(false);
    }
  };

  // Undo Batch (FR-B8, Acceptance Criterion 8)
  const handleUndoBatch = async (batchId: string) => {
    setUndoLoading(true);
    try {
      const res = await attendanceApi.undoBackfillBatch(batchId);
      showToast(`Undid batch: removed ${res.deletedCount} sessions`);
      setRecentBatches((prev) => prev.filter((b) => b.batchId !== batchId));
      await loadPending();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("Undo batch failed", err);
    } finally {
      setUndoLoading(false);
    }
  };

  // CSV Import (FR-B6)
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      showToast("Please paste CSV data");
      return;
    }
    setIsImporting(true);
    try {
      const lines = csvText.trim().split("\n");
      const rows = [];
      for (const line of lines) {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length >= 3) {
          // ignore header if present
          if (parts[0].toLowerCase() === "date" && parts[1].toLowerCase() === "subject") {
            continue;
          }
          rows.push({ date: parts[0], subject: parts[1], status: parts[2] });
        }
      }

      if (rows.length === 0) {
        showToast("No valid rows found. Format: YYYY-MM-DD, Subject Name, present/absent/cancelled");
        setIsImporting(false);
        return;
      }

      const res = await attendanceApi.importCsv(rows);
      setCsvResult(res);
      showToast(`Imported ${res.importedCount} rows successfully`);
      if (res.batchId) {
        setRecentBatches((prev) => [
          { batchId: res.batchId, date: new Date().toLocaleTimeString() },
          ...prev,
        ]);
      }
      setCsvText("");
      await loadPending();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      console.error("CSV import failed", err);
    } finally {
      setIsImporting(false);
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

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#141414] border border-white/[0.08] w-fit">
        <button
          onClick={() => setActiveSubTab("autofill")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === "autofill"
              ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25"
              : "text-[#8E8E93] hover:text-white"
          }`}
        >
          <Sparkles size={14} />
          <span>Timetable Auto-Fill Wizard</span>
        </button>

        <button
          onClick={() => setActiveSubTab("pending")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === "pending"
              ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25"
              : "text-[#8E8E93] hover:text-white"
          }`}
        >
          <History size={14} />
          <span>Pending Days ({pendingDays.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("csv")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === "csv"
              ? "bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25"
              : "text-[#8E8E93] hover:text-white"
          }`}
        >
          <FileSpreadsheet size={14} />
          <span>CSV Import</span>
        </button>
      </div>

      {/* Tab 1: Timetable Auto-Fill Wizard (FR-B2 Method 2) */}
      {activeSubTab === "autofill" && (
        <div className="space-y-5">
          <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Sparkles size={18} className="text-[#0A84FF]" />
                Auto-Fill Past Records from Timetable
              </h3>
              <p className="text-xs text-[#8E8E93]">
                The fastest way to back-fill weeks of attendance. We generate every lecture scheduled
                according to your timetable, pre-marked as Present. You only toggle your absences!
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={13} /> Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={13} /> End Date (up to yesterday)
                </label>
                <input
                  type="date"
                  value={endDate}
                  max={getYesterdayStr()}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1.5">
                  Default Mark
                </label>
                <select
                  value={defaultStatus}
                  onChange={(e) => setDefaultStatus(e.target.value as AttendanceStatus)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF] cursor-pointer"
                >
                  <option value="present" className="bg-[#1C1C1E] text-white">
                    Present (Recommended)
                  </option>
                  <option value="absent" className="bg-[#1C1C1E] text-white">
                    Absent
                  </option>
                  <option value="cancelled" className="bg-[#1C1C1E] text-white">
                    Cancelled
                  </option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGeneratePreview}
              disabled={isPreviewing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/25 cursor-pointer disabled:opacity-50"
            >
              <span>{isPreviewing ? "Generating..." : "Generate Preview & Exceptions"}</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Double-counting Warning (FR-B4) */}
          {previewData?.hasOpeningConflict && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={17} className="text-amber-400 shrink-0" />
                <span className="font-bold text-xs">Opening Balance Double-Counting Warning</span>
              </div>
              <p className="text-xs text-amber-200/80">{previewData.openingWarning}</p>
              <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer text-white font-medium">
                <input
                  type="checkbox"
                  checked={clearOpeningBalances}
                  onChange={(e) => setClearOpeningBalances(e.target.checked)}
                  className="accent-[#0A84FF] rounded"
                />
                <span>
                  Clear existing opening balances when saving (prevents double-counting)
                </span>
              </label>
            </div>
          )}

          {/* Generated Sessions Preview & Exception Editor (FR-B2, FR-B8) */}
          {previewData && (
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                <div>
                  <h4 className="font-bold text-white text-base">
                    Review Generated Sessions ({previewData.totalSessions})
                  </h4>
                  <p className="text-xs text-[#8E8E93]">
                    Click any session below to change it to Absent or Cancelled before saving.
                  </p>
                </div>
                <button
                  onClick={handleCommitBackfill}
                  disabled={isCommitting}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-500/90 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 cursor-pointer"
                >
                  {isCommitting ? "Recording..." : `Commit All ${previewData.totalSessions} Sessions`}
                </button>
              </div>

              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {previewData.sessions.map((session, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: session.color }}
                      />
                      <div>
                        <p className="font-bold text-white">{session.subjectName}</p>
                        <p className="text-[11px] font-mono text-[#8E8E93]">
                          {session.date} • {session.startTime}–{session.endTime}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleSessionStatus(idx, "present")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                          session.status === "present"
                            ? "bg-emerald-500 text-white"
                            : "bg-white/5 text-white/50 hover:text-white"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleToggleSessionStatus(idx, "absent")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                          session.status === "absent"
                            ? "bg-rose-500 text-white"
                            : "bg-white/5 text-white/50 hover:text-white"
                        }`}
                      >
                        Absent
                      </button>
                      <button
                        onClick={() => handleToggleSessionStatus(idx, "cancelled")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                          session.status === "cancelled"
                            ? "bg-amber-500 text-white"
                            : "bg-white/5 text-white/50 hover:text-white"
                        }`}
                      >
                        Cancelled
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pending Days Tracker (FR-B3) */}
      {activeSubTab === "pending" && (
        <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-2">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <History size={18} className="text-[#0A84FF]" />
              Pending Days Tracker
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Past dates that had scheduled classes according to your timetable but were left unmarked.
            </p>
          </div>

          {pendingLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pendingDays.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-[#141414] border border-white/[0.08] space-y-2">
              <CheckCircle2 size={32} className="mx-auto text-emerald-400" />
              <h4 className="font-bold text-white text-base">All Caught Up!</h4>
              <p className="text-xs text-[#8E8E93]">
                There are no pending unmarked dates in your semester.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {pendingDays.map((pd) => (
                <div
                  key={pd.date}
                  className="p-4 rounded-2xl bg-[#141414] border border-white/[0.07] flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-white text-sm">{pd.date}</p>
                    <p className="text-xs text-amber-400">
                      {pd.unmarkedCount} of {pd.totalSlots} classes unmarked
                    </p>
                  </div>
                  {onNavigateToDay && (
                    <button
                      onClick={() => onNavigateToDay(pd.date)}
                      className="px-3 py-1.5 rounded-xl bg-[#0A84FF]/20 hover:bg-[#0A84FF]/30 text-[#0A84FF] text-xs font-semibold cursor-pointer"
                    >
                      Fill Day
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: CSV Import (FR-B6) */}
      {activeSubTab === "csv" && (
        <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-3">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <UploadCloud size={18} className="text-[#0A84FF]" />
              Import Records from CSV
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Format: <span className="font-mono text-white">date, subject, status</span> (e.g.{" "}
              <span className="font-mono text-white/80">2026-09-15, Operating Systems, present</span>)
            </p>

            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="date, subject, status&#10;2026-09-15, Operating Systems, present&#10;2026-09-15, Algorithms, absent"
              className="w-full p-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#0A84FF]"
            />

            <button
              onClick={handleImportCsv}
              disabled={isImporting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <span>{isImporting ? "Importing..." : "Validate & Import CSV"}</span>
            </button>
          </div>

          {csvResult && (
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 text-xs">
              <p className="font-bold text-emerald-400">
                Successfully imported {csvResult.importedCount} records (Batch: {csvResult.batchId})
              </p>
              {csvResult.errorCount > 0 && (
                <div className="space-y-1 text-rose-300">
                  <p className="font-semibold">{csvResult.errorCount} row errors:</p>
                  {csvResult.errors.map((err, i) => (
                    <p key={i}>
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Batch Undo History (FR-B8, Acceptance Criterion 8) */}
      {recentBatches.length > 0 && (
        <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <RotateCcw size={16} className="text-[#0A84FF]" />
            <span>Recent Batches &amp; 1-Click Undo</span>
          </div>
          <p className="text-xs text-[#8E8E93]">
            Need to revert a bulk fill or import? Undo removes every entry recorded in that batch and
            restores previous percentages.
          </p>

          <div className="space-y-2 pt-1">
            {recentBatches.map((b) => (
              <div
                key={b.batchId}
                className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs"
              >
                <div className="font-mono text-white/80">
                  Batch: {b.batchId} ({b.date})
                </div>
                <button
                  onClick={() => handleUndoBatch(b.batchId)}
                  disabled={undoLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Undo Batch</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
