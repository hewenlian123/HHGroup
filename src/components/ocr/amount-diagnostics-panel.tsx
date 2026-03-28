"use client";

import * as React from "react";
import type { AmountRuleDiagnostic } from "@/lib/receipt-ocr-client";
import {
  matchedRulesToAmountRuleTrace,
  type AmountRuleTraceHit,
} from "@/lib/receipt-ocr-amount-trace";

type Props = {
  diagnostics: AmountRuleDiagnostic[];
  matchedRules?: string[];
  /** When set, overrides trace derived from `matchedRules`. */
  amountRuleTrace?: AmountRuleTraceHit[];
  className?: string;
};

export function AmountDiagnosticsPanel({
  diagnostics,
  matchedRules = [],
  amountRuleTrace,
  className,
}: Props) {
  const trace = amountRuleTrace ?? matchedRulesToAmountRuleTrace(matchedRules);
  return (
    <div className={className}>
      <div className="mb-2 rounded-sm border border-border/60 p-2 text-xs">
        <p className="mb-1 font-medium text-foreground">Amount Rule Trace</p>
        {trace.length === 0 ? (
          <p className="text-muted-foreground">No amount rule hits.</p>
        ) : (
          <ul className="space-y-1">
            {trace.map((hit, idx) => (
              <li key={`${hit.kind}-${idx}`}>
                <span className="font-medium text-foreground">{hit.kind}</span>: {hit.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-sm border border-border/60 p-2 text-xs">
          <p className="mb-1 font-medium text-foreground">Accepted</p>
          {diagnostics.filter((d) => d.kind === "accepted").length === 0 ? (
            <p className="text-muted-foreground">None</p>
          ) : null}
          <ul className="space-y-1">
            {diagnostics
              .filter((d) => d.kind === "accepted")
              .map((d, idx) => (
                <li key={`acc-${idx}`}>
                  <span className="font-medium text-foreground">{d.value ?? "(n/a)"}</span> -{" "}
                  {d.reason}
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-sm border border-border/60 p-2 text-xs">
          <p className="mb-1 font-medium text-foreground">Rejected</p>
          {diagnostics.filter((d) => d.kind === "rejected").length === 0 ? (
            <p className="text-muted-foreground">None</p>
          ) : null}
          <ul className="space-y-1">
            {diagnostics
              .filter((d) => d.kind === "rejected")
              .map((d, idx) => (
                <li key={`rej-${idx}`}>
                  <span className="font-medium text-foreground">{d.value ?? "(n/a)"}</span> -{" "}
                  {d.reason}
                  {d.line ? ` | ${d.line}` : ""}
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-sm border border-border/60 p-2 text-xs">
          <p className="mb-1 font-medium text-foreground">Meta</p>
          {diagnostics.filter((d) => d.kind === "meta").length === 0 ? (
            <p className="text-muted-foreground">None</p>
          ) : null}
          <ul className="space-y-1">
            {diagnostics
              .filter((d) => d.kind === "meta")
              .map((d, idx) => (
                <li key={`meta-${idx}`}>{d.reason}</li>
              ))}
          </ul>
        </div>
      </div>
      {matchedRules.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Matched rules: {matchedRules.join(" | ")}
        </p>
      ) : null}
    </div>
  );
}
