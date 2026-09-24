// World scale: one grid tile is TILE metres square.
export const TILE = 2;
export const WALL_H = 2.8;
export const EYE_H = 1.55;
// Blockbench models (assets/models) are built in pixels; this is one pixel in metres.
export const MODEL_PX = 1 / 64;
// Items lying in the world whose longest side is under this are drawn bigger, so they read from across a room.
export const ITEM_MIN_SIZE = TILE / 4;

// The Amulet of Yendor waits at the bottom of this many floors.
export const MAX_DEPTH = 10;

// Depths where an artefact shrine is generated.
export const ARTEFACT_DEPTHS = [3, 5, 7, 9];

// Internal render height; the canvas is upscaled with nearest-neighbour for a chunky PS1 look.
// Cycle with the P key.
export const RENDER_HEIGHTS = [270, 360, 540, 0]; // 0 = native

export const PLAYER_RADIUS = 0.32;
export const PLAYER_SPEED = 3.1; // m/s — King's Field is deliberately unhurried
export const TURN_SPEED = 2.2; // rad/s for keyboard turning
export const MOUSE_SENS = 0.0022;

// Stamina: spent while *moving* and sprinting (Shift) or sneaking (Ctrl / C). Never used by attacks.
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
export const HUNGER_MAX = 1000;
export const HUNGER_HUNGRY = 250;
export const HUNGER_WEAK = 80;

export const VIEW_RADIUS_TILES = 9;

export const THEMES = [
  {
    name: 'Upper Catacombs',
    wall: ['#6b645a', '#5a544b', '#4a453e'], mortar: '#2c2925', moss: '#3f5a2e',
    floor: ['#4d4842', '#3e3a35'], ceiling: '#2a2723',
    fog: 0x0b0a09, fogNear: 2, fogFar: 22, ambient: 0x4a4038, drone: 55,
  },
  {
    name: 'Sunken Halls',
    wall: ['#4f5a63', '#424b53', '#353d44'], mortar: '#1c2226', moss: '#2c4a48',
    floor: ['#3b4248', '#30363b'], ceiling: '#1d2226',
    fog: 0x070a0c, fogNear: 2, fogFar: 20, ambient: 0x46545e, drone: 49,
  },
  {
    name: 'Ember Deep',
    wall: ['#6a3e30', '#5a3327', '#47281f'], mortar: '#1f110c', moss: '#7a3a12',
    floor: ['#3f2a22', '#33221b'], ceiling: '#1e130f',
    fog: 0x0e0503, fogNear: 2, fogFar: 19, ambient: 0x5e3c30, drone: 44,
  },
  {
    name: "Yendor's Vault",
    wall: ['#3a3048', '#2f273c', '#241e2f'], mortar: '#0e0b13', moss: '#6b5a1e',
    floor: ['#2a2433', '#221d2a'], ceiling: '#130f18',
    fog: 0x06040a, fogNear: 2, fogFar: 18, ambient: 0x4a3c5c, drone: 41,
  },
];

export function themeForDepth(depth) {
  if (depth >= MAX_DEPTH) return THEMES[3];
  if (depth >= 7) return THEMES[2];
  if (depth >= 4) return THEMES[1];
  return THEMES[0];
}

/** A shop opens off the entrance room on the first floor of every theme after the first. */
export const isShopDepth = (depth) => depth > 1 && themeForDepth(depth) !== themeForDepth(depth - 1);
