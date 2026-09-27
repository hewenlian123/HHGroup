import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const ROOT = process.cwd();
const V2_TOKENS = readFileSync(resolve(ROOT, "src/styles/hh-design-system-v2.css"), "utf8");

function hslToHex(value: string) {
  const [hue, saturation, lightness] = value.split(/\s+/).map(Number.parseFloat);
  const saturationFraction = saturation / 100;
  const lightnessFraction = lightness / 100;
  const chroma = (1 - Math.abs(2 * lightnessFraction - 1)) * saturationFraction;
  const sector = hue / 60;
  const match = lightnessFraction - chroma / 2;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function compatibilityHsl(name: string) {
  const match = V2_TOKENS.match(new RegExp(`--${name}: ([^;]+);`));
  if (!match) throw new Error(`Missing compatibility token: --${name}`);
  return match[1];
}

function tokenValue(name: string) {
  const match = V2_TOKENS.match(new RegExp(`--${name}: ([^;]+);`));
  if (!match) throw new Error(`Missing v2 token: --${name}`);
  return match[1];
}

describe("HH v2 foundation classes", () => {
  it.each([
    "text-hh-control",
    "text-hh-page-title",
    "text-hh-status",
    "text-hh-table-header",
    "text-hh-table-cell",
  ])("preserves %s beside an arbitrary text color", (typographyClass) => {
    expect(cn(typographyClass, "text-[var(--hh-text-primary)]").split(" ")).toEqual(
      expect.arrayContaining([typographyClass, "text-[var(--hh-text-primary)]"])
    );
  });

  it.each([
    ["background", "#f7f7f8"],
    ["foreground", "#181a1e"],
    ["card", "#ffffff"],
    ["card-foreground", "#181a1e"],
    ["popover", "#ffffff"],
    ["popover-foreground", "#181a1e"],
    ["primary", "#2563eb"],
    ["primary-foreground", "#ffffff"],
    ["secondary", "#f5f5f6"],
    ["secondary-foreground", "#181a1e"],
    ["muted", "#f5f5f6"],
    ["muted-foreground", "#6b7280"],
    ["accent", "#eef4ff"],
    ["accent-foreground", "#1d4ed8"],
    ["destructive", "#b91c1c"],
    ["destructive-foreground", "#ffffff"],
    ["border", "#ecedef"],
    ["input", "#8b929b"],
    ["ring", "#2563eb"],
  ])("round-trips --%s to the approved %s", (name, expectedHex) => {
    expect(hslToHex(compatibilityHsl(name))).toBe(expectedHex);
  });

  it.each([
    ["hh-type-page-title-letter-spacing", "0"],
    ["hh-type-control-font-size", "12px"],
    ["hh-type-control-line-height", "16px"],
    ["hh-type-control-font-weight", "500"],
    ["hh-type-control-letter-spacing", "0.1px"],
    ["hh-type-table-header-font-weight", "500"],
    ["hh-type-status-letter-spacing", "0.2px"],
  ])("sets --%s to %s", (name, expected) => {
    expect(tokenValue(name)).toBe(expected);
  });
});
