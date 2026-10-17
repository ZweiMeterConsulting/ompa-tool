// components/wizard/ResultSummary.tsx
"use client";

import { useState } from "react";
import type { WizardState } from "../../types/wizard";
import { OMPA_BLOCKS } from "../../config/ompaBlocks";
import {
  calculateBlockScore,
  getTopRecommendations,
  getProfileBalance,
} from "../../utils/calcResults";
import RadarChart from "../RadarChart";
import { getBenchmarkForBranch } from "../../config/ompaBenchmarks";
import { UpsellSection } from "./UpsellSection";
import { getVariantConfig } from "../../config/ompaVariants";

// ── Hilfsfunktionen ──

function getBlockRecommendation(title: string, need: number): string {
  if (need >= 70) {
    return `Hier besteht akuter Handlungsbedarf – „${title}" sollte kurzfristig priorisiert werden. Fokus: schnell wirksame Maßnahmen und klare Verantwortlichkeiten.`;
  }
  if (need >= 40) {
    return `Mittlerer Handlungsbedarf – „${title}" sollte in den nächsten 3–6 Monaten systematisch ausgebaut werden. Plane konkrete Maßnahmenpakete und Meilensteine ein.`;
  }
  if (need > 0) {
    return `Geringer Handlungsbedarf – „${title}" ist solide aufgestellt. Regelmäßiges Monitoring und kleinere Optimierungen reichen aktuell aus.`;
  }
  return `Aktuell kein Handlungsbedarf – „${title}" kann als Stärke genutzt werden. Baue hier Referenzen und Best Practices für Marketing & Vertrieb auf.`;
}

function getOverallLabel(need: number) {
  if (need >= 70) {
    return {
      label: "Sehr hoher Handlungsbedarf",
      badge: "bg-red-900/60 border border-red-600/60 text-red-300",
    };
  }
  if (need >= 40) {
    return {
      label: "Mittlerer Handlungsbedarf",
      badge: "bg-amber-900/60 border border-amber-600/60 text-amber-300",
    };
  }
  return {
    label: "Geringer Handlungsbedarf",
    badge: "bg-emerald-900/60 border border-emerald-600/60 text-emerald-300",
  };
}

// ── Hauptkomponente ──

type ResultSummaryProps = {
  wizardState: WizardState;
  pdfMode?: boolean;
};

export default function ResultSummary({
  wizardState,
  pdfMode = false,
}: ResultSummaryProps) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // ── E-Mail-Versand des Reports ──
  const knownEmail = wizardState.leadData?.email ?? "";
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "input" | "sending" | "sent" | "error"
  >("idle");
  const [manualEmail, setManualEmail] = useState("");

  // Varianten-Konfiguration direkt aus dem Wizard-State ableiten.
  // Wichtig: Der PDF-Export rendert diese Komponente über /ompa-report
  // OHNE VariantProvider – deshalb darf die Variante nicht aus dem
  // React-Context kommen (der sonst immer auf "light" zurückfällt),
  // sondern muss aus dem mitserialisierten State stammen.
  const variant = getVariantConfig(wizardState.variantId);
  const report = variant.report;

  // ── Block-Ergebnisse berechnen ──
  const blockResults = OMPA_BLOCKS.map((block) => {
    const res = calculateBlockScore(block, wizardState);
    return {
      id: block.id,
      index: block.index,
      title: block.title,
      ...res,
    };
  });

  // Handlungsbedarf pro Block.
  // calculateBlockScore liefert `percent` bereits als Handlungsbedarf
  // (0 = kein Bedarf … 100 = maximaler Bedarf), NICHT als Reifegrad.
  // Deshalb wird der Wert direkt übernommen und nicht (wie früher)
  // fälschlich noch einmal invertiert.
  const radarData = blockResults.map((b, idx) => {
    const need = Math.max(0, Math.min(100, (b as any).percent ?? 0));
    return {
      subject: `${idx + 1}. ${b.title}`,
      need,
      fullMark: 100,
    };
  });

  // Gesamtwerte
  const overallNeed = Math.round(
    radarData.reduce((sum, item) => sum + item.need, 0) / radarData.length
  );
  const overallMaturity = 100 - overallNeed;
  const overallMeta = getOverallLabel(overallNeed);

  // Profil-Ausgeglichenheit
  const profileBalance = getProfileBalance(blockResults as any);

  // Blöcke sortiert nach Handlungsbedarf
  const blocksByNeed = radarData
    .map((item, idx) => ({
      index: idx + 1,
      title: item.subject,
      need: item.need,
    }))
    .sort((a, b) => b.need - a.need);

  // Top Handlungsfelder (Anzahl variiert je Variante)
  const topNeedBlocks = blocksByNeed.slice(0, report.maxRecommendations);

  // Stärkste Bereiche
  const topStrengthBlocks = blocksByNeed
    .map((b) => ({ ...b, maturity: 100 - b.need }))
    .filter((b) => b.maturity >= 75)
    .sort((a, b) => b.maturity - a.maturity)
    .slice(0, 5);

  // Top-Empfehlungen pro Frage
  const topRecommendations = getTopRecommendations(
    OMPA_BLOCKS as any,
    wizardState
  ).slice(0, report.maxRecommendations);

  // ── Benchmark-Daten (nur Medium/Heavy) ──
  const benchmark = report.benchmark
    ? getBenchmarkForBranch(wizardState.selectedBranch)
    : null;

  const benchmarkNeedValues = benchmark
    ? OMPA_BLOCKS.map((block) => {
        const maturity = benchmark.blockAverages[block.id] ?? 0;
        return Math.max(0, 100 - maturity);
      })
    : undefined;

  // ── CSV-Export ──
  function exportNeedCsv() {
    const header = ["Index", "Themenblock", "Handlungsbedarf_Prozent", "Reifegrad_Prozent"];
    const rows = blocksByNeed.map((b) => {
      const maturity = 100 - b.need;
      return [
        b.index.toString(),
        `"${b.title.replace(/"/g, '""')}"`,
        b.need.toFixed(0).replace(".", ","),
        maturity.toFixed(0).replace(".", ","),
      ].join(";");
    });
    const csv = [header.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ompa-${variant.id}-handlungsbedarf.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── PDF-Export ──
  async function exportPdf() {
    try {
      setIsExportingPdf(true);
      const res = await fetch("/api/ompa-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: wizardState }),
      });
      if (!res.ok) {
        console.error("PDF-Export fehlgeschlagen", await res.text());
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OMPA-${variant.id}-Ergebnis.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingPdf(false);
    }
  }

  // ── Report per E-Mail verschicken ──
  async function sendReportByEmail() {
    // Ohne bekannte Adresse (Medium/Heavy ohne E-Mail-Gate) erst Eingabe zeigen
    const targetEmail = (knownEmail || manualEmail).trim();
    if (!targetEmail) {
      setEmailStatus("input");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setEmailStatus("input");
      return;
    }

    try {
      setEmailStatus("sending");
      const res = await fetch("/api/ompa-send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: wizardState, email: targetEmail }),
      });
      if (!res.ok) {
        console.error("Report-Versand fehlgeschlagen", await res.text());
        setEmailStatus("error");
        return;
      }
      setEmailStatus("sent");
    } catch (error) {
      console.error("Report-Versand fehlgeschlagen", error);
      setEmailStatus("error");
    }
  }

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Premium-Badge (nur Heavy) ── */}
      {report.premiumBadge && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-purple-900/50 border border-purple-600 px-5 py-2 text-sm font-bold text-purple-200">
            ★ Premium-Analyse
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 1: Kopfbereich mit Gesamteindruck
          ══════════════════════════════════════════════════ */}
      {report.overallScore && (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            {pdfMode && (
              <p className="text-xs text-gray-400 mb-2">
                {variant.label} – Report • Erstellt am{" "}
                {new Date().toLocaleDateString("de-DE")}
              </p>
            )}
            <h1 className="text-[2.5rem] font-bold text-gray-100 mb-4">
              {variant.label} – Ergebnisübersicht
            </h1>
            <p className="text-[1rem] text-gray-300 leading-relaxed mb-8">
              {variant.id === "light"
                ? "Hier siehst du deinen Online-Marketing-Schnellcheck. Das Diagramm zeigt den Handlungsbedarf in allen 10 Themenbereichen – basierend auf deinen 20 Kernfragen."
                : "Unten siehst du eine Zusammenfassung deines aktuellen Online-Marketing-Status. Das Spinnendiagramm zeigt den Handlungsbedarf in den einzelnen Themenblöcken, die Liste darunter deine wichtigsten Baustellen nach Priorität."}
            </p>
          </div>

          {/* Export-Buttons (nicht im PDF) */}
          {!pdfMode && (
            <div className="flex flex-col items-end gap-2 print:hidden">
              <div className="flex flex-wrap gap-3 justify-end">
                {report.pdfExport && (
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={isExportingPdf}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-slate-600 px-4 py-2 text-xs font-semibold text-gray-100 hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {isExportingPdf ? "PDF wird erstellt…" : "PDF-Report herunterladen"}
                  </button>
                )}
                {report.pdfExport && (
                  <button
                    type="button"
                    onClick={sendReportByEmail}
                    disabled={emailStatus === "sending" || emailStatus === "sent"}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-slate-600 px-4 py-2 text-xs font-semibold text-gray-100 hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {emailStatus === "sending"
                      ? "Wird verschickt…"
                      : emailStatus === "sent"
                      ? "✓ Per E-Mail verschickt"
                      : "Report per E-Mail erhalten"}
                  </button>
                )}
                {report.csvExport && (
                  <button
                    type="button"
                    onClick={exportNeedCsv}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-slate-600 px-4 py-2 text-xs font-semibold text-gray-100 hover:bg-slate-800 transition"
                  >
                    CSV-Export
                  </button>
                )}
              </div>

              {/* E-Mail-Eingabe, wenn keine Adresse aus dem Gate bekannt ist */}
              {emailStatus === "input" && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="deine@email.de"
                    className="rounded-full border border-slate-600 bg-slate-900/70 px-4 py-2 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#fbb03b]/50"
                  />
                  <button
                    type="button"
                    onClick={sendReportByEmail}
                    className="inline-flex items-center gap-2 rounded-full bg-[#fbb03b] px-4 py-2 text-xs font-bold text-black hover:bg-[#fdd28a] transition"
                  >
                    Senden
                  </button>
                </div>
              )}

              {emailStatus === "sent" && (
                <p className="text-xs text-emerald-300">
                  Dein Report ist unterwegs an {(knownEmail || manualEmail).trim()}.
                </p>
              )}
              {emailStatus === "error" && (
                <p className="text-xs text-red-400">
                  Versand fehlgeschlagen – bitte versuch es später erneut oder
                  nutze den Download.
                </p>
              )}
            </div>
          )}

          {/* Score-Karten */}
          <div className="flex flex-col gap-3 items-stretch md:items-end min-w-[260px]">
            <div className="inline-flex items-center justify-between gap-4 rounded-full bg-gray-900/70 border border-gray-700 px-4 py-2">
              <div className="text-xs text-gray-400">OMPA-Gesamt-Handlungsbedarf</div>
              <div className="text-3xl font-bold text-[#fbb03b]">{overallNeed}%</div>
            </div>
            <div className={`inline-flex items-center justify-between gap-4 rounded-full px-4 py-2 ${overallMeta.badge}`}>
              <span className="text-xs text-gray-200">Einschätzung</span>
              <span className="text-sm font-semibold">{overallMeta.label}</span>
            </div>
            <div className="inline-flex items-center justify-between gap-4 rounded-full bg-gray-900/70 border border-gray-700 px-4 py-2">
              <div className="text-xs text-gray-400">Gesamt-Reifegrad</div>
              <div className="text-3xl font-bold text-emerald-300">{overallMaturity}%</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 2: Radar-Chart
          ══════════════════════════════════════════════════ */}
      {report.radarChart && (
        <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[2rem] font-bold text-gray-100">
              Handlungsbedarf je Themenblock
            </h2>
            {report.profileBalance && (
              <div className="flex flex-col items-end gap-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-900/70 border border-gray-700 px-3 py-1">
                  <span className="text-xs text-gray-400">Profil-Ausgeglichenheit</span>
                  <span className="text-sm font-semibold text-emerald-300">
                    {profileBalance.balanceScore}%
                  </span>
                </div>
                <div className="text-[0.8rem] text-gray-400">{profileBalance.label}</div>
              </div>
            )}
          </div>

          <p className="text-[1rem] text-gray-400 mt-2">
            Je weiter der Wert nach außen geht, desto größer der Handlungsbedarf
            im jeweiligen Themenblock.
            {benchmark
              ? ` Die blaue Linie zeigt den Durchschnitt der Branche „${benchmark.label}" (n=${benchmark.sampleSize}).`
              : " Ein gleichmäßig runder Verlauf deutet auf ein ausgewogenes Online-Marketing hin."}
          </p>

          <div className="w-full flex justify-center my-4">
            <div className="w-full max-w-[820px]">
              <RadarChart
                labels={radarData.map((item) => item.subject)}
                values={radarData.map((item) => item.need)}
                benchmarkValues={benchmarkNeedValues}
                benchmarkLabel={
                  benchmark
                    ? `Branchendurchschnitt: ${benchmark.label}`
                    : undefined
                }
              />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 3: Branchenvergleich (nur Medium/Heavy)
          ══════════════════════════════════════════════════ */}
      {report.benchmark && benchmark && (
        <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-100">
            Branchenvergleich: {benchmark.label}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            So schneidest du im Vergleich zu {benchmark.sampleSize} ähnlichen
            Unternehmen aus der Branche „{benchmark.label}" ab. Grün bedeutet:
            du bist besser als der Durchschnitt. Orange bedeutet: hier liegt
            Aufholpotenzial.
          </p>

          <div className="overflow-x-auto rounded-xl bg-slate-900/70 border border-slate-800">
            <table className="w-full text-sm text-left text-gray-200">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Themenblock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Dein Bedarf</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Branche ⌀</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Differenz</th>
                </tr>
              </thead>
              <tbody>
                {OMPA_BLOCKS.map((block, idx) => {
                  const userNeed = radarData[idx]?.need ?? 0;
                  const branchMaturity = benchmark.blockAverages[block.id] ?? 0;
                  const branchNeed = 100 - branchMaturity;
                  const diff = userNeed - branchNeed;
                  const isBetter = diff <= 0;

                  return (
                    <tr key={block.id} className="border-b border-slate-800/60 last:border-b-0">
                      <td className="px-4 py-2 text-sm text-gray-100">
                        {block.index}. {block.title}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-orange-300">
                        {userNeed.toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-blue-300">
                        {branchNeed.toFixed(0)}%
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${isBetter ? "text-emerald-400" : "text-orange-400"}`}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Achtung: Die Branchenwerte basieren auf Erfahrungswerten aus {benchmark.sampleSize} bisherigen
            Analysen und stellen keine wissenschaftlich erhobene Statistik dar.
          </p>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 4: Executive Summary (Top-N Baustellen + Stärken)
          ══════════════════════════════════════════════════ */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-100 mb-4">
          {variant.id === "light"
            ? "Deine Top-3-Handlungsfelder"
            : "Executive Summary"}
        </h2>

        {variant.id === "light" && (
          <p className="text-sm text-gray-400 mb-4">
            Die folgenden drei Themenbereiche haben den höchsten
            Handlungsbedarf. Für eine vollständige Analyse aller 10 Blöcke
            kannst du auf OMPA Medium upgraden.
          </p>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          {/* Größte Baustellen */}
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
            <h3 className="text-lg font-semibold text-gray-100 mb-3">
              Top {topNeedBlocks.length} Handlungsfelder
            </h3>
            {topNeedBlocks.length === 0 ? (
              <p className="text-sm text-gray-400">
                Aktuell wurden keine Handlungsfelder mit relevantem Handlungsbedarf identifiziert.
              </p>
            ) : (
              <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
                {topNeedBlocks.map((b) => (
                  <li key={b.index}>
                    <span className="font-semibold">{b.title}</span> – Handlungsbedarf{" "}
                    <span className="font-semibold">{b.need.toFixed(0)}%</span>.
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Diese Themenblöcke sollten in der Planung der nächsten 3–6 Monate
              priorisiert werden.
            </p>
          </div>

          {/* Stärkste Bereiche (nur Medium/Heavy) */}
          {report.deepDivePerBlock && (
            <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5">
              <h3 className="text-lg font-semibold text-gray-100 mb-3">
                Stärkste Bereiche (Reifegrad ≥ 75 %)
              </h3>
              {topStrengthBlocks.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Es wurden keine Themenblöcke mit einem Reifegrad von mindestens
                  75 % identifiziert. Mit zunehmender Optimierung werden hier
                  zukünftig Stärken sichtbar.
                </p>
              ) : (
                <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
                  {topStrengthBlocks.map((b) => (
                    <li key={b.index}>
                      <span className="font-semibold">{b.title}</span> – Reifegrad{" "}
                      <span className="font-semibold">{b.maturity.toFixed(0)}%</span>.
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-gray-500">
                Diese Bereiche können genutzt werden, um Erfolgsgeschichten und
                Best Practices aufzubauen.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 5: Übersicht der Themenblöcke (Tabelle)
          Nur Medium/Heavy
          ══════════════════════════════════════════════════ */}
      {report.blockTable && (
        <section className="mt-12 ompa-section-avoid-break">
          <h2 className="text-2xl font-semibold text-gray-100 mb-4">
            Übersicht der Themenblöcke
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Alle Themenblöcke mit Handlungsbedarf und Reifegrad, sortiert nach
            absteigendem Handlungsbedarf.
          </p>
          <div className="overflow-x-auto rounded-2xl bg-slate-900/70 border border-slate-800">
            <table className="w-full text-sm text-left text-gray-200">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Themenblock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Handlungsbedarf</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">Reifegrad</th>
                </tr>
              </thead>
              <tbody>
                {blocksByNeed.map((block) => {
                  const maturity = 100 - block.need;
                  return (
                    <tr key={block.index} className="border-b border-slate-800/60 last:border-b-0">
                      <td className="px-4 py-2 text-xs text-gray-500">{block.index}</td>
                      <td className="px-4 py-2 text-sm text-gray-100">{block.title}</td>
                      <td className="px-4 py-2 text-sm text-right text-orange-300">{block.need.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-sm text-right text-emerald-300">{maturity.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 6: Deep Dive pro Themenblock
          Nur Medium/Heavy
          ══════════════════════════════════════════════════ */}
      {report.deepDivePerBlock && (
        <section className="mt-12 ompa-page-break-before">
          <h2 className="text-2xl font-semibold text-gray-100 mb-4">
            Deep Dive nach Themenblock
          </h2>
          <p className="text-sm text-gray-400 mb-6">
            Jeder Themenblock wird einzeln betrachtet – mit numerischem
            Handlungsbedarf, Reifegrad und konkreter Handlungsempfehlung.
          </p>
          <div className="space-y-4 ompa-avoid-break-inside">
            {blocksByNeed.map((block, index) => {
              const maturity = 100 - block.need;
              const recommendation = getBlockRecommendation(block.title, block.need);
              let needLabel = "geringer Handlungsbedarf";
              if (block.need >= 70) needLabel = "sehr hoher Handlungsbedarf";
              else if (block.need >= 40) needLabel = "mittlerer Handlungsbedarf";

              return (
                <article
                  key={block.index ?? index}
                  className="rounded-2xl bg-slate-900/70 border border-slate-800 px-5 py-4"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-100">
                      {block.index}. {block.title}
                    </h3>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-orange-200">
                        Handlungsbedarf: <span className="font-semibold">{block.need.toFixed(0)}%</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-emerald-200">
                        Reifegrad: <span className="font-semibold">{maturity.toFixed(0)}%</span>
                      </span>
                    </div>
                  </header>
                  <p className="mt-3 text-sm text-gray-300">
                    In diesem Themenblock besteht aktuell{" "}
                    <span className="font-semibold">{needLabel}</span>. Ein Reifegrad von{" "}
                    <span className="font-semibold">{maturity.toFixed(0)}%</span>{" "}
                    zeigt, wie weit die bestehenden Maßnahmen bereits entwickelt sind.
                  </p>
                  <p className="mt-2 text-sm text-gray-300">
                    <span className="font-semibold">Handlungsempfehlung:</span> {recommendation}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Light-Teaser: Deep Dive ist nur in Medium verfügbar ── */}
      {!report.deepDivePerBlock && (
        <section className="mt-8 rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 p-6 text-center space-y-3">
          <h3 className="text-lg font-semibold text-gray-300">
            Detaillierte Auswertung pro Themenblock?
          </h3>
          <p className="text-sm text-gray-400 max-w-lg mx-auto">
            Mit OMPA Medium erhältst du eine ausführliche Analyse aller 10
            Themenbereiche, inklusive konkreter Handlungsempfehlungen pro Block,
            Branchenvergleich und priorisierter Top-10-Maßnahmenliste.
          </p>
          <a
            href="/wizard?variant=medium"
            className="inline-flex items-center justify-center rounded-xl bg-[#fbb03b] px-6 py-3 text-base font-bold text-black hover:bg-[#fdd28a] transition-colors"
          >
            Jetzt OMPA Medium starten – 149,95 €
          </a>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 7: Top-N Handlungsfelder (Fragen-Ebene)
          ══════════════════════════════════════════════════ */}
      {report.topRecommendations && topRecommendations.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-6 space-y-4 ompa-page-break-before">
          <h2 className="text-[1.2rem] font-bold text-gray-100">
            Wichtigste Handlungsfelder (Top {topRecommendations.length})
          </h2>
          <p className="text-[1rem] text-gray-400">
            Sortiert nach Handlungsbedarf (Antwort vs. Wichtigkeit).
          </p>
          <div className="space-y-3 ompa-avoid-break-inside">
            {topRecommendations.map((item: any, index: number) => (
              <div
                key={`rec-${index}`}
                className="flex flex-col gap-1 rounded-xl bg-gray-900/70 border border-gray-800 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold text-gray-100">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-100">
                      Frage {item.nr}: {item.text}
                    </div>
                    <div className="text-xs text-gray-400">Block: {item.blockTitle}</div>
                  </div>
                </div>
                <div className="text-sm font-bold text-[#ffbb3b]">
                  Handlungsbedarf {item.score}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 8: Calendly-Einbettung (nur Heavy)
          ══════════════════════════════════════════════════ */}
      {report.calendlyEmbed && (
        <section className="mt-12 rounded-2xl border-2 border-purple-600/40 bg-purple-900/10 p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-100">
            Dein persönliches Strategiegespräch
          </h2>
          <p className="text-base text-gray-300">
            Als OMPA-Heavy-Nutzer hast du Anspruch auf ein 60-minütiges
            Auswertungsgespräch mit Robert Sonnenberger. Wähle deinen
            Wunschtermin – das Gespräch ist persönlich, vertraulich und
            auf dein Unternehmen zugeschnitten.
          </p>
          <div className="rounded-xl overflow-hidden bg-white">
            <iframe
              src="https://calendly.com/zweimeter/ompa-heavy-auswertung"
              width="100%"
              height="700"
              frameBorder="0"
              title="Calendly: OMPA Heavy Auswertungsgespräch"
              className="w-full"
            />
          </div>
          <p className="text-xs text-gray-500">
            Falls der Kalender nicht lädt, kannst du alternativ eine E-Mail
            an{" "}
            <a
              href="mailto:robert@zweimeter.consulting"
              className="underline text-[#fbb03b]/80 hover:text-[#fbb03b]"
            >
              robert@zweimeter.consulting
            </a>{" "}
            schreiben.
          </p>
        </section>
      )}

      {/* ── Strategiememo-Hinweis (nur Heavy) ── */}
      {report.strategieMemoHint && (
        <section className="mt-6 rounded-xl border border-purple-700/40 bg-purple-900/10 px-5 py-4">
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-purple-300">Strategiememo:</span>{" "}
            Nach deinem Auswertungsgespräch erhältst du innerhalb von 5
            Werktagen ein individuelles Strategiememo mit konkreten
            Maßnahmen, Prioritäten und nächsten Schritten – zugeschnitten
            auf dein Unternehmen.
          </p>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABSCHNITT 9: Upsell-Sektion
          ══════════════════════════════════════════════════ */}
      {!pdfMode && <UpsellSection />}

    </div>
  );
}
