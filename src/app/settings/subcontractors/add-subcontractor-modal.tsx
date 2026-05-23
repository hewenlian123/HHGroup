"use client";

import * as React from "react";
import {
  NeoActionFooter,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoModal,
  neoFormErrorClassName,
} from "@/components/base";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { addSubcontractorAction } from "./actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function AddSubcontractorModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [insuranceExpiration, setInsuranceExpiration] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setInsuranceExpiration("");
    setNotes("");
    setError(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await addSubcontractorAction({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        active: true,
        insurance_expiration_date: insuranceExpiration.trim() || null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add subcontractor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <NeoModal title="Add subcontractor" className="max-w-md" bodyClassName="pb-0">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <NeoFieldLabel required>Name</NeoFieldLabel>
            <NeoInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Subcontractor name"
              className="h-9 text-sm"
              required
            />
          </div>
          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel>Phone</NeoFieldLabel>
              <NeoInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Email</NeoFieldLabel>
              <NeoInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-9 text-sm"
              />
            </div>
          </NeoFormGrid>
          <div className="space-y-1.5">
            <NeoFieldLabel>Address</NeoFieldLabel>
            <NeoInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <NeoFieldLabel>Insurance expiration</NeoFieldLabel>
            <NeoInput
              type="date"
              value={insuranceExpiration}
              onChange={(e) => setInsuranceExpiration(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <NeoFieldLabel>Notes</NeoFieldLabel>
            <NeoInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-9 text-sm"
            />
          </div>
          {error ? <p className={neoFormErrorClassName}>{error}</p> : null}
          <NeoActionFooter>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} size="sm" className="h-8 rounded-sm">
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Add Subcontractor"}
            </Button>
          </NeoActionFooter>
        </form>
      </NeoModal>
    </Dialog>
  );
}
