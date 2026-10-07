import { RNG } from '../rng.js';
import { TILE, FLOORS_PER_THEME, themeForDepth } from '../config.js';
import { makeItem, chestLoot, randomItem } from '../items/generate.js';
import { T } from './tiles.js';
import { faceKey, wallFace } from './decor.js';

// Boss floors laid out by hand rather than generated: a fixed arena for the boss, the way to it and the way on. Each is
// { build(seed, depth), props, arrive }: `build` gives the floor's data as generateLevel does (see generator.js), with
//   lair     the room its boss keeps to: { x, y, w, h } in tiles (see monsters/bosses.js: the ooze never leaves it, the
//            Jailer walks his rounds of it), and where in it the Jailer hides (`hides`)
//   blend    the next theme, worked in round the way on so the crossing into it is a gradual one: { theme, mix }, `mix`
//            holding each tile's share (0..1) of its floor, vault and walls in the next theme's stone (see
//            buildLevelMeshes in levelBuilder.js), and, where the next theme's rock is rough, how rough it is there
//   restock  false: the dungeon doesn't restock it (see Level.update), but for the Amulet's hunters
// and its rooms may bring their own wall lights (`sconces`: spots as buildSconces takes them, of the floor's theme's
// kind, or their own `kind`) and doors their own model (`model`) and lock (`lock`: 'boss', opened by the boss key its
// boss leaves). `props` are the props it needs beyond its theme's (see propsForFloor in levelBuilder.js), and `arrive`
// what the log says the first time you come. So far the Sewers' and the Catacombs' have one: the rest are built like
// any other floor.

const W = 40, H = 40; // every arena's map, in tiles

const SIDE_SPOT = {
  // A wall light's spot on the wall on `side` of tile (x, y), 0.1 m out from it and facing into the room (see
  // buildSconces in levelBuilder.js).
  N: (x, y) => ({ x: (x + 0.5) * TILE, z: y * TILE + 0.1, ry: 0 }),
  S: (x, y) => ({ x: (x + 0.5) * TILE, z: (y + 1) * TILE - 0.1, ry: Math.PI }),
  W: (x, y) => ({ x: x * TILE + 0.1, z: (y + 0.5) * TILE, ry: Math.PI / 2 }),
  E: (x, y) => ({ x: (x + 1) * TILE - 0.1, z: (y + 0.5) * TILE, ry: -Math.PI / 2 }),
};

/**
 * What an arena is laid out with: its seeded `rng`, its `grid` (all wall to begin with), and helpers that lay rooms
 * (`room`), join them (`join`: a doorway in the wall between a room and the one south of it), light them (`lights`),
 * dress them (`onWall`, `loose`, `puddle`, `cobwebs`), work the next theme in (`blend`), and put it all together
 * (`finish`).
 */
function arenaKit(seed, depth) {
  const rng = new RNG(`${seed}:depth:${depth}:lair`);
  const grid = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const set = (x, y, t) => { grid[idx(x, y)] = t; };
  const rooms = [], doorways = [], decor = [], wallUsed = new Set(), mix = new Float32Array(W * H);
  return {
    rng, grid, idx, set, rooms, doorways, decor, wallUsed, mix,
    room(type, r, extra = {}) {
      const out = { id: rooms.length, type, ...r, cx: r.x + (r.w >> 1), cy: r.y + (r.h >> 1), doorStyle: 'arch', doorways: [], onLoop: false, locked: false, ...extra };
      rooms.push(out);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, T.FLOOR);
      return out;
    },
    /** A doorway at (x, y) in the wall between room `a` and room `b` south of it: an archway, or (`style` 'door') a door. */
    join(a, b, x, y, extra = {}) {
      const dw = { x, y, side: 'S', room: a.id, style: 'arch', locked: false, kind: 'loop', ...extra };
      set(x, y, dw.style === 'door' ? T.DOOR : T.FLOOR);
      a.doorways.push(dw);
      b.doorways.push({ ...dw, side: 'N', room: b.id });
      doorways.push(dw);
    },
    /** Wall lights on these faces ([x, y, side, kind?]) of room `r`, and none elsewhere in it. */
    lights(r, faces) {
      r.sconces = faces.map(([x, y, side, kind]) => ({ ...SIDE_SPOT[side](x, y), ...(kind ? { kind } : {}) }));
      for (const [x, y, side] of faces) wallUsed.add(faceKey(x, y, side));
    },
    onWall(type, x, y, side) {
      wallUsed.add(faceKey(x, y, side));
      decor.push({ type, ...wallFace(x, y, side), solid: false, wall: true });
    },
    loose: (type, x, y, extra = {}) => decor.push({ type, x, y, yaw: rng.range(0, Math.PI * 2), solid: false, ...extra }),
    puddle: (x, y) => decor.push({ type: 'puddle', x, y, size: rng.range(0.8, 1.6), yaw: rng.range(0, Math.PI * 2) }),
    /** Cobwebs in the corners ([x, y, dx, dy]: a corner of the grid, and the way into the room from it). */
    cobwebs: (corners) => { for (const [x, y, dx, dy] of corners) decor.push({ type: 'cobweb', x, y, corner: [dx, dy] }); },
    /** The next theme's share (0..1) of the tiles from (x0, y0) to (x1, y1), walls and all. */
    blend(x0, y0, x1, y1, share) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mix[idx(x, y)] = share;
    },
    finish({ up, down, pools = [], monsters, items, lair, edges }) {
      set(up.x, up.y, T.STAIRS_UP);
      set(down.x, down.y, T.STAIRS_DOWN);
      return {
        depth, w: W, h: H, grid, rooms, doorways, doors: doorways.filter((d) => d.style === 'door'), edges,
        up, down, amulet: null, shrine: null, shop: null, channels: [], pools, decor, wallUsed,
        monsters, items, chests: [], traps: [], theme: themeForDepth(depth),
        lair, blend: { theme: themeForDepth(depth + 1), mix }, restock: false,
      };
    },
  };
}

/**
 * What a boss (its monster type) spills when it dies: its key to its door (see BOSS_KEYS), a treasure (as a locked chest
 * holds), gold twice the usual, and something more.
 */
const spoils = (rng, depth, boss) => [makeItem('key', 'boss', { depth, boss }), ...chestLoot(rng, depth, 'locked'), randomItem(rng, depth + 2)];

// --- The Sewers' last floor ---

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
const AX = 13, AY = 10, AW = 13, AH = 13; // the hall
const CX = AX + (AW >> 1); // the middle line, through all of it
const PILLARS = [[3, 3], [8, 3], [3, 8], [8, 8]]; // each pillar's corner nearest the hall's, in the hall
// The water behind each pillar (by the corner it's in, as dx, dy from the hall's middle): along the side away from the
// middle and down the other, 5 tiles, as offsets from the pillar's corner.
const L = (sx, sy) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [-1, 1]].map(([dx, dy]) => [sx < 0 ? dx : 1 - dx, sy < 0 ? dy : 1 - dy]);
const ARRIVAL = { x: CX - 2, y: AY - 5, w: 5, h: 4 }; // the room you come down into, its south wall the hall's north
const PASSAGE = { x: CX, y: AY + AH + 1, w: 1, h: 4 }; // behind the hall's door
const CRYPT = { x: CX - 2, y: PASSAGE.y + PASSAGE.h + 1, w: 5, h: 5 }; // the way on down
// How much of each tile down a passage is the next theme's, from the boss's door to the room beyond.
const PASSAGE_MIX = [0.12, 0.38, 0.65, 0.9];

function oozeLair(seed, depth) {
  const k = arenaKit(seed, depth), { rng, set, decor } = k;
  const arrival = k.room('entrance', ARRIVAL, { onLoop: true });
  const hall = k.room('arena', { x: AX, y: AY, w: AW, h: AH }, { onLoop: true });
  // (Behind a lock, so nothing is sent there: no teleport, no wanderer.)
  const passage = k.room('passage', PASSAGE, { locked: true });
  const crypt = k.room('exit', CRYPT, { locked: true });

  // The doorways: an archway into the hall, the boss's door out of it, and an archway into the crypt.
  k.join(arrival, hall, CX, AY - 1);
  k.join(hall, passage, CX, AY + AH, { style: 'door', locked: true, lock: 'boss', model: 'door_boss_catacombs', kind: 'branch' });
  k.join(passage, crypt, CX, CRYPT.y - 1, { kind: 'branch' });

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

  // Wall lights: round the hall, two on each wall, either side of its doorways and level with its pillars; one either
  // side of the rooms before and after it; one in the passage.
  k.lights(hall, [
    [AX, AY + 3, 'W'], [AX, AY + 9, 'W'], [AX + AW - 1, AY + 3, 'E'], [AX + AW - 1, AY + 9, 'E'],
    [CX - 2, AY, 'N'], [CX + 2, AY, 'N'], [CX - 2, AY + AH - 1, 'S'], [CX + 2, AY + AH - 1, 'S'],
  ]);
  k.lights(arrival, [[ARRIVAL.x, ARRIVAL.y + 2, 'W'], [ARRIVAL.x + ARRIVAL.w - 1, ARRIVAL.y + 2, 'E']]);
  k.lights(passage, [[CX, PASSAGE.y, 'E']]);
  k.lights(crypt, [[CRYPT.x, CRYPT.y + 1, 'W'], [CRYPT.x + CRYPT.w - 1, CRYPT.y + 1, 'E']]);

  // Dressing. Props as decorate() lays them (see decor.js); `taint` is the ooze's filth, a stain the level builder
  // paints itself, as it does puddles and cobwebs.
  // The hall: drain pipes over the water, valve wheels, the ooze's filth where it lies, what's left of those it took,
  // rubble in the corners, puddles. (Nothing in it is solid but its pillars, so there's no nook the ooze can't reach
  // you in.)
  for (const x of [AX + 2, AX + AW - 3]) {
    k.onWall('drain_pipe', x, AY, 'N');
    k.onWall('drain_pipe', x, AY + AH - 1, 'S');
  }
  k.onWall('pipe_valve', AX, AY + 6, 'W');
  k.onWall('pipe_valve', AX + AW - 1, AY + 6, 'E');
  decor.push({ type: 'taint', x: CX + 0.5, y: AY + AH / 2, size: 3.4, yaw: rng.range(0, Math.PI * 2) });
  for (const [x, y] of [[CX - 1.6, AY + 4.6], [CX + 2.2, AY + 8.2], [CX + 0.4, AY + 9.4]]) k.loose('taint', x, y, { size: rng.range(0.7, 1.2) });
  k.loose('bone_pile', AX + 0.75, AY + 0.75);
  k.loose('bone_pile', AX + AW - 0.8, AY + AH - 0.75);
  k.loose('bone_pile', CX + 1.3, AY + 6.9, { yaw: 2.1 });
  k.loose('rubble', AX + AW - 0.6, AY + 0.6, { yaw: -0.7 });
  k.loose('rubble', AX + 0.55, AY + AH - 0.6, { yaw: 2.3 });
  for (const [x, y] of [[AX + 5.6, AY + 1.3], [AX + 11.3, AY + 6.4], [AX + 1.6, AY + 5.8], [AX + 7.4, AY + 11.6]]) k.puddle(x, y);
  // The room you come down into.
  k.onWall('drain_pipe', ARRIVAL.x, ARRIVAL.y, 'N');
  k.loose('rubble', ARRIVAL.x + ARRIVAL.w - 0.6, ARRIVAL.y + 0.6, { yaw: 0.5 });
  k.puddle(ARRIVAL.x + 3.4, ARRIVAL.y + 2.6);
  // The passage, the Sewers' and the Catacombs' things mixing as their stone does: a puddle seeping on into the old
  // stone, bones strewn back into the sewer, cobwebs in the corners as it opens into the crypt.
  k.puddle(CX + 0.5, PASSAGE.y + 2.5);
  k.loose('bone_pile', CX + 0.85, PASSAGE.y + 1.6, { yaw: 0.4 });
  k.cobwebs([[CX, CRYPT.y - 1, 1, -1], [CX + 1, CRYPT.y - 1, -1, -1]]);
  // The crypt: burial niches in its walls, candles burning either side of the steps down, a grave slab before them, a
  // heap of bones, cobwebs in its corners.
  k.onWall('wall_niches', CRYPT.x, CRYPT.y + 3, 'W');
  k.onWall('wall_niches', CRYPT.x + CRYPT.w - 1, CRYPT.y + 3, 'E');
  decor.push({ type: 'candles', x: down.x - 0.62, y: down.y + 0.55, yaw: rng.range(0, 6), solid: false });
  decor.push({ type: 'candles', x: down.x + 1.62, y: down.y + 0.55, yaw: rng.range(0, 6), solid: false });
  decor.push({ type: 'grave_slab', x: CX + 0.5, y: CRYPT.y + 1.6, yaw: Math.PI / 2, solid: false });
  k.loose('bone_pile', CRYPT.x + 0.7, CRYPT.y + 0.7);
  k.cobwebs([[CRYPT.x, CRYPT.y, 1, 1], [CRYPT.x + CRYPT.w, CRYPT.y, -1, 1], [CRYPT.x, CRYPT.y + CRYPT.h, 1, -1], [CRYPT.x + CRYPT.w, CRYPT.y + CRYPT.h, -1, -1]]);

  // The crossing into the Catacombs: their stone in the crypt and the archway into it, and more and more of it down the
  // passage (see blend).
  k.blend(CRYPT.x - 1, CRYPT.y - 1, CRYPT.x + CRYPT.w, CRYPT.y + CRYPT.h, 1);
  PASSAGE_MIX.forEach((share, i) => k.blend(CX - 1, PASSAGE.y + i, CX + 1, PASSAGE.y + i, share));

  // The ooze, asleep in its filth, and what it will spill when it dies: the key to its door, what it swallowed of
  // those who came before (a treasure, as a locked chest holds, and something more), and their gold.
  const monsters = [{ type: 'maledicted_ooze', x: CX, y: AY + (AH >> 1), asleep: true, boss: true, loot: spoils(rng, depth, 'maledicted_ooze') }];
  // A ration, left by whoever came down here before you.
  const items = [{ item: makeItem('food', 'ration'), x: ARRIVAL.x + 1, y: ARRIVAL.y + 2 }];

  return k.finish({
    up, down, pools, monsters, items, lair: { x: hall.x, y: hall.y, w: hall.w, h: hall.h },
    edges: [{ a: arrival.id, b: hall.id, kind: 'loop', locked: false }, { a: hall.id, b: passage.id, kind: 'branch', locked: true },
      { a: passage.id, b: crypt.id, kind: 'branch', locked: false }],
  });
}

// --- The Catacombs' last floor ---

/**
 * The Catacombs' last floor: the Forgotten Jailer's cell block (see MONSTERS.jailer). You come down a flight of steps
 * into a small room, and through an archway into the corner cell of a block of them: eight cells, 3 tiles square, in
 * two rows of four either side of an aisle 3 tiles wide down the middle. Some cells open on the aisle through a gate
 * rusted open, and some only into the cell next door, through a hole knocked in the wall between: a maze of them, with
 * ways round in loops to lose him by, and a cell or two to hide in that have only one way out. The Jailer stands
 * slumped asleep at his table in the aisle. In the far corner cell, a door chained shut that only his key opens leads
 * into a passage where the old stone gives way to the rough rock of the Caves, and into a cave with their rope ladder
 * on down.
 *
 * In tiles: the block's corner is at (BX, BY); a cell (i, j) (i 0..3 west to east, j 0 north and 2 south) is the 3 tiles
 * square from (BX + 4i, BY + 4j), the aisle the 15 by 3 from (BX, BY + 4); the walls between them a tile thick.
 */
const BX = 12, BY = 11, BW = 15, BH = 11; // the cell block
const CELL = (i, j) => [BX + 4 * i, BY + 4 * j]; // a cell's corner
// The gaps through its walls: gates from cells onto the aisle (in the walls along it: [x, y] in the block), and holes
// knocked through between cells (in a row: [x, y]) or from a cell onto the aisle. A gate's leaf hangs back against the
// aisle's wall, to the west of it for the north cells and to the east for the south.
const GATES = [[5, 3], [9, 3], [1, 7], [9, 7]];
const BREACHES = [[1, 3], [3, 1], [11, 1], [3, 9], [7, 9], [11, 9]];
const ENTRY = { x: BX - 1, y: BY - 5, w: 5, h: 4 }; // the room you come down into, over the north-west cell
const EXIT_CELL = [3, 2]; // the cell with the boss's door in its south wall
const DOWN_PASSAGE = { x: BX + 13, y: BY + BH + 1, w: 1, h: 4 }; // behind it
const CAVE = { x: BX + 11, y: DOWN_PASSAGE.y + DOWN_PASSAGE.h + 1, w: 5, h: 5 }; // the way on down

function jailerBlock(seed, depth) {
  const k = arenaKit(seed, depth), { rng, set, decor } = k;
  const entry = k.room('entrance', ENTRY, { onLoop: true });
  const block = k.room('arena', { x: BX, y: BY, w: BW, h: BH }, { onLoop: true });
  const passage = k.room('passage', DOWN_PASSAGE, { locked: true });
  const cave = k.room('exit', CAVE, { locked: true });

  // The walls between the cells and along the aisle, and the gaps through them.
  for (let x = 0; x < BW; x++) for (const y of [3, 7]) set(BX + x, BY + y, T.WALL);
  for (const x of [3, 7, 11]) for (const y of [0, 1, 2, 8, 9, 10]) set(BX + x, BY + y, T.WALL);
  for (const [x, y] of [...GATES, ...BREACHES]) set(BX + x, BY + y, T.FLOOR);

  const [ex, ey] = CELL(...EXIT_CELL);
  k.join(entry, block, BX + 1, BY - 1);
  k.join(block, passage, ex + 1, BY + BH, { style: 'door', locked: true, lock: 'boss', model: 'door_boss_caves', kind: 'branch' });
  k.join(passage, cave, ex + 1, CAVE.y - 1, { kind: 'branch' });

  // The Catacombs' steps up, against the back wall of the room you come into, and the Caves' ladder down, at the back
  // of the cave.
  const up = { x: BX + 1, y: ENTRY.y, dir: 2 };
  const down = { x: ex + 1, y: CAVE.y + CAVE.h - 1, dir: 0, style: themeForDepth(depth + 1).style };

  // Wall lights: along the aisle's walls, clear of the gates' leaves; in five of the cells; either side of the rooms
  // before and after; and in the passage, a Catacombs sconce at its near end and a Caves lantern at its far end, as the
  // cave has its own lights (`kind`).
  k.lights(block, [
    [BX, BY + 4, 'N'], [BX + 12, BY + 4, 'N'], [BX + 6, BY + 6, 'S'], [BX + 13, BY + 6, 'S'],
    [BX, BY + 1, 'W'], [BX + 8, BY, 'N'], [BX + 14, BY + 1, 'E'], [BX + 4, BY + 10, 'S'], [BX + 14, BY + 9, 'E'],
  ]);
  k.lights(entry, [[ENTRY.x, ENTRY.y + 2, 'W'], [ENTRY.x + ENTRY.w - 1, ENTRY.y + 2, 'E']]);
  k.lights(passage, [[ex + 1, DOWN_PASSAGE.y, 'E'], [ex + 1, DOWN_PASSAGE.y + 3, 'W', 'lantern']]);
  k.lights(cave, [[CAVE.x, CAVE.y + 1, 'W', 'wall_torch'], [CAVE.x + CAVE.w - 1, CAVE.y + 1, 'E', 'lantern']]);

  // The gates and the holes knocked through, standing in their gaps (their passage along z, so turned a quarter in the
  // walls running north to south). A north cell's gate faces the aisle to its south; a south cell's, to its north.
  for (const [x, y] of GATES) decor.push({ type: 'cell_gate', x: BX + x + 0.5, y: BY + y + 0.5, yaw: y < 5 ? 0 : Math.PI, solid: false });
  for (const [x, y] of BREACHES) decor.push({ type: 'breach', x: BX + x + 0.5, y: BY + y + 0.5, yaw: y === 3 || y === 7 ? 0 : Math.PI / 2, solid: false });

  // The Jailer's post, in the middle of the aisle against its north wall, and the cells: their prisoners, or what's left
  // of them, in chains, bones in heaps, cages hung from the vault, candles burnt down; cell doors along the aisle's ends
  // into cells beyond (shut), and cobwebs. The cages hang where four tiles meet, off the lines between the tiles'
  // middles that monsters walk, so none walks into one head on and sticks there.
  decor.push({ type: 'jailer_table', x: BX + 7.5, y: BY + 4.38, yaw: 0, solid: true });
  k.onWall('cell_door', BX, BY + 5, 'W');
  k.onWall('cell_door', BX + BW - 1, BY + 5, 'E');
  decor.push({ type: 'hanging_cage', x: BX + 3, y: BY + 5, yaw: rng.range(0, 6), solid: true, round: true });
  const [n0x, n0y] = CELL(0, 0), [n1x, n1y] = CELL(1, 0), [n2x, n2y] = CELL(2, 0), [n3x, n3y] = CELL(3, 0);
  const [s0x, s0y] = CELL(0, 2), [s1x, s1y] = CELL(1, 2), [s2x, s2y] = CELL(2, 2);
  k.onWall('shackles', n0x, n0y + 2, 'W');
  k.loose('bone_pile', n0x + 2.3, n0y + 2.3);
  k.onWall('chained_skeleton', n1x + 1, n1y, 'N');
  k.loose('bone_pile', n1x + 0.7, n1y + 0.7);
  decor.push({ type: 'candles', x: n2x + 2.4, y: n2y + 0.6, yaw: rng.range(0, 6), solid: false });
  k.loose('bone_pile', n2x + 0.6, n2y + 2.4);
  k.onWall('chained_skeleton', n3x + 1, n3y, 'N');
  k.onWall('shackles', n3x + 2, n3y + 2, 'E');
  k.loose('bone_pile', n3x + 0.7, n3y + 2.3);
  k.loose('bone_pile', n3x + 2.3, n3y + 0.7);
  k.onWall('shackles', s0x + 1, s0y + 2, 'S');
  k.loose('bone_pile', s0x + 2.3, s0y + 0.7);
  k.onWall('chained_skeleton', s1x + 2, s1y + 2, 'S');
  decor.push({ type: 'hanging_cage', x: s1x + 2, y: s1y + 2, yaw: rng.range(0, 6), solid: true, round: true });
  k.onWall('shackles', s2x + 1, s2y + 2, 'S');
  decor.push({ type: 'candles', x: ex + 0.6, y: ey + 0.6, yaw: rng.range(0, 6), solid: false });
  k.cobwebs([[n3x, n3y, 1, 1], [n3x + 3, n3y, -1, 1], [s0x, s0y + 3, 1, -1], [s1x + 3, s1y + 3, -1, -1], [BX + BW, BY + 4, -1, 1], [n1x + 3, n1y, -1, 1]]);
  // The room you come down into.
  decor.push({ type: 'candles', x: ENTRY.x + 0.6, y: ENTRY.y + 0.6, yaw: rng.range(0, 6), solid: false });
  k.loose('bone_pile', ENTRY.x + ENTRY.w - 0.7, ENTRY.y + 0.7);
  k.cobwebs([[ENTRY.x, ENTRY.y, 1, 1], [ENTRY.x + ENTRY.w, ENTRY.y, -1, 1]]);
  // The passage, the Catacombs' things giving way to the Caves': cobwebs as it leaves the cell, fallen rock and a
  // stalactite as it comes into the cave.
  k.cobwebs([[ex + 1, DOWN_PASSAGE.y, 1, 1], [ex + 2, DOWN_PASSAGE.y, -1, 1]]);
  k.loose('rocks', ex + 1.75, DOWN_PASSAGE.y + 3.3, { yaw: 1.2 });
  k.loose('stalactites', ex + 1.5, DOWN_PASSAGE.y + 2.6, { ceiling: true });
  // The cave: timbering against its walls, a seam of ore and glowing crystals in them, fallen rock, the miners' tools,
  // stalactites over the hole down.
  k.onWall('mine_timbers', CAVE.x, CAVE.y + 3, 'W');
  k.onWall('mine_timbers', CAVE.x + CAVE.w - 1, CAVE.y + 3, 'E');
  k.onWall('ore_vein', CAVE.x, CAVE.y, 'N');
  k.onWall('crystals', CAVE.x + CAVE.w - 1, CAVE.y, 'N');
  k.loose('rocks', CAVE.x + 0.7, CAVE.y + CAVE.h - 0.7);
  k.loose('tools', CAVE.x + CAVE.w - 0.6, CAVE.y + CAVE.h - 1.4, { yaw: -Math.PI / 2 });
  for (const [x, y] of [[CAVE.x + 1.4, CAVE.y + 2.2], [CAVE.x + 3.7, CAVE.y + 1.4]]) k.loose('stalactites', x, y, { ceiling: true });

  // The crossing into the Caves: their rock in the cave and the archway into it, rough-hewn, and more and more of it, and
  // rougher, down the passage (see blend).
  k.blend(CAVE.x - 1, CAVE.y - 1, CAVE.x + CAVE.w, CAVE.y + CAVE.h, 1);
  PASSAGE_MIX.forEach((share, i) => k.blend(ex, DOWN_PASSAGE.y + i, ex + 2, DOWN_PASSAGE.y + i, share));

  // The Jailer, asleep on his feet at his post, facing the way you'll come; and what he'll leave: his keys, the boss key
  // among them, and what he took from his prisoners.
  const monsters = [{ type: 'jailer', x: BX + 7, y: BY + 5, yaw: -Math.PI / 2, asleep: true, boss: true, loot: spoils(rng, depth, 'jailer') }];
  const items = [{ item: makeItem('food', 'ration'), x: ENTRY.x + 3, y: ENTRY.y + 2 }];
  // Where he hides when he's hurt (see monsters/bosses.js): each cell with a gate onto the aisle (all of them with a
  // hole knocked through into the next), at the back of it, facing the gate (`gate`), so he can charge out through it.
  const hides = GATES.map(([x, y]) => ({ x: BX + x, y: BY + (y < 5 ? 0 : BH - 1), gate: { x: BX + x, y: BY + y } }));

  return k.finish({
    up, down, monsters, items, lair: { x: block.x, y: block.y, w: block.w, h: block.h, hides },
    edges: [{ a: entry.id, b: block.id, kind: 'loop', locked: false }, { a: block.id, b: passage.id, kind: 'branch', locked: true },
      { a: passage.id, b: cave.id, kind: 'branch', locked: false }],
  });
}

const ARENAS = {
  [FLOORS_PER_THEME]: {
    build: oozeLair,
    props: ['door_boss_catacombs', 'stairs_down_catacombs', 'bone_pile', 'wall_niches', 'candles', 'grave_slab'],
    arrive: 'A foul stench rolls up out of the dark ahead, and something vast stirs in it, breathing.',
  },
  [FLOORS_PER_THEME * 2]: {
    build: jailerBlock,
    props: ['door_boss_caves', 'stairs_down_caves', 'cell_gate', 'breach', 'jailer_table', 'rocks', 'stalactites', 'mine_timbers',
      'ore_vein', 'crystals', 'tools', 'wall_torch', 'lantern'],
    arrive: 'Somewhere ahead, keys jangle, and a chain drags slowly over stone.',
  },
};

/** The fixed arena floor `depth` is (see above), or null if it's generated like any other. */
export const arenaFor = (depth) => ARENAS[depth] ?? null;
