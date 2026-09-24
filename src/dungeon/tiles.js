// Tile types stored in a level's grid. Door open/locked state lives on the runtime Level, not in the grid.
// A CHANNEL tile is sunk below the floor (water in the Sewers, a spike pit in the Catacombs): nothing can walk
// it, though fliers pass over and you can see and shoot across. A BRIDGE is walkable floor laid over a channel.
export const T = { WALL: 0, FLOOR: 1, STAIRS_DOWN: 2, STAIRS_UP: 3, PEDESTAL: 4, DOOR: 5, CHANNEL: 6, BRIDGE: 7 };
