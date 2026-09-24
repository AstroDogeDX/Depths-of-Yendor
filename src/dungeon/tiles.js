// Tile types stored in a level's grid. Door open/locked state lives on the runtime Level, not in the grid.
// WATER fills a sewer channel: nothing can walk it, but you can see and shoot across. A BRIDGE is walkable
// floor laid over a channel.
export const T = { WALL: 0, FLOOR: 1, STAIRS_DOWN: 2, STAIRS_UP: 3, PEDESTAL: 4, DOOR: 5, WATER: 6, BRIDGE: 7 };
