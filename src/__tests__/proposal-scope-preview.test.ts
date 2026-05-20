import { describe, expect, it } from "vitest";
import {
  parseProposalScopeLines,
  SCOPE_SOFT_BREAK,
} from "@/app/estimates/_components/proposal-scope-model";

describe("parseProposalScopeLines", () => {
  it("parses leading tabs as indent only; text has no raw tab characters", () => {
    const rows = parseProposalScopeLines("\tA\n\t\tB");
    expect(rows).toEqual([
      { indent: 1, text: "A" },
      { indent: 2, text: "B" },
    ]);
    for (const r of rows) {
      expect(r.text).not.toContain("\t");
      expect(r.text).not.toContain(SCOPE_SOFT_BREAK);
    }
  });

  it("maps soft line separator to newline inside one bullet; no U+2028 left in text", () => {
    const rows = parseProposalScopeLines(`Line1${SCOPE_SOFT_BREAK}Line1b`);
    expect(rows).toEqual([{ indent: 0, text: "Line1\nLine1b" }]);
    expect(rows[0].text).not.toContain(SCOPE_SOFT_BREAK);
  });

  it("multi-bullet with indent and soft break stays client-safe in parsed text", () => {
    const rows = parseProposalScopeLines(`\tScope A\n\t\tScope B${SCOPE_SOFT_BREAK}continued`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ indent: 1, text: "Scope A" });
    expect(rows[1]).toEqual({ indent: 2, text: "Scope B\ncontinued" });
    const flat = rows.map((r) => r.text).join("");
    expect(flat).not.toContain("\t");
    expect(flat).not.toContain(SCOPE_SOFT_BREAK);
  });
});
