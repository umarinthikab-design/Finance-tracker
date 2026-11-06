"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { formatLKR } from "@/lib/format";

/**
 * Animate a numeric value's LKR-display between renders with a short
 * count-up/down. Falls back to an instant render when the user prefers
 * reduced motion. Server-render safe: the initial snapshot equals the
 * incoming value.
 */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const controls = animate(from, value, {
      // Reduce motion (or no change) → land instantly; otherwise a short tween.
      duration: reduce || from === value ? 0 : 0.45,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <>{formatLKR(Math.round(display * 100) / 100)}</>;
}
