import { useState, useEffect, useCallback } from "react";
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
  Brain,
} from "lucide-react";
import TodayTab from "../components/attendance/TodayTab";
import SubjectsTab from "../components/attendance/SubjectsTab";
import TimetableTab from "../components/attendance/TimetableTab";
import HolidayCalendarTab from "../components/attendance/HolidayCalendarTab";
import BunkPlannerTab from "../components/attendance/BunkPlannerTab";
import BackfillTab from "../components/attendance/BackfillTab";
import ReportsTab from "../components/attendance/ReportsTab";
import AttendanceSettingsModal from "../components/attendance/AttendanceSettingsModal";
import SemesterBrainPanel from "../components/attendance/SemesterBrainPanel";
import { attendanceApi } from "../lib/attendance-api";

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<
    "today" | "subjects" | "timetable" | "holidays" | "planner" | "backfill" | "reports" | "brain"
  >("today");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState<string | undefined>();
  const clearAttendanceDate = useCallback(() => setAttendanceDate(undefined), []);

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
    { id: "today", label: "Today", shortLabel: "Today", icon: LayoutDashboard },
    { id: "brain", label: "Academic Brain", shortLabel: "Brain", icon: Brain },
    { id: "subjects", label: "Subjects & Bunks", shortLabel: "Subjects", icon: BookOpen },
    { id: "timetable", label: "Weekly Timetable", shortLabel: "Timetable", icon: CalendarDays },
    { id: "holidays", label: "Holiday Calendar", shortLabel: "Holidays", icon: Palmtree },
    { id: "planner", label: "Bunk Planner & Forecast", shortLabel: "Bunk Planner", icon: Sparkles },
    {
      id: "backfill",
      label: `Back-fill${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
      shortLabel: `Backfill${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
      icon: History,
    },
    { id: "reports", label: "Reports & Charts", shortLabel: "Reports", icon: BarChart2 },
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
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10">
                  v2.2
                </span>
              </div>
              <p className="text-xs text-[#8E8E93]">
                Your classes and attendance
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
      <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-2 scrollbar-none border-b border-white/[0.08]">
        {tabs.map(({ id, label, shortLabel, icon: Icon }) => {
          const isActive = activeTab === id;
          const isBrain = id === "brain";
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? isBrain
                    ? "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
                    : "bg-[#0A84FF] text-white shadow-lg shadow-[#0A84FF]/20"
                  : isBrain
                  ? "text-purple-400 hover:text-white hover:bg-purple-500/10"
                  : "text-[#8E8E93] hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={14} className="sm:size-[15px]" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
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
          initialDate={attendanceDate}
          onInitialDateConsumed={clearAttendanceDate}
        />
      )}

      {activeTab === "brain" && (
        <SemesterBrainPanel
          onNavigateTab={(tab) => {
            if (tab === "settings") {
              setIsSettingsOpen(true);
            } else {
              setActiveTab(tab as any);
            }
          }}
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
          onNavigateToDay={(date) => {
            setAttendanceDate(date);
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
