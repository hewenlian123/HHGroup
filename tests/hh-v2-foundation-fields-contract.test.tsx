import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

import { Input } from "../src/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "../src/components/ui/select";
import { Textarea } from "../src/components/ui/textarea";
import { NeoTextarea } from "../src/components/base/neo-form";
import { EB } from "../src/app/estimates/_components/estimate-builder-ui";
import tailwindConfig from "../tailwind.config";

function renderedClassName(element: React.ReactElement): string {
  const html = renderToStaticMarkup(element);
  return html.match(/class="([^"]*)"/)?.[1] ?? "";
}

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("shared single-line fields render the 36px standard and 44px touch contracts", () => {
  const inputClassName = renderedClassName(<Input aria-label="Input contract" />);
  const selectClassName = renderedClassName(
    <Select defaultValue="one">
      <SelectTrigger aria-label="Select contract">
        <SelectValue />
      </SelectTrigger>
    </Select>
  );

  for (const className of [inputClassName, selectClassName]) {
    assert.match(className, /(?:^| )h-hh-control-standard(?: |$)/);
    assert.match(className, /(?:^| )hh-touch-min(?: |$)/);
    assert.doesNotMatch(className, /(?:^| )h-10(?: |$)/);
  }
});

test("shared Textarea defaults to the 36px standard and 44px touch contracts", () => {
  const defaultClassName = renderedClassName(<Textarea aria-label="Textarea contract" />);
  const expandedClassName = renderedClassName(
    <Textarea aria-label="Expanded textarea" className="min-h-[88px]" />
  );
  const responsiveExpandedClassName = renderedClassName(
    <Textarea aria-label="Responsive expanded textarea" className="max-md:min-h-[104px]" />
  );
  const importantExpandedClassName = renderedClassName(
    <Textarea aria-label="Important expanded textarea" className="!min-h-[96px]" />
  );
  const neoClassName = renderedClassName(<NeoTextarea aria-label="Neo textarea contract" />);

  assert.match(defaultClassName, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.match(defaultClassName, /(?:^| )hh-touch-min(?: |$)/);
  assert.doesNotMatch(defaultClassName, /(?:^| )min-h-\[80px\](?: |$)/);
  assert.doesNotMatch(defaultClassName, /(?:^| )max-md:min-h-\[104px\](?: |$)/);
  assert.match(expandedClassName, /(?:^| )min-h-\[88px\](?: |$)/);
  assert.doesNotMatch(expandedClassName, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.doesNotMatch(expandedClassName, /(?:^| )hh-touch-min(?: |$)/);
  assert.match(responsiveExpandedClassName, /(?:^| )max-md:min-h-\[104px\](?: |$)/);
  assert.doesNotMatch(responsiveExpandedClassName, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.doesNotMatch(responsiveExpandedClassName, /(?:^| )hh-touch-min(?: |$)/);
  assert.match(importantExpandedClassName, /(?:^| )!min-h-\[96px\](?: |$)/);
  assert.doesNotMatch(importantExpandedClassName, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.doesNotMatch(importantExpandedClassName, /(?:^| )hh-touch-min(?: |$)/);
  assert.match(neoClassName, /(?:^| )min-h-\[88px\](?: |$)/);
  assert.match(neoClassName, /(?:^| )mobile:min-h-\[104px\](?: |$)/);
  assert.doesNotMatch(neoClassName, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.doesNotMatch(neoClassName, /(?:^| )hh-touch-min(?: |$)/);
});

test("NeoTextarea mobile minimum is emitted by the compiled HH mobile screen", async () => {
  const neoClassName = renderedClassName(<NeoTextarea aria-label="Compiled Neo textarea" />);
  const tailwindConfigSource = source("tailwind.config.ts");
  const compiled = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ raw: `<textarea class="${neoClassName}"></textarea>`, extension: "html" }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });

  assert.match(tailwindConfigSource, /mobile:\s*\{\s*max:\s*"639px"\s*\}/);
  assert.match(neoClassName, /(?:^| )mobile:min-h-\[104px\](?: |$)/);
  assert.doesNotMatch(neoClassName, /(?:^| )max-md:min-h-\[104px\](?: |$)/);
  assert.match(compiled.css, /@media \(max-width: 639px\)/);
  assert.ok(compiled.css.includes(".mobile\\:min-h-\\[104px\\]"));
  assert.match(compiled.css, /min-height:\s*104px/);
});

test("every direct shared Textarea consumer owns an explicit multiline minimum", () => {
  const consumers = [
    "src/components/base/neo-form.tsx",
    "src/components/expense-subcontract-deduction-fields.tsx",
    "src/components/financial/send-payment-receipt-modal.tsx",
    "src/app/financial/expenses/expense-inbox-preview-modal.tsx",
    "src/app/financial/expenses/edit-expense-modal.tsx",
    "src/app/financial/expenses/new/page.tsx",
    "src/app/financial/expenses/quick-expense-modal.tsx",
    "src/app/financial/payments/edit-payment-received-modal.tsx",
  ];

  for (const path of consumers) {
    const textareaTags = source(path).match(/<Textarea\b[\s\S]*?\/>/g) ?? [];
    assert.notEqual(textareaTags.length, 0, `Expected a direct Textarea consumer in ${path}`);
    for (const tag of textareaTags) {
      assert.match(tag, /min-h-\[(?:68|76|80|88|170)px\]/, path);
    }
  }
});

test("Estimate sheet fields inherit the shared touch contract instead of a 40px helper", () => {
  const tailwindConfig = source("tailwind.config.ts");

  assert.match(EB.sheetInput, /(?:^| )h-hh-control-standard(?: |$)/);
  assert.match(EB.sheetInput, /(?:^| )hh-touch-min(?: |$)/);
  assert.doesNotMatch(EB.sheetInput, /(?:^| )(?:h-10|min-h-10)(?: |$)/);
  assert.match(
    tailwindConfig,
    /height:\s*\{[\s\S]*?"hh-control-standard":\s*"var\(--hh-control-height-standard\)"/
  );
});

test("Estimate field overrides consume 36px and 44px tokens without a local 40px rule", () => {
  const operationalCss = source("src/app/estimates/_components/estimate-builder-operational.css");
  const glassCss = source("src/app/estimates/_components/estimate-builder-glass.css");
  const editDetails = source("src/app/estimates/_components/estimate-edit-customer-section.tsx");
  const newDetails = source("src/app/estimates/_components/estimate-new-customer-section.tsx");
  const paymentSchedule = source("src/app/estimates/_components/estimate-payment-schedule.tsx");

  const pageOwnedSheetFieldHeights =
    operationalCss.match(
      /\.estimate-builder\.eb-sheet-glass \.eb-sheet-input,[^{]+\{[^}]*min-height:[^;}]+;?/g
    ) ?? [];

  assert.deepEqual(pageOwnedSheetFieldHeights, []);
  assert.match(
    glassCss,
    /\.estimate-builder\.eb-sheet-glass \.eb-sheet-input,[^{]+\{[^}]*min-height:\s*var\(--hh-control-height-standard\);/
  );
  assert.match(
    glassCss,
    /@media \(max-width: 1023px\), \(pointer: coarse\)\s*\{[\s\S]*?\.estimate-builder\.eb-sheet-glass \.eb-sheet-input,[^{]+\{[^}]*min-height:\s*var\(--hh-touch-min\);/
  );
  assert.doesNotMatch(glassCss, /\.eb-sheet-input[\s\S]{0,320}min-height:\s*2\.75rem;/);
  assert.doesNotMatch(editDetails, /metaInput, "h-10 justify-between"/);
  assert.doesNotMatch(newDetails, /ebSheetInput\("h-10 justify-between text-sm"\)/);
  assert.doesNotMatch(paymentSchedule, /className="mt-1 h-10 w-full/);
  assert.match(paymentSchedule, /<NativeSelect[\s\S]*?aria-label="Payment template amount type"/);
});
