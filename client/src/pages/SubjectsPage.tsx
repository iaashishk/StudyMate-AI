import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus, Trash2, ChevronRight, Calendar, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../lib/api";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import type { Subject } from "../types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const SUBJECT_COLORS = [
  "#5C8368", "#E8A23C", "#4A7FA5", "#9B6B9E", "#B14B3A", "#7A8E5C",
  "#2D6A4F", "#E07A5F", "#3D5A80",
];

const schema = z.object({
  name: z.string().min(1, "Subject name is required"),
  examDate: z.string().min(1, "Exam date is required"),
  colorTag: z.string(),
});

type FormData = z.infer<typeof schema>;

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { colorTag: SUBJECT_COLORS[0] },
  });

  const selectedColor = watch("colorTag");

  useEffect(() => {
    api
      .get("/subjects")
      .then((res) => setSubjects(res.data.data.subjects))
      .finally(() => setLoading(false));
  }, []);

  const createSubject = async (data: FormData) => {
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/subjects", data);
      setSubjects((prev) => [...prev, res.data.data.subject]);
      reset({ colorTag: SUBJECT_COLORS[0] });
      setAddOpen(false);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create subject"
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteSubject = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/subjects/${deleteId}`);
      setSubjects((prev) => prev.filter((s) => s._id !== deleteId));
    } finally {
      setDeleteId(null);
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
  };

  if (loading) {
    return (
      <div className="px-6 md:px-10 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-28 bg-ink/8 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-ink/8 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 bg-ink/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-6 md:px-10 py-8 max-w-2xl pb-24 md:pb-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-ink font-semibold">Subjects</h1>
          <p className="font-body text-xs text-ink-60 mt-0.5">
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lamp text-ink font-body font-semibold text-sm hover:bg-lamp/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <Plus size={16} />
          Add subject
        </button>
      </div>

      {/* Subject list */}
      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          message="No subjects yet"
          subMessage="Add your first subject to start building a study plan."
          action={
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-lamp text-ink font-body font-semibold text-sm hover:bg-lamp/90"
            >
              <Plus size={15} />
              Add first subject
            </button>
          }
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {subjects.map((s, idx) => {
              const days = daysUntil(s.examDate);
              const completedTopics = s.topics.filter((t) => t.completed).length;
              const progressPct = s.topics.length > 0 ? Math.round((completedTopics / s.topics.length) * 100) : 0;
              const isUrgent = days <= 3;
              const isWarning = days <= 7 && !isUrgent;

              return (
                <motion.div
                  key={s._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative bg-white rounded-xl border border-ink/8 hover:border-ink/15 hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Color accent strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.colorTag }} />

                  <div className="flex items-center gap-4 p-4 pl-5">
                    <div className="flex-1 min-w-0">
                      <Link to={`/subjects/${s._id}`} className="hover:underline decoration-ink/20">
                        <p className="font-body font-medium text-ink truncate">{s.name}</p>
                      </Link>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 font-body text-xs text-ink-60">
                          <Target size={11} />
                          {completedTopics}/{s.topics.length} topics
                        </span>
                        <span className="flex items-center gap-1 font-body text-xs text-ink-60">
                          <Calendar size={11} />
                          {new Date(s.examDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-2.5 h-1.5 rounded-full bg-ink/8 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ delay: 0.2 + idx * 0.05, duration: 0.6 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: s.colorTag }}
                        />
                      </div>
                    </div>

                    {/* Days countdown */}
                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className={`font-mono text-2xl font-medium ${
                          isUrgent ? "text-deadline" : isWarning ? "text-lamp" : "text-ink"
                        }`}
                      >
                        {days}
                      </span>
                      <span className="font-body text-[10px] text-ink-60">
                        {days === 1 ? "day left" : "days left"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Link
                        to={`/subjects/${s._id}`}
                        className="p-2 text-ink-60 hover:text-ink hover:bg-ink/5 rounded-lg transition-colors"
                        title="Open subject"
                      >
                        <ChevronRight size={16} />
                      </Link>
                      <button
                        onClick={() => setDeleteId(s._id)}
                        className="p-2 text-ink-60 hover:text-deadline hover:bg-deadline/5 rounded-lg transition-colors"
                        title="Delete subject"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}

      {/* Add Subject Modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add a new subject">
        <form onSubmit={handleSubmit(createSubject)} className="space-y-4" noValidate>
          <div>
            <label className="block font-body text-sm text-ink mb-1.5">Subject name</label>
            <input
              {...register("name")}
              placeholder="e.g. Operating Systems"
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 bg-white font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50 placeholder:text-ink-60/50"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-deadline">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block font-body text-sm text-ink mb-1.5">Exam date</label>
            <input
              type="date"
              {...register("examDate")}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 bg-white font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
            />
            {errors.examDate && (
              <p className="mt-1 text-xs text-deadline">{errors.examDate.message}</p>
            )}
          </div>

          {/* Color picker */}
          <div>
            <label className="block font-body text-sm text-ink mb-2">Color tag</label>
            <div className="flex gap-2 flex-wrap">
              {SUBJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue("colorTag", color)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color ? "ring-2 ring-offset-2 ring-ink scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-deadline">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-lamp text-ink font-body font-semibold text-sm disabled:opacity-60 hover:bg-lamp/90 active:scale-[0.98] transition-all"
          >
            {saving ? "Adding…" : "Add subject"}
          </button>
        </form>
      </Modal>

      {/* Delete confirmation Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete subject?"
      >
        <p className="font-body text-sm text-ink-60 mb-6">
          This will permanently delete the subject and all its topics. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteId(null)}
            className="flex-1 py-2.5 rounded-xl border border-ink/15 font-body text-sm text-ink-60 hover:bg-ink/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={deleteSubject}
            className="flex-1 py-2.5 rounded-xl bg-deadline text-white font-body font-semibold text-sm hover:bg-deadline/90 active:scale-[0.98] transition-all"
          >
            Delete
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
