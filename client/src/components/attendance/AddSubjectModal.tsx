import React, { useState, useEffect } from "react";
import { X, BookOpen, User, Hash, Percent, Award, AlertCircle } from "lucide-react";
import { AttendanceSubject } from "../../types/attendance";
import { attendanceApi } from "../../lib/attendance-api";

interface AddSubjectModalProps {
  subjectToEdit?: AttendanceSubject | null;
  onClose: () => void;
  onSaved: () => void;
}

const COLOR_PALETTE = [
  "#0A84FF", // Electric Blue
  "#30D158", // Mint Green
  "#FF9F0A", // Amber Orange
  "#FF375F", // Pink
  "#BF5AF2", // Purple
  "#64D2FF", // Cyan
  "#FF453A", // Red
  "#AC8E68", // Sand
];

export default function AddSubjectModal({
  subjectToEdit,
  onClose,
  onSaved,
}: AddSubjectModalProps) {
  const [name, setName] = useState(subjectToEdit?.name || "");
  const [code, setCode] = useState(subjectToEdit?.code || "");
  const [teacher, setTeacher] = useState(subjectToEdit?.teacher || "");
  const [color, setColor] = useState(subjectToEdit?.color || COLOR_PALETTE[0]);
  const [minPercent, setMinPercent] = useState(subjectToEdit?.minPercent || 75);
  const [openingAttended, setOpeningAttended] = useState(
    subjectToEdit?.openingAttended || 0
  );
  const [openingConducted, setOpeningConducted] = useState(
    subjectToEdit?.openingConducted || 0
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subjectToEdit) {
      setName(subjectToEdit.name);
      setCode(subjectToEdit.code || "");
      setTeacher(subjectToEdit.teacher || "");
      setColor(subjectToEdit.color || COLOR_PALETTE[0]);
      setMinPercent(subjectToEdit.minPercent || 75);
      setOpeningAttended(subjectToEdit.openingAttended || 0);
      setOpeningConducted(subjectToEdit.openingConducted || 0);
    }
  }, [subjectToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Subject name is required");
      return;
    }
    if (openingAttended > openingConducted) {
      setError("Opening attended classes cannot exceed opening conducted classes");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (subjectToEdit) {
        await attendanceApi.updateSubject(subjectToEdit._id, {
          name: name.trim(),
          code: code.trim(),
          teacher: teacher.trim(),
          color,
          minPercent: Number(minPercent),
          openingAttended: Number(openingAttended),
          openingConducted: Number(openingConducted),
        });
      } else {
        await attendanceApi.createSubject({
          name: name.trim(),
          code: code.trim(),
          teacher: teacher.trim(),
          color,
          minPercent: Number(minPercent),
          openingAttended: Number(openingAttended),
          openingConducted: Number(openingConducted),
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to save subject");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#1C1C1E] border border-white/10 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
            style={{ backgroundColor: color }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              {subjectToEdit ? "Edit Subject" : "Add New Subject"}
            </h3>
            <p className="text-xs text-[#8E8E93]">
              Configure attendance thresholds and initial balances
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
              <BookOpen size={13} /> Subject Name
            </label>
            <input
              type="text"
              placeholder="e.g. Operating Systems, Advanced Algorithms"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                <Hash size={13} /> Subject Code
              </label>
              <input
                type="text"
                placeholder="e.g. CS-401"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1.5 flex items-center gap-1.5">
                <User size={13} /> Teacher / Faculty
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Sharma"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/80 mb-1.5">Color Accent</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-xl transition-all cursor-pointer ${
                    color === c ? "ring-2 ring-white scale-110" : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                <Percent size={13} /> Minimum Attendance Requirement
              </label>
              <span className="text-xs font-mono font-bold text-[#0A84FF]">{minPercent}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              step="1"
              value={minPercent}
              onChange={(e) => setMinPercent(Number(e.target.value))}
              className="w-full accent-[#0A84FF] cursor-pointer"
            />
            <p className="text-[11px] text-[#8E8E93] mt-1">
              Used to calculate "Safe bunks" and "Classes needed" alerts. Default is 75%.
            </p>
          </div>

          {/* Opening balance (FR-S3) */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2">
              <Award size={15} className="text-amber-400" />
              <h4 className="text-xs font-bold text-white">Opening Balance (Mid-Semester Start)</h4>
            </div>
            <p className="text-[11px] text-[#8E8E93]">
              If you joined mid-semester, enter classes held and attended before you started using the tracker.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Classes Attended
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingAttended}
                  onChange={(e) => setOpeningAttended(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Classes Conducted
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingConducted}
                  onChange={(e) => setOpeningConducted(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
            </div>
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
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Saving..." : subjectToEdit ? "Save Changes" : "Create Subject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
