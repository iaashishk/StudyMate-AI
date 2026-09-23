import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Lightbulb,
  BarChart2,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Today" },
  { to: "/subjects", icon: BookOpen, label: "Subjects" },
  { to: "/plan", icon: CalendarDays, label: "Plan" },
  { to: "/insights", icon: Lightbulb, label: "Insights" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-fog">
      {/* ── Desktop Nav Rail ───────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col w-[72px] lg:w-[200px] min-h-screen bg-ink shrink-0 py-6 px-3 lg:px-4 gap-1 sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-10">
          <span className="w-7 h-7 rounded-full bg-lamp shrink-0" />
          <div className="hidden lg:block">
            <span className="font-display text-fog text-sm font-semibold leading-none">
              StudyMate
            </span>
            <span className="font-display text-lamp text-sm font-semibold leading-none ml-0.5">
              AI
            </span>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body transition-all duration-200 group ${
                  isActive
                    ? "bg-lamp/15 text-lamp shadow-sm"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                }`
              }
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Version tag */}
        <div className="hidden lg:block px-3 pt-4 border-t border-white/10">
          <p className="font-body text-[10px] text-white/20">v1.0 — MVP</p>
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-ink/95 backdrop-blur-lg flex justify-around items-center h-16 px-2 z-50 border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        {navItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl text-[10px] font-body transition-colors ${
                isActive ? "text-lamp" : "text-white/40"
              }`
            }
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
