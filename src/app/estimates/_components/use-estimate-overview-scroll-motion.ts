"use client";

import * as React from "react";

const FLOAT_THRESHOLD_PX = 24;
const MAX_NUDGE_PX = 5;
const IMPULSE_FACTOR = -0.12;
const SPRING_FACTOR = 0.18;
const SETTLE_EPSILON = 0.05;
const SCROLL_STOP_MS = 80;
const DESKTOP_MQ = "(min-width: 1024px)";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type UseEstimateOverviewScrollMotionResult = {
  asideRef: React.RefCallback<HTMLElement>;
  overviewFloating: boolean;
};

/** Desktop sticky overview: floating state + scroll-follow spring via CSS variable. */
export function useEstimateOverviewScrollMotion(): UseEstimateOverviewScrollMotionResult {
  const [asideNode, setAsideNode] = React.useState<HTMLElement | null>(null);
  const [overviewFloating, setOverviewFloating] = React.useState(false);

  const asideRef = React.useCallback((node: HTMLElement | null) => {
    setAsideNode(node);
  }, []);

  React.useLayoutEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const aside = asideNode;
    if (!scrollRoot || !aside) return undefined;

    const reduceMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopMq = window.matchMedia(DESKTOP_MQ);

    let lastScrollTop = scrollRoot.scrollTop;
    let targetY = 0;
    let currentY = 0;
    let rafId = 0;
    let scrollStopTimer: ReturnType<typeof setTimeout> | undefined;

    const isMotionEnabled = (): boolean => desktopMq.matches && !reduceMotionMq.matches;

    const applyScrollVar = (y: number): void => {
      aside.style.setProperty("--overview-scroll-y", `${y.toFixed(2)}px`);
    };

    const clearScrollVar = (): void => {
      aside.style.removeProperty("--overview-scroll-y");
      aside.classList.remove("is-scroll-nudge");
    };

    const tick = (): void => {
      rafId = 0;
      if (!isMotionEnabled()) {
        currentY = 0;
        targetY = 0;
        clearScrollVar();
        return;
      }

      currentY += (targetY - currentY) * SPRING_FACTOR;
      const settling = Math.abs(targetY) < SETTLE_EPSILON && Math.abs(currentY) < SETTLE_EPSILON;

      if (settling) {
        currentY = 0;
        targetY = 0;
        applyScrollVar(0);
        aside.classList.remove("is-scroll-nudge");
        return;
      }

      applyScrollVar(currentY);
      rafId = requestAnimationFrame(tick);
    };

    const scheduleTick = (): void => {
      if (rafId === 0) rafId = requestAnimationFrame(tick);
    };

    const syncFloating = (): void => {
      const next = scrollRoot.scrollTop > FLOAT_THRESHOLD_PX;
      setOverviewFloating((prev) => (prev === next ? prev : next));
    };

    const onScroll = (): void => {
      syncFloating();

      if (!isMotionEnabled()) {
        lastScrollTop = scrollRoot.scrollTop;
        return;
      }

      const scrollTop = scrollRoot.scrollTop;
      const delta = scrollTop - lastScrollTop;
      lastScrollTop = scrollTop;

      const impulse = clamp(delta * IMPULSE_FACTOR, -MAX_NUDGE_PX, MAX_NUDGE_PX);
      targetY = clamp(targetY + impulse, -MAX_NUDGE_PX, MAX_NUDGE_PX);
      aside.classList.add("is-scroll-nudge");

      if (scrollStopTimer) clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        targetY = 0;
        scheduleTick();
      }, SCROLL_STOP_MS);

      scheduleTick();
    };

    const onMotionPreferenceChange = (): void => {
      if (!isMotionEnabled()) {
        targetY = 0;
        currentY = 0;
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        clearScrollVar();
      }
    };

    syncFloating();
    applyScrollVar(0);
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    reduceMotionMq.addEventListener("change", onMotionPreferenceChange);
    desktopMq.addEventListener("change", onMotionPreferenceChange);

    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
      reduceMotionMq.removeEventListener("change", onMotionPreferenceChange);
      desktopMq.removeEventListener("change", onMotionPreferenceChange);
      if (scrollStopTimer) clearTimeout(scrollStopTimer);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      clearScrollVar();
    };
  }, [asideNode]);

  return { asideRef, overviewFloating };
}
