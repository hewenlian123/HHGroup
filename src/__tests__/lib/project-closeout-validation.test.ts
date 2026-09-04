import { describe, expect, it } from "vitest";

import {
  parseCloseoutCompletionInput,
  parseCloseoutPunchInput,
  parseCloseoutWarrantyInput,
} from "@/lib/project-closeout-validation";

describe("Project Closeout write validation", () => {
  it("accepts the bounded payloads emitted by the existing Closeout UI", () => {
    expect(
      parseCloseoutPunchInput({
        inspection_date: "2026-09-03",
        inspector: "Inspector",
        notes: "Notes",
        contractor_signature: null,
        client_signature: "Client",
        items: [{ item: "Patch wall", status: "done" }],
      })
    ).toMatchObject({ ok: true });
    expect(
      parseCloseoutWarrantyInput({
        start_date: "2026-09-03",
        period_months: 18,
        notes: "Warranty notes",
      })
    ).toMatchObject({ ok: true });
    expect(
      parseCloseoutCompletionInput({
        completion_date: "2026-09-03",
        contractor_name: "Contractor",
        client_name: "Client",
        contractor_signature: "Signed",
        client_signature: "Signed",
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects malformed, oversized, and invalid-date service-role payloads", () => {
    expect(parseCloseoutPunchInput({ inspection_date: "2026-02-31" })).toMatchObject({
      ok: false,
    });
    expect(parseCloseoutWarrantyInput({ period_months: -1 })).toMatchObject({ ok: false });
    expect(parseCloseoutWarrantyInput({ period_months: "12" })).toMatchObject({ ok: false });
    expect(parseCloseoutWarrantyInput({ start_date: "2026-02-31" })).toMatchObject({ ok: false });
    expect(parseCloseoutWarrantyInput({ notes: "x".repeat(4001) })).toMatchObject({ ok: false });
    expect(parseCloseoutCompletionInput({ contractor_name: 42 })).toMatchObject({ ok: false });
    expect(parseCloseoutCompletionInput({ client_signature: "x".repeat(2001) })).toMatchObject({
      ok: false,
    });
    expect(parseCloseoutCompletionInput({ completion_date: "09/03/2026" })).toMatchObject({
      ok: false,
    });
    expect(parseCloseoutPunchInput({ items: [{ item: "x", status: "unknown" }] })).toMatchObject({
      ok: false,
    });
  });

  it("maps only explicit blank date-only inputs to null", () => {
    expect(parseCloseoutPunchInput({ inspection_date: "", items: [] })).toMatchObject({
      ok: true,
      value: { inspection_date: null },
    });
    expect(parseCloseoutWarrantyInput({ start_date: "", period_months: 12 })).toMatchObject({
      ok: true,
      value: { start_date: null },
    });
    expect(parseCloseoutCompletionInput({ completion_date: "" })).toMatchObject({
      ok: true,
      value: { completion_date: null },
    });
  });
});
