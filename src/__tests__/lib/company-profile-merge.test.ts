import { describe, expect, it } from "vitest";
import { mergeCompanyProfileInput, parseCompanyProfileSaveBody, type CompanyProfile } from "@/lib/company-profile";

const row = (over: Partial<CompanyProfile>): CompanyProfile => ({
  id: "a",
  created_at: "t",
  updated_at: "t",
  org_name: "Acme",
  legal_name: null,
  phone: null,
  email: null,
  website: null,
  license_number: null,
  tax_id: null,
  default_tax_pct: 0,
  address1: null,
  address2: null,
  city: null,
  state: null,
  zip: null,
  country: "US",
  invoice_footer: null,
  default_terms: null,
  notes: null,
  logo_path: "company/logo.png",
  logo_url: "https://x/logo.png",
  ...over,
});

describe("mergeCompanyProfileInput", () => {
  it("keeps logo when patch omits logo fields (form save)", () => {
    const merged = mergeCompanyProfileInput(row({}), { phone: "+1" });
    expect(merged.logo_path).toBe("company/logo.png");
    expect(merged.logo_url).toBe("https://x/logo.png");
    expect(merged.phone).toBe("+1");
  });

  it("allows patch to clear logo", () => {
    const merged = mergeCompanyProfileInput(row({}), { logo_path: null, logo_url: null });
    expect(merged.logo_path).toBeNull();
    expect(merged.logo_url).toBeNull();
  });

  it("defaults org_name when null row and empty patch", () => {
    const merged = mergeCompanyProfileInput(null, {});
    expect(merged.org_name).toBe("HH Group");
  });
});

describe("parseCompanyProfileSaveBody", () => {
  it("parses known keys and rejects unknown types", () => {
    const p = parseCompanyProfileSaveBody({
      org_name: "Co",
      default_tax_pct: 8.5,
      email: "a@b.co",
    });
    expect(p.org_name).toBe("Co");
    expect(p.default_tax_pct).toBe(8.5);
    expect(p.email).toBe("a@b.co");
    expect(() => parseCompanyProfileSaveBody({ default_tax_pct: "x" })).toThrow(/Invalid type/);
  });

  it("accepts orgName camelCase when org_name omitted", () => {
    const p = parseCompanyProfileSaveBody({ orgName: "Pacific Builders", phone: "808" });
    expect(p.org_name).toBe("Pacific Builders");
    expect(p.phone).toBe("808");
  });

  it("prefers org_name over orgName when both present", () => {
    const p = parseCompanyProfileSaveBody({ org_name: "A", orgName: "B" });
    expect(p.org_name).toBe("A");
  });
});
