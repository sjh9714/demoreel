#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Reel } from "./timeline.js";

const HELP = `demoreel — record a web app session, edit it like code, render a crisp GIF

Usage:
  demoreel record <url> [-o session.json] [--viewport 1280x800] [--canvas]
  demoreel render [reel.json | session.json] [-o demo.gif] [--frames a,b] [--mp4] [--keep-frames dir]
  demoreel suggest [session.json] [-o reel.json]
  demoreel preview [reel.json] [--port 4300]

Docs: https://github.com/sjh9714/demoreel`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function loadReel(file: string): { reel: Reel; reelDir: string } {
  if (!existsSync(file)) fail(`file not found: ${file}`);
  const reelDir = dirname(resolve(file));
  const json = JSON.parse(readFileSync(file, "utf8"));
  // bare session.json -> identity reel
  if (Array.isArray(json.events)) return { reel: { session: file }, reelDir: process.cwd() };
  return { reel: json as Reel, reelDir };
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "record": {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o", default: "session.json" },
        viewport: { type: "string", default: "1280x800" },
        canvas: { type: "boolean", default: false },
      },
    });
    const url = positionals[0] || fail("usage: demoreel record <url>");
    const [w, h] = values.viewport.split("x").map(Number);
    if (!w || !h) fail(`bad --viewport: ${values.viewport}`);
    const { record } = await import("./record.js");
    await record({ url, out: values.out, viewport: { width: w, height: h }, canvas: values.canvas });
    break;
  }
  case "render": {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o", default: "demo.gif" },
        frames: { type: "string" },
        mp4: { type: "boolean", default: false },
        "keep-frames": { type: "string" },
        auto: { type: "boolean", default: false },
      },
    });
    const file = positionals[0] || (existsSync("reel.json") ? "reel.json" : "session.json");
    let { reel, reelDir } = loadReel(file);
    if (values.auto && !reel.camera && !reel.retime) {
      const { suggest } = await import("./suggest.js");
      const session = JSON.parse(readFileSync(resolve(reelDir, reel.session || file), "utf8"));
      reel = { ...suggest(session), session: reel.session || file };
      reelDir = process.cwd();
    }
    const frames = values.frames
      ? (values.frames.split(",").map(Number) as [number, number])
      : undefined;
    const { render } = await import("./render.js");
    await render({ reel, reelDir, out: values.out, frames, mp4: values.mp4, keepFrames: values["keep-frames"] });
    break;
  }
  case "suggest": {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { out: { type: "string", short: "o", default: "reel.json" } },
    });
    const file = positionals[0] || "session.json";
    if (!existsSync(file)) fail(`file not found: ${file}`);
    const session = JSON.parse(readFileSync(file, "utf8"));
    const { suggest } = await import("./suggest.js");
    const { relative } = await import("node:path");
    // session path in reel.json is relative to the reel file itself
    const reel = { session: relative(dirname(resolve(values.out)), resolve(file)), ...suggest(session) };
    const { writeFileSync } = await import("node:fs");
    writeFileSync(values.out, JSON.stringify(reel, null, 2) + "\n");
    console.log(`wrote ${values.out} (${reel.camera?.length ?? 0} camera keyframes, ${reel.retime?.length ?? 0} retime segments)`);
    break;
  }
  case "preview": {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { port: { type: "string", default: "4300" } },
    });
    const file = positionals[0] || (existsSync("reel.json") ? "reel.json" : "session.json");
    const { preview } = await import("./preview.js");
    await preview(file, Number(values.port));
    break;
  }
  case undefined:
  case "-h":
  case "--help":
  case "help":
    console.log(HELP);
    break;
  default:
    fail(`unknown command: ${cmd}\n\n${HELP}`);
}
