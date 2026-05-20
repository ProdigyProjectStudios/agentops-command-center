import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
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
import { useState } from "react";
import { CommandPalette, useCommandPaletteShortcut } from "@/components/CommandPalette";

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
          <AppShell onOpenPalette={() => setPaletteOpen(true)}>
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
          </AppShell>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
