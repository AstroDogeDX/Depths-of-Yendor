import { T } from './tiles.js';
import { RNG } from '../rng.js';
import { MAX_DEPTH, TILE } from '../config.js';
import { spawnTable } from '../monsters/defs.js';
import { makeItem, shopStock, sentinelWeapon, chestLoot, goldPile } from '../items/generate.js';

/**
 * Room types. To add a specialist room, add an entry here and put it in the plan in generator.js —
 * usually as a branch, e.g. `{ type: 'library' }` or `{ type: 'treasury', locked: true }` — or give it `special`.
 *
 *   size(rng, depth, design)  interior width/height in tiles (`design`: what its branch in the plan was given: an
 *                      oubliette's, see oublietteDesign)
 *   centred            a room put beside another (see placeBeside in generator.js) has its door in the middle of its
 *                      wall: its `w` runs along that wall, an odd number of tiles, and its `h` back from it
 *   doors              'arch' (open doorway), 'door', or 'mixed' (a coin flip per room)
 *   branchable         whether other rooms may hang off this one
 *   monsters, items    whether the general population pass may put things in it
 *   traps              whether hidden traps may be placed in it
 *   pools              whether the theme's pools may be sunk into it (see pools.js). Any room's furnish() can lay
 *                      pools of its own with ctx.growPool
 *   furnish(ctx, room) place stairs, pedestals, pillars, guardians, loot... (see ctx in generator.js)
 *   themes             the styles of the themes whose floors it may be on (any theme's, if left out)
 *   special            a side room of its own kind that a floor has now and then (see specialRooms in generator.js):
 *                      { chance (on each floor it may be on), from (its first floor) }
 *   dress(d)           its own decorations, in place of its theme's (d as decor.js's sets get it)
 *   stock(s, room)     what it holds, set out once the floor's chests are (s in generator.js), in place of what the
 *                      population pass would put there
 *   props              the props it's furnished with, fetched with its floors' (see roomProps)
 *
 * Locked rooms are dead ends: never branch parents. The general population pass leaves them out (no monsters,
 * traps or loose things); a locked standard room gets a stash of chests and gold instead (see generator.js), and a
 * locked specialist room decides its own contents in furnish() or stock().
 */
export const ROOM_TYPES = {
  entrance: {
    size: (rng) => ({ w: rng.int(5, 8), h: rng.int(5, 7) }),
    doors: 'arch', branchable: true, monsters: false, items: true, traps: false, pools: true,
    furnish(ctx, room) {
      ctx.up = ctx.placeStairs(room, T.STAIRS_UP);
    },
  },

  exit: {
    size: (rng) => ({ w: rng.int(5, 8), h: rng.int(5, 7) }),
    doors: 'mixed', branchable: true, monsters: true, items: true, traps: true, pools: true,
    furnish(ctx, room) {
      ctx.down = ctx.placeStairs(room, T.STAIRS_DOWN);
    },
  },

  standard: {
    size: (rng) => ({ w: rng.int(4, 9), h: rng.int(4, 8) }),
    doors: 'mixed', branchable: true, monsters: true, items: true, traps: true, pools: true,
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
  // shopkeeper stands behind a counter of wares, between two plinths for its finest, straight ahead as you come in,
  // with more on display tables down each side. Monsters never spawn or wander in; only one already chasing you will
  // follow you through the door.
  shop: {
    size: () => ({ w: 7, h: 6 }),
    centred: true,
    doors: 'door', branchable: false, monsters: false, items: false, traps: false,
    furnish(ctx, room) {
      ctx.shop = layoutShop(ctx.rng, ctx.depth, room, ctx.wares);
    },
  },

  // --- Special rooms: side rooms of their own kind, now and then (`special`) ---

  // A bare hall, and at the back of it, facing the way in, a stone sentinel on a slab carved with glowing runes,
  // holding a weapon it has kept for who knows how long: always a good one, +1 at least (see sentinelWeapon). It never
  // stirs, unless you strike it (see `dormant` in monsters/defs.js): then it fights with the weapon, enchantment and
  // all, and drops it when it falls. Weapon racks on the walls, candles burnt down at its feet. On any theme's floors.
  sentinel: {
    special: { chance: 0.22, from: 2 },
    size: (rng) => ({ w: rng.int(5, 6), h: rng.int(5, 6) }),
    doors: 'arch', branchable: false, monsters: false, items: false, traps: false, pools: false,
    props: ['rune_slab', 'weapon_rack', 'candles'],
    furnish(ctx, room) {
      // Against the wall across from the way in, in the middle of it, a tile out from it.
      const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[room.doorways[0].side], [nx, ny] = SIDES[back];
      const x = nx ? (nx < 0 ? room.x + 1 : room.x + room.w - 2) : room.x + (room.w >> 1);
      const y = ny ? (ny < 0 ? room.y + 1 : room.y + room.h - 2) : room.y + (room.h >> 1);
      room.focus = { x, y, back, yaw: FACING[back] };
      ctx.addMonster({ type: 'sentinel', x, y, asleep: true, yaw: FACING[back], loot: [sentinelWeapon(ctx.rng, ctx.depth)] });
    },
    dress(d) {
      const { room, rng } = d, f = room.focus, [nx, ny] = SIDES[f.back];
      d.add({ type: 'rune_slab', x: f.x + 0.5, y: f.y + 0.5, yaw: f.yaw, solid: false });
      // Candles at its feet, either side, a little toward you.
      for (const s of [-1, 1]) {
        const ax = ny ? s * 0.95 : 0, ay = nx ? s * 0.95 : 0;
        d.add({ type: 'candles', x: f.x + 0.5 + ax - nx * 0.35, y: f.y + 0.5 + ay - ny * 0.35, yaw: rng.range(0, 6), solid: false });
      }
      d.onWall('weapon_rack');
      if (rng.chance(0.6)) d.onWall('weapon_rack');
    },
  },

  // A storeroom, stacked with what something down here once kept: shelves along its walls, crates, barrels and sacks,
  // and a chest or two among them. On any theme's floors.
  storeroom: {
    special: { chance: 0.3, from: 1 },
    size: (rng) => ({ w: rng.int(4, 6), h: rng.int(4, 5) }),
    doors: 'mixed', branchable: false, monsters: true, items: false, traps: true, pools: false,
    props: ['shelf', 'crates', 'barrel', 'sacks'],
    furnish() {},
    dress(d) {
      const { rng } = d;
      // As much along the walls as they'll take, and a stack or two out in the room.
      for (let i = rng.int(2, 3); i > 0; i--) d.againstWall('shelf');
      for (let i = rng.int(3, 5); i > 0; i--) d.againstWall('crates', { turn: rng.range(-0.3, 0.3) });
      for (let i = rng.int(2, 4); i > 0; i--) d.againstWall('barrel', { round: true, turn: rng.range(0, 6) });
      for (let i = rng.int(2, 3); i > 0; i--) d.againstWall('sacks', { turn: rng.range(-0.5, 0.5) });
      for (let i = rng.int(1, 2); i > 0; i--) d.inOpen('crates', { yaw: rng.range(-0.3, 0.3) });
      if (rng.chance(0.4)) d.inOpen('barrel', { round: true });
    },
    stock(s, room) {
      for (let i = s.rng.int(1, 2); i > 0; i--) s.chest(room);
      if (s.rng.chance(0.5)) s.loose(room, makeItem('food', 'ration'));
    },
  },

  // The Sewers' pipework: mains along the foot of the walls and rising into the vault, valves and drains, slime
  // weeping from the joints and water standing on the floor.
  pipeworks: {
    themes: ['sewers'], special: { chance: 0.45 },
    size: (rng) => ({ w: rng.int(5, 8), h: rng.int(5, 7) }),
    doors: 'mixed', branchable: true, monsters: true, items: true, traps: true, pools: true,
    props: ['floor_pipe', 'pipe_riser', 'drain_pipe', 'pipe_valve', 'floor_drain'],
    furnish() {},
    dress(d) {
      const { rng } = d;
      for (let i = rng.int(2, 3); i > 0; i--) d.onWall('pipe_riser');
      for (let i = rng.int(2, 4); i > 0; i--) d.onWall('floor_pipe');
      for (let i = rng.int(1, 2); i > 0; i--) d.onWall('pipe_valve');
      for (let i = rng.int(1, 2); i > 0; i--) d.onWall('drain_pipe');
      for (let i = rng.int(1, 2); i > 0; i--) d.onFloor('floor_drain');
      for (let i = rng.int(2, 4); i > 0; i--) d.onFloor('puddle', { size: rng.range(0.8, 1.8) });
    },
  },

  // The Catacombs' oubliettes, on two floors (see oubliette in generator.js), each the shape its design gives it (see
  // oublietteDesign). On the lower, a cell behind a locked door, its vault fallen in over most of it (`vaultHole`), the
  // rubble of it heaped on the floor: a cot, shackles, and on the floor against its wall, someone who died in it, with
  // its key on them (and whatever else they had: search the body, as you'd open a chest; it may not be all that's left
  // of them, though). You come down through the hole, if you jump, under where you jumped from (see Game.arrive), or by
  // default at `drop`, the middle of it: there's no climbing back up. No lights: only what comes down from the room above.
  oubliette: {
    themes: ['catacombs'],
    size: (rng, depth, design) => ({ w: design.w, h: design.h }),
    doors: 'door', branchable: false, monsters: false, items: false, traps: false, pools: false,
    props: ['prison_bed', 'corpse', 'shackles', 'collapse_heap', 'collapse_debris'],
    furnish(ctx, room) {
      const c = room.design, mid = holeMiddle(c);
      ctx.vaultHole = { x: room.x, y: room.y, w: c.w, h: c.h, hole: c.hole, key: c.key };
      ctx.drop = { x: room.x + mid.x, y: room.y + mid.y };
      room.sconces = [];
    },
    dress(d) {
      const { room, rng } = d, c = room.design, under = (x, y) => c.hole[(y - room.y) * c.w + x - room.x] === 1;
      const bed = d.againstWall('prison_bed');
      d.onWall('shackles');
      if (rng.chance(0.5)) d.onWall('shackles');
      // What came down: a heap of it in the middle, under the middle of the hole, and the rest strewn about under it.
      const mid = holeMiddle(c);
      d.add({ type: 'collapse_heap', x: room.x + mid.x + 0.5 + rng.range(-0.2, 0.2), y: room.y + mid.y + 0.5 + rng.range(-0.2, 0.2), yaw: rng.range(0, Math.PI * 2), solid: false });
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (!under(x, y) || (x === room.x + mid.x && y === room.y + mid.y) || (bed && Math.floor(bed.x) === x && Math.floor(bed.y) === y) || !rng.chance(0.45)) continue;
          d.add({ type: 'collapse_debris', x: x + rng.range(0.3, 0.7), y: y + rng.range(0.3, 0.7), yaw: rng.range(0, Math.PI * 2), solid: false });
        }
      }
      // Cobwebs only in the corners the vault's still over.
      d.cobwebs(0.7, (x, y) => !under(x, y));
    },
    stock(s, room) {
      // The body: the cell door's key, what it had on it, and a little gold.
      const loot = [makeItem('key', 'iron', { depth: s.depth }), ...chestLoot(s.rng, s.depth, 'chest'), goldPile(s.rng, s.depth)];
      if (!s.chest(room, 'corpse', loot)) for (const it of loot) s.loose(room, it); // (no wall free for it: it all lies loose)
    },
  },
  // And on the floor above, a room whose floor has fallen in over the cell: the same hole (PIT tiles: `pit`), the cell
  // under it to be seen as it is (see `below` in generator.js), and to jump down into (see Game.jumpDown). It's the
  // cell's size and a tile more all round, so there's always a way round the hole, clear of anything that would block
  // it: only things on its walls, the odd piece of the fall at the edge, and no chests.
  oubliette_mouth: {
    themes: ['catacombs'],
    size: (rng, depth, design) => ({ w: design.w + 2, h: design.h + 2 }),
    doors: 'mixed', branchable: true, monsters: true, items: false, traps: true, pools: false,
    props: ['collapse_debris'],
    furnish(ctx, room) {
      const c = room.design;
      for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) if (c.hole[j * c.w + i]) ctx.set(room.x + 1 + i, room.y + 1 + j, T.PIT);
      ctx.pit = { x: room.x + 1, y: room.y + 1, w: c.w, h: c.h, hole: c.hole, key: c.key };
    },
    dress(d) {
      const { rng } = d;
      // Its lights chosen here, not at random as the level's built, so the room's the same seen from the cell below.
      d.sconce();
      if (rng.chance(0.6)) d.sconce();
      if (rng.chance(0.5)) d.onWall('cell_door');
      if (rng.chance(0.5)) d.onWall(rng.chance(0.55) ? 'chained_skeleton' : 'shackles');
      if (rng.chance(0.6)) d.onWall('wall_niches');
      if (rng.chance(0.4)) d.againstWall('candles', { solid: false, turn: rng.range(0, 6) });
      for (let i = rng.int(1, 3); i > 0; i--) d.onFloor('collapse_debris');
      d.cobwebs(0.5);
    },
  },
};

/**
 * An oubliette's shape (see rooms.js), the same on both its floors, from the seed and the cell's floor alone: the cell's
 * size (`w` by `h` tiles inside), and which of its tiles the vault (and the floor above) has fallen in over (`hole`, 1
 * for each, row by row): all but the odd tile round its edge, so the hole's jagged, and covers about half the room above.
 * `key` sets how its broken edges are broken (see collapseEdges in levelBuilder.js).
 */
export function oublietteDesign(seed, depth) {
  const rng = new RNG(`${seed}:oubliette:${depth}:design`);
  const w = rng.int(5, 6), h = rng.int(5, 6), hole = new Uint8Array(w * h).fill(1);
  const edge = (i, j) => i === 0 || j === 0 || i === w - 1 || j === h - 1, corner = (i, j) => (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (edge(i, j) && !corner(i, j) && rng.chance(0.2)) hole[j * w + i] = 0;
  // A corner stays only beside another tile of the hole along the edge, so the hole never meets itself only at a corner.
  for (const [i, j, a, b] of [[0, 0, 1, w], [w - 1, 0, -1, w], [0, h - 1, 1, -w], [w - 1, h - 1, -1, -w]]) {
    const k = j * w + i;
    if (rng.chance(0.4) || (!hole[k + a] && !hole[k + b])) hole[k] = 0;
  }
  return { w, h, hole, key: depth };
}

/** The tile of a design's hole nearest the middle of it, in the cell (x, y from its corner). */
function holeMiddle({ w, h, hole }) {
  let sx = 0, sy = 0, n = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hole[j * w + i]) { sx += i; sy += j; n++; }
  let best = null;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = Math.hypot(i - sx / n, j - sy / n);
      if (hole[j * w + i] && (!best || d < best.d)) best = { x: i, y: j, d };
    }
  }
  return best;
}

// Sides of a room, and how a prop against the wall on each side turns to face into the room (as generator.js has them).
const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const FACING = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

/** The props the rooms that bring their own (`props`) use on a theme's floors, so they're fetched before its floors are built. */
export const roomProps = (style) => [...new Set(Object.values(ROOM_TYPES)
  .filter((r) => r.props && (!r.themes || r.themes.includes(style)))
  .flatMap((r) => r.props))];

/** The props a shop is furnished with. */
export const SHOP_PROPS = ['shop_counter', 'display_plinth', 'display_table', 'shelf', 'barrel', 'crates', 'rug', 'tapestry', 'weapon_rack', 'sacks'];

// How far from the side walls the middle of a display table stands (its back just off the wall), and how far from the
// door's wall the middles of the tables nearer it and further from it are, in tiles.
const TABLE_IN = 0.27, TABLE_NEAR = 1.75, TABLE_FAR = 3.55;

/**
 * Lays the shop out relative to its door, in local coordinates: u runs along the back wall (left to right as you come
 * in) and v from the back wall toward the door, both in tiles; the door is in the middle of its wall (see `centred`),
 * so you come in facing the shopkeeper. Returns positions in (fractional) grid tiles; yaw 0 faces +z.
 *   keeper    where the shopkeeper stands, and which way it faces
 *   props     furniture: { type, x, y, yaw, solid, round, resale }; props with display slots hold the wares: the
 *             counter, the two plinths either side of it and the four tables down the sides, then the rug, where
 *             things the player sells go first (`resale: true`), and then any free spot but the plinths'
 *             (`resale: false`)
 *   stock     [{ item, price } or null], set out in the props' slots in order (see shopStock)
 *   sconces   spots on the side walls for blue-flamed sconces: { x, z (world), ry }
 */
function layoutShop(rng, depth, room, wares) {
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
  // Two tables down each side, their backs to the wall, between the counter's end of the room and a clear strip inside
  // the door's wall. On your left as you come in, the scrolls' by the door and the potions' toward the counter; on your
  // right, the arrows and things to throw by the door, and the gear toward the counter (in that order in shopStock).
  const left = Math.PI / 2, right = -Math.PI / 2; // (turns a prop on that side to face into the room)
  const props = [
    prop('shop_counter', mid, 1.0),
    prop('display_plinth', mid - 1.5, 1.0, 0, { round: true, resale: false }),
    prop('display_plinth', mid + 1.5, 1.0, 0, { round: true, resale: false }),
    prop('display_table', TABLE_IN, V - TABLE_NEAR, left),
    prop('display_table', TABLE_IN, V - TABLE_FAR, left),
    prop('display_table', U - TABLE_IN, V - TABLE_NEAR, right),
    prop('display_table', U - TABLE_IN, V - TABLE_FAR, right),
    // The merchant's hanging on the wall behind the counter, shelves of oddments in the back corners with a barrel and
    // crates before them, a rack of weapons by the door and sacks of stores across from it.
    prop('tapestry', mid, 0, 0, { solid: false }),
    prop('shelf', 0.55, 0.22),
    prop('shelf', U - 0.55, 0.22),
    prop('barrel', 0.4, 1.3, rng.range(0, 6), { round: true }),
    prop('crates', U - 0.45, 1.35, Math.PI / 2),
    prop('weapon_rack', 0, V - 0.7, left),
    prop('sacks', U - 0.55, V - 0.6, rng.range(-0.4, 0.4)),
    prop('rug', mid, (V + 1.2) / 2, 0, { solid: false, resale: true }),
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
    stock: shopStock(rng, depth, wares),
    // 0.1 m out from each side wall, level with the counter, facing into the room.
    sconces: [sconce(0.05, Math.PI / 2), sconce(U - 0.05, -Math.PI / 2)],
  };
}
