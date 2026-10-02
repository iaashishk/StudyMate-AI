import { useState, useEffect } from "react";
import {
  BarChart2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { WeeklyDailyBreakdown } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";

export default function ReportsTab() {
  const getMondayOfCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(
      mon.getDate()
    ).padStart(2, "0")}`;
  };

  const [weekStart, setWeekStart] = useState<string>(getMondayOfCurrentWeek());
  const [breakdown, setBreakdown] = useState<WeeklyDailyBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadWeekly = async (start: string) => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.getWeeklyReport(start);
      setBreakdown(res.dailyBreakdown);
    } catch (err) {
      console.error("Failed to load weekly report", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWeekly(weekStart);
  }, [weekStart]);

  const changeWeekBy = (weeks: number) => {
    const [y, m, d] = weekStart.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + weeks * 7);
    const newStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
    setWeekStart(newStr);
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const data = await attendanceApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studymate-attendance-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const chartData = breakdown.map((b) => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      day: dayNames[b.weekday],
      date: b.date,
      Present: b.present,
      Absent: b.absent,
      Cancelled: b.cancelled,
    };
  });

  const totalPresent = breakdown.reduce((acc, cur) => acc + cur.present, 0);
  const totalAbsent = breakdown.reduce((acc, cur) => acc + cur.absent, 0);
  const totalConducted = totalPresent + totalAbsent;
  const weeklyPct =
    totalConducted > 0 ? Number(((totalPresent / totalConducted) * 100).toFixed(1)) : 0;

  return (
    <div className="space-y-6">
      {/* Week Selector Ribbon */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#141414] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeWeekBy(-1)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
            title="Previous Week"
          >
            <ChevronLeft size={18} />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-[#0A84FF]" />
              <h3 className="font-bold text-white text-base">
                Weekly Attendance Report
              </h3>
            </div>
            <p className="text-xs text-[#8E8E93] font-mono">Week of {weekStart}</p>
          </div>

          <button
            onClick={() => changeWeekBy(1)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
            title="Next Week"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={handleExportJSON}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download size={14} />
          <span>{exporting ? "Exporting..." : "Export Full Attendance (JSON)"}</span>
        </button>
      </div>

      {/* Week Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-1">
          <p className="text-xs text-[#8E8E93]">Week Attendance Rate</p>
          <p className="text-2xl font-black text-white font-mono">{weeklyPct}%</p>
          <p className="text-[11px] text-[#8E8E93]">
            {totalPresent} attended of {totalConducted} classes
          </p>
        </div>

        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-1">
          <p className="text-xs text-emerald-400 font-semibold">Total Present</p>
          <p className="text-2xl font-black text-emerald-400 font-mono">{totalPresent}</p>
          <p className="text-[11px] text-[#8E8E93]">Sessions marked present this week</p>
        </div>

        <div className="p-4 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-1">
          <p className="text-xs text-rose-400 font-semibold">Total Absent</p>
          <p className="text-2xl font-black text-rose-400 font-mono">{totalAbsent}</p>
          <p className="text-[11px] text-[#8E8E93]">Sessions missed this week</p>
        </div>
      </div>

      {/* Weekly Bar Chart (FR-R1) */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
        <h4 className="font-bold text-white text-base tracking-tight">
          Daily Attendance Breakdown
        </h4>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" stroke="#8E8E93" fontSize={12} tickLine={false} />
                <YAxis stroke="#8E8E93" fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1C1C1E",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Legend />
                <Bar dataKey="Present" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Absent" fill="#EF4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cancelled" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
