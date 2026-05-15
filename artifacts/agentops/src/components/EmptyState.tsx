import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  testId,
  className,
  variant = "card",
  tone = "primary",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  className?: string;
  variant?: "card" | "bare";
  tone?: "primary" | "muted" | "danger";
}) {
  const toneRing =
    tone === "danger"
      ? "bg-rose-500/10 text-rose-300"
      : tone === "muted"
        ? "bg-muted text-muted-foreground"
        : "bg-primary/10 text-primary";
  const body = (
    <div className="text-center" data-testid={testId}>
      <div
        className={cn(
          "inline-flex size-12 rounded-full items-center justify-center mb-3",
          toneRing,
        )}
      >
        <Icon className="size-6" />
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
  if (variant === "bare") {
    return <div className={cn("py-10", className)}>{body}</div>;
  }
  return (
    <Card
      className={cn(
        "p-10 bg-card border-card-border border-dashed",
        className,
      )}
    >
      {body}
    </Card>
  );
}
