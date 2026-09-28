import { test as base, expect, UI_READONLY_METHODS } from "./fixture";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { getExpenseTotal } from "../../src/lib/expense-domain";
import { formatCurrency } from "../../src/lib/formatters";

export const receiptId = "88888888-8888-4888-8888-888888888881";

// Browser responses only: production fetching/mapping/rendering remains in use.
export const test = base.extend<{ receiptEvidence: void; receiptAmount: number }>({
  receiptAmount: [123.45, { option: true }],
  receiptEvidence: [
    async ({ page, receiptAmount }, use, info) => {
      const errors: string[] = [];
      const bundled = await build({
        entryPoints: ["tests/ui-readonly/receipt-inbox-component-fixture.tsx"],
        bundle: true,
        write: false,
        outfile: "receipt-fixture.js",
        format: "iife",
        jsx: "automatic",
        tsconfig: "tsconfig.json",
        alias: { react: "next/dist/compiled/react", "react-dom": "next/dist/compiled/react-dom" },
        define: {
          "process.env": JSON.stringify({
            NODE_ENV: "production",
            __NEXT_ROUTER_BASEPATH: "",
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "read-only-browser-fixture",
          }),
        },
      });
      const css = await readFile(".next-e2e-ui-readonly/static/css/app/layout.css", "utf8");
      const fontClasses = [...css.matchAll(/\.(__variable_[a-z0-9]+)\s*\{/g)]
        .map((match) => match[1])
        .join(" ");
      const requests: { method: string; path: string; result: string }[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.addInitScript(() => localStorage.removeItem("hh-expenses-sort-v1"));
      const rows: Record<string, unknown[]> = {
        expenses: [
          {
            id: receiptId,
            expense_date: "2026-09-07",
            vendor_name: "PW Receipt Evidence Supplier",
            vendor: "PW Receipt Evidence Supplier",
            payment_method: "Cash",
            reference_no: "PW-RECEIPT-001",
            notes: "Deterministic read-only receipt review evidence",
            total: receiptAmount,
            receipt_url: "/__receipt-evidence.svg",
            status: "needs_review",
            source_type: "receipt_upload",
          },
        ],
        expense_lines: [
          {
            id: "88888888-8888-4888-8888-888888888882",
            expense_id: receiptId,
            project_id: null,
            category: "Materials",
            amount: receiptAmount,
            memo: "Receipt fixture line",
          },
        ],
        attachments: [],
        expense_attachments: [],
        subcontract_deductions: [],
        workers: [],
        projects: [],
        payment_accounts: [],
        expense_options: [],
        subcontracts: [],
        subcontractors: [],
        categories: [],
      };
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const record = (result: string) => requests.push({ method, path: url.pathname, result });
        if (url.pathname === "/api/auth/local-auto-login") {
          record("blocked-admin-bootstrap");
          await route.abort("blockedbyclient");
          return;
        }
        if (!UI_READONLY_METHODS.has(method)) {
          record("blocked-write");
          await route.abort("blockedbyclient");
          return;
        }
        if (url.pathname === "/financial/inbox") {
          record("component-document");
          await route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html lang="en" class="${fontClasses}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/__receipt-fixture.css"></head><body class="hh-motion-root antialiased"><div id="receipt-fixture"></div><script src="/__receipt-fixture.js"></script></body></html>`,
          });
          return;
        }
        if (url.pathname === "/__receipt-fixture.js") {
          await route.fulfill({
            contentType: "text/javascript",
            body: bundled.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
          });
          return;
        }
        if (/^\/_next\/static\/media\/[a-zA-Z0-9.-]+\.woff2?$/.test(url.pathname)) {
          record("fixture-font");
          await route.fulfill({
            contentType: "font/woff",
            body: await readFile(
              `.next-e2e-ui-readonly/static/media/${url.pathname.split("/").pop()}`
            ),
          });
          return;
        }
        if (url.pathname === "/__receipt-fixture.css") {
          await route.fulfill({
            contentType: "text/css",
            body:
              css +
              bundled.outputFiles
                .filter((file) => file.path.endsWith(".css"))
                .map((file) => file.text)
                .join("\n"),
          });
          return;
        }
        const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
        if (table && table in rows) {
          record("fixture");
          await route.fulfill({ json: rows[table] });
          return;
        }
        if (url.pathname === `/api/financial/expenses/${receiptId}/receipts`) {
          record("fixture");
          await route.fulfill({
            json: {
              ok: true,
              expenseId: receiptId,
              expiresAt: "2099-01-01T00:00:00Z",
              items: [
                {
                  id: "receipt-url",
                  fileName: "PW-receipt.svg",
                  mimeType: "image/svg+xml",
                  signedUrl: `${url.origin}/__receipt-evidence.svg`,
                  referenceVersion: "fixture-v1",
                },
              ],
            },
          });
          return;
        }
        if (url.pathname === "/__receipt-evidence.svg") {
          record("fixture");
          await route.fulfill({
            contentType: "image/svg+xml",
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="white"/><text x="40" y="80" fill="black" font-size="24">PW Receipt Evidence Supplier</text><text x="40" y="130" fill="black" font-size="24">Materials $${receiptAmount.toFixed(2)}</text></svg>`,
          });
          return;
        }
        if (url.pathname === "/api/schema-check") {
          record("fixture");
          await route.fulfill({ json: { status: "ok", missing: [] } });
          return;
        }
        record("blocked-unexpected-read");
        await route.abort("blockedbyclient");
      });
      await use();
      const canonicalTotal = getExpenseTotal({ lines: rows.expense_lines as { amount: number }[] });
      const formattedTotal = formatCurrency(canonicalTotal);
      expect(canonicalTotal).toBe(receiptAmount);
      expect(formattedTotal).toBe(receiptAmount === 123.45 ? "$123.45" : "$999,999,999.99");
      await info.attach("receipt-network-console-evidence", {
        body: JSON.stringify(
          { sourceRows: rows, canonicalTotal, formattedTotal, errors, requests },
          null,
          2
        ),
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
      expect(requests.filter((request) => request.result === "blocked-write")).toEqual([]);
      expect(requests.filter((request) => request.result.startsWith("blocked-"))).toEqual([]);
      expect(
        requests.some(
          (request) => request.path === "/rest/v1/expenses" && request.result === "fixture"
        )
      ).toBe(true);
    },
    { auto: true },
  ],
});
export { expect };
