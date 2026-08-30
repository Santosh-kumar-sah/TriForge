"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { 
  BarChart3, 
  RefreshCw, 
  Clock, 
  Coins, 
  ArrowUpRight,
  Database,
  Search,
  Eye,
  Info,
  Trash2
} from "lucide-react";

interface RequestHistoryItem {
  id: number;
  prompt: string;
  response_text: string;
  route: string;
  reason: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
  confidence_score: number;
  is_cached: boolean;
  timestamp: string;
}

import { useAuth } from "@/context/AuthContext";

export default function AnalyticsPage() {
  const { user, authHeaders } = useAuth();
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  
  const [selectedItem, setSelectedItem] = useState<RequestHistoryItem | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const emailQuery = user?.email ? `&user_email=${encodeURIComponent(user.email)}` : "";
      const res = await fetch(`${API_BASE_URL}/api/history?limit=30${emailQuery}`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to fetch request history.");
      const json = await res.json();
      setHistory(json);
    } catch (err: any) {
      setError(err.message || "Failed to reach backend API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user?.email]);

  const handleDeleteHistoryItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this prompt from history?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/${id}`, {
        method: "DELETE",
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to delete history item.");
      
      setHistory(prev => {
        const updated = prev.filter(item => item.id !== id);
        if (selectedItem?.id === id) {
          setSelectedItem(null);
        }
        return updated;
      });
    } catch (err: any) {
      alert(err.message || "Error deleting prompt history item.");
    }
  };

  const handleDeleteBeforeToday = async () => {
    if (!confirm("Are you sure you want to delete all prompts from before today's date?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/before-today`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete older prompts.");
      const data = await res.json();
      alert(`Successfully deleted ${data.deleted_count || 0} older prompts.`);
      await fetchHistory();
    } catch (err: any) {
      alert(err.message || "Error deleting older prompts.");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredHistory = history.filter(item => 
    item.prompt.toLowerCase().includes(search.toLowerCase()) ||
    item.route.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">System Request History</h1>
          <p className="text-zinc-400 text-sm mt-1">Detailed transaction lists and query metadata inspections</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleDeleteBeforeToday}
            className="bg-red-950/60 hover:bg-red-900/60 text-red-400 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 border border-red-800/30 transition active:scale-95 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Old Prompts</span>
          </button>
          <button 
            onClick={fetchHistory}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 border border-zinc-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh List</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-950/20 border border-red-800/80 rounded-xl p-5 text-red-200 text-sm flex gap-3 items-center">
          <Info className="w-5 h-5 text-red-500 shrink-0" />
          <span>Could not retrieve system history logs. Verify backend service connection on port 8000.</span>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-2" />
          <span className="text-xs">Fetching historic logs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List Table */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search filter bar */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 max-w-md">
              <Search className="w-4 h-4 text-zinc-500 mr-2.5" />
              <input 
                type="text" 
                placeholder="Filter requests by prompt text or route..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-xs text-white placeholder-zinc-500 w-full focus:outline-none"
              />
            </div>

            {/* Table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-950/60 text-zinc-400 font-semibold border-b border-zinc-800">
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Prompt</th>
                      <th className="p-4">Route</th>
                      <th className="p-4">Latency</th>
                      <th className="p-4">Cost</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-500 italic">
                          No transactions match the search filters.
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((item) => (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-zinc-850/30 transition cursor-pointer ${
                            selectedItem?.id === item.id ? "bg-zinc-800/40" : ""
                          }`}
                          onClick={() => setSelectedItem(item)}
                        >
                          <td className="p-4 text-zinc-500 whitespace-nowrap">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="p-4 font-semibold text-zinc-200 max-w-[180px] truncate">
                            {item.prompt}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              item.route.includes("ESCALATED") 
                                ? "bg-red-950/30 text-red-400" 
                                : item.route.includes("REMOTE") 
                                  ? "bg-blue-950/30 text-blue-400" 
                                  : item.route.includes("CACHE")
                                    ? "bg-purple-950/30 text-purple-400"
                                    : "bg-emerald-950/30 text-emerald-400"
                            }`}>
                              {item.route}
                            </span>
                          </td>
                          <td className="p-4 text-zinc-300 whitespace-nowrap">
                            {item.latency_ms.toFixed(0)} ms
                          </td>
                          <td className="p-4 text-emerald-400 font-medium">
                            ${item.estimated_cost.toFixed(4)}
                          </td>
                           <td className="p-4 text-right flex gap-3 justify-end items-center">
                            <button 
                              className="text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1 active:scale-95 transition"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspect
                            </button>
                            <button 
                              className="text-zinc-500 hover:text-red-400 active:scale-95 transition"
                              onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                              title="Delete Transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Details Inspector (Right Panel) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg h-fit space-y-6">
            <h3 className="font-bold text-lg text-white border-b border-zinc-800 pb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              <span>Details Panel</span>
            </h3>

            {!selectedItem ? (
              <p className="text-xs text-zinc-500 italic py-6 text-center">
                Select a transaction from the list to view its complete properties.
              </p>
            ) : (
              <div className="space-y-4 text-xs">
                {/* ID & Date */}
                <div className="flex justify-between border-b border-zinc-850 pb-2">
                  <span className="text-zinc-500">Transaction ID</span>
                  <span className="text-zinc-300 font-semibold font-mono">#{selectedItem.id}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-850 pb-2">
                  <span className="text-zinc-500">Date & Time</span>
                  <span className="text-zinc-300 font-semibold">{new Date(selectedItem.timestamp).toLocaleString()}</span>
                </div>

                {/* Prompt */}
                <div>
                  <span className="text-zinc-500 block mb-1">Prompt Input</span>
                  <div className="bg-zinc-950 p-3 rounded-lg text-zinc-300 font-medium whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {selectedItem.prompt}
                  </div>
                </div>

                {/* Response */}
                <div>
                  <span className="text-zinc-500 block mb-1">Response Output</span>
                  <div className="bg-zinc-950 p-3 rounded-lg text-zinc-300 font-mono whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed scrollbar-thin">
                    {selectedItem.response_text}
                  </div>
                </div>

                {/* Performance stats */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-zinc-950 p-3 border border-zinc-850 rounded-lg">
                    <span className="text-[10px] text-zinc-500">Total Latency</span>
                    <p className="text-sm font-extrabold text-white mt-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      {selectedItem.latency_ms.toFixed(0)} ms
                    </p>
                  </div>

                  <div className="bg-zinc-950 p-3 border border-zinc-850 rounded-lg">
                    <span className="text-[10px] text-zinc-500">Est. API Cost</span>
                    <p className="text-sm font-extrabold text-emerald-400 mt-1 flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-emerald-500" />
                      ${selectedItem.estimated_cost.toFixed(5)}
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 border border-zinc-850 rounded-lg flex justify-between items-center">
                  <span className="text-zinc-500">Token Statistics</span>
                  <span className="text-zinc-300 font-bold font-mono">
                    {selectedItem.prompt_tokens} in / {selectedItem.completion_tokens} out
                  </span>
                </div>

                {/* Reason */}
                <div>
                  <span className="text-zinc-500 block mb-1">Routing Reason</span>
                  <p className="text-zinc-400 bg-zinc-950/60 p-3 rounded-lg leading-relaxed">
                    {selectedItem.reason}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
