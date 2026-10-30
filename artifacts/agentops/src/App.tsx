import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import ProofLabPage from "@/pages/proof-lab";
import ProofFixturesPage from "@/pages/proof-fixtures";
import SharedProofPage from "@/pages/shared-proof";
import DashboardPage from "@/pages/dashboard";
import NewRequestPage from "@/pages/new-request";
import WorkflowsListPage from "@/pages/workflows-list";
import WorkflowDetailPage from "@/pages/workflow-detail";
import ApprovalsPage from "@/pages/approvals";
import AgentsPage from "@/pages/agents";
import KnowledgePage from "@/pages/knowledge";
import ToolCallsPage from "@/pages/tool-calls";
import SettingsPage from "@/pages/settings";
import OverviewPage from "@/pages/overview";
import ArchitecturePage from "@/pages/architecture";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useState, lazy, Suspense } from "react";
const HealthcareDemoPage = lazy(() => import("@/pages/healthcare-demo"));
const ProofEvaluationsPage = lazy(() => import("@/pages/proof-evaluations"));
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/CommandPalette";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/demo/healthcare">
        <Suspense
          fallback={
            <p className="p-8" role="status">
              Loading guided demo…
            </p>
          }
        >
          <HealthcareDemoPage />
        </Suspense>
      </Route>
      <Route path="/proof-lab" component={ProofLabPage} />
      <Route path="/evaluations"><Suspense fallback={<p className="p-8" role="status">Loading evaluation lab…</p>}><ProofEvaluationsPage /></Suspense></Route>
      <Route path="/proof-lab/fixtures" component={ProofFixturesPage} />
      <Route path="/proof-lab/:id" component={ProofLabPage} />
      <Route path="/requests/new" component={NewRequestPage} />
      <Route path="/workflows" component={WorkflowsListPage} />
      <Route path="/workflows/:id" component={WorkflowDetailPage} />
      <Route path="/approvals" component={ApprovalsPage} />
      <Route path="/agents" component={AgentsPage} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/tool-calls" component={ToolCallsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/overview" component={OverviewPage} />
      <Route path="/architecture" component={ArchitecturePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen((v) => !v));
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/proof/shared" component={SharedProofPage} />
            <Route>
              <AppShell onOpenPalette={() => setPaletteOpen(true)}>
                <ErrorBoundary>
                  <Router />
                </ErrorBoundary>
              </AppShell>
              <CommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
              />
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
