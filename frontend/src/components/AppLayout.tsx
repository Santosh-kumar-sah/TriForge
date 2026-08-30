"use client";

import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthModal from "@/components/AuthModal";
import { Lock, ArrowRight, ShieldAlert, Zap, LogIn, ArrowLeft } from "lucide-react";
import Link from "next/link";

function InnerAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, authModalOpen, authMode, redirectAfterAuth, openAuthModal, closeAuthModal } = useAuth();
  const isLandingPage = pathname === "/";

  // Public Landing Page
  if (isLandingPage) {
    return (
      <div className="min-h-screen w-full bg-[#09090b] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200 antialiased overflow-x-hidden">
        {children}
        <AuthModal
          isOpen={authModalOpen}
          onClose={closeAuthModal}
          initialMode={authMode}
          redirectUrl={redirectAfterAuth}
        />
      </div>
    );
  }

  // Loading state while checking local session
  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#09090b] text-zinc-400 space-y-3">
        <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <span className="text-xs font-mono">Authenticating TriForge Session...</span>
      </div>
    );
  }

  // Protected Route Guard: If not authenticated, intercept and block access
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#09090b] p-4 text-zinc-100">
        <div className="max-w-md w-full rounded-2xl bg-zinc-900/90 border border-white/[0.08] p-8 shadow-2xl backdrop-blur-2xl text-center space-y-6">
          
          <div className="inline-flex p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 shadow-md">
            <Lock className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              PROTECTED ROUTE // {pathname.toUpperCase()}
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-2">
              Authentication Required
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              You must be registered and signed in to access the TriForge Router Sandbox, Live Telemetry, and Benchmark Harness.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => openAuthModal("login", pathname)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to Access Route</span>
            </button>

            <button
              onClick={() => openAuthModal("register", pathname)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-all"
            >
              Create New Account
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors pt-2"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Return to Overview</span>
            </Link>
          </div>
        </div>

        <AuthModal
          isOpen={authModalOpen}
          onClose={closeAuthModal}
          initialMode={authMode}
          redirectUrl={redirectAfterAuth || pathname}
        />
      </div>
    );
  }

  // Authenticated internal app layout
  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full bg-zinc-900/50 overflow-y-auto">
        {children}
      </main>
      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        initialMode={authMode}
        redirectUrl={redirectAfterAuth}
      />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InnerAppLayout>{children}</InnerAppLayout>
    </AuthProvider>
  );
}
