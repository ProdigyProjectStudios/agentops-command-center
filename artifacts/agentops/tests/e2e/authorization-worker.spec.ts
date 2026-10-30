import { test, expect, type Page } from "@playwright/test";
import type { ProofRun } from "@workspace/api-zod";

test.use({ video: "on" });
async function check(page: Page, button: string): Promise<ProofRun> {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/proof/runs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: button, exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  return result.json();
}
async function ready(page: Page) {
  await page.goto("/workers/authorization");
  const blocked = await check(page, "Check evidence");
  expect(blocked.status).toBe("blocked");
  await expect(
    page.getByRole("heading", { name: "Evidence needs human intervention" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Supply the synthetic signed note" })
    .click();
  const corrected = await check(page, "Check evidence");
  expect(corrected.status).toBe("awaiting-review");
  await expect(
    page.getByRole("button", { name: "Approve sandbox submission" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /three real model calls/ }).check();
  const live = await check(page, "Run live AI worker");
  expect(live.analysis.specialists).toHaveLength(3);
  // A real backend/provider HTTP contract test; the provider itself is an explicitly labelled CI fixture.
  expect(live.analysis.aiReview?.notes[0].explanation).toContain(
    "CI provider fixture",
  );
  return live;
}
test("authorization worker: exception, live-provider contract, persisted review, receipt, export and public proof", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const draft = await ready(page);
  await page.reload();
  await expect(
    page.getByText("3 provider reviews recorded", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I inspected the source evidence/ })
    .check();
  await page
    .getByLabel("Human review note")
    .fill(
      "Inspected sources, fictional policy, three reviewer outputs and exact packet. CI fixture evaluation.",
    );
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/runs/${draft.id}/review`),
  );
  await page
    .getByRole("button", { name: "Approve sandbox submission" })
    .click();
  const done = await (await response).json();
  expect(done.status).toBe("completed");
  await page.getByRole("button", { name: "Verify receiver receipt" }).click();
  await expect(
    page.getByText("Receiver record matches the approved packet.", {
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence JSON" }).click();
  expect((await download).suggestedFilename()).toContain(draft.id);
  await page.getByRole("checkbox", { name: /Allow a read-only link/ }).check();
  await page
    .getByRole("button", { name: "Create read-only proof link" })
    .click();
  const href = await page
    .getByRole("link", { name: "Open shared evidence" })
    .getAttribute("href");
  const publicPage = await context.newPage();
  await publicPage.goto(href!);
  await expect(
    publicPage.getByText(done.receipt.id, { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("heading", {
      name: "Authorization evidence worker",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("authorization-worker-desktop-viewport.png"),
  });
  await page.screenshot({
    path: test.info().outputPath("authorization-worker-desktop.png"),
    fullPage: true,
  });
});
test("authorization worker: mobile rejection records the decision without delivery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const draft = await ready(page);
  await page
    .getByRole("checkbox", { name: /I inspected the source evidence/ })
    .check();
  await page
    .getByLabel("Human review note")
    .fill("Human review declines this synthetic packet.");
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/runs/${draft.id}/review`),
  );
  await page.getByRole("button", { name: "Reject packet" }).click();
  const run = await (await response).json();
  expect(run.status).toBe("rejected");
  expect(run.receipt).toBeNull();
  expect(run.delivery.attempts).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", {
      name: "Authorization evidence worker",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("authorization-worker-mobile-viewport.png"),
  });
  await page.screenshot({
    path: test.info().outputPath("authorization-worker-mobile.png"),
    fullPage: true,
  });
});
test("authorization worker: provider failure keeps approval locked and preserves saved source checks", async ({
  page,
}) => {
  await page.goto("/workers/authorization");
  await check(page, "Check evidence");
  await page
    .getByRole("button", { name: "Supply the synthetic signed note" })
    .click();
  const note = page.getByLabel("supporting-note.txt", { exact: true });
  await note.fill((await note.inputValue()) + "\nTEST_PROVIDER_FAILURE");
  const rules = await check(page, "Check evidence");
  await page.getByRole("checkbox", { name: /three real model calls/ }).check();
  await page.getByRole("button", { name: "Run live AI worker" }).click();
  await expect(page.getByRole("alert")).toContainText("Live AI review failed", {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Approve sandbox submission" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText(`Saved execution timeline · ${rules.id}`),
  ).toBeVisible();
  await expect(
    page.getByText("Live AI not yet demonstrated for this case", {
      exact: true,
    }),
  ).toBeVisible();
});
