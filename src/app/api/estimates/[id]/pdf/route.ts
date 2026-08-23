import { NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { estimatePrintPdfFilename, generateEstimatePrintPdfBuffer } from "@/lib/estimate-print-pdf";
import { resolveServerAppOrigin } from "@/lib/server-app-origin";
import { getEstimateHeaderById, getEstimateRevisionContext } from "@/lib/data";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireSupabaseOwnerOrAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await ctx.params;
  const estimateId = rawId?.trim();
  if (!estimateId) {
    return NextResponse.json({ ok: false, message: "Missing estimate id" }, { status: 400 });
  }

  const readClient = getServerSupabaseInternalNoStore();
  const [estimate, revisionContext] = await Promise.all([
    getEstimateHeaderById(estimateId, readClient),
    readClient ? getEstimateRevisionContext(estimateId, readClient).catch(() => null) : null,
  ]);
  if (!estimate) {
    return NextResponse.json({ ok: false, message: "Estimate not found" }, { status: 404 });
  }
  if (!revisionContext) {
    return NextResponse.json(
      { ok: false, message: "Estimate revision identity is unavailable." },
      { status: 409 }
    );
  }

  try {
    const origin = resolveServerAppOrigin(request);
    const cookieHeader = request.headers.get("cookie");
    const pdfBuffer = await generateEstimatePrintPdfBuffer({
      estimateId,
      origin,
      cookieHeader,
    });

    const filename = estimatePrintPdfFilename(
      `${estimate.number} Rev ${revisionContext.revisionNumber}`
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "PDF generation failed";
    console.error("[estimate-pdf]", estimateId, error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
