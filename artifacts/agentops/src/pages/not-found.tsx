import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { PageTransition } from "@/components/PageTransition";

export default function NotFound() {
  return (
    <PageTransition>
      <div className="min-h-[60vh] w-full flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <Card className="w-full max-w-md bg-card border-card-border">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2 items-center">
              <AlertCircle className="size-7 text-rose-300" />
              <h1 className="text-2xl font-semibold">Page not found</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              That route isn't part of the AgentOps Command Center yet.
            </p>
            <div className="mt-5">
              <Link href="/" data-testid="link-back-home">
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">Back to dashboard</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
