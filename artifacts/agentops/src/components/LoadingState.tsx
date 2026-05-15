import { type ReactNode } from "react";
import { type LucideIcon, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LoadingState({
  icon: Icon = Loader2,
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
        <div className="size-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
          <Icon className={cn("size-3.5", Icon === Loader2 && "animate-spin")} />
        </div>
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && (
            <div className="text-[11px] text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
  if (variant === "bare") {
    return <div className={cn("py-2", className)}>{body}</div>;
  }
  return (
    <Card className={cn("p-5 bg-card border-card-border", className)}>{body}</Card>
  );
}
