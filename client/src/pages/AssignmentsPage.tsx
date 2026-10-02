import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Plus,
  Sparkles,
  Copy,
  Check,
  Trash2,
  Calendar,
  Layers,
  Printer,
  UploadCloud,
  X,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Filter,
} from "lucide-react";
import api from "../lib/api";
import { academicApi } from "../lib/academic-api";
import { extractSyllabusFromFile, type ExtractionProgress } from "../lib/file-extractor";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import AcademicAnswerCard from "../components/AcademicAnswerCard";
import type { Assignment, Subject } from "../types";

export default function AssignmentsPage({ initialSubjectId }: { initialSubjectId?: string }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || "all");
  const [loading, setLoading] = useState(true);

  // Active assignment being viewed in Soft Copy mode
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);

  // New Assignment Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newUnitNumber, setNewUnitNumber] = useState(1);
  const [newDueDate, setNewDueDate] = useState("");
  const [newQuestionsText, setNewQuestionsText] = useState("");
  const [autoSolveNew, setAutoSolveNew] = useState(true);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  // Document upload state for assignment sheets
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Add single question modal to active assignment
  const [addQModalOpen, setAddQModalOpen] = useState(false);
  const [singleQText, setSingleQText] = useState("");
  const [singleQMarks, setSingleQMarks] = useState(5);
  const [autoSolveSingle, setAutoSolveSingle] = useState(true);
  const [isAddingQ, setIsAddingQ] = useState(false);

  // Action states
  const [solvingId, setSolvingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subjRes, assignRes] = await Promise.all([
        api.get<{ data: { subjects: Subject[] } }>("/subjects"),
        academicApi.getAssignments(selectedSubjectId === "all" ? undefined : selectedSubjectId),
      ]);
      setSubjects(subjRes.data.data.subjects);
      setAssignments(assignRes);
      if (!newSubjectId && subjRes.data.data.subjects.length > 0) {
        setNewSubjectId(subjRes.data.data.subjects[0]._id);
      }
    } catch (err) {
      console.error("Failed to load assignments", err);
      toast({ title: "Failed to load assignments", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubjectId]);

  const handleDocUpload = async (file: File) => {
    setIsExtractingDoc(true);
    setExtractionProgress({ stage: "reading", progress: 10, message: "Extracting assignment text…" });
    try {
      const { text } = await extractSyllabusFromFile(file, (p) => setExtractionProgress(p));
      // Pre-fill questions from extracted text
      setNewQuestionsText(text);
      if (!newTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setNewTitle(cleanName);
      }
      toast({ title: `Extracted text from "${file.name}"!`, type: "success" });
    } catch (err: unknown) {
      console.error("Doc extract failed", err);
      toast({ title: "Failed to parse document", type: "error" });
    } finally {
      setIsExtractingDoc(false);
      setExtractionProgress(null);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSubjectId) {
      toast({ title: "Please fill in title and subject", type: "error" });
      return;
    }

    // Split questions text by newlines or question numbering (Q1., 1., etc.)
    const rawLines = newQuestionsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const questions: { question: string; marks: number }[] = [];
    let currentQ = "";

    for (const line of rawLines) {
      if (/^(?:Q(?:uestion)?\s*\d+[:.]?|\d+[\.)])\s*/i.test(line)) {
        if (currentQ) questions.push({ question: currentQ, marks: 5 });
        currentQ = line.replace(/^(?:Q(?:uestion)?\s*\d+[:.]?|\d+[\.)])\s*/i, "");
      } else {
        currentQ = currentQ ? `${currentQ} ${line}` : line;
      }
    }
    if (currentQ) questions.push({ question: currentQ, marks: 5 });

    setIsSavingAssignment(true);
    try {
      const created = await academicApi.createAssignment({
        subjectId: newSubjectId,
        title: newTitle.trim(),
        unitNumber: Number(newUnitNumber) || 1,
        dueDate: newDueDate || undefined,
        questions: questions.length > 0 ? questions : [{ question: newTitle.trim(), marks: 5 }],
      });

      if (autoSolveNew && created.questions.length > 0) {
        toast({ title: "Solving assignment questions with AI…", type: "info" });
        const solved = await academicApi.solveAllQuestions(created._id);
        setAssignments((prev) => [solved, ...prev]);
        setActiveAssignment(solved);
      } else {
        setAssignments((prev) => [created, ...prev]);
        setActiveAssignment(created);
      }

      toast({ title: "Assignment created successfully!", type: "success" });
      setCreateModalOpen(false);
      setNewTitle("");
      setNewQuestionsText("");
    } catch (err: unknown) {
      console.error("Create assignment failed", err);
      toast({ title: "Failed to create assignment", type: "error" });
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleSolveAll = async (assignmentId: string) => {
    setSolvingId(assignmentId);
    try {
      const updated = await academicApi.solveAllQuestions(assignmentId);
      setAssignments((prev) => prev.map((a) => (a._id === assignmentId ? updated : a)));
      if (activeAssignment?._id === assignmentId) setActiveAssignment(updated);
      toast({ title: "✨ All assignment questions solved with AI!", type: "success" });
    } catch (err: unknown) {
      console.error("Solve all failed", err);
      toast({ title: "Failed to generate answers", type: "error" });
    } finally {
      setSolvingId(null);
    }
  };

  const handleSolveSingleQuestion = async (assignmentId: string, questionId: string) => {
    setSolvingId(questionId);
    try {
      const { assignment } = await academicApi.solveQuestion(assignmentId, questionId);
      setAssignments((prev) => prev.map((a) => (a._id === assignmentId ? assignment : a)));
      if (activeAssignment?._id === assignmentId) setActiveAssignment(assignment);
      toast({ title: "Question answered by AI!", type: "success" });
    } catch (err: unknown) {
      console.error("Solve single question failed", err);
      toast({ title: "Failed to generate answer", type: "error" });
    } finally {
      setSolvingId(null);
    }
  };

  const handleAddSingleQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment || !singleQText.trim()) return;

    setIsAddingQ(true);
    try {
      const updated = await academicApi.addQuestion(activeAssignment._id, {
        question: singleQText.trim(),
        marks: Number(singleQMarks) || 5,
        autoSolve: autoSolveSingle,
      });
      setAssignments((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
      setActiveAssignment(updated);
      toast({ title: "Question added to assignment!", type: "success" });
      setAddQModalOpen(false);
      setSingleQText("");
    } catch (err) {
      console.error("Add question failed", err);
      toast({ title: "Failed to add question", type: "error" });
    } finally {
      setIsAddingQ(false);
    }
  };

  const handleDeleteAssignment = async (id: string, title: string) => {
    const confirmed = await confirm({
      title: "Delete Assignment?",
      message: `Are you sure you want to delete "${title}"? All questions and answers will be removed.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await academicApi.deleteAssignment(id);
      setAssignments((prev) => prev.filter((a) => a._id !== id));
      if (activeAssignment?._id === id) setActiveAssignment(null);
      toast({ title: "Assignment removed", type: "success" });
    } catch (err) {
      console.error("Delete failed", err);
      toast({ title: "Failed to delete assignment", type: "error" });
    }
  };

  const copyForHardcopy = (assignment: Assignment) => {
    let text = `====================================================\n`;
    text += `SUBJECT: ${assignment.subjectName.toUpperCase()}\n`;
    text += `ASSIGNMENT: ${assignment.title.toUpperCase()} (Unit ${assignment.unitNumber || 1})\n`;
    if (assignment.dueDate) text += `DUE DATE: ${assignment.dueDate}\n`;
    text += `====================================================\n\n`;

    assignment.questions.forEach((q, idx) => {
      text += `Q${idx + 1}. [${q.marks || 5} MARKS] ${q.question}\n\n`;
      text += `ANSWER:\n${q.answer || "[Pending Solution]"}\n\n`;
      text += `----------------------------------------------------\n\n`;
    });

    navigator.clipboard.writeText(text);
    setCopiedId(assignment._id);
    setTimeout(() => setCopiedId(null), 3000);
    toast({
      title: "📋 Formatted Soft Copy copied to clipboard!",
      type: "success",
    });
  };

  return (
    <div
      className={
        initialSubjectId
          ? "space-y-6 w-full"
          : "p-4 sm:p-6 md:p-10 w-full max-w-7xl mx-auto space-y-6 pb-24 md:pb-12 text-white"
      }
    >
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} className="text-[#0A84FF]" />
            <span className="text-xs font-mono text-[#0A84FF] uppercase tracking-wider">
              Academic Assignments Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">
            Assignments &amp; Exam Solutions
          </h1>
          <p className="text-xs text-[#8E8E93] max-w-xl leading-relaxed">
            Dictate teacher's questions, upload assignment sheets, solve with AI, and prepare exam-ready soft copies.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Subject Filter */}
          {!initialSubjectId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white">
              <Filter size={13} className="text-[#8E8E93]" />
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="bg-transparent border-none text-white text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-[#1C1C1E]">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id} className="bg-[#1C1C1E]">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/20 cursor-pointer"
          >
            <Plus size={15} />
            <span>New Assignment</span>
          </button>
        </div>
      </div>

      {/* ── Main Layout: Grid or Detail Soft Copy View ──────────────────────── */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeAssignment ? (
        /* ── Full Screen Soft Copy Reader View (Exam Prep & Copy) ──────────── */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveAssignment(null)}
              className="text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all self-start sm:self-auto"
            >
              <ArrowLeft size={14} />
              <span>Back to All Assignments</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => copyForHardcopy(activeAssignment)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {copiedId === activeAssignment._id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedId === activeAssignment._id ? "Copied!" : "Copy for Hardcopy"}</span>
              </button>

              <button
                onClick={() => handleSolveAll(activeAssignment._id)}
                disabled={solvingId === activeAssignment._id}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-md shadow-[#0A84FF]/20 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>{solvingId === activeAssignment._id ? "Solving All…" : "Solve All with AI"}</span>
              </button>

              <button
                onClick={() => window.print()}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 transition-all cursor-pointer"
                title="Print Soft Copy"
              >
                <Printer size={15} />
              </button>
            </div>
          </div>

          {/* Formatted Soft Copy Document Sheet */}
          <div className="p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-[#141414] border border-white/[0.08] shadow-2xl space-y-6">
            <div className="border-b border-white/[0.08] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30">
                    {activeAssignment.subjectName}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white">
                    Unit {activeAssignment.unitNumber || 1}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {activeAssignment.title}
                </h1>
                {activeAssignment.dueDate && (
                  <p className="text-xs text-[#8E8E93] flex items-center gap-1.5 font-mono">
                    <Calendar size={13} /> Submission Due: {activeAssignment.dueDate}
                  </p>
                )}
              </div>

              <button
                onClick={() => setAddQModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold cursor-pointer self-start sm:self-auto shrink-0 transition-all"
              >
                <Plus size={14} className="text-[#0A84FF]" />
                <span>Dictate / Add Question</span>
              </button>
            </div>

            {/* Questions List */}
            <div className="space-y-4 sm:space-y-5">
              {activeAssignment.questions.map((q, idx) => (
                <AcademicAnswerCard
                  key={q._id || idx}
                  question={q}
                  assignmentId={activeAssignment._id}
                  questionIndex={idx}
                  onUpdate={(updatedQ) => {
                    setActiveAssignment((prev) =>
                      prev
                        ? {
                            ...prev,
                            questions: prev.questions.map((item) =>
                              item._id === updatedQ._id ? updatedQ : item
                            ),
                          }
                        : null
                    );
                    setAssignments((prev) =>
                      prev.map((a) =>
                        a._id === activeAssignment._id
                          ? {
                              ...a,
                              questions: a.questions.map((item) =>
                                item._id === updatedQ._id ? updatedQ : item
                              ),
                            }
                          : a
                      )
                    );
                  }}
                  onSolve={() => handleSolveSingleQuestion(activeAssignment._id, q._id!)}
                  isSolving={solvingId === q._id}
                />
              ))}
            </div>
          </div>
        </div>
      ) : assignments.length === 0 ? (
        /* ── Empty State ─────────────────────────────────────────────────────── */
        <div className="p-12 text-center rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#8E8E93]">
            <BookOpen size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No assignments recorded yet</h3>
            <p className="text-xs text-[#8E8E93] max-w-sm mx-auto mt-1">
              Add questions dictated by your teacher in class or upload an assignment sheet image/PDF to get AI solutions ready for submission and exams.
            </p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/20 cursor-pointer"
          >
            Create First Assignment
          </button>
        </div>
      ) : (
        /* ── Assignment Cards Grid ────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {assignments.map((a) => {
            const solvedCount = a.questions.filter((q) => q.answer && q.answer.trim().length > 0).length;
            const totalCount = a.questions.length;
            const isFullySolved = totalCount > 0 && solvedCount === totalCount;

            return (
              <div
                key={a._id}
                className="p-5 rounded-2xl sm:rounded-3xl bg-[#141414] hover:bg-[#181818] border border-white/[0.08] hover:border-white/15 transition-all shadow-xl space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/30">
                      {a.subjectName} • Unit {a.unitNumber || 1}
                    </span>
                    <button
                      onClick={() => handleDeleteAssignment(a._id, a.title)}
                      className="p-1.5 text-white/30 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      title="Delete assignment"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight leading-snug line-clamp-2">
                    {a.title}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-[#8E8E93] pt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Layers size={13} /> {totalCount} Questions
                    </span>
                    <span className="flex items-center gap-1 font-mono text-emerald-400">
                      {solvedCount}/{totalCount} Solved
                    </span>
                  </div>

                  {a.dueDate && (
                    <p className="text-[11px] font-mono text-amber-400/90 flex items-center gap-1">
                      <Calendar size={12} /> Due: {a.dueDate}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2 mt-auto">
                  <button
                    onClick={() => copyForHardcopy(a)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1"
                    title="Copy soft copy for handwritten register"
                  >
                    {copiedId === a._id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span className="text-[11px]">{copiedId === a._id ? "Copied" : "Copy"}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {!isFullySolved && (
                      <button
                        onClick={() => handleSolveAll(a._id)}
                        disabled={solvingId === a._id}
                        className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        <Sparkles size={12} />
                        <span>{solvingId === a._id ? "Solving…" : "AI Solve"}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setActiveAssignment(a)}
                      className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-md shadow-[#0A84FF]/20 cursor-pointer flex items-center gap-1"
                    >
                      <span>Read Soft Copy</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Create New Assignment ───────────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#1C1C1E] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-4">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center text-[#0A84FF] shrink-0">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Create Assignment</h3>
                <p className="text-xs text-[#8E8E93]">Dictate questions or upload assignment sheet (Image/PDF)</p>
              </div>
            </div>

            {/* Document Upload Button */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs">
                <p className="font-bold text-white">Have a photo or PDF notice?</p>
                <p className="text-[#8E8E93] text-[11px]">Auto-extracts teacher's questions via OCR</p>
              </div>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={isExtractingDoc}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <UploadCloud size={14} className="text-[#0A84FF]" />
                <span>{isExtractingDoc ? "Reading…" : "Upload Doc"}</span>
              </button>
              <input
                ref={docInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleDocUpload(e.target.files[0]);
                  }
                }}
              />
            </div>

            {isExtractingDoc && extractionProgress && (
              <div className="p-3 rounded-xl bg-white/5 text-center text-xs text-white">
                {extractionProgress.message}
              </div>
            )}

            <form onSubmit={handleCreateAssignment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Subject</label>
                <select
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  required
                >
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id} className="bg-[#1C1C1E]">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Assignment Title</label>
                <input
                  type="text"
                  placeholder="e.g. Assignment 2: Pipelining & Branch Prediction"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">Unit Number</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Dictated Questions (One per line or Q1, Q2...)
                </label>
                <textarea
                  rows={4}
                  placeholder={`1. Explain Harvard vs Von Neumann architecture.\n2. Calculate the speedup achieved by 5-stage pipeline.\n3. What are control hazards and how to resolve them?`}
                  value={newQuestionsText}
                  onChange={(e) => setNewQuestionsText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF] font-mono leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoSolveCheckbox"
                  checked={autoSolveNew}
                  onChange={(e) => setAutoSolveNew(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0A84FF] bg-white/5 border-white/10 cursor-pointer"
                />
                <label htmlFor="autoSolveCheckbox" className="text-xs text-white/90 cursor-pointer flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Auto-solve questions with AI immediately on creation</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAssignment}
                  className="px-5 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/20 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAssignment ? "Generating Solutions…" : "Create & Save Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Dictate / Add Single Question ──────────────────────────────── */}
      {addQModalOpen && activeAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1C1C1E] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setAddQModalOpen(false)}
              className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Plus size={16} className="text-[#0A84FF]" />
              Add Dictated Question
            </h3>

            <form onSubmit={handleAddSingleQuestion} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Question Text</label>
                <textarea
                  rows={3}
                  placeholder="Type the question teacher just dictated in lecture..."
                  value={singleQText}
                  onChange={(e) => setSingleQText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Marks</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={singleQMarks}
                  onChange={(e) => setSingleQMarks(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#0A84FF]"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSolveSingleCheck"
                  checked={autoSolveSingle}
                  onChange={(e) => setAutoSolveSingle(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0A84FF] bg-white/5 border-white/10 cursor-pointer"
                />
                <label htmlFor="autoSolveSingleCheck" className="text-xs text-white/90 cursor-pointer flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Solve with AI immediately</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setAddQModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingQ}
                  className="px-5 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-lg shadow-[#0A84FF]/20 cursor-pointer disabled:opacity-50"
                >
                  {isAddingQ ? "Adding & Solving…" : "Add Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
