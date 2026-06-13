export type SubcontractBillFinancialInput = {
  amount: number;
  status?: string | null;
};

export type SubcontractPaymentFinancialInput = {
  amount: number;
};

export type SubcontractDeductionFinancialInput = {
  amount: number;
};

export type SubcontractScheduleFinancialInput = {
  amount: number;
  status?: string | null;
  apBillId?: string | null;
};

export type SubcontractApBillFinancialInput = {
  id?: string | null;
  amount: number;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  status?: string | null;
};

export type SubcontractFinancialSummary = {
  contractAmount: number;
  scheduledAmount: number;
  billedToDate: number;
  materialDeductions: number;
  paidToDate: number;
  apOutstanding: number;
  netPayable: number;
  remainingContract: number;
};

export type SubcontractorContractFinancialInput = {
  id: string;
  contractAmount: number;
};

export type SubcontractorBillFinancialInput = SubcontractBillFinancialInput & {
  subcontractId: string;
};

export type SubcontractorPaymentFinancialInput = SubcontractPaymentFinancialInput & {
  subcontractId: string;
};

export type SubcontractorDeductionFinancialInput = SubcontractDeductionFinancialInput & {
  subcontractId?: string | null;
  subcontractorId?: string | null;
};

export type SubcontractorScheduleFinancialInput = SubcontractScheduleFinancialInput & {
  subcontractId: string;
};

export type SubcontractorApBillFinancialInput = SubcontractApBillFinancialInput & {
  subcontractId?: string | null;
};

function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function subcontractBillCountsAsBilled(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  return (
    normalized === "approved" ||
    normalized === "paid" ||
    normalized === "partial" ||
    normalized === "partially paid"
  );
}

function apBillCountsAsBilled(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() !== "void";
}

function scheduleItemCountsAsScheduled(status: string | null | undefined): boolean {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized !== "cancelled" && normalized !== "void";
}

export function summarizeSubcontractFinancials(input: {
  contractAmount: number;
  bills?: SubcontractBillFinancialInput[];
  payments?: SubcontractPaymentFinancialInput[];
  deductions?: SubcontractDeductionFinancialInput[];
  scheduleItems?: SubcontractScheduleFinancialInput[];
  apBills?: SubcontractApBillFinancialInput[];
  remainingBasis?: "billed" | "scheduledOrBilled";
}): SubcontractFinancialSummary {
  const contractAmount = money(input.contractAmount);
  const scheduledAmount = money(
    (input.scheduleItems ?? [])
      .filter((item) => scheduleItemCountsAsScheduled(item.status))
      .reduce((sum, item) => sum + money(item.amount), 0)
  );
  const linkedApBills = input.apBills ?? [];
  const useApBills = linkedApBills.length > 0;
  const billedToDate = useApBills
    ? money(
        linkedApBills
          .filter((bill) => apBillCountsAsBilled(bill.status))
          .reduce((sum, bill) => sum + money(bill.amount), 0)
      )
    : money(
        (input.bills ?? [])
          .filter((bill) => subcontractBillCountsAsBilled(bill.status))
          .reduce((sum, bill) => sum + money(bill.amount), 0)
      );
  const paidToDate = useApBills
    ? money(
        linkedApBills
          .filter((bill) => apBillCountsAsBilled(bill.status))
          .reduce((sum, bill) => sum + money(bill.paidAmount), 0)
      )
    : money((input.payments ?? []).reduce((sum, payment) => sum + money(payment.amount), 0));
  const materialDeductions = money(
    (input.deductions ?? []).reduce((sum, deduction) => sum + money(deduction.amount), 0)
  );
  const grossOutstanding = useApBills
    ? money(
        linkedApBills
          .filter((bill) => apBillCountsAsBilled(bill.status))
          .reduce((sum, bill) => {
            const derived = Math.max(0, money(bill.amount) - money(bill.paidAmount));
            const stored =
              bill.balanceAmount == null ? derived : Math.max(0, money(bill.balanceAmount));
            return sum + (stored <= 0 && derived > 0 ? derived : stored);
          }, 0)
      )
    : money(Math.max(0, billedToDate - paidToDate));
  const netPayable = money(Math.max(0, billedToDate - materialDeductions - paidToDate));
  const apOutstanding = money(Math.max(0, grossOutstanding - materialDeductions));
  const remainingBase =
    input.remainingBasis === "scheduledOrBilled"
      ? Math.max(scheduledAmount, billedToDate)
      : billedToDate;
  const remainingContract = money(contractAmount - remainingBase);

  return {
    contractAmount,
    scheduledAmount,
    billedToDate,
    materialDeductions,
    paidToDate,
    apOutstanding,
    netPayable,
    remainingContract,
  };
}

export function summarizeSubcontractorFinancials(input: {
  contracts: SubcontractorContractFinancialInput[];
  bills?: SubcontractorBillFinancialInput[];
  payments?: SubcontractorPaymentFinancialInput[];
  deductions?: SubcontractorDeductionFinancialInput[];
  scheduleItems?: SubcontractorScheduleFinancialInput[];
  apBills?: SubcontractorApBillFinancialInput[];
  remainingBasis?: "billed" | "scheduledOrBilled";
}): SubcontractFinancialSummary {
  const subcontractIds = new Set(input.contracts.map((contract) => contract.id));
  const contractAmount = money(
    input.contracts.reduce((sum, contract) => sum + money(contract.contractAmount), 0)
  );

  return summarizeSubcontractFinancials({
    contractAmount,
    bills: (input.bills ?? []).filter((bill) => subcontractIds.has(bill.subcontractId)),
    payments: (input.payments ?? []).filter((payment) => subcontractIds.has(payment.subcontractId)),
    deductions: (input.deductions ?? []).filter(
      (deduction) => deduction.subcontractId != null && subcontractIds.has(deduction.subcontractId)
    ),
    scheduleItems: (input.scheduleItems ?? []).filter((item) =>
      subcontractIds.has(item.subcontractId)
    ),
    apBills: (input.apBills ?? []).filter(
      (bill) => bill.subcontractId != null && subcontractIds.has(bill.subcontractId)
    ),
    remainingBasis: input.remainingBasis,
  });
}
