import type * as React from "react";

export default function EstimatePreviewLoading(): React.ReactElement {
  return (
    <div
      className="estimate-preview-loading min-h-screen px-3 py-5"
      aria-label="Loading Estimate preview"
      role="status"
    >
      <span className="sr-only">Loading persisted Estimate preview…</span>
      <div className="estimate-preview-loading-toolbar mx-auto mb-5 h-14 max-w-[8.5in] animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="estimate-preview-loading-paper mx-auto aspect-[8.5/11] w-full max-w-[8.5in] animate-pulse bg-white motion-reduce:animate-none">
        <div className="space-y-6 p-[12mm]">
          <div className="h-16 w-full rounded bg-stone-100" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 rounded bg-stone-100" />
            <div className="h-20 rounded bg-stone-100" />
            <div className="h-20 rounded bg-stone-100" />
          </div>
          <div className="h-8 w-2/5 rounded bg-stone-100" />
          <div className="h-56 w-full rounded bg-stone-100" />
        </div>
      </div>
    </div>
  );
}
