"use client";

import { useState, useRef, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import { 
  Send, 
  Bot, 
  User, 
  HelpCircle, 
  Zap, 
  Clock, 
  Coins, 
  ShieldAlert, 
  Check, 
  Copy, 
  Download,
  Settings,
  Sparkles,
  Info,
  Cpu,
  RefreshCw,
  Trash2,
  Sliders,
  Maximize2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import FormattedMessage from "@/components/FormattedMessage";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  isStreaming?: boolean;
  
  // Router Metadata
  route?: string;
  reason?: string;
  latency_ms?: number;
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  confidence?: number;
  draft?: string;
  intent?: string;
  compute_backend?: string;
}

export default function ChatPage() {
  const { user, isAuthenticated, authHeaders } = useAuth();

  // Scoped storage key
  const storageKey = user?.email 
    ? `triforge_chat_messages_${user.email}`
    : "triforge_chat_messages_guest";

  const [messages, setMessages] = useState<Message[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load chat messages from localStorage on user change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([]);
      }
    } catch (e) {
      setMessages([]);
    }
    setIsInitialized(true);
  }, [storageKey]);

  // Persist messages
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to persist chat messages", e);
    }
  }, [messages, storageKey, isInitialized]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Router Control Parameters
  const [threshold, setThreshold] = useState(0.80);
  const [localModel, setLocalModel] = useState("qwen2.5:3b-instruct");
  const [remoteModel, setRemoteModel] = useState("accounts/fireworks/models/llama-v3p1-8b-instruct");
  const [computeBackend, setComputeBackend] = useState("AMD Ryzen AI (NPU)");
  const [models, setModels] = useState<{
    local: { id: string; name: string }[];
    remote: { id: string; name: string }[];
  }>({
    local: [
      { id: "qwen2.5:3b-instruct", name: "Qwen 2.5 3B Instruct (Default Fast-Path)" },
      { id: "groq/compound-mini", name: "Groq Compound-Mini (LPU)" },
      { id: "phi3:mini", name: "Phi-3 Mini (On-Device NPU)" }
    ],
    remote: [
      { id: "accounts/fireworks/models/llama-v3p1-8b-instruct", name: "Fireworks Llama 3.1 8B Instruct (Default Cloud)" },
      { id: "llama-3-70b-8192", name: "Llama 3 70B (Deep Reasoning)" },
      { id: "gpt-4o", name: "GPT-4o (Frontier Fallback)" }
    ]
  });

  const [showOptions, setShowOptions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch real model choices and settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings`, {
          headers: authHeaders
        });
        if (res.ok) {
          const data = await res.json();
          if (data.active_local_model) setLocalModel(data.active_local_model);
          if (data.active_remote_model) setRemoteModel(data.active_remote_model);
          if (data.default_threshold) setThreshold(data.default_threshold);
          if (data.compute_backend) setComputeBackend(data.compute_backend);
        }
      } catch (err) {
        console.error("Failed to load initial router settings", err);
      }
    };
    fetchSettings();
  }, [authHeaders]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (filename: string, text: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `${filename}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear this conversation?")) {
      setMessages([]);
      localStorage.removeItem(storageKey);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    setInput("");

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: userPrompt
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const newAssistantMsg: Message = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      isStreaming: true,
      compute_backend: computeBackend
    };

    setMessages(prev => [...prev, newUserMsg, newAssistantMsg]);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          prompt: userPrompt,
          threshold: threshold,
          local_model: localModel,
          remote_model: remoteModel,
          user_email: user?.email,
          user_id: user?.id
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errMsg = "API Request failed.";
        try {
          const errObj = JSON.parse(errorText);
          errMsg = errObj.detail || errMsg;
        } catch (e) {
          errMsg = errorText || errMsg;
        }
        throw new Error(errMsg);
      }

      if (!response.body) throw new Error("No response body available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let textAccumulator = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") {
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isStreaming: false } : m));
              continue;
            }

            try {
              const data = JSON.parse(dataStr);

              if (data.event === "routing") {
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                  ...m,
                  route: data.route,
                  reason: data.reason
                } : m));
              } else if (data.event === "escalation") {
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                  ...m,
                  route: "LOCAL -> ESCALATED TO REMOTE",
                  reason: data.reason
                } : m));
              } else if (data.event === "content") {
                textAccumulator += data.text || "";
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                  ...m,
                  text: textAccumulator
                } : m));
              } else if (data.event === "done") {
                setMessages(prev => {
                  const updated = prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    text: textAccumulator || m.text,
                    route: data.route || m.route,
                    reason: m.reason,
                    latency_ms: data.latency_ms,
                    cost: data.estimated_cost,
                    prompt_tokens: data.prompt_tokens,
                    completion_tokens: data.completion_tokens,
                    confidence: data.confidence_score,
                    draft: data.draft,
                    intent: data.intent,
                    compute_backend: data.compute_backend || computeBackend,
                    isStreaming: false
                  } : m);

                  const doneMsg = updated.find(m => m.id === assistantMsgId);
                  if (doneMsg && !selectedMessage) {
                    setSelectedMessage(doneMsg);
                  }

                  return updated;
                });
              }
            } catch (e) {
              // Ignore non-json chunks
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
        ...m, 
        text: `**Execution Error:** ${err.message || "Failed to contact backend."}`,
        route: "ERROR",
        isStreaming: false 
      } : m));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden h-screen bg-[#0d0d0d] text-zinc-100 font-sans">
      
      {/* Central Chat Interface */}
      <div className="flex-1 flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
        
        {/* Top Minimal Header */}
        <header className="px-6 py-3.5 border-b border-zinc-800/80 flex justify-between items-center bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-sm tracking-tight">TriForge Intelligent Router</h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-400">
                  {computeBackend}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                Consistency Gate: &ge; {threshold.toFixed(2)} &bull; Real-time Edge Routing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button 
                onClick={handleClearChat}
                className="bg-zinc-800/80 hover:bg-red-950/50 hover:text-red-400 border border-zinc-700/80 hover:border-red-500/30 text-zinc-300 font-medium text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            )}
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className={`border text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 font-medium ${
                showOptions 
                  ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                  : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Router Controls</span>
            </button>
          </div>
        </header>

        {/* Collapsible Router Controls Bar */}
        {showOptions && (
          <div className="bg-[#171717] border-b border-zinc-800 p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-xl text-xs z-10 animate-fade-in">
            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase font-mono text-[10px]">
                Local Edge Model Override
              </label>
              <select 
                value={localModel} 
                onChange={(e) => setLocalModel(e.target.value)}
                className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-lg p-2 text-white font-sans text-xs focus:border-amber-500 focus:outline-none"
              >
                {models.local.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase font-mono text-[10px]">
                Remote Cloud Model Override
              </label>
              <select 
                value={remoteModel} 
                onChange={(e) => setRemoteModel(e.target.value)}
                className="w-full bg-[#0d0d0d] border border-zinc-700 rounded-lg p-2 text-white font-sans text-xs focus:border-amber-500 focus:outline-none"
              >
                {models.remote.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase font-mono text-[10px]">
                Consistency Threshold ({threshold.toFixed(2)})
              </label>
              <input 
                type="range" 
                min="0.1" 
                max="1.0" 
                step="0.05" 
                value={threshold} 
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 mt-2"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
                <span>0.10 (Always Local)</span>
                <span>0.80 (Default)</span>
                <span>1.00 (Always Cloud)</span>
              </div>
            </div>
          </div>
        )}

        {/* Message Thread (ChatGPT Flow) */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          <div className="max-w-3xl lg:max-w-4xl mx-auto w-full space-y-8">
            
            {messages.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-amber-400 shadow-xl">
                  <Bot className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">How can TriForge route for you?</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Submit coding tasks, architectural queries, math equations, or security checks. Queries route to zero-cost edge hardware and escalate only when entropy drops.
                </p>

                {/* Quick Starters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4 text-left">
                  <button
                    onClick={() => { setInput("Write a Python binary search function with O(log n) time complexity."); }}
                    className="p-3 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800 text-xs text-zinc-300 transition-all text-left"
                  >
                    <div className="font-semibold text-white mb-0.5">&quot;Python binary search&quot;</div>
                    <div className="text-[11px] text-zinc-500">Routes to fast-path edge model</div>
                  </button>

                  <button
                    onClick={() => { setInput("Architect a resilient multi-region database replication strategy resolving CAP theorem partitions."); }}
                    className="p-3 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800 text-xs text-zinc-300 transition-all text-left"
                  >
                    <div className="font-semibold text-white mb-0.5">&quot;Multi-region DB architecture&quot;</div>
                    <div className="text-[11px] text-zinc-500">Escalates to cloud 70B deep reasoning</div>
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender === "user";

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex justify-end w-full">
                      <div className="bg-[#2f2f2f] text-zinc-100 px-5 py-3.5 rounded-3xl max-w-[85%] sm:max-w-[75%] text-[15px] sm:text-[16px] leading-7 font-normal shadow-sm break-words">
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex gap-4 w-full items-start group">
                    {/* Bot Icon */}
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-amber-400 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>

                    {/* Assistant Message Body */}
                    <div className="flex-1 overflow-hidden space-y-3">
                      
                      {/* Main Formatted Markdown Response */}
                      <FormattedMessage content={msg.text} isStreaming={msg.isStreaming} />

                      {/* Clean Telemetry & Action Strip (ChatGPT Style) */}
                      {!msg.isStreaming && msg.text && (
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-zinc-800/60 font-mono select-none">
                          
                          {/* Route & Performance Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            {msg.route && (
                              <span className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] border flex items-center gap-1.5 ${
                                msg.route.includes("ESCALATED")
                                  ? "bg-red-950/50 text-red-300 border-red-800/60"
                                  : msg.route.includes("REMOTE")
                                    ? "bg-blue-950/50 text-blue-300 border-blue-800/60"
                                    : msg.route.includes("CACHE")
                                      ? "bg-purple-950/50 text-purple-300 border-purple-800/60"
                                      : "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  msg.route.includes("ESCALATED") ? "bg-red-400" : msg.route.includes("REMOTE") ? "bg-blue-400" : "bg-emerald-400"
                                }`} />
                                <span>{msg.route}</span>
                              </span>
                            )}

                            {msg.latency_ms !== undefined && (
                              <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                                <Clock className="w-3 h-3 text-zinc-500" />
                                <span>{Math.round(msg.latency_ms)}ms</span>
                              </span>
                            )}

                            {msg.cost !== undefined && (
                              <span className="text-emerald-400 text-[11px]">
                                ${msg.cost.toFixed(6)}
                              </span>
                            )}

                            {msg.confidence !== undefined && (
                              <span className="text-zinc-400 text-[11px]">
                                gate: <strong className="text-amber-400">{msg.confidence.toFixed(2)}</strong>
                              </span>
                            )}
                          </div>

                          {/* Action Toolbar */}
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <button
                              onClick={() => handleCopy(msg.id, msg.text)}
                              title="Copy response"
                              className="p-1.5 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => handleDownload(`triforge_response_${msg.id}`, msg.text)}
                              title="Download Markdown"
                              className="p-1.5 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setSelectedMessage(msg)}
                              className="text-[11px] px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 rounded-lg transition-colors font-sans font-medium flex items-center gap-1"
                            >
                              <Maximize2 className="w-3 h-3" />
                              <span>Inspect Trace</span>
                            </button>
                          </div>

                        </div>
                      )}

                    </div>
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Floating Input Bar (ChatGPT Styled) */}
        <div className="p-4 bg-[#0d0d0d] border-t border-zinc-800/80">
          <form onSubmit={handleSend} className="max-w-3xl lg:max-w-4xl mx-auto">
            <div className="relative flex items-center bg-[#212121] border border-zinc-700/70 focus-within:border-zinc-500 rounded-3xl p-2 shadow-2xl transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                placeholder={loading ? "Executing model routing..." : "Ask anything (e.g. Write Python QuickSort, design a caching layer)..."}
                className="w-full bg-transparent px-4 py-2 text-[15px] text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50 font-sans"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full bg-white hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 text-black flex items-center justify-center transition-all shrink-0 active:scale-95 shadow-md mr-1"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" /> : <Send className="w-4 h-4 fill-current" />}
              </button>
            </div>
            <div className="text-center mt-2 text-[11px] text-zinc-500 font-mono">
              TriForge routes autonomously between local edge compute and speculative cloud reasoning.
            </div>
          </form>
        </div>

      </div>

      {/* Inspector Drawer (Slide-out Right Panel) */}
      {selectedMessage && (
        <div className="w-88 sm:w-96 bg-[#141414] border-l border-zinc-800 p-6 overflow-y-auto space-y-6 flex flex-col h-full z-20 shadow-2xl">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-white text-sm">Router Execution Trace</h3>
            </div>
            <button 
              onClick={() => setSelectedMessage(null)}
              className="text-zinc-400 hover:text-white text-xs font-semibold px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-md"
            >
              Close
            </button>
          </div>

          <div className="space-y-4 text-xs font-mono">
            {/* Route */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                EXECUTION ROUTE
              </span>
              <div className="bg-[#0d0d0d] p-3 rounded-lg border border-zinc-800 font-bold text-white">
                {selectedMessage.route || "LOCAL"}
              </div>
            </div>

            {/* Rationale */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                ROUTER RATIONALE
              </span>
              <p className="bg-[#0d0d0d] p-3 rounded-lg border border-zinc-800 text-zinc-300 font-sans text-xs leading-relaxed">
                {selectedMessage.reason || "Autonomous confidence threshold evaluation completed successfully."}
              </p>
            </div>

            {/* Telemetry Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0d0d0d] p-3 border border-zinc-800 rounded-lg">
                <span className="text-[9px] text-zinc-500 uppercase">MEASURED LATENCY</span>
                <div className="text-base font-bold text-cyan-400 mt-1">
                  {selectedMessage.latency_ms ? `${Math.round(selectedMessage.latency_ms)}ms` : "--"}
                </div>
              </div>

              <div className="bg-[#0d0d0d] p-3 border border-zinc-800 rounded-lg">
                <span className="text-[9px] text-zinc-500 uppercase">CALCULATED COST</span>
                <div className="text-base font-bold text-emerald-400 mt-1">
                  ${selectedMessage.cost ? selectedMessage.cost.toFixed(6) : "0.000000"}
                </div>
              </div>
            </div>

            {/* Token Counts */}
            <div className="bg-[#0d0d0d] p-3 border border-zinc-800 rounded-lg grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[9px] text-zinc-500 uppercase">PROMPT TOKENS</span>
                <div className="text-sm font-bold text-white mt-0.5">{selectedMessage.prompt_tokens || 0}</div>
              </div>
              <div>
                <span className="text-[9px] text-zinc-500 uppercase">COMPLETION TOKENS</span>
                <div className="text-sm font-bold text-white mt-0.5">{selectedMessage.completion_tokens || 0}</div>
              </div>
            </div>

            {/* Consistency Gate */}
            {selectedMessage.confidence !== undefined && (
              <div className="bg-[#0d0d0d] p-3 border border-zinc-800 rounded-lg flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase">CONSISTENCY SCORE</span>
                <span className="text-xs font-bold text-amber-400">
                  {selectedMessage.confidence.toFixed(2)} / 1.00
                </span>
              </div>
            )}

            {/* Local Draft */}
            {selectedMessage.draft && (
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-[#0d0d0d]">
                <div className="bg-zinc-900 px-3 py-1.5 border-b border-zinc-800 text-[10px] font-bold text-zinc-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500" />
                  Local Model Draft Sample
                </div>
                <div className="p-3 text-xs text-zinc-300 max-h-48 overflow-y-auto leading-relaxed">
                  <FormattedMessage content={selectedMessage.draft} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
