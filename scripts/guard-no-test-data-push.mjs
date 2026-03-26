import { execSync } from "node:child_process";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function listFiles(cmd) {
  const out = run(cmd);
  if (!out) return [];
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const denylist = [
  /^backups\/database\//i,
  /^playwright-report\//i,
  /^test-results\//i,
  /^tmp\//i,
  /^\.tmp\//i,
  /(^|\/)tmp-local-ocr-receipt\.(png|svg|jpg|jpeg|webp)$/i,
  /(^|\/)backup-\d{4}-\d{2}-\d{2}.*\.json$/i,
];

function isBlocked(path) {
  return denylist.some((re) => re.test(path));
}

const inGitRepo = run("git rev-parse --is-inside-work-tree");
if (inGitRepo !== "true") {
  process.exit(0);
}

const upstream = run("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
const pushedDiffCmd = upstream
  ? `git diff --name-only --diff-filter=ACMR ${upstream}...HEAD`
  : "git show --pretty='' --name-only --diff-filter=ACMR HEAD";

const toBePushed = listFiles(pushedDiffCmd);
const staged = listFiles("git diff --name-only --cached --diff-filter=ACMR");
const unstaged = listFiles("git diff --name-only --diff-filter=ACMR");
const untracked = listFiles("git ls-files --others --exclude-standard");

const blocked = new Set(
  [...toBePushed, ...staged, ...unstaged, ...untracked].filter((f) => isBlocked(f))
);

if (blocked.size > 0) {
  console.error("Push blocked: local test data/artifacts detected.");
  for (const file of [...blocked].sort()) {
    console.error(` - ${file}`);
  }
  console.error("Remove or untrack these files, then re-run test:before-push.");
  process.exit(1);
}

console.log("Guard passed: no local test data/artifacts detected.");
