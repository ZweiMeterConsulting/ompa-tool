// app/wizard/page.tsx

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { WizardShell } from "@/components/wizard/wizardShell";
import { getVariantConfig } from "@/config/ompaVariants";
import type { WizardState } from "@/types/wizard";
import type { OmpaVariantId } from "@/types/variant";

/** Leerer Default-State (Fallback, falls kein gespeicherter State existiert). */
function emptyState(variantId: OmpaVariantId, couponCode: string | null): WizardState {
  return {
    variantId,
    currentStepId: "intro",
    visitedSteps: ["intro"],
    answers: {},
    priorities: {},
    selectedBranch: null,
    leadData: null,
    stripeSessionId: null,
    gateCompleted: false,
    couponCode,
  };
}

/** Liest den vor dem Stripe-Redirect gesicherten Wizard-State (nur clientseitig). */
function readSavedState(): WizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem("ompa_wizard_state");
    return raw ? (JSON.parse(raw) as WizardState) : null;
  } catch {
    return null;
  }
}

/**
 * Innere Komponente – darf useSearchParams() verwenden.
 */
function WizardPageInner() {
  const searchParams = useSearchParams();
  const variantParam = searchParams.get("variant");
  const couponParam = searchParams.get("coupon");
  const paymentParam = searchParams.get("payment");
  const sessionIdParam = searchParams.get("session_id");

  const variant = getVariantConfig(variantParam);

  const isSuccessReturn = paymentParam === "success" && !!sessionIdParam;
  const isCancelledReturn = paymentParam === "cancelled";
  const isPaymentReturn = isSuccessReturn || isCancelledReturn;

  // "resolving" solange verifiziert/wiederhergestellt wird; danach "ready".
  const [phase, setPhase] = useState<"resolving" | "ready">(
    isPaymentReturn ? "resolving" : "ready"
  );
  const [initialState, setInitialState] = useState<WizardState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isPaymentReturn) return;
    let aborted = false;

    (async () => {
      // ── Abgebrochene Zahlung: Antworten wiederherstellen, zurück ans Gate ──
      if (isCancelledReturn) {
        const saved = readSavedState() ?? emptyState(variant.id, couponParam);
        if (aborted) return;
        setInitialState(saved);
        setNotice(
          "Die Zahlung wurde abgebrochen. Deine Antworten sind gesichert – du kannst den Kauf jederzeit erneut starten."
        );
        setPhase("ready");
        return;
      }

      // ── Erfolgreiche Rückkehr: Zahlung serverseitig verifizieren ──
      try {
        const res = await fetch("/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdParam }),
        });
        const data = await res.json().catch(() => ({}));
        if (aborted) return;

        if (res.ok && data.verified) {
          const saved = readSavedState() ?? emptyState(variant.id, couponParam);
          setInitialState({
            ...saved,
            variantId: variant.id,
            currentStepId: "summary",
            gateCompleted: true,
            stripeSessionId: sessionIdParam,
          });
        } else {
          // Nicht verifiziert: Antworten wiederherstellen, am Gate bleiben.
          const saved = readSavedState() ?? emptyState(variant.id, couponParam);
          setInitialState(saved);
          setNotice(
            "Die Zahlung konnte nicht bestätigt werden. Falls Geld abgebucht wurde, melde dich bitte – wir klären das umgehend."
          );
        }
      } catch {
        if (aborted) return;
        const saved = readSavedState() ?? emptyState(variant.id, couponParam);
        setInitialState(saved);
        setNotice(
          "Die Zahlungsprüfung ist fehlgeschlagen. Bitte versuche es erneut."
        );
      } finally {
        if (!aborted) setPhase("ready");
      }
    })();

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ladeanzeige während Verifizierung/Wiederherstellung
  if (phase === "resolving") {
    return (
      <main className="min-h-screen bg-slate-950 text-gray-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-3xl animate-pulse">⏳</div>
          <p className="text-sm text-gray-300">
            Zahlung wird geprüft – einen Moment bitte…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-gray-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-indigo-400">
            Schritt-für-Schritt-Analyse
          </p>

          <h1 className="text-2xl font-bold">
            {variant.label} – Online-Marketing-Potenzialanalyse
          </h1>

          <p className="text-sm text-gray-400">
            {variant.id === "light"
              ? "Beantworte 20 Kernfragen und erhalte deinen kostenlosen Schnellcheck."
              : "Beantworte die folgenden Fragen, um deinen aktuellen Online-Marketing-Status inklusive Handlungsbedarf und Reifegrad auszuwerten."}
          </p>
        </header>

        {notice && (
          <div className="rounded-xl border border-amber-700/60 bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        )}

        <section>
          <WizardShell
            variant={variant}
            initialCouponCode={initialState?.couponCode ?? couponParam}
            initialState={initialState}
          />
        </section>
      </div>
    </main>
  );
}

/**
 * Wizard-Seite mit Suspense-Boundary für useSearchParams().
 */
export default function WizardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-gray-100 flex items-center justify-center">
          <p className="text-sm text-gray-400">Wizard wird geladen…</p>
        </main>
      }
    >
      <WizardPageInner />
    </Suspense>
  );
}
