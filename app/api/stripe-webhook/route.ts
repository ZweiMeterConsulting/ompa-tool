// app/api/stripe-webhook/route.ts

import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
// Rohen Body erzwingen – die Signaturprüfung braucht die unveränderten Bytes.
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe-webhook
 *
 * Serverseitige Bestätigung bezahlter Checkout-Sessions – unabhängig davon,
 * ob der Nutzer sauber in den Wizard zurückgeleitet wird. Verifiziert die
 * Stripe-Signatur gegen STRIPE_WEBHOOK_SECRET.
 *
 * Im Stripe-Dashboard als Endpoint eintragen:
 *   https://ompa.zweimeter.online/api/stripe-webhook
 * Abonnierte Events (Minimum): checkout.session.completed
 */

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    console.error("[STRIPE-WEBHOOK] Stripe oder Webhook-Secret nicht gesetzt.");
    return json({ error: "Webhook nicht konfiguriert." }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Fehlende Stripe-Signatur." }, 400);
  }

  // Rohen Body als Text lesen (nicht JSON-parsen!) – für die Signaturprüfung.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Signaturprüfung fehlgeschlagen.";
    console.error("[STRIPE-WEBHOOK] Ungültige Signatur:", message);
    return json({ error: "Ungültige Signatur." }, 400);
  }

  // ─── Events verarbeiten ───
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        console.log(
          `[STRIPE-WEBHOOK] Bezahlt: session=${session.id} · variant=${
            session.metadata?.ompa_variant ?? "?"
          } · coupon=${session.metadata?.coupon_code || "-"} · email=${
            session.customer_details?.email ?? "?"
          } · amount=${session.amount_total ?? "?"} ${(
            session.currency ?? ""
          ).toUpperCase()}`
        );
        // Erweiterbar: Verkauf persistieren, Rechnung/Report mailen,
        // Käufer als Brevo-Kontakt anlegen o. Ä.
      }
      break;
    }
    default:
      // Nicht abonnierte Events einfach quittieren.
      break;
  }

  return json({ received: true }, 200);
}
