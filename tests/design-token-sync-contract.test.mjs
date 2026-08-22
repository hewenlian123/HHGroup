import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

async function loadContract() {
  try {
    return await import("../scripts/design-token-sync-lib.mjs");
  } catch (error) {
    assert.fail(`Design token sync contract is not implemented: ${error.message}`);
  }
}

test("parses the current Design System v1 color, state, geometry, and typography contract", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const contract = parseDesignSystemTokens(markdown);

  assert.equal(contract.schemaVersion, 5);
  assert.equal(contract.tokens.length, 33);
  assert.equal(contract.dimensions.length, 30);
  assert.equal(contract.typography.length, 15);
  assert.equal(contract.typographyContracts.length, 7);
  assert.deepEqual(contract.tokens[0], {
    role: "L0 Canvas",
    name: "l0-canvas",
    cssVariable: "--hh-l0-canvas",
    light: "#F7F7F6",
    dark: "#0A0A0A",
  });
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "action-primary-foreground"),
    {
      role: "Action primary",
      name: "action-primary-foreground",
      cssVariable: "--hh-action-primary-foreground",
      light: "#FFFFFF",
      dark: "#161616",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "focus-ring"),
    {
      role: "Focus Ring",
      name: "focus-ring",
      cssVariable: "--hh-focus-ring",
      light: "rgb(23 23 23 / 32%)",
      dark: "rgb(242 242 239 / 38%)",
    }
  );
  assert.deepEqual(
    contract.tokens.filter(({ name }) => name.startsWith("success-")),
    [
      {
        role: "Success soft fill",
        name: "success-soft-fill",
        cssVariable: "--hh-success-soft-fill",
        light: "rgb(22 129 91 / 8%)",
        dark: "rgb(76 175 124 / 8%)",
      },
      {
        role: "Success semantic border",
        name: "success-border",
        cssVariable: "--hh-success-border",
        light: "rgb(22 129 91 / 22%)",
        dark: "rgb(76 175 124 / 22%)",
      },
    ]
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-floating").light,
    "rgb(22 22 22 / 12%)"
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-strong").dark,
    "rgb(255 255 255 / 17%)"
  );
  assert.deepEqual(
    contract.tokens.filter(({ name }) => name.startsWith("l3-")),
    [
      {
        role: "L3 Interactive Surface",
        name: "l3-hover",
        cssVariable: "--hh-l3-hover",
        light: "#F4F4F2",
        dark: "#222222",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-selected",
        cssVariable: "--hh-l3-selected",
        light: "#ECECEA",
        dark: "#2C2C2C",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-pressed",
        cssVariable: "--hh-l3-pressed",
        light: "#E7E7E4",
        dark: "#323232",
      },
    ]
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "l4-floating-surface"),
    {
      role: "L4 Floating Surface",
      name: "l4-floating-surface",
      cssVariable: "--hh-l4-floating-surface",
      light: "#FFFFFF",
      dark: "#252525",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "l5-task-surface"),
    {
      role: "L5 Task Surface",
      name: "l5-task-surface",
      cssVariable: "--hh-l5-task-surface",
      light: "#FFFFFF",
      dark: "#292929",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-operational"),
    {
      role: "Operational Shadow",
      name: "shadow-operational",
      cssVariable: "--hh-shadow-operational",
      light: "0 1px 2px rgb(0 0 0 / 0.04), 0 14px 32px -26px rgb(0 0 0 / 0.24)",
      dark: "0 1px 0 rgb(255 255 255 / 0.025), 0 14px 34px -26px rgb(0 0 0 / 0.84)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-floating"),
    {
      role: "Floating Shadow",
      name: "shadow-floating",
      cssVariable: "--hh-shadow-floating",
      light: "0 2px 8px -3px rgb(0 0 0 / 0.10), 0 22px 48px -18px rgb(0 0 0 / 0.22)",
      dark: "0 1px 0 rgb(255 255 255 / 0.055), 0 20px 46px -14px rgb(0 0 0 / 0.76)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-task"),
    {
      role: "Task Shadow",
      name: "shadow-task",
      cssVariable: "--hh-shadow-task",
      light: "0 4px 12px -5px rgb(0 0 0 / 0.12), 0 34px 72px -26px rgb(0 0 0 / 0.28)",
      dark: "0 1px 0 rgb(255 255 255 / 0.065), 0 32px 76px -20px rgb(0 0 0 / 0.92)",
    }
  );
  assert.deepEqual(contract.dimensions.slice(0, 3), [
    {
      role: "Space 1",
      name: "space-1",
      cssVariable: "--hh-space-1",
      value: "4px",
    },
    {
      role: "Space 2",
      name: "space-2",
      cssVariable: "--hh-space-2",
      value: "8px",
    },
    {
      role: "Space 3",
      name: "space-3",
      cssVariable: "--hh-space-3",
      value: "12px",
    },
  ]);
  assert.deepEqual(
    contract.dimensions.find(({ name }) => name === "control-height-comfortable"),
    {
      role: "Comfortable control height",
      name: "control-height-comfortable",
      cssVariable: "--hh-control-height-comfortable",
      value: "40px",
    }
  );
  assert.deepEqual(contract.dimensions.at(-1), {
    role: "Major-region gap",
    name: "gap-region",
    cssVariable: "--hh-gap-region",
    value: "24px",
  });
  assert.deepEqual(contract.typography[0], {
    role: "Page Title",
    name: "page-title",
    cssVariablePrefix: "--hh-type-page-title",
    mobile: { fontSize: "20px", lineHeight: "26px" },
    desktop: { fontSize: "24px", lineHeight: "30px" },
    fontWeight: "600",
    letterSpacing: "0",
    numericContract: "none",
  });
  assert.deepEqual(
    contract.typography.find(({ name }) => name === "financial-total"),
    {
      role: "Financial Total",
      name: "financial-total",
      cssVariablePrefix: "--hh-type-financial-total",
      mobile: { fontSize: "20px", lineHeight: "24px" },
      desktop: { fontSize: "20px", lineHeight: "24px" },
      fontWeight: "600",
      letterSpacing: "0",
      numericContract: "FIN",
    }
  );
  assert.deepEqual(contract.typographyContracts, [
    {
      contract: "Operational font family",
      name: "font-family-sans",
      cssVariable: "--hh-font-family-sans",
      value:
        'var(--font-geist-sans), var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    {
      contract: "FIN variant",
      name: "fin-variant",
      cssVariable: "--hh-fin-variant",
      value: "tabular-nums lining-nums",
    },
    {
      contract: "FIN features",
      name: "fin-features",
      cssVariable: "--hh-fin-features",
      value: '"tnum" 1, "lnum" 1, "zero" 0',
    },
    {
      contract: "Text-entry mobile size",
      name: "type-text-entry-size-mobile",
      cssVariable: "--hh-type-text-entry-size-mobile",
      value: "16px",
    },
    {
      contract: "Text-entry mobile line height",
      name: "type-text-entry-line-height-mobile",
      cssVariable: "--hh-type-text-entry-line-height-mobile",
      value: "24px",
    },
    {
      contract: "Text-entry desktop size",
      name: "type-text-entry-size-desktop",
      cssVariable: "--hh-type-text-entry-size-desktop",
      value: "14px",
    },
    {
      contract: "Text-entry desktop line height",
      name: "type-text-entry-line-height-desktop",
      cssVariable: "--hh-type-text-entry-line-height-desktop",
      value: "20px",
    },
  ]);
});

test("fails closed for missing, duplicate, malformed, and incomplete authority rows", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const warningRow = markdown.match(/^\| Warning \|.*$/m)?.[0];

  assert.ok(warningRow, "expected the authority Warning row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${warningRow}\n`, "")),
    /missing required token role: Warning/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(warningRow, `${warningRow}\n${warningRow}`)),
    /duplicate token role: Warning/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace("`#A16207`", "`#NOTHEX`")),
    /malformed Light value for Warning/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(warningRow, "| Warning | `#A16207` |  | Attention. |")
      ),
    /incomplete Light\/Dark pair for Warning/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          "0 34px 72px -26px rgb(0 0 0 / 0.28)",
          "0 34px decorative rgb(0 0 0 / 0.28)"
        )
      ),
    /malformed Light value for Task Shadow/i
  );

  const focusRow = markdown.match(/^\| Focus Ring \|.*$/m)?.[0];
  assert.ok(focusRow, "expected the authority Focus Ring row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${focusRow}\n`, "")),
    /missing required token role: Focus Ring/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace("rgb(23 23 23 / 32%)", "rgb(23 23 / 32%)")),
    /malformed Light value for Focus Ring/i
  );
});

test("fails closed for missing, duplicate, malformed, unknown, and mismatched semantic state rows", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const row = markdown.match(/^\| Success \| `--hh-success` \|.*$/m)?.[0];

  assert.ok(row, "expected the authority Success semantic state row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${row}\n`, "")),
    /missing required semantic state role: Success/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, `${row}\n${row}`)),
    /duplicate semantic state role: Success/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`8%`", "`10%`"))),
    /malformed semantic soft fill alpha for Success/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          `${row}\n| Decorative | \`--hh-decorative\` | \`--hh-decorative-soft-fill\` | \`--hh-decorative-border\` | \`8%\` | \`22%\` | Not approved. |`
        )
      ),
    /unknown semantic state role: Decorative/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(row, row.replace("--hh-success-soft-fill", "--hh-success-muted"))
      ),
    /semantic state token mismatch for Success/i
  );
});

test("fails closed for missing, duplicate, malformed, unknown, and mismatched geometry rows", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const row = markdown.match(/^\| Standard control height \|.*$/m)?.[0];

  assert.ok(row, "expected the authority Standard control height row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${row}\n`, "")),
    /missing required invariant geometry role: Standard control height/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, `${row}\n${row}`)),
    /duplicate invariant geometry role: Standard control height/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("36px", "2.25rem"))),
    /malformed invariant geometry value for Standard control height/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          `${row}\n| Decorative inset | \`--hh-decorative-inset\` | \`18px\` | Not approved. |`
        )
      ),
    /unknown invariant geometry role: Decorative inset/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          row.replace("--hh-control-height-standard", "--hh-control-height-default")
        )
      ),
    /token mismatch for Standard control height/i
  );
});

test("fails closed for missing, duplicate, malformed, unknown, and mismatched typography roles", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const row = markdown.match(/^\| Table Cell \|.*$/m)?.[0];

  assert.ok(row, "expected the authority Table Cell row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${row}\n`, "")),
    /missing required typography role: Table Cell/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, `${row}\n${row}`)),
    /duplicate typography role: Table Cell/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(row, row.replace("13px / 18px", "0.8125rem / 18px"))
      ),
    /malformed mobile typography value for Table Cell/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`400`", "`450`"))),
    /malformed typography weight for Table Cell/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`0`", "`0.02em`"))),
    /malformed typography letter spacing for Table Cell/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          `${row}\n| Display Hero | \`--hh-type-display-hero\` | \`48px / 52px\` | \`48px / 52px\` | \`700\` | \`0\` | none | Not approved. |`
        )
      ),
    /unknown typography role: Display Hero/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(row, row.replace("--hh-type-table-cell", "--hh-type-dense-cell"))
      ),
    /typography token mismatch for Table Cell/i
  );
});

test("fails closed for missing, duplicate, malformed, unknown, and mismatched typography contracts", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const row = markdown.match(/^\| FIN features \|.*$/m)?.[0];

  assert.ok(row, "expected the authority FIN features row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${row}\n`, "")),
    /missing required typography contract: FIN features/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, `${row}\n${row}`)),
    /duplicate typography contract: FIN features/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace('"zero" 0', '"zero" 1'))),
    /malformed typography contract value for FIN features/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          `${row}\n| Display font family | \`--hh-font-family-display\` | \`serif\` | Not approved. |`
        )
      ),
    /unknown typography contract: Display font family/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(row, row.replace("--hh-fin-features", "--hh-fin-settings"))
      ),
    /typography contract token mismatch for FIN features/i
  );
});

test("generated artifacts exactly equal the authoritative model", async () => {
  const {
    defaultDesignSystemSourcePath,
    parseDesignSystemTokens,
    renderGeneratedCss,
    renderGeneratedJson,
  } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const contract = parseDesignSystemTokens(markdown);

  assert.equal(source("src/styles/design-tokens.generated.css"), renderGeneratedCss(contract));
  assert.equal(source("src/styles/design-tokens.generated.json"), renderGeneratedJson(contract));

  const css = renderGeneratedCss(contract);
  for (const { cssVariable } of contract.dimensions) {
    assert.equal(
      css.match(new RegExp(`${cssVariable}:`, "g"))?.length,
      1,
      `${cssVariable} must be emitted exactly once`
    );
  }
  for (const { cssVariablePrefix } of contract.typography) {
    for (const suffix of ["font-size", "line-height", "font-weight", "letter-spacing"]) {
      assert.ok(css.includes(`${cssVariablePrefix}-${suffix}:`));
    }
  }
  for (const { cssVariable } of contract.typographyContracts) {
    assert.equal(
      css.match(new RegExp(`${cssVariable}:`, "g"))?.length,
      1,
      `${cssVariable} must be emitted exactly once`
    );
  }
  assert.match(
    css,
    /@media \(min-width: 768px\) \{[\s\S]*--hh-type-page-title-font-size: 24px;[\s\S]*--hh-type-page-title-line-height: 30px;/
  );
  assert.doesNotMatch(
    css.slice(css.indexOf("html.dark")),
    /--hh-(?:space|radius|touch|control|row|panel|task-padding|page-gutter|gap)-/
  );
  assert.doesNotMatch(
    css.slice(css.indexOf("html.dark"), css.indexOf("@media")),
    /--hh-(?:type|font-family|fin)-/
  );
});

test("globals and Tailwind consume canonical tokens after compatibility aliases are removed", async () => {
  const { validateRepositoryWiring } = await loadContract();

  assert.doesNotThrow(() =>
    validateRepositoryWiring({
      globalsCss: source("src/app/globals.css"),
      tailwindConfig: source("tailwind.config.ts"),
    })
  );
});
