import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 4 route read reuse", () => {
  it("starts Dashboard's three request-client read groups before awaiting any group", () => {
    const page = source("src/app/dashboard/dashboard-main-section.tsx");

    expect(page).toMatch(
      /const primaryDataPromise = Promise\.all\(\[\s*getRecentTransactionsCached\(20, projectSupabase\),\s*loadDashboardProjectsBundle\(projectSupabase\),\s*\]\)/
    );
    expect(page).toMatch(
      /const subcontractDataPromise = Promise\.all\(\[\s*getSubcontractsWithDetailsAll\(projectSupabase\),\s*getBillsSummaryAll\(projectSupabase\),\s*getPaymentsSummaryAll\(projectSupabase\),\s*\]\)/
    );
    expect(page).toMatch(
      /const metricDataPromise = Promise\.all\(\[\s*getApBillsSummaryCached\(projectSupabase\),\s*getLaborCostThisWeekCached\(projectSupabase\),\s*getExpensesThisMonthCached\(projectSupabase\),\s*getOverdueInvoicesCached\(projectSupabase\),\s*\]\)/
    );

    const primaryStart = page.indexOf("const primaryDataPromise");
    const subcontractStart = page.indexOf("const subcontractDataPromise");
    const metricStart = page.indexOf("const metricDataPromise");
    const groupedAwait = page.indexOf(
      "const [primaryData, subcontractData, metricData] = await Promise.all(["
    );
    expect(primaryStart).toBeGreaterThan(-1);
    expect(subcontractStart).toBeGreaterThan(primaryStart);
    expect(metricStart).toBeGreaterThan(subcontractStart);
    expect(groupedAwait).toBeGreaterThan(metricStart);
  });

  it("uses exactly one admin client and overlaps Estimate Detail's post-stage reads", () => {
    const page = source("src/app/estimates/[id]/page.tsx");

    expect(page.match(/getServerSupabaseAdminNoStore\(\)/g)).toHaveLength(1);
    expect(page).toContain("listPaymentTemplates(adminClient)");
    expect(page).toContain("getEstimateRevisionContext(id, adminClient)");
    expect(page).toContain("getEstimateActivityWithClient(adminClient, id)");
    expect(page).toMatch(
      /const \[invoiceProjectLink, paymentInvoiceSummaries\] = await Promise\.all\(\[/
    );
    expect(page).toContain("getInvoiceProjectLinkStatus(id, meta.project.name, adminClient)");
    expect(page).toMatch(
      /getPaymentInvoiceSummaries\(\s*paymentSchedule\.map\(\(item\) => item\.invoiceId \?\? \"\"\),\s*adminClient\s*\)/
    );
  });

  it("covers the remaining Phase 4 routes with duration-only server diagnostics", () => {
    const projects = source("src/app/projects/page.tsx");
    const estimate = source("src/app/estimates/[id]/page.tsx");
    const schedule = source("src/app/api/operations/schedule/route.ts");

    expect(projects).toContain('emitRscTiming("projects"');
    expect(estimate).toContain('emitRscTiming("estimates/[id]"');
    expect(schedule).toContain("attachServerTiming(response");
    expect(schedule).toContain("hh_handler_total");
  });
});
