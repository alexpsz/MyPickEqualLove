"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";

export type PresenceState = "present" | "exiting";

interface MotionPresenceProps<T> {
  value: T | null | undefined;
  children: (value: T, state: PresenceState) => React.ReactNode;
}

export default function MotionPresence<T>({
  value,
  children,
}: MotionPresenceProps<T>) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const present = value !== null && value !== undefined;

  if (prefersReducedMotion) {
    return present ? children(value as T, "present") : null;
  }

  return (
    <AnimatePresence initial={false} mode="sync">
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
