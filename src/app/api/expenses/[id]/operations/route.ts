import { getExpenseById } from "@/lib/expenses-db";
import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request: Request, { params }: Context) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.test(id)) return reply({ message: "Invalid Expense identity." }, 400);
  const c = guard.client;
  const [expense, state, sources, issues, events] = await Promise.all([
    c.from("expenses").select("id").eq("id", id).maybeSingle(),
    c.from("expense_operations").select("*").eq("expense_id", id).maybeSingle(),
    c.from("expense_source_links").select("*").eq("expense_id", id).order("created_at"),
    c.from("expense_review_issues").select("*").eq("expense_id", id).order("created_at"),
    c
      .from("expense_operation_events")
      .select("*")
      .eq("expense_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if ([expense, state, sources, issues, events].some((r) => r.error))
    return reply({ message: "Expense operations are unavailable." }, 503);
  if (!expense.data) return reply({ message: "Expense not found." }, 404);
  const record = await getExpenseById(id, c);
  if (!record) return reply({ message: "Expense unavailable." }, 503);
  return reply({
    expense: record,
    state: state.data,
    sources: sources.data,
    issues: issues.data,
    events: events.data,
    eventLimit: 100,
  });
}

export async function POST(request: Request, { params }: Context) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (
    !uuid.test(id) ||
    !body ||
    !uuid.test(String(body.requestId)) ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 0 ||
    !["approve", "post", "request_info", "exception", "duplicate", "resolve", "code"].includes(
      body.action
    )
  ) {
    return reply({ message: "Invalid operation request." }, 400);
  }
  if (body.action === "code") {
    const patch = body.payload;
    if (
      !patch ||
      (patch.project_id !== null && !uuid.test(String(patch.project_id))) ||
      typeof patch.category !== "string" ||
      typeof patch.memo !== "string"
    )
      return reply({ message: "Invalid Worker coding." }, 400);
    const result = await guard.client.rpc("code_provisional_worker_expense", {
      p_expense_id: id,
      p_revision: body.revision,
      p_project_id: patch.project_id,
      p_category: patch.category,
      p_memo: patch.memo,
    });
    if (result.error) return reply({ message: result.error.message }, 409);
  } else {
    const identity = await guard.client
      .from("expenses")
      .select("source_worker_receipt_id")
      .eq("id", id)
      .maybeSingle();
    if (identity.error) return reply({ message: "Expense identity unavailable." }, 503);
    if (!identity.data) return reply({ message: "Expense not found." }, 404);
    const result =
      body.action === "approve" && identity.data.source_worker_receipt_id
        ? await guard.client.rpc("approve_worker_expense_operation", {
            p_expense_id: id,
            p_revision: body.revision,
          })
        : await guard.client.rpc("transition_expense_operation", {
            p_expense_id: id,
            p_expected_revision: body.revision,
            p_request_id: body.requestId,
            p_action: body.action,
            p_payload: body.payload ?? {},
          });
    if (result.error)
      return reply({ message: result.error.message }, result.error.code === "42501" ? 403 : 409);
  }
  const [state, expense] = await Promise.all([
    guard.client.from("expense_operations").select("*").eq("expense_id", id).single(),
    getExpenseById(id, guard.client),
  ]);
  if (state.error || !expense)
    return reply({ message: "Operation completed; reload before continuing." }, 503);
  return reply({ state: state.data, expense });
}
