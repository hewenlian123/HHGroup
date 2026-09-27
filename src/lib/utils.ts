import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "hh-page-title",
        "hh-section-title",
        "hh-panel-title",
        "hh-body",
        "hh-body-strong",
        "hh-label",
        "hh-metadata",
        "hh-table-header",
        "hh-table-cell",
        "hh-financial",
        "hh-financial-total",
        "hh-control",
        "hh-helper",
        "hh-error",
        "hh-status",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
