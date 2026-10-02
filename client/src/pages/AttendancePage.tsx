import { useState, useEffect } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  BookOpen,
  Sparkles,
  History,
  BarChart2,
  Settings2,
  CalendarCheck,
  Palmtree,
} from "lucide-react";
import TodayTab from "../components/attendance/TodayTab";
import SubjectsTab from "../components/attendance/SubjectsTab";
import TimetableTab from "../components/attendance/TimetableTab";
import HolidayCalendarTab from "../components/attendance/HolidayCalendarTab";
import BunkPlannerTab from "../components/attendance/BunkPlannerTab";
import BackfillTab from "../components/attendance/BackfillTab";
import ReportsTab from "../components/attendance/ReportsTab";
import AttendanceSettingsModal from "../components/attendance/AttendanceSettingsModal";
import { attendanceApi } from "../lib/attendance-api";

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<
    "today" | "subjects" | "timetable" | "holidays" | "planner" | "backfill" | "reports"
  >("today");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPendingCount = async () => {
    try {
      const res = await attendanceApi.getPendingDays();
      setPendingCount(res.pendingCount);
    } catch (err) {
      console.error("Failed to load pending count", err);
    }
  };

  useEffect(() => {
    loadPendingCount();
  }, []);

  const tabs = [
    { id: "today", label: "Today", icon: LayoutDashboard },
    { id: "subjects", label: "Subjects & Bunks", icon: BookOpen },
    { id: "timetable", label: "Weekly Timetable", icon: CalendarDays },
    { id: "holidays", label: "Holiday Calendar", icon: Palmtree },
    { id: "planner", label: "Bunk Planner & Forecast", icon: Sparkles },
    {
      id: "backfill",
      label: `Back-fill${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
      icon: History,
    },
    { id: "reports", label: "Reports & Charts", icon: BarChart2 },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF]">
              <CalendarCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Attendance Tracker
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
                  SMART BUNKS
                </span>
              </div>
              <p className="text-xs text-[#8E8E93]">
                Daily marking, timetable versioning, live bunk thresholds &amp; semester forecasting
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
          title="Attendance Settings & Semester Dates"
        >
          <Settings2 size={15} />
          <span>Tracker Settings</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-white/[0.08]">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-[#0A84FF] text-white shadow-lg shadow-[#0A84FF]/20"
                  : "text-[#8E8E93] hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
              {id === "backfill" && pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "today" && (
        <TodayTab
          onNavigateTab={(tab) => setActiveTab(tab as any)}
          pendingCount={pendingCount}
        />
      )}

      {activeTab === "subjects" && (
        <SubjectsTab onRefreshStats={loadPendingCount} />
      )}

      {activeTab === "timetable" && <TimetableTab />}

      {activeTab === "holidays" && (
        <HolidayCalendarTab onHolidaysUpdated={loadPendingCount} />
      )}

      {activeTab === "planner" && <BunkPlannerTab />}

      {activeTab === "backfill" && (
        <BackfillTab
          onRefreshStats={loadPendingCount}
          onNavigateToDay={() => {
            setActiveTab("today");
          }}
        />
      )}

      {activeTab === "reports" && <ReportsTab />}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <AttendanceSettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onSaved={() => {
            loadPendingCount();
          }}
        />
      )}
    </div>
  );
}
