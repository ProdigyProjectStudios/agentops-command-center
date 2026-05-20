import { cn } from "@/lib/utils";

type IllProps = { className?: string; testId?: string };

const baseProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const wrapClass = "text-muted-foreground/70";
const accentClass = "text-primary";

export function IllNoWorkflows({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      {/* node row */}
      <g {...baseProps}>
        <rect x="14" y="46" width="32" height="18" rx="3" />
        <rect x="64" y="46" width="32" height="18" rx="3" />
        <rect x="114" y="46" width="32" height="18" rx="3" />
        <path d="M46 55 H64 M96 55 H114" />
        {/* dotted future row */}
        <path d="M30 76 V90" strokeDasharray="2 3" />
        <path d="M80 76 V90" strokeDasharray="2 3" />
        <path d="M130 76 V90" strokeDasharray="2 3" />
        <circle cx="30" cy="96" r="3.5" />
        <circle cx="80" cy="96" r="3.5" />
        <circle cx="130" cy="96" r="3.5" />
      </g>
      {/* single accent dot */}
      <circle cx="30" cy="55" r="2.5" className={accentClass} fill="currentColor" />
    </svg>
  );
}

export function IllNoApprovals({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <g {...baseProps}>
        {/* signed doc */}
        <path d="M50 22 H102 L116 36 V92 H50 Z" />
        <path d="M102 22 V36 H116" />
        <path d="M60 50 H106 M60 60 H106 M60 70 H92" />
        {/* signature line */}
        <path d="M60 82 C68 78, 76 86, 84 80 S 96 78, 104 82" />
      </g>
      {/* stamp / accent check */}
      <g className={accentClass} {...baseProps} strokeWidth={1.5}>
        <circle cx="118" cy="76" r="10" />
        <path d="M114 76 l3 3 l6 -6" />
      </g>
    </svg>
  );
}

export function IllNoKnowledge({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <g {...baseProps}>
        {/* open book */}
        <path d="M24 30 C44 26, 64 30, 80 38 C96 30, 116 26, 136 30 V86 C116 82, 96 86, 80 94 C64 86, 44 82, 24 86 Z" />
        <path d="M80 38 V94" />
        <path d="M36 44 H68 M36 54 H68 M36 64 H64" />
        <path d="M92 44 H124 M92 54 H124 M92 64 H120" />
      </g>
      {/* bookmark accent */}
      <path
        d="M118 28 V46 L124 41 L130 46 V28"
        className={accentClass}
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

export function IllNoToolCalls({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <g {...baseProps}>
        {/* terminal frame */}
        <rect x="20" y="22" width="120" height="68" rx="4" />
        <path d="M20 34 H140" />
        <circle cx="28" cy="28" r="1.5" />
        <circle cx="34" cy="28" r="1.5" />
        <circle cx="40" cy="28" r="1.5" />
        {/* prompt lines */}
        <path d="M32 48 l5 4 l-5 4" />
        <path d="M44 56 H92" />
        <path d="M32 68 l5 4 l-5 4" />
        <path d="M44 76 H72" />
      </g>
      {/* blinking cursor accent */}
      <rect
        x="78"
        y="73"
        width="3"
        height="7"
        className={accentClass}
        fill="currentColor"
      />
    </svg>
  );
}

export function IllNotFound({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 120"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <g {...baseProps}>
        {/* big mono 404 */}
        <text
          x="100"
          y="76"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          fontSize="56"
          fontWeight="500"
          fill="currentColor"
          opacity="0.18"
          stroke="none"
        >
          404
        </text>
        {/* scope reticle */}
        <circle cx="100" cy="60" r="34" />
        <path d="M100 22 V40 M100 80 V98 M62 60 H80 M120 60 H138" />
      </g>
      <circle cx="100" cy="60" r="3" className={accentClass} fill="currentColor" />
    </svg>
  );
}

export function IllError({ className, testId }: IllProps) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={cn(wrapClass, className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <g {...baseProps}>
        {/* broken wire */}
        <path d="M16 60 H64 l4 -8 l4 16 l4 -16 l4 8" />
        <path d="M96 60 H144" />
        {/* spark/plug */}
        <circle cx="80" cy="60" r="3" />
      </g>
      <g className={accentClass} {...baseProps} strokeWidth={1.5}>
        <path d="M80 28 l4 12 l-4 -4 l4 12" />
      </g>
    </svg>
  );
}
