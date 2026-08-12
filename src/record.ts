import { launch } from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { findChrome } from "./chrome.js";
import { rrwebSource } from "./replay-page.js";

export interface RecordOptions {
  url: string;
  out: string;
  viewport: { width: number; height: number };
  canvas: boolean;
}

export async function record(opts: RecordOptions): Promise<void> {
  const rrweb = rrwebSource();
  const events: unknown[] = [];
  const browser = await launch({
    executablePath: findChrome(),
    headless: false,
    defaultViewport: null,
    handleSIGINT: false, // we save the session on SIGINT ourselves

    args: [
      `--window-size=${opts.viewport.width},${opts.viewport.height + 88}`, // + browser chrome height
      "--force-device-scale-factor=1",
    ],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ ...opts.viewport, deviceScaleFactor: 1 });
  await page.exposeFunction("__filmlessEmit", (e: unknown) => events.push(e));
  await page.goto(opts.url, { waitUntil: "load" });

  const start = () =>
    page.evaluate(
      `(${String((recordCanvas: boolean) => {
        (window as any).rrweb.record({
          emit: (e: unknown) => (window as any).__filmlessEmit(e),
          collectFonts: true,
          inlineImages: true,
          recordCanvas,
          sampling: { mousemove: 20, scroll: 100 },
        });
      })})(${opts.canvas})`
    );
  await page.addScriptTag({ content: rrweb });
  await start();
  // keep recording across same-tab navigations
  page.on("load", async () => {
    try {
      await page.addScriptTag({ content: rrweb });
      await start();
    } catch { /* page closed */ }
  });

  console.log("recording… interact in the browser, then press Ctrl+C (or close the window) to save");
  const save = () => {
    writeFileSync(opts.out, JSON.stringify({ viewport: opts.viewport, events }));
    console.log(`\nsaved ${events.length} events -> ${opts.out}`);
  };
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    browser.on("disconnected", () => resolve());
  });
  save();
  try { await browser.close(); } catch { /* already closed */ }
}
