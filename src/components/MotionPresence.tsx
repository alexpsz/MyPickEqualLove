"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";

export type PresenceState = "present" | "exiting";

interface MotionPresenceProps<T> {
  value: T | null | undefined;
  children: (value: T, state: PresenceState) => React.ReactNode;
  onExitComplete?: () => void;
}

export default function MotionPresence<T>({
  value,
  children,
  onExitComplete,
}: MotionPresenceProps<T>) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const present = value !== null && value !== undefined;
  const wasPresentRef = useRef(present);

  useEffect(() => {
    if (prefersReducedMotion && wasPresentRef.current && !present) {
      onExitComplete?.();
    }
    wasPresentRef.current = present;
  }, [onExitComplete, prefersReducedMotion, present]);

  if (prefersReducedMotion) {
    return present ? children(value as T, "present") : null;
  }

  return (
    <AnimatePresence
      initial={false}
      mode="sync"
      onExitComplete={onExitComplete}
    >
      {present ? (
        <PresenceItem key="presence" value={value as T}>
          {children}
        </PresenceItem>
      ) : null}
    </AnimatePresence>
  );
}

export function usePrefersReducedMotion() {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted && Boolean(reducedMotion);
}

function PresenceItem<T>({
  value,
  children,
}: {
  value: T;
  children: (value: T, state: PresenceState) => React.ReactNode;
}) {
  const isPresent = useIsPresent();
  return children(value, isPresent ? "present" : "exiting");
}
