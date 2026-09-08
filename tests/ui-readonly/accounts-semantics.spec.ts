import { test, expect } from "./fixture";

// Accounts uses a zero-argument read Server Action. Only that POST is allowed;
// create/update/delete require arguments and remain blocked by this smoke guard.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Accounts read states and Finance regression ${viewport.width}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL!).hostname);
    await page.setViewportSize(viewport);
    let mode: "live" | "empty" | "data" | "query-error" | "permission-error" = "live";
    let readCalls = 0;
    let cashUnavailable = false;
    let readGate: Promise<void> | null = null;
    let readTemplate: { body: string; headers: Record<string, string>; status: number } | null =
      null;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        cashUnavailable &&
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/financial/accounts" &&
        request.headers().rsc === "1"
      ) {
        const response = await route.fetch();
        let replaced = false;
        const replaceCash = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          if ("cashOverview" in value) {
            (value as { cashOverview: unknown }).cashOverview = null;
            replaced = true;
          }
          for (const child of Object.values(value)) replaceCash(child);
        };
        const body = (await response.text())
          .split("\n")
          .map((line) => {
            const colon = line.indexOf(":");
            if (colon < 0) return line;
            let frame: unknown;
            try {
              frame = JSON.parse(line.slice(colon + 1));
            } catch {
              return line;
            }
            replaceCash(frame);
            return line.slice(0, colon + 1) + JSON.stringify(frame);
          })
          .join("\n");
        expect(replaced, "Existing Accounts server cash-source result frame").toBe(true);
        return route.fulfill({ response, body });
      }
      if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.fallback();
      if (
        new URL(request.url()).pathname === "/financial/accounts" &&
        request.headers()["next-action"] &&
        request.postData()?.trim() === "[]"
      ) {
        if (readGate) await readGate;
        readCalls += 1;
        if (mode === "live" || !readTemplate) {
          const response = await route.fetch();
          readTemplate = {
            body: await response.text(),
            headers: response.headers(),
            status: response.status(),
          };
        }
        if (mode === "live") return route.fulfill(readTemplate);
        let replaced = false;
        const body = readTemplate.body
          .split("\n")
          .map((line) => {
            const colon = line.indexOf(":");
            if (colon < 0) return line;
            let value;
            try {
              value = JSON.parse(line.slice(colon + 1));
            } catch {
              return line;
            }
            if (!value || !Array.isArray(value.accounts)) return line;
            replaced = true;
            const result =
              mode === "data"
                ? {
                    accounts: [
                      {
                        id: "00000000-0000-4000-8000-000000000098",
                        name: "PW Accounts smoke",
                        type: "Bank",
                        lastFour: "1234",
                        notes: null,
                      },
                    ],
                  }
                : mode === "empty"
                  ? { accounts: [] }
                  : {
                      accounts: [],
                      error:
                        mode === "permission-error"
                          ? "Owner or admin permission required."
                          : "Accounts query unavailable. Please retry.",
                    };
            return line.slice(0, colon + 1) + JSON.stringify(result);
          })
          .join("\n");
        expect(replaced, "existing Accounts read-action result frame").toBe(true);
        return route.fulfill({ ...readTemplate, body });
      }
      return route.abort("blockedbyclient");
    });

    const response = await page.goto("/financial/accounts");
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-app-scroll-root]")).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByText("Total accounts", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText("Bank reconciliation unavailable", { exact: true })
    ).not.toBeVisible();
    expect(readCalls).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`accounts-live-${viewport.width}.png`) });

    const sync = () =>
      page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent("hh:app-sync", { detail: { reason: "accounts-smoke", at: Date.now() } })
        )
      );
    mode = "empty";
    let releaseRead!: () => void;
    readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await sync();
    await expect(page.getByText("Loading accounts…", { exact: true })).toBeVisible();
    await expect(page.getByText("Total accounts", { exact: true })).not.toBeVisible();
    readGate = null;
    releaseRead();
    await expect(page.getByText("No payment accounts yet", { exact: true })).toBeVisible();
    await expect(page.getByText("Total accounts", { exact: true }).locator("..")).toContainText(
      "0"
    );
    await page.screenshot({ path: testInfo.outputPath(`accounts-empty-${viewport.width}.png`) });

    for (const failureMode of ["query-error", "permission-error"] as const) {
      mode = failureMode;
      await sync();
      const failure = page.getByRole("alert").filter({ hasText: "Accounts unavailable" });
      await expect(failure).toBeVisible();
      await expect(page.getByText("Total accounts", { exact: true })).not.toBeVisible();
      await expect(page.getByText("PW Accounts smoke", { exact: true })).not.toBeVisible();
      await expect(page.getByText("No payment accounts yet", { exact: true })).not.toBeVisible();
      await expect(page.locator("[data-app-scroll-root]")).not.toContainText(/\$[\d,]+\.\d{2}/);
      await page.screenshot({
        path: testInfo.outputPath(`accounts-${failureMode}-${viewport.width}.png`),
      });
      mode = "data";
      await page.getByRole("button", { name: "Retry accounts", exact: true }).click();
      await expect(
        page.getByText("PW Accounts smoke", { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await expect(failure).not.toBeVisible();
    }
    expect(
      await page.evaluate(
        () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
      )
    ).toBeLessThanOrEqual(2);
    cashUnavailable = true;
    await sync();
    await expect(page.getByText("Bank reconciliation unavailable", { exact: true })).toBeVisible();
    for (const label of ["Bank Balance", "System Expenses", "Cash Difference"]) {
      await expect(page.getByText(label, { exact: true })).not.toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath(`accounts-cash-unavailable-${viewport.width}.png`),
    });
    cashUnavailable = false;
    await page.getByRole("button", { name: "Retry bank reconciliation", exact: true }).click();
    await expect(page.getByText("Bank Balance", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText("Bank reconciliation unavailable", { exact: true })
    ).not.toBeVisible();
    // Basic regression only; Billing and Payables implementations are frozen.
    for (const [path, label] of [
      ["/financial/ar", "Billing sections"],
      ["/financial/payables", "Payables sections"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: label, exact: true })).toBeVisible();
      await expect(page.getByText("Unable to load data", { exact: true })).not.toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("Accounts without an authenticated session never presents balances", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto("/financial/accounts");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Bank Balance", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Total accounts", { exact: true })).not.toBeVisible();
  } finally {
    await context.close();
  }
});
