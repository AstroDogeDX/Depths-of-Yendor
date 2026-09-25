import { buildBBModel } from '../items/bbmodel.js';
import { MODEL_PX } from '../config.js';
import { glowSprite } from '../fx/glow.js';

// Trap models: Blockbench projects in assets/models/traps, one per kind of trap (spike, poison, teleport,
// alarm), shown once a trap has been found or has gone off. Each has three states, groups shown one at a time:
// "armed" (waiting to go off), "active" (going off) and "used" (spent: set off, or disarmed). Anything outside
// them always shows. Their other named groups are parts that move: this file animates them. A trap's origin is
// on the floor at the middle of its tile.
//
// They download in the background as the game starts (loadTraps), since traps stay hidden until found.

const FILES = import.meta.glob('../../assets/models/traps/*.bbmodel', { import: 'default' });
const file = (type) => `../../assets/models/traps/${type}.bbmodel`;
const sources = new Map();
const templates = new Map();
let loading = null;

/** Fetches the trap models (once). Returns a promise that settles when they've all arrived. */
export function loadTraps() {
  loading ??= Promise.all(Object.entries(FILES).map(([path, load]) => load().then((src) => sources.set(path, src))))
    .catch((err) => { loading = null; throw err; }); // so a later call tries again
  return loading;
}

/** Whether the trap models have arrived (see loadTraps). */
export const trapsLoaded = () => sources.size === Object.keys(FILES).length;

function template(type) {
  if (!templates.has(type)) {
    const src = sources.get(file(type));
    if (!src) throw new Error(`Trap model assets/models/traps/${type}.bbmodel isn't loaded: loadTraps() first`);
    templates.set(type, buildBBModel(src, MODEL_PX, { rig: true }));
  }
  return templates.get(type);
}

const easeOut = (x) => 1 - (1 - Math.min(1, x)) ** 3;

// Per kind: how many seconds it's active; `shows`, the group shown while active if not its own "active";
// `glow`, a soft light about it while armed ([colour, size, opacity]); `idle(parts, time)`, how it moves
// while armed; and `animate(parts, t, view)`, how it moves `t` seconds into going off. Parts move relative to
// their rest pose from the model (`rest`).
const KINDS = {
  spike: {
    active: 1.2,
    animate(parts, t) {
      // Thrust up from under the floor in a blink, held, then sinking back part way.
      const s = parts.active;
      s.position.y = s.userData.rest.y - 0.55 + 0.55 * easeOut(t / 0.07) - 0.22 * easeOut(Math.max(0, t - 0.8) / 0.35);
    },
  },
  poison: {
    active: 0.9,
    glow: [0x60c030, 0.9, 0.22],
    animate(parts, t) {
      // The cap blown up off the vent, tumbling over as it falls away to one side.
      const cap = parts.active, rest = cap.userData.rest, k = t / 0.9;
      cap.position.set(rest.x + k * 0.48, rest.y + Math.sin(Math.PI * k) * 0.5, rest.z + k * 0.12);
      cap.rotation.set(k * 1.4, k * 3, -k * 1.4);
    },
  },
  teleport: {
    active: 0.8,
    shows: 'armed',
    glow: [0x3aa0ff, 1.5, 0.45],
    idle(parts, time) { parts.armed.rotation.y = time * 0.35; },
    animate(parts, t, view) {
      // Spinning up into a flare.
      parts.armed.rotation.y += 0.05 + t * 0.9;
      view.halo.scale.setScalar(1.5 + t * 4);
      view.halo.material.opacity = 0.45 + Math.sin(Math.PI * (t / 0.8)) * 0.5;
    },
  },
  alarm: {
    active: 1.6,
    animate(parts, t) {
      // The bell swinging wildly on its hook, dying away.
      const k = Math.max(0, 1 - t / 1.6), bell = parts.bell;
      bell.rotation.set(Math.sin(t * 21 + 1) * 0.35 * k, 0, Math.sin(t * 28) * 0.7 * k);
    },
  },
};

/** A trap's model and its state. */
export class TrapView {
  constructor(type, x, z) {
    this.kind = KINDS[type];
    this.root = template(type).clone();
    this.root.position.set(x, 0, z);
    this.parts = {};
    this.root.traverse((o) => {
      if (!o.isGroup || !o.name) return;
      this.parts[o.name] = o;
      o.userData.rest = o.position.clone();
    });
    if (this.kind.glow) {
      const [color, size, opacity] = this.kind.glow;
      this.halo = glowSprite(color, size, opacity);
      this.halo.position.y = 0.12;
      this.root.add(this.halo);
    }
    this.set('armed');
  }

  /** Shows the trap 'armed', 'active' (going off, then used by itself) or 'used'. */
  set(state) {
    this.state = state;
    this.t = 0;
    const shows = state === 'active' ? this.kind.shows ?? 'active' : state;
    for (const s of ['armed', 'active', 'used']) if (this.parts[s]) this.parts[s].visible = s === shows;
    for (const part of Object.values(this.parts)) {
      part.position.copy(part.userData.rest);
      part.rotation.set(0, 0, 0);
    }
    if (this.halo) {
      this.halo.visible = state !== 'used';
      this.halo.scale.setScalar(this.kind.glow[1]);
      this.halo.material.opacity = this.kind.glow[2];
    }
  }

  update(dt, time) {
    this.t += dt;
    if (this.state === 'armed') {
      this.kind.idle?.(this.parts, time);
      if (this.halo) this.halo.material.opacity = this.kind.glow[2] * (0.75 + 0.25 * Math.sin(time * 2.6));
    } else if (this.state === 'active') {
      this.kind.animate?.(this.parts, this.t, this);
      if (this.t >= this.kind.active) this.set('used');
    }
  }
}
