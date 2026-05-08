"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

const ACTIVE_LOCK_OWNER_SELECTOR = [
  "[data-attachment-preview-modal]",
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[data-radix-popper-content-wrapper] [data-state="open"]',
  "[cmdk-dialog]",
  '[cmdk-root][data-state="open"]',
  '[data-command-dialog][data-state="open"]',
].join(",");

const STALE_LOCK_CLASSES = ["overflow-hidden", "touch-none"];

function hasActiveLockOwner(): boolean {
  return Boolean(document.body.querySelector(ACTIVE_LOCK_OWNER_SELECTOR));
}

function clearStaleLockStyles() {
  const body = document.body;
  const root = document.documentElement;

  if (hasActiveLockOwner()) return;

  body.removeAttribute("data-scroll-locked");
  for (const className of STALE_LOCK_CLASSES) {
    body.classList.remove(className);
    root.classList.remove(className);
  }

  if (body.style.pointerEvents === "none") body.style.pointerEvents = "";
  if (root.style.pointerEvents === "none") root.style.pointerEvents = "";
  if (body.style.overflow === "hidden" || body.style.overflow === "clip") body.style.overflow = "";
  if (root.style.overflow === "hidden" || root.style.overflow === "clip") root.style.overflow = "";
}

export function ScrollLockRecovery() {
  const pathname = usePathname();

  React.useEffect(() => {
    let raf = 0;
    let timeout = 0;

    const run = () => {
      clearStaleLockStyles();
    };

    const schedule = () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      raf = window.requestAnimationFrame(() => {
        raf = window.requestAnimationFrame(run);
      });
      timeout = window.setTimeout(run, 350);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    });
    observer.observe(document.body, {
      attributeFilter: ["class", "data-scroll-locked", "style"],
      attributes: true,
      childList: true,
    });

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
