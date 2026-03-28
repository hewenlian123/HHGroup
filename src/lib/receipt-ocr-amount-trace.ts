export type AmountRuleTraceKind = "label" | "vendor-specific" | "fallback";

export type AmountRuleTraceHit = {
  kind: AmountRuleTraceKind;
  detail: string;
};

/** Map internal `matchedRules` strings (from receipt OCR merge) into UI trace rows. */
export function matchedRulesToAmountRuleTrace(matchedRules: string[]): AmountRuleTraceHit[] {
  return matchedRules.map((r) => {
    if (r.startsWith("label:")) {
      return { kind: "label", detail: r.slice("label:".length) };
    }
    if (r.startsWith("vendor-specific:")) {
      return { kind: "vendor-specific", detail: r.slice("vendor-specific:".length) };
    }
    return { kind: "fallback", detail: r };
  });
}
