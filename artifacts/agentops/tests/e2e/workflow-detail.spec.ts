import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { seedFixtures, type FixtureMap } from "./global-setup";

let fixtures: FixtureMap;

test.beforeAll(async () => {
  if (process.env.E2E_FIXTURES) {
    fixtures = JSON.parse(process.env.E2E_FIXTURES) as FixtureMap;
  } else {
    fixtures = await seedFixtures();
  }
});

async function gotoWorkflow(page: Page, id: number) {
  await page.goto(`/workflows/${id}`);
  await expect(page.getByTestId("text-workflow-title")).toBeVisible();
}

test.describe("Workflow Run Detail page", () => {
  test("submitted: empty pipeline, run button, no brief or memory", async ({ page }) => {
    await gotoWorkflow(page, fixtures.submitted.workflow_id);

    await expect(page.getByTestId("graph-timeline")).toBeVisible();
    await expect(page.getByTestId("graph-node-ops_triage")).toHaveAttribute(
      "data-status",
      "pending",
    );
    await expect(page.getByTestId("graph-node-finalize")).toHaveAttribute(
      "data-status",
      "pending",
    );
    await expect(page.getByTestId("empty-agents")).toBeVisible();
    await expect(page.getByTestId("button-run-workflow")).toBeVisible();
    await expect(page.getByTestId("section-final-brief")).toHaveCount(0);
    await expect(page.getByTestId("section-retrieved-memory")).toHaveCount(0);
  });

  test("running: triage completed, memory step running", async ({ page }) => {
    await gotoWorkflow(page, fixtures.running.workflow_id);

    await expect(page.getByTestId("graph-node-ops_triage")).toHaveAttribute(
      "data-status",
      "completed",
    );
    await expect(page.getByTestId("graph-node-memory_retrieval")).toHaveAttribute(
      "data-status",
      "running",
    );
    await expect(page.getByTestId("graph-node-legal_review")).toHaveAttribute(
      "data-status",
      "pending",
    );
    await expect(page.getByTestId("section-final-brief")).toHaveCount(0);
  });

  test("approval_pending: graph statuses, memory section, click-to-scroll, tab switching", async ({
    page,
  }) => {
    await gotoWorkflow(page, fixtures.approval_pending.workflow_id);

    for (const key of [
      "ops_triage",
      "memory_retrieval",
      "legal_review",
      "finance_review",
      "communications",
      "approval",
    ]) {
      await expect(page.getByTestId(`graph-node-${key}`)).toHaveAttribute(
        "data-status",
        "completed",
      );
    }
    await expect(page.getByTestId("graph-node-finalize")).toHaveAttribute(
      "data-status",
      "pending",
    );

    await expect(page.getByTestId("section-retrieved-memory")).toBeVisible();
    await expect(page.getByTestId("memory-hit-99901")).toBeVisible();
    await expect(page.getByTestId("section-tool-calls")).toBeVisible();
    await expect(page.getByTestId("section-approval-decision")).toBeVisible();
    await expect(page.getByTestId("section-final-brief")).toHaveCount(0);

    // Click-to-scroll: clicking a graph node brings the matching agent panel
    // into view (scrollIntoView is invoked from the click handler).
    const legalPanel = page.getByTestId("agent-panel-legal_review");
    await page.getByTestId("graph-node-legal_review").click();
    await expect(legalPanel).toBeInViewport();

    // Ensure the panel body is expanded before interacting with its tabs.
    const summaryTab = page.getByTestId("tab-summary-legal_review");
    if (!(await summaryTab.isVisible())) {
      await page.getByTestId("agent-header-legal_review").click();
    }
    await expect(summaryTab).toBeVisible();

    // Summary tab content.
    await summaryTab.click();
    const summaryContent = page.getByTestId("summary-legal_review");
    await expect(summaryContent).toBeVisible();
    await expect(summaryContent).toContainText("Vendor warranty acceptable");

    // Switch to the Findings tab (scoped to this panel — labels repeat across panels).
    const tabsList = legalPanel.locator('[role="tablist"]');
    await tabsList.getByRole("tab", { name: /Findings/ }).click();
    await expect(legalPanel.getByText("Warranty: 10 years")).toBeVisible();
    await expect(summaryContent).toHaveCount(0);
  });

  test("approval_pending: approval form submits and persists", async ({ page }) => {
    await gotoWorkflow(page, fixtures.approval_pending.workflow_id);

    const approvalSection = page.getByTestId("section-approval-decision");
    await expect(approvalSection).toBeVisible();

    const approverInput = page.getByTestId("input-approver");
    await approverInput.fill("E2E Reviewer");
    await page.getByTestId("input-note").fill("approved by e2e");
    await page.getByTestId("button-approve").click();

    await expect(page.getByTestId("badge-approval-status")).toHaveText(
      /approved/i,
    );
    await expect(page.getByTestId("text-decided-by")).toContainText(
      "E2E Reviewer",
    );
    await expect(page.getByTestId("text-decision-note")).toContainText(
      "approved by e2e",
    );
    await expect(page.getByTestId("input-approver")).toHaveCount(0);
    await expect(page.getByTestId("button-approve")).toHaveCount(0);

    // DB-side persistence check.
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{
        status: string;
        decided_by: string | null;
        decision_note: string | null;
      }>(
        `SELECT status, decided_by, decision_note FROM approval_requests WHERE id = $1`,
        [fixtures.approval_pending.approval_id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("approved");
      expect(rows[0]!.decided_by).toBe("E2E Reviewer");
      expect(rows[0]!.decision_note).toBe("approved by e2e");
    } finally {
      await client.end();
    }
  });

  test("finalized: final executive brief renders with summary, recommendation, evidence, next actions", async ({
    page,
  }) => {
    await gotoWorkflow(page, fixtures.finalized.workflow_id);

    const brief = page.getByTestId("section-final-brief");
    await expect(brief).toBeVisible();
    await expect(page.getByTestId("brief-summary")).toContainText(
      "E2E executive summary text",
    );
    await expect(page.getByTestId("brief-recommendation")).toContainText(
      "Approve vendor with conditions",
    );
    await expect(page.getByTestId("brief-evidence-0")).toBeVisible();
    await expect(page.getByTestId("brief-next-action-0")).toBeVisible();
  });

  test("failed: legal failed, downstream skipped, no brief, run still allowed", async ({
    page,
  }) => {
    await gotoWorkflow(page, fixtures.failed.workflow_id);

    await expect(page.getByTestId("graph-node-ops_triage")).toHaveAttribute(
      "data-status",
      "completed",
    );
    await expect(page.getByTestId("graph-node-legal_review")).toHaveAttribute(
      "data-status",
      "failed",
    );
    await expect(page.getByTestId("graph-node-finance_review")).toHaveAttribute(
      "data-status",
      "skipped",
    );
    await expect(page.getByTestId("graph-node-finalize")).toHaveAttribute(
      "data-status",
      "skipped",
    );
    await expect(page.getByTestId("section-final-brief")).toHaveCount(0);
    await expect(page.getByTestId("button-run-workflow")).toBeVisible();
  });
});
