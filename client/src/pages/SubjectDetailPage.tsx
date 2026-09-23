import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import api from "../lib/api";
import ConfidenceRating from "../components/ConfidenceRating";
import type { Subject, Topic } from "../types";

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTopic, setNewTopic] = useState({
    title: "",
    confidenceScore: 3,
    estimatedMinutes: 30,
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .get(`/subjects/${id}`)
      .then((res) => setSubject(res.data.data.subject))
      .catch(() => navigate("/subjects"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleAddTopic = async () => {
    if (!newTopic.title.trim() || !id) return;
    setAdding(true);
    setError("");
    try {
      const res = await api.post(`/subjects/${id}/topics`, newTopic);
      setSubject(res.data.data.subject);
      setNewTopic({ title: "", confidenceScore: 3, estimatedMinutes: 30 });
    } catch {
      setError("Failed to add topic");
    } finally {
      setAdding(false);
    }
  };

  const handleConfidenceChange = async (topicId: string, score: number) => {
    if (!id) return;
    // Optimistic update
    setSubject((prev) =>
      prev
        ? {
            ...prev,
            topics: prev.topics.map((t) =>
              t._id === topicId ? { ...t, confidenceScore: score } : t
            ),
          }
        : null
    );
    try {
      const res = await api.put(`/subjects/${id}/topics/${topicId}`, {
        confidenceScore: score,
      });
      setSubject(res.data.data.subject);
    } catch {
      // revert would go here
    }
  };

  const handleToggleComplete = async (topic: Topic) => {
    if (!id) return;
    setSubject((prev) =>
      prev
        ? {
            ...prev,
            topics: prev.topics.map((t) =>
              t._id === topic._id ? { ...t, completed: !t.completed } : t
            ),
          }
        : null
    );
    try {
      const res = await api.put(`/subjects/${id}/topics/${topic._id}`, {
        completed: !topic.completed,
      });
      setSubject(res.data.data.subject);
    } catch {
      // revert
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!id) return;
    try {
      const res = await api.delete(`/subjects/${id}/topics/${topicId}`);
      setSubject(res.data.data.subject);
    } catch {
      setError("Failed to delete topic");
    }
  };

  if (loading || !subject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const daysUntil = Math.max(
    Math.ceil((new Date(subject.examDate).getTime() - Date.now()) / 86400000),
    0
  );

  const completedCount = subject.topics.filter((t) => t.completed).length;
  const progressPct =
    subject.topics.length > 0
      ? Math.round((completedCount / subject.topics.length) * 100)
      : 0;

  return (
    <div className="px-6 md:px-10 py-8 max-w-2xl pb-24 md:pb-8">
      {/* Back */}
      <button
        onClick={() => navigate("/subjects")}
        className="flex items-center gap-1.5 text-ink-60 hover:text-ink font-body text-sm mb-6"
      >
        <ArrowLeft size={16} />
        All subjects
      </button>

      {/* Subject header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: subject.colorTag }}
            />
            <h1 className="font-display text-2xl text-ink font-semibold">
              {subject.name}
            </h1>
          </div>
          <p className="font-body text-sm text-ink-60">
            Exam in{" "}
            <span className="font-mono text-ink font-medium">{daysUntil}</span>{" "}
            days · {completedCount}/{subject.topics.length} topics done
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-body text-xs text-ink-60">Overall progress</span>
          <span className="font-mono text-xs text-ink">{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: subject.colorTag,
            }}
          />
        </div>
      </div>

      {/* Topics list */}
      <h2 className="font-display text-lg text-ink font-semibold mb-4">Topics</h2>

      {subject.topics.length === 0 ? (
        <p className="font-body text-sm text-ink-60 mb-6">
          No topics yet. Add your first topic below.
        </p>
      ) : (
        <div className="space-y-3 mb-6">
          {subject.topics.map((topic) => (
            <div
              key={topic._id}
              className={`p-4 rounded-xl border transition-colors ${
                topic.completed
                  ? "bg-confidence/5 border-confidence/20"
                  : "bg-white border-ink/8"
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleComplete(topic)}
                  className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    topic.completed
                      ? "bg-confidence border-confidence"
                      : "border-ink-60 hover:border-confidence"
                  }`}
                >
                  {topic.completed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4l3 3 5-6"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>

                <span
                  className={`font-body text-sm flex-1 ${
                    topic.completed ? "line-through text-ink-60" : "text-ink"
                  }`}
                >
                  {topic.title}
                </span>

                <span className="font-mono text-xs text-ink-60 shrink-0">
                  {topic.estimatedMinutes}m
                </span>

                <button
                  onClick={() => handleDeleteTopic(topic._id)}
                  className="text-ink-60 hover:text-deadline p-1 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {!topic.completed && (
                <div className="mt-3 ml-8">
                  <p className="font-body text-xs text-ink-60 mb-1.5">
                    My confidence
                  </p>
                  <ConfidenceRating
                    value={topic.confidenceScore}
                    onChange={(v) => handleConfidenceChange(topic._id, v)}
                    size={16}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add topic form */}
      <div className="p-4 rounded-xl bg-white border border-ink/8 space-y-3">
        <h3 className="font-body text-sm font-medium text-ink">Add a topic</h3>
        <input
          value={newTopic.title}
          onChange={(e) => setNewTopic((prev) => ({ ...prev, title: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
          placeholder="Topic name"
          className="w-full px-3 py-2.5 rounded-lg border border-ink/15 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
        />

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-xs font-body text-ink-60 mb-1.5">Confidence</p>
            <ConfidenceRating
              value={newTopic.confidenceScore}
              onChange={(v) =>
                setNewTopic((prev) => ({ ...prev, confidenceScore: v }))
              }
              size={16}
            />
          </div>
          <div>
            <label className="text-xs font-body text-ink-60 block mb-1.5">
              Est. minutes
            </label>
            <input
              type="number"
              min={5}
              value={newTopic.estimatedMinutes}
              onChange={(e) =>
                setNewTopic((prev) => ({
                  ...prev,
                  estimatedMinutes: Number(e.target.value),
                }))
              }
              className="w-20 px-2 py-1.5 rounded-lg border border-ink/15 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
            />
          </div>
        </div>

        {error && <p className="text-xs text-deadline">{error}</p>}

        <button
          onClick={handleAddTopic}
          disabled={adding || !newTopic.title.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60"
        >
          <Plus size={14} />
          {adding ? "Adding…" : "Add topic"}
        </button>
      </div>
    </div>
  );
}

