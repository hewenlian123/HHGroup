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
    role: "Text strong / primary / secondary / tertiary",
    names: ["text-strong", "text-primary", "text-secondary", "text-tertiary"],
    parser: parseHexSequence,
  },
  {
    role: "Border / floating border / strong border",
    names: ["border", "border-floating", "border-strong"],
    parser: parseBorderSequence,
  },
  {
    role: "Action primary",
    names: ["action-primary", "action-primary-foreground"],
    parser: parsePrimaryAction,
  },
  { role: "Success", names: ["success"], parser: parseSingleColor },
  { role: "Warning", names: ["warning"], parser: parseSingleColor },
  { role: "Information", names: ["information"], parser: parseSingleColor },
  { role: "Danger", names: ["danger"], parser: parseSingleColor },
];

const INVARIANT_GEOMETRY_DEFINITIONS = [
  { role: "Space 1", name: "space-1" },
  { role: "Space 2", name: "space-2" },
  { role: "Space 3", name: "space-3" },
  { role: "Space 4", name: "space-4" },
  { role: "Space 5", name: "space-5" },
  { role: "Space 6", name: "space-6" },
  { role: "Space 8", name: "space-8" },
  { role: "Space 10", name: "space-10" },
  { role: "Compact radius", name: "radius-compact" },
  { role: "Standard radius", name: "radius-standard" },
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
];

const ROLE_LOOKUP = new Map(
  ROLE_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
);
const INVARIANT_GEOMETRY_LOOKUP = new Map(
  INVARIANT_GEOMETRY_DEFINITIONS.map((definition) => [normalizeRole(definition.role), definition])
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
  const requiredRows = new Map();

  for (const row of rows) {
    const definition = ROLE_LOOKUP.get(normalizeRole(row.role));
    if (!definition) continue;

    if (requiredRows.has(definition.role)) {
      throw new Error(`Duplicate token role: ${definition.role}.`);
    }
    requiredRows.set(definition.role, row);
  }

  const tokens = [];
  for (const definition of ROLE_DEFINITIONS) {
    const row = requiredRows.get(definition.role);
    if (!row) {
      throw new Error(`Missing required token role: ${definition.role}.`);
    }
    if (!row.light.trim() || !row.dark.trim()) {
      throw new Error(`Incomplete Light/Dark pair for ${definition.role}.`);
    }

    const lightValues = parseRoleCell(definition, row.light, "Light");
    const darkValues = parseRoleCell(definition, row.dark, "Dark");
    if (
      lightValues.length !== definition.names.length ||
      darkValues.length !== definition.names.length
    ) {
      throw new Error(`Incomplete Light/Dark pair for ${definition.role}.`);
    }

    for (let index = 0; index < definition.names.length; index += 1) {
      const name = definition.names[index];
      const light = lightValues[index];
      const dark = darkValues[index];
      const validate = definition.validator ?? validateCssColor;
      validate(light, definition.role, "Light");
      validate(dark, definition.role, "Dark");
      tokens.push({
        role: definition.role,
        name,
        cssVariable: `--hh-${name}`,
        light,
        dark,
      });
    }
  }

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

  return {
    schemaVersion: 3,
    authority: AUTHORITY_NAME,
    source: AUTHORITY_SOURCE_LABEL,
    tokens,
    dimensions,
  };
}

export function renderGeneratedJson(contract) {
  const artifact = {
    generatedNotice: "AUTO-GENERATED by npm run design:sync. DO NOT EDIT BY HAND.",
    schemaVersion: contract.schemaVersion,
    authority: contract.authority,
    source: contract.source,
    tokens: Object.fromEntries(
      contract.tokens.map(({ cssVariable, light, dark }) => [cssVariable, { light, dark }])
    ),
    dimensions: Object.fromEntries(
      contract.dimensions.map(({ cssVariable, value }) => [cssVariable, value])
    ),
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
  const dimensions = contract.dimensions
    .map(({ cssVariable, value }) => `  ${cssVariable}: ${formatCssValue(value)};`)
    .join("\n");

  return [
    "/* AUTO-GENERATED by npm run design:sync. DO NOT EDIT BY HAND. */",
    `/* Authority: ${contract.authority} (${contract.source}) */`,
    "",
    ":root {",
    light,
    dimensions,
    "}",
    "",
    "html.dark {",
    dark,
    "}",
    "",
  ].join("\n");
}

export function validateRepositoryWiring({ globalsCss, tailwindConfig }) {
  const requiredGlobalSnippets = [
    '@import "../styles/design-tokens.generated.css";',
    "--neo-canvas: var(--hh-l0-canvas);",
    "--neo-surface-base: var(--hh-l1-workspace);",
    "--neo-surface-raised: var(--hh-l2-operational-surface);",
    "--neo-surface-hover: var(--hh-l3-hover);",
    "--neo-text-primary: var(--hh-text-primary);",
    "--neo-text-secondary: var(--hh-text-secondary);",
    "--neo-text-tertiary: var(--hh-text-tertiary);",
    "--neo-border: var(--hh-border);",
    "--neo-border-strong: var(--hh-border-strong);",
    "--neo-shadow-panel: var(--hh-shadow-operational);",
    "--neo-shadow-command: var(--hh-shadow-floating);",
    "--space-1: var(--hh-space-1);",
    "--space-2: var(--hh-space-2);",
    "--space-3: var(--hh-space-3);",
    "--space-4: var(--hh-space-4);",
    "--space-5: var(--hh-space-5);",
    "--space-6: var(--hh-space-6);",
    "--space-8: var(--hh-space-8);",
    "--space-10: var(--hh-space-10);",
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
    "--hh-success",
    "--hh-warning",
    "--hh-information",
    "--hh-danger",
    ...INVARIANT_GEOMETRY_DEFINITIONS.map(({ name }) => `--hh-${name}`),
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
    ...INVARIANT_GEOMETRY_DEFINITIONS.map(({ name }) => ({ cssVariable: `--hh-${name}` })),
  ];
  for (const { cssVariable } of generatedVariables) {
    const declaration = new RegExp(`${escapeRegExp(cssVariable)}\\s*:`);
    if (declaration.test(globalsCss)) {
      throw new Error(`globals.css must not redeclare generated token: ${cssVariable}`);
    }
  }
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

function parseHexSequence(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(
    /^(#[0-9A-F]{6})\s*\/\s*(#[0-9A-F]{6})\s*\/\s*(#[0-9A-F]{6})\s*\/\s*(#[0-9A-F]{6})$/i
  );
  if (!match) {
    throw new Error(
      `expected four slash-delimited six-digit hex colors, received "${normalized}".`
    );
  }
  return match.slice(1).map((color) => color.toUpperCase());
}

function parseInteractiveSurface(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(
    /^hover\s+(#[0-9A-F]{6})\s*;\s*selected\s+(#[0-9A-F]{6})\s*;\s*pressed\s+(#[0-9A-F]{6})$/i
  );
  if (!match) {
    throw new Error(
      `expected hover, selected, and pressed six-digit hex colors, received "${normalized}".`
    );
  }
  return match.slice(1).map((color) => color.toUpperCase());
}

function parseShadow(value) {
  const normalized = stripCodeTicks(value).replace(/\s+/g, " ");
  return [normalized];
}

function parseBorderSequence(value) {
  const normalized = stripCodeTicks(value);
  const match = normalized.match(
    /^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\/\s*(\d+(?:\.\d+)?)%\s*\)\s*\/\s*(\d+(?:\.\d+)?)%\s*\/\s*(\d+(?:\.\d+)?)%$/i
  );
  if (!match) {
    throw new Error(`expected rgb alpha plus two percentage aliases, received "${normalized}".`);
  }

  const channels = match.slice(1, 4).map(Number);
  const alphas = match.slice(4, 7).map(Number);
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

function validateCssColor(value, role, mode) {
  const hex = /^#[0-9A-F]{6}$/;
  const rgb = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (\d+(?:\.\d+)?)%\)$/;
  if (hex.test(value)) return;

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
  if (layers.length !== 2) {
    throw new Error(
      `Malformed ${mode} value for ${role}: expected exactly two neutral shadow layers.`
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

function stripCodeTicks(value) {
  return value.replaceAll("`", "").trim();
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
