// hooks/useWizardNavigation.ts

"use client";

import { useState, useMemo } from "react";
import { buildWizardSteps, OMPA_WIZARD_STEPS } from "../config/ompaWizardSteps";
import type { WizardState, WizardStepId, BranchId } from "../types/wizard";
import type { OmpaVariantConfig } from "../types/variant";

/**
 * Zentraler Hook für die Wizard-Navigation.
 *
 * Wenn eine Variante übergeben wird, werden die Steps dynamisch
 * auf Basis der Varianten-Konfiguration gebaut. Ohne Variante
 * wird der statische Fallback (OMPA_WIZARD_STEPS) verwendet.
 */
export function useWizardNavigation(variant?: OmpaVariantConfig, initialCouponCode?: string | null) {
  // Steps berechnen: dynamisch oder statischer Fallback
  const steps = useMemo(() => {
    if (variant) return buildWizardSteps(variant, initialCouponCode);
    return OMPA_WIZARD_STEPS;
  }, [variant, initialCouponCode]);

  const [state, setState] = useState<WizardState>({
    variantId: variant?.id ?? "light",
    currentStepId: steps[0].id,
    visitedSteps: [steps[0].id],
    answers: {},
    priorities: {},
    selectedBranch: null,
    leadData: null,
    stripeSessionId: null,
    gateCompleted: false,
    couponCode: initialCouponCode ?? null,
  });

  const currentIndex = steps.findIndex(
    (s) => s.id === state.currentStepId
  );

  const currentStep = steps[currentIndex];

  const goToStep = (stepId: WizardStepId) => {
    setState((prev) => ({
      ...prev,
      currentStepId: stepId,
      visitedSteps: Array.from(new Set([...prev.visitedSteps, stepId])),
    }));
  };

  const goNext = () => {
    const next = steps[currentIndex + 1];
    if (next) goToStep(next.id);
  };

  const goBack = () => {
    const prev = steps[currentIndex - 1];
    if (prev) goToStep(prev.id);
  };

  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < steps.length - 1;

  // Antwort setzen (Slider-Wert 0–100)
  const setAnswer = (questionNr: number, value: number) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionNr]: value,
      },
    }));
  };

  // Priorität setzen (1–4)
  const setPriority = (questionNr: number, value: 1 | 2 | 3 | 4) => {
    setState((prev) => ({
      ...prev,
      priorities: {
        ...prev.priorities,
        [questionNr]: value,
      },
    }));
  };

  // Branche setzen
  const setBranch = (branchId: BranchId) => {
    setState((prev) => ({
      ...prev,
      selectedBranch: branchId,
    }));
  };

  // Lead-Daten setzen (E-Mail-Gate)
  const setLeadData = (data: WizardState["leadData"]) => {
    setState((prev) => ({
      ...prev,
      leadData: data,
      gateCompleted: true,
    }));
  };

  // Stripe Session-ID setzen (Payment-Gate)
  const setStripeSession = (sessionId: string) => {
    setState((prev) => ({
      ...prev,
      stripeSessionId: sessionId,
      gateCompleted: true,
    }));
  };

  // Gate als abgeschlossen markieren
  const completeGate = () => {
    setState((prev) => ({
      ...prev,
      gateCompleted: true,
    }));
  };

  // Coupon-Code setzen
  const setCoupon = (code: string | null) => {
    setState((prev) => ({
      ...prev,
      couponCode: code,
    }));
  };

  return {
    state,
    steps,
    currentStep,
    currentIndex,
    totalSteps: steps.length,
    canGoBack,
    canGoNext,
    goNext,
    goBack,
    goToStep,
    setAnswer,
    setPriority,
    setBranch,
    setLeadData,
    setStripeSession,
    completeGate,
    setCoupon,
  };
}
