import { cn } from "@/lib/utils";

export function StatusBadge({
  className,
  children,
  testId,
}: {
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}
