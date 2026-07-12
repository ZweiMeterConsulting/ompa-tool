// app/api/create-checkout/route.ts

import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, getPriceIdForVariant } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/create-checkout
 *
 * Erstellt eine Stripe Checkout Session für OMPA Medium oder Heavy
 * (Light ist im Standard-Flow kostenlos via E-Mail-Gate).
 *
 * Erwartet im Body:
 * - variantId: "light" | "medium" | "heavy"
 * - couponCode: string | null (interner Coupon-Code)
 * - stripeCouponId: string | null (Stripe-Coupon-ID)
 *
 * Umgebungsvariablen:
 * - STRIPE_SECRET_KEY
 * - STRIPE_PRICE_ID_LIGHT   (optional)
 * - STRIPE_PRICE_ID_MEDIUM
 * - STRIPE_PRICE_ID_HEAVY
 *
 * Steuer: Stripe Tax (automatic_tax) ist aktiviert. Die Preise sind als
 * netto (tax_behavior=exclusive) angelegt; Stripe rechnet die USt. je nach
 * Kundenland auf und weist sie separat aus. Dafür wird die Rechnungsadresse
 * im Checkout erhoben.
 */

interface CheckoutRequestBody {
  variantId: string;
  couponCode?: string | null;
  stripeCouponId?: string | null;
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Baut die öffentliche Origin robust hinter dem Reverse-Proxy (Coolify/Traefik)
 * zusammen: `x-forwarded-proto` + `host` schlagen `request.url` (interne URL).
 */
function publicOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;

  return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutRequestBody = await request.json();
    const { variantId, couponCode, stripeCouponId } = body;

    const stripe = getStripe();

    // ─── Stripe nicht konfiguriert ───
    if (!stripe) {
      console.warn("[STRIPE] STRIPE_SECRET_KEY nicht gesetzt.");

      // Lokaler Entwicklungsmodus: Checkout simulieren, damit der Flow ohne
      // Keys durchgetestet werden kann.
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[STRIPE-DEV] Simuliert: ${variantId}` +
            (couponCode ? ` + Coupon "${couponCode}"` : "")
        );
        const origin = publicOrigin(request);
        return json(
          {
            url: `${origin}/wizard?variant=${variantId}&payment=success&session_id=dev_sim_${Date.now()}`,
            sessionId: `dev_sim_${Date.now()}`,
            mode: "simulated",
          },
          200
        );
      }

      return json({ error: "Bezahlung ist aktuell nicht verfügbar." }, 503);
    }

    // ─── Preis-ID auflösen ───
    const priceId = getPriceIdForVariant(variantId);
    if (!priceId) {
      console.error(`[STRIPE] Preis-ID für "${variantId}" nicht konfiguriert.`);
      return json(
        { error: `Preis-ID für "${variantId}" ist nicht konfiguriert.` },
        500
      );
    }

    const origin = publicOrigin(request);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // Stripe Tax: USt. automatisch berechnen und ausweisen
      automatic_tax: { enabled: true },
      // Für automatic_tax wird eine Rechnungsadresse benötigt
      billing_address_collection: "required",
      success_url: `${origin}/wizard?variant=${variantId}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/wizard?variant=${variantId}&payment=cancelled`,
      locale: "de",
      metadata: {
        ompa_variant: variantId,
        coupon_code: couponCode ?? "",
      },
      // Entweder ein fest übergebener Coupon ODER manuelle Promo-Code-Eingabe,
      // beides zugleich lehnt Stripe ab.
      ...(stripeCouponId
        ? { discounts: [{ coupon: stripeCouponId }] }
        : { allow_promotion_codes: true }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({ url: session.url, sessionId: session.id }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler.";
    console.error("[STRIPE] Checkout-Fehler:", message);
    return json({ error: "Fehler beim Erstellen der Checkout-Session." }, 500);
  }
}
