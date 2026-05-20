import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Branded loading state. Uses shimmer skeletons that mirror the surrounding
 * page layout. Never renders a spinner on data-driven surfaces.
 *
 * `icon` is accepted for backward-compatibility but rendered as a static
 * monochrome glyph — no spin animation.
 */
export function LoadingState({
  icon: Icon,
  title = "Loading…",
  description,
  testId = "loading-state",
  className,
  variant = "card",
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  testId?: string;
  className?: string;
  variant?: "card" | "bare";
  children?: ReactNode;
}) {
  const body = (
    <div data-testid={testId}>
      <div className="flex items-center gap-2.5 mb-3">
        {Icon ? (
          <div className="size-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <Icon className="size-3.5" />
          </div>
        ) : (
          <Skeleton className="size-7 rounded-md" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {description && (
            <div className="text-[11px] text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {children ?? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
    </div>
  );
  if (variant === "bare") {
    return <div className={cn("py-2", className)}>{body}</div>;
  }
  return (
    <Card className={cn("p-5 surface-raised", className)}>{body}</Card>
  );
}
