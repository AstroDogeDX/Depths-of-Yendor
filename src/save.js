// Saving: one run at a time, kept in localStorage. Game.save writes it on reaching each floor, when you save and
// quit, every minute in play, and as the page goes away (closing the tab or window, reloading) or is hidden:
// storage writes are synchronous, so the save is done before the page is. Dying or winning deletes it, so a run
// still ends when it ends.
//
// Floors are made from the seed, so a save keeps only what's changed on each one you've seen (Level.snapshot):
// its monsters and things, doors, traps and how much of it you've mapped. With the player, what you've learned
// and a few odds and ends, a whole run is a few hundred KB at most.
//
// A save from an older version of its format (SAVE_VERSION) can't be continued. One from before a change to how
// floors are laid out can: each saved floor carries its layout's fingerprint, and one that no longer matches
// starts afresh (see Game.getLevel).

const KEY = 'doy.save';
export const SAVE_VERSION = 1;

/** Writes a save. False if storage refused it (full, or blocked). */
export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Saving failed:', err);
    return false;
  }
}

/** The saved run, or null if there's none (or it can't be continued). */
export function readSave() {
  try {
    const save = JSON.parse(localStorage.getItem(KEY));
    return save?.version === SAVE_VERSION ? upgrade(save) : null;
  } catch {
    return null;
  }
}

/**
 * Brings a save up to date with what's been renamed since it was made: the wand of slowness is now the wand of frost.
 * (Renamed statuses are dealt with as they're restored: see restoreStatus in status.js.)
 */
function upgrade(save) {
  const wand = (it) => { if (it?.kind === 'wand' && it.type === 'slow') it.type = 'frost'; };
  save.player.inventory.forEach(wand);
  save.player.hotbar.forEach(wand);
  for (const level of save.levels) for (const e of level.items) wand(e.item);
  for (const list of [save.knowledge.known.wand, save.knowledge.tried.wand]) {
    const i = list.indexOf('slow');
    if (i >= 0) list[i] = 'frost';
  }
  return save;
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* storage unavailable: there's nothing saved either */ }
}

/** A floor's layout (its tile grid) boiled down to a number, to tell whether a saved floor still fits it. */
export function fingerprint(grid) {
  let h = 0x811c9dc5;
  for (let i = 0; i < grid.length; i++) h = Math.imul(h ^ grid[i], 0x01000193);
  return h >>> 0;
}

/** A 0/1 array as a compact string (a bit per entry, in base64). */
export function packBits(arr) {
  const bytes = new Uint8Array(Math.ceil(arr.length / 8));
  for (let i = 0; i < arr.length; i++) if (arr[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** The array packBits made, `n` long. */
export function unpackBits(str, n) {
  const s = atob(str), arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return arr;
}

/** Rounds to 2 decimal places, which is plenty for positions and timers and keeps saves small. */
export const round2 = (v) => Math.round(v * 100) / 100;
