import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import DashboardPage from "@/pages/dashboard";
import NewRequestPage from "@/pages/new-request";
import WorkflowsListPage from "@/pages/workflows-list";
import WorkflowDetailPage from "@/pages/workflow-detail";
import { ComingSoon } from "@/pages/coming-soon";
import NotFound from "@/pages/not-found";

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
      <Route path="/approvals">
        <ComingSoon
          title="Approval Queue"
          description="Triage every pending decision across the portfolio in one place."
        />
      </Route>
      <Route path="/agents">
        <ComingSoon
          title="Agent Directory"
          description="Browse the multi-agent crew, their tools, and live activity."
        />
      </Route>
      <Route path="/knowledge">
        <ComingSoon
          title="Knowledge Base"
          description="Policy docs and SOPs the agents reference during reasoning."
        />
      </Route>
      <Route path="/tool-calls">
        <ComingSoon
          title="Tool Call History"
          description="Full forensic log of every external API call agents have made."
        />
      </Route>
      <Route path="/settings">
        <ComingSoon
          title="Settings"
          description="Toggle demo vs. live mode and configure portfolio companies."
        />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppShell>
            <Router />
          </AppShell>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
