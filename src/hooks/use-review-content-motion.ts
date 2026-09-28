"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Fade updated review content without remounting fields or moving keyboard focus. */
export function useReviewContentMotion(
  ref: RefObject<HTMLElement | null>,
  recordId: string | null | undefined,
  selector: string
) {
  const previous = useRef(recordId);
  useEffect(() => {
    const changed = previous.current != null && previous.current !== recordId;
    previous.current = recordId;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!changed || !recordId || media.matches) return;
    const animations = Array.from(ref.current?.querySelectorAll<HTMLElement>(selector) ?? [])
      .filter(
        (element) =>
          !element.contains(document.activeElement) &&
          element.offsetParent !== null &&
          typeof element.animate === "function"
      )
      .map((element) =>
        element.animate([{ opacity: 0.72 }, { opacity: 1 }], {
          duration: 180,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        })
      );
    const cancel = () => animations.forEach((animation) => animation.cancel());
    media.addEventListener("change", cancel);
    return () => {
      cancel();
      media.removeEventListener("change", cancel);
    };
  }, [recordId, ref, selector]);
}
