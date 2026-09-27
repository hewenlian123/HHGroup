import Link from "next/link";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { IntakeUploadActions } from "./intake-upload-actions";
export const dynamic = "force-dynamic";
export default async function ExpenseIntakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) return <FinanceUnavailable title="Intake unavailable" />;
  const params = await searchParams;
  const source = ["upload", "worker", "bank"].includes(params.source ?? "")
    ? params.source!
    : "all";
  const size = [25, 50, 100].includes(Number(params.size)) ? Number(params.size) : 25;
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  let query = guard.client
    .from("expense_intake_sources")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id");
  if (source !== "all") query = query.eq("source_kind", source);
  const result = await query.range((page - 1) * size, page * size - 1);
  if (result.error || !result.data || result.count === null)
    return <FinanceUnavailable title="Intake unavailable" />;
  const href = (nextPage: number, nextSource = source, nextSize = size) =>
    `/financial/expenses/intake?source=${nextSource}&size=${nextSize}&page=${nextPage}`;
  return (
    <main className="page-container space-y-5 py-5">
      <ExpenseOperationsWorkspaceNav />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-hh-page-title">Intake</h2>
          <p className="mt-1 text-sm text-[var(--hh-text-secondary)]">
            Incoming evidence and financial sources.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--hh-border)] px-4 text-sm"
          href="/upload-receipt"
        >
          Submit receipt
        </Link>
      </header>
      <nav aria-label="Intake sources" className="flex flex-wrap gap-2">
        {["all", "worker", "upload", "bank"].map((item) => (
          <Link
            key={item}
            href={href(1, item)}
            aria-current={source === item ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm capitalize ${source === item ? "bg-[var(--hh-l3-selected)] font-medium" : "text-[var(--hh-text-secondary)]"}`}
          >
            {item}
          </Link>
        ))}
        <span className="flex min-h-11 items-center px-3 text-xs text-[var(--hh-text-secondary)]">
          Email / Card feeds unavailable
        </span>
      </nav>
      <div className="overflow-x-auto rounded-lg border border-[var(--hh-border)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--hh-border)] text-xs text-[var(--hh-text-secondary)]">
            <tr>
              <th className="p-3">Source / Date</th>
              <th className="p-3">Evidence</th>
              <th className="p-3">State</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">
                <span className="sr-only">Open or process</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.id} className="border-b border-[var(--hh-border)] last:border-0">
                <td className="whitespace-nowrap p-3">
                  <span className="capitalize">{row.source_kind}</span>
                  <div className="mt-1 text-xs text-[var(--hh-text-secondary)]">
                    {new Date(row.created_at).toLocaleDateString("en-US")}
                  </div>
                </td>
                <td className="min-w-40 p-3">{row.title || "Untitled evidence"}</td>
                <td className="p-3">
                  {row.source_kind === "worker" && !row.expense_id
                    ? "Legacy"
                    : row.status || "Unknown"}
                </td>
                <td className="whitespace-nowrap p-3 text-right tabular-nums">
                  {Number.isFinite(Number(row.amount))
                    ? Number(row.amount).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })
                    : "Unknown"}
                </td>
                <td className="p-3">
                  {row.expense_id ? (
                    <Link
                      className="inline-flex min-h-11 items-center underline underline-offset-4"
                      href={`/financial/inbox?ops_record=${row.expense_id}`}
                    >
                      Quick Look
                    </Link>
                  ) : row.source_kind === "upload" && row.status === "pending" ? (
                    <IntakeUploadActions id={row.source_id} amount={row.amount ?? ""} />
                  ) : (
                    <Link
                      className="inline-flex min-h-11 items-center underline underline-offset-4"
                      href={
                        row.source_kind === "bank"
                          ? "/financial/bank"
                          : row.source_kind === "worker"
                            ? "/financial/inbox/worker"
                            : "/financial/inbox"
                      }
                    >
                      Open source
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.data.length && (
          <p className="p-8 text-center text-sm text-[var(--hh-text-secondary)]">
            No sources in this view.
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          {result.count} sources · {size} sources per page
        </p>
        <nav aria-label="Intake page size" className="flex gap-3">
          {[25, 50, 100].map((n) => (
            <Link
              key={n}
              href={href(1, source, n)}
              aria-current={n === size ? "true" : undefined}
              className={n === size ? "font-semibold underline" : ""}
            >
              {n}
            </Link>
          ))}
        </nav>
        <nav aria-label="Intake pagination" className="flex min-h-11 items-center gap-4">
          {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
          <span>
            Page {page} of {Math.max(1, Math.ceil(result.count / size))}
          </span>
          {page * size < result.count && <Link href={href(page + 1)}>Next</Link>}
        </nav>
      </footer>
    </main>
  );
}
