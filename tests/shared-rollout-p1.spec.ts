import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { addE2EOwnerSession } from "./e2e-auth-owner";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";

const ROOT = process.cwd();
const BASE_URL = (process.env.E2E_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const VIEWPORTS = [
  { height: 900, name: "desktop-1440", width: 1440 },
  { height: 850, name: "desktop-1280", width: 1280 },
  { height: 820, name: "tablet-landscape-1180", width: 1180 },
  { height: 1180, name: "tablet-portrait-820", width: 820 },
  { height: 844, name: "mobile-390", width: 390 },
] as const;

type Rgb = [number, number, number];

function parseRgb(value: string): Rgb {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
  return channels as Rgb;
}

function relativeLuminance(color: Rgb) {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: Rgb, background: Rgb) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function composite(foreground: Rgb, background: Rgb, opacity: number): Rgb {
  return foreground.map((channel, index) =>
    Math.round(channel * opacity + background[index] * (1 - opacity))
  ) as Rgb;
}

function compileToastHarness() {
  const directory = mkdtempSync(join(tmpdir(), "hh-shared-p1-toast-"));
  const entryPath = join(directory, "entry.tsx");
  const bundlePath = join(directory, "bundle.js");
  const outputPath = join(directory, "output.css");

  writeFileSync(
    entryPath,
    `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import { ToastProvider } from "${resolve(ROOT, "src/components/toast/toast-provider.tsx")}";
      import { publishToast } from "${resolve(ROOT, "src/lib/toast.ts")}";

      function Harness() {
        return (
          <main>
            <button
              data-open-toasts
              onClick={() => {
                for (const variant of ["success", "warning", "information", "danger"]) {
                  publishToast({
                    title: variant,
                    description: "Rendered contrast evidence",
                    durationMs: 60000,
                    variant,
                    onClick: () => undefined,
                  });
                }
              }}
            >
              Show toasts
            </button>
          </main>
        );
      }

      createRoot(document.getElementById("root")).render(
        <ToastProvider><Harness /></ToastProvider>
      );
    `,
    "utf8"
  );

  try {
    buildSync({
      absWorkingDir: ROOT,
      bundle: true,
      entryPoints: [entryPath],
      format: "iife",
      jsx: "automatic",
      nodePaths: [resolve(ROOT, "node_modules")],
      outfile: bundlePath,
      platform: "browser",
      tsconfig: resolve(ROOT, "tsconfig.json"),
    });
    execFileSync(
      process.execPath,
      [
        resolve(ROOT, "node_modules/tailwindcss/lib/cli.js"),
        "--config",
        resolve(ROOT, "tailwind.config.ts"),
        "--input",
        resolve(ROOT, "src/app/globals.css"),
        "--output",
        outputPath,
      ],
      { cwd: ROOT, stdio: "pipe" }
    );
    return {
      bundle: readFileSync(bundlePath, "utf8"),
      css: readFileSync(outputPath, "utf8"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, JSON.stringify(widths)).toBeLessThanOrEqual(widths.client + 1);
}

async function expectTouchTarget(control: ReturnType<Page["locator"]>, label: string) {
  const box = await control.boundingBox();
  expect(Math.round(box?.height ?? 0), `${label} rendered height`).toBeGreaterThanOrEqual(44);
  expect(Math.round(box?.width ?? 0), `${label} rendered width`).toBeGreaterThanOrEqual(44);
}

test("shared topbar keeps tablet and mobile controls at the HH touch target", async ({
  page,
}, testInfo) => {
  await addE2EOwnerSession(page.context(), BASE_URL);
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto("/projects", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-app-topbar]")).toBeVisible({ timeout: 30_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const names = [
      viewport.width < 640 ? "Open menu" : "Toggle sidebar",
      "Open command palette",
      "New",
      "Notifications",
      "Open account menu",
    ];
    for (const name of names) {
      const control = page.getByRole("button", { name, exact: true });
      await expect(control, `${viewport.name}: ${name}`).toBeVisible();
      const box = await control.boundingBox();
      const expected = viewport.width <= 820 ? 44 : 36;
      expect(
        Math.round(box?.height ?? 0),
        `${viewport.name}: ${name} height`
      ).toBeGreaterThanOrEqual(expected);
      expect(Math.round(box?.width ?? 0), `${viewport.name}: ${name} width`).toBeGreaterThanOrEqual(
        expected
      );
    }
    await expectNoHorizontalOverflow(page);
    if (viewport.width <= 820) {
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-topbar.png`) });
    }
  }
});

test("toast action, dismiss, and semantic text retain touch and AA contrast", async ({
  page,
}, testInfo) => {
  const { bundle, css } = compileToastHarness();
  await page.setViewportSize(VIEWPORTS[0]);
  await page.setContent(`<style>${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: bundle });
  await page.locator("[data-open-toasts]").click();
  await expect(page.locator("[data-toast]")).toHaveCount(4);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const toast of await page.locator("[data-toast]").all()) {
      const action = toast.getByRole("button").first();
      const dismiss = toast.getByRole("button", { name: /^Dismiss/ });
      if (viewport.width <= 820) {
        for (const control of [action, dismiss]) {
          await expectTouchTarget(control, `${viewport.name}: toast control`);
        }
      }

      const evidence = await toast.evaluate((element) => {
        const title = element.querySelector("button span > span:first-child") as HTMLElement;
        const description = element.querySelector("button span > span:nth-child(2)") as HTMLElement;
        const toastStyle = getComputedStyle(element);
        return {
          background: toastStyle.backgroundColor,
          title: getComputedStyle(title).color,
          titleOpacity: Number(getComputedStyle(title).opacity),
          description: getComputedStyle(description).color,
          descriptionOpacity: Number(getComputedStyle(description).opacity),
        };
      });
      const background = parseRgb(evidence.background);
      const title = composite(parseRgb(evidence.title), background, evidence.titleOpacity);
      const description = composite(
        parseRgb(evidence.description),
        background,
        evidence.descriptionOpacity
      );
      expect(
        contrastRatio(title, background),
        `${viewport.name}: toast title`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(description, background),
        `${viewport.name}: toast description`
      ).toBeGreaterThanOrEqual(4.5);
    }
    await expectNoHorizontalOverflow(page);
    if (viewport.width <= 820) {
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-toast.png`) });
    }
  }
});

test("project workspace navigation links keep touch semantics and Actual Cost uses certified readable text", async ({
  page,
}, testInfo) => {
  await addE2EOwnerSession(page.context(), BASE_URL);
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto(`/projects/${E2E_PRESERVED_PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tablist", { name: "Project workspace sections" })).toBeVisible({
    timeout: 30_000,
  });

  const financialTab = page.getByRole("tab", { name: "Financial", exact: true });
  await financialTab.click();
  await expect(financialTab).toHaveAttribute("data-state", "active");
  const invoiceLink = page.getByRole("link", { name: "View all invoices", exact: false });
  await expect(invoiceLink).toBeVisible();
  const actualCostLabel = page.getByText("Actual Cost", { exact: true }).first();
  await expect(actualCostLabel).toBeVisible();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const control of [
      page.getByRole("main").getByRole("link", { name: "Projects", exact: true }),
      page.getByRole("tab", { name: "Overview", exact: true }),
      financialTab,
      invoiceLink,
    ]) {
      await expect(control).toBeVisible();
      if (viewport.width <= 820) {
        await expectTouchTarget(control, `${viewport.name}: project navigation`);
      }
    }
    const evidence = await actualCostLabel.evaluate((element) => {
      const style = getComputedStyle(element);
      const tokenProbe = document.createElement("span");
      tokenProbe.style.color = "var(--hh-text-secondary)";
      document.body.append(tokenProbe);
      const certifiedSecondary = getComputedStyle(tokenProbe).color;
      tokenProbe.remove();
      let backgroundElement: Element | null = element;
      let background = "rgb(255, 255, 255)";
      while (backgroundElement) {
        const candidate = getComputedStyle(backgroundElement).backgroundColor;
        const alpha = candidate.match(/[\d.]+/g)?.[3];
        if (alpha === undefined || Number(alpha) > 0) {
          background = candidate;
          break;
        }
        backgroundElement = backgroundElement.parentElement;
      }
      return { background, color: style.color, certifiedSecondary };
    });
    expect(evidence.color).toBe(evidence.certifiedSecondary);
    expect(
      contrastRatio(parseRgb(evidence.color), parseRgb(evidence.background)),
      `${viewport.name}: Actual Cost contrast`
    ).toBeGreaterThanOrEqual(4.5);
    await expectNoHorizontalOverflow(page);
    if (viewport.width <= 820) {
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-project.png`) });
    }
  }
});
