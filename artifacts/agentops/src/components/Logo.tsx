import { cn } from "@/lib/utils";

/**
 * AgentOps custom logo mark.
 *
 * Concept: an "agent network" — a central hub orchestrating four specialist
 * nodes (the agent crew), wrapped in a soft hex shield (governance / audit).
 * Drawn as a single SVG with a violet→cyan gradient that matches the app's
 * primary palette (--primary 252°/--chart-2 cyan).
 */
export function Logo({
  className,
  size = 36,
  testId = "logo-mark",
}: {
  className?: string;
  size?: number;
  testId?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      data-testid={testId}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ao-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(252 87% 67%)" />
          <stop offset="100%" stopColor="hsl(190 95% 60%)" />
        </linearGradient>
        <linearGradient id="ao-grad-soft" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(252 87% 67%)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="hsl(190 95% 60%)" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Hex shield — governance / audit envelope */}
      <path
        d="M20 2.5 L34.5 11 L34.5 29 L20 37.5 L5.5 29 L5.5 11 Z"
        fill="url(#ao-grad-soft)"
        stroke="url(#ao-grad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Connection lines (hub → 4 spokes) */}
      <g stroke="url(#ao-grad)" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <line x1="20" y1="20" x2="20" y2="9" />
        <line x1="20" y1="20" x2="20" y2="31" />
        <line x1="20" y1="20" x2="10" y2="20" />
        <line x1="20" y1="20" x2="30" y2="20" />
      </g>

      {/* Spoke nodes (the agent crew) */}
      <circle cx="20" cy="9" r="2.4" fill="hsl(252 87% 67%)" />
      <circle cx="20" cy="31" r="2.4" fill="hsl(252 87% 67%)" />
      <circle cx="10" cy="20" r="2.4" fill="hsl(190 95% 60%)" />
      <circle cx="30" cy="20" r="2.4" fill="hsl(190 95% 60%)" />

      {/* Central hub — the conductor */}
      <circle cx="20" cy="20" r="4.2" fill="url(#ao-grad)" />
      <circle cx="20" cy="20" r="1.6" fill="hsl(0 0% 100%)" />
    </svg>
  );
}
