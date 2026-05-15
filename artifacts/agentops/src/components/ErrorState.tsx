import { type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Something went sideways",
  description,
  onRetry,
  action,
  testId = "error-state",
  className,
  variant = "card",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  testId?: string;
  className?: string;
  variant?: "card" | "bare";
}) {
  const body = (
    <div className="text-center" data-testid={testId}>
      <div className="inline-flex size-12 rounded-full bg-rose-500/15 text-rose-300 items-center justify-center mb-3">
        <AlertTriangle className="size-6" />
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {description}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            data-testid={`${testId}-retry`}
          >
            <RotateCw className="size-3.5" /> Retry
          </Button>
        )}
        {action}
      </div>
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
