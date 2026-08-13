import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { getMaterialSelectionSheet } from "@/lib/material-selection-sheets-db";
import {
  generateMaterialSelectionPrintPdfBuffer,
  materialSelectionPrintPdfFilename,
} from "@/lib/material-selection-print-pdf";
import { resolveServerAppOrigin } from "@/lib/server-app-origin";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, message: "Supabase privileged server client is not configured." },
      { status: 503 }
    );
  }

  const { id: rawId } = await ctx.params;
  const selectionId = rawId?.trim();
  if (!selectionId) {
    return NextResponse.json({ ok: false, message: "Missing selection id." }, { status: 400 });
  }

  const selection = await getMaterialSelectionSheet(selectionId, supabase);
  if (!selection) {
    return NextResponse.json(
      { ok: false, message: "Material selection not found." },
      { status: 404 }
    );
  }

  try {
    const pdfBuffer = await generateMaterialSelectionPrintPdfBuffer({
      selectionId,
      origin: resolveServerAppOrigin(request),
      cookieHeader: request.headers.get("cookie"),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${materialSelectionPrintPdfFilename(
          selection.selectionNumber,
          selection.title
        )}"`,
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
