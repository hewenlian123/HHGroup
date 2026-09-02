import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import {
  projectFinancialCellAttributes,
  projectFinancialCellClass,
  projectFinancialCellLabelClass,
  projectFinancialHeaderAttributes,
  projectFinancialTableClass,
  projectFinancialTableHeadClass,
} from "@/app/projects/[id]/_components/project-financial-responsive-table";
import { cn } from "@/lib/utils";

const root = resolve(process.cwd(), "src/app/projects/[id]");

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

test.describe("project financial tables global UI source contract", () => {
  test("renders real financial header associations in every stacked native table", async ({
    page,
  }) => {
    const [
      subcontracts,
      bills,
      detail,
      schedule,
      labor,
      profit,
      addSubcontractButton,
      changeOrderAttachments,
    ] = await Promise.all([
      source("subcontracts/page.tsx"),
      source("subcontracts/[subId]/bills/page.tsx"),
      source("subcontracts/[subId]/page.tsx"),
      source("subcontracts/[subId]/subcontract-detail-client.tsx"),
      source("labor/page.tsx"),
      source("profit/page.tsx"),
      source("subcontracts/add-subcontract-button.tsx"),
      source("change-orders/[coId]/change-order-attachments-section.tsx"),
    ]);

    for (const file of [subcontracts, bills, detail, schedule, labor, profit]) {
      expect(file).not.toContain("max-xl:[&_thead]:hidden");
      expect(file).not.toContain("before:content-[attr(data-label)]");
      expect(file).toContain("ProjectFinancialTableHead");
      expect(file).toContain("ProjectFinancialTableCell");
    }
    expect(subcontracts).not.toContain('className="w-full min-w-[1180px]');
    expect(subcontracts).not.toContain("xl:min-w-[1180px]");
    expect(subcontracts).toContain('headerId="subcontract-contract-amount"');
    expect(bills).toContain('headerId="subcontract-bill-amount"');
    expect(detail).toContain('headerId="linked-ap-bill-balance"');

    const header = projectFinancialHeaderAttributes("fixture-contract-amount");
    const cell = projectFinancialCellAttributes(header.id);
    const actionClass = addSubcontractButton.match(/className="([^"]*min-h-\[44px\][^"]*)"/)?.[1];
    const fileInputClass = changeOrderAttachments.match(
      /type="file"[\s\S]*?className="([^"]+)"/
    )?.[1];
    expect(actionClass).toBeTruthy();
    expect(fileInputClass).toBeTruthy();
    const neoTableCompositionClass = cn(
      "w-full min-w-[880px] border-collapse",
      projectFinancialTableClass
    );
    const markup = `
      <div data-testid="neo-table-scroll" class="w-full overflow-x-auto">
        <table aria-label="Financial accessibility fixture" class="${neoTableCompositionClass}">
          <thead class="${projectFinancialTableHeadClass}">
            <tr><th id="${header.id}" scope="${header.scope}">Contract Amount</th></tr>
          </thead>
          <tbody>
            <tr>
              <td headers="${cell.headers}" class="${projectFinancialCellClass}">
                <span aria-hidden="true" class="${projectFinancialCellLabelClass}">Contract Amount</span>
                <div>$1,234.56</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="${actionClass}">Add Subcontract</button>
      <input aria-label="Change order attachment" type="file" class="${fileInputClass}">
    `;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const stylesheetLinks = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    const fixtureHtml = `<!doctype html><html><head>${stylesheetLinks
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join("")}</head><body>${markup}</body></html>`;
    await page.route("**/__project-financial-fixture", (route) =>
      route.fulfill({ contentType: "text/html", body: fixtureHtml })
    );
    await page.goto("/__project-financial-fixture", { waitUntil: "networkidle" });

    for (const width of [1440, 1280, 1180, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const header = page.getByRole("columnheader", { name: "Contract Amount" });
      const cell = page.getByRole("cell");
      await expect(header).toHaveAttribute("id", "fixture-contract-amount");
      await expect(header).toHaveAttribute("scope", "col");
      await expect(cell).toHaveAttribute("headers", "fixture-contract-amount");
      await expect(cell.locator('[aria-hidden="true"]')).toHaveText("Contract Amount");
      expect(
        await page.locator("thead").evaluate((node) => getComputedStyle(node).display)
      ).not.toBe("none");
      expect(
        await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth),
        `responsive financial fixture has no root overflow at ${width}px`
      ).toBe(true);
      if (width < 1280) {
        const compactTableMetrics = await page.getByTestId("neo-table-scroll").evaluate((node) => {
          const table = node.querySelector("table");
          return {
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            tableClass: table?.className ?? "",
            tableMinWidth: table ? getComputedStyle(table).minWidth : "",
            tableWidth: table?.getBoundingClientRect().width ?? 0,
          };
        });
        expect(
          compactTableMetrics.scrollWidth <= compactTableMetrics.clientWidth,
          `NeoTable composition fits at ${width}px: ${JSON.stringify(compactTableMetrics)}`
        ).toBe(true);
        const actionBox = await page.getByRole("button", { name: "Add Subcontract" }).boundingBox();
        expect(actionBox?.height).toBeGreaterThanOrEqual(44);
        const fileInputBox = await page
          .getByLabel("Change order attachment", { exact: true })
          .boundingBox();
        expect(fileInputBox?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("keeps Labor and Profit financial values labelled at the 1180 tablet composition", async () => {
    const [labor, profit] = await Promise.all([
      source("labor/page.tsx"),
      source("profit/page.tsx"),
    ]);

    expect(labor).toContain('headerId="labor-worker-total-earned"');
    expect(profit.match(/<ProjectFinancialTable aria-label=/g)?.length ?? 0).toBe(3);
    expect(profit).toContain('headerId="profit-cost-impact"');
    expect(profit).toContain('headerId="profit-subcontract-exposure"');

    // Financial authority remains the canonical project-profit engine.
    expect(profit).toContain("getCanonicalProjectProfit(id, projectSupabase)");
    expect(profit).toContain("const totalCost = canonical.actualCost");
  });

  test("uses tablet/mobile records for project costs and Change Order line items", async () => {
    const [costLines, changeOrderLines, changeOrderEdit] = await Promise.all([
      source("project-cost-lines-table.tsx"),
      source("change-orders/[coId]/change-order-line-items-table.tsx"),
      source("change-orders/[coId]/edit/change-order-edit-client.tsx"),
    ]);

    expect(costLines).toContain('className="grid gap-2 xl:hidden"');
    expect(costLines).toContain('className="hidden xl:block"');
    expect(costLines).toContain("<dt");
    expect(costLines).not.toMatch(/<button[\s\S]*?<dl/);
    expect(costLines).toContain("View cost line");
    for (const file of [changeOrderLines, changeOrderEdit]) {
      expect(file).toContain("max-xl:[&>div:first-child]:!hidden");
      expect(file).toContain("max-xl:[&>div:nth-child(2)]:!grid");
    }
  });

  test("preserves 44px financial actions and canonical bill associations", async () => {
    const [
      detailClient,
      addSubcontract,
      addBill,
      billActions,
      approveBill,
      changeOrderEdit,
      changeOrderNew,
      attachments,
      snapshot,
    ] = await Promise.all([
      source("subcontracts/[subId]/subcontract-detail-client.tsx"),
      source("subcontracts/add-subcontract-modal.tsx"),
      source("subcontracts/[subId]/bills/add-bill-modal.tsx"),
      source("subcontracts/[subId]/bills/bill-row-actions.tsx"),
      source("subcontracts/[subId]/bills/approve-bill-button.tsx"),
      source("change-orders/[coId]/edit/change-order-edit-client.tsx"),
      source("change-orders/new/new-change-order-form.tsx"),
      source("change-orders/[coId]/change-order-attachments-section.tsx"),
      source("project-financial-snapshot-comparison-panel.tsx"),
    ]);

    expect(detailClient).toContain("createApBillFromScheduleAction");
    expect(detailClient).toContain("min-h-[44px]");
    expect(addSubcontract).toContain('htmlFor="add-subcontract-contract-amount"');
    expect(addSubcontract).toContain('id="add-subcontract-contract-amount"');
    expect(addBill).toContain('htmlFor="add-subcontract-bill-amount"');
    expect(addBill).toContain('id="add-subcontract-bill-amount"');
    expect(billActions).toContain('htmlFor={formId + "-payment-date"}');
    expect(billActions).toContain('id={formId + "-payment-date"}');
    expect(billActions).toContain("min-h-[44px]");
    expect(approveBill).toContain("min-h-[44px]");
    expect(changeOrderEdit).toContain('htmlFor="change-order-edit-amount"');
    expect(changeOrderEdit).toContain('aria-label="Line item unit price"');
    expect(changeOrderNew).toContain('htmlFor="new-change-order-amount"');
    expect(attachments).toContain("aria-label={`Delete attachment ${att.fileName}`}");
    expect(snapshot).toContain("min-h-[44px]");
    expect(snapshot).toContain("[overflow-wrap:anywhere]");
  });

  test("retains authority-defined subcontract billing eligibility", async () => {
    const bills = await source("subcontracts/[subId]/bills/page.tsx");
    expect(bills).toContain("subcontractBillCountsAsBilled(bill.status)");
    expect(bills).toContain("Math.max(0, billedToDate - materialDeductions - paymentsMade)");
  });
});
