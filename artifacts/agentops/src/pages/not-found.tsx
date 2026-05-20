import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { EmptyState } from "@/components/EmptyState";
import { IllNotFound } from "@/components/illustrations";

export default function NotFound() {
  return (
    <PageTransition>
      <div className="min-h-[60vh] w-full flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="w-full max-w-md">
          <EmptyState
            illustration={<IllNotFound />}
            title="Page not found"
            description="That route isn't part of the AgentOps Command Center yet."
            testId="empty-not-found"
            action={
              <Link href="/" data-testid="link-back-home">
                <Button variant="outline" asChild>
                  <span className="cursor-pointer">
                    <ArrowLeft className="size-3.5" /> Back to dashboard
                  </span>
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    </PageTransition>
  );
}
