import { expect, test, type Locator, type Page } from "./estimate-playwright-test";
import type { Request } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates/new");
});

test.afterEach(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const ids = new Set<string>();
  for (const client of createdClientNames) {
    const { data } = await supabase.from("estimates").select("id").eq("client", client);
    for (const row of data ?? []) ids.add(String(row.id));
  }
  for (const project of createdProjectNames) {
    const { data } = await supabase.from("estimates").select("id").eq("project", project);
    for (const row of data ?? []) ids.add(String(row.id));
  }
  const estimateIds = Array.from(ids);
  if (estimateIds.length > 0) {
    await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_items").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_categories").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_meta").delete().in("estimate_id", estimateIds);
    await deleteLocalEstimateFixtureGraphs(estimateIds);
  }
  createdClientNames.clear();
  createdProjectNames.clear();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleSection(page: Page, name: string): Locator {
  return page
    .locator("[data-estimate-section-id]:visible, [data-estimate-section-mobile-id]:visible")
    .filter({ hasText: name })
    .first();
}

async function sectionOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-estimate-section-id]:visible, [data-estimate-section-mobile-id]:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const title = node.querySelector<HTMLElement>(
          '[aria-label^="Section:"], input[aria-label^="Section name for "]'
        );
        if (title instanceof HTMLInputElement) return title.value.trim();
        return title?.textContent?.trim() || node.textContent?.trim() || "";
      })
    );
}

async function expectSectionOrder(page: Page, expectedNames: string[]): Promise<void> {
  await expect.poll(async () => sectionOrder(page), { timeout: 30_000 }).toEqual(expectedNames);
}

async function expectFocusedSection(page: Page, name: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((expectedName) => {
          const active = document.activeElement as HTMLElement | null;
          const section = active?.closest<HTMLElement>(
            "[data-estimate-section-id], [data-estimate-section-mobile-id]"
          );
          if (!active || !section) return false;
          const sectionName = section.querySelector<HTMLInputElement>(
            'input[aria-label^="Section name for "]'
          );
          const labelledSection = section.querySelector<HTMLElement>(
            `[aria-label="Section: ${CSS.escape(expectedName)}"]`
          );
          const isEditableTarget = active.matches(
            'input[aria-label^="Section name for "], input[aria-label^="Line item"], button[aria-label^="Add line to "]'
          );
          return (
            isEditableTarget &&
            (sectionName?.value.trim() === expectedName || Boolean(labelledSection))
          );
        }, name),
      { timeout: 15_000 }
    )
    .toBe(true);
}

async function expectEstimateSaved(page: Page): Promise<void> {
  await expect(page.locator('[data-estimate-save-state="saved"]:visible').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-estimate-save-state="saving"]:visible')).toHaveCount(0);
  await expect(page.locator('[data-estimate-save-state="failed"]:visible')).toHaveCount(0);
}

async function addTemplateSection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^Add Section$/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${escapeRegExp(name)}$`, "i") }).click();
  await expect(
    page
      .getByLabel(new RegExp(`^Section name for ${escapeRegExp(name)}$`, "i"))
      .locator("visible=true")
      .first()
  ).toBeVisible({ timeout: 15_000 });
  await expectFocusedSection(page, name);
}

async function insertCustomSectionAfter(
  page: Page,
  afterName: string,
  insertedName: string
): Promise<void> {
  const trigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after ${escapeRegExp(afterName)}$`, "i"),
  });
  await trigger.scrollIntoViewIfNeeded();
  const workspace = page.locator("[data-app-scroll-root]");
  const scrollTopBeforeOpen = await workspace.evaluate((element) => element.scrollTop);

  await trigger.click();
  const contextualSearch = page.getByRole("textbox", {
    name: new RegExp(`^Search section after ${escapeRegExp(afterName)}$`, "i"),
  });
  await expect(contextualSearch).toBeVisible();
  await expect(contextualSearch).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await expect
    .poll(async () => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThanOrEqual(Math.max(0, scrollTopBeforeOpen - 2));
  await contextualSearch.fill(insertedName);
  await page
    .getByRole("option", { name: new RegExp(`^Create "${escapeRegExp(insertedName)}"$`, "i") })
    .click();

  const inserted = visibleSection(page, insertedName);
  await expect(inserted).toBeVisible({ timeout: 30_000 });
  await expect(inserted.locator('input[aria-label="Line item title"]').first()).toBeFocused({
    timeout: 30_000,
  });
}

async function appendCustomSection(page: Page, insertedName: string): Promise<void> {
  await page.getByRole("button", { name: /^Add Section$/i }).click();
  const search = page.getByRole("textbox", { name: "Search or add section" });
  await expect(search).toBeFocused();
  await search.fill(insertedName);
  await page
    .getByRole("option", { name: new RegExp(`^Create "${escapeRegExp(insertedName)}"$`, "i") })
    .click();
  const inserted = visibleSection(page, insertedName);
  await expect(inserted).toBeVisible({ timeout: 30_000 });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const scrollWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          );
          return scrollWidth - window.innerWidth;
        }),
      { timeout: 10_000 }
    )
    .toBeLessThanOrEqual(1);
}

async function expectMenuInsideViewportWithoutLineOverlap(
  page: Page,
  menu: Locator
): Promise<void> {
  await expect
    .poll(async () => {
      return menu.evaluate((element) => {
        const menuRect = element.getBoundingClientRect();
        const intersectsLine = Array.from(
          document.querySelectorAll<HTMLElement>(".eb-line-item-card")
        ).some((candidate) => {
          const lineRect = candidate.getBoundingClientRect();
          if (lineRect.width <= 0 || lineRect.height <= 0) return false;
          return (
            menuRect.left < lineRect.right &&
            menuRect.right > lineRect.left &&
            menuRect.top < lineRect.bottom &&
            menuRect.bottom > lineRect.top
          );
        });
        return (
          menuRect.left >= 0 &&
          menuRect.top >= 0 &&
          menuRect.right <= window.innerWidth &&
          menuRect.bottom <= window.innerHeight &&
          !intersectsLine
        );
      });
    })
    .toBe(true);
}

test("Add Next Section inserts in context, preserves order, and remains responsive", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  type NetworkRecord = {
    id: number;
    startedAt: number;
    startedDuring: string;
    completedAt?: number;
    completedDuring?: string;
    method: string;
    url: string;
    resourceType: string;
    navigation: boolean;
    rsc: boolean;
    prefetch: boolean;
    serverAction: boolean;
    nextAction: string | null;
    routerStateTree: string | null;
    nextUrl: string | null;
    redirectedFrom: string | null;
    responseReceivedAt?: number;
    status?: number;
    ok?: boolean;
    failure?: string;
    finished?: boolean;
  };
  const networkRecords = new Map<Request, NetworkRecord>();
  const actionTimeline: Array<{ at: number; action: string }> = [];
  const browserErrors: string[] = [];
  let currentAction = "test body started";
  let requestId = 0;
  const markAction = (action: string): void => {
    currentAction = action;
    actionTimeline.push({ at: Date.now(), action });
  };
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    const headers = request.headers();
    networkRecords.set(request, {
      id: ++requestId,
      startedAt: Date.now(),
      startedDuring: currentAction,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      rsc: headers.rsc === "1",
      prefetch: headers["next-router-prefetch"] === "1",
      serverAction: Boolean(headers["next-action"]),
      nextAction: headers["next-action"] ?? null,
      routerStateTree: headers["next-router-state-tree"] ?? null,
      nextUrl: headers["next-url"] ?? null,
      redirectedFrom: request.redirectedFrom()?.url() ?? null,
    });
  });
  page.on("response", (response) => {
    const record = networkRecords.get(response.request());
    if (!record) return;
    record.responseReceivedAt = Date.now();
    record.status = response.status();
    record.ok = response.ok();
  });
  page.on("requestfinished", (request) => {
    const record = networkRecords.get(request);
    if (!record) return;
    record.completedAt = Date.now();
    record.completedDuring = currentAction;
    record.finished = true;
  });
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown";
    const record = networkRecords.get(request);
    if (record) {
      record.completedAt = Date.now();
      record.completedDuring = currentAction;
      record.failure = reason;
    }
    failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
  });
  const suffix = Date.now();
  const clientName = `PW Add Next Section ${suffix}`;
  const projectName = `PW Add Next Section Project ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  markAction("open and save new Estimate details");
  await page.getByRole("button", { name: /Edit details/i }).click();
  const details = page.getByRole("dialog");
  await details.getByPlaceholder("Client or company name").fill(clientName);
  await details.getByPlaceholder("Project name").fill(projectName);
  await details.getByRole("button", { name: "Save", exact: true }).click();

  for (const sectionName of ["Demolition", "Concrete", "Electrical"]) {
    markAction(`add new-template Section ${sectionName}`);
    await addTemplateSection(page, sectionName);
  }
  await expect(page.getByRole("button", { name: /^Add Section$/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Add Next Section after /i })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Add Final Section$/i })).toHaveCount(0);

  const newContextSection = `New Context ${suffix}`;
  const newContextTrigger = page.getByRole("button", {
    name: /^Add Next Section after Demolition$/i,
  });
  markAction("insert custom Section after Demolition on new Estimate");
  await newContextTrigger.click();
  const newContextMenu = page.getByRole("menu");
  await expect(newContextMenu).toHaveCount(1);
  await expectMenuInsideViewportWithoutLineOverlap(page, newContextMenu);
  await newContextMenu
    .getByRole("textbox", { name: "Custom section title" })
    .fill(newContextSection);
  await newContextMenu.getByRole("button", { name: "Add custom section" }).click();
  await expectSectionOrder(page, ["Demolition", newContextSection, "Concrete", "Electrical"]);
  await expectFocusedSection(page, newContextSection);

  markAction("focus already-added Concrete Section on new Estimate");
  await page.getByRole("button", { name: /^Add Section$/i }).click();
  await page
    .getByRole("menuitem", { name: /^Concrete Already added$/i })
    .first()
    .click();
  await expectFocusedSection(page, "Concrete");

  markAction("fill all new Estimate line titles");
  const titles = page.getByLabel(/Line item \d+ title/i);
  const initialSectionOrder = ["Demolition", newContextSection, "Concrete", "Electrical"];
  await expect(titles).toHaveCount(initialSectionOrder.length);
  const expectedTitleBySection = new Map<string, string>();
  for (let index = 0; index < initialSectionOrder.length; index += 1) {
    const title = `Add Next QA line ${index + 1}`;
    expectedTitleBySection.set(initialSectionOrder[index], title);
    await titles.nth(index).fill(title);
  }
  markAction("Save Estimate and navigate from new to detail");
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  markAction("enter persisted Estimate edit mode");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add Section$/i })).toHaveCount(1);
  await expectSectionOrder(page, ["Demolition", newContextSection, "Concrete", "Electrical"]);

  markAction("insert persisted Section after Demolition");
  await insertCustomSectionAfter(page, "Demolition", `After First ${suffix}`);
  await expectEstimateSaved(page);
  markAction("insert persisted Section after Concrete");
  await insertCustomSectionAfter(page, "Concrete", `After Middle ${suffix}`);
  await expectEstimateSaved(page);
  markAction("append persisted After Last Section");
  await appendCustomSection(page, `After Last ${suffix}`);
  await expectEstimateSaved(page);
  markAction("append persisted Final Section");
  await appendCustomSection(page, `Final Section ${suffix}`);
  await expectEstimateSaved(page);

  const expectedOrder = [
    "Demolition",
    `After First ${suffix}`,
    newContextSection,
    "Concrete",
    `After Middle ${suffix}`,
    "Electrical",
    `After Last ${suffix}`,
    `Final Section ${suffix}`,
  ];
  await expectSectionOrder(page, expectedOrder);

  const duplicateTrigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after After First ${suffix}$`, "i"),
  });
  markAction("select already-added Concrete from contextual Section menu");
  await duplicateTrigger.click();
  await page.getByRole("option", { name: /^Concrete Already added$/i }).click();
  await expectSectionOrder(page, expectedOrder);
  await expect(
    visibleSection(page, "Concrete").locator('input[aria-label="Line item title"]').first()
  ).toBeFocused();
  await expectEstimateSaved(page);

  const middleTrigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after After Middle ${suffix}$`, "i"),
  });
  markAction("keyboard-dismiss contextual Section menu");
  await middleTrigger.click();
  const contextualListbox = page.getByRole("listbox");
  await expect(contextualListbox).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(contextualListbox.getByRole("option", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(middleTrigger).toBeFocused();
  await expectEstimateSaved(page);

  markAction("outside-click dismiss contextual Section menu");
  await middleTrigger.click();
  await page.getByTestId("estimate-detail-header").click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(middleTrigger).toBeFocused();

  markAction("authenticated reload after persisted Section mutations");
  await reloadWithE2EAuth(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expectSectionOrder(page, expectedOrder);

  for (const sectionName of expectedOrder) {
    if (!expectedTitleBySection.has(sectionName)) {
      expectedTitleBySection.set(sectionName, "New item");
    }
  }
  await expect
    .poll(
      async () =>
        page
          .locator('input[aria-label="Line item title"]:visible')
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim())),
      { timeout: 30_000 }
    )
    .toEqual(expectedOrder.map((sectionName) => expectedTitleBySection.get(sectionName)));

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    markAction(`responsive Section menu ${viewport.width}x${viewport.height}`);
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const visibleNextActions = page
      .getByRole("button", { name: /^Add Next Section after /i })
      .locator("visible=true");
    await expect(visibleNextActions).toHaveCount(expectedOrder.length - 1);
    const firstAction = visibleNextActions.first();
    const actionBox = await firstAction.boundingBox();
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await firstAction.scrollIntoViewIfNeeded();
    await firstAction.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toHaveCount(1);
    await expectMenuInsideViewportWithoutLineOverlap(page, menu);
    await page.keyboard.press("Escape");
  }

  markAction("final network and persistence classification");
  await expectEstimateSaved(page);
  await expect
    .poll(
      async () =>
        [...networkRecords.values()]
          .filter((record) => record.serverAction && record.completedAt == null)
          .map((record) => `${record.method} ${record.url}`),
      { timeout: 30_000 }
    )
    .toEqual([]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  expect(url, "NEXT_PUBLIC_SUPABASE_URL is required for persistence verification").toBeTruthy();
  expect(key, "SUPABASE_SERVICE_ROLE_KEY is required for persistence verification").toBeTruthy();
  assertE2ESupabaseUrlSafeForMutations(url!);
  const supabase = createClient(url!, key!);
  const { data: estimateRows, error: estimateError } = await supabase
    .from("estimates")
    .select("id, client, project")
    .eq("client", clientName);
  expect(estimateError).toBeNull();
  expect(estimateRows).toHaveLength(1);
  expect(estimateRows?.[0]).toMatchObject({ client: clientName, project: projectName });
  const estimateId = String(estimateRows?.[0]?.id ?? "");
  expect(estimateId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  const { data: categories, error: categoryError } = await supabase
    .from("estimate_categories")
    .select("cost_code, display_name, order_index")
    .eq("estimate_id", estimateId)
    .order("order_index", { ascending: true });
  expect(categoryError).toBeNull();
  expect(categories?.map((category) => category.display_name)).toEqual(expectedOrder);
  expect(categories?.map((category) => Number(category.order_index))).toEqual(
    expectedOrder.map((_, index) => index)
  );

  const { data: persistedItems, error: itemError } = await supabase
    .from("estimate_items")
    .select("id, cost_code, desc, sort_order")
    .eq("estimate_id", estimateId);
  expect(itemError).toBeNull();
  expect(persistedItems).toHaveLength(expectedOrder.length);
  for (const category of categories ?? []) {
    const sectionItems = (persistedItems ?? []).filter(
      (item) => item.cost_code === category.cost_code
    );
    expect(sectionItems, `persisted line for ${category.display_name}`).toHaveLength(1);
    expect(sectionItems[0]?.desc).toBe(expectedTitleBySection.get(category.display_name));
  }

  const persistence = {
    verified: true,
    estimateRows,
    categories,
    items: persistedItems,
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectSectionOrder(page, expectedOrder);
  const expectedUiLineTitles = expectedOrder.map((sectionName) =>
    expectedTitleBySection.get(sectionName)
  );
  const finalUiLineTitles = await page
    .locator('input[aria-label="Line item title"]:visible')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value.trim()));
  expect(finalUiLineTitles).toEqual(expectedUiLineTitles);
  await page.waitForLoadState("networkidle");

  const appOrigin = new URL(page.url()).origin;
  const detailPath = `/estimates/${estimateId}`;
  const allowedEstimatePaths = new Set([
    "/estimates",
    "/estimates/new",
    detailPath,
    `${detailPath}/preview`,
  ]);
  const isCompleted2xx = (record: NetworkRecord): boolean =>
    record.status != null && record.status >= 200 && record.status < 300 && record.ok === true;
  const successfulEstimateNavigationOrRsc = [...networkRecords.values()].filter((record) => {
    const requestUrl = new URL(record.url);
    return (
      record.finished === true &&
      isCompleted2xx(record) &&
      requestUrl.origin === appOrigin &&
      allowedEstimatePaths.has(requestUrl.pathname) &&
      (record.navigation || (record.method === "GET" && record.rsc && !record.serverAction))
    );
  });
  const consoleErrors = browserErrors.filter((error) => error.startsWith("console:"));
  const pageErrors = browserErrors.filter((error) => error.startsWith("pageerror:"));
  const visibleUserErrors = (await page.locator('[role="alert"]:visible').allTextContents())
    .map((message) => message.trim())
    .filter(Boolean);
  const abortClassifications = [...networkRecords.values()]
    .filter((record) => record.failure != null)
    .map((record) => {
      const requestUrl = new URL(record.url);
      const successorPaths = record.prefetch
        ? new Set(["/estimates", detailPath, `${detailPath}/preview`])
        : new Set([detailPath]);
      const successfulSuccessor = successfulEstimateNavigationOrRsc.find((candidate) => {
        const candidateUrl = new URL(candidate.url);
        const isLaterRequest =
          record.completedAt != null && candidate.startedAt > record.completedAt;
        const isLaterRequestFromSameUserAction =
          candidate.id > record.id && candidate.startedDuring === record.startedDuring;
        return (
          successorPaths.has(candidateUrl.pathname) &&
          (isLaterRequest || isLaterRequestFromSameUserAction)
        );
      });
      const responsePrecededAbort =
        record.responseReceivedAt != null &&
        record.completedAt != null &&
        record.responseReceivedAt <= record.completedAt;
      const isValidNextAction = /^[0-9a-f]{40}$/i.test(record.nextAction ?? "");
      const isExpectedServerActionResponseTail =
        record.failure === "net::ERR_ABORTED" &&
        requestUrl.origin === appOrigin &&
        (requestUrl.pathname === "/estimates/new" || requestUrl.pathname === detailPath) &&
        record.method === "POST" &&
        record.resourceType === "fetch" &&
        record.serverAction &&
        isValidNextAction &&
        isCompleted2xx(record) &&
        responsePrecededAbort &&
        Boolean(successfulSuccessor) &&
        persistence.verified &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0;
      const isExpectedRscNavigationTail =
        record.failure === "net::ERR_ABORTED" &&
        requestUrl.origin === appOrigin &&
        allowedEstimatePaths.has(requestUrl.pathname) &&
        record.method === "GET" &&
        record.resourceType === "fetch" &&
        record.rsc &&
        !record.prefetch &&
        !record.serverAction &&
        isCompleted2xx(record) &&
        responsePrecededAbort &&
        Boolean(successfulSuccessor) &&
        persistence.verified &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0;
      const isExpectedPrefetchCancellation =
        record.failure === "net::ERR_ABORTED" &&
        requestUrl.origin === appOrigin &&
        allowedEstimatePaths.has(requestUrl.pathname) &&
        record.method === "GET" &&
        record.resourceType === "fetch" &&
        record.rsc &&
        record.prefetch &&
        !record.serverAction &&
        record.nextAction == null &&
        isCompleted2xx(record) &&
        responsePrecededAbort &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        visibleUserErrors.length === 0;
      const isExpected =
        isExpectedServerActionResponseTail ||
        isExpectedRscNavigationTail ||
        isExpectedPrefetchCancellation;
      return {
        id: record.id,
        url: record.url,
        route: requestUrl.pathname,
        method: record.method,
        resourceType: record.resourceType,
        requestKind: record.serverAction
          ? "Server Action RSC transport"
          : record.prefetch
            ? "RSC prefetch"
            : record.rsc
              ? "RSC navigation/refresh"
              : record.navigation
                ? "document navigation"
                : "API/data request",
        navigation: record.navigation,
        rsc: record.rsc,
        prefetch: record.prefetch,
        serverAction: record.serverAction,
        nextActionValid: isValidNextAction,
        status: record.status ?? null,
        responsePrecededAbort,
        failure: record.failure,
        actionBeforeAbort: record.startedDuring,
        actionAtAbort: record.completedDuring ?? null,
        successfulSuccessor: successfulSuccessor
          ? {
              id: successfulSuccessor.id,
              method: successfulSuccessor.method,
              url: successfulSuccessor.url,
              status: successfulSuccessor.status,
              navigation: successfulSuccessor.navigation,
              rsc: successfulSuccessor.rsc,
              userAction: successfulSuccessor.startedDuring,
            }
          : null,
        finalUiStateVerified: true,
        reloadStateVerified: true,
        persistenceVerified: true,
        persistenceRequiredForClassification: !record.prefetch,
        consoleErrors,
        pageErrors,
        visibleUserErrors,
        classification: isExpectedPrefetchCancellation
          ? "EXPECTED PREFETCH CANCELLATION"
          : isExpected
            ? "EXPECTED NAVIGATION ABORT"
            : "REAL REQUEST FAILURE",
        reason: isExpectedServerActionResponseTail
          ? "Valid Next Action returned 2xx before its RSC response tail was superseded; a corresponding real Estimate navigation/RSC request succeeded and UI, reload, and row-level persistence are exact."
          : isExpectedRscNavigationTail
            ? "Known Estimate RSC GET returned 2xx before its navigation/prefetch response tail was superseded; a corresponding real Estimate navigation/RSC request succeeded and final state is exact."
            : isExpectedPrefetchCancellation
              ? "Explicit opportunistic RSC prefetch GET returned 2xx before cancellation; it is not a Next Action or API/data mutation and UI, reload, console, page, and visible-error state remain clean."
              : "The request does not satisfy every fail-closed navigation-abort condition.",
      };
    });
  const unexpectedAbortFailures = abortClassifications.filter(
    (record) => record.classification === "REAL REQUEST FAILURE"
  );
  const unexpectedHttpResponses = [...networkRecords.values()]
    .filter((record) => record.status != null && record.status >= 400)
    .map((record) => `${record.method} ${record.url} — HTTP ${record.status}`);
  await testInfo.attach("abort-classification.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          actions: actionTimeline,
          requests: [...networkRecords.values()],
          failedRequests,
          abortClassifications,
          unexpectedAbortFailures,
          unexpectedHttpResponses,
          browserErrors,
          visibleUserErrors,
          finalUrl: page.url(),
          finalSectionOrder: await sectionOrder(page),
          persistence,
        },
        null,
        2
      ),
      "utf8"
    ),
    contentType: "application/json",
  });

  expect(unexpectedHttpResponses).toEqual([]);
  expect(unexpectedAbortFailures).toEqual([]);
  expect(browserErrors).toEqual([]);
  expect(visibleUserErrors).toEqual([]);
});
