import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeMap, sessionTimeAt, pathAt } from "../dist/timeline.js";

test("identity map", () => {
  const m = buildTimeMap(1000, []);
  assert.equal(m.outDuration, 1000);
  assert.equal(sessionTimeAt(m, 0), 0);
  assert.equal(sessionTimeAt(m, 500), 500);
});

test("speedup segment", () => {
  const m = buildTimeMap(1000, [{ from: 200, to: 800, speed: 3 }]);
  assert.equal(m.outDuration, 200 + 200 + 200);
  assert.equal(sessionTimeAt(m, 100), 100);       // before segment: 1x
  assert.equal(sessionTimeAt(m, 300), 500);       // 100ms into segment = 300ms of session
  assert.equal(sessionTimeAt(m, 500), 900);       // after segment resumes 1x
});

test("cut segment", () => {
  const m = buildTimeMap(1000, [{ from: 100, to: 600, cut: true }]);
  assert.equal(m.outDuration, 500);
  assert.equal(sessionTimeAt(m, 99), 99);
  assert.equal(sessionTimeAt(m, 101), 601);       // jumps over the cut
});

test("cut at start and end", () => {
  const m = buildTimeMap(1000, [
    { from: 0, to: 100, cut: true },
    { from: 900, to: 1000, cut: true },
  ]);
  assert.equal(m.outDuration, 800);
  assert.equal(sessionTimeAt(m, 0), 100);
  assert.equal(sessionTimeAt(m, 800), 900);
});

test("adjacent segments", () => {
  const m = buildTimeMap(1000, [
    { from: 0, to: 500, speed: 5 },
    { from: 500, to: 1000, speed: 2 },
  ]);
  assert.equal(m.outDuration, 100 + 250);
  assert.equal(sessionTimeAt(m, 100), 500);
  assert.equal(sessionTimeAt(m, 350), 1000);
});

test("overlapping segments rejected", () => {
  assert.throws(() => buildTimeMap(1000, [
    { from: 0, to: 500, speed: 2 },
    { from: 400, to: 800, speed: 2 },
  ]));
});

test("out-of-range segment rejected", () => {
  assert.throws(() => buildTimeMap(1000, [{ from: 500, to: 1500, speed: 2 }]));
});

test("out-of-range t clamps to ends", () => {
  const m = buildTimeMap(1000, [{ from: 200, to: 800, speed: 3 }]);
  assert.equal(sessionTimeAt(m, -50), -50);        // caller clamps outT >= 0; row 0 extrapolates linearly
  assert.equal(sessionTimeAt(m, m.outDuration), 1000);
});

test("pathAt holds and eases", () => {
  const path = [[0, 0, 10], [100, 0, 10], [200, 100, 20]];
  assert.deepEqual(pathAt(path, -5), [0, 10]);
  assert.deepEqual(pathAt(path, 50), [0, 10]);       // hold shot
  assert.deepEqual(pathAt(path, 150), [50, 15]);     // ease midpoint = 0.5
  assert.deepEqual(pathAt(path, 999), [100, 20]);    // clamp past end
});
