"use client";

export function ReceiptPrintToolbar() {
  return (
    <div className="no-print flex justify-end mb-4">
      <button
        type="button"
        onClick={() => window.print()}
        className="text-sm border border-[#ddd] bg-white px-3 py-1 rounded-sm hover:bg-[#fafafa]"
      >
        Print / Download PDF
      </button>
    </div>
  );
}
