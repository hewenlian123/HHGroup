export type EstimateBuilderReturnContext = {
  sectionId: string | null;
  scrollTop: number | null;
};

const MAX_SCROLL_TOP = 10_000_000;

function encodedEstimatePath(estimateId: string): string {
  return `/estimates/${encodeURIComponent(estimateId)}`;
}

function normalizedScrollTop(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SCROLL_TOP) return null;
  return Math.round(parsed);
}

export function chooseEstimateReturnSectionId(
  explicitlySelectedSectionId: string | null | undefined,
  inferredSectionId: string | null | undefined
): string | null {
  return explicitlySelectedSectionId?.trim() || inferredSectionId?.trim() || null;
}

function addBuilderContext(
  params: URLSearchParams,
  context: Partial<EstimateBuilderReturnContext>
): void {
  const sectionId = context.sectionId?.trim();
  if (sectionId) params.set("returnSection", sectionId);
  const scrollTop = normalizedScrollTop(context.scrollTop);
  if (scrollTop !== null) params.set("returnScroll", String(scrollTop));
}

export function buildEstimatePreviewHref(
  estimateId: string,
  context: Partial<EstimateBuilderReturnContext> = {}
): string {
  const params = new URLSearchParams({ origin: "builder" });
  addBuilderContext(params, context);
  return `${encodedEstimatePath(estimateId)}/preview?${params.toString()}`;
}

export function readEstimateBuilderReturnContext(
  params: Pick<URLSearchParams, "get">
): EstimateBuilderReturnContext {
  const sectionId = params.get("returnSection")?.trim() || null;
  return {
    sectionId,
    scrollTop: normalizedScrollTop(params.get("returnScroll")),
  };
}

export function buildEstimateDetailReturnHref(
  estimateId: string,
  context: Partial<EstimateBuilderReturnContext> = {}
): string {
  const params = new URLSearchParams();
  addBuilderContext(params, context);
  const query = params.toString();
  return `${encodedEstimatePath(estimateId)}${query ? `?${query}` : ""}`;
}

export function buildEstimateMilestoneReturnHref(estimateId: string, milestoneId: string): string {
  const safeMilestoneId = milestoneId.trim();
  const params = new URLSearchParams();
  if (safeMilestoneId) params.set("returnMilestone", safeMilestoneId);
  const anchor = safeMilestoneId
    ? `#estimate-payment-milestone-${encodeURIComponent(safeMilestoneId)}`
    : "";
  return `${encodedEstimatePath(estimateId)}${params.size ? `?${params.toString()}` : ""}${anchor}`;
}

export function safeEstimateReturnPath(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (
    !candidate ||
    !candidate.startsWith("/estimates/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    /%2e/i.test(candidate)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, "http://estimate.local");
    if (parsed.origin !== "http://estimate.local") return null;
    if (!parsed.pathname.startsWith("/estimates/")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function appendEstimateReturnPath(path: string, returnTo?: string | null): string {
  const safeReturnTo = safeEstimateReturnPath(returnTo);
  if (!safeReturnTo) return path;
  const parsed = new URL(path, "http://estimate.local");
  parsed.searchParams.set("returnTo", safeReturnTo);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildCreateDraftInvoiceHref(
  estimateId: string,
  paymentScheduleItemId: string,
  returnTo = buildEstimateMilestoneReturnHref(estimateId, paymentScheduleItemId)
): string {
  const params = new URLSearchParams({
    estimateId,
    paymentScheduleItemId,
  });
  const safeReturnTo = safeEstimateReturnPath(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  return `/financial/invoices/new?${params.toString()}`;
}

export function captureEstimateBuilderReturnContext(): EstimateBuilderReturnContext {
  if (typeof document === "undefined") return { sectionId: null, scrollTop: null };
  const scrollRoot = document.querySelector<HTMLElement>("[data-app-scroll-root]");
  const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0;
  const explicitlySelectedSectionId = Array.from(
    document.querySelectorAll<HTMLElement>("[data-estimate-active-section-id]")
  ).find((element) => element.getClientRects().length > 0)?.dataset.estimateActiveSectionId;
  const sectionElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-estimate-section-id], [data-estimate-section-mobile-id]"
    )
  ).filter((element) => element.getClientRects().length > 0);
  const nearest = sectionElements.sort(
    (left, right) =>
      Math.abs(left.getBoundingClientRect().top - rootTop - 104) -
      Math.abs(right.getBoundingClientRect().top - rootTop - 104)
  )[0];

  return {
    sectionId: chooseEstimateReturnSectionId(
      explicitlySelectedSectionId,
      nearest?.dataset.estimateSectionId ?? nearest?.dataset.estimateSectionMobileId
    ),
    scrollTop: normalizedScrollTop(scrollRoot?.scrollTop ?? window.scrollY),
  };
}
