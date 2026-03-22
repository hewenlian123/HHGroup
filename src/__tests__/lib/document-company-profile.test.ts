import { describe, expect, it } from "vitest";
import { companyProfileToDocumentDto } from "@/lib/document-company-profile";
import type { CompanyProfile } from "@/lib/company-profile";

function baseProfile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    org_name: "Acme Co",
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
    logo_path: null,
    logo_url: null,
    ...over,
  };
}

describe("companyProfileToDocumentDto", () => {
  it("uses HH Group when profile is null", () => {
    const dto = companyProfileToDocumentDto(null);
    expect(dto.companyName).toBe("HH Group");
    expect(dto.logoUrl).toBeNull();
    expect(dto.addressLines).toEqual([]);
    expect(dto.phone).toBeNull();
    expect(dto.email).toBeNull();
    expect(dto.licenseNumber).toBeNull();
  });

  it("maps full profile and address lines", () => {
    const dto = companyProfileToDocumentDto(
      baseProfile({
        org_name: "  My LLC  ",
        phone: "  +1 555 0100 ",
        email: " billing@example.com ",
        website: " https://example.com ",
        license_number: " LIC-99 ",
        address1: "100 Main",
        address2: "Suite 2",
        city: "Austin",
        state: "TX",
        zip: "78701",
        logo_url: " https://cdn.example/logo.png ",
      })
    );
    expect(dto.companyName).toBe("My LLC");
    expect(dto.phone).toBe("+1 555 0100");
    expect(dto.email).toBe("billing@example.com");
    expect(dto.website).toBe("https://example.com");
    expect(dto.licenseNumber).toBe("LIC-99");
    expect(dto.logoUrl).toBe("https://cdn.example/logo.png");
    expect(dto.addressLines).toEqual(["100 Main, Suite 2", "Austin, TX 78701"]);
  });

  it("omits empty optional fields and trims logo URL to null", () => {
    const dto = companyProfileToDocumentDto(
      baseProfile({
        org_name: "",
        phone: "   ",
        email: null,
        license_number: "",
        address1: "",
        city: "   ",
        logo_url: "   ",
      })
    );
    expect(dto.companyName).toBe("HH Group");
    expect(dto.phone).toBeNull();
    expect(dto.licenseNumber).toBeNull();
    expect(dto.addressLines).toEqual([]);
    expect(dto.logoUrl).toBeNull();
  });

  it("builds city line with zip only when city/state missing", () => {
    const dto = companyProfileToDocumentDto(
      baseProfile({
        address1: "PO Box 1",
        city: "",
        state: "",
        zip: "90210",
      })
    );
    expect(dto.addressLines).toEqual(["PO Box 1", "90210"]);
  });
});
