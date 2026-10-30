import { test, expect, type Page } from "@playwright/test";
import type { ProofRun } from "@workspace/api-zod";

async function correctedCase(
  page: Page,
  workflow: "authorization" | "revenue-cycle",
) {
  await page.goto("/demo/healthcare");
  if (workflow === "revenue-cycle")
    await page
      .getByRole("button", { name: /Revenue-cycle preparation/ })
      .click();
  await page
    .getByRole("button", { name: `Begin ${workflow} walkthrough` })
    .click();
  await expect(
    page.getByRole("button", { name: "05 Review the decision" }),
  ).toBeDisabled();
  const blockedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/proof/runs") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Run evidence checks", exact: true })
    .click();
  const blocked = (await (await blockedResponse).json()) as ProofRun;
  expect(blocked.status).toBe("blocked");
  await expect(
    page.getByText("Submission blocked by the server"),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name:
        workflow === "authorization"
          ? "I have supplied the synthetic supporting note for this case."
          : "I have reconciled the duplicate flag in this synthetic case.",
    })
    .check();
  const readyResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/proof/runs") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Re-evaluate corrected packet" })
    .click();
  const ready = (await (await readyResponse).json()) as ProofRun;
  expect(ready.id).not.toBe(blocked.id);
  expect(ready.status).toBe("awaiting-review");
  await expect(
    page.getByRole("heading", { name: "What executes automatically?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to human review" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "05 Review the decision" }),
  ).toBeDisabled();
  const graphResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/proof/runs/${ready.id}/graph`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run demo agent execution" }).click();
  const graph = (await (await graphResponse).json()) as ProofRun;
  expect(graph.graph?.state).toBe("ready");
  expect(graph.graph?.mode).toBe("demo");
  expect(graph.graph?.snapshot?.nodes).toHaveLength(7);
  await expect(
    page.getByText("Demo · zero model calls", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to human review" }).click();
  await expect(
    page.getByRole("heading", { name: "Who controls the action?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inspect original blocked run" }),
  ).toHaveAttribute("href", `/proof-lab/${blocked.id}`);
  return graph;
}

test("authorization: source exception → real graph → bound approval → verified receipt, restored after reload", async ({
  page,
}) => {
  const graph = await correctedCase(page, "authorization");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Who controls the action?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run demo agent execution" }),
  ).toHaveCount(0);
  const reviewResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/proof/runs/${graph.id}/review`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Approve & submit to sandbox" })
    .click();
  const approved = (await (await reviewResponse).json()) as ProofRun;
  expect(approved.status).toBe("completed");
  expect(approved.graph?.finalization?.state).toBe("completed");
  expect(approved.receipt?.graph?.fingerprint).toBe(graph.graph?.fingerprint);
  expect(approved.receipt?.graph?.workflowRunId).toBe(
    graph.graph?.workflowRunId,
  );
  await expect(
    page.getByRole("button", { name: "Discuss the partnership", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Verify receiver receipt", exact: true })
    .click();
  await expect(
    page.getByText("Receipt verified during this walkthrough.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discuss the partnership", exact: true })
    .click();
  await expect(
    page.getByText("Sandbox receipt independently rechecked", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What is working today?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "05 Review the decision" }),
  ).toBeDisabled();
});

test("revenue-cycle: human rejection finalizes the graph without creating delivery", async ({
  page,
}) => {
  const graph = await correctedCase(page, "revenue-cycle");
  const reviewResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/proof/runs/${graph.id}/review`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Reject without delivery", exact: true })
    .click();
  const rejected = (await (await reviewResponse).json()) as ProofRun;
  expect(rejected.status).toBe("rejected");
  expect(rejected.receipt).toBeNull();
  expect(rejected.graph?.finalization?.state).toBe("completed");
  await expect(
    page.getByRole("heading", { name: "The operator rejected the packet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify receiver receipt" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Discuss the partnership", exact: true })
    .click();
  await expect(
    page.getByText("No submission: packet rejected", { exact: true }),
  ).toBeVisible();
});

test("overview and command search lead to the demo; mobile navigation and stage layout fit", async ({
  page,
}) => {
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", {
      name: "Agent workflows with evidence you can inspect.",
    }),
  ).toBeVisible();
  await page.getByTestId("overview-cta-demo").click();
  await expect(page).toHaveURL(/\/demo\/healthcare$/);
  await page.getByTestId("button-open-command-palette").click();
  await page.getByTestId("command-palette-input").fill("Evaluations");
  await page.getByTestId("command-page-_evaluations").click();
  await expect(page).toHaveURL(/\/evaluations$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("button-mobile-menu").click();
  await page.getByTestId("mobile-nav-guided-demo").click();
  await expect(page).toHaveURL(/\/demo\/healthcare$/);
  await expect(
    page.getByRole("heading", { name: "What is working today?" }),
  ).toBeVisible();
  await expect(page.getByTestId("mobile-nav-guided-demo")).not.toBeVisible();
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole("button", { name: "Presenter notes off" }).click();
  await expect(page.getByText("Presenter cue", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Begin authorization walkthrough" })
    .click();
  await expect(
    page.getByRole("heading", { name: "What evidence comes in?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous step" }).click();
  await expect(
    page.getByRole("heading", { name: "What is working today?" }),
  ).toBeVisible();
});
