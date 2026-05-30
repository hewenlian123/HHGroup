import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  getInvoices,
  getInvoicesWithDerived,
  getInvoicesWithDerivedPaged,
  getProjects,
  type InvoiceComputedStatus,
  type InvoiceStatus,
} from "@/lib/data";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function toStoredOrOverdueStatus(
  status: string | undefined
): InvoiceStatus | "Overdue" | undefined {
  if (
    status === "Draft" ||
    status === "Sent" ||
    status === "Partially Paid" ||
    status === "Paid" ||
    status === "Void" ||
    status === "Overdue"
  ) {
    return status;
  }
  return undefined;
}

/**
 * GET /api/invoices
 * Returns invoice list for health check and API consumers.
 */
export async function GET(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("derived") === "1") {
      const page = parsePositiveInt(url.searchParams.get("page"), 1);
      const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 20), 1000);
      const status = url.searchParams.get("status") || undefined;
      const projectId = url.searchParams.get("projectId") || undefined;
      const search = url.searchParams.get("search") || undefined;
      const includeProjects = url.searchParams.get("includeProjects") === "1";
      if (url.searchParams.get("all") === "1") {
        const [invoices, projects] = await Promise.all([
          getInvoicesWithDerived({
            status: toStoredOrOverdueStatus(status),
            projectId,
            search,
          }),
          includeProjects ? getProjects() : Promise.resolve([]),
        ]);
        return NextResponse.json({
          ok: true,
          invoices,
          total: invoices.length,
          page: 1,
          pageSize: invoices.length,
          projects,
        });
      }
      const [paged, projects] = await Promise.all([
        getInvoicesWithDerivedPaged({
          page,
          pageSize,
          status: status as InvoiceStatus | InvoiceComputedStatus | undefined,
          projectId,
          search,
        }),
        includeProjects ? getProjects() : Promise.resolve([]),
      ]);
      return NextResponse.json({
        ok: true,
        invoices: paged.rows,
        total: paged.total,
        page,
        pageSize,
        projects,
      });
    }

    const invoices = await getInvoices();
    return NextResponse.json({ ok: true, invoices });
  } catch (e) {
    console.error("[api/invoices] failed to load invoices", e);
    return NextResponse.json({ ok: false, message: "Failed to load invoices." }, { status: 500 });
  }
}
