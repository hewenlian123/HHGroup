export default function LoadingInvoicePrint() {
  return (
    <main
      className="invoice-a4-shell min-h-screen bg-white px-3 py-5 text-black sm:px-6 print:p-0"
      style={{ maxWidth: "210mm", margin: "0 auto" }}
    >
      <div
        className="mx-auto bg-white p-5 sm:p-9"
        style={{
          width: "min(210mm, calc(100vw - 2rem))",
          minHeight: "calc(min(210mm, calc(100vw - 2rem)) * 1.4142857)",
        }}
      >
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-7 w-44 animate-pulse rounded-sm bg-zinc-200" />
            <div className="h-4 w-60 animate-pulse rounded-sm bg-zinc-100" />
          </div>
          <div className="h-28 w-56 animate-pulse rounded-lg bg-zinc-100" />
        </div>
        <div className="mt-10 h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded-sm bg-zinc-100" />
          ))}
        </div>
      </div>
    </main>
  );
}
