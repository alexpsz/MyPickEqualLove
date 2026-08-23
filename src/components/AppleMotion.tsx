"use client";

import React from "react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

export {
  APPLE_OPACITY,
  APPLE_SPRING,
  APPLE_SPRING_GENTLE,
} from "../config/motion";

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
