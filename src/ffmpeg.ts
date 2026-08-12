import { spawnSync } from "node:child_process";

export function assertFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.error || r.status !== 0) {
    throw new Error(
      "ffmpeg not found. Install it:\n  macOS:  brew install ffmpeg\n  Ubuntu: sudo apt install ffmpeg\n  Windows: winget install ffmpeg"
    );
  }
}

function run(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status})`);
}

export function framesToGif(
  framesDir: string,
  out: string,
  opts: { fps: number; gifFps: number; width: number; colors: number; startNumber?: number }
): void {
  run([
    "-framerate", String(opts.fps),
    "-start_number", String(opts.startNumber ?? 0),
    "-i", `${framesDir}/frame_%05d.png`,
    "-vf",
    `fps=${opts.gifFps},scale=${opts.width}:-1:flags=lanczos,split[s0][s1];` +
      `[s0]palettegen=max_colors=${opts.colors}:stats_mode=diff[p];` +
      `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    "-loop", "0",
    out,
  ]);
}

export function framesToMp4(framesDir: string, out: string, opts: { fps: number; width: number; startNumber?: number }): void {
  run([
    "-framerate", String(opts.fps),
    "-start_number", String(opts.startNumber ?? 0),
    "-i", `${framesDir}/frame_%05d.png`,
    "-vf", `scale=${opts.width}:-2:flags=lanczos`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "20",
    out,
  ]);
}
