// Live preview: serves the same replay page render uses, in ?play loop,
// re-reading reel.json on every reload (edit reel.json, hit refresh).
import { createServer } from "node:http";
import { readFileSync, existsSync, watch } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { buildReplayHtml, type Session } from "./replay-page.js";
import type { Reel } from "./timeline.js";

export async function preview(file: string, port: number): Promise<void> {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`);

  const build = () => {
    const json = JSON.parse(readFileSync(file, "utf8"));
    const isSession = Array.isArray(json.events);
    const reel: Reel = isSession ? {} : json;
    const session: Session = isSession
      ? json
      : JSON.parse(readFileSync(resolve(dirname(resolve(file)), reel.session || "session.json"), "utf8"));
    let html = buildReplayHtml(session, reel);
    // preview chrome: autoplay + scrubber + current-time HUD
    html = html.replace(
      "</body>",
      `<div id="hud" style="position:fixed;left:12px;bottom:12px;z-index:99;font:12px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.7);padding:8px 12px;border-radius:8px">
        <span id="hud-t">0.00s</span> / <span id="hud-d"></span> · edit ${file.replace(/</g, "&lt;")} and refresh
        <input id="hud-scrub" type="range" min="0" max="1000" value="0" style="width:280px;vertical-align:middle;margin-left:10px">
        <button id="hud-play" style="margin-left:6px">⏸</button>
      </div>
      <script>
      window.ready.then(() => {
        const D = window.OUT_DURATION;
        document.getElementById('hud-d').textContent = (D/1000).toFixed(2)+'s';
        const scrub = document.getElementById('hud-scrub');
        const btn = document.getElementById('hud-play');
        let playing = true, t = 0, last = performance.now();
        scrub.oninput = () => { playing = false; btn.textContent = '▶'; t = scrub.value/1000*D; window.seekOut(t); };
        btn.onclick = () => { playing = !playing; btn.textContent = playing ? '⏸' : '▶'; last = performance.now(); };
        (function loop(){
          const now = performance.now();
          if (playing) { t = (t + (now - last)) % (D + 800); window.seekOut(Math.min(t, D)); scrub.value = Math.min(t,D)/D*1000; }
          last = now;
          document.getElementById('hud-t').textContent = (Math.min(t,D)/1000).toFixed(2)+'s';
          requestAnimationFrame(loop);
        })();
      });
      </script></body>`
    );
    return html;
  };

  const server = createServer((_req, res) => {
    try {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(build());
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e));
    }
  });
  await new Promise<void>((r) => server.listen(port, r));
  console.log(`preview at http://localhost:${port} — edit ${file} and refresh`);
  watch(dirname(resolve(file)), (_ev, name) => {
    if (name === join(file).split("/").pop()) console.log(`${name} changed — refresh the browser`);
  });
}
