"use client";

import React from "react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

export const APPLE_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.82,
} as const;

export const APPLE_SPRING_GENTLE = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.9,
} as const;

export const APPLE_OPACITY = {
  duration: 0.18,
  ease: [0.32, 0, 0.67, 0] as const,
};

export default function AppleMotion({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
