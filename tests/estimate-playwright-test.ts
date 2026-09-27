import { expect, test as base, type ConsoleMessage, type WebError } from "@playwright/test";

type EstimateFixtures = {
  assertNoBrowserErrors: void;
};

function formatConsoleError(message: ConsoleMessage): string {
  const location = message.location();
  const line = Number.isInteger(location.lineNumber) ? `:${location.lineNumber}` : "";
  const source = location.url ? ` @ ${location.url}${line}` : "";
  return `console.error: ${message.text()}${source}`;
}

/**
 * Full historical Estimate runs certify every browser surface, not just specs
 * that opted into local listeners. This auto fixture covers the primary page
 * and any popup/print page from the beginning of each test.
 */
export const test = base.extend<EstimateFixtures>({
  assertNoBrowserErrors: [
    async ({ context, page }, use, testInfo) => {
      // Depending on `page` guarantees this assertion tears down before Playwright
      // closes the page and aborts outstanding App Router prefetch requests.
      void page;
      const errors: string[] = [];
      const onConsole = (message: ConsoleMessage) => {
        if (message.type() === "error") errors.push(formatConsoleError(message));
      };
      const onWebError = (webError: WebError) => {
        errors.push(`pageerror: ${webError.error().message}`);
      };

      context.on("console", onConsole);
      context.on("weberror", onWebError);
      await use();
      context.off("console", onConsole);
      context.off("weberror", onWebError);

      if (errors.length > 0) {
        await testInfo.attach("estimate-browser-errors", {
          body: Buffer.from(errors.join("\n"), "utf8"),
          contentType: "text/plain",
        });
      }
      expect(errors, "Estimate browser console/page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Locator, Page, TestInfo } from "@playwright/test";
