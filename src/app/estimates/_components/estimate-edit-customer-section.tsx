"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EstimateStatusBadge } from "./estimate-status-badge";
import type { EstimateStatus } from "./estimate-status-badge";
import { EstimateBuilderAdvanced } from "./estimate-builder-advanced";
import { EB, ebInput } from "./estimate-builder-ui";

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
  return (
    <section className={EB.section}>
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
            className="btn-outline-ghost h-8 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={onToggleInfo}
          >
            {infoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
            <Input
              id="estimateDate"
              name="estimateDate"
              type="date"
              defaultValue={meta.estimateDate ?? today}
              className={ebInput()}
              readOnly={isReadOnly}
            />
          </div>

          <EstimateBuilderAdvanced title="Advanced settings">
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
                <Input
                  id="validUntil"
                  name="validUntil"
                  type="date"
                  defaultValue={meta.validUntil ?? ""}
                  className={ebInput()}
                  readOnly={isReadOnly}
                />
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
    </section>
  );
}
