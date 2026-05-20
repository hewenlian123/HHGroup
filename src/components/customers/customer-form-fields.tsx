"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/lib/customers-db";
import {
  formatPhoneInputValue,
  normalizePhoneForSave,
  US_PHONE_PLACEHOLDER,
} from "@/lib/us-phone-format";

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_person: string;
  company_name: string;
  notes: string;
};

export function emptyCustomerFormValues(): CustomerFormValues {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    contact_person: "",
    company_name: "",
    notes: "",
  };
}

export function customerFormValuesFromCustomer(c: Customer): CustomerFormValues {
  return {
    name: c.name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.zip ?? "",
    contact_person: c.contact_person ?? "",
    company_name: c.company_name ?? "",
    notes: c.notes ?? "",
  };
}

export function formatCustomerAddressLine(
  c: Pick<Customer, "address" | "city" | "state" | "zip">
): string {
  const parts = [c.address, c.city, c.state, c.zip].map((s) => (s ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.join(", ");
}

export function customerListSubtitle(c: Customer): string {
  const company = (c.company_name ?? "").trim();
  if (company) return company;
  const email = (c.email ?? "").trim();
  if (email) return email;
  const line = formatCustomerAddressLine(c);
  return line === "—" ? "—" : line;
}

export function buildCustomerApiPayload(values: CustomerFormValues): {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contact_person: string | null;
  company_name: string | null;
  notes: string | null;
} {
  return {
    name: values.name.trim(),
    email: values.email.trim() || null,
    phone: values.phone.trim() ? normalizePhoneForSave(values.phone) : null,
    address: values.address.trim() || null,
    city: values.city.trim() || null,
    state: values.state.trim() || null,
    zip: values.zip.trim() || null,
    contact_person: values.contact_person.trim() || null,
    company_name: values.company_name.trim() || null,
    notes: values.notes.trim() || null,
  };
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}): React.ReactElement {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
      {children}
    </p>
  );
}

export type CustomerFormFieldsProps = {
  idPrefix?: string;
  values: CustomerFormValues;
  onChange: (patch: Partial<CustomerFormValues>) => void;
};

export function CustomerFormFields({
  idPrefix = "customer-form",
  values,
  onChange,
}: CustomerFormFieldsProps): React.ReactElement {
  const handlePhoneChange = (raw: string) => {
    onChange({ phone: formatPhoneInputValue(raw) });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${idPrefix}-name`} required>
          Customer name
        </FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          data-testid={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 rounded-md text-sm"
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
        <SectionLabel>Contact</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
            <Input
              id={`${idPrefix}-phone`}
              data-testid={`${idPrefix}-phone`}
              type="tel"
              value={values.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => {
                if (values.phone.trim()) {
                  onChange({ phone: formatPhoneInputValue(values.phone) });
                }
              }}
              className="h-8 rounded-md text-sm"
              placeholder={US_PHONE_PLACEHOLDER}
              autoComplete="tel"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
            <Input
              id={`${idPrefix}-email`}
              data-testid={`${idPrefix}-email`}
              type="email"
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="h-8 rounded-md text-sm"
              autoComplete="email"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
        <SectionLabel>Address</SectionLabel>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-address`}>Street address</FieldLabel>
            <Input
              id={`${idPrefix}-address`}
              data-testid={`${idPrefix}-address`}
              value={values.address}
              onChange={(e) => onChange({ address: e.target.value })}
              className="h-8 rounded-md text-sm"
              autoComplete="street-address"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={`${idPrefix}-city`}>City</FieldLabel>
              <Input
                id={`${idPrefix}-city`}
                data-testid={`${idPrefix}-city`}
                value={values.city}
                onChange={(e) => onChange({ city: e.target.value })}
                className="h-8 rounded-md text-sm"
                autoComplete="address-level2"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={`${idPrefix}-state`}>State</FieldLabel>
              <Input
                id={`${idPrefix}-state`}
                data-testid={`${idPrefix}-state`}
                value={values.state}
                onChange={(e) => onChange({ state: e.target.value })}
                className="h-8 rounded-md text-sm"
                autoComplete="address-level1"
                maxLength={32}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={`${idPrefix}-zip`}>ZIP</FieldLabel>
              <Input
                id={`${idPrefix}-zip`}
                data-testid={`${idPrefix}-zip`}
                value={values.zip}
                onChange={(e) => onChange({ zip: e.target.value })}
                className="h-8 rounded-md text-sm"
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
        <SectionLabel>Additional</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-contact-person`}>Contact person</FieldLabel>
            <Input
              id={`${idPrefix}-contact-person`}
              data-testid={`${idPrefix}-contact-person`}
              value={values.contact_person}
              onChange={(e) => onChange({ contact_person: e.target.value })}
              className="h-8 rounded-md text-sm"
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-company-name`}>Company name</FieldLabel>
            <Input
              id={`${idPrefix}-company-name`}
              data-testid={`${idPrefix}-company-name`}
              value={values.company_name}
              onChange={(e) => onChange({ company_name: e.target.value })}
              className="h-8 rounded-md text-sm"
              autoComplete="organization"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Internal notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          data-testid={`${idPrefix}-notes`}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="min-h-[72px] rounded-md text-sm py-2"
          placeholder="Gate code, preferred contact time, billing notes..."
        />
      </div>
    </div>
  );
}
