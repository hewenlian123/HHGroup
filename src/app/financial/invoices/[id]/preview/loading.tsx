export default function LoadingInvoicePreview() {
  return (
    <main className="invoice-a4-shell financial-nums mx-auto w-full max-w-[210mm] px-3 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-36 animate-pulse rounded-sm bg-zinc-200" />
        <div className="h-4 w-24 animate-pulse rounded-sm bg-zinc-200" />
      </div>
      <div
        className="mx-auto bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-9"
        style={{
          width: "min(210mm, calc(100vw - 2rem))",
          minHeight: "calc(min(210mm, calc(100vw - 2rem)) * 1.4142857)",
        }}
      >
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-7 w-44 animate-pulse rounded-sm bg-zinc-200" />
            <div className="h-4 w-60 animate-pulse rounded-sm bg-zinc-100" />
            <div className="h-4 w-52 animate-pulse rounded-sm bg-zinc-100" />
          </div>
          <div className="h-28 w-56 animate-pulse rounded-lg bg-zinc-100" />
        </div>
        <div className="mt-10 h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-sm bg-zinc-100" />
          ))}
        </div>
        <div className="ml-auto mt-10 h-44 w-72 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </main>
  );
}
