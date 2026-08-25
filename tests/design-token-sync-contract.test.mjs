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

  assert.equal(contract.schemaVersion, 7);
  assert.equal(contract.tokens.length, 48);
  assert.equal(contract.dimensions.length, 44);
  assert.equal(contract.typography.length, 15);
  assert.equal(contract.typographyContracts.length, 7);
  assert.deepEqual(contract.tokens[0], {
    role: "L0 Canvas",
    name: "l0-canvas",
    cssVariable: "--hh-l0-canvas",
    light: "#F7F7F6",
    operationalLight: "#F8F9FB",
    dark: "#0B0D12",
  });
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "action-primary-foreground"),
    {
      role: "Action primary",
      name: "action-primary-foreground",
      cssVariable: "--hh-action-primary-foreground",
      light: "#FFFFFF",
      operationalLight: "#0B0D12",
      dark: "#0B0D12",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "focus-ring"),
    {
      role: "Focus / ring",
      name: "focus-ring",
      cssVariable: "--hh-focus-ring",
      light: "#C6A56A",
      operationalLight: "#C6A56A",
      dark: "#C6A56A",
    }
  );
  assert.deepEqual(
    contract.tokens.filter(({ name }) => name.startsWith("success-")),
    [
      {
        role: "Success soft fill",
        name: "success-soft-fill",
        cssVariable: "--hh-success-soft-fill",
        light: "rgb(22 129 91 / 10%)",
        operationalLight: "rgb(79 175 124 / 10%)",
        dark: "rgb(79 175 124 / 10%)",
      },
      {
        role: "Success semantic border",
        name: "success-border",
        cssVariable: "--hh-success-border",
        light: "rgb(22 129 91 / 20%)",
        operationalLight: "rgb(79 175 124 / 20%)",
        dark: "rgb(79 175 124 / 20%)",
      },
    ]
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-floating").light,
    "rgb(22 22 22 / 12%)"
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-strong").dark,
    "rgb(229 231 235 / 12%)"
  );
  assert.deepEqual(
    contract.tokens.filter(({ name }) => name.startsWith("l3-")),
    [
      {
        role: "L3 Interactive Surface",
        name: "l3-hover",
        cssVariable: "--hh-l3-hover",
        light: "#F4F4F2",
        operationalLight: "#E8ECF2",
        dark: "#1C2029",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-selected",
        cssVariable: "--hh-l3-selected",
        light: "#ECECEA",
        operationalLight: "rgb(198 165 106 / 10%)",
        dark: "rgb(198 165 106 / 10%)",
      },
      {
        role: "L3 Interactive Surface",
        name: "l3-pressed",
        cssVariable: "--hh-l3-pressed",
        light: "#E7E7E4",
        operationalLight: "rgb(198 165 106 / 20%)",
        dark: "rgb(198 165 106 / 20%)",
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
      operationalLight: "#FFFFFF",
      dark: "#171B24",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "l5-task-surface"),
    {
      role: "L5 Task Surface",
      name: "l5-task-surface",
      cssVariable: "--hh-l5-task-surface",
      light: "#FFFFFF",
      operationalLight: "#FFFFFF",
      dark: "#171B24",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-operational"),
    {
      role: "Operational Shadow",
      name: "shadow-operational",
      cssVariable: "--hh-shadow-operational",
      light: "0 1px 2px rgb(0 0 0 / 0.04)",
      operationalLight: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      dark: "0 1px 2px rgb(0 0 0 / 0.2)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-floating"),
    {
      role: "Floating Shadow",
      name: "shadow-floating",
      cssVariable: "--hh-shadow-floating",
      light: "0 2px 8px -3px rgb(0 0 0 / 0.10), 0 22px 48px -18px rgb(0 0 0 / 0.22)",
      operationalLight: "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
      dark: "0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -1px rgb(0 0 0 / 0.2)",
    }
  );
  assert.deepEqual(
    contract.tokens.find(({ name }) => name === "shadow-task"),
    {
      role: "Task Shadow",
      name: "shadow-task",
      cssVariable: "--hh-shadow-task",
      light: "0 4px 12px -5px rgb(0 0 0 / 0.12), 0 34px 72px -26px rgb(0 0 0 / 0.28)",
      operationalLight: "0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -2px rgb(0 0 0 / 0.05)",
      dark: "0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -2px rgb(0 0 0 / 0.3)",
    }
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "shadow-overlay").dark,
    "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 10px 10px -5px rgb(0 0 0 / 0.3)"
  );
  assert.equal(
    contract.tokens.find(({ name }) => name === "shadow-sidebar").dark,
    "0 8px 16px rgb(0 0 0 / 0.4)"
  );
  assert.deepEqual(
    Object.fromEntries(
      contract.tokens
        .filter(({ name }) => ["gold", "gold-hover", "gold-muted", "gold-border"].includes(name))
        .map(({ name, dark }) => [name, dark])
    ),
    {
      gold: "#C6A56A",
      "gold-hover": "#D4B67F",
      "gold-muted": "rgb(198 165 106 / 10%)",
      "gold-border": "rgb(198 165 106 / 20%)",
    }
  );
  assert.equal(contract.tokens.find(({ name }) => name === "emerald").dark, "#4FAF7C");
  assert.equal(contract.tokens.find(({ name }) => name === "text-dim").dark, "#4B5563");
  assert.equal(
    contract.tokens.find(({ name }) => name === "border-subtle").dark,
    "rgb(229 231 235 / 4%)"
  );
  assert.equal(contract.tokens.find(({ name }) => name === "input").dark, "rgb(229 231 235 / 8%)");
  assert.equal(contract.tokens.find(({ name }) => name === "input-background").dark, "transparent");
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
    role: "Table cell block padding",
    name: "table-cell-padding-block",
    cssVariable: "--hh-table-cell-padding-block",
    value: "10px",
  });
  assert.deepEqual(
    Object.fromEntries(
      contract.dimensions
        .filter(({ name }) =>
          [
            "space-12",
            "space-16",
            "radius-panel",
            "sidebar-width-expanded",
            "sidebar-width-collapsed",
            "sidebar-inset",
            "content-start-desktop",
            "topbar-height-mobile",
            "topbar-height-desktop",
            "content-width-max",
            "content-width-narrow",
            "content-width-document",
          ].includes(name)
        )
        .map(({ name, value }) => [name, value])
    ),
    {
      "space-12": "48px",
      "space-16": "64px",
      "radius-panel": "10px",
      "sidebar-width-expanded": "220px",
      "sidebar-width-collapsed": "72px",
      "sidebar-inset": "12px",
      "content-start-desktop": "232px",
      "topbar-height-mobile": "48px",
      "topbar-height-desktop": "52px",
      "content-width-max": "1600px",
      "content-width-narrow": "1120px",
      "content-width-document": "960px",
    }
  );
  assert.deepEqual(contract.typography[0], {
    role: "Page Title",
    name: "page-title",
    cssVariablePrefix: "--hh-type-page-title",
    mobile: { fontSize: "22px", lineHeight: "26.4px" },
    desktop: { fontSize: "22px", lineHeight: "26.4px" },
    fontWeight: "600",
    letterSpacing: "-0.02em",
    numericContract: "none",
  });
  assert.deepEqual(
    contract.typography.find(({ name }) => name === "financial-total"),
    {
      role: "Financial Total",
      name: "financial-total",
      cssVariablePrefix: "--hh-type-financial-total",
      mobile: { fontSize: "24px", lineHeight: "36px" },
      desktop: { fontSize: "24px", lineHeight: "36px" },
      fontWeight: "600",
      letterSpacing: "-0.02em",
      numericContract: "FIN",
    }
  );
  assert.deepEqual(contract.typographyContracts, [
    {
      contract: "Operational font family",
      name: "font-family-sans",
      cssVariable: "--hh-font-family-sans",
      value:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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

  const focusRow = markdown.match(/^\| Focus \/ ring \|.*$/m)?.[0];
  assert.ok(focusRow, "expected the authority Focus / ring row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${focusRow}\n`, "")),
    /missing required token role: Focus \/ ring/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(focusRow, focusRow.replace("#C6A56A", "#BAD"))),
    /malformed Light value for Focus \/ ring/i
  );
});

test("fails closed for missing, duplicate, and malformed Operational Light rows", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const operationalSection = markdown.slice(markdown.indexOf("### Operational light mappings"));
  const row = operationalSection.match(/^\| L0 Canvas \|.*$/m)?.[0];

  assert.ok(row, "expected the authority Operational Light L0 row fixture");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${row}\n`, "")),
    /missing required Operational Light token role: L0 Canvas/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, `${row}\n${row}`)),
    /duplicate Operational Light token role: L0 Canvas/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("#F8F9FB", "#BAD"))),
    /malformed Operational Light value for L0 Canvas/i
  );
});

test("fails closed for malformed or missing HH Neo Version 18 accent and depth roles", async () => {
  const { defaultDesignSystemSourcePath, parseDesignSystemTokens } = await loadContract();
  const markdown = readFileSync(defaultDesignSystemSourcePath(), "utf8");
  const goldRow = markdown.match(/^\| Gold accent \|.*$/m)?.[0];
  const overlayRow = markdown.match(/^\| Overlay Shadow \|.*$/m)?.[0];
  const inputRow = markdown.match(/^\| Input surface \/ background \|.*$/m)?.[0];

  assert.ok(goldRow && overlayRow && inputRow, "expected active Version 18 token fixtures");
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(goldRow, goldRow.replace("#D4B67F", "#BAD"))),
    /malformed Light value for Gold accent/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(`${overlayRow}\n`, "")),
    /missing required token role: Overlay Shadow/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(markdown.replace(inputRow, inputRow.replace("transparent", "none"))),
    /malformed Dark value for Input surface \/ background/i
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
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`10%`", "`12%`"))),
    /malformed semantic soft fill alpha for Success/i
  );
  assert.throws(
    () =>
      parseDesignSystemTokens(
        markdown.replace(
          row,
          `${row}\n| Decorative | \`--hh-decorative\` | \`--hh-decorative-soft-fill\` | \`--hh-decorative-border\` | \`10%\` | \`20%\` | Not approved. |`
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
        markdown.replace(row, row.replace("13px / 19.5px", "0.8125rem / 19.5px"))
      ),
    /malformed mobile typography value for Table Cell/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`400`", "`450`"))),
    /malformed typography weight for Table Cell/i
  );
  assert.throws(
    () => parseDesignSystemTokens(markdown.replace(row, row.replace("`0`", "`decorative`"))),
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
  assert.match(css, /--hh-type-page-title-font-size: 22px;/);
  assert.match(css, /--hh-type-page-title-line-height: 26\.4px;/);
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
