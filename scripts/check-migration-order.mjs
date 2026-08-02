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
const projectsProvenance = Object.freeze({
  canonicalFile: "20260228000301_projects.sql",
  // The later file is a Production-ledger mirror, not a second canonical source.
  ledgerMirrorFile: "202603081650_projects.sql",
  gitBlob: "6704296bb567526e1eb90ac38afc2bb8cb3710c3",
  rawSha: "05e7d47b7ca634c403ab9017a837b13f963ea2e8ebce53d5a3d7296bc030ee5d",
  normalizedSha: "3d33c2838bd138339dcc0928f42912bdc9c6423cb2f9109ee81cc2e3903e6289",
  tokenSha: "6360e7a0460d5680b28f40294c44ff3a53bb7215a293e46f1cd1947354963fc5",
  statementArraySha: "3b06e021c294ea1d25092c520e6acca6e3d0f19eff7f9499cdb1d1455aa30e49",
  statementCount: 17,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

function gitBlobFingerprint(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function splitSqlStatements(source) {
  const statements = [];
  let start = 0;
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  let dollarTag = null;

  while (index < source.length) {
    if (lineComment) {
      if (source[index] === "\n") lineComment = false;
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (source[index] === "/" && source[index + 1] === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (source[index] === "*" && source[index + 1] === "/") {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = null;
      } else {
        index += 1;
      }
      continue;
    }
    if (singleQuoted) {
      if (source[index] === "'" && source[index + 1] === "'") {
        index += 2;
      } else if (source[index] === "'") {
        singleQuoted = false;
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (doubleQuoted) {
      if (source[index] === '"' && source[index + 1] === '"') {
        index += 2;
      } else if (source[index] === '"') {
        doubleQuoted = false;
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (source[index] === "-" && source[index + 1] === "-") {
      lineComment = true;
      index += 2;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (source[index] === "'") {
      singleQuoted = true;
      index += 1;
      continue;
    }
    if (source[index] === '"') {
      doubleQuoted = true;
      index += 1;
      continue;
    }
    if (source[index] === "$") {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length;
        continue;
      }
    }
    if (source[index] === ";") {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
    index += 1;
  }

  if (singleQuoted || doubleQuoted || dollarTag || blockCommentDepth > 0) {
    throw new Error("Unterminated SQL construct while parsing migration statements.");
  }
  const trailing = source.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function statementArrayFingerprint(source) {
  const statements = splitSqlStatements(source);
  return {
    count: statements.length,
    sha: sha256(statements.join("\x1f")),
  };
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

function verifyProjectsProvenance(files) {
  const expectedFiles = [projectsProvenance.canonicalFile, projectsProvenance.ledgerMirrorFile];
  const missingFiles = expectedFiles.filter((file) => !files.includes(file));
  if (missingFiles.length > 0) {
    throw new Error(
      `Projects migration provenance requires both exact historical filenames; missing: ${missingFiles.join(", ")}. See docs/superpowers/specs/2026-08-02-projects-migration-provenance-resolution-design.md.`
    );
  }

  for (const file of expectedFiles) {
    const bytes = readFileSync(join(migrationsDirectory, file));
    const source = bytes.toString("utf8");
    const statements = statementArrayFingerprint(source);
    if (
      gitBlobFingerprint(bytes) !== projectsProvenance.gitBlob ||
      sha256(bytes) !== projectsProvenance.rawSha ||
      sha256(normalizeSql(source)) !== projectsProvenance.normalizedSha ||
      sqlTokenFingerprint(source) !== projectsProvenance.tokenSha ||
      statements.sha !== projectsProvenance.statementArraySha ||
      statements.count !== projectsProvenance.statementCount
    ) {
      throw new Error(
        `Projects migration provenance fingerprint mismatch for ${file}. Historical migrations must remain byte-for-byte unchanged; see docs/superpowers/specs/2026-08-02-projects-migration-provenance-resolution-design.md.`
      );
    }
  }
}

function verifyProvenance() {
  const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"));
  verifyProjectsProvenance(files);
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
    const matches = tokenFingerprints.get(fingerprint) ?? [];
    matches.push(file);
    tokenFingerprints.set(fingerprint, matches);
  }
  for (const [fingerprint, matches] of tokenFingerprints) {
    if (matches.length < 2) continue;
    const isApprovedProjectsPair =
      fingerprint === projectsProvenance.tokenSha &&
      matches.length === 2 &&
      matches.includes(projectsProvenance.canonicalFile) &&
      matches.includes(projectsProvenance.ledgerMirrorFile);
    if (!isApprovedProjectsPair) {
      throw new Error(`Semantic duplicate migrations: ${matches.join(", ")}`);
    }
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
