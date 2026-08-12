import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reel } from "./timeline.js";

const require = createRequire(import.meta.url);
const DIST = dirname(fileURLToPath(import.meta.url));
// rrweb's exports map hides dist/*; resolve the package entry and read siblings from disk
const RRWEB_DIST = dirname(require.resolve("rrweb"));

export function rrwebSource(): string {
  return readFileSync(join(RRWEB_DIST, "rrweb.umd.min.cjs"), "utf8");
}

export function rrwebCss(): string {
  return readFileSync(join(RRWEB_DIST, "style.min.css"), "utf8");
}

// replay-client is bundled next to this file at build time (see package.json build script)
export function clientSource(): string {
  return readFileSync(join(DIST, "replay-client.js"), "utf8");
}

export interface Session {
  viewport: { width: number; height: number };
  events: unknown[];
}

export function buildReplayHtml(session: Session, reel: Reel): string {
  const { width: W, height: H } = session.viewport;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
${rrwebCss()}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#141414}
#world{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#stage{position:absolute;left:0;top:0}
#stage iframe{border:0}
.replayer-wrapper{position:relative!important;float:none!important}
.replayer-mouse,.replayer-mouse-tail{display:none!important}
#cursor{position:absolute;z-index:10;pointer-events:none}
#ripple{position:absolute;z-index:9;border:2px solid #fff;border-radius:50%;pointer-events:none;opacity:0;mix-blend-mode:difference}
</style></head>
<body>
<div id="world">
  <div id="stage"></div>
  <div id="ripple"></div>
  <svg id="cursor" viewBox="0 0 24 24" width="24" height="24"><path d="M5 3l14 7-6 1.6L9.6 18z" fill="#fff" stroke="#141414" stroke-width="1.4"/></svg>
</div>
<script>${rrwebSource()}</script>
<script>window.__SESSION__=${JSON.stringify(session)};window.__REEL__=${JSON.stringify(reel)};</script>
<script>${clientSource()}</script>
</body></html>`;
}
