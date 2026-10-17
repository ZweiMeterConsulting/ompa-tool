// lib/reportPdf.ts
//
// Gemeinsame PDF-Generierung für den OMPA-Report.
// Wird von /api/ompa-report (Download) und /api/ompa-send-report
// (E-Mail-Versand) genutzt, damit beide Wege identische PDFs liefern.

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import type { WizardState } from "@/types/wizard";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ermittelt den Chromium-Pfad je Laufzeitumgebung.
 *
 * Aktuelle API von @sparticuz/chromium (v131+):
 * - chromium.executablePath() nimmt KEINE Parameter mehr
 * - Auf Vercel/Lambda wird die Binärdatei automatisch entpackt
 * - Lokal kann CHROMIUM_LOCAL_EXEC_PATH gesetzt werden
 */
async function resolveExecutablePath(): Promise<string> {
  const isVercel = !!process.env.VERCEL;
  const localExec = process.env.CHROMIUM_LOCAL_EXEC_PATH;

  if (isVercel) {
    return chromium.executablePath();
  }

  if (localExec) {
    return localExec;
  }

  try {
    return await chromium.executablePath();
  } catch {
    // Letzter Fallback: Chrome-Standardpfade je Betriebssystem
    const platform = process.platform;
    let fallback: string;
    if (platform === "win32") {
      fallback = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    } else if (platform === "darwin") {
      fallback = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    } else {
      fallback = "/usr/bin/google-chrome-stable";
    }
    console.warn(
      `[OMPA-PDF] @sparticuz/chromium konnte keinen Pfad ermitteln. Fallback: ${fallback}`
    );
    return fallback;
  }
}

/**
 * Rendert den Report unter /ompa-report für den übergebenen Wizard-State
 * und liefert das fertige PDF als Buffer zurück.
 *
 * @param state  Vollständiger WizardState (bestimmt Variante und Inhalte)
 * @param origin Basis-URL der laufenden Instanz, z. B. https://ompa.zweimeter.consulting
 */
export async function generateReportPdf(
  state: WizardState,
  origin: string
): Promise<Uint8Array> {
  let browser: Browser | null = null;

  try {
    const encoded = encodeURIComponent(JSON.stringify(state));
    const reportUrl = `${origin}/ompa-report?data=${encoded}`;
    console.log("[OMPA-PDF] reportUrl:", reportUrl);

    const executablePath = await resolveExecutablePath();
    console.log("[OMPA-PDF] executablePath:", executablePath);

    // Auf Vercel: die Lambda-optimierten Flags von @sparticuz/chromium.
    // Auf einem echten Chromium (Coolify-Container / lokal installiert):
    // ein schlanker, container-tauglicher Flag-Satz. --disable-dev-shm-usage
    // ist in Docker wichtig, weil /dev/shm dort standardmäßig zu klein ist
    // und Chromium sonst beim Rendern abstürzt.
    const isVercel = !!process.env.VERCEL;
    const launchArgs = isVercel
      ? chromium.args
      : [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ];

    browser = await puppeteer.launch({
      args: launchArgs,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 60_000 });
    await sleep(400); // kleiner Puffer für Fonts/Charts

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
