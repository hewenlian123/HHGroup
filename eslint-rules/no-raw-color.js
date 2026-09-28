const path = require("path");
const lib = require("../scripts/raw-color-lib.cjs");

const baseline = lib.loadBaseline();

function relative(filename) {
  return lib.toPosix(path.relative(lib.repoRoot(), filename));
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban raw colors outside src/styles/tokens.css. Baselined lines stay silent.",
    },
    schema: [],
    messages: {
      raw: "Raw color is not allowed outside src/styles/tokens.css.",
    },
  },
  create(context) {
    const filename = context.getFilename?.() || context.filename;
    const rel = relative(filename);
    if (!rel.startsWith("src/") || !/\.tsx?$/.test(rel)) return {};

    return {
      Program() {
        const allowed = baseline[rel] || {};
        const counts = new Map();
        const lines = context.getSourceCode().getText().split(/\r?\n/);
        lines.forEach((line, index) => {
          if (!lib.lineViolates(line, rel)) return;
          const trimmed = line.trim();
          const next = (counts.get(trimmed) || 0) + 1;
          counts.set(trimmed, next);
          if (next <= (allowed[trimmed] || 0)) return;
          context.report({
            loc: {
              start: { line: index + 1, column: 0 },
              end: { line: index + 1, column: Math.max(1, line.length) },
            },
            messageId: "raw",
          });
        });
      },
    };
  },
};
