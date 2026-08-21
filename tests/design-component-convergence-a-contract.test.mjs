import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const source = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("Batch A owns neutral keyboard focus through one semantic utility", () => {
  const css = source("src/app/globals.css");
  const typography = source("src/lib/typography.ts");
  const nativeFields = source("src/lib/native-field-classes.ts");

  assert.match(
    css,
    /\.hh-focus-ring:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--hh-focus-ring\);[^}]*outline-offset:\s*2px;/s
  );
  assert.match(typography, /focusRing:\s*"hh-focus-ring"/);
  assert.match(nativeFields, /hh-focus-ring/);
  assert.doesNotMatch(typography, /focus-visible:ring-\[var\(--neo-gold-ring\)\]/);
  assert.doesNotMatch(nativeFields, /neo-gold-ring|neo-gold\)/);
});

test("Button exposes semantic variants and IconButton requires an accessible name", () => {
  const button = source("src/components/ui/button.tsx");
  const iconButton = source("src/components/ui/icon-button.tsx");

  for (const variant of [
    "default",
    "primary",
    "secondary",
    "outline",
    "quiet",
    "ghost",
    "destructive",
  ]) {
    assert.match(button, new RegExp(`${variant}:`));
  }
  assert.match(button, /bg-\[var\(--hh-action-primary\)\]/);
  assert.match(button, /bg-\[var\(--hh-danger\)\]/);
  assert.doesNotMatch(button, /hover:-translate|active:scale/);
  assert.match(iconButton, /"aria-label":\s*string/);
  assert.match(iconButton, /size="icon"/);
});

test("Field, Checkbox, and RadioGroup own accessible names and message relationships", () => {
  const field = source("src/components/ui/field.tsx");
  const checkbox = source("src/components/ui/checkbox.tsx");
  const radio = source("src/components/ui/radio-group.tsx");

  assert.match(field, /aria-describedby/);
  assert.match(field, /aria-invalid/);
  assert.match(field, /htmlFor/);
  assert.match(field, /role=\{error \? "alert" : undefined\}/);
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /min-h-hh-touch/);
  assert.match(radio, /<fieldset/);
  assert.match(radio, /<legend/);
  assert.match(radio, /type="radio"/);
  assert.match(radio, /min-h-hh-touch/);
});

test("shared motion and selection primitives use restrained state feedback", () => {
  const motion = source("src/lib/motion-system.ts");
  const tabs = source("src/components/ui/tabs.tsx");

  assert.doesNotMatch(motion, /hover:-translate|active:scale|hover:scale|zoom-in|zoom-out/);
  assert.doesNotMatch(tabs, /hover:-translate|active:scale/);
  assert.match(tabs, /data-\[state=active\]:bg-\[var\(--hh-l3-selected\)\]/);
});

test("Pagination exposes navigation, current position, boundaries, and loading continuity", () => {
  const pagination = source("src/components/ui/pagination.tsx");

  assert.match(pagination, /<nav/);
  assert.match(pagination, /aria-label="Pagination"/);
  assert.match(pagination, /aria-current="page"/);
  assert.match(pagination, /aria-busy=\{loading \|\| undefined\}/);
});

test("header and toolbar compatibility files delegate to canonical foundations", () => {
  const pageHeader = source("src/components/page-header.tsx");
  const sectionHeader = source("src/components/section-header.tsx");
  const actionBar = source("src/components/action-bar.tsx");
  const filterBar = source("src/components/filter-bar.tsx");

  assert.match(pageHeader, /BasePageHeader/);
  assert.match(sectionHeader, /BaseSectionHeader/);
  assert.match(actionBar, /Toolbar/);
  assert.match(filterBar, /Toolbar/);
});
