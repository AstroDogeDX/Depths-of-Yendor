// World scale: one grid tile is TILE metres square.
export const TILE = 2;
export const WALL_H = 2.8;
export const EYE_H = 1.55;
// Blockbench models (assets/models) are built in pixels; this is one pixel in metres.
export const MODEL_PX = 1 / 64;
// Items lying in the world whose longest side is under this are drawn bigger, so they read from across a room.
export const ITEM_MIN_SIZE = TILE / 4;

// Internal render height; the canvas is upscaled with nearest-neighbour for a chunky PS1 look.
// Cycle with the P key.
export const RENDER_HEIGHTS = [270, 360, 540, 0]; // 0 = native

export const PLAYER_RADIUS = 0.32;
export const PLAYER_SPEED = 3.1; // m/s — King's Field is deliberately unhurried
export const TURN_SPEED = 2.2; // rad/s for keyboard turning
export const MOUSE_SENS = 0.0022;

// Stamina: spent while *moving* and sprinting (Shift) or sneaking (C). Never used by attacks.
export const STAMINA_BASE = 100;
export const STAMINA_PER_LEVEL = 10;
export const STAMINA_DRAIN = { sprint: 22, sneak: 9 }; // per second while moving
export const STAMINA_REGEN = 18; // per second, after a short pause; half as fast again when standing still
export const STAMINA_REGEN_DELAY = 0.6;
export const STAMINA_RECOVER = 0.3; // once winded, sprint/sneak return at this fraction of max
export const MODE_SPEED = { walk: 1, sprint: 1.6, sneak: 0.5 };
// How far (in metres of walking distance, round corners) monsters can hear your footsteps.
export const NOISE = { walk: 6, sprint: 16, sneak: 1.5 };
export const CROUCH_DROP = 0.4; // how far the camera sinks while sneaking

export const INVENTORY_SIZE = 20;
export const HOTBAR_SIZE = 6; // number keys 1..HOTBAR_SIZE
export const TWO_HAND_STR = 2; // gripped in both hands (F), a weapon needs this much less strength (see Player.weaponStats)
export const HUNGER_MAX = 1000;
export const HUNGER_HUNGRY = 250;
export const HUNGER_FAMISHED = 80; // below this, your wounds don't heal on their own

export const VIEW_RADIUS_TILES = 9;

// --- The dungeon: five themes of five floors. Each theme's last floor is its boss floor. ---

export const FLOORS_PER_THEME = 5;

// Each theme's colours. `style` names its own textures (dungeon/textures.js) and decorations
// (dungeon/decor.js); themes without one use plain stone and brick in their colours, as placeholders until
// they get their own. `channels` runs trenches across some rooms (dungeon/channels.js): `fill` is what's in
// them and `count` how many ([min, max]) a floor gets. `rough` makes its surfaces rough-hewn rock
// (dungeon/roughRock.js), or with 'tunnels' just its passages, its rooms being masonry below rough vaults;
// `lights` names its wall lights (see FITTINGS in dungeon/levelBuilder.js), and `fire: 'violet'` burns them violet.
export const THEMES = [
  {
    // Dank and wet.
    name: 'Sewers', style: 'sewers', channels: { fill: 'water', count: [2, 3] },
    wall: ['#4f5448', '#43483d', '#373b32'], mortar: '#1c1f18', moss: '#4a6a2a',
    floor: ['#3a3d33', '#30332b'], ceiling: '#1d201a',
    fog: 0x080a06, fogNear: 2, fogFar: 20, ambient: 0x48523e, drone: 55,
  },
  {
    // A tomb and a jail in one: bones, cells, cages and chains.
    name: 'Catacombs', style: 'catacombs', channels: { fill: 'spikes', count: [1, 2] },
    wall: ['#5e5f5e', '#4e4f4e', '#3f403f'], mortar: '#1e1f20', moss: '#3f5a2e',
    floor: ['#4a4b4b', '#3c3d3d'], ceiling: '#272829',
    fog: 0x08090b, fogNear: 2, fogFar: 21, ambient: 0x3c4048, drone: 51,
  },
  {
    // Natural, rough-hewn rock, and the leavings of the miners who dug here.
    name: 'Caves', style: 'caves', rough: true, channels: { fill: 'chasm', count: [1, 2] }, lights: ['wall_torch', 'lantern'],
    wall: ['#5e4e3e', '#4f4133', '#3f3429'], mortar: '#1c1510', moss: '#5a5a30',
    floor: ['#433a30', '#372f27'], ceiling: '#211a14',
    fog: 0x0a0806, fogNear: 2, fogFar: 20, ambient: 0x52463a, drone: 47,
  },
  {
    // The red stone and gold of a great dwarven kingdom, fallen into ruin as the evil below broke through.
    name: 'Dwarven Ruins', style: 'dwarven', channels: { fill: 'rift', count: [1, 2] }, lights: ['wall_brazier', 'hanging_lamp'],
    wall: ['#6c382b', '#5c2f24', '#4b261d'], mortar: '#1a0d0a', moss: '#4f6e5a',
    floor: ['#52251d', '#6a5846'], ceiling: '#2a1812',
    fog: 0x0b0706, fogNear: 2, fogFar: 21, ambient: 0x5a4034, drone: 44,
  },
  {
    // A temple to the evil below, dug into caverns in the dark depths: rooms of black brick carved with runes,
    // rough tunnels between them, violet fire, and lava. The last floor is the Amulet's vault, guarded by the
    // Warden of Yendor.
    name: 'Underworld', style: 'underworld', rough: 'tunnels', fire: 'violet',
    channels: { fill: 'lava', count: [1, 2] }, lights: ['skull_sconce', 'wall_torch'],
    wall: ['#3a2c46', '#2e2338', '#231a2c'], mortar: '#0c080e', moss: '#7a3a12',
    floor: ['#2e2634', '#262030'], ceiling: '#1a131f',
    fog: 0x07050a, fogNear: 2, fogFar: 19, ambient: 0x62507a, drone: 41,
  },
];

// The Amulet of Yendor waits on the last floor.
export const MAX_DEPTH = THEMES.length * FLOORS_PER_THEME;

export const themeForDepth = (depth) => THEMES[Math.min(THEMES.length - 1, Math.floor((depth - 1) / FLOORS_PER_THEME))];

/**
 * Each theme's last floor is its boss floor: 5, 10, 15, 20 and 25. For now they're built like any other
 * floor, except that the last holds the Amulet's vault and the Warden, its final boss.
 */
export const isBossDepth = (depth) => depth % FLOORS_PER_THEME === 0;

/** A shop opens off the entrance room on the first floor of every theme after the first. */
export const isShopDepth = (depth) => depth > 1 && themeForDepth(depth) !== themeForDepth(depth - 1);

// An artefact shrine on the third floor of each theme.
export const ARTEFACT_DEPTHS = THEMES.map((_, i) => i * FLOORS_PER_THEME + 3);

/**
 * How dangerous a floor is: 1 on the first floor, rising evenly to 10 on the last. The balance formulas
 * (how many monsters there are and how tough, loot quality, gold, shop prices) are written against this
 * rather than the floor number, so the difficulty curve spans the whole dungeon however many floors it has.
 */
export const danger = (depth) => 1 + ((depth - 1) * 9) / (MAX_DEPTH - 1);
