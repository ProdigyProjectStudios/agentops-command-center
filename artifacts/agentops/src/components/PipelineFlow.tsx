import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PipelineNode = {
  key: string;
  label: string;
  sublabel?: string;
};

export const PIPELINE_NODES: PipelineNode[] = [
  { key: "intake", label: "Intake", sublabel: "Request received" },
  { key: "ops", label: "Operations", sublabel: "Triage & routing" },
  { key: "memory", label: "Memory", sublabel: "Policy retrieval" },
  { key: "legal", label: "Legal", sublabel: "Contract review" },
  { key: "finance", label: "Finance", sublabel: "Budget & cost" },
  { key: "comms", label: "Comms", sublabel: "Draft message" },
  { key: "approval", label: "Approval", sublabel: "Human gate" },
];

type Props = {
  nodes?: PipelineNode[];
  activeIndex?: number;
  completedUntil?: number; // exclusive index; nodes before this are "completed"
  className?: string;
  height?: number;
  testId?: string;
  showLabels?: boolean;
  ambient?: boolean; // if true, animate even with no activeIndex
};

/**
 * Animated 7-node SVG pipeline. Curved connectors carry particles between nodes.
 * Pure presentational — driven by `nodes` + `activeIndex` props.
 */
export function PipelineFlow({
  nodes = PIPELINE_NODES,
  activeIndex,
  completedUntil,
  className,
  height = 140,
  testId = "pipeline-flow",
  showLabels = true,
  ambient = true,
}: Props) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const w = 1000;
  const h = height;
  const padX = 50;
  const innerW = w - padX * 2;
  const step = innerW / (nodes.length - 1);
  const cy = h / 2;
  const r = 14;

  // mild vertical sway across nodes for visual interest
  const sway = (i: number) => Math.sin(i * 1.3) * 6;

  const points = nodes.map((_, i) => ({
    x: padX + step * i,
    y: cy + sway(i),
  }));

  // Build curved path segments between consecutive points
  const segs = points.slice(0, -1).map((p, i) => {
    const n = points[i + 1];
    const dx = (n.x - p.x) * 0.45;
    return {
      d: `M ${p.x} ${p.y} C ${p.x + dx} ${p.y}, ${n.x - dx} ${n.y}, ${n.x} ${n.y}`,
      from: i,
      to: i + 1,
    };
  });

  const isActive = (i: number) => activeIndex !== undefined && i === activeIndex;
  const isCompleted = (i: number) => {
    if (completedUntil !== undefined) return i < completedUntil;
    if (activeIndex !== undefined) return i < activeIndex;
    return false;
  };

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <svg
        viewBox={`0 0 ${w} ${h + (showLabels ? 36 : 0)}`}
        className="w-full h-auto"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`g-line-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id={`g-glow-${uid}`}>
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          <filter id={`f-soft-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Connectors */}
        {segs.map((s, i) => {
          const completed = isCompleted(s.to);
          const isLive = activeIndex !== undefined && s.to === activeIndex;
          return (
            <g key={i}>
              <path
                d={s.d}
                fill="none"
                stroke={completed ? "hsl(var(--primary))" : `url(#g-line-${uid})`}
                strokeOpacity={completed ? 0.7 : 0.45}
                strokeWidth={1.25}
              />
              {/* particles */}
              {!reduce && (ambient || isLive) && (
                <>
                  <ParticleOnPath
                    pathD={s.d}
                    duration={isLive ? 1.4 : 3.6}
                    delay={i * 0.4}
                    bright={isLive}
                  />
                  {isLive && (
                    <ParticleOnPath
                      pathD={s.d}
                      duration={1.4}
                      delay={0.7}
                      bright
                    />
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {points.map((p, i) => {
          const active = isActive(i);
          const completed = isCompleted(i);
          return (
            <g key={nodes[i].key}>
              {/* outer pulse for active */}
              {active && !reduce && (
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={`url(#g-glow-${uid})`}
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              {/* node circle */}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="hsl(var(--card))"
                stroke={
                  active
                    ? "hsl(var(--primary))"
                    : completed
                      ? "hsl(var(--primary) / 0.55)"
                      : "hsl(var(--border))"
                }
                strokeWidth={active ? 1.5 : 1}
              />
              {/* inner dot or check */}
              {completed ? (
                <path
                  d={`M ${p.x - 4} ${p.y} l 3 3 l 6 -6`}
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 4 : 2.5}
                  fill={
                    active
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted-foreground) / 0.6)"
                  }
                  filter={active ? `url(#f-soft-${uid})` : undefined}
                />
              )}
              {/* labels */}
              {showLabels && (
                <>
                  <text
                    x={p.x}
                    y={h + 14}
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui"
                    fontSize="11"
                    fontWeight="500"
                    fill={
                      active
                        ? "hsl(var(--foreground))"
                        : "hsl(var(--muted-foreground))"
                    }
                  >
                    {nodes[i].label}
                  </text>
                  {nodes[i].sublabel && (
                    <text
                      x={p.x}
                      y={h + 26}
                      textAnchor="middle"
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                      fontSize="8.5"
                      letterSpacing="0.08em"
                      fill="hsl(var(--muted-foreground) / 0.65)"
                    >
                      {nodes[i].sublabel?.toUpperCase()}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ParticleOnPath({
  pathD,
  duration,
  delay,
  bright,
}: {
  pathD: string;
  duration: number;
  delay: number;
  bright?: boolean;
}) {
  // Use SMIL animateMotion — lightweight & smooth without JS rAF cost.
  return (
    <g>
      <circle
        r={bright ? 2.4 : 1.8}
        fill={bright ? "hsl(var(--primary))" : "hsl(var(--chart-2))"}
        opacity={bright ? 0.95 : 0.7}
      >
        <animateMotion
          dur={`${duration}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
          path={pathD}
          rotate="auto"
        />
      </circle>
    </g>
  );
}
