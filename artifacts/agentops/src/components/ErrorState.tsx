import { type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IllError } from "@/components/illustrations";

export function ErrorState({
  title = "Something went sideways",
  description,
  onRetry,
  action,
  testId = "error-state",
  className,
  variant = "card",
  illustration,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  testId?: string;
  className?: string;
  variant?: "card" | "bare";
  illustration?: ReactNode | "default" | "none";
}) {
  const illEl =
    illustration === "none"
      ? null
      : illustration && illustration !== "default"
        ? illustration
        : (
          <div className="mx-auto mb-4 w-[180px] max-w-full text-muted-foreground/70">
            <IllError />
          </div>
        );
  const body = (
    <div className="text-center" data-testid={testId}>
      {illEl ?? (
        <div className="inline-flex size-12 rounded-full bg-rose-500/15 text-rose-300 items-center justify-center mb-3">
          <AlertTriangle className="size-6" />
        </div>
      )}
      <h3 className="text-base font-semibold mb-1 tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
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
        "p-10 surface-raised border-dashed",
        className,
      )}
    >
      {body}
    </Card>
  );
}
