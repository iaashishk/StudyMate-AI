import { useState, useEffect } from "react";
import {
  Sparkles,
  Flame,
  ShieldCheck,
  BookmarkPlus,
  Trash2,
  CalendarCheck,
  Plus,
} from "lucide-react";
import { ForecastItem, BunkPlan, AttendanceSubject } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";

export default function BunkPlannerTab() {
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [semesterStart, setSemesterStart] = useState("");
  const [semesterEnd, setSemesterEnd] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<BunkPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Simulation State
  const [plannedSkips, setPlannedSkips] = useState<Array<{ date: string; subjectId: string }>>([]);
  const [newSkipDate, setNewSkipDate] = useState(getTomorrowStr());
  const [newSkipSubjectId, setNewSkipSubjectId] = useState("");
  const [planName, setPlanName] = useState("");
  const [isProjecting, setIsProjecting] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{
    firstBreach: {
      date: string;
      subjectName: string;
      projectedPct: number;
      limit: number;
      message: string;
    } | null;
    timeline: Array<{
      date: string;
      subjectId: string;
      subjectName: string;
      projectedPct: number;
      isBreach: boolean;
    }>;
    hasBreach: boolean;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fData, sData, pData] = await Promise.all([
        attendanceApi.getSemesterForecast(),
        attendanceApi.getSubjects(),
        attendanceApi.getBunkPlans(),
      ]);
      setForecasts(fData.forecasts);
      setSemesterStart(fData.semesterStartDate);
      setSemesterEnd(fData.semesterEndDate);
      setSubjects(sData);
      if (sData.length > 0) setNewSkipSubjectId(sData[0]._id);
      setSavedPlans(pData);
    } catch (err) {
      console.error("Failed to load forecast data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addPlannedSkip = async () => {
    if (!newSkipSubjectId || !newSkipDate) return;
    const updated = [...plannedSkips, { date: newSkipDate, subjectId: newSkipSubjectId }];
    setPlannedSkips(updated);
    await runProjection(updated);
  };

  const removePlannedSkip = async (index: number) => {
    const updated = plannedSkips.filter((_, i) => i !== index);
    setPlannedSkips(updated);
    if (updated.length === 0) {
      setSimulationResult(null);
    } else {
      await runProjection(updated);
    }
  };

  const runProjection = async (skips: Array<{ date: string; subjectId: string }>) => {
    setIsProjecting(true);
    try {
      const res = await attendanceApi.projectBunkPlan(skips);
      setSimulationResult(res);
    } catch (err) {
      console.error("Projection failed", err);
    } finally {
      setIsProjecting(false);
    }
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) {
      showToast("Please enter a name for this plan");
      return;
    }
    if (plannedSkips.length === 0) {
      showToast("Add at least one planned skip");
      return;
    }
    try {
      await attendanceApi.saveBunkPlan({
        name: planName.trim(),
        items: plannedSkips,
      });
      showToast(`Saved plan "${planName}"!`);
      setPlanName("");
      const p = await attendanceApi.getBunkPlans();
      setSavedPlans(p);
    } catch (err) {
      console.error("Save plan failed", err);
    }
  };

  const handleLoadPlan = async (plan: BunkPlan) => {
    const items = plan.items.map((i) => ({
      date: i.date,
      subjectId: typeof i.subjectId === "object" ? (i.subjectId as any)._id : i.subjectId,
    }));
    setPlannedSkips(items);
    await runProjection(items);
    showToast(`Loaded plan "${plan.name}"`);
  };

  const handleDeletePlan = async (id: string) => {
    try {
      await attendanceApi.deleteBunkPlan(id);
      setSavedPlans((prev) => prev.filter((p) => p._id !== id));
      showToast("Plan deleted");
    } catch (err) {
      console.error("Delete plan failed", err);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#8E8E93]">Loading forecast and simulator...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1C1C1E] border border-white/15 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm animate-in fade-in duration-200">
          <Sparkles size={16} className="text-[#0A84FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner: Semester Forecast (FR-K5) */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-[#141414] to-[#1A1A1E] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#0A84FF]" />
              <h3 className="text-xl font-bold text-white tracking-tight">
                Semester Attendance Forecast
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93]">
              Calculated using remaining timetable occurrences through semester end{" "}
              {semesterEnd ? `(${semesterEnd})` : ""}
            </p>
          </div>
          <div className="text-xs text-[#8E8E93] bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 self-start sm:self-auto font-mono">
            Semester Start: {semesterStart || "N/A"}
          </div>
        </div>

        {/* Forecast Table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-[#8E8E93]">
                <th className="pb-2.5 font-semibold">Subject</th>
                <th className="pb-2.5 font-semibold">Limit</th>
                <th className="pb-2.5 font-semibold">Current</th>
                <th className="pb-2.5 font-semibold">Remaining</th>
                <th className="pb-2.5 font-semibold">Max Safe Bunks</th>
                <th className="pb-2.5 font-semibold">Min to Attend</th>
                <th className="pb-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {forecasts.map((f) => (
                <tr key={f._id} className="hover:bg-white/[0.02]">
                  <td className="py-3 font-semibold text-white flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: f.color }}
                    />
                    <span>{f.name}</span>
                  </td>
                  <td className="py-3 text-[#8E8E93] font-mono">{f.minPercent}%</td>
                  <td className="py-3 text-white font-mono">
                    {f.attended} / {f.conducted} (
                    {f.conducted > 0 ? ((f.attended / f.conducted) * 100).toFixed(1) : 0}%)
                  </td>
                  <td className="py-3 text-white font-mono">{f.remainingSessions} classes</td>
                  <td className="py-3 font-mono">
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                      {f.maxBunksLeft} safe
                    </span>
                  </td>
                  <td className="py-3 font-mono text-white">
                    {f.minimumToAttend} classes
                  </td>
                  <td className="py-3">
                    {f.isRecoverable ? (
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                        Recoverable 🟢
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-full">
                        Not Recoverable 🔴
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {forecasts.map((f) => (
            <article
              key={f._id}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: f.color }}
                  />
                  <div className="min-w-0">
                    <h4 className="break-words text-sm font-semibold leading-snug text-white">
                      {f.name}
                    </h4>
                    {f.code && <p className="mt-0.5 text-[10px] text-white/45">{f.code}</p>}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                    f.isRecoverable
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {f.isRecoverable ? "Recoverable" : "At risk"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-white/[0.06] pt-3">
                <div>
                  <p className="text-[10px] text-white/45">Attendance</p>
                  <p className="mt-0.5 text-xs font-mono text-white">
                    {f.attended}/{f.conducted} · {f.conducted > 0
                      ? ((f.attended / f.conducted) * 100).toFixed(1)
                      : "0.0"}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/45">Required</p>
                  <p className="mt-0.5 text-xs font-mono text-white">{f.minPercent}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/45">Classes remaining</p>
                  <p className="mt-0.5 text-xs font-mono text-white">{f.remainingSessions}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/45">Safe skips</p>
                  <p className="mt-0.5 text-xs font-mono font-bold text-emerald-300">
                    {f.maxBunksLeft}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-white/45">Minimum classes to attend</p>
                  <p className="mt-0.5 text-xs font-mono text-white">{f.minimumToAttend}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Interactive Bunk Planner (FR-K4) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Simulation & Breach Alerts */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <CalendarCheck size={18} className="text-[#0A84FF]" />
                  Bunk Simulator &amp; Breach Predictor
                </h4>
                <p className="text-xs text-[#8E8E93]">
                  Select future dates to skip; live simulation flags the first date you breach limits
                </p>
              </div>
            </div>

            {/* Breach Alert Banner (FR-K4 Acceptance Criterion 12) */}
            {simulationResult?.hasBreach && simulationResult.firstBreach && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-3">
                <Flame size={20} className="shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-rose-200">
                    Limit Breach Detected!
                  </p>
                  <p className="text-xs text-rose-300/90">
                    {simulationResult.firstBreach.message} (Limit:{" "}
                    {simulationResult.firstBreach.limit}%)
                  </p>
                  <p className="text-[11px] text-rose-400 font-mono">
                    First breach date: {simulationResult.firstBreach.date}
                  </p>
                </div>
              </div>
            )}

            {simulationResult && !simulationResult.hasBreach && plannedSkips.length > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
                <ShieldCheck size={20} className="shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-bold">All Subjects Remain Safe!</p>
                  <p className="text-xs text-emerald-200/80">
                    Even after {plannedSkips.length} planned skip
                    {plannedSkips.length > 1 ? "s" : ""}, no subject falls below its requirement.
                  </p>
                </div>
              </div>
            )}

            {/* Add Skip Bar */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex flex-col sm:flex-row items-center gap-3">
              <input
                type="date"
                value={newSkipDate}
                onChange={(e) => setNewSkipDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#0A84FF] cursor-pointer"
              />

              <select
                value={newSkipSubjectId}
                onChange={(e) => setNewSkipSubjectId(e.target.value)}
                className="w-full sm:flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF] cursor-pointer"
              >
                {subjects.map((s) => (
                  <option key={s._id} value={s._id} className="bg-[#1C1C1E] text-white">
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                onClick={addPlannedSkip}
                disabled={isProjecting}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Plus size={15} />
                <span>{isProjecting ? "Projecting..." : "Add Skip"}</span>
              </button>
            </div>

            {/* Planned Skips List */}
            {plannedSkips.length === 0 ? (
              <p className="text-xs text-[#8E8E93] text-center py-6">
                No future skips planned yet. Add a class above to project its impact.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white/70">
                  Planned Skips ({plannedSkips.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plannedSkips.map((skip, idx) => {
                    const subj = subjects.find((s) => s._id === skip.subjectId);
                    const timelineEntry = simulationResult?.timeline.find(
                      (t) => t.date === skip.date && t.subjectId === skip.subjectId
                    );

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                          timelineEntry?.isBreach
                            ? "bg-rose-500/10 border-rose-500/25"
                            : "bg-white/[0.04] border-white/10"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-white flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: subj?.color || "#0A84FF" }}
                            />
                            {subj?.name}
                          </p>
                          <p className="text-[11px] font-mono text-[#8E8E93]">{skip.date}</p>
                          {timelineEntry && (
                            <p
                              className={`text-[11px] font-mono ${
                                timelineEntry.isBreach ? "text-rose-400 font-bold" : "text-emerald-400"
                              }`}
                            >
                              Projected: {timelineEntry.projectedPct}%
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removePlannedSkip(idx)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Saved Plans Manager */}
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
            <h4 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <BookmarkPlus size={18} className="text-[#0A84FF]" />
              Save This Plan
            </h4>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="e.g. Goa Trip Plan, Tech Fest Week"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
              />

              <button
                onClick={handleSavePlan}
                disabled={plannedSkips.length === 0}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
              >
                Save Named Plan
              </button>
            </div>

            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <p className="text-xs font-semibold text-white/70">
                Saved Plans ({savedPlans.length})
              </p>
              {savedPlans.length === 0 ? (
                <p className="text-[11px] text-[#8E8E93]">No saved plans yet.</p>
              ) : (
                <div className="space-y-2">
                  {savedPlans.map((p) => (
                    <div
                      key={p._id}
                      className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-white text-xs">{p.name}</p>
                        <p className="text-[10px] text-[#8E8E93]">
                          {p.items?.length || 0} planned skips
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleLoadPlan(p)}
                          className="px-2.5 py-1 rounded-lg bg-[#0A84FF]/20 text-[#0A84FF] text-[11px] font-semibold hover:bg-[#0A84FF]/30 cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeletePlan(p._id)}
                          className="p-1 rounded-lg text-white/40 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
