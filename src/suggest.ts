// Deterministic draft reel from a recorded session: collapse idle gaps,
// zoom toward click targets with hold shots, wide bookends.
import { buildTimeMap, type Reel, type RetimeSegment } from "./timeline.js";
import type { Session } from "./replay-page.js";

const IDLE_GAP = 2000;    // gaps longer than this get collapsed…
const IDLE_KEEP = 300;    // …down to this
const ZOOM = 1.5;
const ZOOM_LEAD = 400;    // start camera move this long before a click
const ZOOM_HOLD = 900;    // hold on target after the click
const MERGE_DIST = 250;   // merge zoom targets closer than this (px)
const BOOKEND = 800;      // wide shot at start/end

interface Ev { type: number; timestamp: number; data: any }

export function suggest(session: Session): Reel {
  const events = session.events as Ev[];
  const base = events[0].timestamp;
  const duration = events[events.length - 1].timestamp - base;
  const W = session.viewport.width;
  const H = session.viewport.height;

  // interesting moments (session time): clicks, inputs, scrolls, mutations
  const interesting: number[] = [0, duration];
  const clicks: { t: number; x: number; y: number }[] = [];
  for (const e of events) {
    if (e.type !== 3) continue;
    const t = e.timestamp - base;
    const src = e.data.source;
    if (src === 2 && e.data.type === 2) { clicks.push({ t, x: e.data.x, y: e.data.y }); interesting.push(t); }
    else if (src === 5 || src === 3 || src === 0) interesting.push(t); // input, scroll, mutation
  }
  interesting.sort((a, b) => a - b);

  // idle collapse
  const retime: RetimeSegment[] = [];
  for (let i = 0; i < interesting.length - 1; i++) {
    const a = interesting[i], b = interesting[i + 1];
    if (b - a > IDLE_GAP) {
      // leave a beat on both sides, speed through the middle
      const from = a + IDLE_KEEP, to = b - IDLE_KEEP;
      retime.push({ from, to, speed: Math.max(2, Math.round((to - from) / IDLE_KEEP)) });
    }
  }

  // merge nearby click targets
  const targets: { t: number; tEnd: number; x: number; y: number }[] = [];
  for (const c of clicks) {
    const last = targets[targets.length - 1];
    if (last && Math.hypot(c.x - last.x, c.y - last.y) < MERGE_DIST) last.tEnd = c.t;
    else targets.push({ t: c.t, tEnd: c.t, x: c.x, y: c.y });
  }

  // camera keyframes are in OUTPUT time — map session times through the retime table
  const map = buildTimeMap(duration, retime);
  const outOf = (sessT: number) => {
    // invert: binary-search-free walk (rows are small)
    let out = 0;
    for (const [o, s, sp] of map.rows) if (sessT >= s) out = o + (sessT - s) / sp;
    return Math.max(0, Math.min(map.outDuration, out));
  };

  const wide: number[] = [W / 2, H / 2, 1];
  const cam: number[][] = [[0, ...wide], [Math.min(BOOKEND, map.outDuration / 4), ...wide]];
  for (const tg of targets) {
    const inT = outOf(tg.t);
    const holdEnd = outOf(tg.tEnd) + ZOOM_HOLD;
    // clamp target so the zoomed viewport stays inside the canvas
    const cx = Math.max(W / (2 * ZOOM), Math.min(W - W / (2 * ZOOM), tg.x));
    const cy = Math.max(H / (2 * ZOOM), Math.min(H - H / (2 * ZOOM), tg.y));
    cam.push([Math.max(0, inT - ZOOM_LEAD), ...(cam[cam.length - 1].slice(1))]);
    cam.push([inT - 100, cx, cy, ZOOM]);
    cam.push([holdEnd, cx, cy, ZOOM]);
  }
  cam.push([Math.max(map.outDuration - BOOKEND, (cam[cam.length - 1]?.[0] ?? 0) + 400), ...wide]);
  cam.push([map.outDuration, ...wide]);
  // drop keyframes that go backwards in time (overlapping zooms)
  const camera = cam.filter((k, i) => i === 0 || k[0] > cam[i - 1][0] - 1e-9);

  return {
    output: { file: "demo.gif", width: 1120, fps: 30, gifFps: 20, colors: 96 },
    retime,
    camera: camera.map((k) => k.map((v) => Math.round(v * 100) / 100)),
    cursor: { show: true, clickRipples: true, smooth: 120 },
  };
}
