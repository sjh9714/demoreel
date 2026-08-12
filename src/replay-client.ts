// Browser-side replay driver. Bundled to IIFE; expects window.rrweb (UMD),
// window.__SESSION__ = {viewport, events}, window.__REEL__ = Reel.
import { buildTimeMap, sessionTimeAt, pathAt, type Reel } from "./timeline.js";

declare const rrweb: any;
declare global {
  interface Window {
    __SESSION__: { viewport: { width: number; height: number }; events: any[] };
    __REEL__: Reel;
    seekOut: (t: number) => Promise<void>;
    OUT_DURATION: number;
    ready: Promise<void>;
  }
}

const KILL_ANIM =
  "*,*::before,*::after{transition:none!important;animation-play-state:paused!important;animation-delay:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}";

const session = window.__SESSION__;
const reel = window.__REEL__ || {};
const events = session.events;
const base = events[0].timestamp;
const sessionDuration = events[events.length - 1].timestamp - base;
const W = session.viewport.width;
const H = session.viewport.height;

const map = buildTimeMap(sessionDuration, reel.retime || []);
window.OUT_DURATION = map.outDuration;

// mouse path + clicks (type 3 = IncrementalSnapshot, source 1 = MouseMove, source 2 = MouseInteraction, interaction type 2 = Click)
const mouse: number[][] = [];
const clicks: number[][] = [];
for (const e of events) {
  if (e.type === 3 && e.data.source === 1) {
    for (const p of e.data.positions) mouse.push([e.timestamp - base + p.timeOffset, p.x, p.y]);
  } else if (e.type === 3 && e.data.source === 2 && e.data.type === 2) {
    clicks.push([e.timestamp - base, e.data.x, e.data.y]);
  }
}
mouse.sort((a, b) => a[0] - b[0]);

const smooth = reel.cursor?.smooth ?? 120;
function mouseAt(t: number): [number, number] {
  if (!mouse.length) return [-100, -100];
  // moving average over [t - smooth, t]
  let sx = 0, sy = 0, n = 0;
  for (const [mt, x, y] of mouse) {
    if (mt >= t - smooth && mt <= t) { sx += x; sy += y; n++; }
    if (mt > t) break;
  }
  if (n) return [sx / n, sy / n];
  if (t <= mouse[0][0]) return [mouse[0][1], mouse[0][2]];
  for (let i = 0; i < mouse.length - 1; i++) {
    const a = mouse[i], b = mouse[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const x = (t - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * x, a[2] + (b[2] - a[2]) * x];
    }
  }
  const L = mouse[mouse.length - 1];
  return [L[1], L[2]];
}

const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const world = document.getElementById("world")!;
const cursorEl = document.getElementById("cursor") as HTMLElement;
const rippleEl = document.getElementById("ripple") as HTMLElement;

let replayer: any;
window.ready = (async () => {
  replayer = new rrweb.Replayer(events, {
    root: document.getElementById("stage"),
    mouseTail: false,
    triggerFocus: false,
    pauseAnimation: true,
    useVirtualDom: true,
    insertStyleRules: [KILL_ANIM],
  });
  replayer.pause(0);
  await document.fonts.ready;
  await raf2();
})();

// live overrides for embedded demos (landing page sliders): postMessage({filmless:{zoom,speed,cursor}})
const overrides = { zoom: 1, speed: 1, cursor: true };
window.addEventListener("message", (e: MessageEvent) => {
  if (e.data && e.data.filmless) Object.assign(overrides, e.data.filmless);
});

window.seekOut = async (outT: number) => {
  outT = Math.max(0, Math.min(map.outDuration, outT));
  const sessT = Math.min(sessionDuration, sessionTimeAt(map, outT));
  replayer.pause(sessT);

  // camera (output time)
  const cam = reel.camera?.length ? pathAt(reel.camera, outT) : [W / 2, H / 2, 1];
  let [cx, cy, s] = cam;
  if (overrides.zoom !== 1) {
    s = 1 + (s - 1) * overrides.zoom + (overrides.zoom - 1) * 0.3;
    cx = W / 2 + (cx - W / 2) * Math.min(1, overrides.zoom);
    cy = H / 2 + (cy - H / 2) * Math.min(1, overrides.zoom);
  }
  world.style.transform = `translate(${W / 2 - cx * s}px,${H / 2 - cy * s}px) scale(${s})`;

  // cursor + ripple (session time)
  const showCursor = reel.cursor?.show !== false && mouse.length > 0 && overrides.cursor;
  cursorEl.style.display = showCursor ? "block" : "none";
  let clicking = false;
  if (showCursor) {
    const [mx, my] = mouseAt(sessT);
    cursorEl.style.left = mx + "px";
    cursorEl.style.top = my + "px";
    let rp = -1, rx = 0, ry = 0;
    if (reel.cursor?.clickRipples !== false) {
      for (const [ct, x, y] of clicks) {
        const q = (sessT - ct) / 200;
        if (q >= 0 && q < 1) { rp = q; rx = x; ry = y; break; }
      }
    }
    if (rp >= 0) {
      const sz = 10 + 36 * rp;
      rippleEl.style.width = rippleEl.style.height = sz + "px";
      rippleEl.style.left = rx - sz / 2 + "px";
      rippleEl.style.top = ry - sz / 2 + "px";
      rippleEl.style.opacity = String((1 - rp) * 0.9);
      clicking = true;
    } else rippleEl.style.opacity = "0";
    cursorEl.style.transform = clicking ? "scale(0.82)" : "scale(1)";
  }
  await raf2();
};

// ?play — realtime preview loop (speed override aware)
if (new URLSearchParams(location.search).has("play")) {
  window.ready.then(() => {
    let t = 0, last = performance.now();
    (function loop() {
      const now = performance.now();
      t = (t + (now - last) * overrides.speed) % (map.outDuration + 800);
      last = now;
      window.seekOut(t);
      requestAnimationFrame(loop);
    })();
  });
}
