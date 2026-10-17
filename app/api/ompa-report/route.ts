// app/api/ompa-report/route.ts
import type { NextRequest } from "next/server";
import { generateReportPdf } from "@/lib/reportPdf";
import type { WizardState } from "@/types/wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // 1) Body lesen
    const body = (await request.json()) as any;

    // akzeptiere mehrere Payload-Formen
    const state: WizardState | undefined =
      body?.state ??
      body?.wizardState ??
      body?.data ??
      (body?.currentStepId ? body : undefined);

    if (!state) {
      console.error("[OMPA-PDF] Missing state in request body. Keys:", Object.keys(body ?? {}));
      return new Response("Missing state", { status: 400 });
    }

    // 2) Origin bestimmen
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    // 3) PDF bauen (gemeinsame Logik in lib/reportPdf.ts)
    const pdfBuffer = await generateReportPdf(state, origin);

    // 4) Response
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="ompa-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[OMPA-PDF] PDF generation error:", error);
    return new Response("Error generating PDF", { status: 500 });
  }
}
