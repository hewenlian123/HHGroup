import { expect, test } from "@playwright/test";

// Use an existing local session: this spec never creates users or business fixtures.
test.use({ storageState: process.env.E2E_UI_STORAGE_STATE, actionTimeout: 10_000 });

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`global shell stays consistent across real navigation at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    expect(
      process.env.E2E_UI_STORAGE_STATE,
      "Provide an existing authenticated local storage state"
    ).toBeTruthy();
    expect(process.env.E2E_SKIP_DB_SEED).toBe("1");
    expect(process.env.E2E_SKIP_DB_CLEANUP).toBe("1");
    expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("hh.sidebarCollapsed", "0"));
    const errors: string[] = [];
    const writes: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin === new URL(baseURL!).origin &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method())
      ) {
        writes.push(`${request.method()} ${request.url()}`);
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    const topbar = page.locator("[data-app-topbar]:visible");
    const sidebar = page.locator("[data-app-sidebar]:visible");
    const menu = page.getByRole("dialog", { name: "Navigation menu", exact: true });
    let topbarBaseline: unknown;
    const sidebarBaselines = new Map<string, unknown>();

    async function openMobile() {
      await topbar.getByRole("button", { name: "Open menu", exact: true }).click();
      await expect(menu).toBeVisible();
    }
    async function checkSidebar(owner: string) {
      const active = sidebar.getByRole("link", { name: owner, exact: true });
      await expect(active).toHaveAttribute("aria-current", "page");
      const state = width < 640 ? "drawer" : (await sidebar.getAttribute("data-collapsed"))!;
      const values = await sidebar.evaluate(async (element) => {
        await Promise.allSettled(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished)
        );
        const style = getComputedStyle(element);
        const selected = getComputedStyle(element.querySelector('[aria-current="page"]')!);
        return {
          width: element.getBoundingClientRect().width,
          font: style.fontFamily,
          color: selected.color,
          background: selected.backgroundColor,
        };
      });
      if (!sidebarBaselines.has(state)) sidebarBaselines.set(state, values);
      expect(values).toEqual(sidebarBaselines.get(state));
    }
    async function checkRoute(path: string, owner: string) {
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?|$)`));
      await expect(topbar).toHaveCount(1);
      const geometry = await topbar.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          font: style.fontFamily,
          background: style.backgroundColor,
        };
      });
      topbarBaseline ??= geometry;
      expect(geometry).toEqual(topbarBaseline);
      const content = page.locator("[data-app-scroll-root]");
      const token = await content.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--estimate-bg").trim()
      );
      if (path.startsWith("/estimates")) {
        await expect(content).toHaveAttribute("data-estimate-module", "true");
        expect(token).not.toBe("");
      } else {
        await expect(content).not.toHaveAttribute("data-estimate-module", "true");
        expect(token).toBe("");
      }
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.documentElement;
            const app = document.querySelector<HTMLElement>("[data-app-scroll-root]")!;
            return Math.max(root.scrollWidth - root.clientWidth, app.scrollWidth - app.clientWidth);
          })
        )
        .toBeLessThanOrEqual(1);
      if (width < 640) {
        await openMobile();
        await checkSidebar(owner);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(topbar.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
      } else {
        await checkSidebar(owner);
        const oldState = await sidebar.getAttribute("data-collapsed");
        await topbar.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
        await expect(sidebar).toHaveAttribute(
          "data-collapsed",
          oldState === "true" ? "false" : "true"
        );
        await checkSidebar(owner);
        await topbar.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
        await expect(sidebar).toHaveAttribute("data-collapsed", oldState!);
      }
      const search = topbar
        .getByRole("button", { name: "Open command palette", exact: true })
        .locator("visible=true");
      await search.click();
      await expect(page.getByPlaceholder("Search commands, pages, actions...")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByPlaceholder("Search commands, pages, actions...")).toBeHidden();
      await expect(search).toBeFocused();
      await topbar.getByRole("button", { name: "Open account menu", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    async function navigate(path: string, owner: string) {
      if (width < 640) await openMobile();
      await sidebar.locator(`a[href="${path}"]`).click();
      if (width < 640) await expect(menu).toBeHidden();
      await checkRoute(path, owner);
    }
    await page.goto("/dashboard");
    await checkRoute("/dashboard", "Dashboard");
    await navigate("/projects", "Projects");
    await navigate("/estimates", "Estimates");
    await topbar.getByRole("link", { name: "New Estimate", exact: true }).click();
    await checkRoute("/estimates/new", "Estimates");
    await expect(page.locator('[data-canonical-estimate-workspace="new"]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`shell-new-${width}.png`) });
    await page.getByTestId("estimate-new-header").locator('a[href="/estimates"]').click();
    await checkRoute("/estimates", "Estimates");
    await navigate("/financial", "Finance");
    await navigate("/labor", "Labor");
    await navigate("/estimates", "Estimates");
    await page.screenshot({ path: testInfo.outputPath(`shell-estimates-${width}.png`) });
    expect(writes, "Read-only shell navigation must not issue mutations").toEqual([]);
    expect(errors, "Browser errors").toEqual([]);
  });
}
