// app/api/verify-payment/route.ts

import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/verify-payment
 *
 * Verifiziert eine Stripe Checkout Session nach dem Redirect zurück in den
 * Wizard (?payment=success&session_id=...). Gibt nur dann `verified: true`
 * zurück, wenn die Session tatsächlich bezahlt ist.
 */

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = (await request.json()) as { sessionId?: string };

    if (!sessionId) {
      return json({ error: "Keine Session-ID übergeben." }, 400);
    }

    // ─── Simulierte / kostenlose Freischaltungen ───
    // create-checkout erzeugt im Dev-Modus "dev_sim_"-IDs; 100%-Coupons
    // schalten ohne Stripe frei ("coupon_free_..."). Beide gelten als gültig.
    if (
      sessionId.startsWith("dev_sim_") ||
      sessionId.startsWith("coupon_free_")
    ) {
      console.log("[STRIPE] Simulierte/kostenlose Zahlung akzeptiert.");
      return json({ verified: true, mode: "simulated" }, 200);
    }

    // ─── Produktion: echte Stripe-Session prüfen ───
    const stripe = getStripe();
    if (!stripe) {
      return json({ error: "Stripe ist nicht konfiguriert." }, 503);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      return json(
        {
          verified: true,
          customerEmail: session.customer_details?.email ?? null,
          variant: session.metadata?.ompa_variant ?? null,
        },
        200
      );
    }

    return json(
      { verified: false, reason: "Zahlung nicht abgeschlossen." },
      402
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler.";
    console.error("[STRIPE] Verifizierungsfehler:", message);
    return json({ error: "Fehler bei der Zahlungsverifizierung." }, 500);
  }
}
