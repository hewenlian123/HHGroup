import { describe, expect, it } from "vitest";
import {
  EXPENSE_FORM_FIELDS,
  cleanExpenseDescriptionForDisplay,
  composeExpenseDescription,
  parseExpenseDescription,
} from "@/lib/expense-form-system";
import { stripInboxUploadNoiseFromText } from "@/lib/inbox-upload-constants";

describe("expense form system", () => {
  it("uses one label and hierarchy definition for fields shared by New and Edit", () => {
    expect(EXPENSE_FORM_FIELDS.amount).toMatchObject({
      label: "Amount",
      group: "high_frequency",
    });
    expect(EXPENSE_FORM_FIELDS.vendor.label).toBe("Vendor");
    expect(EXPENSE_FORM_FIELDS.description.label).toBe("Description");
    expect(EXPENSE_FORM_FIELDS.paymentAccount.label).toBe("Payment account");
    expect(EXPENSE_FORM_FIELDS.attachments.label).toBe("Attachments");
  });

  it("round-trips the existing Items-in-notes convention without changing description meaning", () => {
    const stored = composeExpenseDescription("Delivery for framing", [
      "Lumber",
      "Fasteners",
      "lumber",
    ]);

    expect(stored).toBe("Delivery for framing\nItems: Lumber, Fasteners");
    expect(parseExpenseDescription(stored)).toEqual({
      description: "Delivery for framing",
      items: ["Lumber", "Fasteners"],
    });
  });

  it("leaves ordinary descriptions containing the word Items unchanged", () => {
    expect(parseExpenseDescription("Items were delivered after 4pm")).toEqual({
      description: "Items were delivered after 4pm",
      items: [],
    });
  });

  it("keeps an empty description valid when only structured items exist", () => {
    expect(composeExpenseDescription("", ["Paint"])).toBe("Items: Paint");
    expect(parseExpenseDescription("Items: Paint")).toEqual({
      description: "",
      items: ["Paint"],
    });
  });

  it("removes inbox noise without flattening the structured Items line", () => {
    expect(
      cleanExpenseDescriptionForDisplay(
        "Delivery INBOX-UP-acde1234\nItems: Lumber, Fasteners",
        stripInboxUploadNoiseFromText
      )
    ).toBe("Delivery\nItems: Lumber, Fasteners");
  });
});
