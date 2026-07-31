"use client";

import { 
  Zap, 
  ShieldCheck, 
  HelpCircle, 
  Layers, 
  TrendingDown
} from "lucide-react";
import { FadeInUp } from "@/components/MotionWrapper";

export default function AboutPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <FadeInUp className="border-b border-zinc-800 pb-5">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Routing Methodology</h1>
        <p className="text-zinc-400 text-sm mt-1">Understanding the engineering under the hood of the TriForge Hybrid routing framework</p>
      </FadeInUp>

      {/* Main explanation cards */}
      <div className="space-y-6">
        {/* Tier 1: Rules & Intent Classification */}
        <FadeInUp transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-md flex gap-5 items-start">
            <div className="bg-amber-500/10 text-amber-500 p-3 rounded-lg border border-amber-500/20 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base text-white">Tier 1: Intelligent Semantic Intent Classification</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                When a query arrives, it is processed by our dual semantic classifier in <code className="text-amber-400 bg-zinc-950 px-1 py-0.5 rounded font-mono">semantic_classifier.py</code>. 
                Queries that match high-complexity profiles (Coding, Mathematics, Reasoning) are routed **directly** to the remote Fireworks model, as smaller local models (3B) lack the multi-step reasoning depth for these domains. 
                Short, factual, conversational, or translation prompts are routed to the local model.
              </p>
            </div>
          </div>
        </FadeInUp>

        {/* Tier 2: Self-Consistency Checking */}
        <FadeInUp transition={{ duration: 0.4, delay: 0.2 }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-md flex gap-5 items-start">
            <div className="bg-emerald-500/10 text-emerald-500 p-3 rounded-lg border border-emerald-500/20 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base text-white">Tier 2: Local Self-Consistency double Sampling</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                If routed locally, we sample the local model **twice** at temperature <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 rounded font-mono">0.7</code>. 
                We calculate their string agreement similarity ratio. If the two samples are highly similar (exceeding the consistency threshold, typically 0.8), it is statistically highly probable that the local model is stable and correct. 
                If the similarity is low, it indicates uncertainty, triggering immediate escalation.
              </p>
            </div>
          </div>
        </FadeInUp>

        {/* Tier 3: Hedging & Hallucination Scanner */}
        <FadeInUp transition={{ duration: 0.4, delay: 0.3 }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-md flex gap-5 items-start">
            <div className="bg-zinc-850 text-zinc-400 p-3 rounded-lg border border-zinc-850 shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base text-white">Tier 3: Hedging & Uncertainty Audits</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Before local responses are delivered, they are scanned for hedging keywords (e.g. *"not sure if"*, *"as an AI"*, *"unable to answer"*). 
                Even if double samples are highly similar (e.g. they both say *"I apologize, I cannot answer this"*), hedging triggers an escalation to prevent delivering unhelpful empty responses.
              </p>
            </div>
          </div>
        </FadeInUp>

        {/* Tier 4: Verify-Draft Escalation */}
        <FadeInUp transition={{ duration: 0.4, delay: 0.4 }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-md flex gap-5 items-start">
            <div className="bg-blue-500/10 text-blue-500 p-3 rounded-lg border border-blue-500/20 shrink-0">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base text-white">Tier 4: Optimal Escalation via Verify-Draft</h3>
              <p className="text-zinc-400 text-xs leading-relaxed">
                When escalated, we do not discard the local model's draft. Instead, we submit the task alongside the local model's draft and instruct the remote model to act as a **verifier**. 
                The remote model corrects errors and verifies details instead of composing the answer from scratch. This significantly decreases completion tokens compared to direct remote prompting, yielding substantial token savings.
              </p>
            </div>
          </div>
        </FadeInUp>
      </div>

      {/* TriForge stats summary */}
      <FadeInUp transition={{ duration: 0.5, delay: 0.5 }}>
        <div className="bg-gradient-to-tr from-amber-950/20 to-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h4 className="font-bold text-sm text-white flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-500" />
            Why Hybrid Routing?
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-zinc-950/50 rounded-lg">
              <span className="font-bold text-white block mb-1">Maximized Accuracy</span>
              Remote models are used precisely when reasoning requirements warrant their strength, ensuring high quality output.
            </div>
            <div className="p-3 bg-zinc-950/50 rounded-lg">
              <span className="font-bold text-white block mb-1">Minimized Latency</span>
              Short/factual tasks are resolved locally, skipping internet hops and remote API queues.
            </div>
            <div className="p-3 bg-zinc-950/50 rounded-lg">
              <span className="font-bold text-white block mb-1">Extreme Cost Savings</span>
              Resolving lightweight requests locally at zero cost and using Verify-Draft for escalations keeps token expenses at a minimum.
            </div>
          </div>
        </div>
      </FadeInUp>
    </div>
  );
}
