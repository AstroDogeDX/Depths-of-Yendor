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

import { randomBane } from './items/enchant.js';
import { rand } from './rng.js';

const KEY = 'doy.save';
export const SAVE_VERSION = 1;
// Changes a save made before them can be brought up to date with (see upgrade): 2, the rework of curses and the
// scroll of upgrade.
export const SAVE_FORMAT = 2;

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
 * Brings a save up to date with what's changed since it was made. (Renamed statuses are dealt with as they're
 * restored: see restoreStatus in status.js.)
 * - The wand of slowness is now the wand of frost.
 * - Before format 2, the scroll of enchanting was what's now the scroll of upgrade, and an item's enchantment could be
 *   negative: now it's a + of 0 or more, a curse is a strength (item.curse), and a cursed weapon or armour has a Curse
 *   of ___ (see items/enchant.js). A cursed ring's old minus becomes a + that works against you, as before.
 */
function upgrade(save) {
  const old = !(save.format >= 2);
  const fix = (it) => {
    if (!it) return;
    if (it.kind === 'wand' && it.type === 'slow') it.type = 'frost';
    if (!old) return;
    if (it.kind === 'scroll' && it.type === 'enchant') it.type = 'upgrade';
    if ('ench' in it || 'cursed' in it) {
      const ench = it.ench ?? 0;
      it.plus = it.kind === 'ring' ? Math.abs(ench) : Math.max(0, ench);
      it.curse = it.cursed ? 2 : 0;
      if (it.cursed && (it.kind === 'weapon' || it.kind === 'armor')) it.bane = randomBane(rand, it.kind);
      delete it.ench;
      delete it.cursed;
    }
  };
  save.player.inventory.forEach(fix);
  save.player.hotbar.forEach(fix);
  for (const level of save.levels) for (const e of level.items) fix(e.item);
  const rename = (list, from, to) => {
    const i = list.indexOf(from);
    if (i >= 0) list[i] = to;
  };
  for (const list of [save.knowledge.known.wand, save.knowledge.tried.wand]) rename(list, 'slow', 'frost');
  if (old) for (const list of [save.knowledge.known.scroll, save.knowledge.tried.scroll]) rename(list, 'enchant', 'upgrade');
  save.format = SAVE_FORMAT;
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
