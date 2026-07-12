// lib/stripe.ts

import Stripe from "stripe";

/**
 * Zentraler Stripe-Client.
 *
 * Wird lazy instanziiert, damit ein fehlender `STRIPE_SECRET_KEY` nicht beim
 * Import crasht, sondern die aufrufende Route sauber mit einer klaren Meldung
 * antworten kann (z. B. 503 statt 500).
 *
 * apiVersion wird bewusst nicht gesetzt → die im installierten SDK gepinnte
 * Version wird verwendet, was Versionskonflikte vermeidet.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

/**
 * Mappt eine OMPA-Variante auf die zugehörige Stripe-Preis-ID aus den
 * Umgebungsvariablen. Light ist im Standard-Flow kostenlos (E-Mail-Gate) und
 * daher optional.
 */
export function getPriceIdForVariant(variantId: string): string | undefined {
  const map: Record<string, string | undefined> = {
    light: process.env.STRIPE_PRICE_ID_LIGHT,
    medium: process.env.STRIPE_PRICE_ID_MEDIUM,
    heavy: process.env.STRIPE_PRICE_ID_HEAVY,
  };
  return map[variantId];
}
