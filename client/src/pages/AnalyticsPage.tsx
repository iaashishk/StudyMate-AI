import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BarChart2 } from "lucide-react";
import api from "../lib/api";
import EmptyState from "../components/EmptyState";
import type { DashboardSummary } from "../types";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/summary")
      .then((res) => setSummary(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary || summary.totalTopics === 0) {
    return (
      <div className="px-6 md:px-10 py-8">
        <h1 className="font-display text-2xl text-ink font-semibold mb-6">
          Analytics
        </h1>
        <EmptyState
          icon={BarChart2}
          message="No data to chart yet"
          subMessage="Complete some tasks to start seeing your progress analytics."
        />
      </div>
    );
  }

  // Prepare 14-day history for AreaChart — filter to only days with data
  const historyData = summary.history
    .filter((d) => d.total > 0)
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      pct: d.pct ?? 0,
      done: d.done,
      total: d.total,
    }));

  // Subject pie data
  const pieData = summary.subjectStats.map((s) => ({
    name: s.name,
    value: s.pendingMinutes,
    color: s.color,
  }));

  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl pb-24 md:pb-8">
      <h1 className="font-display text-2xl text-ink font-semibold mb-8">Analytics</h1>

      {/* Overall stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-10">
        {[
          {
            label: "Overall completion",
            value: `${summary.completionPct}%`,
            sub: `${summary.completedTopics}/${summary.totalTopics} topics`,
          },
          {
            label: "Streak",
            value: summary.streak,
            sub: "consecutive days",
          },
          {
            label: "Today",
            value: `${summary.todayDone}/${summary.todayTotal}`,
            sub: "tasks done",
          },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="p-4 rounded-xl bg-white border border-ink/8 text-center"
          >
            <p className="font-body text-[11px] text-ink-60 uppercase tracking-wider mb-1">
              {label}
            </p>
            <p className="font-mono text-2xl font-medium text-ink">{value}</p>
            <p className="font-body text-[11px] text-ink-60 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* 14-day completion area chart */}
      {historyData.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display text-lg text-ink font-semibold mb-4">
            Daily completion (last 14 days)
          </h2>
          <div className="p-4 bg-white rounded-xl border border-ink/8">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="lampGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8A23C" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8A23C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#6B728E" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#6B728E" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`, "Completion"]}
                  contentStyle={{
                    fontFamily: "IBM Plex Sans",
                    fontSize: 12,
                    border: "1px solid #EEF1F5",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#E8A23C"
                  strokeWidth={2}
                  fill="url(#lampGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Subject time distribution pie chart */}
      {pieData.length > 0 && (
        <div>
          <h2 className="font-display text-lg text-ink font-semibold mb-4">
            Pending study time by subject
          </h2>
          <div className="p-4 bg-white rounded-xl border border-ink/8">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value ?? 0} min`, "Pending"]}
                  contentStyle={{
                    fontFamily: "IBM Plex Sans",
                    fontSize: 12,
                    border: "1px solid #EEF1F5",
                    borderRadius: 8,
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontFamily: "IBM Plex Sans", fontSize: 12, color: "#1B2140" }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
