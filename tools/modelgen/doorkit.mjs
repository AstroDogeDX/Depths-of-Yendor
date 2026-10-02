// Doors: one model a theme (door_<style>, in that theme's file), set in a doorway. A doorway is a tile of the
// wall ring, 128 px across (x -64..64) and from the floor to the vault (179.2 px); the passage through it runs
// along z. The origin is on the floor at the middle of the doorway, the frame standing across the passage astride
// z = 0. Named groups, which the game finds and moves (see buildDoor in src/dungeon/levelBuilder.js):
//   frame                  what never moves: jambs, lintel, and the wall above up to the vault
//   leaf                   a door that swings: its pivot on the hinge, at the left side of the opening (x < 0).
//                          The game swings it away from whoever opens it, either way.
//   leaf_left, leaf_right  a door in two halves that slide apart into the walls, each by its own width
//   lock                   shown only while the door is locked: bars, chains, padlocks, seals. The game hides it
//                          when the door is unlocked, and a door only opens once it is, so it may reach across
//                          the frame and the leaf alike.
// The opening must stay at least 100 px wide (x ±50): the player can come within 44 px of the passage's sides,
// and the view mustn't clip into a jamb.
import { loft } from './lib.mjs';

export const HALF = 64; // half the doorway's width
export const VAULT = 179.2; // the vault, 2.8 m up

/** A slab from a convex outline [[x, y], ...] in the x-y plane, from z0 to z1. */
export const prism = (outline, z0, z1) => loft([outline.map(([x, y]) => [x, y, z0]), outline.map(([x, y]) => [x, y, z1])]);

/** Points along an arch over the span -hw..hw at `cx`, springing at height `y0` and rising `rise`, left to right. */
export function archPts(hw, y0, rise, n = 8, cx = 0) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI - (i / n) * Math.PI;
    return [cx + Math.cos(a) * hw, y0 + Math.sin(a) * rise];
  });
}

/**
 * The outlines of thin upright slices between a line at height `base` and the arch over it (archPts' arguments),
 * or up from the arch to `base` if it lies above. Many-sided outlines are capped with fans of long, overlapping
 * polygons, each painted whole, which fills a texture fast: slices keep each piece small.
 */
export function archSlices(hw, y0, rise, n, base, cx = 0) {
  const pts = archPts(hw, y0, rise, n, cx);
  return pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1];
    return [[a[0], base], a, b, [b[0], base]];
  });
}

/** Both faces of a slab: calls fn with the sign of the face (+1 for +z, -1 for -z). */
export const bothFaces = (fn) => { fn(1); fn(-1); };
