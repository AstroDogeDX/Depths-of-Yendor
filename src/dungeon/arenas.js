import { RNG } from '../rng.js';
import { TILE, FLOORS_PER_THEME, themeForDepth } from '../config.js';
import { makeItem, chestLoot, randomItem } from '../items/generate.js';
import { T } from './tiles.js';
import { faceKey, wallFace } from './decor.js';

// Boss floors laid out by hand rather than generated: a fixed arena for the boss, the way to it and the way on. Each is
// { build(seed, depth), props, arrive }: `build` gives the floor's data as generateLevel does (see generator.js), with
//   lair     the room its boss never leaves: { x, y, w, h } in tiles (see monsters/bosses.js)
//   blend    the next theme, worked in round the way on so the crossing into it is a gradual one: { theme, mix }, `mix`
//            holding each tile's share (0..1) of its floor, vault and walls in the next theme's stone (see
//            buildLevelMeshes in levelBuilder.js)
//   restock  false: the dungeon doesn't restock it (see Level.update), but for the Amulet's hunters
// and its rooms may bring their own wall lights (`sconces`: spots as buildSconces takes them) and doors their own
// model (`model`) and lock (`lock`: 'boss', opened by the boss key its boss leaves). `props` are the props it needs
// beyond its theme's (see propsForFloor in levelBuilder.js), and `arrive` what the log says the first time you come.
// For now only the Sewers' has one: the rest are built like any other floor.

const SIDE_SPOT = {
  // A wall light's spot on the wall on `side` of tile (x, y), 0.1 m out from it and facing into the room (see
  // buildSconces in levelBuilder.js).
  N: (x, y) => ({ x: (x + 0.5) * TILE, z: y * TILE + 0.1, ry: 0 }),
  S: (x, y) => ({ x: (x + 0.5) * TILE, z: (y + 1) * TILE - 0.1, ry: Math.PI }),
  W: (x, y) => ({ x: x * TILE + 0.1, z: (y + 0.5) * TILE, ry: Math.PI / 2 }),
  E: (x, y) => ({ x: (x + 1) * TILE - 0.1, z: (y + 0.5) * TILE, ry: -Math.PI / 2 }),
};

/**
 * The Sewers' last floor: the Maledicted Ooze's lair (see MONSTERS.maledicted_ooze). You come down a ladder into a
 * small room, and through an archway into a great square hall, 13 tiles across, with four square pillars standing in
 * it, and an L of standing water behind each, in the corner it makes: cover from the ooze's globs, and water to wash
 * their malediction off. The ooze lies in its filth in the middle. Across the hall, a door chained shut that only its
 * key opens leads into a passage where the sewer's brick gives way to the old stone of the Catacombs, and into a
 * crypt with their steps on down.
 *
 * In tiles: the hall's corner is at (AX, AY); its pillars stand 3 in from its walls, 2 tiles square, each with its L
 * of water round its outer corner (`L`); the rooms before and after it stand on its middle line.
 */
const W = 40, H = 40;
const AX = 13, AY = 10, AW = 13, AH = 13; // the hall
const CX = AX + (AW >> 1); // the middle line, through all of it
const PILLARS = [[3, 3], [8, 3], [3, 8], [8, 8]]; // each pillar's corner nearest the hall's, in the hall
// The water behind each pillar (by the corner it's in, as dx, dy from the hall's middle): along the side away from the
// middle and down the other, 5 tiles, as offsets from the pillar's corner.
const L = (sx, sy) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [-1, 1]].map(([dx, dy]) => [sx < 0 ? dx : 1 - dx, sy < 0 ? dy : 1 - dy]);
const ARRIVAL = { x: CX - 2, y: AY - 5, w: 5, h: 4 }; // the room you come down into, its south wall the hall's north
const PASSAGE = { x: CX, y: AY + AH + 1, w: 1, h: 4 }; // behind the hall's door
const CRYPT = { x: CX - 2, y: PASSAGE.y + PASSAGE.h + 1, w: 5, h: 5 }; // the way on down
// How much of each tile down the passage is the Catacombs', from the door to the crypt.
const PASSAGE_MIX = [0.12, 0.38, 0.65, 0.9];

function oozeLair(seed, depth) {
  const rng = new RNG(`${seed}:depth:${depth}:lair`);
  const grid = new Uint8Array(W * H); // all WALL
  const idx = (x, y) => y * W + x;
  const set = (x, y, t) => { grid[idx(x, y)] = t; };
  const rooms = [];
  const room = (type, r, extra = {}) => {
    const out = { id: rooms.length, type, ...r, cx: r.x + (r.w >> 1), cy: r.y + (r.h >> 1), doorStyle: 'arch', doorways: [], onLoop: false, locked: false, ...extra };
    rooms.push(out);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, T.FLOOR);
    return out;
  };
  const arrival = room('entrance', ARRIVAL, { onLoop: true });
  const hall = room('arena', { x: AX, y: AY, w: AW, h: AH }, { onLoop: true });
  // (Behind a lock, so nothing is sent there: no teleport, no wanderer.)
  const passage = room('passage', PASSAGE, { locked: true });
  const crypt = room('exit', CRYPT, { locked: true });

  // The doorways: an archway into the hall, the boss's door out of it, and an archway into the crypt.
  const doorways = [];
  const join = (a, b, x, y, extra = {}) => {
    const dw = { x, y, side: 'S', room: a.id, style: 'arch', locked: false, kind: 'loop', ...extra };
    set(x, y, dw.style === 'door' ? T.DOOR : T.FLOOR);
    a.doorways.push(dw);
    b.doorways.push({ ...dw, side: 'N', room: b.id });
    doorways.push(dw);
  };
  join(arrival, hall, CX, AY - 1);
  join(hall, passage, CX, AY + AH, { style: 'door', locked: true, lock: 'boss', model: 'door_boss', kind: 'branch' });
  join(passage, crypt, CX, CRYPT.y - 1, { kind: 'branch' });

  // The pillars, and the water behind them.
  const pools = [];
  for (const [px, py] of PILLARS) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(AX + px + dx, AY + py + dy, T.WALL);
    const sx = Math.sign(px + 1 - AW / 2), sy = Math.sign(py + 1 - AH / 2);
    const tiles = L(sx, sy).map(([dx, dy]) => ({ x: AX + px + dx, y: AY + py + dy }));
    for (const t of tiles) set(t.x, t.y, T.POOL);
    pools.push({ room: hall.id, tiles });
  }

  // The ladder up, against the back wall of the room you come into, and the Catacombs' steps down, at the back of the
  // crypt (`style`: whose stairs they are, if not the floor's theme's).
  const up = { x: CX, y: ARRIVAL.y, dir: 2 };
  const down = { x: CX, y: CRYPT.y + CRYPT.h - 1, dir: 0, style: themeForDepth(depth + 1).style };
  set(up.x, up.y, T.STAIRS_UP);
  set(down.x, down.y, T.STAIRS_DOWN);

  // Wall lights: round the hall, two on each wall, either side of its doorways and level with its pillars; one either
  // side of the rooms before and after it; one in the passage.
  const wallUsed = new Set();
  const lights = (r, faces) => {
    r.sconces = faces.map(([x, y, side]) => SIDE_SPOT[side](x, y));
    for (const [x, y, side] of faces) wallUsed.add(faceKey(x, y, side));
  };
  lights(hall, [
    [AX, AY + 3, 'W'], [AX, AY + 9, 'W'], [AX + AW - 1, AY + 3, 'E'], [AX + AW - 1, AY + 9, 'E'],
    [CX - 2, AY, 'N'], [CX + 2, AY, 'N'], [CX - 2, AY + AH - 1, 'S'], [CX + 2, AY + AH - 1, 'S'],
  ]);
  lights(arrival, [[ARRIVAL.x, ARRIVAL.y + 2, 'W'], [ARRIVAL.x + ARRIVAL.w - 1, ARRIVAL.y + 2, 'E']]);
  lights(passage, [[CX, PASSAGE.y, 'E']]);
  lights(crypt, [[CRYPT.x, CRYPT.y + 1, 'W'], [CRYPT.x + CRYPT.w - 1, CRYPT.y + 1, 'E']]);

  // Dressing. Props as decorate() lays them (see decor.js); `taint` is the ooze's filth, a stain the level builder
  // paints itself, as it does puddles and cobwebs.
  const decor = [];
  const onWall = (type, x, y, side) => {
    wallUsed.add(faceKey(x, y, side));
    decor.push({ type, ...wallFace(x, y, side), solid: false, wall: true });
  };
  const loose = (type, x, y, extra = {}) => decor.push({ type, x, y, yaw: rng.range(0, Math.PI * 2), solid: false, ...extra });
  const puddle = (x, y) => decor.push({ type: 'puddle', x, y, size: rng.range(0.8, 1.6), yaw: rng.range(0, Math.PI * 2) });
  // The hall: drain pipes over the water, valve wheels, the ooze's filth where it lies, what's left of those it took,
  // rubble in the corners, puddles. (Nothing in it is solid but its pillars, so there's no nook the ooze can't reach
  // you in.)
  for (const x of [AX + 2, AX + AW - 3]) {
    onWall('drain_pipe', x, AY, 'N');
    onWall('drain_pipe', x, AY + AH - 1, 'S');
  }
  onWall('pipe_valve', AX, AY + 6, 'W');
  onWall('pipe_valve', AX + AW - 1, AY + 6, 'E');
  decor.push({ type: 'taint', x: CX + 0.5, y: AY + AH / 2, size: 3.4, yaw: rng.range(0, Math.PI * 2) });
  for (const [x, y] of [[CX - 1.6, AY + 4.6], [CX + 2.2, AY + 8.2], [CX + 0.4, AY + 9.4]]) loose('taint', x, y, { size: rng.range(0.7, 1.2) });
  loose('bone_pile', AX + 0.75, AY + 0.75);
  loose('bone_pile', AX + AW - 0.8, AY + AH - 0.75);
  loose('bone_pile', CX + 1.3, AY + 6.9, { yaw: 2.1 });
  loose('rubble', AX + AW - 0.6, AY + 0.6, { yaw: -0.7 });
  loose('rubble', AX + 0.55, AY + AH - 0.6, { yaw: 2.3 });
  for (const [x, y] of [[AX + 5.6, AY + 1.3], [AX + 11.3, AY + 6.4], [AX + 1.6, AY + 5.8], [AX + 7.4, AY + 11.6]]) puddle(x, y);
  // The room you come down into.
  onWall('drain_pipe', ARRIVAL.x, ARRIVAL.y, 'N');
  loose('rubble', ARRIVAL.x + ARRIVAL.w - 0.6, ARRIVAL.y + 0.6, { yaw: 0.5 });
  puddle(ARRIVAL.x + 3.4, ARRIVAL.y + 2.6);
  // The passage, the Sewers' and the Catacombs' things mixing as their stone does: a puddle seeping on into the old
  // stone, bones strewn back into the sewer, cobwebs in the corners as it opens into the crypt.
  puddle(CX + 0.5, PASSAGE.y + 2.5);
  loose('bone_pile', CX + 0.85, PASSAGE.y + 1.6, { yaw: 0.4 });
  decor.push({ type: 'cobweb', x: CX, y: CRYPT.y - 1, corner: [1, -1] }, { type: 'cobweb', x: CX + 1, y: CRYPT.y - 1, corner: [-1, -1] });
  // The crypt: burial niches in its walls, candles burning either side of the steps down, a grave slab before them, a
  // heap of bones, cobwebs in its corners.
  onWall('wall_niches', CRYPT.x, CRYPT.y + 3, 'W');
  onWall('wall_niches', CRYPT.x + CRYPT.w - 1, CRYPT.y + 3, 'E');
  decor.push({ type: 'candles', x: down.x - 0.62, y: down.y + 0.55, yaw: rng.range(0, 6), solid: false });
  decor.push({ type: 'candles', x: down.x + 1.62, y: down.y + 0.55, yaw: rng.range(0, 6), solid: false });
  decor.push({ type: 'grave_slab', x: CX + 0.5, y: CRYPT.y + 1.6, yaw: Math.PI / 2, solid: false });
  loose('bone_pile', CRYPT.x + 0.7, CRYPT.y + 0.7);
  for (const [x, y, dx, dy] of [[CRYPT.x, CRYPT.y, 1, 1], [CRYPT.x + CRYPT.w, CRYPT.y, -1, 1], [CRYPT.x, CRYPT.y + CRYPT.h, 1, -1], [CRYPT.x + CRYPT.w, CRYPT.y + CRYPT.h, -1, -1]]) {
    decor.push({ type: 'cobweb', x, y, corner: [dx, dy] });
  }

  // The crossing into the Catacombs: their stone in the crypt and the archway into it, and more and more of it down the
  // passage (see blend).
  const mix = new Float32Array(W * H);
  for (let y = CRYPT.y - 1; y < CRYPT.y + CRYPT.h; y++) for (let x = CRYPT.x; x < CRYPT.x + CRYPT.w; x++) mix[idx(x, y)] = 1;
  PASSAGE_MIX.forEach((k, i) => { mix[idx(CX, PASSAGE.y + i)] = k; });

  // The ooze, asleep in its filth, and what it will spill when it dies: the key to its door, what it swallowed of
  // those who came before (a treasure, as a locked chest holds, and something more), and their gold.
  const loot = [makeItem('key', 'boss', { depth }), ...chestLoot(rng, depth, 'locked'), randomItem(rng, depth + 2)];
  const monsters = [{ type: 'maledicted_ooze', x: CX, y: AY + (AH >> 1), asleep: true, boss: true, loot }];
  // A ration, left by whoever came down here before you.
  const items = [{ item: makeItem('food', 'ration'), x: ARRIVAL.x + 1, y: ARRIVAL.y + 2 }];

  return {
    depth, w: W, h: H, grid, rooms, doorways, doors: doorways.filter((d) => d.style === 'door'),
    edges: [{ a: arrival.id, b: hall.id, kind: 'loop', locked: false }, { a: hall.id, b: passage.id, kind: 'branch', locked: true },
      { a: passage.id, b: crypt.id, kind: 'branch', locked: false }],
    up, down, amulet: null, shrine: null, shop: null, channels: [], pools, decor, wallUsed,
    monsters, items, chests: [], traps: [], theme: themeForDepth(depth),
    lair: { x: hall.x, y: hall.y, w: hall.w, h: hall.h }, blend: { theme: themeForDepth(depth + 1), mix }, restock: false,
  };
}

const ARENAS = {
  [FLOORS_PER_THEME]: {
    build: oozeLair,
    props: ['door_boss', 'stairs_down_catacombs', 'bone_pile', 'wall_niches', 'candles', 'grave_slab'],
    arrive: 'A foul stench rolls up out of the dark ahead, and something vast stirs in it, breathing.',
  },
};

/** The fixed arena floor `depth` is (see above), or null if it's generated like any other. */
export const arenaFor = (depth) => ARENAS[depth] ?? null;
