import { describe, expect, it } from "vitest";
import {
  bodyToEditorInnerHtml,
  normalizeEditorDescriptionHtml,
} from "@/app/estimates/_components/estimate-description-html";

describe("shared Estimate description storage", () => {
  it("opens legacy multiline text without treating it as HTML", () => {
    expect(bodyToEditorInnerHtml("Concrete & steel\nSecond line")).toBe(
      "<p>Concrete &amp; steel</p><p>Second line</p>"
    );
  });
  it("retains supported rich text and removes unsafe markup", () => {
    const result = normalizeEditorDescriptionHtml(
      "<p><strong>Bold</strong> <em>Italic</em></p><ul><li>Item</li></ul><ol><li>Next</li></ol><script>alert(1)</script>"
    );
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain("<ul><li>Item</li></ul>");
    expect(result).toContain("<ol><li>Next</li></ol>");
    expect(result).not.toContain("<script");
  });
  it("returns empty storage after clearing editor paragraphs and lists", () => {
    expect(normalizeEditorDescriptionHtml("<p><br></p><ul><li><br></li></ul>")).toBe("");
  });
});
