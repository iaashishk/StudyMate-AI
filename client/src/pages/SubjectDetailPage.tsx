import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Youtube,
  Save,
  Play,
} from "lucide-react";
import api from "../lib/api";
import { parseApiError } from "../lib/error-handler";
import ConfidenceRating from "../components/ConfidenceRating";
import Modal from "../components/Modal";
import FocusPlayerModal from "../components/FocusPlayerModal";
import { useToast } from "../context/ToastContext";
import type { Subject, ResourceType } from "../types";

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"curriculum" | "vault" | "notes">("curriculum");

  // New topic state
  const [newTopic, setNewTopic] = useState({
    title: "",
    confidenceScore: 3,
    estimatedMinutes: 30,
    unitNumber: 1,
  });
  const [addingTopic, setAddingTopic] = useState(false);

  // New Resource state (Vault)
  const [resourceModal, setResourceModal] = useState(false);
  const [newResource, setNewResource] = useState<{
    title: string;
    type: ResourceType;
    url: string;
  }>({
    title: "",
    type: "drive",
    url: "",
  });
  const [addingResource, setAddingResource] = useState(false);

  // Note Modal state (Cloud Notes)
  const [noteModal, setNoteModal] = useState(false);
  const [activeNote, setActiveNote] = useState<{
    _id?: string;
    title: string;
    content: string;
    linkUrl?: string;
  } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  // Focus Player state
  const [focusModal, setFocusModal] = useState<{
    open: boolean;
    topicTitle: string;
  }>({ open: false, topicTitle: "" });

  const fetchSubject = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/subjects/${id}`);
      setSubject(res.data.data.subject);
    } catch {
      toast({ title: "Failed to load course details", type: "error" });
      navigate("/subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubject();
  }, [id]);

  // Add Topic
  const handleAddTopic = async () => {
    if (!newTopic.title.trim() || !id) return;
    setAddingTopic(true);
    try {
      const res = await api.post(`/subjects/${id}/topics`, newTopic);
      setSubject(res.data.data.subject);
      setNewTopic({ title: "", confidenceScore: 3, estimatedMinutes: 30, unitNumber: 1 });
      toast({ title: "Topic added to curriculum", type: "success" });
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    } finally {
      setAddingTopic(false);
    }
  };

  // Toggle Topic Completion
  const handleToggleTopic = async (topicId: string, currentStatus: boolean) => {
    if (!id || !subject) return;
    try {
      const res = await api.put(`/subjects/${id}/topics/${topicId}`, {
        completed: !currentStatus,
      });
      setSubject(res.data.data.subject);
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    }
  };

  // Update Topic Confidence
  const handleConfidenceChange = async (topicId: string, score: number) => {
    if (!id) return;
    try {
      const res = await api.put(`/subjects/${id}/topics/${topicId}`, {
        confidenceScore: score,
      });
      setSubject(res.data.data.subject);
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    }
  };

  // Delete Topic
  const handleDeleteTopic = async (topicId: string) => {
    if (!id) return;
    try {
      const res = await api.delete(`/subjects/${id}/topics/${topicId}`);
      setSubject(res.data.data.subject);
      toast({ title: "Topic removed", type: "info" });
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    }
  };

  // Add Resource to Vault
  const handleAddResource = async () => {
    if (!newResource.title || !newResource.url || !id) return;
    setAddingResource(true);
    try {
      const res = await api.post(`/subjects/${id}/resources`, newResource);
      setSubject(res.data.data.subject);
      setNewResource({ title: "", type: "drive", url: "" });
      setResourceModal(false);
      toast({ title: "Resource added to vault", type: "success" });
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    } finally {
      setAddingResource(false);
    }
  };

  // Delete Resource from Vault
  const handleDeleteResource = async (resourceId: string) => {
    if (!id) return;
    try {
      const res = await api.delete(`/subjects/${id}/resources/${resourceId}`);
      setSubject(res.data.data.subject);
      toast({ title: "Resource removed from vault", type: "info" });
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    }
  };

  // Save Cloud Note
  const handleSaveNote = async () => {
    if (!activeNote?.title || !id) return;
    setSavingNote(true);
    try {
      if (activeNote._id) {
        // Update
        const res = await api.put(`/subjects/${id}/notes/${activeNote._id}`, activeNote);
        setSubject(res.data.data.subject);
        toast({ title: "Note updated in cloud", type: "success" });
      } else {
        // Create
        const res = await api.post(`/subjects/${id}/notes`, activeNote);
        setSubject(res.data.data.subject);
        toast({ title: "Note saved to cloud", type: "success" });
      }
      setNoteModal(false);
      setActiveNote(null);
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    } finally {
      setSavingNote(false);
    }
  };

  // Delete Note
  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    try {
      const res = await api.delete(`/subjects/${id}/notes/${noteId}`);
      setSubject(res.data.data.subject);
      toast({ title: "Cloud Note removed", type: "info" });
    } catch {
      toast({ title: "Failed to delete note", type: "error" });
    }
  };

  if (loading || !subject) {
    return (
      <div className="p-6 md:p-10 w-full animate-pulse">
        <div className="h-8 bg-white/5 rounded-xl w-64 mb-6" />
        <div className="h-44 bg-white/5 rounded-2xl mb-8" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  const completedCount = subject.topics.filter((t) => t.completed).length;
  const totalTopics = subject.topics.length;
  const progressPct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
  const daysUntil = Math.max(
    Math.ceil((new Date(subject.examDate).getTime() - Date.now()) / 86400000),
    0
  );

  return (
    <div className="p-6 md:p-10 w-full pb-24 md:pb-12 text-white">
      {/* Back button */}
      <button
        onClick={() => navigate("/subjects")}
        className="flex items-center gap-1.5 text-xs text-ink-60 hover:text-white transition-colors mb-6 group"
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to Courses</span>
      </button>

      {/* ── Course Hero Header ─────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-white/8 rounded-2xl p-6 md:p-8 mb-8 relative overflow-hidden shadow-2xl">
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: subject.colorTag }}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono text-ink-60 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10">
                {subject.semesterOrTrack || "Core Curriculum"}
              </span>
              <span className="text-xs font-mono text-ink-60">
                {daysUntil} days until target
              </span>
            </div>

            <h1 className=" text-2xl md:text-3xl font-bold text-white tracking-tight">
              {subject.name}
            </h1>
            <p className="text-xs text-ink-60 mt-1">
              Curriculum, study materials, video references &amp; notes repository.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-6 shrink-0">
            <div>
              <p className="text-[10px] font-mono text-ink-60 uppercase">Mastery</p>
              <p className="font-mono text-2xl font-bold text-emerald-400">{progressPct}%</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <p className="text-[10px] font-mono text-ink-60 uppercase">Topics</p>
              <p className="font-mono text-2xl font-bold text-white">
                {completedCount}/{totalTopics}
              </p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <p className="text-[10px] font-mono text-ink-60 uppercase">Vault Items</p>
              <p className="font-mono text-2xl font-bold text-amber-400">
                {(subject.resources?.length || 0) + (subject.notes?.length || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Course Progress Bar */}
        <div className="mt-6 pt-5 border-t border-white/5">
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, backgroundColor: subject.colorTag }}
            />
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-white/10 mb-8 pb-1">
        {[
          { key: "curriculum", label: "Curriculum & Topics", count: totalTopics },
          { key: "vault", label: "Resource Vault", count: subject.resources?.length || 0 },
          { key: "notes", label: "Cloud Notes", count: subject.notes?.length || 0 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 pb-3 px-2 text-xs transition-all relative ${
              activeTab === tab.key
                ? "text-[#0A84FF] font-bold"
                : "text-ink-60 hover:text-white"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                activeTab === tab.key
                  ? "bg-white/10 text-[#0A84FF] font-bold"
                  : "bg-white/5 text-ink-60"
              }`}
            >
              {tab.count}
            </span>

            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0A84FF] rounded-full shadow-sm shadow-primary" />
            )}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Curriculum & Topics ─────────────────────────────────── */}
      {activeTab === "curriculum" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Topics List (8 Cols) */}
          <div className="lg:col-span-8 space-y-3">
            {subject.topics.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#141414] border border-white/8 text-center text-xs text-ink-60">
                No curriculum topics added yet. Use the form on the right to add your syllabus modules.
              </div>
            ) : (
              subject.topics.map((topic) => {
                const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
                  `${subject.name} ${topic.title} tutorial`
                )}`;

                return (
                  <div
                    key={topic._id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all ${
                      topic.completed
                        ? "bg-emerald-500/5 border-emerald-500/20 opacity-75"
                        : "bg-[#141414] border-white/8 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => handleToggleTopic(topic._id, topic.completed)}
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                          topic.completed
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-white/20 hover:border-emerald-400"
                        }`}
                      >
                        {topic.completed && <CheckCircle2 size={14} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-ink-60 uppercase">
                            Unit {topic.unitNumber || 1}
                          </span>
                          <span className="text-[10px] font-mono text-ink-60">
                            · {topic.estimatedMinutes}m
                          </span>
                        </div>
                        <p
                          className={` text-sm font-medium truncate ${
                            topic.completed ? "line-through text-ink-60" : "text-white"
                          }`}
                        >
                          {topic.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 self-end sm:self-center">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-mono text-ink-60 mb-0.5">Confidence</span>
                        <ConfidenceRating
                          value={topic.confidenceScore}
                          onChange={(score) => handleConfidenceChange(topic._id, score)}
                          size={14}
                        />
                      </div>

                      {/* YouTube Tutorial Link */}
                      <a
                        href={youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-mono transition-colors"
                        title="Search top YouTube video tutorial for this topic"
                      >
                        <Youtube size={14} />
                        <span className="hidden sm:inline">Tutorial</span>
                      </a>

                      {/* Launch Focus */}
                      <button
                        onClick={() =>
                          setFocusModal({ open: true, topicTitle: topic.title })
                        }
                        className="p-1.5 rounded-lg text-[#0A84FF] hover:bg-white/[0.06] transition-colors"
                        title="Start focus timer for this topic"
                      >
                        <Play size={14} fill="currentColor" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteTopic(topic._id)}
                        className="p-1.5 text-ink-60 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Topic Sidebar (4 Cols) */}
          <div className="lg:col-span-4">
            <div className="bg-[#141414] border border-white/8 rounded-2xl p-5 shadow-xl sticky top-8">
              <h3 className=" text-sm font-semibold text-white mb-1">
                Add Syllabus Topic
              </h3>
              <p className="text-[11px] text-ink-60 mb-4">
                Add topics from your semester syllabus or course curriculum.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-ink-60 mb-1">
                    Topic Title
                  </label>
                  <input
                    value={newTopic.title}
                    onChange={(e) =>
                      setNewTopic((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="e.g. Binary Search Trees, Normalization"
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-ink-60 focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-ink-60 mb-1">
                      Unit / Module #
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newTopic.unitNumber}
                      onChange={(e) =>
                        setNewTopic((prev) => ({
                          ...prev,
                          unitNumber: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink-60 mb-1">
                      Est. Minutes
                    </label>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={newTopic.estimatedMinutes}
                      onChange={(e) =>
                        setNewTopic((prev) => ({
                          ...prev,
                          estimatedMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-ink-60 mb-1">
                    Initial Confidence (1=Weak, 5=Mastered)
                  </label>
                  <ConfidenceRating
                    value={newTopic.confidenceScore}
                    onChange={(score) =>
                      setNewTopic((prev) => ({ ...prev, confidenceScore: score }))
                    }
                    size={16}
                  />
                </div>

                <button
                  onClick={handleAddTopic}
                  disabled={addingTopic || !newTopic.title.trim()}
                  className="w-full py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 transition-all  disabled:opacity-50 mt-2 cursor-pointer"
                >
                  {addingTopic ? "Adding…" : "Add Topic"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Resource Vault (Drive Links, Playlists, PDFs, Books) ── */}
      {activeTab === "vault" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className=" text-lg text-white font-semibold">
                Resource Vault
              </h2>
              <p className="text-xs text-ink-60">
                Reference material: document links, video course playlists &amp; syllabus files.
              </p>
            </div>

            <button
              onClick={() => setResourceModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88  cursor-pointer"
            >
              <Plus size={15} />
              <span>Add Resource</span>
            </button>
          </div>

          {(!subject.resources || subject.resources.length === 0) ? (
            <div className="p-8 rounded-2xl bg-[#141414] border border-white/8 text-center text-xs text-ink-60">
              No files or links in the vault yet. Click "Add Resource" to attach study documents, video playlists, or reference files.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subject.resources.map((res) => {
                const isYoutube = res.type === "youtube" || res.url.includes("youtube.com") || res.url.includes("youtu.be");
                const isDrive = res.type === "drive" || res.url.includes("drive.google.com");

                return (
                  <div
                    key={res._id}
                    className="p-5 rounded-2xl bg-[#141414] border border-white/8 hover:border-white/15 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                            isYoutube
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : isDrive
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {res.type.toUpperCase()}
                        </span>

                        <button
                          onClick={() => handleDeleteResource(res._id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-ink-60 hover:text-rose-400 rounded transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <h4 className=" text-sm font-semibold text-white mb-1 line-clamp-1">
                        {res.title}
                      </h4>
                      <p className="font-mono text-[11px] text-ink-60 truncate">
                        {res.url}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-[#0A84FF] hover:underline font-medium"
                      >
                        <span>Open Document</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Cloud Notes ────────────────────────────────────────── */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className=" text-lg text-white font-semibold">
                Cloud Notes &amp; Summaries
              </h2>
              <p className="text-xs text-ink-60">
                Saved securely under your user account — accessible anywhere.
              </p>
            </div>

            <button
              onClick={() => {
                setActiveNote({ title: "", content: "", linkUrl: "" });
                setNoteModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88  cursor-pointer"
            >
              <Plus size={15} />
              <span>Create Note</span>
            </button>
          </div>

          {(!subject.notes || subject.notes.length === 0) ? (
            <div className="p-8 rounded-2xl bg-[#141414] border border-white/8 text-center text-xs text-ink-60">
              No notes for this subject yet. Create summaries (e.g. "Chapter 1 Summary" or "Key Concepts").
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subject.notes.map((n) => (
                <div
                  key={n._id}
                  className="p-5 rounded-2xl bg-[#141414] border border-white/8 hover:border-white/15 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className=" text-sm font-semibold text-white truncate">
                        {n.title}
                      </h4>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setActiveNote({ ...n });
                            setNoteModal(true);
                          }}
                          className="p-1 text-ink-60 hover:text-white rounded hover:bg-white/5"
                        >
                          <Save size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(n._id)}
                          className="p-1 text-ink-60 hover:text-rose-400 rounded hover:bg-rose-500/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p className=" text-xs text-ink-60 leading-relaxed line-clamp-4 whitespace-pre-line mb-3">
                      {n.content || "Empty note. Click edit to write summaries or formulas."}
                    </p>
                  </div>

                  {n.linkUrl && (
                    <div className="pt-3 border-t border-white/5">
                      <a
                        href={n.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-[#0A84FF] hover:underline font-mono"
                      >
                        <ExternalLink size={11} />
                        <span>Attached Document</span>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Add Resource ────────────────────────────────────────── */}
      <Modal
        isOpen={resourceModal}
        onClose={() => setResourceModal(false)}
        title="Add Material to Resource Vault"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Material Title (e.g. "Syllabus Overview", "Video Lectures", "Complete Notes")
            </label>
            <input
              value={newResource.title}
              onChange={(e) =>
                setNewResource((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="e.g. Video Lecture Series"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Type
            </label>
            <select
              value={newResource.type}
              onChange={(e) =>
                setNewResource((prev) => ({
                  ...prev,
                  type: e.target.value as ResourceType,
                }))
              }
              className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            >
              <option value="drive">Cloud Document / Drive Folder</option>
              <option value="youtube">Video Lecture / Playlist</option>
              <option value="pdf">Syllabus PDF / Notes PDF</option>
              <option value="book">Reference Textbook</option>
              <option value="link">Web Document / Course Link</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              URL / Link
            </label>
            <input
              value={newResource.url}
              onChange={(e) =>
                setNewResource((prev) => ({ ...prev, url: e.target.value }))
              }
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setResourceModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-60 text-xs font-semibold hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleAddResource}
              disabled={addingResource || !newResource.title || !newResource.url}
              className="flex-1 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 transition-all  disabled:opacity-50 cursor-pointer"
            >
              {addingResource ? "Adding…" : "Add to Vault"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Cloud Note Editor ───────────────────────────────────── */}
      <Modal
        isOpen={noteModal}
        onClose={() => {
          setNoteModal(false);
          setActiveNote(null);
        }}
        title={activeNote?._id ? "Edit Cloud Note" : "Create Cloud Note"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Title
            </label>
            <input
              value={activeNote?.title || ""}
              onChange={(e) =>
                setActiveNote((prev) => (prev ? { ...prev, title: e.target.value } : null))
              }
              placeholder="e.g. Chapter 1 Summary, Key Concepts"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              External Document / Reference Link (Optional)
            </label>
            <input
              value={activeNote?.linkUrl || ""}
              onChange={(e) =>
                setActiveNote((prev) => (prev ? { ...prev, linkUrl: e.target.value } : null))
              }
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Content / Markdown
            </label>
            <textarea
              rows={6}
              value={activeNote?.content || ""}
              onChange={(e) =>
                setActiveNote((prev) => (prev ? { ...prev, content: e.target.value } : null))
              }
              placeholder="Write formulas, algorithms, quick summaries..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 resize-y"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setNoteModal(false);
                setActiveNote(null);
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-60 text-xs font-semibold hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !activeNote?.title}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 transition-all  disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} />
              <span>{savingNote ? "Saving…" : "Save Note"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Focus Player Modal */}
      <FocusPlayerModal
        isOpen={focusModal.open}
        onClose={() => setFocusModal({ open: false, topicTitle: "" })}
        topicTitle={focusModal.topicTitle}
        subjectName={subject.name}
      />
    </div>
  );
}

