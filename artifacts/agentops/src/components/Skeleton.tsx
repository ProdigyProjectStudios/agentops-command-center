import { cn } from "@/lib/utils";

export function Shimmer({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("skeleton-shimmer", className)}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}
