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
  Activity
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export default function Sidebar() {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  const menuItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Chat Interface", path: "/chat", icon: MessageSquareCode },
    { name: "Detailed Analytics", path: "/analytics", icon: BarChart3 },
    { name: "Benchmarks Sweep", path: "/benchmarks", icon: Swords },
    { name: "System Settings", path: "/settings", icon: Settings },
    { name: "About Methodology", path: "/about", icon: HelpCircle },
  ];

  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800 text-zinc-300 flex flex-col h-screen sticky top-0 shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
        <motion.div 
          whileHover={shouldReduceMotion ? {} : { rotate: 12, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="bg-gradient-to-tr from-amber-500 to-red-500 p-2 rounded-lg text-white shadow-md shadow-amber-500/20"
        >
          <Zap className="w-5 h-5 fill-current" />
        </motion.div>
        <div>
          <h1 className="font-bold text-lg text-white tracking-wide">TriForge</h1>
          <p className="text-xs text-zinc-500 font-medium">Hybrid Router Agent</p>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link
              key={item.name}
              href={item.path}
              className={`relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
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
      </nav>

      {/* System Status Card */}
      <div className="p-4 m-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-400">System Status</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">ONLINE</span>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
          Local hardware & cloud API providers linked.
        </p>
      </div>
    </aside>
  );
}
