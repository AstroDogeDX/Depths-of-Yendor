import { T } from './tiles.js';

// Channels: a trench runs straight across a room from wall to wall, crossed by one or two bridges. What fills
// it is the theme's (`channels.fill` in config.js): water in the Sewers, flowing in through a grate in one wall
// and out through another; spikes and bones in the Catacombs.

const WALKABLE = new Set([T.FLOOR, T.DOOR, T.BRIDGE]);

/**
 * Digs `count` ([min, max]) channels across standard rooms, as many as there are rooms for. A channel keeps
 * clear of doorways and pillars, and one that would cut any floor off from the rest is filled back in. `start` is
 * a tile index everything must stay reachable from (the tile in front of the entrance stairs).
 *
 * Returns [{ axis, tiles, bridges, ends, flow }]: `axis` ('x' or 'y') is the way the channel runs, `tiles` its
 * channel and bridge tiles in order, `ends` the first and last with the side of the room their wall is on ('N',
 * 'E', 'S' or 'W'), and `flow` (1 or -1) which way along the axis the water runs.
 */
export function digChannels({ rng, grid, w, rooms, start, count }) {
  const idx = (x, y) => y * w + x;
  const reachable = () => {
    const seen = new Uint8Array(grid.length);
    const q = [start];
    seen[start] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (const n of [c - 1, c + 1, c - w, c + w]) {
        if (!seen[n] && WALKABLE.has(grid[n])) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    return q.length;
  };

  const channels = [];
  const want = rng.int(...count);
  const candidates = rng.shuffle(rooms.filter((r) => r.type === 'standard' && !r.locked));
  for (const room of candidates) {
    if (channels.length >= want) break;
    for (const axis of rng.shuffle(['x', 'y'])) {
      const channel = tryChannel(room, axis);
      if (channel) {
        channels.push(channel);
        break;
      }
    }
  }
  return channels;

  function tryChannel(room, axis) {
    // `along` runs the length of the channel, `across` is its position between the room's other two walls,
    // kept two tiles clear of each so there's room to walk on both banks.
    const len = axis === 'x' ? room.w : room.h, depth = axis === 'x' ? room.h : room.w;
    if (len < 4 || depth < 5) return null;
    const at = (along, across) => (axis === 'x' ? [room.x + along, room.y + across] : [room.x + across, room.y + along]);
    const acrossChoices = rng.shuffle(Array.from({ length: depth - 4 }, (_, i) => i + 2));
    for (const across of acrossChoices) {
      const tiles = Array.from({ length: len }, (_, i) => at(i, across));
      if (!tiles.every(([x, y]) => grid[idx(x, y)] === T.FLOOR)) continue; // a pillar in the way
      const [bx, by] = at(-1, across), [ax, ay] = at(len, across);
      if (grid[idx(bx, by)] !== T.WALL || grid[idx(ax, ay)] !== T.WALL) continue; // a doorway at an end

      // Bridges line up with doorways in the walls either side where they can, so the way across is obvious.
      const inLine = room.doorways
        .filter((d) => (axis === 'x' ? d.side === 'N' || d.side === 'S' : d.side === 'E' || d.side === 'W'))
        .map((d) => (axis === 'x' ? d.x - room.x : d.y - room.y))
        .filter((i) => i >= 1 && i <= len - 2);
      const spans = len >= 7 ? 2 : 1;
      const bridges = [];
      for (const i of [...rng.shuffle(inLine), ...rng.shuffle(Array.from({ length: len - 2 }, (_, k) => k + 1))]) {
        if (bridges.length < spans && bridges.every((b) => Math.abs(b - i) >= 2)) bridges.push(i);
      }

      const before = reachable();
      tiles.forEach(([x, y], i) => { grid[idx(x, y)] = bridges.includes(i) ? T.BRIDGE : T.CHANNEL; });
      if (reachable() === before - (len - bridges.length)) {
        const ends = axis === 'x' ? ['W', 'E'] : ['N', 'S'];
        return {
          axis,
          tiles: tiles.map(([x, y]) => ({ x, y })),
          bridges: bridges.map((i) => ({ x: tiles[i][0], y: tiles[i][1] })),
          ends: [{ x: tiles[0][0], y: tiles[0][1], side: ends[0] }, { x: tiles[len - 1][0], y: tiles[len - 1][1], side: ends[1] }],
          flow: rng.chance(0.5) ? 1 : -1,
        };
      }
      for (const [x, y] of tiles) grid[idx(x, y)] = T.FLOOR; // it cut something off: fill it back in
    }
    return null;
  }
}
