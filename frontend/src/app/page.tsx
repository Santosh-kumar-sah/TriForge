"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Zap, 
  Cpu, 
  ShieldCheck, 
  ArrowRight, 
  Layers, 
  BarChart3, 
  Terminal, 
  Activity, 
  Copy, 
  Check, 
  Code2, 
  Sparkles, 
  ChevronRight, 
  LogOut, 
  Play, 
  RefreshCw,
  Lock
} from "lucide-react";
import FormattedMessage from "@/components/FormattedMessage";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/api";

const DEMO_PRESETS = [
  {
    id: "edge_algo",
    label: "Edge Algorithm (Local)",
    prompt: "Write a high-performance Python binary search function with O(log n) complexity."
  },
  {
    id: "cloud_arch",
    label: "Complex Architecture (Cloud)",
    prompt: "Architect a resilient multi-region database replication strategy resolving the CAP theorem partition tolerance."
  },
  {
    id: "quick_expl",
    label: "Quick Explanation (Local)",
    prompt: "Explain the difference between best-case and worst-case time complexity of QuickSort."
  }
];

export default function LandingPage() {
  const { user, isAuthenticated, logout, openAuthModal, authHeaders } = useAuth();
  const router = useRouter();
  
  const [activeCodeTab, setActiveCodeTab] = useState<"python" | "typescript" | "curl">("python");
  const [copied, setCopied] = useState(false);

  // Live Interactive Routing State
  const [selectedPrompt, setSelectedPrompt] = useState(DEMO_PRESETS[0].prompt);
  const [isExecuting, setIsExecuting] = useState(false);
  const [streamOutput, setStreamOutput] = useState("");
  const [executionResult, setExecutionResult] = useState<{
    route: string;
    latency_ms: number;
    cost: number;
    confidence: number;
    reason: string;
  } | null>(null);

  // System Stats
  const [systemStats, setSystemStats] = useState({
    compute_backend: "Edge NPU / CPU",
    ping_ms: 12,
    total_requests: 1240,
    cost_savings: "88.4%",
    active_local_model: "qwen2.5:3b-instruct",
    active_remote_model: "llama-3.1-70b-instruct"
  });

  useEffect(() => {
    const fetchStats = async () => {
      const startPing = performance.now();
      try {
        const [settingsRes, analyticsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/settings`).catch(() => null),
          fetch(`${API_BASE_URL}/api/analytics`).catch(() => null)
        ]);
        const ping = Math.round(performance.now() - startPing);

        let backend = "Edge NPU / CPU";
        let localMod = "qwen2.5:3b-instruct";
        let remoteMod = "llama-3.1-70b-instruct";
        let totalReqs = 1240;

        if (settingsRes?.ok) {
          const s = await settingsRes.json();
          backend = s.compute_backend || backend;
          localMod = s.active_local_model || localMod;
          remoteMod = s.active_remote_model || remoteMod;
        }

        if (analyticsRes?.ok) {
          const a = await analyticsRes.json();
          totalReqs = a.total_requests || totalReqs;
        }

        setSystemStats({
          compute_backend: backend,
          ping_ms: ping > 0 ? ping : 12,
          total_requests: totalReqs,
          cost_savings: "88.4%",
          active_local_model: localMod,
          active_remote_model: remoteMod
        });
      } catch {
        // Fallback defaults
      }
    };
    fetchStats();
  }, []);

  const handleExecutePrompt = async (queryToRun?: string) => {
    const query = (queryToRun || selectedPrompt).trim();
    if (!query || isExecuting) return;

    setIsExecuting(true);
    setStreamOutput("");
    setExecutionResult(null);

    const startTime = performance.now();

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          prompt: query,
          user_email: user?.email,
          user_id: user?.id
        })
      });

      if (!response.ok) {
        throw new Error("Unable to reach TriForge routing server.");
      }

      if (!response.body) throw new Error("Stream response unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let textAccumulator = "";
      let currentRoute = "LOCAL (Edge Fast-Path)";
      let currentReason = "Direct local execution for optimal speed and zero token cost.";
      let confidenceScore = 0.95;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.event === "routing") {
              currentRoute = data.route || currentRoute;
              currentReason = data.reason || currentReason;
            } else if (data.event === "escalation") {
              currentRoute = "ESCALATED TO CLOUD (70B Verify-Draft)";
              currentReason = data.reason || currentReason;
            } else if (data.event === "content") {
              textAccumulator += data.text || "";
              setStreamOutput(textAccumulator);
            } else if (data.event === "done") {
              const elapsed = Math.round(performance.now() - startTime);
              confidenceScore = data.confidence_score ?? confidenceScore;
              setExecutionResult({
                route: data.route || currentRoute,
                latency_ms: data.latency_ms ? Math.round(data.latency_ms) : elapsed,
                cost: data.estimated_cost || 0,
                confidence: confidenceScore,
                reason: currentReason
              });
            }
          } catch {
            // Ignore parse errors on raw tokens
          }
        }
      }

      if (!executionResult) {
        const elapsed = Math.round(performance.now() - startTime);
        setExecutionResult({
          route: currentRoute,
          latency_ms: elapsed,
          cost: currentRoute.includes("CLOUD") ? 0.00012 : 0,
          confidence: confidenceScore,
          reason: currentReason
        });
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setStreamOutput(`[Notice] ${err.message || "Failed to execute routing."}`);
      setExecutionResult({
        route: "LOCAL (Fallback)",
        latency_ms: elapsed,
        cost: 0,
        confidence: 0,
        reason: "Offline fallback mode."
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleProtectedAction = (targetUrl: string) => {
    if (isAuthenticated) {
      router.push(targetUrl);
    } else {
      openAuthModal("login", targetUrl);
    }
  };

  const copySnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeSnippets = {
    python: `from triforge import RouterClient

# Initialize TriForge hybrid client
client = RouterClient(api_base="${API_BASE_URL}")

# Automatically routes locally ($0.00) or escalates to cloud
response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Explain binary search complexity"}],
    stream=True
)

for chunk in response:
    print(chunk.delta, end="")`,

    typescript: `import { TriForgeRouter } from "@triforge/sdk";

const router = new TriForgeRouter({
  endpoint: "${API_BASE_URL}",
  strategy: "adaptive_confidence"
});

const result = await router.routeAndExecute({
  prompt: "Optimize high-throughput PostgreSQL index"
});

console.log(\`Routed to: \${result.route} in \${result.latencyMs}ms\`);
console.log(result.text);`,

    curl: `curl -X POST ${API_BASE_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a resilient retry function in TypeScript",
    "threshold": 0.80
  }'`
  };

  return (
    <div className="relative min-h-screen bg-[#07080a] text-zinc-100 selection:bg-amber-500/25 selection:text-amber-200 antialiased overflow-x-hidden">
      
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/[0.08] via-orange-500/[0.03] to-transparent rounded-full blur-[120px]" />
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-blue-500/[0.02] rounded-full blur-[140px]" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 w-full px-6 py-4 backdrop-blur-xl bg-[#07080a]/80 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white group-hover:text-amber-400 transition-colors">
                TriForge
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                ROUTER
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#demo" className="hover:text-white transition-colors">Live Demo</a>
            <a href="#benchmarks" className="hover:text-white transition-colors">Performance</a>
            <a href="#code" className="hover:text-white transition-colors">Integration</a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-bold text-black">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span>Dashboard</span>
                </Link>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => openAuthModal("login")}
                  className="px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal("register")}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-white text-xs font-semibold shadow-md shadow-amber-500/20 transition-all"
                >
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-6 max-w-5xl mx-auto flex flex-col items-center text-center z-10">
        
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium mb-6 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Next-Gen Hybrid LLM Router</span>
          <span className="text-zinc-600">|</span>
          <span className="text-emerald-400 font-mono font-medium">85%+ Cost Cut</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.15] mb-6">
          Intelligent Edge &amp; Cloud{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-red-400">
            LLM Routing.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed mb-8">
          Execute queries locally on edge hardware for <strong className="text-white font-medium">$0.00</strong> and instant speed. Automatically escalate complex reasoning to verified cloud models.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
          <button
            onClick={() => handleProtectedAction("/chat")}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 active:scale-[0.98] text-white font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Launch Chat Router</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleProtectedAction("/dashboard")}
            className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-sm transition-all"
          >
            Open Dashboard
          </button>
        </div>

        {/* ======================================================== */}
        {/* INTERACTIVE LIVE ROUTING DEMO CARD (CLEAN & ELEGANT) */}
        {/* ======================================================== */}
        <div id="demo" className="w-full max-w-4xl text-left scroll-mt-24">
          <div className="rounded-2xl bg-[#0b0d12] border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-xl">
            
            {/* Demo Header Bar */}
            <div className="px-5 py-3 bg-zinc-950/80 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-400">Live Router Playground</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                <span>Backend:</span>
                <span className="text-emerald-400 font-medium">{systemStats.compute_backend}</span>
              </div>
            </div>

            {/* Quick Sample Prompts */}
            <div className="px-5 py-3 bg-zinc-950/40 border-b border-white/[0.04] flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500 mr-1">Try example:</span>
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setSelectedPrompt(preset.prompt);
                    handleExecutePrompt(preset.prompt);
                  }}
                  disabled={isExecuting}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedPrompt}
                  onChange={(e) => setSelectedPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isExecuting && handleExecutePrompt()}
                  placeholder="Enter a prompt to see instant intelligent routing..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 font-sans"
                />
                <button
                  onClick={() => handleExecutePrompt()}
                  disabled={isExecuting}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isExecuting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{isExecuting ? "Routing..." : "Run Test"}</span>
                </button>
              </div>

              {/* Execution Output Box */}
              {(streamOutput || isExecuting || executionResult) && (
                <div className="mt-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
                  
                  {/* Status & Telemetry Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-900 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">Route Assigned:</span>
                      <span className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                        executionResult?.route?.includes("CLOUD") || executionResult?.route?.includes("ESCALATED")
                          ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {executionResult?.route || (isExecuting ? "Evaluating complexity..." : "Resolved")}
                      </span>
                    </div>

                    {executionResult && (
                      <div className="flex items-center gap-4 text-zinc-400 font-mono text-[11px]">
                        <span>Latency: <strong className="text-cyan-400">{executionResult.latency_ms}ms</strong></span>
                        <span>Cost: <strong className="text-emerald-400">${executionResult.cost.toFixed(6)}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Stream Content */}
                  <div className="text-xs font-mono text-zinc-200 max-h-56 overflow-y-auto pr-1 leading-relaxed">
                    {streamOutput ? (
                      <FormattedMessage content={streamOutput} isStreaming={isExecuting} />
                    ) : (
                      <span className="text-zinc-500 italic">Connecting to model stream...</span>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </section>

      {/* ======================================================== */}
      {/* 3 CORE VALUE PILLARS (CLEAN & MINIMAL) */}
      {/* ======================================================== */}
      <section id="features" className="py-20 px-6 max-w-5xl mx-auto border-t border-white/[0.06]">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Designed for Speed, Privacy, and Efficiency
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Intelligent architecture that eliminates wasted cloud token spend.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-zinc-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Zero-Cost Edge Fast-Path</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Standard tasks execute directly on local NPUs and CPUs for $0.00 with sub-second response times and complete privacy.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-zinc-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Confidence Escalation</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Multi-sample consistency probes evaluate query entropy in real time, automatically escalating difficult prompts to 70B cloud models.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-zinc-950/60 border border-white/[0.06] hover:border-zinc-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Multi-Provider Failover</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Automated fallback across Groq, Fireworks, OpenAI, and Anthropic ensures zero downtime and resilient uptime.
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* KEY METRICS SNAPSHOT */}
      {/* ======================================================== */}
      <section id="benchmarks" className="py-16 px-6 max-w-5xl mx-auto border-t border-white/[0.06]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-zinc-950/40 border border-white/[0.04] text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">85%+</div>
            <div className="text-xs text-zinc-400 mt-1">Cost Reduction</div>
          </div>
          <div className="p-5 rounded-xl bg-zinc-950/40 border border-white/[0.04] text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400 tracking-tight">&lt; 15ms</div>
            <div className="text-xs text-zinc-400 mt-1">Local Response</div>
          </div>
          <div className="p-5 rounded-xl bg-zinc-950/40 border border-white/[0.04] text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">$0.00</div>
            <div className="text-xs text-zinc-400 mt-1">Edge Token Cost</div>
          </div>
          <div className="p-5 rounded-xl bg-zinc-950/40 border border-white/[0.04] text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 tracking-tight">99.9%</div>
            <div className="text-xs text-zinc-400 mt-1">Provider Uptime</div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* QUICK INTEGRATION CODE TABS */}
      {/* ======================================================== */}
      <section id="code" className="py-20 px-6 max-w-4xl mx-auto border-t border-white/[0.06]">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Drop-in Integration
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
            Compatible with OpenAI SDKs and LangChain pipelines in seconds.
          </p>
        </div>

        <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-xl">
          {/* Header */}
          <div className="px-4 py-2.5 bg-[#0e1117] border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(["python", "typescript", "curl"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveCodeTab(tab)}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    activeCodeTab === tab
                      ? "bg-zinc-800 text-amber-400 font-semibold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => copySnippet(codeSnippets[activeCodeTab])}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          {/* Code */}
          <div className="p-5 font-mono text-xs text-zinc-300 overflow-x-auto bg-[#07090d]">
            <pre className="whitespace-pre">{codeSnippets[activeCodeTab]}</pre>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* BOTTOM CALL TO ACTION */}
      {/* ======================================================== */}
      <section className="py-16 px-6 max-w-4xl mx-auto text-center">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-amber-500/[0.08] to-transparent border border-amber-500/20">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
            Start Optimizing LLM Workloads Today
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto mb-6">
            Get instant local inference speeds with automatic intelligent cloud escalation.
          </p>
          <button
            onClick={() => handleProtectedAction("/chat")}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-white font-semibold text-xs shadow-md shadow-amber-500/20 transition-all"
          >
            Launch Free Playground
          </button>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-white/[0.06] py-8 px-6 text-xs text-zinc-500 font-mono">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-zinc-400 font-medium">TriForge AI Systems</span>
          </div>
          <div className="flex items-center gap-5 text-zinc-400">
            <button onClick={() => handleProtectedAction("/chat")} className="hover:text-white transition-colors">Chat</button>
            <button onClick={() => handleProtectedAction("/dashboard")} className="hover:text-white transition-colors">Dashboard</button>
            <button onClick={() => handleProtectedAction("/benchmarks")} className="hover:text-white transition-colors">Benchmarks</button>
            <button onClick={() => handleProtectedAction("/settings")} className="hover:text-white transition-colors">Settings</button>
          </div>
          <div className="text-zinc-600 text-[11px]">
            &copy; 2026 TriForge Systems.
          </div>
        </div>
      </footer>

    </div>
  );
}
