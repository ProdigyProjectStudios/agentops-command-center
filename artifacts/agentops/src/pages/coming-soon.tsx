import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <Card className="p-12 bg-card border-card-border border-dashed text-center">
        <div className="inline-flex size-12 rounded-full bg-primary/10 text-primary items-center justify-center mb-4">
          <Construction className="size-6" />
        </div>
        <h3 className="text-base font-semibold mb-1">Coming in the next milestone</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The {title} workspace is queued for the next task in the build plan. The backend already
          serves data — only the page UI is pending.
        </p>
      </Card>
    </div>
  );
}
