import { expect, test } from "./estimate-playwright-test";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";

const RECOVERY_KEY = "hh_estimate_new_draft_v1";

test("new Estimate recovery is explicit, stale-safe, faithful, and clears after save", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clientName = `PW Recovery Client ${suffix}`;
  const projectName = `PW Recovery Project ${suffix}`;
  const lineTitle = `PW Recovery Line ${suffix}`;
  const persistedTitle = `${lineTitle} persisted`;
  let createdUrl: string | null = null;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");
  await page.evaluate((key) => window.localStorage.removeItem(key), RECOVERY_KEY);
  await reloadWithE2EAuth(page);

  try {
    await page.getByRole("button", { name: "Edit details" }).click();
    const details = page.getByRole("dialog", {
      name: "Customer / project / pricing details",
    });
    await details.getByPlaceholder("Client or company name").fill(clientName);
    await details.getByPlaceholder("Project name").fill(projectName);
    await details.getByLabel("Tax amount").fill("75");
    await details.getByRole("spinbutton", { name: "Discount", exact: true }).fill("15");
    await details.getByRole("button", { name: "Save", exact: true }).click();

    await page.getByRole("button", { name: "Add Section", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Blank section", exact: true }).click();
    await page.getByLabel("Line item 1 title").locator("visible=true").fill(lineTitle);
    await page
      .getByRole("button", { name: "Line item 1 description" })
      .locator("visible=true")
      .click();
    await page
      .getByRole("textbox", { name: "Line item 1 description" })
      .locator("visible=true")
      .fill("Recovery preserves the complete supported line item.");
    await page.getByTestId("estimate-description-done").click();
    await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("2");
    await page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true").fill("LS");
    await page
      .getByLabel("Line item 1 unit price", { exact: true })
      .locator("visible=true")
      .fill("500");

    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByRole("menuitem", { name: "Assumptions" }).click();
    await page
      .getByLabel("Assumptions body")
      .last()
      .fill("Recovery keeps Estimate notes and clarifications.");

    await page.getByRole("button", { name: "Schedule Payment" }).click();
    const schedule = page.getByRole("dialog", { name: "Schedule Payment" });
    await schedule.getByLabel("Payment Name").fill("Recovery deposit");
    await schedule.getByLabel("Amount").fill("100");
    await schedule.getByLabel("Description", { exact: true }).fill("Tax-inclusive milestone draft");
    await schedule.getByLabel("Due Date").fill("2026-09-01");
    await schedule.getByRole("button", { name: "Save", exact: true }).click();

    const localState = page.getByTestId("estimate-recovery-state");
    await expect(localState).toHaveAttribute("data-recovery-state", "recoverable", {
      timeout: 10_000,
    });
    const totalBeforeRefresh = await page
      .getByLabel("Estimate pricing summary")
      .getByText("$1,060.00", { exact: true })
      .first()
      .textContent();

    await reloadWithE2EAuth(page);
    const notice = page.getByTestId("estimate-recovery-notice");
    await expect(notice).toHaveAttribute("data-recovery-state", "recoverable");
    await expect(notice).toContainText(clientName);
    await expect(page.getByTestId("estimate-new-header")).not.toContainText(clientName);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(notice.getByRole("button", { name: "Recover", exact: true })).toBeVisible();
    await expect(notice.getByRole("button", { name: "Discard local draft" })).toBeVisible();
    await notice.getByRole("button", { name: "Recover", exact: true }).click();

    const recoveredLineCard = page.getByRole("article").filter({ hasText: lineTitle });
    await expect(recoveredLineCard).toBeVisible();
    await expect(recoveredLineCard).toContainText("2 LS × $500.00");
    await expect(recoveredLineCard).toContainText("$1,000.00");
    await expect(page.getByText("Recovery keeps Estimate notes and clarifications.")).toBeVisible();
    await expect(page.getByText("Recovery deposit", { exact: true })).toBeVisible();
    await expect(
      page
        .getByText(totalBeforeRefresh ?? "$1,060.00", { exact: true })
        .locator("visible=true")
        .first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(details.getByLabel("Tax amount")).toHaveValue("75");
    await expect(details.getByRole("spinbutton", { name: "Discount", exact: true })).toHaveValue(
      "15"
    );
    await details.getByRole("button", { name: "Save", exact: true }).click();

    await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error("Expected current recovery envelope");
      const envelope = JSON.parse(raw) as {
        updatedAt: number;
        draft: { clientName: string };
      };
      envelope.updatedAt = Date.now() + 1000;
      envelope.draft.clientName = "Conflicting browser draft";
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: JSON.stringify(envelope) })
      );
    }, RECOVERY_KEY);
    await expect(notice).toHaveAttribute("data-recovery-state", "stale");
    await expect(notice).toContainText("will not replace this page unless you recover it");
    await notice.getByRole("button", { name: "Discard local draft" }).click();
    await expect(notice).toBeHidden();
    await expect(page.getByTestId("estimate-new-header")).toContainText(clientName);

    const createdDetailRsc = page.waitForResponse(
      (response) => {
        const request = response.request();
        const headers = request.headers();
        return (
          /^\/estimates\/[^/]+$/.test(new URL(response.url()).pathname) &&
          new URL(response.url()).pathname !== "/estimates/new" &&
          headers["rsc"] === "1" &&
          headers["next-action"] === undefined &&
          headers["next-router-prefetch"] !== "1"
        );
      },
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "Save Estimate" }).click();
    expect((await createdDetailRsc).ok()).toBe(true);
    await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    createdUrl = page.url().replace(/\?.*$/, "");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), RECOVERY_KEY)).toBeNull();

    await page.setViewportSize({ width: 1440, height: 1000 });
    const header = page.getByTestId("estimate-detail-header");
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const existingTitle = page.getByLabel("Line item title").locator("visible=true").first();
    await existingTitle.fill(persistedTitle);
    await existingTitle.press("Tab");
    await expect(header.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });

    await reloadWithE2EAuth(page);
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Line item title").locator("visible=true").first()).toHaveValue(
      persistedTitle
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const editActions = page.getByLabel("Estimate edit actions");
    await expect(editActions.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
    await expect(editActions.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await editActions.getByRole("button", { name: "Save", exact: true }).click();
    await expect(header.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  } finally {
    await page.evaluate((key) => window.localStorage.removeItem(key), RECOVERY_KEY).catch(() => {});
    if (createdUrl) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await gotoWithE2EAuth(page, createdUrl);
      const deleteButton = page.getByRole("button", { name: "Delete estimate" });
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();
      } else {
        await page.getByRole("button", { name: "Estimate actions" }).click();
        await page.getByRole("menuitem", { name: "Delete estimate" }).click();
      }
      if (
        await page
          .getByRole("dialog", { name: "Delete estimate?" })
          .isVisible()
          .catch(() => false)
      ) {
        await page
          .getByRole("dialog", { name: "Delete estimate?" })
          .getByRole("button", { name: "Delete", exact: true })
          .click();
        await expect(page).toHaveURL(/\/estimates(?:\?|$)/, { timeout: 30_000 });
        await page.waitForLoadState("networkidle");
      }
    }
  }
});
