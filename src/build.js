// What build of the game this is: { time (ISO), sha (short commit), run (the deploy workflow's run number, 0 off
// GitHub), dev (the dev server) }, stamped in by vite.config.js. Shown in the title screen's corner, and kept in
// saves, so a save can tell what build made it.
/* global __BUILD__ */
export const BUILD = __BUILD__;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** When a build was made, the same for every player: "26 Sep 2026, 14:05 UTC". */
export function buildTime(b = BUILD) {
  const d = new Date(b.time);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** The build as players see it: "Build 42 · 26 Sep 2026, 14:05 UTC" (a local one "Local build · …"). */
export function buildLabel(b = BUILD) {
  if (b.dev) return 'Development build';
  return `${b.run ? `Build ${b.run}` : 'Local build'} · ${buildTime(b)}`;
}
