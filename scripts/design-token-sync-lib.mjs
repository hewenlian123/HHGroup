import { homedir } from "node:os";
import { resolve } from "node:path";

export const AUTHORITY_NAME = "HH Group Design System v1";
export const AUTHORITY_SOURCE_LABEL = "HH Group/Governance/HH Group Design System v1.md";

const ROLE_DEFINITIONS = [
  { role: "L0 Canvas", names: ["l0-canvas"], parser: parseSingleColor },
  { role: "L1 Workspace", names: ["l1-workspace"], parser: parseSingleColor },
  {
    role: "L2 Operational Surface",
    names: ["l2-operational-surface"],
    parser: parseSingleColor,
  },
  {
    role: "L3 Interactive Surface",
    names: ["l3-hover", "l3-selected", "l3-pressed"],
    parser: parseInteractiveSurface,
  },
  {
    role: "L4 Floating Surface",
    names: ["l4-floating-surface"],
    parser: parseSingleColor,
  },
  {
    role: "L5 Task Surface",
    names: ["l5-task-surface"],
    parser: parseSingleColor,
  },
  {
    role: "Operational Shadow",
    names: ["shadow-operational"],
    parser: parseShadow,
    validator: validateCssShadow,
  },
  {
    role: "Floating Shadow",
    names: ["shadow-floating"],
    parser: parseShadow,
    validator: validateCssShadow,
  },
  {
    role: "Task Shadow",
    names: ["shadow-task"],
    parser: parseShadow,
    validator: validateCssShadow,
  },
  {
    role: "Overlay Shadow",
    names: ["shadow-overlay"],
    parser: parseShadow,
    validator: validateCssShadow,
  },
  {
    role: "Sidebar Shadow",
    names: ["shadow-sidebar"],
    parser: parseShadow,
    validator: validateCssShadow,
  },
  {
    role: "Titanium text strong / primary / secondary / tertiary / dim",
    names: ["text-strong", "text-primary", "text-secondary", "text-tertiary", "text-dim"],
    parser: (value) => parseSlashColorSequence(value, 5),
  },
  {
    role: "Border subtle / border / floating border / strong border",
    names: ["border-subtle", "border", "border-floating", "border-strong"],
    parser: parseBorderSequence,
  },
  {
    role: "Gold accent",
    names: ["gold", "gold-hover", "gold-muted", "gold-border"],
    parser: parseAccentSequence,
  },
  {
    role: "Emerald accent",
    names: ["emerald", "emerald-hover", "emerald-muted", "emerald-border"],
    parser: parseAccentSequence,
  },
  {
    role: "Input surface / background",
    names: ["input", "input-background"],
    parser: parseInputSequence,
  },
  {
    role: "Action primary",
    names: ["action-primary", "action-primary-foreground"],
    parser: parsePrimaryAction,
  },
  {
    role: "Focus / ring",
    names: ["focus-ring", "ring"],
    parser: (value) => parseSlashColorSequence(value, 2),
  },
  { role: "Success", names: ["success"], parser: parseSingleColor },
  { role: "Warning", names: ["warning"], parser: parseSingleColor },
  { role: "Information", names: ["information"], parser: parseSingleColor },
  { role: "Danger", names: ["danger"], parser: parseSingleColor },
];

const SEMANTIC_STATE_DEFINITIONS = [
  { role: "Success", name: "success" },
  { role: "Warning", name: "warning" },
  { role: "Information", name: "information" },
  { role: "Danger", name: "danger" },
].map((definition) => ({
  ...definition,
  foregroundToken: `--hh-${definition.name}`,
  softFillToken: `--hh-${definition.name}-soft-fill`,
  borderToken: `--hh-${definition.name}-border`,
  softFillAlpha: "10%",
  borderAlpha: "20%",
}));

const INVARIANT_GEOMETRY_DEFINITIONS = [
  { role: "Space 1", name: "space-1" },
  { role: "Space 2", name: "space-2" },
  { role: "Space 3", name: "space-3" },
  { role: "Space 4", name: "space-4" },
  { role: "Space 5", name: "space-5" },
  { role: "Space 6", name: "space-6" },
  { role: "Space 8", name: "space-8" },
  { role: "Space 10", name: "space-10" },
  { role: "Space 12", name: "space-12" },
  { role: "Space 16", name: "space-16" },
  { role: "Compact radius", name: "radius-compact" },
  { role: "Standard radius", name: "radius-standard" },
  { role: "Panel radius", name: "radius-panel" },
  { role: "Task radius", name: "radius-task" },
  { role: "Minimum touch target", name: "touch-min" },
  { role: "Compact control height", name: "control-height-compact" },
  { role: "Standard control height", name: "control-height-standard" },
  { role: "Comfortable control height", name: "control-height-comfortable" },
  { role: "Touch control height", name: "control-height-touch" },
  { role: "Dense row height", name: "row-height-dense" },
  { role: "Standard row height", name: "row-height-standard" },
  { role: "Interactive touch row minimum", name: "row-min-height-touch" },
  { role: "Compact panel padding", name: "panel-padding-compact" },
  { role: "Standard panel padding", name: "panel-padding-standard" },
  { role: "Mobile task-surface padding", name: "task-padding-mobile" },
  { role: "Desktop task-surface padding", name: "task-padding-desktop" },
  { role: "Mobile page gutter", name: "page-gutter-mobile" },
  { role: "Tablet page gutter", name: "page-gutter-tablet" },
  { role: "Desktop page gutter", name: "page-gutter-desktop" },
  { role: "Wide-workspace page gutter", name: "page-gutter-wide" },
  { role: "Related-element gap", name: "gap-related" },
  { role: "Standard section gap", name: "gap-section" },
  { role: "Major-region gap", name: "gap-region" },
  { role: "Sidebar expanded width", name: "sidebar-width-expanded" },
  { role: "Sidebar collapsed width", name: "sidebar-width-collapsed" },
  { role: "Sidebar inset", name: "sidebar-inset" },
  { role: "Desktop content start", name: "content-start-desktop" },
  { role: "Mobile TopBar height", name: "topbar-height-mobile" },
  { role: "Desktop TopBar height", name: "topbar-height-desktop" },
  { role: "Maximum content width", name: "content-width-max" },
  { role: "Narrow content width", name: "content-width-narrow" },
  { role: "Document content width", name: "content-width-document" },
  { role: "Table cell inline padding", name: "table-cell-padding-inline" },
  { role: "Table cell block padding", name: "table-cell-padding-block" },
];

const TYPOGRAPHY_ROLE_DEFINITIONS = [
  { role: "Page Title", name: "page-title", numericLabel: "none", numericContract: "none" },
  {
    role: "Section Title",
    name: "section-title",
    numericLabel: "none",
    numericContract: "none",
  },
  {
    role: "Panel Title",
    name: "panel-title",
    numericLabel: "none",
    numericContract: "none",
  },
  { role: "Body", name: "body", numericLabel: "none", numericContract: "none" },
  {
    role: "Body Strong",
    name: "body-strong",
    numericLabel: "none",
    numericContract: "none",
  },
  { role: "Label", name: "label", numericLabel: "none", numericContract: "none" },
  {
    role: "Metadata",
    name: "metadata",
    numericLabel: "FIN when used for dates or IDs",
    numericContract: "contextual FIN",
  },
  {
    role: "Table Header",
    name: "table-header",
    numericLabel: "FIN for numeric columns",
    numericContract: "contextual FIN",
  },
  {
    role: "Table Cell",
    name: "table-cell",
    numericLabel: "FIN for dates, IDs, and numeric columns",
    numericContract: "contextual FIN",
  },
  {
    role: "Numeric / Financial",
    name: "financial",
    numericLabel: "FIN",
    numericContract: "FIN",
  },
  {
    role: "Financial Total",
    name: "financial-total",
    numericLabel: "FIN",
    numericContract: "FIN",
  },
  {
    role: "Button / Control",
    name: "control",
    numericLabel: "none",
    numericContract: "none",
  },
  { role: "Helper", name: "helper", numericLabel: "none", numericContract: "none" },
  { role: "Error", name: "error", numericLabel: "none", numericContract: "none" },
  {
    role: "Status / Badge",
    name: "status",
    numericLabel: "none",
    numericContract: "none",
  },
];

const TYPOGRAPHY_CONTRACT_DEFINITIONS = [
  {
    contract: "Operational font family",
    name: "font-family-sans",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  { contract: "FIN variant", name: "fin-variant", value: "tabular-nums lining-nums" },
  {
    contract: "FIN features",
    name: "fin-features",
    value: '"tnum" 1, "lnum" 1, "zero" 0',
  },
  {
    contract: "Text-entry mobile size",
    name: "type-text-entry-size-mobile",
    value: "16px",
  },
  {
    contract: "Text-entry mobile line height",
    name: "type-text-entry-line-height-mobile",
    value: "24px",
  },
  {
    contract: "Text-entry desktop size",
    name: "type-text-entry-size-desktop",
    value: "14px",
  },
  {
    contract: "Text-entry desktop line height",
    name: "type-text-entry-line-height-desktop",
    value: "20px",
  },
];

const ROLE_LOOKUP = new Map(
  ROLE_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
);
const SEMANTIC_STATE_LOOKUP = new Map(
  SEMANTIC_STATE_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
);
const INVARIANT_GEOMETRY_LOOKUP = new Map(
  INVARIANT_GEOMETRY_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
);
const TYPOGRAPHY_ROLE_LOOKUP = new Map(
  TYPOGRAPHY_ROLE_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
);
const TYPOGRAPHY_CONTRACT_LOOKUP = new Map(
  TYPOGRAPHY_CONTRACT_DEFINITIONS.map((definition) => [
    normalizeRole(definition.contract),
    definition,
  ])
);

export function defaultDesignSystemSourcePath() {
  if (process.env.HH_DESIGN_SYSTEM_SOURCE) {
    return resolve(process.env.HH_DESIGN_SYSTEM_SOURCE);
  }

  return resolve(
    homedir(),
    "Documents",
    "HH OS",
    "HH Group",
    "Governance",
    "HH Group Design System v1.md"
  );
}

export function parseDesignSystemTokens(markdown) {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error("Design System authority is empty or unreadable.");
  }

  const rows = extractMappingRows(markdown);
  const operationalLightRows = extractOperationalLightRows(markdown);
  const requiredRows = new Map();
  const requiredOperationalLightRows = new Map();

  for (const row of rows) {
    const definition = ROLE_LOOKUP.get(normalizeRole(row.role));
    if (!definition) continue;

    if (requiredRows.has(definition.role)) {
      throw new Error(`Duplicate token role: ${definition.role}.`);
    }
    requiredRows.set(definition.role, row);
  }

  for (const row of operationalLightRows) {
    const definition = ROLE_LOOKUP.get(normalizeRole(row.role));
    if (!definition) continue;

    if (requiredOperationalLightRows.has(definition.role)) {
      throw new Error(`Duplicate Operational Light token role: ${definition.role}.`);
    }
    requiredOperationalLightRows.set(definition.role, row);
  }

  const tokens = [];
  for (const definition of ROLE_DEFINITIONS) {
    const row = requiredRows.get(definition.role);
    const operationalLightRow = requiredOperationalLightRows.get(definition.role);
    if (!row) {
      throw new Error(`Missing required token role: ${definition.role}.`);
    }
    if (!operationalLightRow) {
      throw new Error(`Missing required Operational Light token role: ${definition.role}.`);
    }
    if (!row.light.trim() || !row.dark.trim()) {
      throw new Error(`Incomplete Light/Dark pair for ${definition.role}.`);
    }

    const lightValues = parseRoleCell(definition, row.light, "Light");
    const darkValues = parseRoleCell(definition, row.dark, "Dark");
    const operationalLightValues = parseRoleCell(
      definition,
      operationalLightRow.operationalLight,
      "Operational Light"
    );
    if (
      lightValues.length !== definition.names.length ||
      darkValues.length !== definition.names.length ||
      operationalLightValues.length !== definition.names.length
    ) {
      throw new Error(
        `Incomplete protected Light, Operational Light, or Dark set for ${definition.role}.`
      );
    }

    for (let index = 0; index < definition.names.length; index += 1) {
      const name = definition.names[index];
      const light = lightValues[index];
      const dark = darkValues[index];
      const operationalLight = operationalLightValues[index];
      const validate = definition.validator ?? validateCssColor;
      validate(light, definition.role, "Light");
      validate(dark, definition.role, "Dark");
      validate(operationalLight, definition.role, "Operational Light");
      tokens.push({
        role: definition.role,
        name,
        cssVariable: `--hh-${name}`,
        light,
        dark,
        operationalLight,
      });
    }
  }

  const semanticStateRows = extractSemanticStateRows(markdown);
  const requiredSemanticStateRows = new Map();
  for (const row of semanticStateRows) {
    const definition = SEMANTIC_STATE_LOOKUP.get(normalizeRole(row.role));
    if (!definition) {
      throw new Error(`Unknown semantic state role: ${row.role}.`);
    }
    if (requiredSemanticStateRows.has(definition.role)) {
      throw new Error(`Duplicate semantic state role: ${definition.role}.`);
    }
    requiredSemanticStateRows.set(definition.role, row);
  }

  const semanticStateTokens = SEMANTIC_STATE_DEFINITIONS.flatMap((definition) => {
    const row = requiredSemanticStateRows.get(definition.role);
    if (!row) {
      throw new Error(`Missing required semantic state role: ${definition.role}.`);
    }

    const actualTokens = [row.foregroundToken, row.softFillToken, row.borderToken].map(
      stripCodeTicks
    );
    const expectedTokens = [
      definition.foregroundToken,
      definition.softFillToken,
      definition.borderToken,
    ];
    if (actualTokens.some((token, index) => token !== expectedTokens[index])) {
      throw new Error(`Semantic state token mismatch for ${definition.role}.`);
    }

    const softFillAlpha = stripCodeTicks(row.softFillAlpha);
    const borderAlpha = stripCodeTicks(row.borderAlpha);
    if (softFillAlpha !== definition.softFillAlpha) {
      throw new Error(`Malformed semantic soft fill alpha for ${definition.role}.`);
    }
    if (borderAlpha !== definition.borderAlpha) {
      throw new Error(`Malformed semantic border alpha for ${definition.role}.`);
    }

    const foreground = tokens.find(({ cssVariable }) => cssVariable === definition.foregroundToken);
    if (!foreground) {
      throw new Error(`Missing semantic foreground token for ${definition.role}.`);
    }

    return [
      {
        role: `${definition.role} soft fill`,
        name: `${definition.name}-soft-fill`,
        cssVariable: definition.softFillToken,
        light: colorWithAlpha(foreground.light, definition.softFillAlpha),
        dark: colorWithAlpha(foreground.dark, definition.softFillAlpha),
        operationalLight: colorWithAlpha(foreground.operationalLight, definition.softFillAlpha),
      },
      {
        role: `${definition.role} semantic border`,
        name: `${definition.name}-border`,
        cssVariable: definition.borderToken,
        light: colorWithAlpha(foreground.light, definition.borderAlpha),
        dark: colorWithAlpha(foreground.dark, definition.borderAlpha),
        operationalLight: colorWithAlpha(foreground.operationalLight, definition.borderAlpha),
      },
    ];
  });

  tokens.push(...semanticStateTokens);

  const duplicateNames = tokens
    .map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    throw new Error(`Duplicate token name: ${duplicateNames[0]}.`);
  }

  const geometryRows = extractInvariantGeometryRows(markdown);
  const requiredGeometryRows = new Map();
  for (const row of geometryRows) {
    const definition = INVARIANT_GEOMETRY_LOOKUP.get(normalizeRole(row.role));
    if (!definition) {
      throw new Error(`Unknown invariant geometry role: ${row.role}.`);
    }
    if (requiredGeometryRows.has(definition.role)) {
      throw new Error(`Duplicate invariant geometry role: ${definition.role}.`);
    }
    requiredGeometryRows.set(definition.role, row);
  }

  const dimensions = INVARIANT_GEOMETRY_DEFINITIONS.map((definition) => {
    const row = requiredGeometryRows.get(definition.role);
    if (!row) {
      throw new Error(`Missing required invariant geometry role: ${definition.role}.`);
    }

    const expectedToken = `--hh-${definition.name}`;
    const token = stripCodeTicks(row.token);
    if (token !== expectedToken) {
      throw new Error(
        `Invariant geometry token mismatch for ${definition.role}: expected ${expectedToken}, received ${token}.`
      );
    }

    const value = parseInvariantDimension(row.value, definition.role);
    return {
      role: definition.role,
      name: definition.name,
      cssVariable: expectedToken,
      value,
    };
  });

  const duplicateDimensionNames = dimensions
    .map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateDimensionNames.length > 0) {
    throw new Error(`Duplicate invariant geometry token name: ${duplicateDimensionNames[0]}.`);
  }

  const typographyRows = extractTypographyRows(markdown);
  const requiredTypographyRows = new Map();
  for (const row of typographyRows) {
    const definition = TYPOGRAPHY_ROLE_LOOKUP.get(normalizeRole(row.role));
    if (!definition) {
      throw new Error(`Unknown typography role: ${row.role}.`);
    }
    if (requiredTypographyRows.has(definition.role)) {
      throw new Error(`Duplicate typography role: ${definition.role}.`);
    }
    requiredTypographyRows.set(definition.role, row);
  }

  const typography = TYPOGRAPHY_ROLE_DEFINITIONS.map((definition) => {
    const row = requiredTypographyRows.get(definition.role);
    if (!row) {
      throw new Error(`Missing required typography role: ${definition.role}.`);
    }

    const expectedToken = `--hh-type-${definition.name}`;
    const token = stripCodeTicks(row.token);
    if (token !== expectedToken) {
      throw new Error(
        `Typography token mismatch for ${definition.role}: expected ${expectedToken}, received ${token}.`
      );
    }

    const mobile = parseTypographyScale(row.mobile, definition.role, "mobile");
    const desktop = parseTypographyScale(row.desktop, definition.role, "desktop");
    const fontWeight = parseTypographyWeight(row.weight, definition.role);
    const letterSpacing = parseTypographyLetterSpacing(row.letterSpacing, definition.role);
    const numericLabel = stripCodeTicks(row.numericContract);
    if (numericLabel !== definition.numericLabel) {
      throw new Error(
        `Malformed typography numeric contract for ${definition.role}: expected "${definition.numericLabel}", received "${numericLabel}".`
      );
    }

    return {
      role: definition.role,
      name: definition.name,
      cssVariablePrefix: expectedToken,
      mobile,
      desktop,
      fontWeight,
      letterSpacing,
      numericContract: definition.numericContract,
    };
  });

  const typographyContractRows = extractTypographyContractRows(markdown);
  const requiredTypographyContractRows = new Map();
  for (const row of typographyContractRows) {
    const definition = TYPOGRAPHY_CONTRACT_LOOKUP.get(normalizeRole(row.contract));
    if (!definition) {
      throw new Error(`Unknown typography contract: ${row.contract}.`);
    }
    if (requiredTypographyContractRows.has(definition.contract)) {
      throw new Error(`Duplicate typography contract: ${definition.contract}.`);
    }
    requiredTypographyContractRows.set(definition.contract, row);
  }

  const typographyContracts = TYPOGRAPHY_CONTRACT_DEFINITIONS.map((definition) => {
    const row = requiredTypographyContractRows.get(definition.contract);
    if (!row) {
      throw new Error(`Missing required typography contract: ${definition.contract}.`);
    }

    const expectedToken = `--hh-${definition.name}`;
    const token = stripCodeTicks(row.token);
    if (token !== expectedToken) {
      throw new Error(
        `Typography contract token mismatch for ${definition.contract}: expected ${expectedToken}, received ${token}.`
      );
    }

    const value = stripCodeTicks(row.value);
    if (value !== definition.value) {
      throw new Error(
        `Malformed typography contract value for ${definition.contract}: expected "${definition.value}", received "${value}".`
      );
    }

    return {
      contract: definition.contract,
      name: definition.name,
      cssVariable: expectedToken,
      value,
    };
  });

  return {
    schemaVersion: 7,
    authority: AUTHORITY_NAME,
    source: AUTHORITY_SOURCE_LABEL,
    tokens,
    dimensions,
    typography,
    typographyContracts,
  };
}

export function renderGeneratedJson(contract) {
  const artifact = {
    generatedNotice: "AUTO-GENERATED by npm run design:sync. DO NOT EDIT BY HAND.",
    schemaVersion: contract.schemaVersion,
    authority: contract.authority,
    source: contract.source,
    tokens: Object.fromEntries(
      contract.tokens.map(({ cssVariable, light, operationalLight, dark }) => [
        cssVariable,
        { light, operationalLight, dark },
      ])
    ),
    dimensions: Object.fromEntries(
      contract.dimensions.map(({ cssVariable, value }) => [cssVariable, value])
    ),
    typography: {
      roles: Object.fromEntries(
        contract.typography.map(
          ({ cssVariablePrefix, mobile, desktop, fontWeight, letterSpacing, numericContract }) => [
            cssVariablePrefix,
            { mobile, desktop, fontWeight, letterSpacing, numericContract },
          ]
        )
      ),
      contracts: Object.fromEntries(
        contract.typographyContracts.map(({ cssVariable, value }) => [cssVariable, value])
      ),
    },
  };

  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function renderGeneratedCss(contract) {
  const light = contract.tokens
    .map(({ cssVariable, light: value }) => `  ${cssVariable}: ${formatCssValue(value)};`)
    .join("\n");
  const dark = contract.tokens
    .map(({ cssVariable, dark: value }) => `  ${cssVariable}: ${formatCssValue(value)};`)
    .join("\n");
  const operationalLight = contract.tokens
    .map(
      ({ cssVariable, operationalLight: value }) => `  ${cssVariable}: ${formatCssValue(value)};`
    )
    .join("\n");
  const dimensions = contract.dimensions
    .map(({ cssVariable, value }) => `  ${cssVariable}: ${formatCssValue(value)};`)
    .join("\n");
  const typography = contract.typography
    .flatMap(({ cssVariablePrefix, mobile, fontWeight, letterSpacing }) => [
      `  ${cssVariablePrefix}-font-size: ${mobile.fontSize};`,
      `  ${cssVariablePrefix}-line-height: ${mobile.lineHeight};`,
      `  ${cssVariablePrefix}-font-weight: ${fontWeight};`,
      `  ${cssVariablePrefix}-letter-spacing: ${letterSpacing};`,
    ])
    .join("\n");
  const typographyContracts = contract.typographyContracts
    .map(({ cssVariable, value }) => `  ${cssVariable}: ${value};`)
    .join("\n");
  const desktopTypography = contract.typography
    .filter(
      ({ mobile, desktop }) =>
        mobile.fontSize !== desktop.fontSize || mobile.lineHeight !== desktop.lineHeight
    )
    .flatMap(({ cssVariablePrefix, desktop }) => [
      `    ${cssVariablePrefix}-font-size: ${desktop.fontSize};`,
      `    ${cssVariablePrefix}-line-height: ${desktop.lineHeight};`,
    ])
    .join("\n");

  return [
    "/* AUTO-GENERATED by npm run design:sync. DO NOT EDIT BY HAND. */",
    `/* Authority: ${contract.authority} (${contract.source}) */`,
    "",
    ":root,",
    '[data-hh-theme="auth"],',
    '[data-hh-theme="public"],',
    '[data-hh-theme="document-light"] {',
    light,
    dimensions,
    typography,
    typographyContracts,
    "}",
    "",
    '[data-hh-theme="operational-light"] {',
    operationalLight,
    "}",
    "",
    "html.dark,",
    '[data-hh-theme="operational-dark"],',
    '[data-hh-theme="neo-dark"] {',
    dark,
    "}",
    "",
    "@media (min-width: 768px) {",
    "  :root {",
    desktopTypography,
    "  }",
    "}",
    "",
  ].join("\n");
}

export function validateRepositoryWiring({ globalsCss, tailwindConfig }) {
  const requiredGlobalSnippets = [
    '@import "../styles/design-tokens.generated.css";',
    "--space-1: var(--hh-space-1);",
    "--space-2: var(--hh-space-2);",
    "--space-3: var(--hh-space-3);",
    "--space-4: var(--hh-space-4);",
    "--space-5: var(--hh-space-5);",
    "--space-6: var(--hh-space-6);",
    "--space-8: var(--hh-space-8);",
    "--space-10: var(--hh-space-10);",
    "font-family: var(--hh-font-family-sans);",
    "font-variant-numeric: var(--hh-fin-variant);",
    "font-feature-settings: var(--hh-fin-features);",
    "font-size: var(--hh-type-text-entry-size-mobile);",
    "font-size: var(--hh-type-text-entry-size-desktop);",
  ];
  const requiredTailwindVariables = [
    "--hh-l0-canvas",
    "--hh-l1-workspace",
    "--hh-l2-operational-surface",
    "--hh-l3-hover",
    "--hh-l3-selected",
    "--hh-l3-pressed",
    "--hh-l4-floating-surface",
    "--hh-l5-task-surface",
    "--hh-text-strong",
    "--hh-text-primary",
    "--hh-text-secondary",
    "--hh-text-tertiary",
    "--hh-border",
    "--hh-border-floating",
    "--hh-border-strong",
    "--hh-shadow-operational",
    "--hh-shadow-floating",
    "--hh-shadow-task",
    "--hh-action-primary",
    "--hh-action-primary-foreground",
    "--hh-focus-ring",
    "--hh-success",
    "--hh-success-soft-fill",
    "--hh-success-border",
    "--hh-warning",
    "--hh-warning-soft-fill",
    "--hh-warning-border",
    "--hh-information",
    "--hh-information-soft-fill",
    "--hh-information-border",
    "--hh-danger",
    "--hh-danger-soft-fill",
    "--hh-danger-border",
    ...INVARIANT_GEOMETRY_DEFINITIONS.map(({ name }) => `--hh-${name}`),
    "--hh-font-family-sans",
    ...TYPOGRAPHY_ROLE_DEFINITIONS.flatMap(({ name }) => [
      `--hh-type-${name}-font-size`,
      `--hh-type-${name}-line-height`,
      `--hh-type-${name}-font-weight`,
      `--hh-type-${name}-letter-spacing`,
    ]),
  ];

  for (const snippet of requiredGlobalSnippets) {
    if (!globalsCss.includes(snippet)) {
      throw new Error(`globals.css token wiring is missing: ${snippet}`);
    }
  }

  for (const variable of requiredTailwindVariables) {
    if (!tailwindConfig.includes(`var(${variable})`)) {
      throw new Error(`Tailwind token wiring is missing: ${variable}`);
    }
  }

  const generatedVariables = [
    ...ROLE_DEFINITIONS.flatMap(({ names }) =>
      names.map((name) => ({ cssVariable: `--hh-${name}` }))
    ),
    ...SEMANTIC_STATE_DEFINITIONS.flatMap(({ softFillToken, borderToken }) => [
      { cssVariable: softFillToken },
      { cssVariable: borderToken },
    ]),
    ...INVARIANT_GEOMETRY_DEFINITIONS.map(({ name }) => ({ cssVariable: `--hh-${name}` })),
    ...TYPOGRAPHY_ROLE_DEFINITIONS.flatMap(({ name }) =>
      ["font-size", "line-height", "font-weight", "letter-spacing"].map((property) => ({
        cssVariable: `--hh-type-${name}-${property}`,
      }))
    ),
    ...TYPOGRAPHY_CONTRACT_DEFINITIONS.map(({ name }) => ({ cssVariable: `--hh-${name}` })),
  ];
  for (const { cssVariable } of generatedVariables) {
    const declaration = new RegExp(`${escapeRegExp(cssVariable)}\\s*:`);
    if (declaration.test(globalsCss)) {
      throw new Error(`globals.css must not redeclare generated token: ${cssVariable}`);
    }
  }
}

function extractTypographyRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex(
    (line) => line.trim() === "### Semantic typography mappings"
  );
  if (headingIndex === -1) {
    throw new Error('Missing required "Semantic typography mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex &&
      /^\|\s*Role\s*\|\s*Token\s*\|\s*Mobile size \/ line height\s*\|\s*Desktop size \/ line height\s*\|\s*Weight\s*\|\s*Letter spacing\s*\|\s*Numeric contract\s*\|\s*Use\s*\|\s*$/.test(
        line
      )
  );
  if (headerIndex === -1) {
    throw new Error("Missing semantic typography token table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 8) {
      throw new Error(`Malformed typography row at line ${index + 1}.`);
    }
    rows.push({
      role: cells[0],
      token: cells[1],
      mobile: cells[2],
      desktop: cells[3],
      weight: cells[4],
      letterSpacing: cells[5],
      numericContract: cells[6],
    });
  }
  return rows;
}

function extractTypographyContractRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex(
    (line) => line.trim() === "### Typography contract mappings"
  );
  if (headingIndex === -1) {
    throw new Error('Missing required "Typography contract mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex &&
      /^\|\s*Contract\s*\|\s*Token\s*\|\s*Value\s*\|\s*Use\s*\|\s*$/.test(line)
  );
  if (headerIndex === -1) {
    throw new Error("Missing typography contract table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 4) {
      throw new Error(`Malformed typography contract row at line ${index + 1}.`);
    }
    rows.push({ contract: cells[0], token: cells[1], value: cells[2] });
  }
  return rows;
}

function extractInvariantGeometryRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "### Invariant geometry mappings");
  if (headingIndex === -1) {
    throw new Error('Missing required "Invariant geometry mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex && /^\|\s*Role\s*\|\s*Token\s*\|\s*Value\s*\|\s*Use\s*\|\s*$/.test(line)
  );
  if (headerIndex === -1) {
    throw new Error("Missing invariant geometry token table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 4) {
      throw new Error(`Malformed invariant geometry row at line ${index + 1}.`);
    }
    rows.push({ role: cells[0], token: cells[1], value: cells[2] });
  }
  return rows;
}

function extractSemanticStateRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "### Semantic state mappings");
  if (headingIndex === -1) {
    throw new Error('Missing required "Semantic state mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex &&
      /^\|\s*State\s*\|\s*Foreground token\s*\|\s*Soft fill token\s*\|\s*Border token\s*\|\s*Soft fill alpha\s*\|\s*Border alpha\s*\|\s*Use\s*\|\s*$/.test(
        line
      )
  );
  if (headerIndex === -1) {
    throw new Error("Missing semantic state token table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 7) {
      throw new Error(`Malformed semantic state row at line ${index + 1}.`);
    }
    rows.push({
      role: cells[0],
      foregroundToken: cells[1],
      softFillToken: cells[2],
      borderToken: cells[3],
      softFillAlpha: cells[4],
      borderAlpha: cells[5],
    });
  }
  return rows;
}

function extractMappingRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "### Light and dark mappings");
  if (headingIndex === -1) {
    throw new Error('Missing required "Light and dark mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex && /^\|\s*Role\s*\|\s*Light\s*\|\s*Dark\s*\|\s*Use\s*\|\s*$/.test(line)
  );
  if (headerIndex === -1) {
    throw new Error("Missing Light/Dark token table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 4) {
      throw new Error(`Malformed token table row at line ${index + 1}.`);
    }
    rows.push({ role: cells[0], light: cells[1], dark: cells[2] });
  }

  return rows;
}

function extractOperationalLightRows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === "### Operational light mappings");
  if (headingIndex === -1) {
    throw new Error('Missing required "Operational light mappings" section.');
  }

  const headerIndex = lines.findIndex(
    (line, index) =>
      index > headingIndex && /^\|\s*Role\s*\|\s*Operational Light\s*\|\s*Use\s*\|\s*$/.test(line)
  );
  if (headerIndex === -1) {
    throw new Error("Missing Operational Light token table header.");
  }

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    if (cells.length !== 3) {
      throw new Error(`Malformed Operational Light token row at line ${index + 1}.`);
    }
    rows.push({ role: cells[0], operationalLight: cells[1] });
  }

  return rows;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  return trimmed
    .slice(1, trimmed.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
}

function parseRoleCell(definition, value, mode) {
  try {
    return definition.parser(value, mode);
  } catch (error) {
    throw new Error(`Malformed ${mode} value for ${definition.role}: ${error.message}`);
  }
}

function parseSingleColor(value) {
  const normalized = stripCodeTicks(value);
  if (!/^#[0-9A-F]{6}$/i.test(normalized)) {
    throw new Error(`expected one six-digit hex color, received "${normalized}".`);
  }
  return [normalized.toUpperCase()];
}

function parseCssColor(value) {
  return [stripCodeTicks(value).replace(/\s+/g, " ")];
}

function parseSlashColorSequence(value, expectedCount) {
  const normalized = stripCodeTicks(value);
  const colors = normalized.split(/\s*\/\s*/).map((color) => normalizeCssColor(color));
  if (colors.length !== expectedCount) {
    throw new Error(
      `expected ${expectedCount} slash-delimited CSS colors, received "${normalized}".`
    );
  }
  return colors;
}

function parseInteractiveSurface(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(/^hover\s+(.+?)\s*;\s*selected\s+(.+?)\s*;\s*pressed\s+(.+)$/i);
  if (!match) {
    throw new Error(`expected hover, selected, and pressed CSS colors, received "${normalized}".`);
  }
  return match.slice(1).map((color) => normalizeCssColor(color));
}

function parseAccentSequence(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(
    /^base\s+(.+?)\s*;\s*hover\s+(.+?)\s*;\s*muted\s+(.+?)\s*;\s*border\s+(.+)$/i
  );
  if (!match) {
    throw new Error(
      `expected base, hover, muted, and border CSS colors, received "${normalized}".`
    );
  }
  return match.slice(1).map((color) => normalizeCssColor(color));
}

function parseInputSequence(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(/^surface\s+(.+?)\s*;\s*background\s+(.+)$/i);
  if (!match) {
    throw new Error(`expected surface and background CSS colors, received "${normalized}".`);
  }
  return match.slice(1).map((color) => normalizeCssColor(color));
}

function parseShadow(value) {
  const normalized = stripCodeTicks(value).replace(/\s+/g, " ");
  return [normalized];
}

function parseBorderSequence(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(
    /^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\/\s*(\d+(?:\.\d+)?)%\s*\)\s*\/\s*(\d+(?:\.\d+)?)%\s*\/\s*(\d+(?:\.\d+)?)%\s*\/\s*(\d+(?:\.\d+)?)%$/i
  );
  if (!match) {
    throw new Error(`expected rgb alpha plus three percentage aliases, received "${normalized}".`);
  }

  const channels = match.slice(1, 4).map(Number);
  const alphas = match.slice(4, 8).map(Number);
  if (channels.some((channel) => channel > 255) || alphas.some((alpha) => alpha > 100)) {
    throw new Error(`rgb channel or alpha percentage is out of range in "${normalized}".`);
  }

  const rgb = channels.join(" ");
  return alphas.map((alpha) => `rgb(${rgb} / ${formatNumber(alpha)}%)`);
}

function parsePrimaryAction(value, mode) {
  const normalized = stripCodeTicks(value);
  if (mode === "Light") {
    const match = normalized.match(/^(#[0-9A-F]{6})\s+with\s+white\s+text$/i);
    if (!match) {
      throw new Error(`expected a background with explicit white text, received "${normalized}".`);
    }
    return [match[1].toUpperCase(), "#FFFFFF"];
  }

  const match = normalized.match(/^(#[0-9A-F]{6})\s+with\s+(#[0-9A-F]{6})\s+text$/i);
  if (!match) {
    throw new Error(`expected a background and explicit text color, received "${normalized}".`);
  }
  return [match[1].toUpperCase(), match[2].toUpperCase()];
}

function parseInvariantDimension(value, role) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(/^(\d+)px$/);
  if (!match || Number(match[1]) <= 0) {
    throw new Error(
      `Malformed invariant geometry value for ${role}: expected a positive whole-pixel value, received "${normalized}".`
    );
  }
  return `${Number(match[1])}px`;
}

function parseTypographyScale(value, role, viewport) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(/^(\d+(?:\.\d+)?)px\s*\/\s*(\d+(?:\.\d+)?)px$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
    throw new Error(
      `Malformed ${viewport} typography value for ${role}: expected positive pixel size / line height, received "${normalized}".`
    );
  }
  return { fontSize: `${Number(match[1])}px`, lineHeight: `${Number(match[2])}px` };
}

function parseTypographyWeight(value, role) {
  const normalized = stripCodeTicks(value);
  if (!/^(400|500|600)$/.test(normalized)) {
    throw new Error(
      `Malformed typography weight for ${role}: expected 400, 500, or 600, received "${normalized}".`
    );
  }
  return normalized;
}

function parseTypographyLetterSpacing(value, role) {
  const normalized = stripCodeTicks(value);
  if (!/^(?:0|-?0\.\d+em)$/.test(normalized)) {
    throw new Error(
      `Malformed typography letter spacing for ${role}: expected 0 or an em value, received "${normalized}".`
    );
  }
  return normalized;
}

function validateCssColor(value, role, mode) {
  const hex = /^#[0-9A-F]{6}$/;
  const rgb = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (\d+(?:\.\d+)?)%\)$/;
  if (hex.test(value) || value === "transparent") return;

  const match = value.match(rgb);
  if (!match) {
    throw new Error(
      `Malformed ${mode} value for ${role}: "${value}" is not a supported CSS color.`
    );
  }
  const channels = match.slice(1, 4).map(Number);
  const alpha = Number(match[4]);
  if (channels.some((channel) => channel > 255) || alpha > 100) {
    throw new Error(`Malformed ${mode} value for ${role}: "${value}" is out of range.`);
  }
}

function validateCssShadow(value, role, mode) {
  const layers = value.split(/\s*,\s*/);
  if (layers.length < 1 || layers.length > 2) {
    throw new Error(
      `Malformed ${mode} value for ${role}: expected one or two neutral shadow layers.`
    );
  }

  const length = "(?:0|-?\\d+(?:\\.\\d+)?px)";
  const layerPattern = new RegExp(
    `^(${length}(?:\\s+${length}){2,3})\\s+rgb\\(\\s*(\\d{1,3})\\s+(\\d{1,3})\\s+(\\d{1,3})\\s*\\/\\s*(\\d+(?:\\.\\d+)?)\\s*\\)$`,
    "i"
  );

  for (const layer of layers) {
    const match = layer.match(layerPattern);
    if (!match) {
      throw new Error(
        `Malformed ${mode} value for ${role}: "${value}" is not a supported neutral CSS shadow.`
      );
    }
    const channels = match.slice(2, 5).map(Number);
    const alpha = Number(match[5]);
    if (channels.some((channel) => channel > 255) || alpha > 1) {
      throw new Error(`Malformed ${mode} value for ${role}: "${value}" is out of range.`);
    }
  }
}

function colorWithAlpha(hex, alpha) {
  const match = hex.match(/^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i);
  if (!match) {
    throw new Error(`Cannot derive semantic alpha color from "${hex}".`);
  }
  const channels = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return `rgb(${channels.join(" ")} / ${alpha})`;
}

function stripCodeTicks(value) {
  return value.replaceAll("`", "").trim();
}

function normalizeCssColor(value) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return /^#[0-9A-F]{6}$/i.test(normalized) ? normalized.toUpperCase() : normalized;
}

function normalizeRole(role) {
  return role.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatCssValue(value) {
  return value.startsWith("#") ? value.toLowerCase() : value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
