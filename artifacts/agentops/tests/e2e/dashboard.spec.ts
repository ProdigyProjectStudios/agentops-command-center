import { test, expect } from "@playwright/test";
import { formatCurrencyCents } from "../../src/lib/format";
import {
  seedDashboardFixtures,
  type DashboardFixtures,
} from "./global-setup";

let fixtures: DashboardFixtures;

// IMPORTANT: always reseed inside this spec rather than reusing the cached
// E2E_DASHBOARD_FIXTURES from global-setup. The dashboard route aggregates
// state across the whole DB, and other specs (notably approvals.spec.ts)
// mutate metric inputs — e.g. flipping a pending approval to approved would
// invalidate a stale `baseline + delta` calculation captured at global-setup
// time. Re-seeding immediately before the assertions guarantees the baseline
// reflects the DB state the dashboard is about to read.
test.beforeAll(async () => {
  fixtures = await seedDashboardFixtures();
});

test.describe("Operations Dashboard page", () => {
  test("loads with seeded data and metric tiles reflect the expected counts", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("text-page-title")).toBeVisible();

    const { baseline, deltas } = fixtures;

    // Metric tiles: expected = baseline (captured by the seed) + delta
    // (hardcoded contributions from the seeded workflows).
    await expect(page.getByTestId("metric-active-workflows-value")).toHaveText(
      String(baseline.activeWorkflows + deltas.activeWorkflows),
    );
    await expect(page.getByTestId("metric-pending-approvals-value")).toHaveText(
      String(baseline.pendingApprovals + deltas.pendingApprovals),
    );
    await expect(page.getByTestId("metric-agent-actions-value")).toHaveText(
      String(baseline.agentActionsToday + deltas.agentActionsToday),
    );
    await expect(page.getByTestId("metric-compliance-risks-value")).toHaveText(
      String(
        baseline.complianceRisksFlagged + deltas.complianceRisksFlagged,
      ),
    );

    // Cost impact is rendered through formatCurrencyCents() (defined in
    // src/lib/format.ts). Mirror that formatter here so we can assert the
    // exact rendered text for baseline + delta cents.
    const expectedCents =
      baseline.estimatedCostImpactCents + deltas.estimatedCostImpactCents;
    await expect(page.getByTestId("metric-cost-impact-value")).toHaveText(
      formatCurrencyCents(expectedCents),
    );
  });

  test("recent workflows list renders the seeded workflow rows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("text-page-title")).toBeVisible();

    // The three fixture workflows were inserted most recently, and the list
    // is ordered by createdAt DESC and sliced to the top 6, so all three
    // must be visible.
    for (const id of fixtures.workflowIds) {
      const row = page.getByTestId(`row-workflow-${id}`);
      await expect(row).toBeVisible();
    }

    // Sanity-check that the first seeded row carries its unique title text
    // (proves the row is wired to the right workflow record, not just the
    // right id).
    await expect(
      page.getByTestId(`row-workflow-${fixtures.workflowIds[0]}`),
    ).toContainText(fixtures.workflowTitles[0]!);

    // The corresponding status badge resolves (not skeleton).
    await expect(
      page.getByTestId(`badge-status-${fixtures.workflowIds[0]}`),
    ).toBeVisible();
  });

  test("recent activity list renders entries from seeded workflows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("text-page-title")).toBeVisible();

    // The dashboard route returns the 10 most-recent activity rows and the
    // page slices to the first 8. Our three fixture entries were inserted
    // last and must appear.
    for (let i = 0; i < fixtures.activityIds.length; i++) {
      const id = fixtures.activityIds[i]!;
      const message = fixtures.activityMessages[i]!;
      const entry = page.getByTestId(`activity-${id}`);
      await expect(entry).toBeVisible();
      await expect(entry).toContainText(message);
      await expect(entry).toContainText("e2e-dashboard");
    }
  });
});
