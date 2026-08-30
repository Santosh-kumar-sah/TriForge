"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, User, ArrowRight, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
  redirectUrl?: string | null;
}

export default function AuthModal({ isOpen, onClose, initialMode = "login", redirectUrl }: AuthModalProps) {
  const { login, register, redirectAfterAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        const target = redirectUrl || redirectAfterAuth || "/dashboard";
        router.push(target);
      }, 900);
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with Glass Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative w-full max-w-md bg-[#0e0e11] border border-white/[0.09] rounded-2xl p-7 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-zinc-100 overflow-hidden"
          >
            {/* Subtle Ambient Background Lighting */}
            <div className="absolute -top-24 -left-24 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border border-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header / Brand */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3 shadow-md">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {mode === "login" ? "Sign In to TriForge" : "Create TriForge Account"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {mode === "login"
                  ? "Authenticate to access the live router sandbox & telemetry"
                  : "Register to unlock zero-cost local execution & hybrid failover"}
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "register"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 text-center space-y-2.5"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                <h4 className="text-base font-bold text-white">
                  {mode === "login" ? "Authenticated Successfully!" : "Account Created!"}
                </h4>
                <p className="text-xs text-zinc-400">Loading TriForge Control Plane...</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === "register" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5" />
                      <input
                        type="text"
                        required
                        placeholder="Alex Rivera"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="engineer@company.ai"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">Security Key / Password</label>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 rounded-xl p-[1px] font-semibold text-xs sm:text-sm transition-all shadow-md"
                >
                  <div className="bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-bold transition-transform active:scale-[0.99]">
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>{mode === "login" ? "Sign In & Unlock Features" : "Create Account & Unlock Sandbox"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </div>
                </button>
              </form>
            )}

            {/* Quick Demo Credentials */}
            <div className="mt-5 pt-3 border-t border-zinc-800/80 text-center">
              <p className="text-[11px] text-zinc-500">
                Tip: Enter any email to instantly create or access your session.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
