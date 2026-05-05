import { describe, expect, it } from "vitest";
import {
  inboxUploadDedupeReference,
  stripInboxUploadNoiseFromText,
} from "@/lib/inbox-upload-constants";

describe("stripInboxUploadNoiseFromText", () => {
  it("removes full inbox dedupe tokens", () => {
    const hex =
      "ee3934ccc778f52afc77e8290123456789012345678901234567890123456789012345678901234567890123456789012345678";
    const token = inboxUploadDedupeReference(hex);
    expect(token.startsWith("INBOX-UP-")).toBe(true);
    expect(stripInboxUploadNoiseFromText(`Lead ${token} tail`)).toBe("Lead tail");
    expect(stripInboxUploadNoiseFromText(token)).toBe("");
  });

  it("preserves normal references and prose", () => {
    expect(stripInboxUploadNoiseFromText("PO-44921 Materials")).toBe("PO-44921 Materials");
    expect(stripInboxUploadNoiseFromText("   hello   world  ")).toBe("hello world");
  });
});
