import { SingleBar, Presets } from "cli-progress";

let bar = null;

export function startProgress(totalOrNull) {
  stopProgress();
  bar = new SingleBar(
    { hideCursor: true, format: "sync {value}/{total} |{bar}| {eta_formatted} ETA" },
    Presets.shades_classic
  );
  bar.start(Number.isFinite(totalOrNull) ? totalOrNull : 0, 0);
}
export function tick(n = 1) { if (bar) bar.increment(n); }
export function stopProgress() { if (bar) { bar.stop(); bar = null; } }
export function log(...args) { console.log(new Date().toISOString(), "-", ...args); }
export function warn(...args) { console.warn(new Date().toISOString(), "-", ...args); }
export function err(...args) { console.error(new Date().toISOString(), "-", ...args); }
