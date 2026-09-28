export type EstimateBuilderReturnContext = {
  sectionId: string | null;
  scrollTop: number | null;
};

export type EstimateActiveSectionState = {
  id: string | null;
  explicit: boolean;
};

export type EstimateSectionObserverEntry = {
  id: string;
  isIntersecting: boolean;
  top: number;
};

/**
 * IntersectionObserver reports only changes, so retain the existing visible
 * set while applying the callback's delta before choosing the closest section.
 */
export function selectEstimateActiveSectionFromObserverEntries(
  visibleEntries: readonly EstimateSectionObserverEntry[],
  updates: readonly EstimateSectionObserverEntry[],
  anchorTop = 112
): string | null {
  const visibleById = new Map(
    visibleEntries
      .filter((entry) => entry.isIntersecting)
      .map((entry) => [entry.id, entry] as const)
  );
  updates.forEach((entry) => {
    if (entry.isIntersecting) visibleById.set(entry.id, entry);
    else visibleById.delete(entry.id);
  });

  return (
    [...visibleById.values()].sort(
      (left, right) => Math.abs(left.top - anchorTop) - Math.abs(right.top - anchorTop)
    )[0]?.id ?? null
  );
}

export function reduceEstimateActiveSection(
  current: EstimateActiveSectionState,
  sectionId: string,
  source: "explicit" | "inferred"
): EstimateActiveSectionState {
  if (source === "inferred" && current.explicit) {
    if (current.id !== sectionId) return current;
    return { id: sectionId, explicit: false };
  }
  const explicit = source === "explicit";
  if (current.id === sectionId && current.explicit === explicit) return current;
  return { id: sectionId, explicit };
}

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
  const activeSectionId = document.querySelector<HTMLElement>(
    "[data-estimate-editor-mode][data-estimate-active-section-id]"
  )?.dataset.estimateActiveSectionId;
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
      activeSectionId,
      nearest?.dataset.estimateSectionId ?? nearest?.dataset.estimateSectionMobileId
    ),
    scrollTop: normalizedScrollTop(scrollRoot?.scrollTop ?? window.scrollY),
  };
}
