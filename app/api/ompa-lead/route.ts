// app/api/ompa-lead/route.ts

import type { NextRequest } from "next/server";

export const runtime = "nodejs";

interface LeadPayload {
  firstName: string;
  email: string;
  company?: string;
  variant: string;
  timestamp: string;
}

/**
 * POST /api/ompa-lead
 *
 * Empfängt Lead-Daten aus dem E-Mail-Gate der OMPA Light und legt den
 * Kontakt in Brevo an (bzw. aktualisiert ihn) und ordnet ihn der
 * OMPA-Leadliste zu.
 *
 * Konfiguration über Umgebungsvariablen:
 * - BREVO_API_KEY        (Pflicht für echte Erfassung)
 * - BREVO_LIST_ID_OMPA   (optional: Ziel-Liste, numerische ID)
 *
 * Wichtig: Die Lead-Erfassung darf den Report NIE blockieren. Schlägt der
 * Brevo-Aufruf fehl oder ist der Key nicht gesetzt, wird der vollständige
 * Lead mit einem eindeutigen Marker geloggt (recover-/alertbar) und dem
 * Client trotzdem `success` gemeldet.
 */
export async function POST(request: NextRequest) {
  let body: LeadPayload;

  try {
    body = (await request.json()) as LeadPayload;
  } catch {
    return json({ error: "Ungültiger Request-Body." }, 400);
  }

  // ─── Basis-Validierung ───
  if (!body.email || !body.firstName) {
    return json({ error: "Vorname und E-Mail sind Pflichtfelder." }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return json({ error: "Ungültige E-Mail-Adresse." }, 400);
  }

  const lead = {
    firstName: body.firstName,
    email: body.email,
    company: body.company ?? "",
    variant: body.variant ?? "light",
    timestamp: body.timestamp ?? new Date().toISOString(),
  };

  const apiKey = process.env.BREVO_API_KEY;
  const listIdRaw = process.env.BREVO_LIST_ID_OMPA;
  const listId = listIdRaw ? Number(listIdRaw) : undefined;

  // ─── Brevo nicht konfiguriert → Lead sichtbar loggen, UX nicht blockieren ───
  if (!apiKey) {
    console.error(
      "[OMPA-LEAD][NOT-CONFIGURED] BREVO_API_KEY fehlt – Lead NICHT erfasst:",
      JSON.stringify(lead)
    );
    return json({ success: true, captured: false, reason: "brevo_not_configured" }, 200);
  }

  // ─── Kontakt in Brevo anlegen/aktualisieren ───
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: lead.email,
        attributes: {
          VORNAME: lead.firstName,
          UNTERNEHMEN: lead.company,
          OMPA_VARIANTE: lead.variant,
          OMPA_ANMELDUNG: lead.timestamp,
        },
        // Bestehende Kontakte aktualisieren statt mit 400 zu scheitern
        updateEnabled: true,
        ...(listId && !Number.isNaN(listId) ? { listIds: [listId] } : {}),
      }),
      // Verhindert, dass ein hängender Brevo-Aufruf das Gate blockiert
      signal: AbortSignal.timeout(8000),
    });

    // 201 = neu angelegt, 204 = aktualisiert → beides Erfolg
    if (res.ok) {
      console.log(
        `[OMPA-LEAD] Erfasst (${res.status}): ${lead.email} · Variante ${lead.variant}`
      );
      return json({ success: true, captured: true }, 200);
    }

    // Nicht-2xx: vollständigen Lead loggen, damit nichts verloren geht
    const detail = await res.text().catch(() => "");
    console.error(
      `[OMPA-LEAD][CAPTURE-FAILED] Brevo ${res.status}: ${detail} – Lead:`,
      JSON.stringify(lead)
    );
    return json({ success: true, captured: false, reason: "brevo_error" }, 200);
  } catch (error) {
    console.error(
      "[OMPA-LEAD][CAPTURE-FAILED] Netzwerk-/Timeout-Fehler – Lead:",
      JSON.stringify(lead),
      error
    );
    return json({ success: true, captured: false, reason: "brevo_unreachable" }, 200);
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
