import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Plus,
  ExternalLink,
  Trash2,
  Edit3,
  Save,
  Search,
  Calendar,
  Folder,
  Youtube,
  Eye,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import api from "../lib/api";
import { parseApiError } from "../lib/error-handler";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import InlineDocViewerModal from "../components/InlineDocViewerModal";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import type { GlobalNote, Subject, ResourceType } from "../types";

export default function NotesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [notes, setNotes] = useState<GlobalNote[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string>("all");

  // Note creation / editing state
  const [editNoteModal, setEditNoteModal] = useState(false);
  const [activeNote, setActiveNote] = useState<
    (Partial<GlobalNote> & { subjectId?: string }) | null
  >(null);
  const [saving, setSaving] = useState(false);

  // On-site Document Viewer Modal
  const [viewerModal, setViewerModal] = useState<{
    open: boolean;
    title: string;
    url: string;
    type?: ResourceType;
  }>({ open: false, title: "", url: "" });

  const fetchNotesAndSubjects = async () => {
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        api.get("/subjects/notes/all"),
        api.get("/subjects"),
      ]);
      setNotes(notesRes.data.data.notes || []);
      setSubjects(subjectsRes.data.data.subjects || []);
    } catch {
      toast({ title: "Failed to load notes", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotesAndSubjects();
  }, []);

  // Filter notes by search query and track
  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.subjectName.toLowerCase().includes(search.toLowerCase());

    const matchesTrack =
      selectedTrack === "all" || n.semesterOrTrack === selectedTrack;

    return matchesSearch && matchesTrack;
  });

  // Extract unique semesters/tracks
  const availableTracks = Array.from(
    new Set(notes.map((n) => n.semesterOrTrack || "General").filter(Boolean))
  );

  // Smart URL parser for UI badges and on-site previewing
  const getUrlMeta = (url: string) => {
    if (!url) return null;
    const isDrive = url.includes("drive.google.com") || url.includes("docs.google.com");
    const isPdf = url.toLowerCase().endsWith(".pdf") || url.includes(".pdf?");
    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

    let hostname = "";
    try {
      hostname = new URL(url).hostname.replace("www.", "");
    } catch {
      hostname = "Reference Link";
    }

    if (isDrive) {
      return {
        label: "Google Drive Doc",
        badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/25 hover:bg-amber-500/20",
        icon: Folder,
        canPreview: true,
        type: "drive" as const,
      };
    }
    if (isPdf) {
      return {
        label: "PDF Document",
        badgeClass: "bg-rose-500/10 text-rose-300 border-rose-500/25 hover:bg-rose-500/20",
        icon: FileText,
        canPreview: true,
        type: "pdf" as const,
      };
    }
    if (isYoutube) {
      return {
        label: "Lecture Video",
        badgeClass: "bg-red-500/10 text-red-300 border-red-500/25 hover:bg-red-500/20",
        icon: Youtube,
        canPreview: true,
        type: "youtube" as const,
      };
    }
    return {
      label: hostname,
      badgeClass: "bg-white/5 text-[#0A84FF] border-white/10 hover:bg-white/10",
      icon: ExternalLink,
      canPreview: false,
      type: "link" as const,
    };
  };

  const handleSaveNote = async () => {
    if (!activeNote?.title || !activeNote?.subjectId) {
      toast({ title: "Note title and subject are required", type: "error" });
      return;
    }
    setSaving(true);
    try {
      if (activeNote._id) {
        // Update existing note
        await api.put(`/subjects/${activeNote.subjectId}/notes/${activeNote._id}`, {
          title: activeNote.title,
          content: activeNote.content,
          linkUrl: activeNote.linkUrl,
        });
        toast({ title: "Note updated successfully", type: "success" });
      } else {
        // Create new note in Cloud Database
        await api.post(`/subjects/${activeNote.subjectId}/notes`, {
          title: activeNote.title,
          content: activeNote.content || "",
          linkUrl: activeNote.linkUrl || "",
        });
        toast({ title: "Note saved to Cloud", type: "success" });
      }
      setEditNoteModal(false);
      setActiveNote(null);
      await fetchNotesAndSubjects();
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (subjectId: string, noteId: string, noteTitle?: string) => {
    const confirmed = await confirm({
      title: "Delete Note?",
      message: `Are you sure you want to delete note "${noteTitle || "this note"}"?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.delete(`/subjects/${subjectId}/notes/${noteId}`);
      toast({ title: "Note deleted", type: "info" });
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch (err: unknown) {
      toast({ title: parseApiError(err).message, type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-10 w-full animate-pulse">
        <div className="h-8 bg-white/5 rounded-xl w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 w-full pb-24 md:pb-12 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} className="text-[#0A84FF]" />
            <span className="text-xs font-mono text-[#0A84FF] uppercase tracking-wider">
              Central Academic Notes Hub
            </span>
          </div>
          <h1 className="text-3xl text-white font-semibold">
            Cloud Notes &amp; Documents
          </h1>
          <p className="text-xs text-ink-60 mt-0.5">
            Store lecture cheat sheets, formulas, and attached Google Drive notes with on-site previewing.
          </p>
        </div>

        {subjects.length > 0 && (
          <button
            onClick={() => {
              setActiveNote({
                title: "",
                content: "",
                linkUrl: "",
                subjectId: subjects[0]?._id,
              });
              setEditNoteModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 active:scale-95 transition-all shadow-md shadow-[#0A84FF]/20 cursor-pointer shrink-0"
          >
            <Plus size={15} />
            <span>New Cloud Note</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-3 text-ink-60" />
          <input
            type="text"
            placeholder="Search notes, topics, formulas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-ink-60 focus:outline-none focus:border-[#0A84FF]"
          />
        </div>

        {/* Track Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedTrack("all")}
            className={`px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 cursor-pointer ${
              selectedTrack === "all"
                ? "bg-white/15 text-white font-medium"
                : "bg-white/5 text-ink-60 hover:text-white"
            }`}
          >
            All Tracks ({notes.length})
          </button>
          {availableTracks.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTrack(t)}
              className={`px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 cursor-pointer ${
                selectedTrack === t
                  ? "bg-[#0A84FF] text-white font-medium shadow-sm shadow-[#0A84FF]/25"
                  : "bg-white/5 text-ink-60 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          message="No notes found"
          subMessage={
            subjects.length === 0
              ? "Add a subject first to attach curriculum notes and documents."
              : "Create your first note or attach Google Drive document links."
          }
          action={
            subjects.length > 0 ? (
              <button
                onClick={() => {
                  setActiveNote({
                    title: "",
                    content: "",
                    linkUrl: "",
                    subjectId: subjects[0]?._id,
                  });
                  setEditNoteModal(true);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 cursor-pointer"
              >
                <Plus size={15} />
                <span>Create First Note</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredNotes.map((note) => {
              const urlMeta = note.linkUrl ? getUrlMeta(note.linkUrl) : null;
              const Icon = urlMeta?.icon || FileText;

              return (
                <motion.div
                  key={note._id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-[#141414] border border-white/8 hover:border-white/15 rounded-2xl p-5 flex flex-col justify-between transition-all group relative shadow-lg"
                >
                  <div>
                    {/* Top Bar: Subject Badge & Actions */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: note.subjectColor }}
                        />
                        <span className="text-[11px] font-mono text-ink-60 uppercase truncate">
                          {note.subjectName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setActiveNote({ ...note });
                            setEditNoteModal(true);
                          }}
                          className="p-1.5 text-ink-60 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          title="Edit note"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.subjectId, note._id, note.title)}
                          className="p-1.5 text-ink-60 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Note Title */}
                    <h3 className="text-sm font-semibold text-white mb-2 line-clamp-1">
                      {note.title}
                    </h3>

                    {/* Content Preview */}
                    <p className="text-xs text-ink-60 leading-relaxed line-clamp-4 whitespace-pre-line mb-3">
                      {note.content || "No markdown text written. Document link attached below."}
                    </p>
                  </div>

                  {/* Enhanced Notes URL Link Row */}
                  <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    {note.linkUrl && urlMeta ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {urlMeta.canPreview ? (
                          <button
                            type="button"
                            onClick={() =>
                              setViewerModal({
                                open: true,
                                title: note.title,
                                url: note.linkUrl!,
                                type: urlMeta.type,
                              })
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all cursor-pointer shadow-sm ${urlMeta.badgeClass}`}
                            title="Preview file on-site without leaving"
                          >
                            <Icon size={12} />
                            <span className="truncate max-w-[120px]">{urlMeta.label}</span>
                            <Eye size={11} className="opacity-70 shrink-0" />
                          </button>
                        ) : null}

                        <a
                          href={note.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-ink-60 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                          title={`Open ${urlMeta.label} in new tab`}
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-60/50 font-mono">Cloud text note</span>
                    )}

                    <span className="text-ink-60 text-[10px] font-mono flex items-center gap-1 shrink-0">
                      <Calendar size={10} />
                      {new Date(note.updatedAt || note.createdAt || "").toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Edit / Create Note Modal */}
      <Modal
        isOpen={editNoteModal}
        onClose={() => {
          setEditNoteModal(false);
          setActiveNote(null);
        }}
        title={activeNote?._id ? "Edit Cloud Note" : "Create Cloud Note"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Subject / Course
            </label>
            <select
              value={activeNote?.subjectId || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, subjectId: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#0A84FF]"
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id} className="bg-[#1C1C1E] text-white">
                  {s.name} ({s.semesterOrTrack || "Core"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Title
            </label>
            <input
              type="text"
              value={activeNote?.title || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Unit 2 B-Tree indexing summary & cheat sheet"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#0A84FF]"
            >
            </input>
          </div>

          {/* Enhanced URL / Document Link Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink-60">
                Attached URL / Document Link (Google Drive, PDF, Notion)
              </label>
              <span className="text-[10px] font-mono text-[#0A84FF] flex items-center gap-1">
                <Sparkles size={10} />
                <span>On-Site Preview Supported</span>
              </span>
            </div>
            <input
              type="url"
              value={activeNote?.linkUrl || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, linkUrl: e.target.value }))}
              placeholder="https://drive.google.com/file/d/... or https://.../notes.pdf"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#0A84FF]"
            />
            {activeNote?.linkUrl && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <CheckCircle2 size={12} />
                <span>
                  {activeNote.linkUrl.includes("drive.google.com")
                    ? "⚡ Google Drive link detected: On-site reader will be active"
                    : activeNote.linkUrl.endsWith(".pdf")
                    ? "⚡ PDF document detected: Direct PDF reader active"
                    : "⚡ Web link attached"}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Content / Markdown Text
            </label>
            <textarea
              rows={6}
              value={activeNote?.content || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Write formulas, algorithmic complexity, key definitions, or exam reminders..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#0A84FF] resize-y"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setEditNoteModal(false);
                setActiveNote(null);
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-60 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#0A84FF]/25"
            >
              <Save size={14} />
              <span>{saving ? "Saving to Cloud…" : "Save Note"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* On-Site Document / PDF / Video Viewer Modal */}
      <InlineDocViewerModal
        isOpen={viewerModal.open}
        onClose={() => setViewerModal((prev) => ({ ...prev, open: false }))}
        title={viewerModal.title}
        url={viewerModal.url}
        type={viewerModal.type}
      />
    </div>
  );
}
