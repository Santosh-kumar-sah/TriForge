"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";

interface FadeInUpProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
}

export function FadeInUp({ children, className = "", initial, whileInView, viewport, transition, ...props }: FadeInUpProps) {
  const shouldReduceMotion = useReducedMotion();

  const defaultInitial = shouldReduceMotion ? { opacity: 1, y: 0 } : (initial ?? { opacity: 0, y: 20 });
  const defaultWhileInView = shouldReduceMotion ? { opacity: 1, y: 0 } : (whileInView ?? { opacity: 1, y: 0 });
  const defaultTransition = shouldReduceMotion ? { duration: 0 } : (transition ?? { duration: 0.5, ease: "easeOut" });

  return (
    <motion.div
      initial={defaultInitial}
      whileInView={defaultWhileInView}
      viewport={viewport ?? { once: true, margin: "-50px" }}
      transition={defaultTransition}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
