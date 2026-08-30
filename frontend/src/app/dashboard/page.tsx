"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { 
  Zap, 
  TrendingUp, 
  Coins, 
  Cpu, 
  Database, 
  Clock, 
  RefreshCw, 
  AlertCircle
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie
} from "recharts";
import HeroParticles from "@/components/HeroParticles";
import { FadeInUp } from "@/components/MotionWrapper";
import { TiltCard } from "@/components/TiltCard";
import { MotionButton } from "@/components/MotionButton";

interface DailyStat {
  date: string;
  requests: number;
  latency_ms: number;
  cost_usd: number;
  savings_usd: number;
}

interface AnalyticsData {
  total_requests: number;
  local_requests: number;
  remote_requests: number;
  escalated_requests: number;
  tokens_spent_remote: number;
  tokens_spent_local: number;
  tokens_saved_local: number;
  estimated_cost_usd: number;
  estimated_savings_usd: number;
  cache_hit_rate: number;
  average_latency_ms: number;
  energy_saved_kwh?: number;
  co2_saved_kg?: number;
  phone_charges_saved?: number;
  daily_stats: DailyStat[];
}

import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const { user, authHeaders } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const emailQuery = user?.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
      const res = await fetch(`${API_BASE_URL}/api/analytics${emailQuery}`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to fetch analytics statistics.");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to reach backend API. Make sure FastAPI server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user?.email]);

  const {
    total_requests = 0,
    local_requests = 0,
    remote_requests = 0,
    escalated_requests = 0,
    tokens_spent_remote = 0,
    tokens_spent_local = 0,
    tokens_saved_local = 0,
    estimated_cost_usd = 0,
    estimated_savings_usd = 0,
    cache_hit_rate = 0,
    average_latency_ms = 0,
    daily_stats = []
  } = data || {};

  // Pie chart data
  const pieData = [
    { name: "Pure Local", value: local_requests - escalated_requests, color: "#10b981" },
    { name: "Pure Remote", value: remote_requests, color: "#3b82f6" },
    { name: "Escalated", value: escalated_requests, color: "#f59e0b" },
  ].filter(item => item.value > 0);

  // If no requests have been logged yet
  const hasData = total_requests > 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 relative overflow-hidden">
      {/* Hero Particle Canvas Layer */}
      <HeroParticles />

      {/* Header */}
      <FadeInUp className="relative z-10 flex justify-between items-center border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Analytics Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">Real-time monitoring of model routing, token usage, and cost efficiency</p>
        </div>
        <MotionButton 
          onClick={fetchAnalytics}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 border border-zinc-700 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Compiling..." : "Refresh Data"}</span>
        </MotionButton>
      </FadeInUp>

      {loading && !data ? (
        <div className="space-y-6 animate-pulse relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 h-32 flex flex-col justify-between">
                <div className="h-3 bg-zinc-800 rounded w-1/2"></div>
                <div className="h-8 bg-zinc-800 rounded w-3/4"></div>
                <div className="h-2 bg-zinc-800/60 rounded w-2/3"></div>
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-44"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-20"></div>
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <FadeInUp className="relative z-10 bg-red-950/20 border border-red-800/80 rounded-xl p-6 flex gap-4 items-start text-red-200">
          <AlertCircle className="w-6 h-6 shrink-0 text-red-500" />
          <div>
            <h3 className="font-bold text-red-400 text-base">Backend Connection Failed</h3>
            <p className="text-sm text-red-300/80 mt-1 leading-relaxed">
              Could not fetch data from the FastAPI server. Please check that your backend service is running locally on port 8000 (e.g. by running uvicorn) or inside the Docker environment.
            </p>
            <p className="text-xs text-red-400/70 mt-3 font-mono">
              Error details: {error}
            </p>
          </div>
        </FadeInUp>
      ) : !hasData ? (
        <FadeInUp className="relative z-10 bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <Zap className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
          <h3 className="text-xl font-bold text-white">No Statistics Found</h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The router logs are currently empty. Head over to the Chat Interface page to submit prompts, or trigger a benchmark sweep to generate database entries.
          </p>
          <a href="/chat">
            <MotionButton className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white font-semibold text-sm px-6 py-3 rounded-lg shadow-lg shadow-amber-500/20">
              Start Chatting
            </MotionButton>
          </a>
        </FadeInUp>
      ) : (
        <div className="space-y-8 relative z-10">
          {/* KPI Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Money Saved */}
            <TiltCard>
              <div className="bg-gradient-to-br from-emerald-950/40 to-zinc-900 border border-emerald-800/30 rounded-xl p-5 shadow-lg relative overflow-hidden group h-full">
                <div className="absolute right-4 top-4 bg-emerald-500/10 text-emerald-400 p-2 rounded-lg border border-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Coins className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">Estimated Savings</p>
                <h3 className="text-3xl font-extrabold text-white mt-2">${estimated_savings_usd.toFixed(4)}</h3>
                <p className="text-xs text-zinc-500 mt-2">Compared to always querying remote</p>
              </div>
            </TiltCard>

            {/* Total Saved Tokens */}
            <TiltCard>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg relative overflow-hidden group h-full">
                <div className="absolute right-4 top-4 bg-zinc-800 text-zinc-400 p-2 rounded-lg border border-zinc-700 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Saved Remote Tokens</p>
                <h3 className="text-3xl font-extrabold text-white mt-2">{tokens_saved_local.toLocaleString()}</h3>
                <p className="text-xs text-zinc-500 mt-2">Zero-cost local & cache resolutions</p>
              </div>
            </TiltCard>

            {/* Token Cost */}
            <TiltCard>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg relative overflow-hidden group h-full">
                <div className="absolute right-4 top-4 bg-zinc-800 text-zinc-400 p-2 rounded-lg border border-zinc-700 group-hover:scale-110 transition-transform">
                  <Cpu className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Estimated Cost</p>
                <h3 className="text-3xl font-extrabold text-white mt-2">${estimated_cost_usd.toFixed(4)}</h3>
                <p className="text-xs text-zinc-500 mt-2">Spent on Fireworks/Remote API</p>
              </div>
            </TiltCard>

            {/* Cache Hits */}
            <TiltCard>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg relative overflow-hidden group h-full">
                <div className="absolute right-4 top-4 bg-zinc-800 text-zinc-400 p-2 rounded-lg border border-zinc-700 group-hover:scale-110 transition-transform">
                  <Database className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cache Hit Rate</p>
                <h3 className="text-3xl font-extrabold text-white mt-2">{cache_hit_rate.toFixed(1)}%</h3>
                <p className="text-xs text-zinc-500 mt-2">Prompt answers loaded instantly</p>
              </div>
            </TiltCard>
          </div>

          {/* Real-Time Eco & Energy Impact Widget */}
          <FadeInUp transition={{ duration: 0.5, delay: 0.2 }}>
            <div className="bg-gradient-to-br from-emerald-950/50 via-zinc-900 to-teal-950/30 border border-emerald-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden group">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/40 pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-lg border border-emerald-500/30">
                    <Zap className="w-5 h-5 text-emerald-400 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base tracking-wide flex items-center gap-2">
                      Real-Time Green AI & Energy Impact
                    </h3>
                    <p className="text-xs text-emerald-400/80 mt-0.5">
                      Local hardware execution footprint vs 300W Cloud Datacenter H100 GPU clusters
                    </p>
                  </div>
                </div>
                <span className="self-start sm:self-auto text-[10px] font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  🌱 Eco-Efficient Execution
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
                <div className="bg-zinc-950/60 border border-emerald-900/40 p-4 rounded-xl relative overflow-hidden">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Carbon Footprint Avoided</p>
                  <h4 className="text-2xl font-extrabold text-emerald-400 mt-1">
                    {(data.co2_saved_kg ?? ((tokens_saved_local / 1000) * 0.00135)).toFixed(3)} <span className="text-sm font-semibold text-zinc-400">kg CO₂</span>
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Grid emissions offset from cloud cooling & data transmission</p>
                </div>

                <div className="bg-zinc-950/60 border border-emerald-900/40 p-4 rounded-xl relative overflow-hidden">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Energy Conserved</p>
                  <h4 className="text-2xl font-extrabold text-white mt-1">
                    {(data.energy_saved_kwh ?? ((tokens_saved_local / 1000) * 0.0035)).toFixed(3)} <span className="text-sm font-semibold text-zinc-400">kWh</span>
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Power saved by local NPU/GPU execution vs cloud GPUs</p>
                </div>

                <div className="bg-zinc-950/60 border border-emerald-900/40 p-4 rounded-xl relative overflow-hidden">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Equivalent Power Offset</p>
                  <h4 className="text-2xl font-extrabold text-amber-400 mt-1">
                    ~{data.phone_charges_saved ?? Math.round(((tokens_saved_local / 1000) * 0.0035) * 80)} <span className="text-sm font-semibold text-zinc-400">Recharges</span>
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Smartphone battery recharges equivalent saved</p>
                </div>
              </div>
            </div>
          </FadeInUp>

          {/* Secondary KPI Stats */}
          <FadeInUp transition={{ duration: 0.5, delay: 0.3 }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-zinc-900/50 border border-zinc-800/80 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">Total Requests</p>
                  <h4 className="text-xl font-bold text-white mt-1">{total_requests}</h4>
                </div>
                <div className="text-xs bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700">
                  Local: {local_requests} | Remote: {remote_requests}
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/80 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">Escalations</p>
                  <h4 className="text-xl font-bold text-white mt-1">{escalated_requests}</h4>
                </div>
                <div className="text-[10px] text-amber-500 bg-amber-950/20 border border-amber-800/30 px-2 py-1 rounded-md">
                  Verify-Draft triggered
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/80 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">Average Latency</p>
                  <h4 className="text-xl font-bold text-white mt-1">{average_latency_ms.toFixed(0)} ms</h4>
                </div>
                <div className="text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">End-to-end</span>
                </div>
              </div>
            </div>
          </FadeInUp>

          {/* Charts Section */}
          <FadeInUp transition={{ duration: 0.5, delay: 0.4 }}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Time Series Area Chart */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg lg:col-span-2 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Daily Routing Volume & Cost</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Historical daily activity logs</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily_stats}>
                      <defs>
                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                      <YAxis stroke="#71717a" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                      <Area type="monotone" dataKey="requests" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequests)" name="Total Requests" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Routing Split Pie Chart */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Routing Strategy Split</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Breakdown of target paths taken</p>
                </div>
                {pieData.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
                    Insufficient data to render split chart
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-2 justify-center flex-wrap">
                      {pieData.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-zinc-300 font-semibold">{item.name} ({item.value})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FadeInUp>
        </div>
      )}
    </div>
  );
}
