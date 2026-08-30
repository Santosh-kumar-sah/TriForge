"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  MessageSquareCode, 
  BarChart3, 
  Swords, 
  Settings, 
  HelpCircle, 
  Zap,
  Activity,
  LogOut,
  UserCheck,
  Home
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export default function Sidebar() {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const { user, logout } = useAuth();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Chat Interface", path: "/chat", icon: MessageSquareCode },
    { name: "Detailed Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Benchmarks Sweep", path: "/benchmarks", icon: Swords },
    { name: "System Settings", path: "/settings", icon: Settings },
    { name: "About Methodology", path: "/about", icon: HelpCircle },
  ];

  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800 text-zinc-300 flex flex-col h-screen sticky top-0 shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div 
            whileHover={shouldReduceMotion ? {} : { rotate: 12, scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="bg-gradient-to-tr from-amber-500 to-red-500 p-2 rounded-lg text-white shadow-md shadow-amber-500/20"
          >
            <Zap className="w-5 h-5 fill-current" />
          </motion.div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide group-hover:text-amber-400 transition-colors">TriForge</h1>
            <p className="text-xs text-zinc-500 font-medium">Hybrid Router Agent</p>
          </div>
        </Link>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 py-1.5 font-semibold">
          Platform Workspace
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link
              key={item.name}
              href={item.path}
              className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? "bg-zinc-900 text-white font-semibold"
                  : "hover:bg-zinc-900/60 hover:text-zinc-100 text-zinc-400"
              }`}
            >
              {isActive && !shouldReduceMotion && (
                <motion.div
                  layoutId="activeNavTab"
                  className="absolute left-0 w-1 h-6 bg-gradient-to-b from-amber-500 to-red-500 rounded-r-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              {isActive && shouldReduceMotion && (
                <div className="absolute left-0 w-1 h-6 bg-amber-500 rounded-r-full" />
              )}
              <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-amber-400" : "text-zinc-400"}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}

        <div className="pt-3 border-t border-zinc-800/80 mt-3">
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 transition-colors"
          >
            <Home className="w-4 h-4 text-zinc-500" />
            <span>Return to Landing Page</span>
          </Link>
        </div>
      </nav>

      {/* User Session Profile & Sign Out */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/80">
        {user ? (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {user.name.charAt(0)}
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 pt-1 border-t border-zinc-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Session Authenticated</span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
            <p className="text-xs text-zinc-400 mb-2">Not Signed In</p>
            <Link
              href="/"
              className="block w-full py-1.5 rounded-lg bg-zinc-800 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
