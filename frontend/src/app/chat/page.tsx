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
  Cpu
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  isStreaming?: boolean;
  
  // Router Metadata
  route?: string;
  reason?: string;
  latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  confidence?: number;
  draft?: string;
  intent?: string;
  compute_backend?: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [computeBackend, setComputeBackend] = useState<string>("CPU");

  // Quick Override Options
  const [localModel, setLocalModel] = useState("");
  const [remoteModel, setRemoteModel] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [showOptions, setShowOptions] = useState(false);
  const [models, setModels] = useState<{ local: { id: string; name: string }[]; remote: { id: string; name: string }[] }>({
    local: [],
    remote: []
  });

  // Inspector Sidebar
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load saved messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("triforge_chat_messages");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved messages", e);
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("triforge_chat_messages", JSON.stringify(messages));
  }, [messages]);

  // Clear chat session history
  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem("triforge_chat_messages");
    setSelectedMessage(null);
  };

  useEffect(() => {
    // Fetch default settings and models list from backend
    const initialize = async () => {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/settings`),
          fetch(`${API_BASE_URL}/api/models`)
        ]);
        if (settingsRes.ok && modelsRes.ok) {
          const settingsData = await settingsRes.json();
          const modelsData = await modelsRes.json();
          
          setModels(modelsData);
          setLocalModel(settingsData.active_local_model);
          setRemoteModel(settingsData.active_remote_model);
          setThreshold(settingsData.default_threshold);
          if (settingsData.compute_backend) {
            setComputeBackend(settingsData.compute_backend);
          }
        }
      } catch (e) {
        console.error("Failed to load backend configurations", e);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (filename: string, text: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${filename}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setLoading(true);

    const userMsgId = `u-${Date.now()}`;
    const assistantMsgId = `a-${Date.now()}`;

    // 1. Add User Message
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: userText
    };

    // 2. Add empty Assistant Message to be filled
    const assistantMsg: Message = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      isStreaming: true
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userText,
          local_model: localModel,
          remote_model: remoteModel,
          threshold: threshold
        })
      });

      if (!response.ok) throw new Error("Server returned HTTP error.");
      if (!response.body) throw new Error("ReadableStream is not supported.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let textBuffer = "";
      let metadata: any = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // Parse SSE formatted chunks
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);
              
              if (data.event === "routing") {
                metadata.route = data.route;
                metadata.reason = data.reason;
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, ...metadata } : m));
              } 
              else if (data.event === "escalation") {
                metadata.route = "LOCAL -> ESCALATED TO REMOTE";
                metadata.reason = data.reason;
                metadata.draft = data.draft;
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, ...metadata } : m));
              }
              else if (data.event === "content") {
                textBuffer += data.text;
                setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: textBuffer } : m));
              }
              else if (data.event === "done") {
                metadata.latency_ms = data.latency_ms;
                metadata.prompt_tokens = data.prompt_tokens;
                metadata.completion_tokens = data.completion_tokens;
                metadata.cost = data.estimated_cost;
                metadata.confidence = data.confidence_score;
                metadata.route = data.route; // ensure final route override
                
                setMessages(prev => {
                  const updated = prev.map(m => m.id === assistantMsgId ? { ...m, ...metadata, isStreaming: false } : m);
                  // Update selected message to display in the inspector sidebar on completion
                  const completeMsg = updated.find(m => m.id === assistantMsgId);
                  if (completeMsg) {
                    setSelectedMessage(completeMsg);
                  }
                  return updated;
                });
              }
            } catch (e) {
              // Parse error or partial chunk, continue
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
        ...m, 
        text: `Error contacting backend agent: ${err.message || "Is the FastAPI server running?"}`,
        route: "ERROR",
        isStreaming: false 
      } : m));
    } finally {
      setLoading(false);
    }
  };

  // Simple formatter for custom markdown code blocks
  const renderMessageContent = (text: string) => {
    if (!text) return <p className="text-zinc-500 italic animate-pulse">Thinking...</p>;

    const parts = text.split("```");
    return parts.map((part, i) => {
      // Odd indices are code blocks
      if (i % 2 === 1) {
        // Find language if specified
        const lines = part.split("\n");
        const firstLine = lines[0].trim();
        const code = lines.slice(1).join("\n").trim();
        return (
          <div key={i} className="my-4 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs bg-zinc-950">
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-850 text-zinc-400 flex justify-between items-center">
              <span>{firstLine || "code"}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(code)}
                className="hover:text-white transition flex items-center gap-1 active:scale-95"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-amber-300/90 leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return (
        <div key={i} className="whitespace-pre-wrap leading-relaxed break-words text-sm font-medium">
          {part}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden h-screen">
      {/* Central Chat Wrapper */}
      <div className="flex-1 flex flex-col h-full bg-zinc-900/10">
        {/* Header */}
        <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-white tracking-wide">TriForge Router Session</h2>
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <button 
                onClick={handleClearChat}
                className="bg-zinc-850 hover:bg-red-950/45 hover:text-red-400 border border-zinc-700 hover:border-red-500/20 text-zinc-300 font-semibold text-xs px-3.5 py-2 rounded-lg transition-all duration-200 active:scale-95"
              >
                Clear Chat
              </button>
            )}
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold text-xs px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 active:scale-95"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings Panel
            </button>
          </div>
        </header>

        {/* Settings panel popup overlay */}
        {showOptions && (
          <div className="bg-zinc-900 border-b border-zinc-800 p-5 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-xl">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase">Local Model Override</label>
              <select 
                value={localModel} 
                onChange={(e) => setLocalModel(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
              >
                {models.local.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase">Remote Model Override</label>
              <select 
                value={remoteModel} 
                onChange={(e) => setRemoteModel(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
              >
                {models.remote.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase">Consistency Threshold ({threshold})</label>
              <input 
                type="range" 
                min="0.1" 
                max="1.0" 
                step="0.05" 
                value={threshold} 
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 mt-2.5"
              />
            </div>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-4">
              <Bot className="w-16 h-16 text-zinc-700 stroke-[1.5]" />
              <h3 className="text-xl font-bold text-white tracking-wide">Enter a prompt to route</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Submit coding queries, math riddles, translations, or simple factual questions. The system will categorize, run local consistency checks, and route queries dynamically.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.sender === "user";
              return (
                <div key={msg.id} className={`flex gap-4 max-w-4xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md ${
                    isUser ? "bg-amber-600/20 text-amber-500 border border-amber-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}>
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Bubble content */}
                  <div className={`p-4 rounded-xl flex-1 border ${
                    isUser 
                      ? "bg-amber-500/5 text-amber-100 border-amber-500/20" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-100"
                  }`}>
                    {/* Router path header badge */}
                    {!isUser && msg.route && (
                      <div className="flex items-center justify-between mb-3 border-b border-zinc-850 pb-2">
                        <div className="flex gap-2 items-center">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                            msg.route.includes("ESCALATED") 
                              ? "bg-red-950/40 text-red-400 border-red-500/20 animate-pulse" 
                              : msg.route.includes("REMOTE") 
                                ? "bg-blue-950/40 text-blue-400 border-blue-500/20" 
                                : msg.route.includes("CACHE")
                                  ? "bg-purple-950/40 text-purple-400 border-purple-500/20"
                                  : "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                          }`}>
                            Route: {msg.route}
                          </span>
                          {msg.latency_ms !== undefined && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {msg.latency_ms.toFixed(0)}ms
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2 text-zinc-500">
                          <button 
                            onClick={() => handleCopy(msg.id, msg.text)}
                            className="hover:text-white p-1 rounded hover:bg-zinc-800 transition"
                          >
                            {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => handleDownload(`triforge_response_${msg.id}`, msg.text)}
                            className="hover:text-white p-1 rounded hover:bg-zinc-800 transition"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setSelectedMessage(msg)}
                            className="hover:text-white p-1 rounded hover:bg-zinc-800 transition text-[10px] font-bold border border-zinc-800 px-1.5"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    )}

                    {isUser ? (
                      <div className="text-sm font-semibold whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                    ) : (
                      <>
                        {renderMessageContent(msg.text)}
                        {msg.route && (
                          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-300 font-semibold flex items-center gap-1.5 shadow-sm">
                              <span className={`w-1.5 h-1.5 rounded-full ${msg.route.includes("ESCALATED") ? "bg-red-400" : msg.route.includes("REMOTE") ? "bg-blue-400" : "bg-emerald-400"}`} />
                              Routed to <strong className="text-white uppercase">{msg.route}</strong>
                            </span>
                            <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 font-semibold shadow-sm">
                              confidence <strong className="text-emerald-400">{(msg.confidence ?? 1.0).toFixed(2)}</strong>
                            </span>
                            {msg.intent && (
                              <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 font-semibold shadow-sm">
                                intent: <strong className="text-amber-400">{msg.intent}</strong>
                              </span>
                            )}
                            <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 font-semibold flex items-center gap-1 shadow-sm">
                              <Cpu className="w-3 h-3 text-zinc-500" />
                              <strong className="text-zinc-300">{msg.compute_backend || computeBackend}</strong>
                            </span>
                            {msg.reason && (
                              <span className="text-zinc-400 truncate max-w-md italic bg-zinc-950/60 px-2.5 py-0.5 rounded border border-zinc-850 shadow-sm cursor-help hover:text-zinc-200 transition" title={msg.reason}>
                                {msg.reason}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          
          {loading && (
            <div className="flex gap-4 p-4 rounded-xl bg-zinc-900/60 border border-amber-500/30 max-w-3xl animate-pulse shadow-lg shadow-amber-500/5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-amber-400 animate-spin" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-400 tracking-wide">TriForge Router Engine</span>
                  <span className="text-[10px] text-zinc-400 bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Analyzing intent & sampling models...
                  </span>
                </div>
                <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
                <div className="h-3 bg-zinc-800/60 rounded w-1/2"></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-zinc-950/40">
          <div className="max-w-4xl mx-auto flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder={loading ? "Routing prompt in progress..." : "Ask a query (e.g. Write a python binary search algorithm)..."}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold rounded-xl px-5 flex items-center justify-center transition active:scale-95 shadow-md shadow-amber-500/10"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Inspector Sidebar (Right Panel) */}
      {selectedMessage && (
        <div className="w-80 bg-zinc-950 border-l border-zinc-800 p-6 overflow-y-auto space-y-6 flex flex-col h-full animate-slide-in">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-white text-sm">Router Inspector</h3>
            </div>
            <button 
              onClick={() => setSelectedMessage(null)}
              className="text-zinc-500 hover:text-white text-xs font-semibold px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            {/* Route Taken */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Final Route</span>
              <div className="mt-1.5 text-xs bg-zinc-900 p-3 rounded-lg border border-zinc-850 font-extrabold text-white flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  selectedMessage.route?.includes("ESCALATED") 
                    ? "bg-red-400" 
                    : selectedMessage.route?.includes("REMOTE") 
                      ? "bg-blue-400" 
                      : "bg-emerald-400"
                }`} />
                {selectedMessage.route}
              </div>
            </div>

            {/* Explanation Reason */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Routing Explanation</span>
              <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed bg-zinc-900/50 p-3 border border-zinc-900 rounded-lg">
                {selectedMessage.reason}
              </p>
            </div>

            {/* Performance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 p-3 border border-zinc-850 rounded-lg">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Latency</span>
                <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  {selectedMessage.latency_ms?.toFixed(0)} ms
                </p>
              </div>

              <div className="bg-zinc-900 p-3 border border-zinc-850 rounded-lg">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Est. Cost</span>
                <p className="text-sm font-extrabold text-emerald-400 mt-1 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-emerald-500" />
                  ${selectedMessage.cost?.toFixed(5)}
                </p>
              </div>
            </div>

            {/* Token Counts */}
            <div className="bg-zinc-900 p-3 border border-zinc-850 rounded-lg grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Prompt Tok</span>
                <p className="text-sm font-extrabold text-white mt-0.5">{selectedMessage.prompt_tokens}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Completion Tok</span>
                <p className="text-sm font-extrabold text-white mt-0.5">{selectedMessage.completion_tokens}</p>
              </div>
            </div>

            {/* Confidence Score */}
            {selectedMessage.confidence !== undefined && (
              <div className="bg-zinc-900 p-3 border border-zinc-850 rounded-lg flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Consistency Match</span>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${
                  selectedMessage.confidence >= 0.8 ? "text-emerald-400 bg-emerald-950/20" : "text-amber-400 bg-amber-950/20"
                }`}>
                  {(selectedMessage.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}

            {/* Draft Inspection */}
            {selectedMessage.draft && (
              <div className="border border-zinc-850/60 rounded-lg overflow-hidden">
                <div className="bg-zinc-900 px-3 py-1.5 border-b border-zinc-850 text-[10px] font-bold text-zinc-400 flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-amber-500" />
                  Local Model Draft
                </div>
                <pre className="p-3 bg-zinc-950 font-mono text-[9px] text-zinc-500 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                  {selectedMessage.draft}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
