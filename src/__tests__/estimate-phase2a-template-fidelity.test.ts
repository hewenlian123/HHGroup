import { describe, expect, it } from "vitest";

import { estimateItemToTemplateLineItem } from "@/lib/estimate-templates-db";
import type { EstimateItemRow } from "@/lib/estimates-db";
import {
  estimateTemplateDataFromDraft,
  estimateTemplateDraftFromRecord,
  type EstimateTemplateRecord,
} from "@/lib/estimate-templates";

function templateRecord(): EstimateTemplateRecord {
  return {
    id: "template-1",
    name: "Fidelity template",
    description: "Keeps supported estimate fields",
    category: "General",
    defaultTaxRate: 4.712,
    defaultTerms: "Due by milestone",
    isArchived: false,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    templateData: {
      version: 1,
      sections: [
        {
          title: "Owner selections",
          costCode: "120000",
          items: [
            {
              title: "Owner-provided fixture",
              description: "Install only",
              qty: 2,
              unit: "EA",
              unitPrice: 150,
              status: "owner_supplied",
              hideAmountOnPdf: true,
            },
          ],
        },
      ],
      notes: [
        {
          id: "note-1",
          type: "assumptions",
          title: "Access",
          body: "Owner provides site access.",
        },
      ],
    },
  };
}

describe("Estimate Phase 2A template fidelity", () => {
  it("keeps supported section, line status, hidden-price, and note data through editor save", () => {
    const source = templateRecord();

    let nextId = 0;
    const draft = estimateTemplateDraftFromRecord(source, (prefix) => `${prefix}-${nextId++}`);
    const roundTripped = estimateTemplateDataFromDraft(draft);

    expect(roundTripped).toEqual(source.templateData);
  });

  it.each(["optional", "allowance", "excluded", "owner_supplied"] as const)(
    "saves an Estimate %s line into a template without resetting it to included",
    (status) => {
      const row: EstimateItemRow = {
        id: "item-1",
        estimateId: "estimate-1",
        costCode: "010000",
        desc: "Protected line\nProtected description",
        qty: 1.5,
        unit: "LF",
        unitCost: 42.25,
        markupPct: 0,
        hideAmountOnPdf: true,
        status,
        sortOrder: 4,
      };

      expect(estimateItemToTemplateLineItem(row)).toEqual({
        title: "Protected line",
        description: "Protected description",
        qty: 1.5,
        unit: "LF",
        unitPrice: 42.25,
        status,
        hideAmountOnPdf: true,
      });
    }
  );
});
