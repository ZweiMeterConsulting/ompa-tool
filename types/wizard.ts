// types/wizard.ts

import type { OmpaVariantId } from "./variant";

/**
 * Alle möglichen Schritt-IDs im Wizard.
 *
 * Neu hinzugekommen:
 * - "branch_select" → Branchenauswahl (Medium/Heavy)
 * - "email_gate"    → E-Mail-Erfassung vor Report (Light)
 * - "payment_gate"  → Stripe-Bezahlung vor Report (Medium/Heavy)
 */
export type WizardStepId =
  | "intro"
  | "branch_select"
  | "block_1"
  | "block_2"
  | "block_3"
  | "block_4"
  | "block_5"
  | "block_6"
  | "block_7"
  | "block_8"
  | "block_9"
  | "block_10"
  | "email_gate"
  | "payment_gate"
  | "summary";

/**
 * Schritt-Typen im Wizard.
 *
 * - "intro"          → Willkommensseite
 * - "branch_select"  → Branchenauswahl (nur Medium/Heavy)
 * - "block"          → Fragenblock mit Slidern
 * - "email_gate"     → E-Mail-Eingabe (Light)
 * - "payment_gate"   → Stripe-Checkout (Medium/Heavy nach letztem Block)
 * - "summary"        → Ergebnis-Report
 */
export type WizardStepType =
  | "intro"
  | "branch_select"
  | "block"
  | "email_gate"
  | "payment_gate"
  | "summary";

/**
 * Konfiguration eines einzelnen Wizard-Schritts.
 */
export interface WizardStepConfig {
  id: WizardStepId;
  type: WizardStepType;
  title: string;
  subtitle?: string;
  isSkippable?: boolean;

  /** Referenz auf den passenden Fragenblock (ID aus OMPA_BLOCKS) */
  blockId?: string;

  /** Optionaler Validierungs-Hook für diesen Schritt */
  validate?: (state: WizardState) => {
    isValid: boolean;
    errors?: Record<string, string>;
  };
}

/**
 * Verfügbare Branchen für den Benchmark-Vergleich.
 */
export type BranchId =
  | "produzierendes_gewerbe"
  | "dienstleistung"
  | "handel"
  | "handwerk"
  | "it_software"
  | "sonstige";

/**
 * Zentraler Zustand des Wizards.
 */
export interface WizardState {
  /** Aktive OMPA-Variante – wird mitserialisiert, damit auch der
   *  PDF-Export (ohne VariantProvider) die richtige Variante kennt. */
  variantId: OmpaVariantId;

  currentStepId: WizardStepId;
  visitedSteps: WizardStepId[];

  /** Antworten: Frage-Nr (1–99) → Wert 0–100 */
  answers: Record<number, number>;

  /** Prioritäten: Frage-Nr → 1 | 2 | 3 | 4 */
  priorities: Record<number, 1 | 2 | 3 | 4>;

  /** Ausgewählte Branche für Benchmark (null = noch nicht gewählt) */
  selectedBranch: BranchId | null;

  /** E-Mail-Gate: Nutzerdaten (nur bei Light) */
  leadData: {
    firstName: string;
    email: string;
    company: string;
    privacyAccepted: boolean;
  } | null;

  /** Stripe-Payment: Session-ID nach erfolgreicher Zahlung */
  stripeSessionId: string | null;

  /** Wurde das Gate (E-Mail oder Stripe) erfolgreich durchlaufen? */
  gateCompleted: boolean;

  /** Aktiver Coupon-Code (aus URL-Parameter oder manueller Eingabe) */
  couponCode: string | null;
}

/**
 * Branchen-Optionen für die Auswahl im Wizard.
 */
export const BRANCH_OPTIONS: { id: BranchId; label: string }[] = [
  { id: "produzierendes_gewerbe", label: "Produzierendes Gewerbe / Industrie" },
  { id: "dienstleistung", label: "Dienstleistung / Beratung" },
  { id: "handel", label: "Handel (Groß- und Einzelhandel)" },
  { id: "handwerk", label: "Handwerk / Baugewerbe" },
  { id: "it_software", label: "IT / Software / Technologie" },
  { id: "sonstige", label: "Sonstige Branche" },
];
