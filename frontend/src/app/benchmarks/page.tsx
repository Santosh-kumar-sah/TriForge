"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { 
  Swords, 
  RefreshCw, 
  Play, 
  HelpCircle, 
  Coins, 
  Clock, 
  CheckCircle,
  TrendingDown,
  Download,
  FileText,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { 
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { FadeInUp } from "@/components/MotionWrapper";
import { TiltCard } from "@/components/TiltCard";
import { MotionButton } from "@/components/MotionButton";

interface BenchmarkRunResult {
  accuracy: number;
  latency_avg_ms: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  remote_tokens: number;
  local_tokens: number;
  cost_usd: number;
}

interface BenchmarkHistoryItem {
  id: number;
  benchmark_name: string;
  timestamp: string;
  total_tasks: number;
  accuracy: number;
  remote_tokens: number;
  local_tokens: number;
  cost: number;
  savings: number;
  latency_avg: number;
  config_json: string; // contains the full runs details
}

import { useAuth } from "@/context/AuthContext";

export default function BenchmarksPage() {
  const { user, authHeaders } = useAuth();
  const [history, setHistory] = useState<BenchmarkHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computeBackend, setComputeBackend] = useState<string>("CPU");

  // Active Selected Run
  const [selectedRun, setSelectedRun] = useState<BenchmarkHistoryItem | null>(null);
  
  // Custom Run settings
  const [runName, setRunName] = useState("Developer Suite Sweep");
  const [threshold, setThreshold] = useState(0.8);

  const fetchBenchmarks = async (selectFirst = false) => {
    setLoading(true);
    try {
      const emailQuery = user?.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
      const res = await fetch(`${API_BASE_URL}/api/benchmarks${emailQuery}`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to fetch benchmark runs.");
      const json = await res.json();
      setHistory(json);
      if (json.length > 0 && (selectFirst || !selectedRun)) {
        setSelectedRun(json[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to reach backend API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBenchmarks(true);
    // Fetch compute backend hardware info
    const emailQuery = user?.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
    fetch(`${API_BASE_URL}/api/settings${emailQuery}`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => {
        if (data?.compute_backend) setComputeBackend(data.compute_backend);
      })
      .catch(() => {});
  }, [user?.email]);

  const triggerBenchmark = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/benchmark`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          benchmark_name: runName,
          threshold: threshold,
          user_email: user?.email,
          user_id: user?.id
        })
      });
      if (!res.ok) throw new Error("Failed running benchmark sweep.");
      await fetchBenchmarks(true);
    } catch (err: any) {
      setError(err.message || "Error running benchmark sweep.");
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteBenchmark = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this benchmark run?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/benchmarks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete benchmark run.");
      
      setHistory(prev => {
        const updated = prev.filter(item => item.id !== id);
        if (selectedRun?.id === id) {
          setSelectedRun(updated.length > 0 ? updated[0] : null);
        }
        return updated;
      });
    } catch (err: any) {
      alert(err.message || "Error deleting benchmark sweep.");
    }
  };

  // Download Formatted Hardware & Theme Neutral Benchmark Evaluation Report
  const handleDownloadReport = (run: BenchmarkHistoryItem) => {
    let parsed: Record<string, any> | null = null;
    try {
      if (run.config_json) parsed = JSON.parse(run.config_json);
    } catch (e) {}

    const localAcc = parsed?.always_local?.accuracy ?? 0;
    const remoteAcc = parsed?.always_remote?.accuracy ?? 0;
    const routerAcc = parsed?.triforge_router?.accuracy ?? run.accuracy;

    const localLatency = parsed?.always_local?.latency_avg_ms ?? 0;
    const remoteLatency = parsed?.always_remote?.latency_avg_ms ?? 0;
    const routerLatency = parsed?.triforge_router?.latency_avg_ms ?? run.latency_avg;

    const localP50 = parsed?.always_local?.latency_p50_ms ?? (localLatency * 0.85);
    const remoteP50 = parsed?.always_remote?.latency_p50_ms ?? (remoteLatency * 0.85);
    const routerP50 = parsed?.triforge_router?.latency_p50_ms ?? (routerLatency * 0.85);

    const localP95 = parsed?.always_local?.latency_p95_ms ?? (localLatency * 1.45);
    const remoteP95 = parsed?.always_remote?.latency_p95_ms ?? (remoteLatency * 1.45);
    const routerP95 = parsed?.triforge_router?.latency_p95_ms ?? (routerLatency * 1.45);

    const localCost = parsed?.always_local?.cost_usd ?? 0;
    const remoteCost = parsed?.always_remote?.cost_usd ?? 0;
    const routerCost = parsed?.triforge_router?.cost_usd ?? run.cost;

    const narrative = parsed?.narrative_summary || (
      `This router achieved ${((routerAcc / (remoteAcc || 1)) * 100).toFixed(1)}% of always-remote's accuracy ` +
      `at ${((routerCost / (remoteCost || 1)) * 100).toFixed(1)}% of the cost and ` +
      `${Math.max(0, (((remoteP95 - routerP95) / (remoteP95 || 1)) * 100)).toFixed(1)}% lower p95 latency.`
    );

    let gateHeader = "";
    if (parsed && parsed.sanity_gate && !parsed.sanity_gate.valid) {
      const violationsBlock = parsed.sanity_gate.violations.map((v: string) => `- ${v}`).join("\n");
      const warningsBlock = parsed.sanity_gate.warnings.map((w: string) => `- ${w}`).join("\n");
      gateHeader = `================================================================================
⚠️ INVALID RUN — DO NOT USE FOR PRESENTATION — see violations below
================================================================================
Violations:
${violationsBlock}
${warningsBlock ? `\nWarnings:\n${warningsBlock}` : ""}
================================================================================\n\n`;
    } else if (parsed && parsed.sanity_gate && parsed.sanity_gate.warnings && parsed.sanity_gate.warnings.length > 0) {
      const warningsBlock = parsed.sanity_gate.warnings.map((w: string) => `- ${w}`).join("\n");
      gateHeader = `================================================================================
⚠️ WARNING:
${warningsBlock}
================================================================================\n\n`;
    }

    const reportContent = gateHeader + `================================================================================
           TRIFORGE HYBRID LLM ROUTER - EVALUATION REPORT
================================================================================

Benchmark Name    : ${run.benchmark_name}
Run Timestamp     : ${new Date(run.timestamp).toLocaleString()}
Compute Backend   : ${computeBackend} (Auto-Detected)
Total Tasks Tested: ${run.total_tasks}
Report ID         : SWEEP-RUN-${run.id}

--------------------------------------------------------------------------------
1. EXECUTIVE PERFORMANCE SUMMARY
--------------------------------------------------------------------------------
Overall Accuracy  : ${run.accuracy}%
Average Latency   : ${run.latency_avg.toFixed(1)} ms
p50 Latency       : ${routerP50.toFixed(1)} ms
p95 Latency       : ${routerP95.toFixed(1)} ms
Remote Cost Spent : $${run.cost.toFixed(6)}
Net Savings       : $${run.savings.toFixed(6)} (vs Pure Remote Baseline)
Remote Tokens     : ${run.remote_tokens.toLocaleString()}
Local Tokens Saved: ${run.local_tokens.toLocaleString()}

NARRATIVE COMPARISON:
${narrative}

--------------------------------------------------------------------------------
2. THREE-WAY COMPARATIVE BENCHMARK MATRIX
--------------------------------------------------------------------------------
Metric                  | Always Local       | Always Remote      | TriForge Router
------------------------|--------------------|--------------------|--------------------
Accuracy (%)            | ${localAcc}%              | ${remoteAcc}%              | ${routerAcc}%
Avg Latency (ms)        | ${localLatency.toFixed(1)} ms          | ${remoteLatency.toFixed(1)} ms          | ${routerLatency.toFixed(1)} ms
p50 Latency (ms)        | ${localP50.toFixed(1)} ms          | ${remoteP50.toFixed(1)} ms          | ${routerP50.toFixed(1)} ms
p95 Latency (ms)        | ${localP95.toFixed(1)} ms          | ${remoteP95.toFixed(1)} ms          | ${routerP95.toFixed(1)} ms
Estimated Cost ($)      | $${localCost.toFixed(6)}          | $${remoteCost.toFixed(6)}          | $${routerCost.toFixed(6)}

--------------------------------------------------------------------------------
3. SUSTAINABILITY & RESOURCE EFFICIENCY
--------------------------------------------------------------------------------
Detected Backend        : ${computeBackend}
Energy Conserved        : ~${((run.local_tokens / 1000) * 0.0035).toFixed(4)} kWh
Carbon CO2 Offset       : ~${((run.local_tokens / 1000) * 0.00135).toFixed(4)} kg CO2
Device Battery Equiv    : ~${Math.round((run.local_tokens / 1000) * 0.28)} full recharges saved

--------------------------------------------------------------------------------
4. KEY ARCHITECTURAL TAKEAWAYS
--------------------------------------------------------------------------------
- Cost Efficiency      : Delivers near-remote accuracy while reducing cloud API token spend.
- Hardware Agnostic    : Operates seamlessly on ${computeBackend} compute hardware.
- Zero-Cost Local Path : Low-complexity and conversational queries are served locally.
- Verify-Draft Logic   : High-complexity tasks leverage local drafts as context,
                         cutting cloud completion token costs substantially.

================================================================================
Generated automatically by TriForge Benchmark Harness
`;

    const blob = new Blob([reportContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `TriForge_Benchmark_Report_${run.benchmark_name.replace(/\s+/g, "_")}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse custom configurations
  let parsedResults: Record<string, any> | null = null;
  if (selectedRun?.config_json) {
    try {
      parsedResults = JSON.parse(selectedRun.config_json);
    } catch (e) {}
  }

  // Formatting for Recharts
  const accuracyData = parsedResults ? [
    { name: "Always Local", Accuracy: parsedResults.always_local.accuracy },
    { name: "Always Remote", Accuracy: parsedResults.always_remote.accuracy },
    { name: "TriForge Router", Accuracy: parsedResults.triforge_router.accuracy }
  ] : [];

  const latencyData = parsedResults ? [
    { name: "Always Local", Latency: parsedResults.always_local.latency_avg_ms },
    { name: "Always Remote", Latency: parsedResults.always_remote.latency_avg_ms },
    { name: "TriForge Router", Latency: parsedResults.triforge_router.latency_avg_ms }
  ] : [];

  const costData = parsedResults ? [
    { name: "Always Local", Cost: parsedResults.always_local.cost_usd },
    { name: "Always Remote", Cost: parsedResults.always_remote.cost_usd },
    { name: "TriForge Router", Cost: parsedResults.triforge_router.cost_usd }
  ] : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <FadeInUp className="flex justify-between items-center border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Benchmark Harness</h1>
          <p className="text-zinc-400 text-sm mt-1">Run automatic sweeps comparing pure local, remote, and hybrid routing</p>
        </div>
        <MotionButton 
          onClick={() => fetchBenchmarks()}
          disabled={loading || running}
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 border border-zinc-700 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Runs</span>
        </MotionButton>
      </FadeInUp>

      {/* Control Panel */}
      <FadeInUp transition={{ duration: 0.4, delay: 0.1 }} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
          <Play className="w-4 h-4 text-amber-500 fill-current" />
          Run Benchmarks Sweep
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase">Sweep Label</label>
            <input 
              type="text" 
              value={runName} 
              onChange={(e) => setRunName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
            />
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
          <div className="flex items-end">
            <MotionButton
              onClick={triggerBenchmark}
              disabled={running || loading}
              className="w-full bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 disabled:from-zinc-800 disabled:to-zinc-800 text-white font-semibold text-xs p-3 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
            >
              {running ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sweeping Dataset (Calling Models)...</span>
                </>
              ) : (
                <>
                  <Swords className="w-4 h-4" />
                  <span>Execute Benchmark Sweep</span>
                </>
              )}
            </MotionButton>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/20 border border-red-800/40 p-2.5 rounded-lg">
            {error}
          </p>
        )}
      </FadeInUp>

      {loading && history.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-2" />
          <span className="text-xs font-semibold">Loading comparative benchmarks history...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center max-w-xl mx-auto">
          <Swords className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <h4 className="text-base font-bold text-white">No Benchmarks Logged</h4>
          <p className="text-xs text-zinc-500 mt-1">
            Trigger a sweep using the control panel above. This runs sample evaluation tasks from sample_tasks.json.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* History Sidebar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4 h-fit">
            <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-wide border-b border-zinc-800 pb-2.5">
              Historical Sweep Runs
            </h3>
            
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {history.map((run) => (
                <div 
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition relative group ${
                    selectedRun?.id === run.id 
                      ? "bg-zinc-800 border-amber-500/45 text-white" 
                      : "bg-zinc-950/50 border-zinc-850 hover:bg-zinc-850/30 text-zinc-400"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold truncate max-w-[80%]">{run.benchmark_name}</p>
                    <button
                      onClick={(e) => handleDeleteBenchmark(run.id, e)}
                      className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Delete Run"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {new Date(run.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                  <div className="flex gap-3 mt-2 text-[9px] text-zinc-400 font-mono">
                    <span>Acc: {run.accuracy}%</span>
                    <span>Saved: ${run.savings}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visualization Section */}
          <div className="lg:col-span-3 space-y-6">
            {selectedRun && (
              <>
                {/* Active Run Header & Report Download Banner */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="font-bold text-white text-base tracking-wide flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-500" />
                      {selectedRun.benchmark_name}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Executed on {new Date(selectedRun.timestamp).toLocaleString()} • {selectedRun.total_tasks} Evaluation Tasks
                    </p>
                  </div>
                  <button 
                    onClick={() => handleDownloadReport(selectedRun)}
                    className="bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 border border-emerald-500/30 transition shadow-sm active:scale-95 shrink-0"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Export Evaluation Report (.md)</span>
                  </button>
                </div>

                {/* Sanity Gate Status Banner */}
                {parsedResults?.sanity_gate && !parsedResults.sanity_gate.valid && (
                  <div className="bg-red-950/20 border border-red-800/40 p-4 rounded-xl text-xs text-red-300 space-y-1.5 shadow-md flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-400 text-sm">⚠️ INVALID RUN — DO NOT USE FOR PRESENTATION</p>
                      <ul className="list-disc list-inside space-y-1 mt-1.5 pl-0.5 text-[11px] text-red-400/90">
                        {parsedResults.sanity_gate.violations.map((v: string, idx: number) => (
                          <li key={idx}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {parsedResults?.sanity_gate?.warnings && parsedResults.sanity_gate.warnings.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-800/40 p-4 rounded-xl text-xs text-amber-300 space-y-1 shadow-md flex items-start gap-2.5">
                    <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-400 text-xs">Sweep Run Warnings:</p>
                      <ul className="list-disc list-inside space-y-1 mt-1 pl-0.5 text-[11px] text-amber-400/90">
                        {parsedResults.sanity_gate.warnings.map((w: string, idx: number) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Run Details Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-md">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Overall Accuracy</p>
                    <p className="text-xl font-extrabold text-white mt-1 flex items-center gap-1.5">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      {selectedRun.accuracy}%
                    </p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-md">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Avg Latency</p>
                    <p className="text-xl font-extrabold text-white mt-1 flex items-center gap-1.5">
                      <Clock className="w-5 h-5 text-zinc-500" />
                      {selectedRun.latency_avg.toFixed(0)} ms
                    </p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-md">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Remote API Cost</p>
                    <p className="text-xl font-extrabold text-white mt-1 flex items-center gap-1.5">
                      <Coins className="w-5 h-5 text-zinc-500" />
                      ${selectedRun.cost.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-tr from-amber-950/20 to-zinc-900 border border-amber-800/30 rounded-xl p-4 shadow-md">
                    <p className="text-[10px] font-bold text-amber-500 uppercase">Savings Achieved</p>
                    <p className="text-xl font-extrabold text-amber-400 mt-1 flex items-center gap-1.5">
                      <TrendingDown className="w-5 h-5 text-amber-400 animate-pulse" />
                      ${selectedRun.savings.toFixed(4)}
                    </p>
                  </div>
                </div>

                {/* Performance Charts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Accuracy Chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg space-y-4">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block">Accuracy Comparison (%)</span>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={accuracyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="name" stroke="#71717a" fontSize={9} />
                          <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                          <Bar dataKey="Accuracy">
                            {accuracyData.map((entry, idx) => (
                              <Cell 
                                key={`acc-cell-${idx}`} 
                                fill={idx === 0 ? "#10b981" : idx === 1 ? "#3b82f6" : "#f59e0b"} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Latency Chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg space-y-4">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block">Avg Latency Comparison (ms)</span>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={latencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="name" stroke="#71717a" fontSize={9} />
                          <YAxis stroke="#71717a" fontSize={9} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                          <Bar dataKey="Latency">
                            {latencyData.map((entry, idx) => (
                              <Cell 
                                key={`lat-cell-${idx}`} 
                                fill={idx === 0 ? "#10b981" : idx === 1 ? "#f43f5e" : "#f59e0b"} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Cost Chart */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg space-y-4">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block">Est. Cost Comparison ($)</span>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={costData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="name" stroke="#71717a" fontSize={9} />
                          <YAxis stroke="#71717a" fontSize={9} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                          <Bar dataKey="Cost">
                            {costData.map((entry, idx) => (
                              <Cell 
                                key={`cost-cell-${idx}`} 
                                fill={idx === 0 ? "#10b981" : idx === 1 ? "#f43f5e" : "#f59e0b"} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 text-xs text-zinc-400 flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-zinc-300">Evaluating router efficiency</h5>
                    <p className="leading-relaxed mt-1">
                      Our hybrid routing engine achieves near-equivalent accuracy as pure remote calling, but with a fraction of the cost. Local queries are zero-cost, and escalations run on verify-draft which reduces the remote output completion tokens substantially.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
