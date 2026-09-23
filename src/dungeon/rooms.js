import { T } from './tiles.js';
import { MAX_DEPTH } from '../config.js';
import { spawnTable } from '../monsters/defs.js';
import { makeItem } from '../items/generate.js';

/**
 * Room types. To add a specialist room, add an entry here and put it in the plan in generator.js —
 * usually as a branch, e.g. `{ type: 'library' }` or `{ type: 'treasury', locked: true }`.
 *
 *   size(rng, depth)   interior width/height in tiles
 *   doors              'arch' (open doorway), 'door', or 'mixed' (a coin flip per room)
 *   branchable         whether other rooms may hang off this one
 *   monsters, items    whether the general population pass may put things in it
 *   traps              whether hidden traps may be placed in it
 *   furnish(ctx, room) place stairs, pedestals, pillars, guardians, loot... (see ctx in generator.js)
 *
 * Locked rooms are never used as branch parents and are skipped by the general population pass,
 * so a locked specialist room decides its own contents in furnish().
 */
export const ROOM_TYPES = {
  entrance: {
    size: (rng) => ({ w: rng.int(5, 8), h: rng.int(5, 7) }),
    doors: 'arch', branchable: true, monsters: false, items: true, traps: false,
    furnish(ctx, room) {
      ctx.up = ctx.placeStairs(room, T.STAIRS_UP);
    },
  },

  exit: {
    size: (rng) => ({ w: rng.int(5, 8), h: rng.int(5, 7) }),
    doors: 'mixed', branchable: true, monsters: true, items: true, traps: true,
    furnish(ctx, room) {
      ctx.down = ctx.placeStairs(room, T.STAIRS_DOWN);
    },
  },

  standard: {
    size: (rng) => ({ w: rng.int(4, 9), h: rng.int(4, 8) }),
    doors: 'mixed', branchable: true, monsters: true, items: true, traps: true,
    furnish(ctx, room) {
      // Single-tile pillars inset two tiles from the walls: they can never block a doorway or split the room.
      if (room.w < 7 || room.h < 7 || !ctx.rng.chance(0.6)) return;
      for (const x of [room.x + 2, room.x + room.w - 3]) {
        for (const y of [room.y + 2, room.y + room.h - 3]) ctx.set(x, y, T.WALL);
      }
    },
  },

  // Bottom floor: the Amulet on its pedestal, and its keeper. Takes the exit's place on the loop.
  vault: {
    size: (rng) => ({ w: rng.int(7, 9), h: rng.int(6, 8) }),
    doors: 'door', branchable: false, monsters: false, items: false, traps: false,
    furnish(ctx, room) {
      const p = ctx.setPedestal(room);
      ctx.amulet = p;
      const spots = ctx.roomTiles(room, (x, y) => ctx.get(x, y) === T.FLOOR && Math.abs(x - p.x) + Math.abs(y - p.y) >= 2);
      const s = spots.length ? ctx.rng.pick(spots) : { x: room.x, y: room.y };
      ctx.addMonster({ type: 'warden', x: s.x, y: s.y, asleep: true, boss: true });
    },
  },

  // An artefact of power on a pedestal, with an out-of-depth guardian dozing beside it. A dead-end side room.
  shrine: {
    size: (rng) => ({ w: rng.int(5, 6), h: rng.int(5, 6) }),
    doors: 'door', branchable: false, monsters: false, items: false, traps: false,
    furnish(ctx, room) {
      const p = ctx.setPedestal(room);
      ctx.shrine = { x: p.x, y: p.y, item: makeItem('artefact', ctx.artefact) };
      const spots = ctx.roomTiles(room, (x, y) => ctx.get(x, y) === T.FLOOR && Math.abs(x - p.x) + Math.abs(y - p.y) === 1);
      if (spots.length) {
        const s = ctx.rng.pick(spots);
        const table = spawnTable(Math.min(MAX_DEPTH, ctx.depth + 2));
        ctx.addMonster({ type: ctx.rng.weighted(table), x: s.x, y: s.y, asleep: true, guardian: true });
      }
    },
  },
};
