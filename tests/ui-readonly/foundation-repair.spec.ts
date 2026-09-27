import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixture";

// Real HH components, mounted only in the browser test; no application route or business writes.
let componentBundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {EmptyState} from '@/components/ui/system-state';
        import {SubmitSpinner} from '@/components/ui/submit-spinner';
        import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
        import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent} from '@/components/ui/dropdown-menu';
        import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
        const host=document.createElement('div'); host.id='t1-fixture'; document.querySelector('main').prepend(host);
        createRoot(host).render(<>
          <EmptyState data-testid="empty" />
          <button aria-label="Saving" aria-busy="true"><SubmitSpinner /></button>
          <Popover><PopoverTrigger>T1 popover</PopoverTrigger><PopoverContent data-testid="popover"><button>Popover action</button></PopoverContent></Popover>
          <DropdownMenu><DropdownMenuTrigger>T1 menu</DropdownMenuTrigger><DropdownMenuContent data-testid="menu"><DropdownMenuItem>First action</DropdownMenuItem><DropdownMenuSub><DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger><DropdownMenuSubContent data-testid="submenu"><DropdownMenuItem>Nested action</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub></DropdownMenuContent></DropdownMenu>
          <Select defaultValue="one"><SelectTrigger aria-label="T1 select"><SelectValue /></SelectTrigger><SelectContent data-testid="select"><SelectItem value="one">One</SelectItem><SelectItem value="two">Two</SelectItem></SelectContent></Select>
        </>);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    jsx: "automatic",
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
    tsconfig: "tsconfig.json",
  });
  componentBundle = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  (page as typeof page & { t1Errors: string[] }).t1Errors = errors;
});
test.afterEach(async ({ page }, testInfo) => {
  const errors = (page as typeof page & { t1Errors: string[] }).t1Errors;
  await testInfo.attach("console-page-errors", {
    body: JSON.stringify(errors),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("mobile drawer closes across shell breakpoint and restores visible keyboard focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financial/inbox", { waitUntil: "networkidle" });
  const mobileToggle = page.getByRole("button", { name: "Open menu", exact: true });
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  for (const width of [768, 1440, 640]) {
    await page.setViewportSize({ width: width === 640 ? 639 : 390, height: 844 });
    await mobileToggle.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Toggle sidebar", exact: true })).toBeFocused();
    expect(
      await page.locator("body").evaluate((element) => getComputedStyle(element).pointerEvents)
    ).not.toBe("none");
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`sidebar-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toHaveCount(0);
  await mobileToggle.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(mobileToggle).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-focus-390.png") });
  // A resize during the close animation must not restore focus to a hidden mobile control.
  await mobileToggle.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle sidebar", exact: true })).toBeFocused();
});

test("11px shell shortcut and Inbox labels pass contrast in supported theme aliases", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/financial/inbox", { waitUntil: "networkidle" });
  const selector = "[data-inbox-decision-brief] dt, [data-app-topbar] kbd";
  await expect(page.locator("[data-inbox-decision-brief] dt").first()).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark"
    );
    const result = await new AxeBuilder({ page })
      .include(selector)
      .withRules(["color-contrast"])
      .analyze();
    await testInfo.attach(`contrast-${theme}`, {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    expect(result.violations).toEqual([]);
    expect(result.incomplete).toEqual([]);
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator("[data-inbox-decision-brief] dt").first()).toBeVisible();
  await page.getByRole("button", { name: "Open command palette", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open command palette", exact: true })
  ).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("forced-colors-focus.png") });
});

test("SystemState retains token-sized square icons at desktop, tablet and mobile", async ({
  page,
}, testInfo) => {
  await page.goto("/design-system", { waitUntil: "networkidle" });
  await page.addScriptTag({ content: componentBundle });
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const icon = page.getByTestId("empty").locator("div").first();
    await expect(icon).toHaveCSS("width", "44px");
    await expect(icon).toHaveCSS("height", "44px");
    await expect(icon).toHaveCSS("border-radius", "9999px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`components-${width}.png`) });
  }
});

test("SubmitSpinner stops rotating under reduced motion and keeps its busy cue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design-system", { waitUntil: "networkidle" });
  await page.addScriptTag({ content: componentBundle });
  const saving = page.getByRole("button", { name: "Saving", exact: true });
  await expect(saving.locator("svg")).toHaveCSS("animation-name", "spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(saving.locator("svg")).toHaveCSS("animation-name", "none");
  await expect(saving).toHaveAttribute("aria-busy", "true");
});

test("floating layers use opacity-only reduced motion and restore keyboard focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design-system", { waitUntil: "networkidle" });
  await page.addScriptTag({ content: componentBundle });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, id] of [
    ["T1 popover", "popover"],
    ["T1 menu", "menu"],
    ["T1 select", "select"],
  ]) {
    const trigger = page.getByRole(id === "select" ? "combobox" : "button", { name, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const content = page.getByTestId(id);
    await expect(content).toBeVisible();
    await expect(content).toHaveCSS("animation-name", "hh-modal-fade-in");
    const frames = await content.evaluate((element) =>
      element
        .getAnimations()
        .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes())
    );
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => !frame.transform && !frame.translate && !frame.scale)).toBe(
      true
    );
    if (id === "menu") {
      await page.getByRole("menuitem", { name: "More actions" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByTestId("submenu")).toHaveCSS("animation-name", "hh-modal-fade-in");
      await page.keyboard.press("ArrowLeft");
    }
    await page.screenshot({ path: testInfo.outputPath(`reduced-${id}.png`) });
    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Estimate shell wrapper keeps one navigation surface (${reducedMotion})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/estimates/44444444-4444-4444-4444-444444444449", {
      waitUntil: "networkidle",
    });
    const inspector = page.locator('[data-estimate-inspector="pricing"]');
    await expect(inspector).toBeVisible();
    const pricingText = await inspector.innerText();
    const pricingWidth = (await inspector.boundingBox())!.width;
    const toggle = page.getByRole("button", { name: "Open menu", exact: true });
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    const staticSidebar = page.locator("[data-app-shell-sidebar-slot] [data-app-sidebar]");
    const desktopToggle = staticSidebar.locator("[data-sidebar-collapse] button");

    await page.setViewportSize({ width: 639, height: 844 });
    await toggle.focus();
    await page.keyboard.press("Enter");
    for (const width of [639, 640, 768, 1024, 1199]) {
      await page.setViewportSize({ width, height: 1024 });
      await expect(dialog).toBeVisible();
      await expect(staticSidebar).toBeHidden();
      await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
      await expect(dialog.locator("[data-app-sidebar]")).toBeVisible();
      if (reducedMotion === "reduce") {
        await expect(dialog).toHaveCSS("animation-name", "hh-modal-fade-in");
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(toggle).toBeFocused();
      await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
      await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
      await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(0);
      const overflow = await page.evaluate(() => {
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]")!;
        return {
          document: document.documentElement.scrollWidth - innerWidth,
          app: app.scrollWidth - app.clientWidth,
        };
      });
      expect(overflow.document).toBeLessThanOrEqual(1);
      expect(overflow.app).toBeLessThanOrEqual(1);
      if (width >= 768) await expect(inspector).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath(`estimate-${width}-${reducedMotion}.png`),
      });
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
    }
    // The Estimate-specific persistent rail starts at 1200, not the normal shell's 640.
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
    await expect(desktopToggle).toBeFocused();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(inspector).toBeVisible();
    expect(await inspector.innerText()).toBe(pricingText);
    expect((await inspector.boundingBox())!.width).toBe(pricingWidth);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(dialog).toHaveCount(0);
    await toggle.click();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    // Keep focus on visible navigation when resize follows dismissal.
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(dialog).toHaveCount(0);
    await expect(desktopToggle).toBeFocused();
    await page.setViewportSize({ width: 768, height: 1024 });
    await toggle.click();
    await dialog.getByRole("link", { name: "Estimates", exact: true }).click();
    await expect(page).toHaveURL(/\/estimates$/);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  });
}

test("shell wrapper slots keep chrome out of printed pages", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financial/inbox", { waitUntil: "networkidle" });
  const main = page.locator("main[data-app-scroll-root]");
  const content = await main.innerText();
  await expect(page.locator("[data-app-topbar]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-app-topbar]")).toBeHidden();
  await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open quick actions" })).toBeHidden();
  expect(await main.innerText()).toBe(content);
  await page.screenshot({ path: testInfo.outputPath("shell-print-390.png") });
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("[data-app-topbar]")).toBeVisible();
});

test("Estimate PDF shell wrapper hides chrome while retaining the document", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/estimates/44444444-4444-4444-4444-444444444449/print?pdf=1", {
    waitUntil: "networkidle",
  });
  await expect(page.locator('[data-estimate-pdf-capture="true"]')).toBeVisible();
  await expect(page.getByTestId("estimate-document")).toBeVisible();
  await expect(page.locator("[data-app-topbar]")).toBeHidden();
  await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open quick actions" })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("estimate-pdf-390.png") });
});

test("Estimate desktop transition clears stale drawer state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/estimates/44444444-4444-4444-4444-444444444449", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(1);
  await expect(
    page.locator("[data-app-shell-sidebar-slot] [data-sidebar-collapse] button")
  ).toBeFocused();
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
});

test("Estimate pricing drawer and inspector retain focus, scroll lock, and values", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/estimates/44444444-4444-4444-4444-444444444449", { waitUntil: "networkidle" });
  const inspector = page.locator('[data-estimate-inspector="pricing"]');
  const pricingText = await inspector.innerText();
  const pricingWidth = (await inspector.boundingBox())!.width;
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation menu" })).toHaveCount(0);
  const actions = page.getByRole("button", { name: "Estimate actions", exact: true });
  await actions.click();
  await page.getByRole("menuitem", { name: "Pricing", exact: true }).click();
  const drawer = page.locator('[role="dialog"][data-estimate-surface="pricing"]');
  await expect(drawer).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
  await page.keyboard.press("Tab");
  await expect(drawer.locator(":focus")).toHaveCount(1);
  // Shell breakpoint cleanup must not dismiss or steal focus from the pricing drawer.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(":focus")).toHaveCount(1);
  await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(actions).toBeFocused();
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  // Reload abandons edit mode without saving; the read-only fixture blocks writes.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(inspector).toBeVisible();
  expect(await inspector.innerText()).toBe(pricingText);
  expect((await inspector.boundingBox())!.width).toBe(pricingWidth);
  await page.screenshot({ path: testInfo.outputPath("estimate-inspector-preserved-1440.png") });
});
