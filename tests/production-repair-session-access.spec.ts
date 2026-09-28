import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { getE2EOwnerCredentials, gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";

const ENDPOINTS = [
  "/api/operations/schedule",
  "/api/operations/punch-list",
  "/api/operations/site-photos",
  "/api/operations/inspection-log",
  "/api/operations/tasks",
] as const;

async function expectNoHorizontalOverflow(page: Page, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    ),
    `${width}px page has no horizontal overflow`
  ).toBe(true);
}

test.describe("Production repair request-session access", () => {
  test("serves authenticated operations reads and rejects anonymous requests", async ({
    page,
  }, testInfo) => {
    await loginAsE2EOwner(page, "/schedule");

    const authenticatedResults = await page.evaluate(async (paths) => {
      return Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path, { cache: "no-store" });
          return { path, status: response.status, body: await response.json() };
        })
      );
    }, ENDPOINTS);

    for (const result of authenticatedResults) {
      expect(result.status, `${result.path}: ${JSON.stringify(result.body)}`).toBe(200);
      expect(result.body, result.path).toMatchObject({ ok: true });
    }

    const baseURL = String(testInfo.project.use.baseURL);
    const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseURL || !supabaseAnonKey) throw new Error("Local Supabase Auth is not configured.");
    const ownerCredentials = await getE2EOwnerCredentials();
    const bearerClient = createClient(supabaseURL, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: bearerSession, error: bearerError } =
      await bearerClient.auth.signInWithPassword(ownerCredentials);
    if (bearerError || !bearerSession.session) {
      throw new Error("Unable to create a bearer-only local owner session.");
    }
    const bearerOnly = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${bearerSession.session.access_token}`,
      },
    });
    try {
      for (const path of ENDPOINTS) {
        const response = await bearerOnly.get(path);
        expect(response.status(), `${path} bearer-only status`).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ ok: true });
      }
    } finally {
      await bearerOnly.dispose();
      await bearerClient.auth.signOut();
    }

    const anonymous = await playwrightRequest.newContext({ baseURL });
    try {
      for (const path of ENDPOINTS) {
        const response = await anonymous.get(path, { maxRedirects: 0 });
        expect(response.status(), `${path} anonymous status`).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ ok: false });
      }
    } finally {
      await anonymous.dispose();
    }
  });

  test("renders repaired pages without permission errors, 5xx responses, or overflow", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });

    const pages = [
      { path: `/projects/${E2E_PRESERVED_PROJECT_ID}/profit`, heading: "Profit" },
      { path: "/schedule", heading: "Schedule" },
      { path: "/punch-list", heading: "Punch List" },
      { path: "/site-photos", heading: "Site Photos" },
    ] as const;

    await loginAsE2EOwner(page, pages[0].path);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const target of pages) {
        await gotoWithE2EAuth(page, target.path);
        await expect(page.getByRole("heading", { name: target.heading, exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.locator("body")).not.toContainText(/permission denied for table/i);
        await expectNoHorizontalOverflow(page, viewport.width);
      }
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });
});
