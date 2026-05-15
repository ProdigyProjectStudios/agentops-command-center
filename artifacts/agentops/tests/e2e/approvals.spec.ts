import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import {
  seedApprovalsFixtures,
  type ApprovalFixtureMap,
} from "./global-setup";

let fixtures: ApprovalFixtureMap;

test.beforeAll(async () => {
  if (process.env.E2E_APPROVAL_FIXTURES) {
    fixtures = JSON.parse(
      process.env.E2E_APPROVAL_FIXTURES,
    ) as ApprovalFixtureMap;
  } else {
    fixtures = await seedApprovalsFixtures();
  }
});

async function gotoApprovals(page: Page) {
  await page.goto(`/approvals`);
  await expect(page.getByTestId("text-page-title")).toBeVisible();
  await expect(page.getByTestId("tabs-filter")).toBeVisible();
}

test.describe("Approval Queue page", () => {
  test("pending tab: seeded pending row renders with status + risk badges and links to its workflow", async ({
    page,
  }) => {
    await gotoApprovals(page);

    const card = page.getByTestId(`approval-card-${fixtures.pending.approval_id}`);
    await expect(card).toBeVisible();

    const statusBadge = page.getByTestId(
      `approval-status-${fixtures.pending.approval_id}`,
    );
    await expect(statusBadge).toHaveText(/pending/i);

    await expect(
      page.getByTestId(`approval-summary-${fixtures.pending.approval_id}`),
    ).toContainText(fixtures.pending.summary);

    const link = page.getByTestId(
      `link-workflow-${fixtures.pending.approval_id}`,
    );
    await expect(link).toHaveAttribute(
      "href",
      `/workflows/${fixtures.pending.workflow_id}`,
    );

    // Decided rows are filtered out of the default Pending view.
    await expect(
      page.getByTestId(`approval-card-${fixtures.approved.approval_id}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`approval-card-${fixtures.rejected.approval_id}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`approval-card-${fixtures.revision_requested.approval_id}`),
    ).toHaveCount(0);
  });

  test("filter tabs scope the queue to a single status", async ({ page }) => {
    await gotoApprovals(page);

    // Approved tab.
    await page.getByTestId("tab-approved").click();
    const approvedCard = page.getByTestId(
      `approval-card-${fixtures.approved.approval_id}`,
    );
    await expect(approvedCard).toBeVisible();
    await expect(
      page.getByTestId(`approval-status-${fixtures.approved.approval_id}`),
    ).toHaveText(/approved/i);
    await expect(
      page.getByTestId(`approval-card-${fixtures.pending.approval_id}`),
    ).toHaveCount(0);

    // Rejected tab.
    await page.getByTestId("tab-rejected").click();
    await expect(
      page.getByTestId(`approval-card-${fixtures.rejected.approval_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`approval-status-${fixtures.rejected.approval_id}`),
    ).toHaveText(/rejected/i);
    await expect(
      page.getByTestId(`approval-card-${fixtures.approved.approval_id}`),
    ).toHaveCount(0);

    // Revision tab.
    await page.getByTestId("tab-revision_requested").click();
    await expect(
      page.getByTestId(
        `approval-card-${fixtures.revision_requested.approval_id}`,
      ),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `approval-status-${fixtures.revision_requested.approval_id}`,
      ),
    ).toHaveText(/revision/i);

    // All tab shows decided + pending fixtures together.
    await page.getByTestId("tab-all").click();
    await expect(
      page.getByTestId(`approval-card-${fixtures.pending.approval_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`approval-card-${fixtures.approved.approval_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`approval-card-${fixtures.rejected.approval_id}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `approval-card-${fixtures.revision_requested.approval_id}`,
      ),
    ).toBeVisible();
  });

  test("clicking the workflow link navigates to the run detail page", async ({
    page,
  }) => {
    await gotoApprovals(page);
    await page
      .getByTestId(`link-workflow-${fixtures.pending.approval_id}`)
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/workflows/${fixtures.pending.workflow_id}(?:$|[/?#])`),
    );
    await expect(page.getByTestId("text-workflow-title")).toBeVisible();
  });

  test("approving a pending row removes it from Pending, surfaces it on Approved, and persists in the DB", async ({
    page,
  }) => {
    await gotoApprovals(page);

    const id = fixtures.pending.approval_id;
    const card = page.getByTestId(`approval-card-${id}`);
    await expect(card).toBeVisible();

    await page.getByTestId(`button-decide-${id}`).click();

    const approverInput = page.getByTestId(`input-decided-by-${id}`);
    await approverInput.fill("E2E Queue Reviewer");
    await page.getByTestId(`input-note-${id}`).fill("approved via queue e2e");
    await page.getByTestId(`button-approve-${id}`).click();

    // Optimistic update + refetch should drop the row from Pending.
    await expect(card).toHaveCount(0);

    // The row should now be visible (and approved) on the Approved tab.
    await page.getByTestId("tab-approved").click();
    await expect(page.getByTestId(`approval-card-${id}`)).toBeVisible();
    await expect(page.getByTestId(`approval-status-${id}`)).toHaveText(
      /approved/i,
    );

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
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("approved");
      expect(rows[0]!.decided_by).toBe("E2E Queue Reviewer");
      expect(rows[0]!.decision_note).toBe("approved via queue e2e");
    } finally {
      await client.end();
    }
  });
});
