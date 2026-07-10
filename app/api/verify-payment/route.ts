// app/api/verify-payment/route.ts

import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/verify-payment
 *
 * Verifiziert eine Stripe Checkout Session nach dem Redirect.
 * Wird vom Wizard aufgerufen, wenn ?payment=success&session_id=... in der URL steht.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body as { sessionId: string };

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Keine Session-ID übergeben." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── Entwicklungsmodus: Simulation akzeptieren ───
    // create-checkout erzeugt Session-IDs mit Präfix "dev_sim_"; hier
    // müssen exakt dieselben Präfixe akzeptiert werden. Zusätzlich werden
    // per 100%-Coupon freigeschaltete Reports ("coupon_free_...") anerkannt.
    if (
      sessionId.startsWith("dev_sim_") ||
      sessionId.startsWith("coupon_free_")
    ) {
      console.log("[STRIPE] Entwicklungsmodus: Simulierte Zahlung akzeptiert.");
      return new Response(
        JSON.stringify({ verified: true, mode: "simulated" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ─── Produktion: Stripe-Session verifizieren ───
    //
    // const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    // if (!stripeSecretKey) {
    //   return new Response(
    //     JSON.stringify({ error: "Stripe nicht konfiguriert." }),
    //     { status: 503 }
    //   );
    // }
    //
    // import Stripe from "stripe";
    // const stripe = new Stripe(stripeSecretKey);
    // const session = await stripe.checkout.sessions.retrieve(sessionId);
    //
    // if (session.payment_status === "paid") {
    //   return new Response(
    //     JSON.stringify({
    //       verified: true,
    //       customerEmail: session.customer_details?.email,
    //     }),
    //     { status: 200, headers: { "Content-Type": "application/json" } }
    //   );
    // }
    //
    // return new Response(
    //   JSON.stringify({ verified: false, reason: "Zahlung nicht abgeschlossen." }),
    //   { status: 402, headers: { "Content-Type": "application/json" } }
    // );

    return new Response(
      JSON.stringify({ error: "Stripe-Verifizierung noch nicht aktiv." }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[STRIPE] Verifizierungsfehler:", error);
    return new Response(
      JSON.stringify({ error: "Fehler bei der Zahlungsverifizierung." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
