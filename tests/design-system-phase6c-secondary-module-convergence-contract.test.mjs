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
  return [...new Set(paths)].map(source).join("\n");
}

function operationalSources(directories, protectedPattern = /$^/) {
  return directories
    .flatMap((directory) => authoredSources(directory))
    .filter((path) => !protectedPattern.test(path));
}

function assertCanonicalOperationalVisuals(label, paths, { allowRawStatus = false } = {}) {
  const content = joinedSources(paths);

  assert.doesNotMatch(
    content,
    /var\(--neo-|neo-page-on-graphite|neo-(?:gold|graphite)/,
    `${label} still consumes Neo visual authority`
  );
  assert.doesNotMatch(
    content,
    /(?:className|contentClassName)=["'`](?:dark(?:\s|["'`])|[^"'`]*\sdark(?:\s|["'`]))|className=\{[^}]{0,200}["'`]dark(?:\s|["'`])/,
    `${label} is forced dark`
  );
  assert.doesNotMatch(content, /text-\[\d+(?:\.\d+)?(?:px|rem)\]/, `${label} owns arbitrary type`);
  assert.doesNotMatch(content, /font-mono/, `${label} uses mono instead of FIN`);
  assert.doesNotMatch(
    content,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/,
    `${label} owns decorative tracking`
  );
  assert.doesNotMatch(
    content,
    /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/,
    `${label} owns arbitrary radius`
  );
  assert.doesNotMatch(
    content,
    /shadow-\[(?:var\(--|[^\]]*(?:rgba?|rgb|#))/,
    `${label} owns arbitrary shadow`
  );
  assert.doesNotMatch(
    content,
    /(?:hover|group-hover):-?translate|(?:active|hover|group-hover):scale|transition-all/,
    `${label} owns legacy lift or scale motion`
  );
  assert.doesNotMatch(
    content,
    /(?:focus|focus-visible|focus-within)(?:-[^:\s"'`]+)*:(?:border|ring)-\[var\(--hh-(?:border-strong|text-primary)\)\]/,
    `${label} weakens canonical focus ownership`
  );
  assert.doesNotMatch(
    content,
    /(?:bg|text|border|ring|divide)-\[(?:#|rgba?\(|rgb\()/,
    `${label} owns a raw arbitrary visual color`
  );
  assert.doesNotMatch(
    content,
    /(?:bg|text|border|ring|divide)-(?:zinc|slate|gray|neutral|stone)-/,
    `${label} owns a raw neutral palette color`
  );
  if (!allowRawStatus) {
    assert.doesNotMatch(
      content,
      /(?:bg|text|border|ring|divide)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
      `${label} owns raw status colors`
    );
  }
}

test("Phase 6C Bills compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals("Bills", operationalSources(["src/app/bills"]));
});

test("Phase 6C Customers and Subcontractors compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals(
    "Customers and Subcontractors",
    operationalSources([
      "src/app/customers",
      "src/components/customers",
      "src/app/subcontractors",
      "src/app/settings/subcontractors",
    ])
  );
});

test("Phase 6C Reports compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals("Reports", operationalSources(["src/app/reports"]));
});

test("Phase 6C Settings compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals(
    "Settings",
    operationalSources(["src/app/settings", "src/components/settings"], /\/subcontractors\//)
  );
});

test("Phase 6C System Health is a normal operational workspace", () => {
  assertCanonicalOperationalVisuals(
    "System Health",
    operationalSources(["src/app/system-health", "src/app/settings/system-health"])
  );
});

test("Phase 6C bounded lower-use Finance surfaces compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals(
    "Lower-use Finance",
    operationalSources(
      [
        "src/app/finance",
        "src/app/financial/accounts",
        "src/app/financial/ar",
        "src/app/financial/bank",
        "src/app/financial/deposits",
        "src/app/financial/owner",
        "src/app/financial/vendors",
        "src/app/financial/commissions",
        "src/app/financial/payments",
      ],
      /(?:receipt|preview|print|document)/
    )
  );
});

test("Phase 6C bounded Worker detail surfaces compose canonical visual authority", () => {
  assertCanonicalOperationalVisuals(
    "Worker detail",
    operationalSources(
      ["src/app/workers", "src/app/worker"],
      /(?:\/preview\/|\/print\/|document|statement|receipt)/
    )
  );
});

test("Phase 6C preserves protected document typography roots", () => {
  assert.match(
    source("src/app/workers/[id]/statement/print/page.tsx"),
    /payroll-statement-print-root/
  );
  assert.match(source("src/app/financial/invoices/[id]/invoice-document.tsx"), /invoice-a4-page/);
  assert.match(
    source("src/app/estimates/[id]/preview/estimate-preview-content.tsx"),
    /estimate-a4-page/
  );
});
