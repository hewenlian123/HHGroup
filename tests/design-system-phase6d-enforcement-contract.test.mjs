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

function assertNoPattern(paths, pattern, message) {
  const offenders = [...new Set(paths)].filter((path) => pattern.test(source(path)));
  assert.deepEqual(offenders, [], message);
}

const PHASE_6D_OPERATIONAL_PATHS = [
  ...authoredSources("src/app/change-orders"),
  ...authoredSources("src/app/estimate-templates"),
  "src/app/financial/page.tsx",
  ...authoredSources("src/app/inspection-log"),
  ...authoredSources("src/app/schedule"),
  ...authoredSources("src/app/punch-list"),
  ...authoredSources("src/app/site-photos"),
  ...authoredSources("src/app/system-logs"),
  ...authoredSources("src/app/system-metrics"),
  ...authoredSources("src/app/system/backups"),
  ...authoredSources("src/app/forgot-password"),
  ...authoredSources("src/app/reset-password"),
  ...authoredSources("src/app/unlock"),
  ...authoredSources("src/components/auth"),
];

const SHARED_AUTHORITY_PATHS = [
  ...authoredSources("src/components/base"),
  ...authoredSources("src/components/command"),
  ...authoredSources("src/components/layout"),
  ...authoredSources("src/components/mobile"),
  ...authoredSources("src/components/ui"),
  ...authoredSources("src/lib").filter((path) =>
    /(?:list-table-interaction|motion-system|native-field-classes|typography)\.(?:ts|tsx)$/.test(
      path
    )
  ),
];

const SHARED_OPERATIONAL_PATHS = SHARED_AUTHORITY_PATHS.filter(
  (path) => path !== "src/components/layout/app-shell.tsx"
);

const OPERATIONAL_APP_PATHS = authoredSources("src/app").filter(
  (path) => path !== "src/app/workers/[id]/statement/page.tsx"
);

test("Phase 6D removes Neo custom-property ownership after the final consumer reaches zero", () => {
  const paths = authoredSources("src");
  const globals = source("src/app/globals.css");

  assertNoPattern(paths, /var\(--neo-[a-z0-9-]+\)/, "Neo runtime consumers remain");
  assert.doesNotMatch(globals, /--neo-[a-z0-9-]+\s*:/);
});

test("Phase 6D operational routes no longer own superseded graphite, gold, or forced-dark visuals", () => {
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /neo-(?:gold|graphite)|#(?:07090d|0b0f15|b8935a|d2b77f)/i,
    "legacy graphite/gold ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /rgb\((?:184[ _](?:137[ _]45|147[ _]90)|198[ _]165[ _]106)/i,
    "legacy gold RGB ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /["'`]dark\s|(?:className|contentClassName)=["'`](?:dark(?:\s|["'`])|[^"'`]*\sdark(?:\s|["'`]))/,
    "forced-dark ownership remains"
  );
  assertNoPattern(
    OPERATIONAL_APP_PATHS,
    /["'`]dark["'`]/,
    "standalone forced-dark route ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /(?:hover|group-hover):-?translate|(?:active|hover|group-hover):scale|transition-all/,
    "legacy motion ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /shadow-\[(?:var\(--|[^\]]*(?:rgba?|rgb|#))/,
    "arbitrary shadow ownership remains"
  );
});

test("Phase 6D shared foundations consume canonical HH tokens directly", () => {
  const globals = source("src/app/globals.css");

  assertNoPattern(
    SHARED_AUTHORITY_PATHS,
    /var\(--neo-|neo-(?:gold|graphite)/,
    "Neo shared ownership remains"
  );
  assertNoPattern(
    SHARED_AUTHORITY_PATHS,
    /(?:hover|group-hover):-?translate|(?:active|hover):scale/,
    "shared lift or scale remains"
  );
  assertNoPattern(SHARED_AUTHORITY_PATHS, /shadow-\[var\(--/, "ambiguous shared shadow remains");
  assertNoPattern(
    SHARED_AUTHORITY_PATHS,
    /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/,
    "arbitrary shared radius ownership remains"
  );
  assertNoPattern(
    SHARED_OPERATIONAL_PATHS,
    /(?:bg|text|border|ring|divide)-(?:zinc|slate|gray|neutral|stone|amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "raw shared palette ownership remains"
  );
  assertNoPattern(
    SHARED_OPERATIONAL_PATHS,
    /(?:bg|text|border|ring|divide|outline|accent)-\[(?:#|rgba?\(|rgb\()/,
    "raw shared visual colors remain"
  );
  assertNoPattern(
    SHARED_OPERATIONAL_PATHS,
    /text-\[\d+(?:\.\d+)?(?:px|rem)\]|tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/,
    "arbitrary shared typography remains"
  );
  assertNoPattern(
    SHARED_AUTHORITY_PATHS,
    /(?:focus|focus-visible|focus-within)(?:-[^:\s"'`]+)*:(?:border|ring)-\[var\(--hh-(?:border-strong|text-primary)\)\]/,
    "noncanonical shared focus ownership remains"
  );
  assert.doesNotMatch(
    globals.match(/\.neo-toolbar\s*\{[^}]+\}/s)?.[0] ?? "",
    /gradient\(/,
    "shared toolbar still owns a decorative gradient"
  );
  assert.doesNotMatch(
    globals.match(/\.airtable-table-wrap\s*\{[^}]+\}/s)?.[0] ?? "",
    /rounded-\[/,
    "shared table frame still owns an arbitrary radius"
  );
  assert.doesNotMatch(
    globals.match(/\.kpi-metric\s*\{[^}]+\}/s)?.[0] ?? "",
    /rounded-(?:xl|2xl|3xl)/,
    "shared KPI cards still bypass the standard panel radius"
  );
});

test("Phase 6D operational enforcement rejects legacy literals without blocking log monospace", () => {
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /(?:bg|text|border|ring|divide|outline|accent)-\[(?:#|rgba?\(|rgb\()/,
    "raw arbitrary visual colors remain"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /(?:bg|text|border|ring|divide)-(?:zinc|slate|gray|neutral|stone)-/,
    "raw neutral palette ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /(?:bg|text|border|ring|divide)-(?:amber|orange|yellow|emerald|green|rose|red|blue|violet)-/,
    "raw semantic palette ownership remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /text-\[\d+(?:\.\d+)?(?:px|rem)\]/,
    "arbitrary operational typography remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /tracking-(?:tight|tighter|wide|wider|widest|\[(?!0(?:px|rem)?\]))/,
    "decorative operational tracking remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /rounded-\[(?:\d+(?:\.\d+)?(?:px|rem)|1\.5rem)\]/,
    "arbitrary operational radius remains"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS.filter((path) => !/src\/app\/system-logs\//.test(path)),
    /font-mono/,
    "mono remains outside the approved code/log exception"
  );
  assertNoPattern(
    PHASE_6D_OPERATIONAL_PATHS,
    /backdrop-blur|focus-visible:(?:border|ring)-\[(?:#|rgba?\(|rgb\()/,
    "decorative blur or raw focus ownership remains"
  );
});

test("Phase 6D keeps repository enforcement narrow and fail-closed", () => {
  const paths = authoredSources("src");
  const runtime = joinedSources(paths);

  assertNoPattern(paths, /shadow-\[var\(--hh-shadow-/, "ambiguous semantic shadow utility remains");
  assertNoPattern(
    paths,
    /\bNeoDatePicker\b|\bNeoDrawer\b|\bneoFormPanelClassName\b/,
    "deprecated or zero-consumer exports remain"
  );
  assert.equal((runtime.match(/<ToastProvider>/g) ?? []).length, 1);
  assert.doesNotMatch(runtime, /HotToaster|data-sonner-toaster|data-hot-toast/);
  assert.doesNotMatch(
    runtime,
    /focus-visible:ring-\[var\(--neo-|focus-visible:border-\[var\(--neo-/
  );
});

test("Phase 6D preserves exact protected exception ownership", () => {
  assert.match(
    source("src/app/estimates/[id]/preview/estimate-preview-content.tsx"),
    /estimate-a4-page/
  );
  assert.match(source("src/app/financial/invoices/[id]/invoice-document.tsx"), /invoice-a4-page/);
  assert.match(
    source("src/app/workers/[id]/statement/print/page.tsx"),
    /payroll-statement-print-root/
  );
  assert.match(
    source("src/app/materials/[id]/material-selection-document.tsx"),
    /material-selection-a4-page/
  );
  assert.match(source("src/components/receipt-viewer/receipt-viewer-dialog.tsx"), /receipt-viewer/);
  assert.match(source("src/components/attachment-preview-modal.tsx"), /attachment-preview/);
  assert.match(
    source("src/components/ui/date-picker.tsx"),
    /data-finance-date-picker-appearance="default"/
  );
  assert.doesNotMatch(source("src/components/ui/date-picker.tsx"), /backdrop-blur|isGlass/);
});
