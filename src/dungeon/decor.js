import { T } from './tiles.js';

// Decorations by theme `style`: props set about the rooms after they're furnished (see props.js for the models).
// Wall pieces hang on walls facing into a room; floor pieces keep to the edges of rooms, clear of doorways, so
// they never block a way through. Each is { type, x, y (grid tiles, fractional), yaw, solid, round }, or for a
// puddle { type: 'puddle', x, y, size, yaw }.

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
  const set = SETS[style];
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
        props.push({ type, ...wallFace(x, y, side), solid: false });
        return true;
      },
      /** Stands `type` against a wall, a little out from it, on a free floor tile. */
      againstWall(type, { solid = true, round = false, turn = 0 } = {}) {
        const f = freeFaces.find(([x, y, side]) => !occupied.has(idx(x, y)) && !wallUsed.has(faceKey(x, y, side)));
        if (!f) return false;
        const [x, y, side] = f;
        occupied.add(idx(x, y));
        const [nx, ny] = SIDE[side].n;
        // Pushed toward the wall and jostled along it, so it doesn't sit dead centre in the tile.
        const along = rng.range(-0.25, 0.25);
        props.push({
          type, solid, round,
          x: x + 0.5 + nx * 0.28 + (ny ? along : 0), y: y + 0.5 + ny * 0.28 + (nx ? along : 0),
          yaw: SIDE[side].yaw + turn,
        });
        return true;
      },
      /** Lays something flat on an open floor tile (not solid). */
      onFloor(type, extra = {}) {
        for (let tries = 0; tries < 20; tries++) {
          const x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
          if (at(x, y) !== T.FLOOR || occupied.has(idx(x, y)) || nearDoor(x, y)) continue;
          props.push({ type, x: x + rng.range(0.3, 0.7), y: y + rng.range(0.3, 0.7), yaw: rng.range(0, Math.PI * 2), solid: false, ...extra });
          return true;
        }
        return false;
      },
    };
    set(ctx);
  }
  return { props, wallUsed };
}

const SETS = {
  sewers(d) {
    const { rng } = d;
    if (rng.chance(0.7)) d.onWall('drain_pipe');
    if (rng.chance(0.3)) d.onWall('drain_pipe');
    if (rng.chance(0.4)) d.onWall('pipe_valve');
    for (let i = rng.int(0, 2); i > 0; i--) d.againstWall('rubble', { turn: rng.range(-0.6, 0.6) });
    if (rng.chance(0.25)) d.againstWall('barrel', { round: true, turn: rng.range(0, 6) });
    if (rng.chance(0.4)) d.onFloor('floor_drain');
    for (let i = rng.int(1, 3); i > 0; i--) d.onFloor('puddle', { size: rng.range(0.8, 1.7) });
  },
};
