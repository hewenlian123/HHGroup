import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";

type EstimatePaymentMilestonePageItem = {
  title?: string | null;
  description?: string | null;
  dueDate?: string | null;
};

export type EstimateDocumentIdentity = {
  title: string;
  descriptor: string;
  paymentContext: string;
};

/**
 * Row budgets mirror the current Letter document CSS at 96dpi. The usable content column is
 * about 977px tall after page padding/footer reservation; the first/continued schedule headers
 * consume about 100px/75px. These deliberately retain additional breathing room instead of
 * using an opaque character-weight threshold.
 */
const FIRST_PAYMENT_PAGE_ROW_BUDGET_PX = 820;
const CONTINUATION_PAYMENT_PAGE_ROW_BUDGET_PX = 850;
const PAYMENT_ROW_VERTICAL_CHROME_PX = 16;
const PAYMENT_TITLE_LINE_HEIGHT_PX = 19.25;
const PAYMENT_DESCRIPTION_LINE_HEIGHT_PX = 19.5;
const PAYMENT_DUE_DATE_HEIGHT_PX = 20.5;

function estimateWrappedLineCount(value: string | null | undefined, width: number): number {
  const text = value?.trim();
  if (!text) return 0;
  return text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0);
}

function estimatePaymentMilestoneHeight(item: EstimatePaymentMilestonePageItem): number {
  const titleLines = estimateWrappedLineCount(item.title, 52);
  const descriptionLines = estimateWrappedLineCount(item.description, 76);
  return (
    PAYMENT_ROW_VERTICAL_CHROME_PX +
    titleLines * PAYMENT_TITLE_LINE_HEIGHT_PX +
    (descriptionLines > 0 ? 4 + descriptionLines * PAYMENT_DESCRIPTION_LINE_HEIGHT_PX : 0) +
    (item.dueDate?.trim() ? PAYMENT_DUE_DATE_HEIGHT_PX : 0)
  );
}

function paymentPageHeight(items: readonly EstimatePaymentMilestonePageItem[]): number {
  return items.reduce((height, item) => height + estimatePaymentMilestoneHeight(item), 0);
}

function balanceTrailingPaymentPages<T extends EstimatePaymentMilestonePageItem>(
  pages: T[][]
): void {
  for (let pageIndex = pages.length - 1; pageIndex > 0; pageIndex -= 1) {
    const previous = pages[pageIndex - 1];
    const current = pages[pageIndex];
    const currentCapacity = CONTINUATION_PAYMENT_PAGE_ROW_BUDGET_PX;
    let currentHeight = paymentPageHeight(current);

    while (previous.length - current.length > 1) {
      const candidate = previous.at(-1);
      if (!candidate) break;
      const candidateHeight = estimatePaymentMilestoneHeight(candidate);
      if (currentHeight + candidateHeight > currentCapacity) break;
      previous.pop();
      current.unshift(candidate);
      currentHeight += candidateHeight;
    }
  }
}

export function paginateEstimatePaymentSchedule<T extends EstimatePaymentMilestonePageItem>(
  milestones: readonly T[]
): T[][] {
  if (milestones.length === 0) return [];

  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  let capacity = FIRST_PAYMENT_PAGE_ROW_BUDGET_PX;

  const pushPage = (): void => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    used = 0;
    capacity = CONTINUATION_PAYMENT_PAGE_ROW_BUDGET_PX;
  };

  for (const milestone of milestones) {
    const height = estimatePaymentMilestoneHeight(milestone);
    if (current.length > 0 && used + height > capacity) pushPage();
    current.push(milestone);
    used += height;
  }
  pushPage();
  balanceTrailingPaymentPages(pages);
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
