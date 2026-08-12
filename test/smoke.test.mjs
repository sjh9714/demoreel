import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CLI = join(DIR, "../dist/cli.js");
const SESSION = join(DIR, "fixtures/session.json");

test("suggest produces a valid reel", () => {
  const tmp = mkdtempSync(join(tmpdir(), "filmless-test-"));
  const reelPath = join(tmp, "reel.json");
  execFileSync("node", [CLI, "suggest", SESSION, "-o", reelPath]);
  const reel = JSON.parse(readFileSync(reelPath, "utf8"));
  assert.ok(reel.camera.length >= 4, "has camera keyframes");
  assert.ok(reel.retime.length >= 1, "collapsed at least one idle gap");
  assert.ok(reel.camera.some((k) => k[3] > 1), "zooms in somewhere");
  rmSync(tmp, { recursive: true, force: true });
});

test("render produces frames and a gif", () => {
  const tmp = mkdtempSync(join(tmpdir(), "filmless-test-"));
  const gif = join(tmp, "demo.gif");
  const frames = join(tmp, "frames");
  execFileSync("node", [CLI, "render", SESSION, "-o", gif, "--frames", "0,4", "--keep-frames", frames], {
    timeout: 120_000,
  });
  const pngs = readdirSync(frames).filter((f) => f.endsWith(".png"));
  assert.equal(pngs.length, 5);
  const png = readFileSync(join(frames, pngs[0]));
  // PNG magic + IHDR width/height at fixed offsets
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 800);
  assert.ok(png.length > 10_000, "frame is not blank");
  const gifBuf = readFileSync(gif);
  assert.equal(gifBuf.subarray(0, 6).toString(), "GIF89a");
  rmSync(tmp, { recursive: true, force: true });
});
