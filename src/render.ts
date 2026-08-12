import { launch } from "puppeteer-core";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findChrome } from "./chrome.js";
import { assertFfmpeg, framesToGif, framesToMp4 } from "./ffmpeg.js";
import { buildReplayHtml, type Session } from "./replay-page.js";
import type { Reel } from "./timeline.js";

export interface RenderOptions {
  reel: Reel;
  reelDir: string; // directory reel paths are relative to
  out: string;
  frames?: [number, number];
  mp4: boolean;
  keepFrames?: string; // keep PNG frames in this dir instead of a temp dir
}

export async function render(opts: RenderOptions): Promise<void> {
  assertFfmpeg();
  const reel = opts.reel;
  const session: Session = JSON.parse(readFileSync(resolve(opts.reelDir, reel.session || "session.json"), "utf8"));
  if (!session.events?.length) throw new Error("session has no events");

  const output = { width: 1120, fps: 30, gifFps: 20, colors: 96, ...reel.output };
  const html = buildReplayHtml(session, reel);

  const browser = await launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...session.viewport, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("replay page error:", (e as Error).message));
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => (window as any).ready);

    const duration: number = await page.evaluate(() => (window as any).OUT_DURATION);
    const step = 1000 / output.fps;
    const total = Math.floor(duration / step);
    const [first, last] = opts.frames ?? [0, total];

    const framesDir = opts.keepFrames || mkdtempSync(join(tmpdir(), "filmless-"));
    mkdirSync(framesDir, { recursive: true });
    console.log(`rendering frames ${first}..${last} of ${total} (${(duration / 1000).toFixed(1)}s @ ${output.fps}fps)`);
    const t0 = Date.now();
    for (let i = first; i <= last; i++) {
      await page.evaluate((t) => (window as any).seekOut(t), Math.min(i * step, duration));
      await page.screenshot({ path: join(framesDir, `frame_${String(i).padStart(5, "0")}.png`) as `${string}.png` });
    }
    console.log(`captured ${last - first + 1} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (opts.out.endsWith(".mp4") || opts.mp4) {
      const mp4Out = opts.out.endsWith(".mp4") ? opts.out : opts.out.replace(/\.gif$/, ".mp4");
      framesToMp4(framesDir, mp4Out, { fps: output.fps, width: output.width, startNumber: first });
      console.log(`wrote ${mp4Out}`);
    }
    if (opts.out.endsWith(".gif")) {
      framesToGif(framesDir, opts.out, { ...output, startNumber: first });
      console.log(`wrote ${opts.out}`);
    }
    if (!opts.keepFrames) rmSync(framesDir, { recursive: true, force: true });
    else console.log(`frames kept in ${framesDir}`);
  } finally {
    await browser.close();
  }
}
