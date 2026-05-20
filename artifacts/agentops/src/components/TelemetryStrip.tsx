import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Radio, Waves, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * High-tech ambient telemetry strip rendered between the hero and the KPI
 * cards. Pure presentational — no API calls, no data fetches. Decorative
 * ambient loops only (no interactive animation exceeds 200ms).
 */
export function TelemetryStrip({ className }: { className?: string }) {
  return (
    <div
      data-testid="telemetry-strip"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-card-border bg-[linear-gradient(180deg,hsl(252_30%_8%/0.55),hsl(220_25%_5%/0.55))]",
        className,
      )}
    >
      <GridBackdrop />
      <ScanBeam />
      <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] items-stretch gap-px bg-card-border/40">
        <LiveSignal />
        <SparklineRow />
        <CrewStatus />
      </div>
    </div>
  );
}

/* ----------------------- Backdrops & ambient layers ----------------------- */

function GridBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
    >
      <defs>
        <pattern id="ts-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path
            d="M 28 0 L 0 0 0 28"
            fill="none"
            stroke="hsl(252 60% 70% / 0.35)"
            strokeWidth="0.5"
          />
        </pattern>
        <radialGradient id="ts-fade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="ts-mask">
          <rect width="100%" height="100%" fill="url(#ts-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#ts-grid)" mask="url(#ts-mask)" />
    </svg>
  );
}

function ScanBeam() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-40 bg-[linear-gradient(90deg,transparent,hsl(252_87%_67%/0.18),transparent)]"
      initial={{ x: "-10%" }}
      animate={{ x: "110%" }}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* -------------------------------- Live signal ----------------------------- */

function LiveSignal() {
  const [uptime, setUptime] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = uptime;
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setUptime(Date.now());
  }, []);

  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="relative flex items-center gap-3 px-5 py-4 bg-background/40">
      <div className="relative size-9 rounded-full bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center">
        <Radio className="size-4 text-emerald-300" />
        <span className="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/90 font-medium">
          Live · Orchestrator
        </div>
        <div className="font-display text-lg tnum text-foreground/90 leading-tight">
          {hh}:{mm}:{ss}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          session uptime
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Sparklines ------------------------------ */

type Metric = {
  label: string;
  icon: typeof Activity;
  unit: string;
  decimals: number;
  base: number;
  amp: number;
  hue: string; // tailwind text-* color
  stroke: string; // css color for svg
};

const METRICS: Metric[] = [
  {
    label: "Throughput",
    icon: Activity,
    unit: "req/s",
    decimals: 1,
    base: 12,
    amp: 5,
    hue: "text-sky-300",
    stroke: "hsl(200 95% 65%)",
  },
  {
    label: "Latency p95",
    icon: Waves,
    unit: "ms",
    decimals: 0,
    base: 180,
    amp: 60,
    hue: "text-violet-300",
    stroke: "hsl(252 87% 75%)",
  },
  {
    label: "Queue depth",
    icon: Cpu,
    unit: "",
    decimals: 0,
    base: 4,
    amp: 3,
    hue: "text-amber-300",
    stroke: "hsl(38 90% 65%)",
  },
  {
    label: "Success rate",
    icon: Zap,
    unit: "%",
    decimals: 1,
    base: 99,
    amp: 0.6,
    hue: "text-emerald-300",
    stroke: "hsl(150 70% 60%)",
  },
];

function SparklineRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-card-border/40">
      {METRICS.map((m) => (
        <Sparkline key={m.label} metric={m} />
      ))}
    </div>
  );
}

function Sparkline({ metric }: { metric: Metric }) {
  const points = useRollingSeries(metric);
  const Icon = metric.icon;
  const last = points[points.length - 1] ?? metric.base;
  const path = useMemo(() => buildPath(points), [points]);
  const area = useMemo(() => buildArea(points), [points]);
  const gradId = `ts-grad-${metric.label.replace(/\s+/g, "-")}`;

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 bg-background/40 min-w-0">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("size-3", metric.hue)} />
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
            {metric.label}
          </div>
        </div>
        <div className="font-display text-lg tnum text-foreground leading-tight">
          {last.toFixed(metric.decimals)}
          <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {metric.unit}
          </span>
        </div>
      </div>
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-9 w-24 shrink-0"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={metric.stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={metric.stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={path}
          fill="none"
          stroke={metric.stroke}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function useRollingSeries(metric: Metric): number[] {
  const seedRef = useRef(Math.random() * 1000);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1200);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const n = 32;
    const seed = seedRef.current;
    const arr: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (tick + i) * 0.45 + seed;
      const v =
        metric.base +
        Math.sin(x) * metric.amp * 0.6 +
        Math.cos(x * 1.7 + seed) * metric.amp * 0.35 +
        (Math.sin(x * 0.31) * metric.amp) * 0.1;
      arr.push(v);
    }
    return arr;
  }, [tick, metric]);
}

function buildPath(points: number[]): string {
  if (!points.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const step = w / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * step;
      const y = h - 2 - ((p - min) / range) * (h - 4);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildArea(points: number[]): string {
  const line = buildPath(points);
  if (!line) return "";
  return `${line} L 100 32 L 0 32 Z`;
}

/* -------------------------------- Crew status ----------------------------- */

const CREW = [
  { id: "ops", label: "Ops", color: "bg-violet-400" },
  { id: "mem", label: "Memory", color: "bg-sky-400" },
  { id: "legal", label: "Legal", color: "bg-amber-400" },
  { id: "fin", label: "Finance", color: "bg-emerald-400" },
  { id: "comms", label: "Comms", color: "bg-rose-400" },
];

function CrewStatus() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % CREW.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 px-5 py-4 bg-background/40">
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
          Crew
        </div>
        <div className="font-display text-lg tnum text-foreground leading-tight">
          {CREW.length}
          <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            online
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-9">
        {CREW.map((c, i) => (
          <div key={c.id} className="flex flex-col items-center gap-1">
            <div className="relative size-2.5">
              <span
                className={cn(
                  "absolute inset-0 rounded-full opacity-80",
                  c.color,
                )}
              />
              {i === active && (
                <span
                  className={cn(
                    "absolute inset-0 rounded-full animate-ping",
                    c.color,
                  )}
                />
              )}
            </div>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
