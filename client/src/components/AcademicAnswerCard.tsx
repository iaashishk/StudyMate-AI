import { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Save,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { academicApi } from "../lib/academic-api";
import type { AssignmentQuestion } from "../types";

interface Props {
  question: AssignmentQuestion;
  assignmentId: string;
  questionIndex: number;
  onUpdate: (updatedQ: AssignmentQuestion) => void;
  onSolve: () => void;
  isSolving: boolean;
}

export default function AcademicAnswerCard({
  question,
  assignmentId,
  questionIndex,
  onUpdate,
  onSolve,
  isSolving,
}: Props) {
  const { toast } = useToast();
  const [copiedMode, setCopiedMode] = useState<"clean" | "raw" | null>(null);
  
  // Question text & marks edit state
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(question.question);
  const [editQuestionMarks, setEditQuestionMarks] = useState(question.marks || 5);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Solution answer edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(question.answer || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isCramMode, setIsCramMode] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Save question text & marks (with optional AI re-solve)
  const handleSaveQuestion = async (reSolve: boolean) => {
    if (!question._id || !editQuestionText.trim()) return;
    setIsSavingQuestion(true);
    try {
      const res = await academicApi.updateQuestion(assignmentId, question._id, {
        question: editQuestionText.trim(),
        marks: Number(editQuestionMarks) || 5,
      });
      onUpdate(res.question);
      setIsEditingQuestion(false);
      if (reSolve) {
        toast({ title: "Question saved! Formulating AI answer…", type: "info" });
        onSolve();
      } else {
        toast({ title: "Question updated successfully!", type: "success" });
      }
    } catch (err) {
      console.error("Update question failed", err);
      toast({ title: "Failed to update question", type: "error" });
    } finally {
      setIsSavingQuestion(false);
    }
  };

  // Copy cleaned plain text (suitable for handwriting into register / assignment sheet)
  const copyForRegister = () => {
    if (!question.answer) return;
    const cleanText = question.answer
      .replace(/^###\s+.*$/gm, "")
      .replace(/^####\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/```[a-z]*\n([\s\S]*?)\n```/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$(.*?)\$/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    navigator.clipboard.writeText(
      `Q${questionIndex + 1}. [${question.marks || 5} MARKS] ${question.question}\n\n` +
      `ANSWER:\n${cleanText}`
    );
    setCopiedMode("clean");
    setTimeout(() => setCopiedMode(null), 2500);
    toast({
      title: "📋 Clean solution copied for your handwritten assignment!",
      type: "success",
    });
  };

  // Copy full formatted text
  const copyRawAnswer = () => {
    if (!question.answer) return;
    navigator.clipboard.writeText(question.answer);
    setCopiedMode("raw");
    setTimeout(() => setCopiedMode(null), 2500);
    toast({ title: "Copied full solution text!", type: "success" });
  };

  // Save manual edits
  const handleSaveEdit = async () => {
    if (!question._id) return;
    setIsSaving(true);
    try {
      const res = await academicApi.updateQuestion(assignmentId, question._id, {
        answer: editText.trim(),
      });
      onUpdate(res.question);
      setIsEditing(false);
      toast({ title: "Solution updated successfully!", type: "success" });
    } catch (err) {
      console.error("Update question answer failed", err);
      toast({ title: "Failed to save edits", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to format inline bold, code, and math
  const renderInlineFormatted = (text: string) => {
    // Intelligent Math & TeX Macro Formatter
    const formatMathContent = (raw: string) => {
      let s = raw.trim();
      if (s.startsWith("$$") && s.endsWith("$$")) {
        s = s.slice(2, -2).trim();
      } else if (s.startsWith("$") && s.endsWith("$")) {
        s = s.slice(1, -1).trim();
      }

      // Replace \xrightarrow{...} with an elegant Unicode pipeline arrow
      s = s.replace(/\\xrightarrow\{([^}]+)\}/g, " ──▶ [$1] ──▶ ");

      // Standard TeX macro replacements
      s = s
        .replace(/\\textbf\{([^}]+)\}/g, "$1")
        .replace(/\\text\{([^}]+)\}/g, "$1")
        .replace(/\\mathrm\{([^}]+)\}/g, "$1")
        .replace(/\\mathcal\{([A-Za-z])\}/g, "$1")
        .replace(/\\quad/g, "  ")
        .replace(/\\qquad/g, "    ")
        .replace(/\\Longleftrightarrow/g, " ⟺ ")
        .replace(/\\Longrightarrow/g, " ⟹ ")
        .replace(/\\implies/g, " ⟹ ")
        .replace(/\\iff/g, " ⟺ ")
        .replace(/\\rightarrow/g, " → ")
        .replace(/\\to\b/g, " → ")
        .replace(/\\leftarrow/g, " ← ")
        .replace(/\\le\b|\\leq\b/g, " ≤ ")
        .replace(/\\ge\b|\\geq\b/g, " ≥ ")
        .replace(/\\ne\b|\\neq\b/g, " ≠ ")
        .replace(/\\approx\b/g, " ≈ ")
        .replace(/\\times\b/g, " × ")
        .replace(/\\cdot\b/g, " · ")
        .replace(/\\forall\b/g, " ∀ ")
        .replace(/\\exists\b/g, " ∃ ")
        .replace(/\\nexists\b/g, " ∄ ")
        .replace(/\\in\b/g, " ∈ ")
        .replace(/\\notin\b/g, " ∉ ")
        .replace(/\\subset\b/g, " ⊂ ")
        .replace(/\\cup\b/g, " ∪ ")
        .replace(/\\cap\b/g, " ∩ ")
        .replace(/\\pmod\{([^}]+)\}/g, "(mod $1)")
        .replace(/\s+/g, " ")
        .trim();

      return s;
    };

    // Regex splits by code, bold, double-dollar math, or single-dollar math
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\$\$[^\$]+\$\$|\$[^\$]+\$)/g);
    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-white/10 text-emerald-300 font-mono text-[11px] border border-white/5"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="text-white font-semibold tracking-wide">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("$") && part.endsWith("$")) {
        const cleaned = formatMathContent(part);
        const isPipeline = cleaned.includes("──▶") || cleaned.includes("⟺") || cleaned.includes("⟹");

        if (isPipeline) {
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 my-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 font-mono text-xs border border-emerald-500/25 shadow-sm max-w-full overflow-x-auto"
            >
              <span className="text-[10px] font-bold uppercase text-emerald-400/80 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/30 shrink-0">Flow</span>
              <span className="whitespace-nowrap leading-relaxed">{cleaned}</span>
            </span>
          );
        }

        return (
          <span
            key={i}
            className="font-mono text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/10 text-[11px] border border-amber-500/20 inline-block my-0.5"
          >
            {cleaned}
          </span>
        );
      }
      return part;
    });
  };

  // Structured parser for university-format answers
  const renderStructuredAnswer = (rawMarkdown: string) => {
    // Check if contains code block
    const codeBlockMatch = rawMarkdown.match(/```([a-z]*)\n([\s\S]*?)\n```/);
    const codeLang = codeBlockMatch ? codeBlockMatch[1] || "code" : "";
    const codeSnippet = codeBlockMatch ? codeBlockMatch[2] : "";

    // Split markdown lines
    const lines = rawMarkdown.split("\n");
    const sections: {
      type: "heading" | "definition" | "bullet" | "numbered" | "paragraph" | "code";
      title?: string;
      level?: number;
      content: string;
      label?: string;
    }[] = [];

    let inCode = false;
    let codeBuffer = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("```")) {
        if (!inCode) {
          inCode = true;
          codeBuffer = "";
        } else {
          inCode = false;
          sections.push({ type: "code", content: codeBuffer });
        }
        continue;
      }

      if (inCode) {
        codeBuffer += (codeBuffer ? "\n" : "") + line;
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("### ")) {
        sections.push({
          type: "heading",
          level: 3,
          content: trimmed.replace(/^###\s+/, ""),
        });
      } else if (trimmed.startsWith("#### ")) {
        sections.push({
          type: "heading",
          level: 4,
          content: trimmed.replace(/^####\s+/, ""),
        });
      } else if (/^[-*]\s+\*\*(.*?)\*\*:\s*(.*)$/.test(trimmed)) {
        const m = trimmed.match(/^[-*]\s+\*\*(.*?)\*\*:\s*(.*)$/);
        if (m) {
          sections.push({
            type: "bullet",
            label: m[1],
            content: m[2],
          });
        }
      } else if (/^[-*]\s+(.*)$/.test(trimmed)) {
        sections.push({
          type: "bullet",
          content: trimmed.replace(/^[-*]\s+/, ""),
        });
      } else if (/^\d+\.\s+\*\*(.*?)\*\*:\s*(.*)$/.test(trimmed)) {
        const m = trimmed.match(/^\d+\.\s+\*\*(.*?)\*\*:\s*(.*)$/);
        if (m) {
          sections.push({
            type: "numbered",
            label: m[1],
            content: m[2],
          });
        }
      } else if (/^\d+\.\s+(.*)$/.test(trimmed)) {
        sections.push({
          type: "numbered",
          content: trimmed.replace(/^\d+\.\s+/, ""),
        });
      } else {
        sections.push({
          type: "paragraph",
          content: trimmed,
        });
      }
    }

    return (
      <div className="space-y-4">
        {sections.map((sec, idx) => {
          if (sec.type === "heading") {
            const isSubheading = sec.level === 4;
            const text = sec.content.replace(/^[0-9.]+\s*/, "");
            const num = sec.content.match(/^[0-9.]+/)?.[0] || "";

            const isDefinition = text.toLowerCase().includes("definition");
            const isFramework = text.toLowerCase().includes("framework") || text.toLowerCase().includes("theoretical");
            const isComponents = text.toLowerCase().includes("component") || text.toLowerCase().includes("characteristic") || text.toLowerCase().includes("operation");
            const isExample = text.toLowerCase().includes("example") || text.toLowerCase().includes("practical") || text.toLowerCase().includes("implementation");
            const isSummary = text.toLowerCase().includes("summary") || text.toLowerCase().includes("exam");

            const icon = isDefinition ? "🎯" : isFramework ? "⚙️" : isComponents ? "📋" : isExample ? "💡" : isSummary ? "🏆" : "📌";

            return (
              <div
                key={idx}
                className={`flex items-center gap-2 pt-2 border-t border-white/[0.06] first:border-none first:pt-0 ${
                  isSubheading ? "text-white font-bold text-sm tracking-tight" : "text-[#0A84FF] font-extrabold text-base"
                }`}
              >
                <span className="text-base select-none">{icon}</span>
                <span>
                  {num ? <span className="font-mono text-white/50 mr-1.5">{num}</span> : null}
                  {text}
                </span>
              </div>
            );
          }

          if (sec.type === "bullet") {
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-start gap-2.5 hover:border-white/10 transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#0A84FF] mt-1.5 shrink-0" />
                <div className="text-xs text-white/90 leading-relaxed flex-1">
                  {sec.label && (
                    <span className="font-bold text-[#0A84FF] mr-1.5">
                      {sec.label}:
                    </span>
                  )}
                  {renderInlineFormatted(sec.content)}
                </div>
              </div>
            );
          }

          if (sec.type === "numbered") {
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-start gap-2.5 hover:border-white/10 transition-colors"
              >
                <div className="w-5 h-5 rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 border border-[#0A84FF]/25">
                  ✓
                </div>
                <div className="text-xs text-white/90 leading-relaxed flex-1">
                  {sec.label && (
                    <span className="font-bold text-white mr-1.5">
                      {sec.label}:
                    </span>
                  )}
                  {renderInlineFormatted(sec.content)}
                </div>
              </div>
            );
          }

          if (sec.type === "code") {
            return (
              <div key={idx} className="rounded-xl border border-white/10 bg-[#0C0C0E] overflow-hidden my-3">
                <div className="px-3 py-1.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-rose-500/80" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/80" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
                    <span className="text-[10px] font-mono text-[#8E8E93] ml-2">code snippet</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sec.content);
                      toast({ title: "Code snippet copied!", type: "success" });
                    }}
                    className="text-[10px] text-white/70 hover:text-white flex items-center gap-1 cursor-pointer font-mono"
                  >
                    <Copy size={10} /> Copy
                  </button>
                </div>
                <pre className="p-3.5 text-xs font-mono text-emerald-300/90 overflow-x-auto leading-relaxed whitespace-pre">
                  <code>{sec.content}</code>
                </pre>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="text-xs text-white/80 leading-relaxed pl-1"
            >
              {renderInlineFormatted(sec.content)}
            </div>
          );
        })}

        {/* Standalone code preview if code block was present */}
        {codeSnippet && !sections.some((s) => s.type === "code") && (
          <div className="rounded-xl border border-white/10 bg-[#0C0C0E] overflow-hidden my-3">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#8E8E93]">{codeLang || "c++"}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeSnippet);
                  toast({ title: "Code copied!", type: "success" });
                }}
                className="text-[10px] text-white/70 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Copy size={10} /> Copy Code
              </button>
            </div>
            <pre className="p-3.5 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
              <code>{codeSnippet}</code>
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.07] space-y-4 hover:border-white/15 transition-all shadow-lg">
      {/* ── Top Bar: Question Number, Marks & Actions ───────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
              Q{questionIndex + 1}
            </span>
            <span className="text-[11px] font-mono text-[#8E8E93] bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              {question.marks || 5} Marks
            </span>
            {question.aiGenerated && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                <Sparkles size={11} /> AI Formulated
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setIsEditingQuestion(!isEditingQuestion);
                setEditQuestionText(question.question);
                setEditQuestionMarks(question.marks || 5);
              }}
              className="p-1 px-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[#8E8E93] hover:text-white text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
              title="Edit question text and marks"
            >
              <Edit3 size={11} className="text-[#0A84FF]" />
              <span>{isEditingQuestion ? "Close Editor" : "Edit Question"}</span>
            </button>
          </div>
          {!isEditingQuestion && (
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug">
              {question.question}
            </h3>
          )}
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0 flex-wrap">
          {question.answer && (
            <>
              {/* Active Recall Mode Toggle */}
              <button
                onClick={() => {
                  setIsCramMode(!isCramMode);
                  setIsRevealed(false);
                }}
                className={`p-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  isCramMode
                    ? "bg-amber-500/20 border-amber-500/35 text-amber-300"
                    : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title={isCramMode ? "Exit Active Recall" : "Enable Active Recall (Self-Test Mode)"}
              >
                {isCramMode ? <EyeOff size={13} /> : <Eye size={13} />}
                <span className="text-[11px] hidden sm:inline">
                  {isCramMode ? "Self-Test On" : "Self-Test"}
                </span>
              </button>

              {/* Edit Mode Toggle */}
              <button
                onClick={() => {
                  setIsEditing(!isEditing);
                  setEditText(question.answer || "");
                }}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                title="Edit solution / add teacher tips"
              >
                <Edit3 size={13} />
              </button>

              {/* Copy for Register */}
              <button
                onClick={copyForRegister}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Copy clean plain text without markdown symbols for writing into physical register"
              >
                {copiedMode === "clean" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span className="text-[11px]">
                  {copiedMode === "clean" ? "Copied Clean!" : "Copy for Register"}
                </span>
              </button>
            </>
          )}

          {/* Solve / Re-Solve AI Button */}
          <button
            onClick={onSolve}
            disabled={isSolving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-md shadow-[#0A84FF]/20 cursor-pointer disabled:opacity-50"
          >
            <Sparkles size={12} />
            <span>
              {isSolving
                ? "Solving…"
                : question.answer
                ? "Re-Solve"
                : "Solve with AI"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Inline Question & Marks Editor Panel ───────────────────────────── */}
      {isEditingQuestion && (
        <div className="p-4 rounded-2xl bg-[#141416] border border-[#0A84FF]/40 space-y-3.5 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Edit3 size={13} className="text-[#0A84FF]" /> Edit Question Details
            </span>
            <button
              type="button"
              onClick={() => setIsEditingQuestion(false)}
              className="text-[11px] text-[#8E8E93] hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#8E8E93]">
              Question as dictated by professor / exam sheet
            </label>
            <textarea
              rows={3}
              value={editQuestionText}
              onChange={(e) => setEditQuestionText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-medium focus:outline-none focus:border-[#0A84FF] leading-relaxed resize-y"
              placeholder="e.g. What is Java? Explain JVM, JRE, and JDK architecture."
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#8E8E93]">Marks:</span>
              <div className="flex items-center gap-1.5">
                {[2, 5, 10, 16].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditQuestionMarks(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      editQuestionMarks === m
                        ? "bg-[#0A84FF] text-white shadow-sm shadow-[#0A84FF]/30"
                        : "bg-white/5 hover:bg-white/10 text-white/70"
                    }`}
                  >
                    {m}M
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editQuestionMarks}
                  onChange={(e) => setEditQuestionMarks(Number(e.target.value))}
                  className="w-14 px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono text-center focus:outline-none focus:border-[#0A84FF]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => setIsEditingQuestion(false)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveQuestion(false)}
                disabled={isSavingQuestion || !editQuestionText.trim()}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingQuestion ? "Saving…" : "Save Question Only"}
              </button>
              <button
                type="button"
                onClick={() => handleSaveQuestion(true)}
                disabled={isSavingQuestion || !editQuestionText.trim()}
                className="px-4 py-1.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all shadow-md shadow-[#0A84FF]/25 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles size={13} />
                <span>Save &amp; Re-Solve with AI</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Answer Section ──────────────────────────────────────────────────── */}
      {isEditing ? (
        /* Edit Mode: Inline Textarea */
        <div className="space-y-3 p-4 rounded-2xl bg-black/50 border border-[#0A84FF]/30 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs text-[#8E8E93]">
            <span className="font-semibold text-white/80 flex items-center gap-1.5">
              <Edit3 size={13} className="text-[#0A84FF]" /> Edit Solution (Markdown Supported)
            </span>
            <span>Supports headers, bold, bullets, and code blocks</span>
          </div>

          <textarea
            rows={8}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono leading-relaxed focus:outline-none focus:border-[#0A84FF]"
            placeholder="Type or paste academic solution..."
          />

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={13} />
              <span>{isSaving ? "Saving…" : "Save Solution"}</span>
            </button>
          </div>
        </div>
      ) : question.answer ? (
        /* Display Mode */
        <div className="rounded-2xl border border-white/[0.08] bg-[#101012] overflow-hidden shadow-inner">
          {/* Header pill inside answer card */}
          <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                Academic Professor Solution
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#8E8E93]">
              <button
                onClick={copyRawAnswer}
                className="hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                title="Copy formatted markdown"
              >
                {copiedMode === "raw" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span>{copiedMode === "raw" ? "Copied!" : "Copy Full"}</span>
              </button>
              <span>•</span>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
              >
                {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                <span>{isCollapsed ? "Expand" : "Collapse"}</span>
              </button>
            </div>
          </div>

          {/* Answer Content */}
          {!isCollapsed && (
            <div className="p-4 sm:p-6 relative">
              {/* Active Recall Blurring Overlay */}
              {isCramMode && !isRevealed ? (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <BookOpen size={22} />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-bold text-white">Active Recall Challenge</p>
                    <p className="text-xs text-[#8E8E93]">
                      Try recalling the definition, formula, and key points in your head before checking the model answer.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsRevealed(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-500/90 text-black text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5 mt-2"
                  >
                    <Eye size={14} />
                    <span>Reveal Model Answer</span>
                  </button>
                </div>
              ) : (
                <div className="animate-in fade-in duration-200">
                  {renderStructuredAnswer(question.answer)}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <HelpCircle size={16} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-200">
              No solution formulated yet. Click <strong>"Solve with AI"</strong> to derive a university-grade answer.
            </span>
          </div>
          <button
            onClick={onSolve}
            disabled={isSolving}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-xs font-bold transition-all cursor-pointer self-start sm:self-auto shrink-0 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Sparkles size={12} />
            <span>{isSolving ? "Solving…" : "Solve Now"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
