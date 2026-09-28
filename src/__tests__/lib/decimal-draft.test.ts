import { describe, expect, it } from "vitest";
import { decimalDraftFromNumber, nextDecimalDraft, parseDecimalDraft } from "@/lib/decimal-draft";
import { lineExtension } from "@/lib/money";

describe("decimal drafts", () => {
  it("keeps an incomplete decimal while typing", () => {
    expect(nextDecimalDraft("4", "4.")).toBe("4.");
    expect(nextDecimalDraft("4.", "")).toBe("");
    expect(nextDecimalDraft("4.", "4.7")).toBe("4.7");
    expect(nextDecimalDraft("19.99", "19.99a")).toBe("19.99");
  });

  it("parses drafts without changing a finished quantity times price", () => {
    expect(parseDecimalDraft("")).toBe(0);
    expect(parseDecimalDraft(".")).toBe(0);
    expect(parseDecimalDraft("4.")).toBe(4);
    expect(lineExtension(parseDecimalDraft("2.5"), parseDecimalDraft("19.99"))).toBe(49.98);
    expect(decimalDraftFromNumber(4.712)).toBe("4.712");
  });
});
