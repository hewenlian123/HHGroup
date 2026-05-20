"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EstimateStatusBadge } from "./estimate-status-badge";
import type { EstimateStatus } from "./estimate-status-badge";
import { FinanceDatePicker } from "@/components/ui/date-picker";
import { EstimateBuilderAdvanced } from "./estimate-builder-advanced";
import { EB, ebGlassCustomerPanel, ebInput } from "./estimate-builder-ui";
import { cn } from "@/lib/utils";

export type EstimateEditCustomerMeta = {
  client: { name: string; address: string };
  project: { name: string };
  estimateDate?: string | null;
  validUntil?: string | null;
  salesPerson?: string | null;
  notes?: string | null;
};

export function EstimateEditCustomerSection({
  meta,
  estimateId,
  estimateNumber,
  status,
  today,
  infoOpen,
  onToggleInfo,
  isReadOnly,
  markupPct,
  tax,
  discount,
  saveEstimateMetaAction,
}: {
  meta: EstimateEditCustomerMeta;
  estimateId: string;
  estimateNumber: string;
  status: EstimateStatus | string;
  today: string;
  infoOpen: boolean;
  onToggleInfo: () => void;
  isReadOnly: boolean;
  markupPct: string;
  tax: number;
  discount: number;
  saveEstimateMetaAction: (formData: FormData) => Promise<void>;
}): React.ReactElement {
  const [estimateDate, setEstimateDate] = React.useState(meta.estimateDate ?? today);
  const [validUntil, setValidUntil] = React.useState(meta.validUntil ?? "");

  React.useEffect(() => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
  }, [meta.estimateDate, meta.validUntil, today]);

  return (
    <section className={EB.section}>
      <div className={ebGlassCustomerPanel()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={EB.sectionTitle}>Customer & project</h2>
            <p className={EB.sectionSubtitle}>
              {meta.client.name || "Add customer"}
              {meta.project.name ? ` · ${meta.project.name}` : ""}
            </p>
          </div>
          {!isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("min-h-11 px-3 md:min-h-8", EB.btnGhost)}
              onClick={onToggleInfo}
            >
              {infoOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {infoOpen ? "Done" : "Edit details"}
            </Button>
          ) : null}
        </div>

        {!infoOpen ? (
          <div className={EB.readGrid}>
            <div className={EB.readRow}>
              <p className={EB.readLabel}>Customer</p>
              <p className={EB.readValue}>{meta.client.name || "—"}</p>
            </div>
            <div className={EB.readRow}>
              <p className={EB.readLabel}>Project</p>
              <p className={EB.readValue}>{meta.project.name || "—"}</p>
            </div>
            <div className={EB.readRow}>
              <p className={EB.readLabel}>Address</p>
              <p className={EB.readValueMuted}>{meta.client.address || "—"}</p>
            </div>
            <div className={EB.readRow}>
              <p className={EB.readLabel}>Estimate date</p>
              <p className={EB.readValueMuted}>{meta.estimateDate ?? today}</p>
            </div>
          </div>
        ) : (
          <form
            id="estimate-meta-form"
            action={saveEstimateMetaAction}
            className="space-y-4 animate-in fade-in-0 duration-200"
          >
            <input type="hidden" name="estimateId" value={estimateId} />
            <div className={EB.coreGrid}>
              <div className={EB.fieldStack}>
                <Label htmlFor="clientName" className={EB.label}>
                  Customer
                </Label>
                <Input
                  id="clientName"
                  name="clientName"
                  defaultValue={meta.client.name}
                  placeholder="Client or company name"
                  className={ebInput()}
                  readOnly={isReadOnly}
                />
              </div>
              <div className={EB.fieldStack}>
                <Label htmlFor="projectName" className={EB.label}>
                  Project
                </Label>
                <Input
                  id="projectName"
                  name="projectName"
                  defaultValue={meta.project.name}
                  placeholder="Project name"
                  className={ebInput()}
                  readOnly={isReadOnly}
                />
              </div>
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="address" className={EB.label}>
                Address
              </Label>
              <Input
                id="address"
                name="address"
                defaultValue={meta.client.address}
                placeholder="Site or client address"
                className={ebInput()}
                readOnly={isReadOnly}
              />
            </div>
            <div className={EB.fieldStack}>
              <Label htmlFor="estimateDate" className={EB.label}>
                Estimate date
              </Label>
              {isReadOnly ? (
                <Input
                  id="estimateDate"
                  value={estimateDate}
                  className={ebInput(EB.dateField)}
                  readOnly
                />
              ) : (
                <>
                  <input type="hidden" name="estimateDate" value={estimateDate} />
                  <FinanceDatePicker
                    appearance="glass"
                    size="md"
                    value={estimateDate}
                    onChange={setEstimateDate}
                    className={ebInput(cn(EB.dateField, "!h-11 !min-h-11"))}
                  />
                </>
              )}
            </div>

            <EstimateBuilderAdvanced title="More details">
              <div className={EB.coreGrid}>
                <div className={EB.fieldStack}>
                  <Label className={EB.label}>Estimate #</Label>
                  <Input value={estimateNumber} className={ebInput()} readOnly disabled />
                </div>
                <div className={EB.fieldStack}>
                  <Label className={EB.label}>Status</Label>
                  <div className="pt-0.5">
                    <EstimateStatusBadge
                      status={status === "Converted" ? "Converted" : (status as EstimateStatus)}
                      label={status === "Converted" ? "Converted to Project" : undefined}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className={EB.fieldStack}>
                  <Label htmlFor="validUntil" className={EB.label}>
                    Valid until
                  </Label>
                  {isReadOnly ? (
                    <Input
                      id="validUntil"
                      value={validUntil}
                      className={ebInput(EB.dateField)}
                      readOnly
                    />
                  ) : (
                    <>
                      <input type="hidden" name="validUntil" value={validUntil} />
                      <FinanceDatePicker
                        appearance="glass"
                        size="md"
                        value={validUntil}
                        onChange={setValidUntil}
                        className={ebInput(cn(EB.dateField, "!h-11 !min-h-11"))}
                        allowClear
                      />
                    </>
                  )}
                </div>
                <div className={EB.fieldStack}>
                  <Label htmlFor="salesPerson" className={EB.label}>
                    Sales
                  </Label>
                  <Input
                    id="salesPerson"
                    name="salesPerson"
                    defaultValue={meta.salesPerson ?? ""}
                    placeholder="Optional"
                    className={ebInput()}
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
              <div className={EB.fieldStack}>
                <Label htmlFor="notes" className={EB.label}>
                  Notes
                </Label>
                <Input
                  id="notes"
                  name="notes"
                  defaultValue={meta.notes ?? ""}
                  placeholder="Optional notes"
                  className={ebInput()}
                  readOnly={isReadOnly}
                />
              </div>
              <div className={EB.coreGrid}>
                <div className={EB.fieldStack}>
                  <Label htmlFor="tax" className={EB.label}>
                    Tax
                  </Label>
                  <Input
                    id="tax"
                    name="tax"
                    type="number"
                    step="0.01"
                    defaultValue={tax}
                    className={ebInput(EB.inputNumeric)}
                    readOnly={isReadOnly}
                  />
                </div>
                <div className={EB.fieldStack}>
                  <Label htmlFor="discount" className={EB.label}>
                    Discount
                  </Label>
                  <Input
                    id="discount"
                    name="discount"
                    type="number"
                    step="0.01"
                    defaultValue={discount}
                    className={ebInput(EB.inputNumeric)}
                    readOnly={isReadOnly}
                  />
                </div>
                <div className={EB.fieldStack}>
                  <Label htmlFor="markupPct" className={EB.label}>
                    Markup %
                  </Label>
                  <Input
                    id="markupPct"
                    name="markupPct"
                    type="number"
                    step="0.1"
                    defaultValue={markupPct}
                    className={ebInput(EB.inputNumeric)}
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
            </EstimateBuilderAdvanced>
          </form>
        )}
      </div>
    </section>
  );
}
