import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

function authoredSources(directory) {
  return readdirSync(resolve(ROOT, directory), { recursive: true })
    .filter((path) => typeof path === "string" && [".ts", ".tsx", ".css"].includes(extname(path)))
    .map((path) => join(directory, path));
}

function joinedSources(paths) {
  return paths.map(source).join("\n");
}

test("Phase 6B Dashboard composes canonical visual authority", () => {
  const dashboard = joinedSources(authoredSources("src/app/dashboard"));
  const globals = source("src/app/globals.css");
  const dashboardCss = globals.slice(
    globals.indexOf(".dashboard-command-hero"),
    globals.indexOf(".neo-workspace-canvas")
  );

  assert.doesNotMatch(dashboard, /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/);
  assert.doesNotMatch(
    dashboard,
    /var\(--hud-(?:text|muted(?:-2)?|line|surface(?:-muted)?|track)\)/
  );
  assert.doesNotMatch(dashboard, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(
    dashboard,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/
  );
  assert.doesNotMatch(dashboard, /rounded-(?:lg|xl|2xl|\[[^\]]+\])/);
  assert.doesNotMatch(
    dashboard,
    /(?:border|bg|text)-\[(?:#|rgb\(|rgba\(|hsl\()/,
    "Dashboard owns a raw visual color"
  );
  assert.doesNotMatch(dashboardCss, /var\(--neo-/);
  assert.doesNotMatch(
    dashboardCss,
    /(?:font-size|font-weight|line-height|letter-spacing)\s*:/,
    "Dashboard owns typography outside the canonical role classes"
  );
  assert.doesNotMatch(
    dashboardCss,
    /--hud-(?:bg|surface(?:-muted)?|line|text|muted(?:-2)?|neutral|success|steel|danger|track):/,
    "Dashboard duplicates a canonical semantic token"
  );
});

test("Phase 6B Expense Operations composes canonical visual authority", () => {
  const expenseSources = [
    ...authoredSources("src/app/financial/expenses"),
    ...authoredSources("src/app/financial/inbox"),
    ...authoredSources("src/app/financial/reimbursements"),
    ...authoredSources("src/app/labor/receipts"),
    ...authoredSources("src/app/labor/reimbursements"),
    ...authoredSources("src/components/financial").filter((path) =>
      /(?:expense|receipt-inbox-source-nav|expenses-list-skeleton)/.test(path)
    ),
    ...authoredSources("src/components").filter((path) => /expense-[^/]+\.tsx$/.test(path)),
  ];
  const expense = joinedSources([...new Set(expenseSources)]);

  assert.doesNotMatch(
    expense,
    /var\(--(?:neo|eo|fieldbook|exp)-|neo-page-on-graphite|neo-(?:gold|graphite)/
  );
  assert.doesNotMatch(expense, /--(?:neo|eo|fieldbook|exp|rb)-[a-z0-9-]+\s*:/);
  assert.doesNotMatch(expense, /(?:#b8935a|#d2b77f|rgb\(184[ _]147[ _]90)/i);
  assert.doesNotMatch(
    expense,
    /(?:bg|text|border|ring)-(?:amber|orange|yellow|emerald|green|rose|red)-/,
    "Expense Operations owns raw status colors instead of canonical semantic status tokens"
  );
  assert.doesNotMatch(expense, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(expense, /font-mono/);
  assert.doesNotMatch(expense, /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/);
  assert.doesNotMatch(expense, /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/);
  assert.doesNotMatch(expense, /shadow-\[var\(--/);
  assert.doesNotMatch(
    expense,
    /(?:font-size|font-weight|line-height)\s*:\s*(?:\d|["'])/,
    "Expense Operations owns typography outside canonical semantic roles"
  );
  assert.doesNotMatch(expense, /border-radius\s*:\s*(?:6|8|10|12|14)px/);
});

test("Phase 6B Estimates composes canonical operational authority and preserves documents", () => {
  const protectedEstimatePattern =
    /(?:\/preview\/|\/print\/|\/payments\/|document|pagination|pdf|estimate-workspace-command-header|estimate-proposal-content|estimate-notes-preview|estimate-preview-summary-panel|proposal-scope-preview|line-item-description-body-preview)/;
  const estimateOperationalPaths = [
    ...authoredSources("src/app/estimates/_components"),
    ...authoredSources("src/app/estimates/new"),
    ...authoredSources("src/app/estimates/[id]"),
    "src/app/estimates/estimate-list-operational.css",
    "src/app/estimates/estimate-list-row.tsx",
    "src/app/estimates/estimates-list-client.tsx",
  ].filter((path) => !protectedEstimatePattern.test(path));
  const estimates = joinedSources([...new Set(estimateOperationalPaths)]);
  const builderGlass = source("src/app/estimates/_components/estimate-builder-glass.css");
  const builderOperational = source(
    "src/app/estimates/_components/estimate-builder-operational.css"
  );
  const commandHeader = source(
    "src/app/estimates/_components/estimate-workspace-command-header.tsx"
  );
  const builderCss = `${builderGlass}\n${builderOperational}`;

  assert.match(commandHeader, /<StatusBadge/);
  assert.match(commandHeader, /text-\[24px\][^"\n]*leading-\[30px\]/);
  assert.match(commandHeader, /hh-fin[^"\n]*text-\[20px\][^"\n]*leading-6/);
  assert.match(commandHeader, /rounded-\[6px\][^"\n]*--hh-border-default/);

  assert.doesNotMatch(
    estimates,
    /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/,
    "Estimate operational surfaces still consume Neo visual authority"
  );
  assert.doesNotMatch(
    builderCss,
    /--eb-(?!estimate-line-(?:grid|gap))[^:]+\s*:/,
    "Estimate Builder duplicates a canonical semantic token"
  );
  assert.doesNotMatch(
    builderCss,
    /var\(--eb-(?!estimate-line-(?:grid|gap))[^)]+\)/,
    "Estimate Builder consumes superseded local semantic tokens"
  );
  assert.equal(
    (builderGlass.match(/color-scheme:\s*dark/g) ?? []).length,
    0,
    "Estimate native date inputs must use the certified V2 light browser surface"
  );
  assert.match(
    builderGlass,
    /\.eb-date-field,[\s\S]*?input\[type="date"\][\s\S]*?color-scheme:\s*light/,
    "Estimate native date inputs must explicitly retain the light color scheme"
  );
  assert.doesNotMatch(
    builderCss,
    /(?:color|background|border(?:-color)?|outline)\s*:[^;]*(?:#[0-9a-f]{3,8}|rgba?\()/i,
    "Estimate operational CSS owns a raw visual color"
  );
  assert.doesNotMatch(
    estimates,
    /(?:bg|text|border|ring)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "Estimate operational surfaces own raw status colors"
  );
  assert.doesNotMatch(estimates, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(estimates, /font-mono/);
  assert.doesNotMatch(
    estimates,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/
  );
  assert.doesNotMatch(estimates, /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/);
  assert.doesNotMatch(estimates, /shadow-\[var\(--/);
});

test("Phase 6B Labor and Payroll compose canonical authority while preserving statements", () => {
  const protectedLaborPattern =
    /(?:\/statement\/|\/payments\/\[id\]\/receipt\/|worker-payment-receipt-(?:body|document|preview-modal))/;
  const laborPaths = [
    ...authoredSources("src/app/labor"),
    ...authoredSources("src/components/labor"),
  ].filter((path) => !protectedLaborPattern.test(path));
  const labor = joinedSources([...new Set(laborPaths)]);
  const workerStatement = source("src/app/workers/[id]/statement/print/page.tsx");

  assert.doesNotMatch(
    labor,
    /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/,
    "Labor/Payroll operational surfaces still consume Neo authority"
  );
  assert.doesNotMatch(
    labor,
    /(?:["']|\s)--(?!hh-)[a-z][a-z0-9-]+\s*:/,
    "Labor/Payroll declares a module-local semantic token"
  );
  assert.doesNotMatch(
    labor,
    /(?:bg|text|border|ring)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "Labor/Payroll owns raw status colors"
  );
  assert.doesNotMatch(labor, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(labor, /font-mono/);
  assert.doesNotMatch(labor, /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/);
  assert.doesNotMatch(labor, /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/);
  assert.doesNotMatch(labor, /shadow-\[(?:var\(--|[^\]]*(?:rgba?|rgb|#))/);
  assert.doesNotMatch(
    labor,
    /(?:bg|text|border|ring|divide)-\[(?:#|rgba?\(|rgb\()/,
    "Labor/Payroll owns a raw arbitrary visual color"
  );
  assert.doesNotMatch(labor, /\b(?:dark\s+)?neo-page-on-graphite\b/);
  assert.match(
    workerStatement,
    /payroll-statement-print-root/,
    "Worker Statement must retain the protected Inter-first print root"
  );
});

test("Phase 6B Projects compose canonical authority without changing financial semantics", () => {
  const projects = joinedSources([
    ...authoredSources("src/app/projects"),
    ...authoredSources("src/components/projects"),
  ]);

  assert.doesNotMatch(
    projects,
    /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/,
    "Projects operational surfaces still consume Neo authority"
  );
  assert.doesNotMatch(
    projects,
    /(?:bg|text|border|ring)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "Projects own raw status colors"
  );
  assert.doesNotMatch(projects, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(projects, /font-mono/);
  assert.doesNotMatch(
    projects,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/
  );
  assert.doesNotMatch(projects, /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/);
  assert.doesNotMatch(projects, /shadow-\[(?:var\(--|[^\]]*(?:rgba?|rgb|#))/);
  assert.doesNotMatch(
    projects,
    /(?:bg|text|border|ring|divide)-\[(?:#|rgba?\(|rgb\()/,
    "Projects own a raw arbitrary visual color"
  );
  assert.doesNotMatch(projects, /className="dark(?:\s|\")/);
});

test("Phase 6B Invoices compose canonical authority while preserving documents", () => {
  const protectedInvoicePattern = /(?:invoice-document|\/preview\/|\/print\/)/;
  const invoiceOperationalPaths = [
    ...authoredSources("src/app/financial/invoices"),
    "src/components/invoice-status-badge.tsx",
  ].filter((path) => !protectedInvoicePattern.test(path));
  const invoices = joinedSources([...new Set(invoiceOperationalPaths)]);
  const invoiceDocument = source("src/app/financial/invoices/[id]/invoice-document.tsx");
  const globals = source("src/app/globals.css");

  assert.doesNotMatch(
    invoices,
    /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/,
    "Invoice operational surfaces still consume Neo authority"
  );
  assert.doesNotMatch(
    invoices,
    /(?:bg|text|border|ring)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "Invoices own raw status colors"
  );
  assert.doesNotMatch(invoices, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
  assert.doesNotMatch(invoices, /font-mono/);
  assert.doesNotMatch(
    invoices,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/
  );
  assert.doesNotMatch(invoices, /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/);
  assert.doesNotMatch(invoices, /shadow-\[(?:var\(--|[^\]]*(?:rgba?|rgb|#))/);
  assert.doesNotMatch(
    invoices,
    /(?:bg|text|border|ring|divide)-\[(?:#|rgba?\(|rgb\()/,
    "Invoices own a raw arbitrary visual color"
  );
  assert.doesNotMatch(
    invoices,
    /(?:color|background|border(?:-color)?|box-shadow)\s*:[^;]*(?:#[0-9a-f]{3,8}|rgba?\(|rgb\()/i,
    "Invoice operational CSS owns a raw visual color or shadow"
  );
  assert.doesNotMatch(invoices, /className="dark(?:\s|\")/);
  assert.match(invoiceDocument, /invoice-a4-page/);
  assert.match(
    globals,
    /:where\([\s\S]*?\.invoice-a4-page[\s\S]*?font-family:\s*var\(--font-inter\)/,
    "Invoice Preview/Print must retain the protected Inter-first document root"
  );
});
