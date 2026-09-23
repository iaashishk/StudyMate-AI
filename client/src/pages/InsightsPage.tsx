import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import api from "../lib/api";
import EmptyState from "../components/EmptyState";

export default function InsightsPage() {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/plan/insights")
      .then((res) => setInsights(res.data.data.insights))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 py-8 max-w-2xl pb-24 md:pb-8">
      <h1 className="font-display text-2xl text-ink font-semibold mb-2">
        AI Insights
      </h1>
      <p className="font-body text-sm text-ink-60 mb-8">
        Here's why your study plan looks the way it does — based on urgency,
        confidence, and time remaining.
      </p>

      {insights.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          message="No insights yet"
          subMessage="Add subjects with topics and confidence ratings to get personalized insights."
        />
      ) : (
        <div className="space-y-4">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border-l-4 font-body text-sm ${
                insight.startsWith("  ↳")
                  ? "border-l-ink/20 bg-white ml-4 text-ink-60"
                  : insight.includes("🔴")
                  ? "border-l-deadline bg-deadline/5 text-ink"
                  : insight.includes("🟡")
                  ? "border-l-lamp bg-lamp/5 text-ink"
                  : insight.includes("✅")
                  ? "border-l-confidence bg-confidence/5 text-ink"
                  : "border-l-confidence/50 bg-white text-ink"
              }`}
            >
              {insight.replace("  ↳", "↳")}
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 p-4 rounded-xl bg-ink/4 border border-ink/8">
        <h3 className="font-display text-sm font-semibold text-ink mb-2">
          How does the algorithm work?
        </h3>
        <p className="font-body text-xs text-ink-60 leading-relaxed">
          Each topic gets a priority score:{" "}
          <code className="font-mono text-ink bg-ink/8 px-1 rounded">
            urgency × (6 − confidence) × topicWeight
          </code>
          . Urgency is inversely proportional to days until your exam. Confidence
          is your self-rating — lower scores get more weight. TopicWeight reflects
          the topic's share of total study time for that subject. Topics are
          sorted by score and greedily assigned to calendar slots within your
          daily hour limit.
        </p>
      </div>
    </div>
  );
}

