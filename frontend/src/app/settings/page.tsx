"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { 
  Settings, 
  RefreshCw, 
  Save, 
  Key, 
  Sliders, 
  Database,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  Eye,
  EyeOff
} from "lucide-react";

interface SettingsData {
  active_local_model: string;
  active_remote_model: string;
  default_threshold: number;
  enable_cache: boolean;
  enable_prompt_compression: boolean;
  fireworks_api_key?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  groq_api_key?: string;
  together_api_key?: string;
}

import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { user, authHeaders } = useAuth();
  const [formData, setFormData] = useState<SettingsData>({
    active_local_model: "qwen2.5:3b-instruct",
    active_remote_model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    default_threshold: 0.8,
    enable_cache: true,
    enable_prompt_compression: false,
    fireworks_api_key: "",
    openai_api_key: "",
    anthropic_api_key: "",
    gemini_api_key: "",
    groq_api_key: "",
    together_api_key: ""
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [models, setModels] = useState<{ local: { id: string; name: string }[]; remote: { id: string; name: string }[] }>({
    local: [],
    remote: []
  });

  const fetchSettingsAndModels = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const emailQuery = user?.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
      const [settingsRes, modelsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/settings${emailQuery}`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/models`)
      ]);
      if (!settingsRes.ok) throw new Error("Failed to fetch settings from API.");
      if (!modelsRes.ok) throw new Error("Failed to fetch supported models from API.");
      
      const settingsData = await settingsRes.json();
      const modelsData = await modelsRes.json();
      
      setFormData(settingsData);
      setModels(modelsData);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to contact backend API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndModels();
  }, [user?.email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          ...formData,
          user_email: user?.email
        })
      });
      if (!res.ok) throw new Error("Failed to save settings changes.");
      setSuccessMsg("System configuration updated and isolated to your workspace.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Error saving configuration changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-zinc-400">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-3" />
        <p className="text-sm font-semibold tracking-wide">Retrieving system configurations...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">System Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">Configure pluggable API credentials, active routing models, and thresholds</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* API Credentials */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
            <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              API Key Credentials
            </h3>
            <span className="text-[11px] font-medium text-emerald-400/90 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Server Key Shield Active
            </span>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-3 text-xs text-emerald-300/90 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Demo Configuration:</span> This application currently uses demo API keys for personal testing. For your own deployment, replace them with your own API keys. Your keys remain private and are never exposed to other users.
            </div>
          </div>
          
          <div className="space-y-4 text-xs">
            {[
              { id: "groq", name: "Groq API Key (Optional)", key: "groq_api_key", placeholder: "Paste your Groq key here (starts with gsk_)..." },
              { id: "fireworks", name: "Fireworks AI API Key", key: "fireworks_api_key", placeholder: "Paste your fireworks key here (starts with fw_)..." },
              { id: "openai", name: "OpenAI API Key (Optional)", key: "openai_api_key", placeholder: "Paste your openai key here (starts with sk-)..." },
              { id: "anthropic", name: "Anthropic API Key (Optional)", key: "anthropic_api_key", placeholder: "Paste your anthropic key here (starts with sk-ant-)..." },
              { id: "gemini", name: "Gemini API Key (Optional)", key: "gemini_api_key", placeholder: "Paste your Gemini API key here..." },
              { id: "together", name: "Together AI API Key (Optional)", key: "together_api_key", placeholder: "Paste your Together API key here..." },
            ].map(field => {
              const fieldKey = field.key as keyof SettingsData;
              const rawVal = (formData[fieldKey] as string) || "";
              const isConfigured = rawVal === "••••••••";

              return (
                <div key={field.id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="font-semibold text-zinc-400 uppercase">{field.name}</label>
                    {isConfigured && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Configured & Server Shielded
                      </span>
                    )}
                  </div>
                  <div>
                    <input 
                      type="password" 
                      value={rawVal === "••••••••" ? "" : rawVal} 
                      onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
                      placeholder={isConfigured ? "•••••••• (Configured on Server — Type to update)" : field.placeholder}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Configurations */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-4">
          <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Sliders className="w-4 h-4 text-amber-500" />
            Model & Routing Policies
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase">Active Local Model</label>
              <select 
                value={formData.active_local_model} 
                onChange={(e) => setFormData({ ...formData, active_local_model: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
              >
                {models.local.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase">Active Remote Model</label>
              <select 
                value={formData.active_remote_model} 
                onChange={(e) => setFormData({ ...formData, active_remote_model: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
              >
                {models.remote.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5 uppercase">Consistency Agreement Threshold</label>
              <input 
                type="number" 
                min="0.1" 
                max="1.0" 
                step="0.05"
                value={formData.default_threshold} 
                onChange={(e) => setFormData({ ...formData, default_threshold: parseFloat(e.target.value) })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white mt-1.5"
              />
            </div>
          </div>
        </div>

        {/* Cache & Optimization */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg space-y-4">
          <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Database className="w-4 h-4 text-amber-500" />
            Optimizations
          </h3>
          
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white text-sm">Smart Query Caching</h4>
                <p className="text-zinc-500 text-xs mt-0.5">Enable direct SQLite retrieval of previous prompt answers</p>
              </div>
              <input 
                type="checkbox" 
                checked={formData.enable_cache} 
                onChange={(e) => setFormData({ ...formData, enable_cache: e.target.checked })}
                className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-800 rounded accent-amber-500"
              />
            </div>

            <div className="flex items-center justify-between border-t border-zinc-850/60 pt-4">
              <div>
                <h4 className="font-bold text-white text-sm">Prompt Compression</h4>
                <p className="text-zinc-500 text-xs mt-0.5">Summarize lengthy contexts using local models before remote calls to save remote tokens</p>
              </div>
              <input 
                type="checkbox" 
                checked={formData.enable_prompt_compression} 
                onChange={(e) => setFormData({ ...formData, enable_prompt_compression: e.target.checked })}
                className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-800 rounded accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 items-center">
          <button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 disabled:from-zinc-850 disabled:to-zinc-850 text-white font-semibold text-xs px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95 transition"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save System Changes</span>
          </button>
          
          {successMsg && (
            <div className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5 animate-fade-in">
              <CheckCircle className="w-4 h-4" />
              {successMsg}
            </div>
          )}

          {errorMsg && (
            <p className="text-red-400 text-xs">
              {errorMsg}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
