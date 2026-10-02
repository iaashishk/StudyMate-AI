import { useState, useEffect, useRef } from "react";
import {
  Code2,
  Plus,
  Sparkles,
  Copy,
  Check,
  Trash2,
  UploadCloud,
  X,
  ArrowRight,
  ArrowLeft,
  Filter,
  CheckCircle2,
  HelpCircle,
  Terminal,
  Printer,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Edit3,
} from "lucide-react";
import api from "../lib/api";
import { academicApi } from "../lib/academic-api";
import { extractSyllabusFromFile, type ExtractionProgress } from "../lib/file-extractor";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import type { LabCode, Subject } from "../types";

export default function LabCodesPage({ initialSubjectId }: { initialSubjectId?: string }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [labs, setLabs] = useState<LabCode[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || "all");
  const [loading, setLoading] = useState(true);

  // Active experiment being viewed in Soft Copy Record mode
  const [currentLab, setCurrentLab] = useState<LabCode | null>(null);

  // New Experiment Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newExpNumber, setNewExpNumber] = useState(1);
  const [newTitle, setNewTitle] = useState("");
  const [newAim, setNewAim] = useState("");
  const [newLanguage, setNewLanguage] = useState<"cpp" | "c" | "python" | "java" | "sql" | "javascript" | "bash">("cpp");
  const [newTeacherPrompt, setNewTeacherPrompt] = useState("");
  const [autoDeriveNew, setAutoDeriveNew] = useState(true);
  const [isSavingLab, setIsSavingLab] = useState(false);

  // Edit Experiment Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [editExpNumber, setEditExpNumber] = useState(1);
  const [editTitle, setEditTitle] = useState("");
  const [editAim, setEditAim] = useState("");
  const [editLanguage, setEditLanguage] = useState<"cpp" | "c" | "python" | "java" | "sql" | "javascript" | "bash">("cpp");
  const [editTeacherPrompt, setEditTeacherPrompt] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Document upload state for lab manuals
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Action states
  const [derivingId, setDerivingId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedRecordId, setCopiedRecordId] = useState<string | null>(null);
  const [showViva, setShowViva] = useState(true);
  const [vivaQuizMode, setVivaQuizMode] = useState(false);
  const [revealedViva, setRevealedViva] = useState<Record<number, boolean>>({});
  const [copiedViva, setCopiedViva] = useState(false);

  const handleOpenEditLab = (lab: LabCode) => {
    setEditingLabId(lab._id);
    setEditExpNumber(lab.experimentNumber);
    setEditTitle(lab.title);
    setEditAim(lab.aim || "");
    setEditLanguage((lab.language as any) || "cpp");
    setEditTeacherPrompt(lab.teacherPrompt || "");
    setEditModalOpen(true);
  };

  const handleSaveLabEdit = async (reDerive: boolean) => {
    if (!editingLabId || !editTitle.trim()) {
      toast({ title: "Experiment title is required", type: "error" });
      return;
    }

    setIsSavingEdit(true);
    try {
      const updated = await academicApi.updateLabCode(editingLabId, {
        experimentNumber: Number(editExpNumber) || 1,
        title: editTitle.trim(),
        aim: editAim.trim(),
        language: editLanguage,
        teacherPrompt: editTeacherPrompt.trim(),
      });

      setLabs((prev) =>
        prev
          .map((l) => (l._id === editingLabId ? updated : l))
          .sort((a, b) => a.experimentNumber - b.experimentNumber)
      );
      if (currentLab?._id === editingLabId) {
        setCurrentLab(updated);
      }

      setEditModalOpen(false);

      if (reDerive) {
        toast({ title: "Experiment saved! Deriving code with AI…", type: "info" });
        await handleDeriveWithAI(editingLabId);
      } else {
        toast({ title: "Experiment updated successfully!", type: "success" });
      }
    } catch (err) {
      console.error("Failed to update lab experiment", err);
      toast({ title: "Failed to save experiment updates", type: "error" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [subjRes, labsRes] = await Promise.all([
        api.get<{ data: { subjects: Subject[] } }>("/subjects"),
        academicApi.getLabCodes(selectedSubjectId === "all" ? undefined : selectedSubjectId),
      ]);
      setSubjects(subjRes.data.data.subjects);
      setLabs(labsRes);
      if (!newSubjectId && subjRes.data.data.subjects.length > 0) {
        setNewSubjectId(subjRes.data.data.subjects[0]._id);
      }
    } catch (err) {
      console.error("Failed to load lab codes", err);
      toast({ title: "Failed to load lab experiments", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubjectId]);

  const handleDocUpload = async (file: File) => {
    setIsExtractingDoc(true);
    setExtractionProgress({ stage: "reading", progress: 10, message: "Reading lab manual…" });
    try {
      const { text } = await extractSyllabusFromFile(file, (p) => setExtractionProgress(p));
      setNewTeacherPrompt(text);
      if (!newTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setNewTitle(cleanName);
      }
      toast({ title: `Extracted manual text from "${file.name}"!`, type: "success" });
    } catch (err: unknown) {
      console.error("Doc extract failed", err);
      toast({ title: "Failed to parse lab manual", type: "error" });
    } finally {
      setIsExtractingDoc(false);
      setExtractionProgress(null);
    }
  };

  const handleCreateLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSubjectId) {
      toast({ title: "Please fill in title and subject", type: "error" });
      return;
    }

    setIsSavingLab(true);
    try {
      const created = await academicApi.createLabCode({
        subjectId: newSubjectId,
        experimentNumber: Number(newExpNumber) || 1,
        title: newTitle.trim(),
        aim: newAim.trim(),
        language: newLanguage,
        teacherPrompt: newTeacherPrompt.trim(),
        autoDerive: autoDeriveNew,
      });

      setLabs((prev) => [...prev, created].sort((a, b) => a.experimentNumber - b.experimentNumber));
      setCurrentLab(created);
      toast({ title: "Lab experiment and code solution ready!", type: "success" });
      setCreateModalOpen(false);
      setNewTitle("");
      setNewAim("");
      setNewTeacherPrompt("");
    } catch (err: unknown) {
      console.error("Create lab failed", err);
      toast({ title: "Failed to create lab experiment", type: "error" });
    } finally {
      setIsSavingLab(false);
    }
  };

  const handleDeriveWithAI = async (id: string) => {
    setDerivingId(id);
    try {
      const updated = await academicApi.deriveLabCodeWithAI(id);
      setLabs((prev) => prev.map((l) => (l._id === id ? updated : l)));
      if (currentLab?._id === id) setCurrentLab(updated);
      toast({ title: "✨ Working code, output, and viva questions derived with AI!", type: "success" });
    } catch (err: unknown) {
      console.error("Derive AI failed", err);
      toast({ title: "Failed to derive code solution", type: "error" });
    } finally {
      setDerivingId(null);
    }
  };

  const handleDeleteLab = async (id: string, title: string) => {
    const confirmed = await confirm({
      title: "Delete Experiment?",
      message: `Delete "${title}" and its code from your repository?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await academicApi.deleteLabCode(id);
      setLabs((prev) => prev.filter((l) => l._id !== id));
      if (currentLab?._id === id) setCurrentLab(null);
      toast({ title: "Experiment deleted", type: "success" });
    } catch (err) {
      console.error("Delete failed", err);
      toast({ title: "Failed to delete experiment", type: "error" });
    }
  };

  const copyCodeOnly = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
    toast({ title: "💻 Code copied to clipboard!", type: "success" });
  };

  const copyFullRecord = (lab: LabCode) => {
    let text = `====================================================\n`;
    text += `EXPERIMENT NO: ${lab.experimentNumber}\n`;
    text += `SUBJECT: ${lab.subjectName.toUpperCase()}\n`;
    text += `TITLE: ${lab.title.toUpperCase()}\n`;
    text += `LANGUAGE: ${lab.language.toUpperCase()}\n`;
    text += `====================================================\n\n`;

    text += `AIM / OBJECTIVE:\n${lab.aim || lab.title}\n\n`;

    if (lab.algorithm) {
      text += `ALGORITHM:\n${lab.algorithm}\n\n`;
    }

    text += `SOURCE CODE:\n${lab.code || "[Code not derived yet]"}\n\n`;

    if (lab.sampleInput) {
      text += `SAMPLE INPUT:\n${lab.sampleInput}\n\n`;
    }

    if (lab.sampleOutput) {
      text += `EXPECTED OUTPUT:\n${lab.sampleOutput}\n\n`;
    }

    if (lab.complexity?.time) {
      text += `COMPLEXITY:\nTime: ${lab.complexity.time} | Space: ${lab.complexity.space || "O(1)"}\n\n`;
    }

    if (lab.vivaQuestions && lab.vivaQuestions.length > 0) {
      text += `VIVA-VOCE QUESTIONS & ANSWERS:\n`;
      lab.vivaQuestions.forEach((v, idx) => {
        text += `Q${idx + 1}: ${v.question}\nAns: ${v.answer}\n\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopiedRecordId(lab._id);
    setTimeout(() => setCopiedRecordId(null), 3000);
    toast({ title: "📋 Full Lab Record copied for lab manual submission!", type: "success" });
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
            <Code2 size={15} className="text-purple-400" />
            <span className="text-xs font-mono text-purple-400 uppercase tracking-wider">
              Practical Lab Code Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Practical Lab Codes &amp; Manuals
          </h1>
          <p className="text-xs text-[#8E8E93] max-w-xl leading-relaxed">
            Save teacher's practical codes, derive algorithms &amp; outputs with AI, and prepare for viva exams.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            <Plus size={15} />
            <span>New Experiment</span>
          </button>
        </div>
      </div>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : currentLab ? (
        /* ── Full Experiment Record Reader View ────────────────────────────── */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
            <button
              onClick={() => setCurrentLab(null)}
              className="text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all self-start sm:self-auto"
            >
              <ArrowLeft size={14} />
              <span>Back to All Lab Experiments</span>
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleOpenEditLab(currentLab)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer"
                title="Edit experiment number, title, aim, language, or prompt"
              >
                <Edit3 size={13} />
                <span>Edit Experiment</span>
              </button>

              <button
                onClick={() => copyCodeOnly(currentLab.code, currentLab._id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {copiedCodeId === currentLab._id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedCodeId === currentLab._id ? "Code Copied!" : "Copy Code"}</span>
              </button>

              <button
                onClick={() => copyFullRecord(currentLab)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {copiedRecordId === currentLab._id ? <Check size={14} className="text-emerald-400" /> : <Printer size={14} />}
                <span>{copiedRecordId === currentLab._id ? "Copied!" : "Copy Full Lab Record"}</span>
              </button>

              <button
                onClick={() => handleDeriveWithAI(currentLab._id)}
                disabled={derivingId === currentLab._id}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>{derivingId === currentLab._id ? "Deriving…" : "Re-Derive AI"}</span>
              </button>
            </div>
          </div>

          {/* Formatted Lab Manual Sheet */}
          <div className="p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-[#141414] border border-white/[0.08] shadow-2xl space-y-6">
            <div className="border-b border-white/[0.08] pb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {currentLab.subjectName}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white">
                  Exp #{currentLab.experimentNumber}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 text-[#8E8E93]">
                  {currentLab.language}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-2">
                {currentLab.title}
              </h1>
            </div>

            {/* Aim & Objective */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
              <p className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Aim &amp; Objective
              </p>
              <p className="text-sm font-medium text-white/90 leading-relaxed">
                {currentLab.aim || currentLab.title}
              </p>
            </div>

            {/* Algorithm */}
            {currentLab.algorithm && (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <p className="text-xs font-bold text-[#0A84FF] flex items-center gap-1.5">
                  <Terminal size={14} /> Algorithm &amp; Logical Steps
                </p>
                <pre className="text-xs font-mono text-white/80 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {currentLab.algorithm}
                </pre>
              </div>
            )}

            {/* Code Implementation */}
            <div className="rounded-2xl border border-white/10 bg-[#0E0E10] overflow-hidden">
              <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-mono text-[#8E8E93] ml-2">solution.{currentLab.language}</span>
                </div>
                <button
                  onClick={() => copyCodeOnly(currentLab.code, currentLab._id)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Copy size={12} />
                  <span>Copy Code</span>
                </button>
              </div>
              <pre className="p-4 sm:p-5 text-xs font-mono text-emerald-300/90 overflow-x-auto leading-relaxed max-h-[500px] overflow-y-auto">
                <code>{currentLab.code || "// No code generated yet. Click 'Re-Derive AI'."}</code>
              </pre>
            </div>

            {/* Sample Input & Expected Console Output */}
            {(currentLab.sampleInput || currentLab.sampleOutput) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentLab.sampleInput && (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
                    <p className="text-xs font-bold text-white/70">Sample Input</p>
                    <pre className="text-xs font-mono text-white/90 p-2.5 rounded-xl bg-black/40 border border-white/5 overflow-x-auto">
                      {currentLab.sampleInput}
                    </pre>
                  </div>
                )}
                {currentLab.sampleOutput && (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
                    <p className="text-xs font-bold text-emerald-400">Expected Console Output</p>
                    <pre className="text-xs font-mono text-emerald-300 p-2.5 rounded-xl bg-black/40 border border-emerald-500/20 overflow-x-auto">
                      {currentLab.sampleOutput}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Complexity Analysis */}
            {currentLab.complexity?.time && (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-6 text-xs font-mono flex-wrap">
                <div>
                  <span className="text-[#8E8E93]">Time Complexity: </span>
                  <span className="text-white font-bold">{currentLab.complexity.time}</span>
                </div>
                <div>
                  <span className="text-[#8E8E93]">Space Complexity: </span>
                  <span className="text-white font-bold">{currentLab.complexity.space || "O(1)"}</span>
                </div>
              </div>
            )}

            {/* Viva-Voce Questions & Answers */}
            {currentLab.vivaQuestions && currentLab.vivaQuestions.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-purple-500/[0.05] border border-purple-500/20 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => setShowViva(!showViva)}
                  >
                    <p className="text-sm font-bold text-purple-300 flex items-center gap-2">
                      <HelpCircle size={16} /> Viva-Voce Oral Questions ({currentLab.vivaQuestions.length})
                    </p>
                    {showViva ? <ChevronUp size={16} className="text-[#8E8E93]" /> : <ChevronDown size={16} className="text-[#8E8E93]" />}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setVivaQuizMode(!vivaQuizMode);
                        setRevealedViva({});
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        vivaQuizMode
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-white/5 border-white/10 text-white/70 hover:text-white"
                      }`}
                      title={vivaQuizMode ? "Exit Quiz Mode" : "Test yourself: hide answers until tapped"}
                    >
                      {vivaQuizMode ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{vivaQuizMode ? "Viva Quiz Active" : "Practice Quiz"}</span>
                    </button>

                    <button
                      onClick={() => {
                        let text = `VIVA-VOCE QUESTIONS & ANSWERS — ${currentLab.title.toUpperCase()}\n\n`;
                        currentLab.vivaQuestions?.forEach((v, idx) => {
                          text += `Q${idx + 1}: ${v.question}\nAns: ${v.answer}\n\n`;
                        });
                        navigator.clipboard.writeText(text);
                        setCopiedViva(true);
                        setTimeout(() => setCopiedViva(false), 2000);
                        toast({ title: "Viva Q&A copied to clipboard!", type: "success" });
                      }}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                    >
                      {copiedViva ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedViva ? "Copied" : "Copy Q&A"}</span>
                    </button>
                  </div>
                </div>

                {showViva && (
                  <div className="space-y-3 pt-1">
                    {currentLab.vivaQuestions.map((v, idx) => {
                      const isRevealed = !vivaQuizMode || revealedViva[idx];
                      return (
                        <div key={idx} className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-white">
                              <span className="text-purple-400 font-mono">Q{idx + 1}: </span>{v.question}
                            </p>
                            {vivaQuizMode && (
                              <button
                                onClick={() =>
                                  setRevealedViva((prev) => ({
                                    ...prev,
                                    [idx]: !prev[idx],
                                  }))
                                }
                                className="px-2 py-0.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-bold border border-purple-500/30 transition-all cursor-pointer shrink-0"
                              >
                                {isRevealed ? "Hide Ans" : "Show Ans"}
                              </button>
                            )}
                          </div>
                          {isRevealed ? (
                            <p className="text-xs text-white/85 leading-relaxed pl-4 border-l-2 border-emerald-500/50 animate-in fade-in duration-150">
                              <span className="text-emerald-400 font-semibold">Ans: </span>{v.answer}
                            </p>
                          ) : (
                            <p className="text-[11px] text-[#8E8E93] italic pl-4 border-l-2 border-white/10">
                              Answer hidden for self-practice. Tap "Show Ans" to check.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : labs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#141414] border border-white/[0.08] space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#8E8E93]">
            <Code2 size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No lab experiments added yet</h3>
            <p className="text-xs text-[#8E8E93] max-w-sm mx-auto mt-1">
              Add your practical assignments or upload your lab manual document to get complete working code, expected outputs, algorithms, and viva Q&amp;A.
            </p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            Create First Experiment
          </button>
        </div>
      ) : (
        /* ── Experiments Grid ─────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {labs.map((l) => (
            <div
              key={l._id}
              className="p-5 rounded-2xl sm:rounded-3xl bg-[#141414] hover:bg-[#181818] border border-white/[0.08] hover:border-white/15 transition-all shadow-xl space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-white/10 text-white">
                      Exp #{l.experimentNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {l.language}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditLab(l)}
                      className="p-1.5 text-white/40 hover:text-purple-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      title="Edit experiment details"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteLab(l._id, l.title)}
                      className="p-1.5 text-white/30 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      title="Delete experiment"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                  {l.title}
                </h3>

                <p className="text-xs text-[#8E8E93] line-clamp-2">
                  {l.aim || l.teacherPrompt || "Code experiment with full algorithm and expected output."}
                </p>

                {l.complexity?.time && (
                  <p className="text-[11px] font-mono text-emerald-400">
                    Time: {l.complexity.time}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2 mt-auto">
                <button
                  onClick={() => copyCodeOnly(l.code, l._id)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1"
                  title="Copy code"
                >
                  {copiedCodeId === l._id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span className="text-[11px]">{copiedCodeId === l._id ? "Copied" : "Code"}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleDeriveWithAI(l._id)}
                    disabled={derivingId === l._id}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/35 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    <Sparkles size={12} />
                    <span>{derivingId === l._id ? "Deriving…" : "AI Derive"}</span>
                  </button>

                  <button
                    onClick={() => setCurrentLab(l)}
                    className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20 cursor-pointer flex items-center gap-1"
                  >
                    <span>View Record</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Create New Experiment ──────────────────────────────────────── */}
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
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400">
                <Code2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Add Lab Experiment</h3>
                <p className="text-xs text-[#8E8E93]">Paste prompt or upload lab manual to derive code with AI</p>
              </div>
            </div>

            {/* Document Upload Button */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-bold text-white">Upload Lab Manual / Assignment Sheet?</p>
                  <p className="text-[#8E8E93] text-[11px]">Auto-extracts experiment title, aim, and instructions</p>
                </div>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={isExtractingDoc}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                >
                  <UploadCloud size={14} className="text-purple-400" />
                  <span>{isExtractingDoc ? "Extracting…" : "Upload Manual"}</span>
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
                <div className="flex items-center gap-2 text-xs text-purple-400 pt-1 border-t border-white/5">
                  <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>{extractionProgress.message}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleCreateLab} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Subject</label>
                <select
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  required
                >
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id} className="bg-[#1C1C1E]">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-white/80 mb-1">Exp #</label>
                  <input
                    type="number"
                    min="1"
                    value={newExpNumber}
                    onChange={(e) => setNewExpNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-white/80 mb-1">Language</label>
                  <select
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="cpp" className="bg-[#1C1C1E]">C++</option>
                    <option value="c" className="bg-[#1C1C1E]">C</option>
                    <option value="python" className="bg-[#1C1C1E]">Python</option>
                    <option value="java" className="bg-[#1C1C1E]">Java</option>
                    <option value="sql" className="bg-[#1C1C1E]">SQL</option>
                    <option value="javascript" className="bg-[#1C1C1E]">JavaScript</option>
                    <option value="bash" className="bg-[#1C1C1E]">Bash / Linux</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Experiment Title</label>
                <input
                  type="text"
                  placeholder="e.g. Implement Banker's Deadlock Avoidance Algorithm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Aim / Objective (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. To write a program that simulates safety algorithm for resource allocation"
                  value={newAim}
                  onChange={(e) => setNewAim(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Teacher's Instructions / Problem Prompt
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste problem statement, sample data, or teacher's code requirements..."
                  value={newTeacherPrompt}
                  onChange={(e) => setNewTeacherPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoDeriveCheckbox"
                  checked={autoDeriveNew}
                  onChange={(e) => setAutoDeriveNew(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 bg-white/5 border-white/10 cursor-pointer"
                />
                <label htmlFor="autoDeriveCheckbox" className="text-xs text-white/90 cursor-pointer flex items-center gap-1.5">
                  <Sparkles size={13} className="text-purple-400" />
                  <span>Auto-derive full working code, output, and viva Q&amp;A immediately with AI</span>
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
                  disabled={isSavingLab}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isSavingLab ? "Deriving Code & Viva…" : "Save Lab Experiment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Experiment ────────────────────────────────────────────── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#1C1C1E] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-4">
            <button
              onClick={() => setEditModalOpen(false)}
              className="absolute right-5 top-5 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400">
                <Edit3 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Edit Lab Experiment</h3>
                <p className="text-xs text-[#8E8E93]">Update title, aim, language, or re-derive code with AI</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveLabEdit(false);
              }}
              className="space-y-4 pt-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1">Exp No.</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={editExpNumber}
                    onChange={(e) => setEditExpNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-white/80 mb-1">Target Language</label>
                  <select
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="cpp" className="bg-[#1C1C1E]">C++</option>
                    <option value="c" className="bg-[#1C1C1E]">C</option>
                    <option value="python" className="bg-[#1C1C1E]">Python</option>
                    <option value="java" className="bg-[#1C1C1E]">Java</option>
                    <option value="sql" className="bg-[#1C1C1E]">SQL</option>
                    <option value="javascript" className="bg-[#1C1C1E]">JavaScript</option>
                    <option value="bash" className="bg-[#1C1C1E]">Bash / Linux</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Experiment Title</label>
                <input
                  type="text"
                  placeholder="e.g. Implement Binary Search Algorithm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">Aim / Objective</label>
                <input
                  type="text"
                  placeholder="e.g. To write a program to search a key in a sorted array in O(log n)"
                  value={editAim}
                  onChange={(e) => setEditAim(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Teacher's Instructions / Problem Prompt
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste problem statement, sample inputs, or specific requirements..."
                  value={editTeacherPrompt}
                  onChange={(e) => setEditTeacherPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveLabEdit(false)}
                  disabled={isSavingEdit || !editTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveLabEdit(true)}
                  disabled={isSavingEdit || !editTitle.trim()}
                  className="px-4.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-600/90 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/25 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  <span>Save &amp; Re-Derive with AI</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
