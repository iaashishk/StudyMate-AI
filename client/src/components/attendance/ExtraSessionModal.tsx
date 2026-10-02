import React, { useState, useEffect } from "react";
import { X, Plus, Clock, BookOpen } from "lucide-react";
import { AttendanceSubject, AttendanceStatus } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";

interface ExtraSessionModalProps {
  date: string;
  onClose: () => void;
  onAdded: () => void;
}

export default function ExtraSessionModal({
  date,
  onClose,
  onAdded,
}: ExtraSessionModalProps) {
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    attendanceApi
      .getSubjects()
      .then((data) => {
        setSubjects(data);
        if (data.length > 0) setSelectedSubjectId(data[0]._id);
      })
      .catch((err) => console.error("Failed to load subjects", err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      setError("Please select a subject");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      await attendanceApi.addExtraSession({
        date,
        subjectId: selectedSubjectId,
        startTime,
        endTime,
        status,
        notes,
      });
      onAdded();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to add extra session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Plus size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Add Extra Session</h3>
            <p className="text-xs text-[#8E8E93]">Single-day lecture, practical, or doubt class</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
              <BookOpen size={13} /> Select Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF] cursor-pointer"
              required
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id} className="bg-[#1C1C1E] text-white">
                  {s.name} {s.code ? `(${s.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                <Clock size={13} /> Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                <Clock size={13} /> End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/80 mb-1.5">Initial Mark</label>
            <div className="grid grid-cols-3 gap-2">
              {(["present", "absent", "cancelled"] as AttendanceStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                    status === st
                      ? st === "present"
                        ? "bg-emerald-500 text-white"
                        : st === "absent"
                        ? "bg-rose-500 text-white"
                        : "bg-amber-500 text-white"
                      : "bg-white/5 hover:bg-white/10 text-white/70"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/80 mb-1.5">Notes (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Extra Lab Session, Revision Lecture"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || subjects.length === 0}
              className="px-5 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Adding..." : "Add Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
