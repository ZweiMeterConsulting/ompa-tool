// components/wizard/WizardShell.tsx

"use client";

import { useWizardNavigation } from "../../hooks/useWizardNavigation";
import { VariantProvider } from "../../context/VariantContext";
import { WizardStepRenderer } from "./WizardStepRenderer";
import { WizardFooterNav } from "./WizardFooterNav";
import { WizardProgressBar } from "./WizardProgressBar";
import type { OmpaVariantConfig } from "../../types/variant";
import type { WizardState } from "../../types/wizard";

interface WizardShellProps {
  variant?: OmpaVariantConfig;
  initialCouponCode?: string | null;
  initialState?: WizardState | null;
}

export function WizardShell({
  variant,
  initialCouponCode,
  initialState,
}: WizardShellProps) {
  const {
    state,
    steps,
    currentStep,
    canGoBack,
    canGoNext,
    goBack,
    goNext,
    setAnswer,
    setPriority,
    setBranch,
    setLeadData,
    setStripeSession,
    completeGate,
    setCoupon,
  } = useWizardNavigation(variant, initialCouponCode, initialState);

  // Varianten-Label für Header
  const variantLabel = variant?.label ?? "OMPA 2.0";

  const content = (
    <div className="ompa-wizard min-h-screen bg-black text-gray-100">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Logo */}
        <header className="flex justify-center mb-4">
          <img
            src="/zweimeter-consulting-logo.png"
            alt="Zweimeter Consulting Logo"
            className="h-16 md:h-20 object-contain"
          />
        </header>

        {/* Varianten-Badge */}
        {variant && (
          <div className="flex justify-center">
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold",
                variant.id === "light"
                  ? "bg-emerald-900/50 border border-emerald-700 text-emerald-300"
                  : variant.id === "medium"
                    ? "bg-amber-900/50 border border-amber-700 text-amber-300"
                    : "bg-purple-900/50 border border-purple-700 text-purple-300",
              ].join(" ")}
            >
              {variant.id === "heavy" && "★ "}
              {variantLabel}
              {variant.priceNet > 0 && ` · ${variant.priceLabel}`}
            </span>
          </div>
        )}

        {/* Progress-Bar */}
        <header>
          <WizardProgressBar
            currentStep={currentStep}
            state={state}
            steps={steps}
          />
        </header>

        {/* Inhalt */}
        <main className="rounded-2xl border border-gray-800 bg-gray-950 p-6">
          <WizardStepRenderer
            step={currentStep}
            state={state}
            onChangeAnswer={setAnswer}
            onChangePriority={setPriority}
            onSelectBranch={setBranch}
            onSubmitEmail={setLeadData}
            onPaymentComplete={setStripeSession}
            onCompleteGate={completeGate}
            onCouponChange={setCoupon}
          />
        </main>

        {/* Navigation */}
        <footer>
          <WizardFooterNav
            currentStep={currentStep}
            state={state}
            canGoBack={canGoBack}
            canGoNext={canGoNext}
            onBack={goBack}
            onNext={goNext}
            onValidate={() => {}}
          />
        </footer>
      </div>
    </div>
  );

  // In VariantProvider einwickeln, wenn Variante vorhanden
  if (variant) {
    return <VariantProvider variant={variant}>{content}</VariantProvider>;
  }

  return content;
}
