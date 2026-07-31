"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";

interface MotionButtonProps extends HTMLMotionProps<"button"> {
  children: React.ReactNode;
  className?: string;
}

export function MotionButton({ children, className = "", whileHover, whileTap, ...props }: MotionButtonProps) {
  const shouldReduceMotion = useReducedMotion();

  const defaultWhileHover = shouldReduceMotion ? {} : (whileHover || { scale: 1.025, elevation: 5 });
  const defaultWhileTap = shouldReduceMotion ? {} : (whileTap || { scale: 0.97 });

  return (
    <motion.button
      whileHover={defaultWhileHover}
      whileTap={defaultWhileTap}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`relative overflow-hidden transition-all duration-200 cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
