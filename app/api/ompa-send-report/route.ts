// app/api/ompa-send-report/route.ts

import type { NextRequest } from "next/server";
import { generateReportPdf } from "@/lib/reportPdf";
import type { WizardState } from "@/types/wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ompa-send-report
 *
 * Generiert den OMPA-Report als PDF und verschickt ihn als Anhang per
 * E-Mail über die Brevo-Transaktions-API (/v3/smtp/email).
 *
 * Payload: { state: WizardState, email?: string }
 * - Ohne explizite `email` wird die Adresse aus state.leadData verwendet
 *   (E-Mail-Gate der Light-Variante).
 *
 * Konfiguration über Umgebungsvariablen:
 * - BREVO_API_KEY        (Pflicht, gleicher Key wie Lead-Erfassung)
 * - BREVO_SENDER_EMAIL   (optional, Standard: robert@zweimeter.online —
 *                         muss in Brevo als Absender verifiziert sein)
 * - BREVO_SENDER_NAME    (optional, Standard: "Robert | zweimeter.online")
 */

interface SendReportPayload {
  state?: WizardState;
  email?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildEmailHtml(firstName: string, variantId: string): string {
  const anrede = firstName ? `Hallo ${firstName}` : "Hallo";
  const variante = variantId.charAt(0).toUpperCase() + variantId.slice(1);
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a2e; line-height: 1.6; max-width: 560px;">
    <p>${anrede},</p>
    <p>
      anbei dein persönlicher <strong>OMPA-${variante}-Report</strong> als PDF —
      deine Online-Marketing-Potential-Analyse mit dem Handlungsbedarf in allen
      Themenbereichen.
    </p>
    <p>
      Nimm dir zehn Minuten, schau dir die Blöcke mit dem höchsten
      Handlungsbedarf an und entscheide, wo du zuerst ansetzt.
    </p>
    <p>
      Fragen zu deinem Ergebnis? Antworte einfach auf diese E-Mail.
    </p>
    <p>
      Viele Grüße<br>
      Robert-Alexander Sonnenberger<br>
      <a href="https://zweimeter.online" style="color: #0028B3;">zweimeter.online</a>
      &nbsp;|&nbsp; Online-Marketing. Klartext. Ergebnisse.
    </p>
  </div>`;
}

export async function POST(request: NextRequest) {
  let body: SendReportPayload;

  try {
    body = (await request.json()) as SendReportPayload;
  } catch {
    return json({ error: "Ungültiger Request-Body." }, 400);
  }

  const state = body.state;
  if (!state || !state.currentStepId) {
    return json({ error: "Missing state" }, 400);
  }

  // ─── Empfängeradresse bestimmen: explizit > E-Mail-Gate ───
  const email = (body.email ?? state.leadData?.email ?? "").trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return json({ error: "Keine gültige E-Mail-Adresse vorhanden." }, 400);
  }

  const firstName = state.leadData?.firstName?.trim() ?? "";

  // ─── Konfiguration prüfen ───
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error(
      "[OMPA-SEND][NOT-CONFIGURED] BREVO_API_KEY fehlt – Report-Versand nicht möglich:",
      email
    );
    return json({ success: false, reason: "brevo_not_configured" }, 503);
  }

  const senderEmail =
    process.env.BREVO_SENDER_EMAIL ?? "robert@zweimeter.online";
  const senderName =
    process.env.BREVO_SENDER_NAME ?? "Robert | zweimeter.online";

  try {
    // ─── 1) PDF generieren (gleiche Logik wie der Download) ───
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const pdfBuffer = await generateReportPdf(state, origin);
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    const variantId = state.variantId ?? "light";
    const filename = `OMPA-${variantId}-Report.pdf`;

    // ─── 2) E-Mail über Brevo-Transaktions-API verschicken ───
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email, ...(firstName ? { name: firstName } : {}) }],
        subject: "Dein OMPA-Report ist da",
        htmlContent: buildEmailHtml(firstName, variantId),
        attachment: [{ name: filename, content: pdfBase64 }],
        tags: ["ompa-report", `ompa-${variantId}`],
      }),
      // Verhindert, dass ein hängender Brevo-Aufruf die Function blockiert
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        messageId?: string;
      };
      console.log(
        `[OMPA-SEND] Report verschickt an ${email} · Variante ${variantId} · messageId ${data.messageId ?? "?"}`
      );
      return json({ success: true, sent: true }, 200);
    }

    const detail = await res.text().catch(() => "");
    console.error(
      `[OMPA-SEND][SEND-FAILED] Brevo ${res.status}: ${detail} – Empfänger: ${email}`
    );
    return json({ success: false, reason: "brevo_error" }, 502);
  } catch (error) {
    console.error(
      `[OMPA-SEND][SEND-FAILED] Fehler beim Generieren/Versenden – Empfänger: ${email}`,
      error
    );
    return json({ success: false, reason: "internal_error" }, 500);
  }
}
