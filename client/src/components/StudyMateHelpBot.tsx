import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Send,
  RotateCcw,
  User,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import api from "../lib/api";
import { LogoIcon } from "./Logo";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
}

const QUICK_TOPICS = [
  { label: "📅 Scan Timetable", text: "How do I scan my timetable routine?" },
  { label: "🎯 75% Rule & Bunking", text: "How does the 75% attendance rule and Can I Bunk calculator work?" },
  { label: "⏳ Backfill Attendance", text: "How do I backfill my past attendance records?" },
  { label: "📚 Study Planner", text: "How does the study planner calculate priorities?" },
  { label: "💻 Lab Codes", text: "How do I save practical lab codes and viva questions?" },
];

export default function StudyMateHelpBot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem("studymate_guide_messages_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        const clean = parsed.filter((m: ChatMessage) => !/gemini|connected to gemini/i.test(m.text));
        if (clean.length > 0) return clean;
      }
    } catch {
      // ignore
    }
    return [
      {
        id: "welcome-1",
        role: "assistant",
        text: `Hi! How can I help you navigate StudyMate today?\n\nTap one of the topics below or ask any question about your timetable, classes, or attendance:`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("studymate_guide_messages_v2", JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized, messages]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "model" | "user",
        text: m.text,
      }));

      const res = await api.post<{
        data: { reply: string };
      }>("/helpbot/chat", {
        message: text,
        history,
      });

      const botReply = res.data?.data?.reply || "I'm here to help! Could you please rephrase your question?";

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: unknown) {
      console.error("Helpbot request error:", err);
      const errMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: "assistant",
        text: `Sorry, I had trouble connecting. You can explore:\n- [Attendance & Timetable](/attendance)\n- [Study Planner](/plan)\n- [Lab Codes](/lab-codes)\n- [Curriculum Hub](/subjects)`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    const reset: ChatMessage[] = [
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        text: `Chat cleared! What would you like help with?`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
    setMessages(reset);
  };

  /** Render markdown-style links and bolding cleanly */
  const renderMessageContent = (content: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      const label = match[1];
      const url = match[2];
      parts.push(
        <button
          key={`${url}-${match.index}`}
          type="button"
          onClick={() => {
            if (url.startsWith("/")) {
              navigate(url);
              setIsMinimized(true);
            } else {
              window.open(url, "_blank");
            }
          }}
          className="inline-flex items-center gap-1 font-bold text-[#0A84FF] hover:underline bg-[#0A84FF]/10 px-1.5 py-0.5 rounded mx-0.5 transition-colors cursor-pointer text-[12px]"
        >
          <span>{label}</span>
          <ExternalLink size={10} className="shrink-0" />
        </button>
      );
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return (
      <div className="space-y-1.5 whitespace-pre-wrap leading-relaxed text-xs">
        {parts.map((p, i) =>
          typeof p === "string" ? (
            <span key={i}>
              {p.split("\n").map((line, lIdx) => {
                const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <React.Fragment key={lIdx}>
                    {lIdx > 0 && <br />}
                    {boldParts.map((bp, bIdx) => {
                      if (bp.startsWith("**") && bp.endsWith("**")) {
                        return (
                          <strong key={bIdx} className="font-bold text-white">
                            {bp.slice(2, -2)}
                          </strong>
                        );
                      }
                      return bp;
                    })}
                  </React.Fragment>
                );
              })}
            </span>
          ) : (
            p
          )
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── 1. Floating Panda Symbol Trigger (Bottom-Right on Homescreen) ── */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        {!isOpen && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#1C1C1E] hover:bg-[#252528] active:scale-95 border border-white/15 shadow-2xl flex items-center justify-center transition-all duration-200 cursor-pointer group"
            title="StudyMate Guide"
          >
            <LogoIcon size={30} className="transition-transform group-hover:scale-110" />
          </button>
        )}
      </div>

      {/* ── 2. Floating Help Window ── */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ease-out ${
            isMinimized
              ? "bottom-20 right-4 sm:bottom-6 sm:right-6 w-64"
              : "bottom-20 right-3 sm:bottom-6 sm:right-6 w-[92vw] sm:w-[400px] max-h-[80vh] h-[540px]"
          } bg-[#18181B] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-150`}
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-white/[0.03] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <LogoIcon size={24} />
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate">
                  StudyMate
                </h4>
                <p className="text-[10px] text-[#8E8E93] truncate">
                  Help &amp; Navigation
                </p>
              </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-1 text-white/60">
              <button
                type="button"
                onClick={handleClearChat}
                className="p-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                title="Clear conversation"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized((prev) => !prev)}
                className="p-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                <ChevronDown
                  size={15}
                  className={`transition-transform duration-200 ${isMinimized ? "rotate-180" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          {!isMinimized && (
            <>
              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "assistant" && (
                      <div className="mt-0.5 shrink-0">
                        <LogoIcon size={20} />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs ${
                        m.role === "user"
                          ? "bg-[#0A84FF] text-white rounded-br-xs font-medium"
                          : "bg-white/[0.04] border border-white/10 text-white/90 rounded-bl-xs"
                      }`}
                    >
                      {renderMessageContent(m.text)}
                      <div
                        className={`text-[9px] mt-1 font-mono ${
                          m.role === "user" ? "text-white/60 text-right" : "text-white/40"
                        }`}
                      >
                        {m.time}
                      </div>
                    </div>

                    {m.role === "user" && (
                      <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white/80 shrink-0 mt-0.5">
                        <User size={12} />
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex items-center gap-2 text-xs text-[#8E8E93] bg-white/[0.03] px-3 py-2 rounded-xl border border-white/5 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-ping" />
                    <span>Looking up answer…</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Topics */}
              <div className="px-3 py-1.5 border-t border-white/5 bg-black/20 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
                {QUICK_TOPICS.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qp.text)}
                    disabled={isLoading}
                    className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-[10px] font-medium transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="p-3 bg-white/[0.02] border-t border-white/10 flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask a question..."
                  disabled={isLoading}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#0A84FF] transition-colors"
                />

                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={isLoading || !inputMessage.trim()}
                  className="w-8 h-8 rounded-xl bg-[#0A84FF] hover:bg-[#0071E3] disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  <Send size={14} />
                </button>
              </div>
            </>
          )}

          {/* Minimized Bar */}
          {isMinimized && (
            <div
              onClick={() => setIsMinimized(false)}
              className="p-3 text-xs text-white/80 font-bold flex items-center justify-between cursor-pointer hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <LogoIcon size={18} />
                <span>StudyMate</span>
              </div>
              <ChevronDown size={14} className="rotate-180" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

