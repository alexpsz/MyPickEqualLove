import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

import styles from "./journey-ui.module.css";

function controlClassName(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

export function JourneyNativeSelect({
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={styles.selectControl}>
      <select
        className={controlClassName(styles.nativeControl, className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className={styles.selectCaret}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path d="m7 9.5 5 5 5-5" />
      </svg>
    </span>
  );
}

type JourneyNativeTemporalInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  readonly type: "date" | "datetime-local";
};

export function JourneyNativeTemporalInput({
  className,
  type,
  ...props
}: JourneyNativeTemporalInputProps) {
  return (
    <input
      className={controlClassName(styles.temporalControl, className)}
      type={type}
      {...props}
    />
  );
}
