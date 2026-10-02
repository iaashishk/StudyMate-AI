import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  FileText,
  Lightbulb,
  BarChart2,
  Settings,
  Play,
  HelpCircle,
  User,
  CalendarCheck,
  Code2,
  NotebookText,
  ChevronUp,
  X,
  Menu,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import FocusPlayerModal from "./FocusPlayerModal";
import InteractiveTutorialModal from "./InteractiveTutorialModal";
import { LogoIcon } from "./Logo";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Today" },
  { to: "/attendance", icon: CalendarCheck, label: "Attendance" },
  { to: "/subjects", icon: BookOpen, label: "Curriculum & Hub" },
  { to: "/assignments", icon: FileText, label: "Assignments" },
  { to: "/lab-codes", icon: Code2, label: "Lab Codes" },
  { to: "/notes", icon: NotebookText, label: "Cloud Notes" },
  { to: "/plan", icon: CalendarDays, label: "Smart Plan" },
  { to: "/insights", icon: Lightbulb, label: "AI Insights" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// Primary 5 in bottom bar — the most-used items
const mobilePrimaryItems = [
  { to: "/", icon: LayoutDashboard, label: "Today" },
  { to: "/attendance", icon: CalendarCheck, label: "Attendance" },
  { to: "/subjects", icon: BookOpen, label: "Subjects" },
  { to: "/assignments", icon: FileText, label: "Tasks" },
  { to: "/notes", icon: NotebookText, label: "Notes" },
];

// "More" drawer items (all remaining)
const mobileMoreItems = [
  { to: "/lab-codes", icon: Code2, label: "Lab Codes" },
  { to: "/plan", icon: CalendarDays, label: "Smart Plan" },
  { to: "/insights", icon: Lightbulb, label: "AI Insights" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  // Close "More" drawer whenever the route changes
  useEffect(() => {
    setMoreDrawerOpen(false);
  }, [location.pathname]);

  // 🐼 Bubu secret message modal (triggered from Settings footer)
  const [bubuMessage, setBubuMessage] = useState(false);
  const bubuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global listener for bubu message trigger from Settings footer
  useEffect(() => {
    const handleBubuEvent = () => {
      setBubuMessage(true);
      if (bubuTimer.current) clearTimeout(bubuTimer.current);
      bubuTimer.current = setTimeout(() => {
        setBubuMessage(false);
      }, 4000);
    };
    window.addEventListener("trigger-bubu-message", handleBubuEvent);
    return () => window.removeEventListener("trigger-bubu-message", handleBubuEvent);
  }, []);

  // Auto-launch interactive tour for first-time visitors unless dismissed
  useEffect(() => {
    const neverShow = localStorage.getItem("studymate_tutorial_never_show") === "true";
    const seen = localStorage.getItem("studymate_tutorial_completed") === "true";
    if (!neverShow && !seen) {
      const timer = setTimeout(() => setTutorialOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // Global listener so any component can trigger the interactive tour
  useEffect(() => {
    const handleOpen = () => setTutorialOpen(true);
    window.addEventListener("open-studymate-tutorial", handleOpen);
    return () => window.removeEventListener("open-studymate-tutorial", handleOpen);
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#0A0A0A] text-white">
      {/* ── 🐼 Bubu Secret Modal Overlay (Appears on 4 clicks) ─────────── */}
      {bubuMessage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm cursor-pointer select-none"
          onClick={() => setBubuMessage(false)}
        >
          <div
            className="bg-[#1C1C1E] border border-white/[0.12] rounded-3xl px-8 py-7 flex flex-col items-center gap-3.5 shadow-2xl text-center max-w-xs mx-auto animate-in fade-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-4xl shadow-inner select-none">
              🐼
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold text-base tracking-tight">
                made with love for p ❤️
              </p>
              <p className="text-[11px] text-[#8E8E93] font-mono tracking-wide">
                always &amp; forever
              </p>
            </div>
            <button
              onClick={() => setBubuMessage(false)}
              className="mt-1 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile Top Header Bar ──────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 bg-[#0F0F0F]/96 backdrop-blur-xl px-4 py-2.5 flex items-center justify-between border-b border-white/[0.07]">
        <NavLink to="/" className="flex items-center gap-2">
          <LogoIcon size={26} />
          <span className="font-semibold text-white text-sm tracking-tight flex items-center gap-1.5">
            StudyMate <span className="text-[#0A84FF]">AI</span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
              v2
            </span>
          </span>
        </NavLink>

        <div className="flex items-center gap-1.5">
          {/* Quick Focus Button */}
          <button
            onClick={() => setFocusModalOpen(true)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/[0.07] text-[#8E8E93] hover:text-white transition-colors"
            title="Focus Session"
            aria-label="Start Focus Session"
          >
            <Play size={14} fill="currentColor" />
          </button>

          {/* Guide Tour Trigger */}
          <button
            onClick={() => setTutorialOpen(true)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/[0.07] text-[#8E8E93] hover:text-white transition-colors"
            title="App Guide"
            aria-label="Interactive Tutorial"
          >
            <HelpCircle size={14} />
          </button>

          {/* Mobile Profile / Account Avatar linking to /settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-1.5 py-1 px-2 rounded-lg border text-xs transition-all ${
                isActive
                  ? "bg-white/10 border-white/15 text-white font-semibold"
                  : "bg-white/5 border-white/[0.07] text-white/80 hover:bg-white/8"
              }`
            }
            title="Account & Settings"
            aria-label="Account and Settings"
          >
            <div className="w-5 h-5 rounded-full bg-white/12 border border-white/15 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : <User size={11} />}
            </div>
            <span className="text-[11px] font-medium max-w-[65px] truncate">
              {user?.name ? user.name.split(" ")[0] : "Account"}
            </span>
          </NavLink>
        </div>
      </header>

      {/* ── Desktop Nav Rail ───────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col w-[72px] lg:w-[220px] min-h-screen bg-[#0F0F0F] border-r border-white/[0.07] shrink-0 py-6 px-3 lg:px-4 gap-1 sticky top-0 z-40">
        {/* Logo */}
        <NavLink to="/" className="flex items-center justify-center lg:justify-start gap-2.5 px-1 lg:px-2 mb-8 group">
          <LogoIcon size={34} className="group-hover:scale-105 transition-transform shrink-0" />
          <div className="hidden lg:block leading-tight">
            <div className="flex items-center">
              <span className="font-bold text-white text-base tracking-tight">
                StudyMate
              </span>
              <span className="font-bold text-[#0A84FF] text-base ml-1">
                AI
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25 ml-1.5">
                v2
              </span>
            </div>
            <p className="text-[10px] text-[#8E8E93] font-normal tracking-tight">
              Adaptive Curriculum Engine
            </p>
          </div>
        </NavLink>

        {/* Quick Focus Mode Button */}
        <div className="mb-4 px-1">
          <button
            onClick={() => setFocusModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-2.5 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.07] text-white text-xs font-semibold transition-all cursor-pointer"
            title="Start Pomodoro Focus Session"
          >
            <Play size={13} className="shrink-0" fill="currentColor" />
            <span className="hidden lg:inline">Focus Session</span>
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-0.5 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-white/8 text-white border border-white/10"
                    : "text-[#8E8E93] hover:text-white hover:bg-white/[0.05]"
                }`
              }
            >
              <Icon size={17} strokeWidth={1.75} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Bottom Section: Guide + User Account Card + Bubu */}
        <div className="pt-2 px-1 border-t border-white/[0.07] mt-auto flex flex-col gap-1.5">
          {/* Quick Guide */}
          <button
            onClick={() => setTutorialOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-2.5 py-2 px-2.5 rounded-xl text-[#8E8E93] hover:text-white hover:bg-white/[0.05] text-xs font-medium transition-colors cursor-pointer"
            title="Interactive Tutorial & Guide"
          >
            <HelpCircle size={16} className="shrink-0" />
            <span className="hidden lg:inline">Quick Guide</span>
          </button>

          {/* User Account Card */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                isActive
                  ? "bg-white/8 border-white/10 text-white"
                  : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-white/80"
              }`
            }
            title="Account & Settings"
          >
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/12 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : <User size={14} />}
            </div>
            <div className="hidden lg:flex flex-col min-w-0 flex-1 text-left">
              <span className="text-xs font-medium truncate">
                {user?.name || "Account"}
              </span>
              <span className="text-[10px] text-[#8E8E93] truncate">
                {user?.email || "Manage settings"}
              </span>
            </div>
          </NavLink>
        </div>
      </nav>

      {/* ── Main content (Full Width with mobile bottom bar padding) ─────── */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* ── Mobile "More" Drawer Backdrop ──────────────────────────────── */}
      {moreDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMoreDrawerOpen(false)}
        />
      )}

      {/* ── Mobile "More" Slide-Up Drawer ──────────────────────────────── */}
      <div
        className={`md:hidden fixed bottom-16 left-0 right-0 z-50 bg-[#141414] border-t border-white/[0.10] rounded-t-3xl transition-transform duration-300 ease-out ${
          moreDrawerOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
          <span className="text-xs font-bold text-white">More</span>
          <button
            onClick={() => setMoreDrawerOpen(false)}
            className="p-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-3 gap-2 p-4 pb-6">
          {mobileMoreItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl text-[11px] font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25"
                    : "bg-white/[0.04] text-[#8E8E93] hover:text-white hover:bg-white/[0.08] border border-white/[0.06]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.75} />
                  <span className="text-center leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Focus Session quick-launch in drawer */}
          <button
            onClick={() => { setMoreDrawerOpen(false); setFocusModalOpen(true); }}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl text-[11px] font-semibold bg-white/[0.04] text-[#8E8E93] hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
          >
            <Play size={20} strokeWidth={1.75} />
            <span className="text-center leading-tight">Focus</span>
          </button>

          {/* Tutorial / Guide in drawer */}
          <button
            onClick={() => { setMoreDrawerOpen(false); setTutorialOpen(true); }}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl text-[11px] font-semibold bg-white/[0.04] text-[#8E8E93] hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
          >
            <HelpCircle size={20} strokeWidth={1.75} />
            <span className="text-center leading-tight">Guide</span>
          </button>
        </div>
      </div>

      {/* ── Mobile Bottom Nav (Primary 5 + More) ───────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0F0F0F]/96 backdrop-blur-xl flex items-stretch h-16 px-1 z-50 border-t border-white/[0.07] pb-[env(safe-area-inset-bottom)]">
        {mobilePrimaryItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-1 flex-1 text-[10px] font-medium transition-colors ${
                isActive ? "text-[#0A84FF]" : "text-[#8E8E93] hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.75} />
                <span className="truncate max-w-[52px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* "More" button */}
        <button
          onClick={() => setMoreDrawerOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-1 py-1 flex-1 text-[10px] font-medium transition-colors cursor-pointer ${
            moreDrawerOpen ? "text-[#0A84FF]" : "text-[#8E8E93] hover:text-white"
          }`}
        >
          {moreDrawerOpen ? <ChevronUp size={18} strokeWidth={2.2} /> : <Menu size={18} strokeWidth={1.75} />}
          <span>{moreDrawerOpen ? "Close" : "More"}</span>
        </button>
      </nav>

      {/* Focus Player Modal */}
      <FocusPlayerModal
        isOpen={focusModalOpen}
        onClose={() => setFocusModalOpen(false)}
        topicTitle="Deep Work Session"
        subjectName="General Study"
      />

      {/* Interactive Walkthrough / Tutorial Modal */}
      <InteractiveTutorialModal
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
}
