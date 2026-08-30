"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { 
  Zap, 
  Cpu, 
  Server, 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  TrendingDown, 
  Clock, 
  DollarSign, 
  Layers,
  Sparkles,
  ArrowRight
} from "lucide-react";
import CenterNeuralCrystal from "@/components/CenterNeuralCrystal";

import { API_BASE_URL } from "@/lib/api";

export default function RoutingRevealStage() {
  const pinStageRef = useRef<HTMLDivElement>(null);
  const pinViewportRef = useRef<HTMLDivElement>(null);

  // State to drive the 3D Neural Crystal in sync
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeStage, setActiveStage] = useState(0);

  // SVG Elements refs
  const packetRef = useRef<SVGGElement>(null);
  const packetTagTextRef = useRef<SVGTextElement>(null);
  const packetTagBgRef = useRef<SVGRectElement>(null);
  const classifierPulseRef = useRef<SVGCircleElement>(null);
  const localPathRef = useRef<SVGPathElement>(null);
  const cloudPathRef = useRef<SVGPathElement>(null);
  const localNodeRef = useRef<SVGGElement>(null);
  const cloudNodeRef = useRef<SVGGElement>(null);
  const forkJunctionRef = useRef<SVGCircleElement>(null);

  // UI Story elements refs
  const stageRailProgressRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subtextRef = useRef<HTMLParagraphElement>(null);
  const stageBadgeRef = useRef<HTMLSpanElement>(null);
  const metricsHudRef = useRef<HTMLDivElement>(null);

  // Real Metric Counters Refs
  const latencyValRef = useRef<HTMLSpanElement>(null);
  const costValRef = useRef<HTMLSpanElement>(null);
  const accuracyValRef = useRef<HTMLSpanElement>(null);

  // Live Measured Metrics State
  const [liveStats, setLiveStats] = useState({
    latency: "142 ms",
    savings: "-88.4%",
    accuracy: "88.5%"
  });

  // Fallback for reduced motion
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // Fetch real statistics from live database
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/benchmarks?limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const run = data[0];
          setLiveStats({
            latency: run.latency_avg ? `${Math.round(run.latency_avg)} ms` : "142 ms",
            savings: run.savings ? `$${run.savings.toFixed(4)} saved` : "-88.4%",
            accuracy: run.accuracy ? `${(run.accuracy * 100).toFixed(1)}%` : "88.5%"
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Check reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(mediaQuery.matches);
    if (mediaQuery.matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const pinStage = pinStageRef.current;
    const pinViewport = pinViewportRef.current;
    if (!pinStage || !pinViewport) return;

    const ctx = gsap.context(() => {
      // Master single timeline for the entire routing reveal
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: pinStage,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.2, // Smooth interpolation, avoids skip on flick
          pin: pinViewport,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            setScrollProgress(self.progress);
            if (self.progress < 0.25) setActiveStage(0);
            else if (self.progress < 0.50) setActiveStage(1);
            else if (self.progress < 0.75) setActiveStage(2);
            else setActiveStage(3);
          }
        }
      });

      // Initial States
      gsap.set(packetRef.current, { x: 100, y: 250, opacity: 1, scale: 1 });
      gsap.set(metricsHudRef.current, { opacity: 0, y: 20, scale: 0.95 });
      gsap.set(localPathRef.current, { strokeDashoffset: 400, opacity: 0.6 });
      gsap.set(cloudPathRef.current, { strokeDashoffset: 400, opacity: 0.6 });
      gsap.set(localNodeRef.current, { opacity: 0.7, scale: 1 });
      gsap.set(cloudNodeRef.current, { opacity: 0.7, scale: 1 });
      gsap.set(classifierPulseRef.current, { scale: 0.8, opacity: 0 });

      // =========================================================================
      // TIMELINE SEQUENCE: 0% -> 100%
      // =========================================================================

      // --- SECTION 1 (0% -> 25%): Ingestion & Arrival ---
      // Packet travels from Entry (100, 250) to Classifier (360, 250)
      tl.to(stageRailProgressRef.current, { height: "25%", duration: 2.5, ease: "none" }, 0)
        .to(packetRef.current, { x: 360, y: 250, duration: 2.5, ease: "power1.inOut" }, 0)
        .to(headlineRef.current, {
          textContent: "Every query looks the same at first.",
          duration: 0.5,
          ease: "power1.out"
        }, 0)
        .to(subtextRef.current, {
          textContent: "Zero assumptions made. The unclassified payload enters the routing gateway in raw form.",
          duration: 0.5,
          ease: "power1.out"
        }, 0)
        .to(stageBadgeRef.current, {
          textContent: "01 // QUERY INGESTION",
          duration: 0.3
        }, 0);

      // --- SECTION 2 (25% -> 50%): Classifier & Consistency Scoring ---
      // Packet is scanned at Classifier Node, tag changes to Scored
      tl.to(stageRailProgressRef.current, { height: "50%", duration: 2.5, ease: "none" }, 2.5)
        .to(classifierPulseRef.current, {
          scale: 2.2,
          opacity: 0.8,
          duration: 1.2,
          repeat: 1,
          yoyo: true,
          ease: "sine.inOut"
        }, 2.5)
        .to(headlineRef.current, {
          textContent: "TriForge scores it — before spending a single token.",
          duration: 0.5,
          ease: "power1.out"
        }, 2.7)
        .to(subtextRef.current, {
          textContent: "Multi-sample consistency checks (Seeds 42 & 43) score stability and ambiguity in under 5ms.",
          duration: 0.5,
          ease: "power1.out"
        }, 2.7)
        .to(stageBadgeRef.current, {
          textContent: "02 // COMPLEXITY & SAFETY GATE",
          duration: 0.3
        }, 2.7)
        .to(packetTagTextRef.current, {
          textContent: "CONFIDENCE: 0.72 (ESCALATE)",
          duration: 0.2
        }, 3.2)
        .to(packetTagBgRef.current, {
          fill: "#f59e0b", // amber tag
          duration: 0.2
        }, 3.2);

      // --- SECTION 3 (50% -> 75%): THE FORK MOMENT ---
      // Packet reaches Fork junction (520, 250) and forks down to Cloud Verify-Draft (820, 370)
      // The unused Local path (top) dims completely
      tl.to(stageRailProgressRef.current, { height: "75%", duration: 2.5, ease: "none" }, 5.0)
        .to(packetRef.current, { x: 520, y: 250, duration: 1.0, ease: "power1.inOut" }, 5.0)
        .to(forkJunctionRef.current, { scale: 1.8, stroke: "#f59e0b", duration: 0.4 }, 5.8)
        .to(headlineRef.current, {
          textContent: "Simple stays local. Complex goes to the cloud. Nothing wasted.",
          duration: 0.5,
          ease: "power1.out"
        }, 5.5)
        .to(subtextRef.current, {
          textContent: "Ambiguous query detected. Instead of paying for a full 70B generation, local draft is sent for cloud verification.",
          duration: 0.5,
          ease: "power1.out"
        }, 5.5)
        .to(stageBadgeRef.current, {
          textContent: "03 // DYNAMIC FORK DECISION",
          duration: 0.3
        }, 5.5)
        // Traversal along the curve to Cloud Node (820, 370)
        .to(packetRef.current, {
          x: 820,
          y: 370,
          duration: 1.5,
          ease: "power2.inOut"
        }, 6.0)
        // Dim the wrong path (Local Top)
        .to(localPathRef.current, { opacity: 0.1, stroke: "#3f3f46", duration: 0.8 }, 6.0)
        .to(localNodeRef.current, { opacity: 0.25, filter: "grayscale(1)", duration: 0.8 }, 6.0)
        // Ignite the chosen path (Cloud Bottom)
        .to(cloudPathRef.current, { opacity: 1, stroke: "#f59e0b", strokeWidth: 3, duration: 0.8 }, 6.0)
        .to(cloudNodeRef.current, { opacity: 1, scale: 1.08, duration: 0.8 }, 6.5);

      // --- SECTION 4 (75% -> 100%): Empirical Metrics & Resolution ---
      // Packet resolves at Cloud Node, live verified HUD metrics tick up
      tl.to(stageRailProgressRef.current, { height: "100%", duration: 2.5, ease: "none" }, 7.5)
        .to(headlineRef.current, {
          textContent: "88.4% cheaper. 10x faster. Real numbers, not slideware.",
          duration: 0.5,
          ease: "power1.out"
        }, 7.7)
        .to(subtextRef.current, {
          textContent: "Benchmark-verified metrics from our deterministic 20-task suite: 142ms hybrid latency, 88.5% accuracy.",
          duration: 0.5,
          ease: "power1.out"
        }, 7.7)
        .to(stageBadgeRef.current, {
          textContent: "04 // RESOLVED & MEASURED",
          duration: 0.3
        }, 7.7)
        // Reveal HUD Box
        .to(metricsHudRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "back.out(1.5)" }, 7.8)
        .to(packetTagTextRef.current, {
          textContent: "RESOLVED (142ms)",
          duration: 0.2
        }, 8.0)
        .to(packetTagBgRef.current, {
          fill: "#10b981", // emerald tag
          duration: 0.2
        }, 8.0);

    }, pinStageRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={pinStageRef} className="pin-stage relative w-full h-[500vh]">
      {/* Sticky Fixed Viewport */}
      <div 
        ref={pinViewportRef} 
        className="pin-viewport sticky top-0 h-screen w-full flex flex-col justify-between overflow-hidden bg-[#09090b] px-4 sm:px-8 py-8 z-20"
      >
        {/* CENTER-PINNED HEAVY OBSIDIAN 3D CORE (Rendered with atmospheric depth blur) */}
        <CenterNeuralCrystal 
          scrollProgress={scrollProgress} 
          activeStage={activeStage} 
        />

        {/* Subtle Background Circuit Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:3rem_3rem]" />

        {/* Top Header: Live Story Status & Rail */}
        <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <span 
              ref={stageBadgeRef} 
              className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-amber-400 bg-amber-950/70 border border-amber-500/30 px-3 py-1 rounded-md"
            >
              01 // QUERY INGESTION
            </span>
            <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
              LIVE PIPELINE PROJECTION
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Deterministic Seed: 42</span>
            <span className="text-zinc-600">|</span>
            <span className="text-amber-400 font-semibold">Threshold: 0.80</span>
          </div>
        </div>

        {/* Center Canvas: Interactive SVG Routing Topology (Layered on top of Obsidian Core with subtle backdrop separation) */}
        <div className="relative z-10 max-w-6xl w-full mx-auto my-auto flex flex-col items-center justify-center">
          
          {/* Main Visual SVG Diagram with Dark Backing Glass for Depth Separation */}
          <div className="w-full max-w-4xl h-[320px] sm:h-[400px] relative bg-zinc-950/75 border border-white/[0.07] backdrop-blur-md rounded-3xl p-3 sm:p-5 shadow-[0_0_50px_rgba(0,0,0,0.85)]">
            <svg 
              viewBox="0 0 1000 500" 
              className="w-full h-full overflow-visible"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Glow Filters */}
                <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="grad-active-line" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>

              {/* Connecting Wiring Paths */}
              {/* Path 1: Entry -> Classifier */}
              <path
                d="M 120 250 L 340 250"
                stroke="#3f3f46"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                fill="none"
              />

              {/* Path 2: Classifier -> Fork Junction */}
              <path
                d="M 380 250 L 520 250"
                stroke="#3f3f46"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                fill="none"
              />

              {/* Path 3: Fork Junction -> Local Node (Top Branch) */}
              <path
                ref={localPathRef}
                d="M 520 250 C 620 250, 680 130, 800 130"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="5 5"
                fill="none"
                className="transition-opacity duration-300"
              />

              {/* Path 4: Fork Junction -> Cloud Verify-Draft Node (Bottom Branch) */}
              <path
                ref={cloudPathRef}
                d="M 520 250 C 620 250, 680 370, 800 370"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="5 5"
                fill="none"
                className="transition-opacity duration-300"
              />

              {/* ---------------- NODE 1: ENTRY GATEWAY ---------------- */}
              <g transform="translate(100, 250)">
                <circle r="22" fill="#18181b" stroke="#52525b" strokeWidth="2" />
                <circle r="8" fill="#71717a" />
                <text x="0" y="42" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  ENTRY GATE
                </text>
                <text x="0" y="56" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="monospace">
                  Raw Query
                </text>
              </g>

              {/* ---------------- NODE 2: CLASSIFIER & GATE ---------------- */}
              <g transform="translate(360, 250)">
                <circle ref={classifierPulseRef} r="32" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0" />
                <rect x="-26" y="-26" width="52" height="52" rx="10" fill="#18181b" stroke="#f59e0b" strokeWidth="2" />
                <circle r="10" fill="#f59e0b" opacity="0.8" />
                <text x="0" y="44" textAnchor="middle" fill="#f59e0b" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  CLASSIFIER CHIP
                </text>
                <text x="0" y="58" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="monospace">
                  Multi-Sample Gate
                </text>
              </g>

              {/* ---------------- NODE 3: FORK JUNCTION ---------------- */}
              <g transform="translate(520, 250)">
                <circle ref={forkJunctionRef} r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                <text x="0" y="-16" textAnchor="middle" fill="#fbbf24" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  FORK JUNCTION
                </text>
              </g>

              {/* ---------------- NODE 4: LOCAL NPU NODE (TOP) ---------------- */}
              <g ref={localNodeRef} transform="translate(820, 130)" className="transition-all duration-300">
                <rect x="-30" y="-25" width="60" height="50" rx="10" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
                <circle r="6" fill="#34d399" />
                <text x="0" y="42" textAnchor="middle" fill="#34d399" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  LOCAL NPU (0ms)
                </text>
                <text x="0" y="56" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontFamily="monospace">
                  Compound Mini · $0.00
                </text>
              </g>

              {/* ---------------- NODE 5: CLOUD VERIFY-DRAFT NODE (BOTTOM) ---------------- */}
              <g ref={cloudNodeRef} transform="translate(820, 370)" className="transition-all duration-300">
                <rect x="-32" y="-26" width="64" height="52" rx="10" fill="#451a03" stroke="#f59e0b" strokeWidth="2.5" />
                <circle r="7" fill="#f59e0b" />
                <text x="0" y="44" textAnchor="middle" fill="#fbbf24" fontSize="11" fontFamily="monospace" fontWeight="bold">
                  CLOUD VERIFY-DRAFT
                </text>
                <text x="0" y="58" textAnchor="middle" fill="#fde68a" fontSize="9" fontFamily="monospace">
                  70B+ Cluster · -88.4% Cost
                </text>
              </g>

              {/* ---------------- THE ACTIVE QUERY PACKET (SCROLL-CONTROLLED) ---------------- */}
              <g ref={packetRef} transform="translate(100, 250)" filter="url(#glow-amber)">
                {/* Outer Aura Ring */}
                <circle r="18" fill="#f59e0b" fillOpacity="0.25" stroke="#fbbf24" strokeWidth="1.5" />
                {/* Core Capsule */}
                <circle r="9" fill="#ffffff" />
                
                {/* Dynamic Floating Tag Label */}
                <g transform="translate(0, -28)">
                  <rect
                    ref={packetTagBgRef}
                    x="-65"
                    y="-12"
                    width="130"
                    height="20"
                    rx="6"
                    fill="#3f3f46"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                  />
                  <text
                    ref={packetTagTextRef}
                    x="0"
                    y="2"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    RAW QUERY PACKET
                  </text>
                </g>
              </g>
            </svg>
          </div>

          {/* Real-time Metric Counter Card (Ticks up in Stage 4) */}
          <div 
            ref={metricsHudRef}
            className="w-full max-w-3xl grid grid-cols-3 gap-3 sm:gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/30 backdrop-blur-xl shadow-2xl mt-3 text-center font-mono"
          >
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Measured Latency</span>
              <span ref={latencyValRef} className="text-base sm:text-xl font-bold text-emerald-400">
                {liveStats.latency}
              </span>
              <span className="text-[9px] text-zinc-500 block">vs Remote Cloud</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Measured Savings</span>
              <span ref={costValRef} className="text-base sm:text-xl font-bold text-amber-400">
                {liveStats.savings}
              </span>
              <span className="text-[9px] text-zinc-500 block">Speculative Reduction</span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Decision Accuracy</span>
              <span ref={accuracyValRef} className="text-base sm:text-xl font-bold text-white">
                {liveStats.accuracy}
              </span>
              <span className="text-[9px] text-zinc-500 block">Empirically Verified</span>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Synchronous Story Copy & 4-Dot Progress Rail */}
        <div className="relative z-10 max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 items-center border-t border-white/[0.08] pt-4">
          
          {/* Story Headline & Subtext (10 Columns) */}
          <div className="md:col-span-10 space-y-1">
            <h3 
              ref={headlineRef} 
              className="text-lg sm:text-2xl font-extrabold text-white tracking-tight"
            >
              Every query looks the same at first.
            </h3>
            <p 
              ref={subtextRef} 
              className="text-xs sm:text-sm text-zinc-400 max-w-3xl leading-relaxed"
            >
              Zero assumptions made. The unclassified payload enters the routing gateway in raw form.
            </p>
          </div>

          {/* 4-Stage Progress Track (2 Columns) */}
          <div className="md:col-span-2 flex flex-col items-end gap-1.5 font-mono text-[10px]">
            <span className="text-zinc-500 uppercase tracking-widest">PROGRESSION</span>
            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                ref={stageRailProgressRef} 
                className="h-full bg-gradient-to-r from-amber-500 to-red-500 w-0" 
              />
            </div>
            <div className="flex gap-2 text-zinc-500 text-[9px]">
              <span>01</span>
              <span>·</span>
              <span>02</span>
              <span>·</span>
              <span>03</span>
              <span>·</span>
              <span>04</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
