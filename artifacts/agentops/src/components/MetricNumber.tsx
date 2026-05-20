import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type FormatFn = (n: number) => string;

export function MetricNumber({
  value,
  format,
  className,
  durationMs = 200,
  prefix,
  suffix,
  testId,
}: {
  value: number | undefined;
  format?: FormatFn;
  className?: string;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(value ?? null);
  const ref = useRef<number | null>(value ?? null);

  useEffect(() => {
    if (value === undefined) return;
    if (reduce) {
      ref.current = value;
      setDisplay(value);
      return;
    }
    const from = ref.current ?? 0;
    const controls = animate(from, value, {
      duration: durationMs / 1000,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    ref.current = value;
    return () => controls.stop();
  }, [value, durationMs, reduce]);

  if (value === undefined || display === null) {
    return (
      <span className={cn("tnum", className)} data-testid={testId}>
        —
      </span>
    );
  }

  const isInt = Number.isInteger(value);
  const rendered = format
    ? format(display)
    : isInt
      ? Math.round(display).toLocaleString()
      : display.toFixed(1);

  return (
    <span className={cn("tnum", className)} data-testid={testId}>
      {prefix}
      {rendered}
      {suffix}
    </span>
  );
}
