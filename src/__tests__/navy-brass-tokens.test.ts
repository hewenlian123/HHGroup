import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("navy + brass v3 tokens", () => {
  const tokens = read("src/styles/tokens.css");
  const tailwind = read("tailwind.config.ts");
  const button = read("src/components/ui/button.tsx");
  const sidebar = read("src/components/layout/sidebar.tsx");

  it("defines the semantic palette once", () => {
    for (const name of [
      "--hh-ink",
      "--hh-page",
      "--hh-line",
      "--hh-navy",
      "--hh-navy-deep",
      "--hh-brass",
      "--hh-brass-hi",
      "--hh-brass-lo",
      "--hh-warning-solid",
      "--hh-success-fg",
      "--hh-danger-fg",
      "--hh-grad-sidebar",
      "--hh-grad-brass",
      "--hh-shadow-card",
      "--hh-radius-xl",
    ]) {
      expect(tokens, name).toContain(`${name}:`);
    }
  });

  it("maps semantic names into Tailwind without embedding color literals", () => {
    expect(tailwind).toContain('ink: { DEFAULT: "var(--hh-ink)"');
    expect(tailwind).toContain('DEFAULT: "var(--hh-brass)"');
    expect(tailwind).toContain('DEFAULT: "var(--hh-navy)"');
    expect(tailwind).toContain('card: "var(--hh-shadow-card)"');
    expect(tailwind).toContain('brass: "var(--hh-grad-brass)"');
  });

  it("wins on the route theme boundary without turning accent or sidebar width blue", () => {
    const aliasStart = tokens.indexOf('html[data-hh-theme="operational-dark"]');
    const aliasBlock = tokens.slice(aliasStart, tokens.indexOf(".hh-btn-primary"));
    expect(aliasBlock).toContain(
      '[data-hh-context][data-hh-theme="operational-light"][data-hh-theme="operational-light"]'
    );
    expect(aliasBlock).toContain(
      '[data-hh-context][data-hh-theme="operational-dark"][data-hh-theme="operational-dark"]'
    );
    expect(aliasBlock).toContain("--hh-accent-primary: var(--hh-ink)");
    expect(aliasBlock).toContain("--hh-action-primary: var(--hh-brass)");
    expect(aliasBlock).toContain("--hh-sidebar-width-expanded: 240px");
    expect(aliasBlock).not.toContain("216px");
    expect(aliasBlock).not.toContain("--hh-v2-accent");
  });

  it("keeps brass on the primary button and the sidebar mark", () => {
    expect(button).toContain("hh-btn-primary");
    expect(button).toContain("bg-[var(--hh-action-primary)]");
    expect(sidebar).toContain("hh-logo-mark");
    expect(sidebar).toContain("hh-user-avatar");
    expect(sidebar).toContain("Logo placeholder");
  });
});
