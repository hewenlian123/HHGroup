import { getContactPaymentSchedule } from "@/app/subcontractors/contact-schedule-read";
import type { SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  contactSections,
  contactMatches,
  contactActiveSection,
} from "@/lib/navigation/contacts-workspace";

describe("Contacts workspace boundaries", () => {
  it("offers four sections without changing the existing primary entry", () => {
    expect(contactSections.map((s) => s.label)).toEqual([
      "Overview",
      "Customers",
      "Subcontractors",
      "Vendors",
    ]);
    expect(contactSections[0].href).toBe("/customers/overview");
  });
  it.each([
    ["/customers/overview", "Overview"],
    ["/customers/id", "Customers"],
    ["/subcontractors/id", "Subcontractors"],
    ["/labor/subcontractors/id", "Subcontractors"],
    ["/vendors/id", "Vendors"],
    ["/financial/vendors", "Vendors"],
  ])("preserves section context for %s", (path, label) =>
    expect(contactActiveSection(path)).toBe(label)
  );
  it("searches all supplied fields without merging records", () => {
    const records = [
      {
        id: "customer:1",
        fields: ["Same Company", "Ada", "CUSTOMER@example.com", "+1 808 555 1212"],
      },
      { id: "vendor:1", fields: ["Same Company", null, "vendor@example.com", null] },
    ];
    expect(records.filter((r) => contactMatches(" same company ", r.fields))).toHaveLength(2);
    expect(records.filter((r) => contactMatches("customer@", r.fields)).map((r) => r.id)).toEqual([
      "customer:1",
    ]);
    expect(contactMatches("808", records[0].fields)).toBe(true);
    expect(contactMatches("ada", records[0].fields)).toBe(true);
    expect(contactMatches("absent", records[1].fields)).toBe(false);
  });
});

it("renders valid empty subcontract financials but never amounts after read failure or denial", () => {
  const results = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const mock = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
    let failure = '';
    const empty = async () => [];
    const populated = {
      bills: [{id:'progress-1',subcontract_id:'contract-1',amount:200,status:'Approved',bill_date:'2026-09-01'}],
      payments: [{id:'payment-1',subcontract_id:'contract-1',amount:50,payment_date:'2026-09-02',method:'Check'}],
      ap: [{id:'ap-1',subcontract_id:'contract-1',bill_no:'AP-1',amount:200,paid_amount:50,balance_amount:150,status:'partial'}],
    };
    const read = name => async () => { if (failure === name) throw Error('permission denied'); return failure === 'populated' ? populated[name] ?? [] : []; };
    const profile = { id:'sub-1', name:'Fixture subcontractor', active:true, phone:null, email:null, insurance_expiration_date:null };
    mock('./src/lib/data/index.ts', {
      getSubcontractorById: async () => profile,
      getSubcontractorsWithInsuranceAlerts: async () => [],
      getSubcontractsSummaryAll: empty, getBillsSummaryAll: empty, getPaymentsSummaryAll: empty,
      getSubcontractsBySubcontractor: empty,
      getBillsBySubcontractIds: read('bills'), getPaymentsBySubcontractIds: read('payments'),
      getSubcontractDeductionsBySubcontractIds: read('deductions'),
      getPaymentScheduleBySubcontractIds: read('schedule'), getApBillsBySubcontractIds: read('ap'),
    });
    mock('./src/app/subcontractors/contact-schedule-read.ts', { getContactPaymentSchedule: read('schedule') });
    mock('./src/lib/auth-boundary.ts', { requireSupabaseOwnerOrAdminServerActionClient: async () => ({ok:true,client:{session:'fixture'}}) });
    mock('./src/lib/subcontractors-db.ts', { getSubcontractorById: async (id,client) => { if(!client?.session) throw Error('session missing'); return profile; } });
    mock('./src/lib/subcontracts-db.ts', { getSubcontractsBySubcontractor: async (id,client) => { if(!client?.session) throw Error('session missing'); return failure === 'populated' ? [{id:'contract-1',project_id:'project-1',project_name:'Fixture project',subcontractor_id:'sub-1',contract_amount:1000}] : []; } });
    mock('./src/lib/server-load-warning.ts', { logServerPageDataError() {}, serverDataLoadWarning: e => e.message });
    mock('./src/components/layout/set-breadcrumb-entity-title.tsx', { SetBreadcrumbEntityTitle: () => null });
    mock('./src/app/subcontractors/[id]/subcontractor-detail-client.tsx', { SubcontractorDetailClient: () => null });
    mock('./src/app/subcontractors/[id]/subcontractor-w9.tsx', { SubcontractorW9: () => null });
    mock('./src/components/contacts/contact-sections.tsx', { ContactChannels: () => null, ContactSections: ({sections}) => React.createElement('div', null, ...sections.map(s => React.createElement('section', {key:s.label}, s.content))) });
    (async () => {
      const Page = require('./src/app/subcontractors/[id]/page.tsx').default;
      const output = {};
      for (const state of ['', 'bills', 'payments', 'deductions', 'schedule', 'ap', 'populated']) {
        failure = state; output[state || 'empty'] = renderToStaticMarkup(await Page({params:Promise.resolve({id:'sub-1'})}));
      }
      process.stdout.write(JSON.stringify(output));
    })().catch(e => { console.error(e); process.exit(1); });
  `,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    )
  );
  for (const amount of ["$1,000.00", "$200.00", "$50.00", "$150.00", "$800.00"])
    expect(results.populated).toContain(amount);
  for (const href of [
    "/projects/project-1",
    "/projects/project-1/subcontracts/contract-1",
    "/bills/ap-1",
    "/documents?project_id=project-1",
  ])
    expect(results.populated).toContain(`href="${href}"`);
  expect(results.empty).toContain("$0.00");
  expect(results.empty).toContain("No contracts");
  for (const source of ["bills", "payments", "deductions", "schedule", "ap"]) {
    expect(results[source]).toContain("financial data unavailable");
    expect(results[source]).not.toContain("$0.00");
    expect(results[source]).not.toContain("No contracts");
  }
});

it("keeps absent schedule schema and permission failures unavailable", async () => {
  expect(await getContactPaymentSchedule([])).toEqual([]);
  for (const message of [
    "relation does not exist",
    "permission denied",
    "schema cache unavailable",
  ]) {
    const client = {
      from: () => ({ select: () => ({ limit: async () => ({ error: { message } }) }) }),
    } as unknown as SupabaseClient;
    await expect(getContactPaymentSchedule(["contract-1"], client)).rejects.toThrow(message);
  }
});
