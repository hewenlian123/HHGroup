import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clientReimbursementStatusOf,
  clientReimbursementUnlinkedRecovery,
  reimbursableOutstandingInJobCost,
  type ClientReimbursementStatus,
} from "@/lib/client-reimbursement";
import { financialDataUnavailable } from "@/lib/financial-availability";

export type ClientReimbursementListRow = {
  lineId: string;
  expenseId: string;
  projectId: string;
  projectName: string;
  projectAddress: string;
  clientId: string | null;
  clientName: string;
  expenseDate: string;
  vendorName: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  status: ClientReimbursementStatus;
  requestedOn: string | null;
  reimbursedOn: string | null;
  reimbursedAmount: number | null;
  paymentId: string | null;
  requestNo: string | null;
  expenseStatus: string;
  referenceNo: string | null;
  inboxCapture: boolean;
};

export type ClientReimbursementList = {
  rows: ClientReimbursementListRow[];
  outstanding: number;
  requestedTotal: number;
  reimbursedTotal: number;
  unlinkedRecovery: number;
};

type LineRecord = {
  id: string;
  expense_id: string;
  project_id: string | null;
  description: string | null;
  amount: number | string | null;
  client_reimbursable: boolean | null;
  client_reimbursement_status: string | null;
  client_reimbursement_requested_on: string | null;
  client_reimbursement_reimbursed_on: string | null;
  client_reimbursement_amount: number | string | null;
  client_reimbursement_payment_id: string | null;
  client_reimbursement_request_id: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadClientReimbursements(
  client: SupabaseClient,
  filters: { projectId?: string | null } = {}
): Promise<ClientReimbursementList> {
  let query = client
    .from("expense_lines")
    .select(
      "id, expense_id, project_id, description, amount, client_reimbursable, client_reimbursement_status, client_reimbursement_requested_on, client_reimbursement_reimbursed_on, client_reimbursement_amount, client_reimbursement_payment_id, client_reimbursement_request_id"
    )
    .eq("client_reimbursable", true);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  const lines = await query;
  if (lines.error) throw financialDataUnavailable("client reimbursement lines", lines.error);
  const lineRows = (lines.data ?? []) as LineRecord[];
  if (lineRows.length === 0) {
    return {
      rows: [],
      outstanding: 0,
      requestedTotal: 0,
      reimbursedTotal: 0,
      unlinkedRecovery: 0,
    };
  }

  const expenseIds = [...new Set(lineRows.map((line) => line.expense_id))];
  const projectIds = [
    ...new Set(lineRows.map((line) => line.project_id).filter(Boolean)),
  ] as string[];
  const requestIds = [
    ...new Set(lineRows.map((line) => line.client_reimbursement_request_id).filter(Boolean)),
  ] as string[];

  const [expenses, projects, requests] = await Promise.all([
    client
      .from("expenses")
      .select("id, expense_date, vendor_name, reference_no, status, inbox_capture")
      .in("id", expenseIds),
    client
      .from("projects")
      .select("id, name, address, client, client_name, customer_id")
      .in("id", projectIds),
    requestIds.length
      ? client.from("client_reimbursement_requests").select("id, request_no").in("id", requestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (expenses.error)
    throw financialDataUnavailable("client reimbursement expenses", expenses.error);
  if (projects.error)
    throw financialDataUnavailable("client reimbursement projects", projects.error);
  if (requests.error)
    throw financialDataUnavailable("client reimbursement requests", requests.error);

  const customerIds = [
    ...new Set(
      ((projects.data ?? []) as Array<{ customer_id?: string | null }>)
        .map((project) => project.customer_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const customers = customerIds.length
    ? await client.from("customers").select("id, name").in("id", customerIds)
    : { data: [], error: null };
  if (customers.error)
    throw financialDataUnavailable("client reimbursement customers", customers.error);

  const expenseById = new Map(
    ((expenses.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
  );
  const projectById = new Map(
    ((projects.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
  );
  const customerName = new Map(
    ((customers.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      text(row.name),
    ])
  );
  const requestNo = new Map(
    ((requests.data ?? []) as Array<{ id: string; request_no: string }>).map((row) => [
      row.id,
      row.request_no,
    ])
  );

  const rows: ClientReimbursementListRow[] = [];
  for (const line of lineRows) {
    if (!line.project_id) continue;
    const expense = expenseById.get(line.expense_id);
    const project = projectById.get(line.project_id);
    if (!expense || !project) {
      throw financialDataUnavailable(
        "client reimbursement lines",
        new Error("Expense or project for a reimbursable line is missing.")
      );
    }
    const status = clientReimbursementStatusOf({
      clientReimbursable: true,
      clientReimbursementStatus: line.client_reimbursement_status,
    });
    if (!status) continue;
    const customerId = text(project.customer_id) || null;
    rows.push({
      lineId: line.id,
      expenseId: line.expense_id,
      projectId: line.project_id,
      projectName: text(project.name) || "Project",
      projectAddress: text(project.address),
      clientId: customerId,
      clientName:
        (customerId ? customerName.get(customerId) : "") ||
        text(project.client_name) ||
        text(project.client) ||
        "Client",
      expenseDate: text(expense.expense_date).slice(0, 10),
      vendorName: text(expense.vendor_name) || "Vendor",
      invoiceNumber: text(expense.reference_no),
      description: text(line.description) || text(project.name),
      amount: Number(line.amount) || 0,
      status,
      requestedOn: line.client_reimbursement_requested_on,
      reimbursedOn: line.client_reimbursement_reimbursed_on,
      reimbursedAmount:
        line.client_reimbursement_amount == null ? null : Number(line.client_reimbursement_amount),
      paymentId: line.client_reimbursement_payment_id,
      requestNo: line.client_reimbursement_request_id
        ? (requestNo.get(line.client_reimbursement_request_id) ?? null)
        : null,
      expenseStatus: text(expense.status),
      referenceNo: text(expense.reference_no) || null,
      inboxCapture: expense.inbox_capture === true,
    });
  }

  rows.sort(
    (a, b) => b.expenseDate.localeCompare(a.expenseDate) || a.vendorName.localeCompare(b.vendorName)
  );
  const costLines = rows.map((row) => ({
    clientReimbursable: true,
    clientReimbursementStatus: row.status,
    amount: row.amount,
    expenseStatus: row.expenseStatus,
    referenceNo: row.referenceNo,
    inboxCapture: row.inboxCapture,
    paymentId: row.paymentId,
  }));
  const outstanding = reimbursableOutstandingInJobCost(costLines);
  const unlinkedRecovery = clientReimbursementUnlinkedRecovery(costLines);
  const requestedTotal = rows
    .filter((row) => row.status === "requested")
    .reduce((sum, row) => sum + row.amount, 0);
  const reimbursedTotal = rows
    .filter((row) => row.status === "reimbursed")
    .reduce((sum, row) => sum + (row.reimbursedAmount ?? row.amount), 0);
  return {
    rows,
    outstanding,
    requestedTotal: Math.round(requestedTotal * 100) / 100,
    reimbursedTotal: Math.round(reimbursedTotal * 100) / 100,
    unlinkedRecovery,
  };
}
