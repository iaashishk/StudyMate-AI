import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, ExternalLink, Trash2, Edit3, Save, Search, Calendar } from "lucide-react";
import api from "../lib/api";
import { parseApiError } from "../lib/error-handler";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import { useToast } from "../context/ToastContext";
import type { GlobalNote, Subject } from "../types";

export default function NotesPage() {
  const { toast } = useToast();
  const [notes, setNotes] = useState<GlobalNote[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  
  // Note creation / editing state
  const [editNoteModal, setEditNoteModal] = useState(false);
  const [activeNote, setActiveNote] = useState<Partial<GlobalNote> & { subjectId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchNotesAndSubjects = async () => {
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        api.get("/subjects/notes/all"),
        api.get("/subjects"),
      ]);
      setNotes(notesRes.data.data.notes);
      setSubjects(subjectsRes.data.data.subjects);
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

  const handleDeleteNote = async (subjectId: string, noteId: string) => {
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
            <div key={i} className="h-48 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 w-full pb-24 md:pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            <span className="text-xs font-mono text-ink-60 uppercase tracking-wider">
              Centralized Cloud Vault
            </span>
          </div>
          <h1 className=" text-3xl text-white font-semibold">
            Study Notes &amp; Docs
          </h1>
          <p className=" text-xs text-ink-60 mt-0.5">
            Synchronized securely — access your syllabus, study materials &amp; notes anywhere.
          </p>
        </div>

        <button
          onClick={() => {
            setActiveNote({
              title: "",
              content: "",
              linkUrl: "",
              subjectId: subjects[0]?._id || "",
            });
            setEditNoteModal(true);
          }}
          disabled={subjects.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A84FF] text-white font-semibold text-xs hover:opacity-88 active:scale-95 transition-all  shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <Plus size={15} />
          <span>New Cloud Note</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, topics, or subjects..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-ink-60 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Track Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedTrack("all")}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors shrink-0 cursor-pointer ${
              selectedTrack === "all"
                ? "bg-[#0A84FF] text-white font-medium shadow-md "
                : "bg-white/5 text-ink-60 hover:text-white hover:bg-white/10"
            }`}
          >
            All Tracks ({notes.length})
          </button>
          {availableTracks.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTrack(t)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors shrink-0 cursor-pointer ${
                selectedTrack === t
                  ? "bg-[#0A84FF] text-white font-medium shadow-md "
                  : "bg-white/5 text-ink-60 hover:text-white hover:bg-white/10"
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
              ? "Add a subject first to attach curriculum notes and docs."
              : "Create your first note or attach document links."
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88  cursor-pointer"
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
            {filteredNotes.map((note) => (
              <motion.div
                key={note._id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#141414] border border-white/8 hover:border-white/15 rounded-2xl p-5 flex flex-col justify-between transition-all group glow-card relative"
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
                        className="p-1 text-ink-60 hover:text-white rounded hover:bg-white/5 transition-colors"
                        title="Edit note"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.subjectId, note._id)}
                        className="p-1 text-ink-60 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors"
                        title="Delete note"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Note Title */}
                  <h3 className=" text-sm font-semibold text-white mb-2 line-clamp-1">
                    {note.title}
                  </h3>

                  {/* Content Preview */}
                  <p className=" text-xs text-ink-60 leading-relaxed line-clamp-4 whitespace-pre-line">
                    {note.content || "No text notes written yet. Click edit to add study summaries or formulas."}
                  </p>
                </div>

                {/* Bottom Footer: External Link & Date */}
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                  {note.linkUrl ? (
                    <a
                      href={note.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-ink-60 hover:text-white hover:underline font-mono"
                    >
                      <ExternalLink size={12} />
                      <span>Document / Reference</span>
                    </a>
                  ) : (
                    <span className="text-ink-60/50 font-mono">Cloud text note</span>
                  )}

                  <span className="text-ink-60 text-[10px] flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(note.updatedAt || note.createdAt || "").toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </motion.div>
            ))}
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
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id} className="bg-[#141414] text-white">
                  {s.semesterOrTrack ? `[${s.semesterOrTrack}] ` : ""}{s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Title (e.g. "Chapter Summary", "Key Concepts")
            </label>
            <input
              value={activeNote?.title || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Core Algorithms &amp; System Concepts"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              External Document / Reference Link (Optional)
            </label>
            <input
              value={activeNote?.linkUrl || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, linkUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-60 mb-1.5">
              Note Content / Markdown Text
            </label>
            <textarea
              rows={6}
              value={activeNote?.content || ""}
              onChange={(e) => setActiveNote((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Write formulas, algorithmic complexity, key interview questions..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary/50 resize-y"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setEditNoteModal(false);
                setActiveNote(null);
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-60 hover:text-white text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-88 transition-all  disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} />
              <span>{saving ? "Saving to Cloud…" : "Save Note"}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

