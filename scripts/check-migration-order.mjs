#!/usr/bin/env node
/**
 * Prevent "insert before last remote migration" failures.
 *
 * Rule: any *new/renamed* migration version introduced by this branch must be
 * strictly greater than the max migration version that exists on the base ref.
 *
 * Works in:
 * - PRs: compares against merge-base of HEAD and origin/<base>
 * - Pushes: compares against HEAD~1
 *
 * Requires checkout with fetch-depth: 0 (or enough history).
 */

import { execSync } from "node:child_process";

// These filenames reconcile source control to versions already recorded in Production.
// They are provenance artifacts only: the release procedure must never replay, repair,
// or renumber them. Keep this allowlist exact so ordinary old-version migrations still fail.
const productionRecordedHistoricalMigrations = new Set([
  "20260801065640_restore_estimate_grants_rls_parity.sql",
  "20260802055949_project_pdf_documents_expand.sql",
  "20260802110245_canonical_closeout_reconciliation.sql",
]);
const productionRecordedRenameTargets = new Map([
  [
    "supabase/migrations/20260731080335_restore_estimate_grants_rls_parity.sql",
    "supabase/migrations/20260801065640_restore_estimate_grants_rls_parity.sql",
  ],
]);

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] })
    .toString("utf8")
    .trim();
}

function parseVersionFromName(name) {
  const m = /^(\d{12,14})_/.exec(name);
  return m ? m[1] : null;
}

function maxVersionFromFileList(files) {
  let max = null;
  for (const f of files) {
    const base = f.split("/").pop() || "";
    if (!base.endsWith(".sql")) continue;
    const v = parseVersionFromName(base);
    if (!v) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

function getBaseRef() {
  const event = process.env.GITHUB_EVENT_NAME || "";
  const ref = process.env.GITHUB_REF || "";
  if (event === "pull_request") {
    const base = process.env.GITHUB_BASE_REF || "main";
    return `origin/${base}`;
  }
  if (ref === "refs/heads/main") return "HEAD~1";
  // Fallback for local runs / other branches
  return "HEAD~1";
}

function ensureFetched(baseRef) {
  if (!baseRef.startsWith("origin/")) return;
  try {
    sh(`git show --quiet ${baseRef}`);
  } catch {
    sh(`git fetch --no-tags --prune --depth=200 origin ${baseRef.replace(/^origin\//, "")}`);
  }
}

function main() {
  const baseRef = getBaseRef();
  ensureFetched(baseRef);

  // Determine diff range.
  let diffRange = "";
  if (baseRef.startsWith("origin/")) {
    const mb = sh(`git merge-base ${baseRef} HEAD`);
    diffRange = `${mb}...HEAD`;
  } else {
    diffRange = `${baseRef}..HEAD`;
  }

  const changed = sh(
    `git diff --find-renames --name-status ${diffRange} -- supabase/migrations/*.sql`
  );
  const untracked = sh("git ls-files --others --exclude-standard -- 'supabase/migrations/*.sql'");
  if (!changed && !untracked) {
    console.log("Migration order check passed (no migration changes).");
    return;
  }

  const changedTargets = new Set();
  for (const line of changed.split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const status = parts[0] || "";
    if (status.startsWith("R")) {
      const from = parts[1];
      const to = parts[2];
      if (from && to && productionRecordedRenameTargets.get(from) === to) continue;
      if (to) changedTargets.add(to);
      continue;
    }
    if (status === "A") {
      const file = parts[1];
      const base = file?.split("/").pop() || "";
      if (productionRecordedHistoricalMigrations.has(base)) continue;
      if (file) changedTargets.add(file);
    }
  }
  for (const file of untracked.split("\n").filter(Boolean)) {
    const base = file.split("/").pop() || "";
    if (productionRecordedHistoricalMigrations.has(base)) continue;
    changedTargets.add(file);
  }

  const changedVersions = Array.from(changedTargets)
    .map((p) => p.split("/").pop() || "")
    .map(parseVersionFromName)
    .filter(Boolean);

  if (changedVersions.length === 0) {
    console.log("Migration order check passed (no new/renamed versions).");
    return;
  }

  const baseFiles = sh(`git ls-tree -r --name-only ${baseRef} supabase/migrations/`)
    .split("\n")
    .filter(Boolean);
  const maxBase = maxVersionFromFileList(baseFiles);
  if (!maxBase) {
    console.log("Migration order check passed (no base migrations found).");
    return;
  }

  const bad = changedVersions.filter((v) => v <= maxBase);
  if (bad.length > 0) {
    console.error("Migration ordering check failed.");
    console.error(`Base ref: ${baseRef}`);
    console.error(`Max version on base: ${maxBase}`);
    console.error("New/renamed migration versions must be > max version on base.");
    console.error(`Offending versions: ${Array.from(new Set(bad)).sort().join(", ")}`);
    process.exit(1);
  }

  console.log(`Migration order check passed (base max ${maxBase}).`);
}

main();
