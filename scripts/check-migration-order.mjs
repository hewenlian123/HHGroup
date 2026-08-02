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
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(scriptDirectory, "..", "supabase", "migrations");
const productionProvenanceFile = "20260801065640_restore_estimate_grants_rls_parity.sql";
const siblingProvenanceFile = "20260731080335_restore_estimate_grants_rls_parity.sql";
const productionRawSha = "d97cdd6462f56b4f6a2b6aa835cea573392627ccb07ae1147ca0f1a35a87b349";
const productionNormalizedSha = "474e4070650e5be94320811d0bf9bbb6f10f3cb7630d3630bba60d9254a41bbe";
const productionTokenSha = "1281a2721db891c0f05ae76b179c32ac98b342b5d710523137cbde9d33b595c8";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

// Tokenize outside quoted values so comments, whitespace, and unquoted identifier case
// cannot hide a duplicate migration while literal and dollar-quoted bodies remain exact.
function sqlTokenFingerprint(value) {
  const tokens = [];
  let index = 0;

  while (index < value.length) {
    const current = value[index];
    const next = value[index + 1];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      index += 2;
      while (index < value.length && value[index] !== "\n") index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < value.length && depth > 0) {
        if (value[index] === "/" && value[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (value[index] === "*" && value[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth !== 0) throw new Error("Unterminated SQL block comment.");
      continue;
    }
    if (current === "'") {
      const start = index++;
      while (index < value.length) {
        if (value[index] === "'" && value[index + 1] === "'") {
          index += 2;
        } else if (value[index++] === "'") {
          break;
        }
      }
      if (value[index - 1] !== "'") throw new Error("Unterminated SQL string literal.");
      tokens.push(`string:${value.slice(start, index)}`);
      continue;
    }
    if (current === '"') {
      const start = index++;
      while (index < value.length) {
        if (value[index] === '"' && value[index + 1] === '"') {
          index += 2;
        } else if (value[index++] === '"') {
          break;
        }
      }
      if (value[index - 1] !== '"') throw new Error("Unterminated quoted SQL identifier.");
      tokens.push(`quoted:${value.slice(start, index)}`);
      continue;
    }
    if (current === "$") {
      const tag = value.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        const bodyStart = index + tag.length;
        const bodyEnd = value.indexOf(tag, bodyStart);
        if (bodyEnd < 0) throw new Error("Unterminated dollar-quoted SQL literal.");
        tokens.push(`dollar:${value.slice(bodyStart, bodyEnd)}`);
        index = bodyEnd + tag.length;
        continue;
      }
    }
    if (/[A-Za-z_]/.test(current)) {
      const start = index++;
      while (index < value.length && /[A-Za-z0-9_$]/.test(value[index])) index += 1;
      tokens.push(`identifier:${value.slice(start, index).toLowerCase()}`);
      continue;
    }
    if (/[0-9]/.test(current)) {
      const start = index++;
      while (index < value.length && /[0-9A-Za-z_.]/.test(value[index])) index += 1;
      tokens.push(`number:${value.slice(start, index).toLowerCase()}`);
      continue;
    }

    const operator = [
      "->>",
      "#>>",
      "::",
      ">=",
      "<=",
      "<>",
      "!=",
      "||",
      "&&",
      "->",
      "#>",
      "?&",
      "?|",
      ":=",
    ].find((candidate) => value.startsWith(candidate, index));
    if (operator) {
      tokens.push(`operator:${operator}`);
      index += operator.length;
    } else {
      tokens.push(`punctuation:${current}`);
      index += 1;
    }
  }

  return sha256(tokens.join("\x1f"));
}

function verifyProvenance() {
  const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"));
  if (!files.includes(productionProvenanceFile) || files.includes(siblingProvenanceFile)) {
    throw new Error("Estimate-grants provenance must exist only at the Production ledger version.");
  }

  const bytes = readFileSync(join(migrationsDirectory, productionProvenanceFile));
  const source = bytes.toString("utf8");
  const normalized = normalizeSql(source);
  if (
    sha256(bytes) !== productionRawSha ||
    sha256(normalized) !== productionNormalizedSha ||
    sqlTokenFingerprint(source) !== productionTokenSha
  ) {
    throw new Error("Production estimate-grants migration fingerprint changed.");
  }

  const equivalentFiles = files.filter((file) => {
    const sql = normalizeSql(readFileSync(join(migrationsDirectory, file), "utf8"));
    return sha256(sql) === productionNormalizedSha;
  });
  if (equivalentFiles.length !== 1 || equivalentFiles[0] !== productionProvenanceFile) {
    throw new Error(
      `Duplicate estimate-grants migration representation: ${equivalentFiles.join(", ")}`
    );
  }

  const tokenFingerprints = new Map();
  for (const file of files) {
    const fingerprint = sqlTokenFingerprint(readFileSync(join(migrationsDirectory, file), "utf8"));
    const prior = tokenFingerprints.get(fingerprint);
    if (prior) {
      throw new Error(`Semantic duplicate migrations: ${prior}, ${file}`);
    }
    tokenFingerprints.set(fingerprint, file);
  }
}

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
  verifyProvenance();
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

  const changed = sh(`git diff --name-status ${diffRange} -- supabase/migrations/*.sql`);
  if (!changed) {
    console.log("Migration order check passed (no migration changes).");
    return;
  }

  const changedTargets = [];
  for (const line of changed.split("\n")) {
    const parts = line.split("\t");
    const status = parts[0] || "";
    if (status.startsWith("R")) {
      const to = parts[2];
      if (to) changedTargets.push(to);
      continue;
    }
    if (status === "A") {
      const file = parts[1];
      if (file) changedTargets.push(file);
    }
  }

  const changedVersions = changedTargets
    .map((p) => p.split("/").pop() || "")
    // This exact, fingerprint-pinned filename represents an already-applied Production
    // ledger entry restored by the reviewed provenance merge contract.
    .filter((name) => name !== productionProvenanceFile)
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
