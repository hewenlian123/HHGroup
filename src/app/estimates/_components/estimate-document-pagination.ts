import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";

type EstimatePaymentMilestonePageItem = {
  title?: string | null;
  description?: string | null;
};

export type EstimateDocumentIdentity = {
  title: string;
  descriptor: string;
  paymentContext: string;
};

const FIRST_PAYMENT_PAGE_CAPACITY = 42;
const CONTINUATION_PAYMENT_PAGE_CAPACITY = 48;

function estimateWrappedLineCount(value: string | null | undefined, width: number): number {
  const text = value?.trim();
  if (!text) return 0;
  return text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0);
}

function estimatePaymentMilestoneWeight(item: EstimatePaymentMilestonePageItem): number {
  return (
    4 + estimateWrappedLineCount(item.title, 52) + estimateWrappedLineCount(item.description, 76)
  );
}

export function paginateEstimatePaymentSchedule<T extends EstimatePaymentMilestonePageItem>(
  milestones: readonly T[]
): T[][] {
  if (milestones.length === 0) return [];

  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  let capacity = FIRST_PAYMENT_PAGE_CAPACITY;

  const pushPage = (): void => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    used = 0;
    capacity = CONTINUATION_PAYMENT_PAGE_CAPACITY;
  };

  for (const milestone of milestones) {
    const weight = estimatePaymentMilestoneWeight(milestone);
    if (current.length > 0 && used + weight > capacity) pushPage();
    current.push(milestone);
    used += weight;
  }
  pushPage();
  return pages;
}

export function estimateDocumentIdentity(
  documentStyle: EstimateDocumentStyle
): EstimateDocumentIdentity {
  if (documentStyle === "itemized") {
    return {
      title: "Itemized Estimate",
      descriptor: "Detailed Construction Estimate",
      paymentContext: "estimate",
    };
  }
  return {
    title: "Project Proposal",
    descriptor: "Luxury Design-Build Proposal",
    paymentContext: "proposal",
  };
}

export function buildEstimatePageIdentity(
  estimateNumber: string,
  pageNumber: number,
  pageCount: number
): string {
  return `${estimateNumber} · Page ${pageNumber} of ${pageCount}`;
}
