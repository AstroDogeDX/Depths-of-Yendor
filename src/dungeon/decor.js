import { T } from './tiles.js';

// Decorations by theme `style`: props set about the rooms after they're furnished (see props.js for the models).
// Wall pieces hang on walls facing into a room; floor pieces keep to the edges of rooms, or to tiles open all
// round, and clear of doorways, so they never block a way through. Each is { type, x, y (grid tiles,
// fractional), yaw, solid, round }, with `wall` set on those hung on a wall and `ceiling` on those hung from
// the vault. The level builder draws two kinds itself, puddles { type: 'puddle', x, y, size, yaw } and cobwebs
// { type: 'cobweb', x, y (a room corner), corner: [dx, dy] (the way into the room) }.

const SIDE = {
  // Where a wall face lies for a tile with a wall on that side, and the way a prop on it faces (into the room).
  N: { dx: 0.5, dy: 0, yaw: 0, n: [0, -1] },
  S: { dx: 0.5, dy: 1, yaw: Math.PI, n: [0, 1] },
  W: { dx: 0, dy: 0.5, yaw: Math.PI / 2, n: [-1, 0] },
  E: { dx: 1, dy: 0.5, yaw: -Math.PI / 2, n: [1, 0] },
};

const FIXTURES = new Set([T.STAIRS_UP, T.STAIRS_DOWN, T.PEDESTAL]);

/** A wall face's key, as used in `wallUsed`: the tile in front of the wall and the side the wall is on. */
export const faceKey = (x, y, side) => `${x},${y},${side}`;

/** Where a prop hangs on the wall on `side` of tile (x, y): { x, y } in grid tiles and the yaw facing into the room. */
export const wallFace = (x, y, side) => ({ x: x + SIDE[side].dx, y: y + SIDE[side].dy, yaw: SIDE[side].yaw });

/**
 * Decorates a floor. `occupied` (a Set of tile indices) gets the tiles solid props stand on, so nothing is placed
 * on them later. Returns { props, wallUsed }: wallUsed holds the wall faces taken (faceKey), which sconces avoid.
 */
export function decorate({ style, rng, grid, w, rooms, channels, occupied }) {
  const idx = (x, y) => y * w + x;
  const at = (x, y) => grid[idx(x, y)];
  const props = [], wallUsed = new Set();
  for (const c of channels) for (const e of c.ends) wallUsed.add(faceKey(e.x, e.y, e.side));
  const set = SETS[style]?.place;
  if (!set) return { props, wallUsed };

  for (const room of rooms) {
    if (room.type === 'shop' || room.type === 'vault' || room.type === 'shrine' || room.locked) continue;
    // The ways in, and round the stairs and pedestals, stay clear.
    const nearDoor = (x, y) => room.doorways.some((d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= 2) ||
      [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => FIXTURES.has(at(x + dx, y + dy))));
    const faces = [];
    for (let x = room.x; x < room.x + room.w; x++) {
      faces.push([x, room.y, 'N'], [x, room.y + room.h - 1, 'S']);
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      faces.push([room.x, y, 'W'], [room.x + room.w - 1, y, 'E']);
    }
    const freeFaces = rng.shuffle(faces.filter(([x, y, side]) => {
      const [nx, ny] = SIDE[side].n;
      return at(x, y) === T.FLOOR && at(x + nx, y + ny) === T.WALL && !nearDoor(x, y) && !wallUsed.has(faceKey(x, y, side));
    }));
    const ctx = {
      rng, room,
      /** Hangs `type` on a free wall face; returns false if there's none left. */
      onWall(type) {
        const f = freeFaces.find(([x, y, side]) => !wallUsed.has(faceKey(x, y, side)));
        if (!f) return false;
        const [x, y, side] = f;
        wallUsed.add(faceKey(x, y, side));
        props.push({ type, ...wallFace(x, y, side), solid: false, wall: true });
        return true;
      },
      /** Adds a prop as it is (say, a second one where againstWall put the first). */
      add(prop) {
        props.push(prop);
      },
      /** Stands `type` against a wall, a little out from it, on a free floor tile. Returns the prop, or null. */
      againstWall(type, { solid = true, round = false, turn = 0 } = {}) {
        const f = freeFaces.find(([x, y, side]) => !occupied.has(idx(x, y)) && !wallUsed.has(faceKey(x, y, side)));
        if (!f) return null;
        const [x, y, side] = f;
        occupied.add(idx(x, y));
        const [nx, ny] = SIDE[side].n;
        // Pushed toward the wall and jostled along it, so it doesn't sit dead centre in the tile.
        const along = rng.range(-0.25, 0.25);
        const prop = {
          type, solid, round,
          x: x + 0.5 + nx * 0.28 + (ny ? along : 0), y: y + 0.5 + ny * 0.28 + (nx ? along : 0),
          yaw: SIDE[side].yaw + turn,
        };
        props.push(prop);
        return prop;
      },
      /** Lays something flat on an open floor tile (not solid). */
      onFloor(type, extra = {}) {
        for (let tries = 0; tries < 20; tries++) {
          const x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
          if (at(x, y) !== T.FLOOR || occupied.has(idx(x, y)) || nearDoor(x, y)) continue;
          if (props.some((p) => p.type === type && Math.floor(p.x) === x && Math.floor(p.y) === y)) continue; // one of each to a tile
          props.push({ type, x: x + rng.range(0.3, 0.7), y: y + rng.range(0.3, 0.7), yaw: rng.range(0, Math.PI * 2), solid: false, ...extra });
          return true;
        }
        return false;
      },
      /**
       * Stands `type` in the middle of a floor tile with open floor all round it, so there's always a way past;
       * solid unless `solid` is false (a rug, say, which can go under other things). `yaw` turns it (at random if
       * not given).
       */
      inOpen(type, { round = false, solid = true, yaw = null } = {}) {
        for (let tries = 0; tries < 20; tries++) {
          const x = rng.int(room.x + 1, room.x + room.w - 2), y = rng.int(room.y + 1, room.y + room.h - 2);
          if (occupied.has(idx(x, y)) || nearDoor(x, y)) continue;
          if (![-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => at(x + dx, y + dy) === T.FLOOR && !occupied.has(idx(x + dx, y + dy))))) continue;
          // Something that doesn't claim its tile still keeps off one that has a floor piece on it already.
          if (!solid && props.some((p) => !p.wall && Math.floor(p.x) === x && Math.floor(p.y) === y)) continue;
          if (solid) occupied.add(idx(x, y));
          props.push({ type, x: x + 0.5, y: y + 0.5, yaw: yaw ?? rng.range(0, Math.PI * 2), solid, round });
          return true;
        }
        return false;
      },
      /** A cobweb in each of the room's upper corners, by `chance`, but not where a door would swing through it. */
      cobwebs(chance) {
        for (const [cx, cy, dx, dy] of [[room.x, room.y, 1, 1], [room.x + room.w, room.y, -1, 1], [room.x, room.y + room.h, 1, -1], [room.x + room.w, room.y + room.h, -1, -1]]) {
          if (room.doorways.some((d) => Math.abs(d.x + 0.5 - cx) < 2 && Math.abs(d.y + 0.5 - cy) < 2)) continue;
          if (rng.chance(chance)) props.push({ type: 'cobweb', x: cx, y: cy, corner: [dx, dy] });
        }
      },
    };
    set(ctx);
  }
  return { props, wallUsed };
}

/** The props a style's decorations use (so they can be fetched before its floors are built; see props.js). */
export const decorProps = (style) => SETS[style]?.props ?? [];

// Each style: the props it places, and how it places them in a room.
const SETS = {
  sewers: {
    props: ['drain_pipe', 'pipe_valve', 'rubble', 'barrel', 'floor_drain'],
    place(d) {
      const { rng } = d;
      if (rng.chance(0.7)) d.onWall('drain_pipe');
      if (rng.chance(0.3)) d.onWall('drain_pipe');
      if (rng.chance(0.4)) d.onWall('pipe_valve');
      for (let i = rng.int(0, 2); i > 0; i--) d.againstWall('rubble', { turn: rng.range(-0.6, 0.6) });
      if (rng.chance(0.25)) d.againstWall('barrel', { round: true, turn: rng.range(0, 6) });
      if (rng.chance(0.4)) d.onFloor('floor_drain');
      for (let i = rng.int(1, 3); i > 0; i--) d.onFloor('puddle', { size: rng.range(0.8, 1.7) });
    },
  },
  catacombs: {
    props: ['cell_door', 'chained_skeleton', 'shackles', 'hanging_cage', 'wall_niches', 'bone_pile', 'sarcophagus', 'candles', 'grave_slab'],
    place(d) {
      const { rng } = d;
      // The jail: cells in the walls, prisoners (or what's left of them) in chains, cages hung from the vault.
      if (rng.chance(0.45)) d.onWall('cell_door');
      if (rng.chance(0.45)) d.onWall(rng.chance(0.55) ? 'chained_skeleton' : 'shackles');
      if (rng.chance(0.35)) d.inOpen('hanging_cage', { round: true });
      // The tomb: burial niches, bones, coffins, candles for the dead and slabs over them.
      if (rng.chance(0.55)) d.onWall('wall_niches');
      for (let i = rng.int(0, 2); i > 0; i--) d.againstWall('bone_pile', { turn: rng.range(-0.8, 0.8) });
      if (rng.chance(0.3)) d.againstWall('sarcophagus');
      if (rng.chance(0.45)) d.againstWall('candles', { solid: false, turn: rng.range(0, 6) });
      if (rng.chance(0.45)) d.onFloor('grave_slab');
      d.cobwebs(0.5);
    },
  },
  caves: {
    props: ['ore_vein', 'crystals', 'mine_timbers', 'minecart', 'rails', 'tools', 'rocks', 'barrel', 'crates', 'stalagmite', 'stalactites'],
    place(d) {
      const { rng } = d;
      // What the rock holds: ore, and crystals that glow.
      if (rng.chance(0.5)) d.onWall('ore_vein');
      if (rng.chance(0.3)) d.onWall('crystals');
      // What the miners left: timbering, a cart of ore on its rails (or just the rails), tools, stores.
      if (rng.chance(0.35)) d.onWall('mine_timbers');
      const cart = rng.chance(0.3) && d.againstWall('minecart');
      if (cart) d.add({ ...cart, type: 'rails', solid: false });
      else if (rng.chance(0.25)) d.againstWall('rails', { solid: false });
      if (rng.chance(0.3)) d.againstWall('tools', { solid: false });
      if (rng.chance(0.2)) d.againstWall(rng.chance(0.5) ? 'barrel' : 'crates', { turn: rng.range(-0.4, 0.4) });
      for (let i = rng.int(0, 2); i > 0; i--) d.againstWall('rocks', { turn: rng.range(0, 6) });
      // And the cave's own: stalagmites rising from the floor, stalactites dripping from the vault.
      if (rng.chance(0.45)) d.inOpen('stalagmite', { round: true });
      for (let i = rng.int(0, 2); i > 0; i--) d.onFloor('stalactites', { ceiling: true });
    },
  },
  dwarven: {
    props: ['banner', 'painting', 'wall_shield', 'void_shards', 'grand_rug', 'throne', 'toppled_table', 'chair', 'dwarf_statue',
      'fallen_column', 'candelabra', 'armor_stand', 'bookcase', 'anvil', 'fallen_painting', 'ruin_rubble'],
    place(d) {
      const { rng } = d;
      // On the walls: the kingdom's banners, portraits of its kings, shields over crossed axes, and where the evil
      // below has broken through, black crystal lit violet.
      if (rng.chance(0.6)) d.onWall('banner');
      if (rng.chance(0.3)) d.onWall('banner');
      if (rng.chance(0.35)) d.onWall('painting');
      if (rng.chance(0.3)) d.onWall('wall_shield');
      if (rng.chance(0.2)) d.onWall('void_shards');
      // Its furnishings, in disarray: rugs, a throne, feast tables overturned and chairs flung about, statues
      // broken, columns fallen, and whatever the looters left.
      if (rng.chance(0.45)) d.inOpen('grand_rug', { solid: false, yaw: rng.pick([0, Math.PI / 2]) + rng.range(-0.15, 0.15) });
      if (rng.chance(0.12)) d.againstWall('throne', { turn: rng.range(-0.2, 0.2) });
      if (rng.chance(0.3)) d.inOpen('toppled_table');
      if (rng.chance(0.25)) d.inOpen('dwarf_statue', { round: true });
      for (let i = rng.int(0, 2); i > 0; i--) d.inOpen('chair', { solid: false });
      if (rng.chance(0.25)) d.againstWall('fallen_column', { turn: rng.range(-0.4, 0.4) });
      if (rng.chance(0.3)) d.againstWall('candelabra', { solid: false });
      if (rng.chance(0.2)) d.againstWall('armor_stand');
      if (rng.chance(0.2)) d.againstWall('bookcase');
      if (rng.chance(0.12)) d.againstWall('anvil', { turn: rng.range(-0.5, 0.5) });
      if (rng.chance(0.2)) d.againstWall('fallen_painting', { solid: false });
      for (let i = rng.int(0, 2); i > 0; i--) d.againstWall('ruin_rubble', { turn: rng.range(0, 6) });
      d.cobwebs(0.3);
    },
  },
  underworld: {
    props: ['cult_banner', 'demon_face', 'void_shards', 'chained_skeleton', 'altar', 'rune_circle', 'obelisk', 'demon_statue',
      'floor_brazier', 'candles', 'bone_pile', 'hanging_cage', 'rocks', 'stalactites', 'magma_crack'],
    place(d) {
      const { rng } = d;
      // On the walls: the cult's banners, demon faces carved in the stone, the crystal of the evil below breaking
      // through, and what's left of a sacrifice still in its chains.
      if (rng.chance(0.45)) d.onWall('cult_banner');
      if (rng.chance(0.3)) d.onWall('demon_face');
      if (rng.chance(0.2)) d.onWall('void_shards');
      if (rng.chance(0.12)) d.onWall('chained_skeleton');
      // The temple: a summoning circle, an obelisk of runes (standing in the circle, often as not), an altar, a
      // demon on its plinth, braziers of violet fire, candles, offerings of skulls, a cage hung from the vault.
      if (rng.chance(0.3)) d.inOpen('rune_circle', { solid: false, yaw: rng.range(0, Math.PI * 2) });
      if (rng.chance(0.25)) d.inOpen('obelisk');
      if (rng.chance(0.25)) d.againstWall('altar');
      if (rng.chance(0.2)) d.againstWall('demon_statue');
      if (rng.chance(0.55)) d.againstWall('floor_brazier', { round: true });
      if (rng.chance(0.15)) d.againstWall('floor_brazier', { round: true });
      if (rng.chance(0.3)) d.againstWall('candles', { solid: false, turn: rng.range(0, 6) });
      if (rng.chance(0.3)) d.againstWall('bone_pile', { turn: rng.range(-0.8, 0.8) });
      if (rng.chance(0.12)) d.inOpen('hanging_cage', { round: true });
      // The cavern it's dug into: fallen rock, stalactites from the vault, and cracks glowing where magma runs
      // close under the floor.
      if (rng.chance(0.3)) d.againstWall('rocks', { turn: rng.range(0, 6) });
      for (let i = rng.int(0, 2); i > 0; i--) d.onFloor('stalactites', { ceiling: true });
      if (rng.chance(0.35)) d.inOpen('magma_crack', { solid: false });
    },
  },
};
