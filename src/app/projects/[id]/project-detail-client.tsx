"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, Receipt, Pencil, Users } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/data-table";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | null;
  spent: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProjectSubcontractorRow = {
  id: string;
  role: string | null;
  subcontractors?: { id: string; name: string | null; active: boolean | null } | null;
};

type ProjectSubcontractorRowRaw = Omit<ProjectSubcontractorRow, "subcontractors"> & {
  subcontractors?:
    | Array<{ id: string; name: string | null; active: boolean | null }>
    | { id: string; name: string | null; active: boolean | null }
    | null;
};

type BillRow = {
  id: string;
  bill_number: string | null;
  bill_date: string | null;
  due_date: string | null;
  status: "draft" | "approved" | "paid" | "void" | null;
  total: number | null;
  balance: number | null;
  payee_name: string | null;
  subcontractors?: { id: string; name: string | null } | null;
};

type ProjectDetailState = {
  configured: boolean;
  loading: boolean;
  error: string | null;
  notFound: boolean;

  project: ProjectRow | null;
  bills: BillRow[];
  subs: ProjectSubcontractorRow[];
};

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function ymd(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type ApBillApiRow = {
  id: string;
  bill_no: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  amount: number | null;
  balance_amount: number | null;
  vendor_name: string | null;
};

function mapApBillToBillRow(row: ApBillApiRow): BillRow {
  const st = (row.status ?? "").toLowerCase();
  let status: BillRow["status"] = "draft";
  if (st === "void") status = "void";
  else if (st === "paid") status = "paid";
  else if (st === "draft") status = "draft";
  else if (st === "pending" || st === "partially paid") status = "approved";
  return {
    id: row.id,
    bill_number: row.bill_no,
    bill_date: row.issue_date,
    due_date: row.due_date,
    status,
    total: row.amount,
    balance: row.balance_amount,
    payee_name: row.vendor_name,
    subcontractors: null,
  };
}

export function ProjectDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [state, setState] = React.useState<ProjectDetailState>(() => ({
    configured,
    loading: true,
    error: null,
    notFound: false,
    project: null,
    bills: [],
    subs: [],
  }));

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setState({
        configured,
        loading: false,
        error: "Supabase is not configured.",
        notFound: false,
        project: null,
        bills: [],
        subs: [],
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null, notFound: false }));

    const tableMissing = (e: unknown) =>
      typeof (e as { code?: string })?.code === "string" &&
      (e as { code: string }).code === "42P01";

    const [projectRes, billsRes, subsRes] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,status,budget,spent,created_at,updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("ap_bills")
        .select("id,bill_no,issue_date,due_date,status,amount,balance_amount,vendor_name")
        .eq("project_id", id)
        .order("issue_date", { ascending: false })
        .limit(25),
      supabase
        .from("project_subcontractors")
        .select("id,role,subcontractors(id,name,active)")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (projectRes.error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: projectRes.error?.message || "Failed to load project.",
      }));
      return;
    }

    const project = (projectRes.data ?? null) as ProjectRow | null;
    if (!project) {
      setState((prev) => ({
        ...prev,
        loading: false,
        notFound: true,
        project: null,
        bills: [],
        subs: [],
      }));
      return;
    }

    const bills: BillRow[] = billsRes.error
      ? tableMissing(billsRes.error)
        ? []
        : []
      : ((billsRes.data ?? []) as unknown as ApBillApiRow[]).map(mapApBillToBillRow);

    const subs: ProjectSubcontractorRow[] = subsRes.error
      ? tableMissing(subsRes.error)
        ? []
        : []
      : ((subsRes.data ?? []) as unknown as ProjectSubcontractorRowRaw[]).map((row) => ({
          ...row,
          subcontractors: one(row.subcontractors),
        }));

    const nonVoidBills = bills.filter((b) => (b.status ?? "").toString().toLowerCase() !== "void");
    const outstandingBills = nonVoidBills.reduce(
      (s, b) => s + Math.max(0, safeNumber(b.balance)),
      0
    );
    const actualCost =
      safeNumber(project.spent) + nonVoidBills.reduce((s, b) => s + safeNumber(b.total), 0);
    const budget = safeNumber(project.budget);
    const profit = budget - actualCost;
    const marginPct = budget > 0 ? (profit / budget) * 100 : 0;
    const risk = budget > 0 && actualCost > budget * 0.9 ? "High Risk" : "Normal";

    setState({
      configured: true,
      loading: false,
      error: null,
      notFound: false,
      project: project,
      bills,
      subs,
    });

    // Precompute derived fields via memo below; but keep quick nav state in sync.
    void outstandingBills;
    void actualCost;
    void marginPct;
    void risk;
  }, [configured, id, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const derived = React.useMemo(() => {
    const project = state.project;
    if (!project) {
      return {
        budget: 0,
        actualCost: 0,
        outstandingBills: 0,
        profit: 0,
        marginPct: 0,
        risk: "Normal" as const,
        updated: "—",
      };
    }
    const nonVoidBills = state.bills.filter(
      (b) => (b.status ?? "").toString().toLowerCase() !== "void"
    );
    const outstandingBills = nonVoidBills.reduce(
      (s, b) => s + Math.max(0, safeNumber(b.balance)),
      0
    );
    const actualCost =
      safeNumber(project.spent) + nonVoidBills.reduce((s, b) => s + safeNumber(b.total), 0);
    const budget = safeNumber(project.budget);
    const profit = budget - actualCost;
    const marginPct = budget > 0 ? (profit / budget) * 100 : 0;
    const risk =
      budget > 0 && actualCost > budget * 0.9 ? ("High Risk" as const) : ("Normal" as const);
    return {
      budget,
      actualCost,
      outstandingBills,
      profit,
      marginPct,
      risk,
      updated: ymd(project.updated_at ?? project.created_at),
    };
  }, [state.bills, state.project]);

  const billsColumns: Column<BillRow>[] = [
    {
      key: "bill_number",
      header: "Bill",
      render: (row) => (
        <Link href={`/bills/${row.id}`} className="font-medium text-foreground hover:underline">
          {row.bill_number || row.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={(row.status ?? "draft").toString()} />,
    },
    {
      key: "due_date",
      header: "Due",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{row.due_date || "—"}</span>
      ),
    },
    {
      key: "payee_name",
      header: "Payee",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.subcontractors?.name || row.payee_name || "—"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span className="tabular-nums text-muted-foreground">{money(safeNumber(row.total))}</span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "tabular-nums",
      render: (row) => (
        <span
          className={cn(
            "tabular-nums font-medium",
            safeNumber(row.balance) > 0 ? "text-amber-600" : "text-hh-profit-positive"
          )}
        >
          {money(Math.max(0, safeNumber(row.balance)))}
        </span>
      ),
    },
  ];

  const subsColumns: Column<ProjectSubcontractorRow>[] = [
    {
      key: "name",
      header: "Subcontractor",
      render: (row) => (
        <Link
          href={row.subcontractors?.id ? `/labor/subcontractors/${row.subcontractors.id}` : "#"}
          className="font-medium text-foreground hover:underline"
        >
          {row.subcontractors?.name || "—"}
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => <span className="text-muted-foreground">{row.role || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.subcontractors?.active === false ? "inactive" : "active"} />
      ),
    },
  ];

  if (state.notFound) {
    return (
      <div className="page-container page-stack">
        <PageHeader
          title="Project not found"
          subtitle="This project does not exist or you no longer have access."
        />
        <Button variant="outline" onClick={() => router.push("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const projectName = state.project?.name?.trim() || "Untitled Project";
  const status = (state.project?.status ?? "—").toString();

  return (
    <div className="page-container page-stack">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                {projectName}
              </h1>
              <StatusBadge status={status} />
              <StatusBadge status={derived.risk} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href="/bills/new">
                <FilePlus2 className="h-4 w-4" />
                Create Bill
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/financial/expenses">
                <Receipt className="h-4 w-4" />
                Add Expense
              </Link>
            </Button>
            <Button variant="outline" disabled>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>

        {state.error ? (
          <div className="rounded-[12px] border border-gray-100 bg-white px-4 py-3 text-sm text-muted-foreground">
            {state.error}
          </div>
        ) : null}
      </div>

      {/* KPI Row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {state.loading ? (
          Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
            </Card>
          ))
        ) : (
          <>
            <KpiCard label="Budget" value={money(derived.budget)} />
            <KpiCard label="Actual Cost" value={money(derived.actualCost)} />
            <KpiCard label="Outstanding Bills" value={money(derived.outstandingBills)} />
            <KpiCard
              label="Profit"
              value={`${derived.profit < 0 ? "−" : ""}${money(Math.abs(derived.profit))}`}
              emphasis
            />
            <KpiCard label="Margin" value={`${derived.marginPct.toFixed(1)}%`} />
            <KpiCard label="Updated" value={derived.updated} />
          </>
        )}
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          <TabsTrigger value="subcontractors">Subcontractors</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Bills (Recent)</CardTitle>
              </CardHeader>
              <CardContent>
                {state.loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <DataTable<BillRow>
                    columns={billsColumns}
                    data={state.bills}
                    keyExtractor={(r) => r.id}
                    emptyText="No data yet."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Subcontractors</CardTitle>
              </CardHeader>
              <CardContent>
                {state.loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {state.subs.length} linked
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/labor/subcontractors">
                          <Users className="h-4 w-4" />
                          Manage
                        </Link>
                      </Button>
                    </div>
                    <DataTable<ProjectSubcontractorRow>
                      columns={subsColumns}
                      data={state.subs}
                      keyExtractor={(r) => r.id}
                      emptyText="No data yet."
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bills">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bills</CardTitle>
            </CardHeader>
            <CardContent>
              {state.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <DataTable<BillRow>
                  columns={billsColumns}
                  data={state.bills}
                  keyExtractor={(r) => r.id}
                  emptyText="No data yet."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subcontractors">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Subcontractors</CardTitle>
            </CardHeader>
            <CardContent>
              {state.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <DataTable<ProjectSubcontractorRow>
                  columns={subsColumns}
                  data={state.subs}
                  keyExtractor={(r) => r.id}
                  emptyText="No data yet."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estimates">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Estimates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No data yet.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No data yet.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheets">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Timesheets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No data yet.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No data yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
