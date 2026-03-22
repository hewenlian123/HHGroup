import { describe, expect, it } from "vitest";
import {
  MAX_COMPANY_LOGO_BYTES,
  validateCompanyProfileEmailField,
  validateLogoFileForUpload,
} from "@/lib/company-profile-form-validation";

describe("validateCompanyProfileEmailField", () => {
  it("allows empty / whitespace", () => {
    expect(validateCompanyProfileEmailField("")).toBeNull();
    expect(validateCompanyProfileEmailField("   ")).toBeNull();
  });

  it("allows typical emails", () => {
    expect(validateCompanyProfileEmailField("a@b.co")).toBeNull();
    expect(validateCompanyProfileEmailField("user+tag@example.com")).toBeNull();
  });

  it("rejects invalid emails", () => {
    expect(validateCompanyProfileEmailField("not-an-email")).toBeTruthy();
    expect(validateCompanyProfileEmailField("@nodomain.com")).toBeTruthy();
    expect(validateCompanyProfileEmailField("spaces in@mail.com")).toBeTruthy();
  });
});

describe("validateLogoFileForUpload", () => {
  it("accepts small PNG with image mime", () => {
    const f = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
    expect(validateLogoFileForUpload(f)).toBeNull();
  });

  it("accepts SVG by extension when type missing", () => {
    const f = new File([`<svg xmlns="http://www.w3.org/2000/svg"/>`], "logo.svg", { type: "" });
    expect(validateLogoFileForUpload(f)).toBeNull();
  });

  it("rejects non-image", () => {
    const f = new File(["hello"], "readme.txt", { type: "text/plain" });
    expect(validateLogoFileForUpload(f)).toMatch(/image file/i);
  });

  it("rejects oversize files", () => {
    const f = new File([new Uint8Array(MAX_COMPANY_LOGO_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    expect(validateLogoFileForUpload(f)).toMatch(/5MB/i);
  });
});
