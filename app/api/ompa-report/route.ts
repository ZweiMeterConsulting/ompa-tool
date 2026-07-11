// app/api/ompa-report/route.ts
import type { NextRequest } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import type { WizardState } from "@/types/wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  let browser: Browser | null = null;

  try {
    // 1) Body lesen
    const body = (await request.json()) as any;

    // akzeptiere mehrere Payload-Formen
    const state: WizardState | undefined =
      body?.state ??
      body?.wizardState ??
      body?.data ??
      (body?.currentStepId ? body : undefined);

    if (!state) {
      console.error("[OMPA-PDF] Missing state in request body. Keys:", Object.keys(body ?? {}));
      return new Response("Missing state", { status: 400 });
    }

    // 2) Origin bestimmen
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    // 3) Report-URL bauen
    const encoded = encodeURIComponent(JSON.stringify(state));
    const reportUrl = `${origin}/ompa-report?data=${encoded}`;
    console.log("[OMPA-PDF] reportUrl:", reportUrl);

    // 4) ExecutablePath bestimmen
    //
    //    Aktuelle API von @sparticuz/chromium (v131+):
    //    - chromium.executablePath() nimmt KEINE Parameter mehr
    //    - Für Vercel/Lambda: Die Chromium-Binärdatei wird automatisch
    //      aus dem mitgelieferten Paket entpackt
    //    - Optional: CHROMIUM_REMOTE_EXEC_PATH als Umgebungsvariable
    //      setzen, falls ein externer Chromium-Pack genutzt werden soll
    //
    const isVercel = !!process.env.VERCEL;
    const localExec = process.env.CHROMIUM_LOCAL_EXEC_PATH;

    let executablePath: string;

    if (isVercel) {
      // Auf Vercel: @sparticuz/chromium entpackt die Binärdatei automatisch
      executablePath = await chromium.executablePath();
    } else {
      // Lokal: bevorzugt installierten Browser nutzen (Windows/Mac)
      if (localExec) {
        executablePath = localExec;
      } else {
        // Fallback: Versuch über @sparticuz/chromium (Linux/Mac)
        // Auf Windows funktioniert das oft nicht – dann CHROMIUM_LOCAL_EXEC_PATH setzen
        try {
          executablePath = await chromium.executablePath();
        } catch {
          // Letzter Fallback: Chrome-Standardpfade je Betriebssystem
          const platform = process.platform;
          if (platform === "win32") {
            executablePath =
              "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
          } else if (platform === "darwin") {
            executablePath =
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
          } else {
            executablePath = "/usr/bin/google-chrome-stable";
          }
          console.warn(
            `[OMPA-PDF] @sparticuz/chromium konnte keinen Pfad ermitteln. Fallback: ${executablePath}`
          );
        }
      }
    }

    console.log("[OMPA-PDF] executablePath:", executablePath);

    // 5) Puppeteer starten
    //
    //    Auf Vercel: die Lambda-optimierten Flags von @sparticuz/chromium.
    //    Auf einem echten Chromium (Coolify-Container / lokal installiert):
    //    ein schlanker, container-tauglicher Flag-Satz. --disable-dev-shm-usage
    //    ist in Docker wichtig, weil /dev/shm dort standardmäßig zu klein ist
    //    und Chromium sonst beim Rendern abstürzt.
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

    // 6) Seite laden
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 60_000 });
    await sleep(400); // kleiner Puffer für Fonts/Charts

    // 7) PDF bauen
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    // 8) Response
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="ompa-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[OMPA-PDF] PDF generation error:", error);
    return new Response("Error generating PDF", { status: 500 });
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