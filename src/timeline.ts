// Pure timeline math. Runs in Node (suggest, duration calc) and in the replay page (bundled).

export interface RetimeSegment {
  from: number;
  to: number;
  speed?: number;
  cut?: boolean;
}

export interface Reel {
  session?: string;
  output?: {
    file?: string;
    width?: number;
    fps?: number;
    gifFps?: number;
    colors?: number;
  };
  retime?: RetimeSegment[];
  camera?: number[][]; // [outT, cx, cy, zoom]
  cursor?: { show?: boolean; clickRipples?: boolean; smooth?: number };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a || 1));
export const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

// keyframe path [[t, ...values], ...] -> values at t, eased between keyframes
export function pathAt(path: number[][], t: number): number[] {
  if (!path.length) return [];
  if (t <= path[0][0]) return path[0].slice(1);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const x = ease(prog(t, a[0], b[0]));
      return a.slice(1).map((v, k) => lerp(v, b[k + 1], x));
    }
  }
  return path[path.length - 1].slice(1);
}

// piecewise-linear output-time -> session-time table from retime segments.
// Rows: [outStart, sessStart, speed]; cut segments are skipped entirely.
export interface TimeMap {
  rows: [number, number, number][];
  outDuration: number;
}

export function buildTimeMap(sessionDuration: number, retime: RetimeSegment[] = []): TimeMap {
  const segs = [...retime].sort((a, b) => a.from - b.from);
  // validate: in-range, non-overlapping
  let prev = 0;
  for (const s of segs) {
    if (s.from < prev || s.to <= s.from || s.to > sessionDuration) {
      throw new Error(`invalid retime segment [${s.from}, ${s.to}] (overlap or out of range 0..${sessionDuration})`);
    }
    prev = s.to;
  }
  const rows: [number, number, number][] = [];
  let out = 0, sess = 0;
  const push = (from: number, to: number, speed: number) => {
    if (to <= from) return;
    rows.push([out, from, speed]);
    out += (to - from) / speed;
    sess = to;
  };
  for (const s of segs) {
    push(sess, s.from, 1);
    if (s.cut) sess = s.to;
    else push(s.from, s.to, s.speed ?? 1);
  }
  push(sess, sessionDuration, 1);
  return { rows, outDuration: out };
}

export function sessionTimeAt(map: TimeMap, outT: number): number {
  const { rows } = map;
  if (!rows.length) return outT;
  let row = rows[0];
  for (const r of rows) {
    if (outT >= r[0]) row = r;
    else break;
  }
  return row[1] + (outT - row[0]) * row[2];
}
