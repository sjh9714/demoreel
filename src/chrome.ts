import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const KNOWN: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ],
  win32: [
    join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    join(process.env["LOCALAPPDATA"] || "", "Google/Chrome/Application/chrome.exe"),
  ],
};

function playwrightChrome(): string | undefined {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return;
  const entry = readdirSync(cache).filter((d) => d.startsWith("chromium")).sort().pop();
  if (!entry) return;
  for (const sub of [
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    "chrome-linux/chrome",
    "chrome-win/chrome.exe",
  ]) {
    const p = join(cache, entry, sub);
    if (existsSync(p)) return p;
  }
}

export function findChrome(): string {
  if (process.env["CHROME"]) return process.env["CHROME"];
  for (const p of KNOWN[process.platform] || []) if (existsSync(p)) return p;
  const pw = playwrightChrome();
  if (pw) return pw;
  throw new Error(
    "Chrome not found. Install Google Chrome, or point the CHROME env var at a Chrome/Chromium binary:\n  CHROME=/path/to/chrome filmless ..."
  );
}
