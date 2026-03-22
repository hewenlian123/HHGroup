import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MAX_COMPANY_LOGO_BYTES } from "../src/lib/company-profile-form-validation";
import { tryCreateDraftInvoiceNavigateToDetail } from "./e2e-helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
/** Set `E2E_BRANDING_FULL=1` to fail (not skip) when storage blocks logo upload. */
const BRANDING_FULL = process.env.E2E_BRANDING_FULL === "1" || process.env.E2E_BRANDING_FULL === "true";

/** 1×1 PNG (well under 5MB) for happy-path logo tests. */
const MINI_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQG/l6Y5AAAAAElFTkSuQmCC";

async function skipIfNoSupabase(page: import("@playwright/test").Page): Promise<boolean> {
  const banner = page.getByText(/Supabase is not configured/i);
  if (await banner.isVisible().catch(() => false)) {
    return true;
  }
  return false;
}

/** Save is enabled only when profile row is loaded (`!profile` keeps the button disabled). */
async function waitForCompanyProfileReady(page: import("@playwright/test").Page): Promise<void> {
  const saveBtn = page.getByTestId("company-save-button");
  await expect(saveBtn).toBeEnabled({ timeout: 45_000 });
}

test.describe("Settings → Company Profile", () => {
  // Single global `company_profile` row: any parallel test here races and flakes (ZIP/STATE markers).
  test.describe.configure({ timeout: 120_000, mode: "serial" });

  test("renders page, branding section, and all profile fields", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Company", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Company Profile" })).toBeVisible();

    const fields = page.locator('[data-testid="company-profile-fields"]');
    await expect(fields).toBeVisible();

    await expect(page.getByTestId("company-input-org_name")).toBeVisible();
    await expect(page.getByTestId("company-input-legal_name")).toBeVisible();
    await expect(page.getByTestId("company-input-phone")).toBeVisible();
    await expect(page.getByTestId("company-input-email")).toBeVisible();
    await expect(page.getByTestId("company-input-website")).toBeVisible();
    await expect(page.getByTestId("company-input-license_number")).toBeVisible();
    await expect(page.getByTestId("company-input-tax_id")).toBeVisible();
    await expect(page.getByTestId("company-input-address1")).toBeVisible();
    await expect(page.getByTestId("company-input-address2")).toBeVisible();
    await expect(page.getByTestId("company-input-city")).toBeVisible();
    await expect(page.getByTestId("company-input-state")).toBeVisible();
    await expect(page.getByTestId("company-input-zip")).toBeVisible();
    await expect(page.getByTestId("company-input-country")).toBeVisible();

    await expect(page.getByTestId("company-save-button")).toBeVisible();
    await expect(page.locator("#logo-upload")).toBeAttached();
  });

  test("company profile inputs use full-width layout (UI consistency)", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");

    const fields = page.locator('[data-testid="company-profile-fields"]');
    await expect(fields).toBeVisible({ timeout: 30_000 });
    const tagged = fields.locator('[data-testid^="company-input-"]');
    const n = await tagged.count();
    expect(n).toBeGreaterThanOrEqual(11);
    for (let i = 0; i < n; i++) {
      await expect(tagged.nth(i)).toHaveClass(/w-full/);
    }
  });

  test("profile grid uses two columns on desktop (layout)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    const grid = page.locator('[data-testid="company-profile-fields"]');
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toHaveClass(/md:grid-cols-2/);
  });

  test("invalid email shows error and does not show success toast", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    await expect(page.getByTestId("company-input-email")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("company-input-email").fill("not-valid-email");
    await page.getByTestId("company-save-button").click();

    // Title + description from toast; allow either (avoids flake if only body line renders first).
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Invalid email|Enter a valid email address/i })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ })).toHaveCount(0);
    await expect(page.getByTestId("company-save-button")).not.toContainText("Saving...");
  });

  // Nested serial kept for clarity; outer describe is already serial.
  test.describe.serial("Company profile mutations (shared row)", () => {
  test("company name (org_name) changes from HH Group and persists after reload", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const orgInput = page.getByTestId("company-input-org_name");
    await expect(orgInput).toBeVisible({ timeout: 30_000 });

    const newName = `E2E-CompanyName-${Date.now()}`;
    await orgInput.fill(newName);

    const saveBtn = page.getByTestId("company-save-button");
    const matchesSavePayload = (req: import("@playwright/test").Request): boolean => {
      if (!req.url().includes("/api/settings/company-profile") || req.method() !== "POST") return false;
      const raw = req.postData();
      if (!raw) return false;
      try {
        const j = JSON.parse(raw) as { org_name?: string };
        return j.org_name === newName;
      } catch {
        return false;
      }
    };
    const [saveReq] = await Promise.all([
      page.waitForRequest((req) => matchesSavePayload(req), { timeout: 35_000 }),
      saveBtn.click(),
    ]);
    const profileRes = await saveReq.response();
    expect(profileRes, "expected POST /api/settings/company-profile to complete").toBeTruthy();
    const res = profileRes!;
    if (res.status() === 200) {
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: { org_name?: string } }
        | null;
      expect(body?.ok).toBe(true);
      expect(body?.profile?.org_name).toBe(newName);
    }

    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 35_000 });
    await expect(saveBtn).toContainText("Save Profile", { timeout: 15_000 });
    await expect(orgInput).toHaveValue(newName, { timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCompanyProfileReady(page);
    await expect(page.getByTestId("company-input-org_name")).toHaveValue(newName, { timeout: 45_000 });
  });

  test("multi-field save keeps values in UI and does not navigate away", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const urlBefore = page.url();

    const zip = page.getByTestId("company-input-zip");
    const stateInput = page.getByTestId("company-input-state");
    const phone = page.getByTestId("company-input-phone");

    const z = `E2E-ZIP-${Date.now()}`;
    const s = `E2E-MULTI-${Date.now()}`;
    const p = `+1 555 ${String(Date.now()).slice(-7)}`;

    await zip.fill(z);
    await stateInput.fill(s);
    await phone.fill(p);

    const saveBtn = page.getByTestId("company-save-button");
    await saveBtn.click();
    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(saveBtn).toContainText("Save Profile", { timeout: 15_000 });

    expect(page.url()).toBe(urlBefore);
    await expect(zip).toHaveValue(z, { timeout: 10_000 });
    await expect(stateInput).toHaveValue(s, { timeout: 10_000 });
    await expect(phone).toHaveValue(p, { timeout: 10_000 });
  });

  test("save shows Saving… then Saved; field persists after reload", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const stateInput = page.getByTestId("company-input-state");
    await expect(stateInput).toBeVisible({ timeout: 30_000 });

    // Prefer `state` for persistence: some DBs omit newer columns from updates (retry strips unknown fields).
    const marker = `E2E-ST-${Date.now()}`;
    await stateInput.fill(marker);

    const saveBtn = page.getByTestId("company-save-button");
    await saveBtn.click();
    await expect(saveBtn).toContainText("Saving...", { timeout: 5000 });
    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(saveBtn).toContainText("Save Profile", { timeout: 15_000 });
    await expect(stateInput).toHaveValue(marker, { timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCompanyProfileReady(page);
    await expect(page.getByTestId("company-input-state")).toHaveValue(marker, { timeout: 30_000 });
  });

  test("invoice print header matches company profile (org_name)", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    // Persist a fresh name so SSR print (fetchDocumentCompanyProfile) matches DB — input-only can drift vs server row.
    const marker = `E2E-Print-${Date.now()}`;
    await page.getByTestId("company-input-org_name").fill(marker);
    await page.getByTestId("company-save-button").click();
    await expect(page.locator('[role="status"]').filter({ hasText: /^Saved$/ }).first()).toBeVisible({
      timeout: 30_000,
    });

    const inv = await tryCreateDraftInvoiceNavigateToDetail(page, BASE);
    test.skip(!inv.ok, inv.ok ? "" : inv.skipReason);

    const url = page.url();
    const m = url.match(/\/financial\/invoices\/([^/?#]+)/);
    const invoiceId = m?.[1];
    expect(invoiceId && invoiceId !== "new").toBeTruthy();

    await page.goto(`${BASE}/financial/invoices/${invoiceId!}/print`);
    await page.waitForLoadState("domcontentloaded");

    const header = page.getByTestId("document-company-header");
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("document-company-name")).toHaveText(marker, { timeout: 20_000 });
    await expect(header.getByText("Invoice", { exact: true })).toBeVisible();
  });

  test("logo upload rejects non-image file", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-company-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const badPath = join(dir, "not-image.txt");
    writeFileSync(badPath, "not an image");

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', badPath);
      await expect(page.locator('[role="status"]').filter({ hasText: "Upload failed" })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[role="status"]').filter({ hasText: /image file/i })).toBeVisible();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("logo: upload small PNG shows preview; replace with SVG; remove clears preview", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-company-logo-ok-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pngPath = join(dir, "logo.png");
    const svgPath = join(dir, "logo.svg");
    writeFileSync(pngPath, Buffer.from(MINI_PNG_BASE64, "base64"));
    writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', "utf8");

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', pngPath);
      const outcome = page.locator('[role="status"]').filter({ hasText: /Logo uploaded|Upload failed/ });
      await expect(outcome.first()).toBeVisible({ timeout: 35_000 });
      const label = (await outcome.first().innerText()).trim();
      if (label.includes("Upload failed")) {
        if (BRANDING_FULL) {
          throw new Error("Logo upload failed but E2E_BRANDING_FULL=1 (expect working `branding` bucket + RLS).");
        }
        test.skip(true, "Logo upload blocked (configure `branding` storage + RLS, or set E2E_BRANDING_FULL=1 to fail hard).");
      }

      await expect(page.getByRole("img", { name: "Company logo" })).toBeVisible({ timeout: 15_000 });

      await page.setInputFiles('[data-testid="company-logo-input"]', svgPath);
      await expect(page.locator('[role="status"]').filter({ hasText: "Logo uploaded" }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("img", { name: "Company logo" })).toBeVisible();

      await page.getByRole("button", { name: "Remove Logo" }).click();
      await expect(page.locator('[role="status"]').filter({ hasText: "Logo removed" }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("img", { name: "Company logo" })).toHaveCount(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForCompanyProfileReady(page);
      await expect(page.getByRole("img", { name: "Company logo" })).toHaveCount(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("logo upload succeeds via client fallback when API POST returns 503", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await page.route("**/api/settings/company-logo", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, fallback: "client", message: "E2E forced 503" }),
      });
    });

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-logo-fallback-503-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pngPath = join(dir, "fb.png");
    writeFileSync(pngPath, Buffer.from(MINI_PNG_BASE64, "base64"));

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', pngPath);
      const outcome = page.locator('[role="status"]').filter({ hasText: /Logo uploaded|Upload failed/ });
      await expect(outcome.first()).toBeVisible({ timeout: 35_000 });
      const label = (await outcome.first().innerText()).trim();
      if (label.includes("Upload failed")) {
        if (BRANDING_FULL) throw new Error("Fallback upload failed with E2E_BRANDING_FULL=1.");
        test.skip(true, "Client Storage upload blocked (RLS / bucket).");
      }
      await expect(page.getByRole("img", { name: "Company logo" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.unroute("**/api/settings/company-logo");
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("logo upload succeeds via client fallback when API POST returns 401", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await page.route("**/api/settings/company-logo", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          fallback: "client",
          message: "E2E forced 401",
        }),
      });
    });

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-logo-fallback-401-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pngPath = join(dir, "fb401.png");
    writeFileSync(pngPath, Buffer.from(MINI_PNG_BASE64, "base64"));

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', pngPath);
      const outcome = page.locator('[role="status"]').filter({ hasText: /Logo uploaded|Upload failed/ });
      await expect(outcome.first()).toBeVisible({ timeout: 35_000 });
      const label = (await outcome.first().innerText()).trim();
      if (label.includes("Upload failed")) {
        if (BRANDING_FULL) throw new Error("Fallback upload failed with E2E_BRANDING_FULL=1.");
        test.skip(true, "Client Storage upload blocked (RLS / bucket).");
      }
      await expect(page.getByRole("img", { name: "Company logo" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.unroute("**/api/settings/company-logo");
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("logo upload succeeds via client fallback when API POST returns 403", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await page.route("**/api/settings/company-logo", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "E2E forced 403" }),
      });
    });

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-logo-fallback-403-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pngPath = join(dir, "fb403.png");
    writeFileSync(pngPath, Buffer.from(MINI_PNG_BASE64, "base64"));

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', pngPath);
      const outcome = page.locator('[role="status"]').filter({ hasText: /Logo uploaded|Upload failed/ });
      await expect(outcome.first()).toBeVisible({ timeout: 35_000 });
      const label = (await outcome.first().innerText()).trim();
      if (label.includes("Upload failed")) {
        if (BRANDING_FULL) throw new Error("Fallback upload failed with E2E_BRANDING_FULL=1.");
        test.skip(true, "Client Storage upload blocked (RLS / bucket).");
      }
      await expect(page.getByRole("img", { name: "Company logo" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.unroute("**/api/settings/company-logo");
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("logo upload rejects file over 5MB", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    await waitForCompanyProfileReady(page);
    const dir = join(tmpdir(), `e2e-company-big-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const bigPath = join(dir, "huge.png");
    writeFileSync(bigPath, Buffer.alloc(MAX_COMPANY_LOGO_BYTES + 1, 0));

    try {
      await page.setInputFiles('[data-testid="company-logo-input"]', bigPath);
      await expect(page.locator('[role="status"]').filter({ hasText: "Upload failed" })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[role="status"]').filter({ hasText: /5MB/i })).toBeVisible();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("save failure shows error toast and button recovers", async ({ page }) => {
    await page.goto(`${BASE}/settings/company`);
    await page.waitForLoadState("domcontentloaded");
    if (await skipIfNoSupabase(page)) test.skip(true, "Supabase not configured.");

    // Force client-side Supabase path so the REST mock below applies (server API may bypass RLS).
    await page.route("**/api/settings/company-profile", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, fallback: "client", message: "E2E force client" }),
      });
    });

    await page.route("**/rest/v1/company_profile**", async (route) => {
      const method = route.request().method();
      if (method === "PATCH" || method === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "E2E forced failure" }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await waitForCompanyProfileReady(page);
      await expect(page.getByTestId("company-input-state")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("company-input-state").fill(`E2E-Fail-${Date.now()}`);

      const saveBtn = page.getByTestId("company-save-button");
      await saveBtn.click();
      await expect(page.locator('[role="status"]').filter({ hasText: "Save failed" })).toBeVisible({ timeout: 30_000 });
      await expect(saveBtn).toContainText("Save Profile", { timeout: 15_000 });
    } finally {
      await page.unroute("**/api/settings/company-profile");
      await page.unroute("**/rest/v1/company_profile**");
    }
  });
  });
});
