import { T } from './tiles.js';
import { MAX_DEPTH, TILE } from '../config.js';
import { spawnTable } from '../monsters/defs.js';
import { makeItem, shopStock } from '../items/generate.js';

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
        const table = spawnTable(Math.min(MAX_DEPTH, ctx.depth + 5));
        ctx.addMonster({ type: ctx.rng.weighted(table), x: s.x, y: s.y, asleep: true, guardian: true });
      }
    },
  },

  // A merchant's shop, off the entrance room on the first floor of each theme after the first. A hooded
  // shopkeeper stands behind a counter of wares, with more on two display tables. Monsters never spawn or
  // wander in; only one already chasing you will follow you through the door.
  shop: {
    size: (rng) => ({ w: rng.int(5, 6), h: rng.int(5, 6) }),
    doors: 'door', branchable: false, monsters: false, items: false, traps: false,
    furnish(ctx, room) {
      ctx.shop = layoutShop(ctx.rng, ctx.depth, room);
    },
  },
};

/**
 * Lays the shop out relative to its door, in local coordinates: u runs along the back wall and v from the
 * back wall toward the door, both in tiles. Returns positions in (fractional) grid tiles; yaw 0 faces +z.
 *   keeper    where the shopkeeper stands, and which way it faces
 *   props     furniture: { type, x, y, yaw, solid, round }; props with display slots hold the wares
 *   stock     [{ item, price }], set out in the props' slots in order
 *   sconces   spots on the side walls for blue-flamed sconces: { x, z (world), ry }
 */
function layoutShop(rng, depth, room) {
  const side = room.doorways[0].side;
  const across = side === 'N' || side === 'S';
  const U = across ? room.w : room.h, V = across ? room.h : room.w;
  const at = {
    S: (u, v) => [room.x + u, room.y + v],
    N: (u, v) => [room.x + room.w - u, room.y + room.h - v],
    E: (u, v) => [room.x + v, room.y + room.h - u],
    W: (u, v) => [room.x + room.w - v, room.y + u],
  }[side];
  const facing = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[side]; // toward the door (+v)
  const prop = (type, u, v, turn = 0, opts = {}) => {
    const [x, y] = at(u, v);
    return { type, x, y, yaw: facing + turn, solid: true, ...opts };
  };
  const mid = U / 2;
  const props = [
    prop('shop_counter', mid, 1.0),
    prop('display_table', 1.5, V - 1.9),
    prop('display_table', U - 1.5, V - 1.9),
    prop('shelf', 0.55, 0.22),
    prop('shelf', U - 0.55, 0.22),
    prop('barrel', 0.38, 2.2, rng.range(0, 6), { round: true }),
    prop('barrel', 0.42, 2.85, rng.range(0, 6), { round: true }),
    prop('crates', U - 0.45, 2.5, Math.PI / 2),
    prop('rug', mid, 2.4, 0, { solid: false }),
  ];
  const [kx, ky] = at(mid, 0.6);
  const sconce = (u, turn) => {
    const [x, y] = at(u, 1.5);
    return { x: x * TILE, z: y * TILE, ry: facing + turn };
  };
  return {
    room: room.id,
    keeper: { x: kx, y: ky, yaw: facing },
    props,
    stock: shopStock(rng, depth),
    // 0.1 m out from each side wall, level with the counter, facing into the room.
    sconces: [sconce(0.05, Math.PI / 2), sconce(U - 0.05, -Math.PI / 2)],
  };
}
