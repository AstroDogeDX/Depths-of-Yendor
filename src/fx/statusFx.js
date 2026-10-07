import * as THREE from 'three';
import { Flame } from './flame.js';

// What's afflicting a monster shows on it (see STATUSES in status.js), in chunky pixel sprites to match the textures:
//   wet          water dripping off it
//   bleeding     blood dripping off it
//   oiled        oil dripping off it, slow and dark
//   burning      flames licking up off it, each flaring up at one spot and dying down to flare up at another, and embers
//                and smoke rising off it (it glows a little too: see STATUSES)
//   chilled      frost glittering about it, drifting down
//   frozen       the same, thicker, and it's tinted blue (see STATUSES)
//   poisoned     purple bubbles rising off its head and bursting
//   malediction  the Maledicted Ooze's taint dripping off it, dark, and flecks of it glowing magenta, rising
//   charmed      hearts circling its head (smitten too)
//   heartbroken  now and then a cracked heart, sinking from its head
//   confused     stars whirling round its head
//   stunned      yellow stars whirling fast and low round its head, and it shakes as a paralysed thing does
//   shackled     the links of a chain dragging at its feet
//   blind        murk swirling round its eyes
//   feared       sweat flying off its head
//   weakened     its strength draining out of it, sinking away
//   paralysed    it strains against its own limbs, shaking in fits (see strain)
//   healing      green crosses rising off it, and glints of gold
// Only monsters near you and in sight show them. A floor's sprites are all one THREE.Points (StatusFx), each sprite a
// cell of one small atlas (SPRITES) drawn in its particle's colour; the flames are the torches' (fx/flame.js). The floor
// sparkles with them too, where you find something hidden (see sparkle).

const MAX = 480; // sprites at once on a floor
const RANGE = 20; // metres from you within which monsters show their statuses
const TOWARD = 0.15; // metres nearer the camera that sprites are drawn, and flames by the monster's girth (see Flame)

// The sprites, 8 by 8 pixels: '.' is nothing; a, b, c and d the particle's colour, light to dark (SHADES); W white.
const SPRITES = {
  drop: ['...b....', '...b....', '..bbb...', '.abbbc..', '.Wbbbc..', '.bbbcc..', '..ccc...', '........'],
  flake: ['...a....', '.a.b.a..', '..bbb...', 'abbWbba.', '..bbb...', '.a.b.a..', '...a....', '........'],
  glint: ['........', '...a....', '...b....', '.abWba..', '...b....', '...a....', '........', '........'],
  bubble: ['..bbb...', '.b...b..', 'b.W...b.', 'b.....b.', 'b.....c.', '.c...c..', '..ccc...', '........'],
  pop: ['..b.b...', '........', 'b.....b.', '........', 'b.....b.', '........', '..b.b...', '........'],
  heart: ['........', '.bb.bb..', 'bWbbbbc.', 'bbbbbbc.', '.bbbbc..', '..bbc...', '...c....', '........'],
  broken: ['........', '.bb.bb..', 'bWbb.bc.', 'bbb.bbc.', '.bbb.c..', '..b.c...', '........', '........'],
  star: ['...a....', '...b....', '..bbb...', 'abbWbbc.', '.bbbbc..', '..b.c...', '.c...c..', '........'],
  wisp: ['........', '..bbb...', '.babbb..', 'bbbbbbc.', '.bbbbc..', '..ccc...', '........', '........'],
  chevron: ['........', 'b.....b.', 'bb...bb.', '.bb.bb..', '..bbc...', '...c....', '........', '........'],
  spark: ['........', '........', '...a....', '..aWb...', '...b....', '........', '........', '........'],
  plus: ['........', '...ab...', '...bb...', '.abWbbc.', '.bbbbcc.', '...bc...', '...cc...', '........'],
  link: ['........', '..abbb..', '.b....c.', '.b....c.', '.b....c.', '.b....c.', '..cccc..', '........'],
};
const SHADES = { a: 1.35, b: 1, c: 0.68, d: 0.42 };
const FRAME = Object.fromEntries(Object.keys(SPRITES).map((k, i) => [k, i]));

// Colours (display colours, like the flames').
const COLORS = {
  water: 0x8cc4ff, blood: 0xc81a24, oil: 0xa8822a, sweat: 0xe0f2ff, frost: 0xd8f2ff, poison: 0xb46ee8, heart: 0xff5aa6,
  broken: 0xc07898, star: 0xffe27a, starAlt: 0xe0a8ff, murk: 0x7c7694, weak: 0xc8603c, ember: 0xffd040, cinder: 0xa02008,
  smoke: 0x3a3532, heal: 0x8cf08a, healGlint: 0xfff0a8, sparkle: 0xfff0b8, taint: 0x4a1666, taintGlow: 0xf05ad0,
  daze: 0xfff08a, iron: 0x8a8e96,
};
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, rgb(v)]));

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * What each status shows, `every` seconds or so: what `emit` gives off (see StatusFx). A `body` one comes off all of
 * it, so it comes oftener off something bigger: a troll drips more than a rat.
 */
const SHOWS = {
  wet: { every: 0.055, body: true, emit: (fx, m) => fx.drip(m, C.water, 7, 0.1) },
  bleeding: { every: 0.12, body: true, emit: (fx, m) => fx.drip(m, C.blood, 7, 0.1) },
  oiled: { every: 0.2, body: true, emit: (fx, m) => fx.drip(m, C.oil, 3, 0.11) },
  burning: { every: 0.05, body: true, emit: (fx, m) => fx.ember(m) },
  chilled: { every: 0.07, body: true, emit: (fx, m) => fx.frost(m, false) },
  frozen: { every: 0.045, body: true, emit: (fx, m) => fx.frost(m, true) },
  poisoned: { every: 0.18, emit: (fx, m) => fx.bubble(m) },
  malediction: { every: 0.1, body: true, emit: (fx, m) => fx.taint(m) },
  charmed: { every: 0.5, emit: (fx, m) => fx.heart(m) },
  smitten: { every: 0.5, emit: (fx, m) => fx.heart(m) },
  heartbroken: { every: 1.5, emit: (fx, m) => fx.heartbreak(m) },
  confused: { every: 0.13, emit: (fx, m) => fx.star(m) },
  stunned: { every: 0.09, emit: (fx, m) => fx.daze(m) },
  shackled: { every: 0.12, emit: (fx, m) => fx.fetter(m) },
  blind: { every: 0.1, emit: (fx, m) => fx.murk(m) },
  feared: { every: 0.18, emit: (fx, m) => fx.sweat(m) },
  weakened: { every: 0.25, body: true, emit: (fx, m) => fx.drain(m) },
  healing: { every: 0.1, body: true, emit: (fx, m) => fx.mend(m) },
};
const SHOWN = Object.keys(SHOWS);

// Burning: how big its flames are (metres across, from the monster's height), and how long each takes to flare up,
// burns, and dies down (seconds).
const flameWidth = (height) => Math.min(0.42, Math.max(0.2, 0.14 + height * 0.12));
const FLAME = { up: 0.25, burn: [1.1, 2.4], down: 0.35 };

let atlas = null;
/** The sprites, each in its cell of a texture 8 cells across: red is its shade (halved), green whether it's white. */
function atlasTexture() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 64);
  Object.values(SPRITES).forEach((rows, i) => {
    const ox = (i % 8) * 8, oy = Math.floor(i / 8) * 8;
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const o = ((oy + y) * 64 + ox + x) * 4;
      img.data[o] = ch === 'W' ? 255 : Math.round((SHADES[ch] / 2) * 255);
      img.data[o + 1] = ch === 'W' ? 255 : 0;
      img.data[o + 3] = 255;
    }));
  });
  ctx.putImageData(img, 0, 0);
  atlas = new THREE.CanvasTexture(c);
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  return atlas;
}

const vertexShader = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aFrame;
uniform float uScale;
uniform float uToward;
varying vec4 vColor;
varying vec2 vCell;
varying float vDepth;
void main() {
  // Drawn a little nearer, along the line from the camera, so the body it's on doesn't bury it: in the same place on
  // screen, and sized as if it weren't.
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float away = length(mv.xyz);
  gl_Position = projectionMatrix * vec4(mv.xyz * (max(0.05, away - uToward) / away), 1.0);
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  vColor = aColor;
  vCell = vec2(mod(aFrame, 8.0), floor(aFrame / 8.0));
  vDepth = -mv.z;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec4 vColor;
varying vec2 vCell;
varying float vDepth;
void main() {
  vec2 pc = clamp(gl_PointCoord, 0.001, 0.999);
  vec4 tex = texture2D(uAtlas, vec2((vCell.x + pc.x) / 8.0, 1.0 - (vCell.y + pc.y) / 8.0));
  if (tex.a < 0.5) discard;
  vec3 col = mix(vColor.rgb * tex.r * 2.0, vec3(1.0), tex.g);
  gl_FragColor = vec4(mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth)), vColor.a);
}`;

const V = new THREE.Vector3();
const P = new THREE.Vector3();
const L = new THREE.Vector3();
const SIZE = new THREE.Vector2();
const FOG = new THREE.Color();

/**
 * Paralysed or stunned (and not frozen solid), a monster strains against its locked limbs: it shakes in fits, as if
 * trying to break free, and trembles between them. Nudges its mesh off the pose it's been given this frame (see
 * Monster.update).
 */
export function strain(m) {
  const s = m.status;
  if (!(s.paralysed > 0 || s.stunned > 0) || s.frozen > 0 || m.dead) {
    m.mesh.rotation.z = 0;
    return;
  }
  const t = m.t, fit = 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.2)) ** 3;
  const shake = 0.016 * Math.sqrt(m.height) * fit;
  m.mesh.position.x += shake * (Math.sin(t * 57) + 0.5 * Math.sin(t * 89));
  m.mesh.position.z += shake * (Math.sin(t * 63 + 1.3) + 0.5 * Math.sin(t * 101));
  m.mesh.rotation.z = 0.04 * fit * Math.sin(t * 47);
}

/** A floor's status sprites and flames, on its monsters (see the top of this file). */
export class StatusFx {
  constructor(group) {
    this.parts = [];
    this.watched = new Map(); // monster -> what's showing on it: { wait, flames, crown, total, seen }
    this.frameNo = 0;
    this.level = null;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.frame = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('aColor', attr(this.col, 4));
    geo.setAttribute('aSize', attr(this.size, 1));
    geo.setAttribute('aFrame', attr(this.frame, 1));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlasTexture() }, uScale: { value: 300 }, uToward: { value: TOWARD },
        uFogColor: { value: new THREE.Vector3() }, uFogNear: { value: 2 }, uFogFar: { value: 22 },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    group.add(this.points);
  }

  update(dt, game, level) {
    this.level = level;
    const p = game.player, n = ++this.frameNo;
    for (const m of level.monsters) {
      let st = this.watched.get(m);
      const shown = !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < RANGE && level.isVisibleWorld(m.x, m.z);
      const any = shown && SHOWN.some((k) => m.status[k] > 0);
      if (!any && !st) continue;
      st ??= this.watch(m);
      st.seen = n;
      if (any) {
        m.mesh.updateMatrixWorld(true);
        m.model.crown(st.crown);
        this.emit(st, m, dt);
      }
      this.updateFlames(st, m, shown && m.status.burning > 0, dt, game.time);
      if (!any && !st.flames.length) this.watched.delete(m);
    }
    // Monsters gone from the floor take their flames with them.
    for (const [m, st] of this.watched) {
      if (st.seen === n) continue;
      for (const f of st.flames) this.dropFlame(f);
      this.watched.delete(m);
    }
    this.step(dt);
    this.draw(game);
  }

  watch(m) {
    const st = { wait: {}, flames: [], crown: new THREE.Vector3(), total: 0, seen: 0 };
    for (const mesh of m.model.meshes) st.total += mesh.geometry.attributes.position.count;
    this.watched.set(m, st);
    return st;
  }

  /** Gives off what its statuses show, each about as often as SHOWS says. */
  emit(st, m, dt) {
    const big = Math.min(2.2, Math.max(0.6, m.height / 1.2));
    for (const key of SHOWN) {
      if (!(m.status[key] > 0)) continue;
      const show = SHOWS[key];
      st.wait[key] = (st.wait[key] ?? Math.random() * show.every) - dt * (show.body ? big : 1);
      for (let i = 0; st.wait[key] <= 0 && i < 3; i++) {
        st.wait[key] += show.every * rnd(0.6, 1.4);
        show.emit(this, m);
      }
    }
  }

  /**
   * A sprite. Where it is (x, y, z) and how it moves: its velocity (vx, vy, vz), falling at `g` once it has hung
   * `hang` seconds, slowed by `drag`, until it's below `floor`; or round `orbit` ({ at, r, w, a, h, vh, tilt }:
   * round `at` at `r` metres, `w` radians a second from `a`, `h` above it, rising `vh` a second, the ring tipped by
   * `tilt`); swaying `wob` metres side to side at `wobF`. How it looks: `frame` (a sprite), in `color` (turning to
   * `c1` over its life), its size from `size` to `size1`, fading in and out over `fadeIn` and `fadeOut` seconds to
   * `alpha`, flicking to `alt` and back `twinkle` times a second, and bursting at the end if it's a bubble that `pop`s.
   */
  add(q) {
    if (this.parts.length >= MAX) return null;
    const part = {
      age: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, hang: 0, floor: -Infinity, wob: 0, wobF: 0, ph: Math.random() * 6.3,
      alpha: 1, fadeIn: 0.05, fadeOut: 0.15, c1: null, pop: false, twinkle: 0, alt: 0, orbit: null, ...q,
    };
    part.size1 ??= part.size;
    if (part.orbit) this.orbit(part, 0);
    this.parts.push(part);
    return part;
  }

  // --- What the statuses give off ---

  /**
   * A point on its body, a corner of one of its meshes (the highest of `tries` picked), into `out` in the world, and
   * into `local` in that mesh's frame, if given. Returns the mesh, or null.
   */
  bodyPoint(m, out, tries = 1, local = null) {
    const total = this.watched.get(m).total;
    let best = null;
    for (let t = 0; t < tries; t++) {
      let r = Math.floor(Math.random() * total);
      for (const mesh of m.model.meshes) {
        const at = mesh.geometry.attributes.position;
        if (r >= at.count) {
          r -= at.count;
          continue;
        }
        V.fromBufferAttribute(at, r).applyMatrix4(mesh.matrixWorld);
        if (!best || V.y > out.y) {
          best = mesh;
          out.copy(V);
          local?.fromBufferAttribute(at, r);
        }
        break;
      }
    }
    return best;
  }

  /** A drop of `color` gathering on it and falling off (`g`: how fast), to the water or the floor below. */
  drip(m, color, g, size) {
    if (!this.bodyPoint(m, P)) return;
    this.add({
      x: P.x, y: P.y, z: P.z, g, hang: rnd(0.05, 0.25), floor: this.level.surfaceY(P.x, P.z),
      frame: FRAME.drop, size, color, life: 3, fadeIn: 0.1, fadeOut: 0.05,
    });
  }

  /** An ember flying up off it, cooling as it goes, and now and then a puff of smoke off the top of it. */
  ember(m) {
    if (!this.bodyPoint(m, P, 2)) return;
    this.add({
      x: P.x, y: P.y, z: P.z, vx: rnd(-0.12, 0.12), vy: rnd(0.5, 1.1), vz: rnd(-0.12, 0.12), drag: 0.8, wob: 0.03, wobF: 9,
      frame: FRAME.spark, size: rnd(0.06, 0.08), color: C.ember, c1: C.cinder, life: rnd(0.45, 0.85), fadeOut: 0.2,
    });
    if (Math.random() < 0.15 && this.bodyPoint(m, P, 4)) {
      this.add({
        x: P.x, y: P.y + 0.05, z: P.z, vy: rnd(0.3, 0.45), wob: 0.04, wobF: 2.5,
        frame: FRAME.wisp, size: 0.12, size1: 0.26, color: C.smoke, alpha: 0.7, life: rnd(1, 1.5), fadeIn: 0.2, fadeOut: 0.6,
      });
    }
  }

  /** A fleck of frost glittering on it, drifting down and away. */
  frost(m, frozen) {
    if (!this.bodyPoint(m, P)) return;
    const dx = P.x - m.x, dz = P.z - m.z, d = Math.hypot(dx, dz) || 1, flake = Math.random() < 0.5;
    this.add({
      x: P.x + (dx / d) * 0.03, y: P.y, z: P.z + (dz / d) * 0.03, vx: (dx / d) * 0.05, vy: rnd(-0.14, -0.04), vz: (dz / d) * 0.05,
      frame: flake ? FRAME.flake : FRAME.glint, alt: flake ? FRAME.glint : FRAME.flake, twinkle: rnd(4, 8),
      size: frozen ? rnd(0.11, 0.14) : rnd(0.09, 0.12), color: C.frost, life: rnd(0.8, 1.4), fadeIn: 0.15, fadeOut: 0.35,
    });
  }

  /** The taint of a malediction: a dark drop of it falling off, and now and then a fleck of it rising, glowing. */
  taint(m) {
    this.drip(m, C.taint, 4, 0.11);
    if (Math.random() < 0.3 && this.bodyPoint(m, P, 2)) {
      this.add({
        x: P.x, y: P.y, z: P.z, vy: rnd(0.25, 0.45), wob: 0.03, wobF: 5,
        frame: FRAME.spark, size: 0.07, color: C.taintGlow, life: rnd(0.7, 1.1), fadeIn: 0.1, fadeOut: 0.4,
      });
    }
  }

  /** A bubble rising off its head, swelling, and bursting. */
  bubble(m) {
    const c = this.watched.get(m).crown;
    this.add({
      x: c.x + rnd(-0.06, 0.06), y: c.y - 0.03, z: c.z + rnd(-0.06, 0.06), vy: rnd(0.3, 0.5), wob: 0.025, wobF: 7,
      frame: FRAME.bubble, size: 0.06, size1: 0.12, color: C.poison, life: rnd(0.8, 1.2), fadeIn: 0.1, fadeOut: 0.02, pop: true,
    });
  }

  /** Something circling its head (see add for `ring`), looking as `look` says. */
  circle(m, ring, look) {
    this.add({ ...look, orbit: { at: this.watched.get(m).crown, a: Math.random() * Math.PI * 2, vh: 0, tilt: 0, ...ring } });
  }

  heart(m) {
    this.circle(m, { r: 0.16 + m.radius * 0.5, w: 2.4, h: 0.03, vh: 0.12, tilt: 0.03 },
      { frame: FRAME.heart, size: 0.15, color: C.heart, life: 2, fadeIn: 0.25, fadeOut: 0.5 });
  }

  /** A cracked heart sinking from over its head. */
  heartbreak(m) {
    const c = this.watched.get(m).crown;
    this.add({
      x: c.x, y: c.y + 0.12, z: c.z, vy: -0.1, wob: 0.03, wobF: 3,
      frame: FRAME.broken, size: 0.14, color: C.broken, life: 1.6, fadeIn: 0.2, fadeOut: 0.6,
    });
  }

  star(m) {
    this.circle(m, { r: 0.14 + m.radius * 0.4, w: 5.5, h: 0.04, tilt: 0.06 },
      { frame: FRAME.star, size: 0.12, color: Math.random() < 0.5 ? C.star : C.starAlt, life: 0.9, fadeIn: 0.15, fadeOut: 0.25 });
  }

  /** Stars whirling fast and low round its head, dazed. */
  daze(m) {
    this.circle(m, { r: 0.12 + m.radius * 0.45, w: 7.5, h: -0.04, tilt: 0.05 },
      { frame: FRAME.star, size: 0.13, color: C.daze, life: 0.7, fadeIn: 0.1, fadeOut: 0.25 });
  }

  /** A link of the chain it drags, lying on the floor behind it a moment as it goes. */
  fetter(m) {
    const back = rnd(0.15, 0.9), side = rnd(-0.12, 0.12), fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const x = m.x - fx * (m.radius * 0.4 + back) + fz * side, z = m.z - fz * (m.radius * 0.4 + back) - fx * side;
    this.add({ x, y: this.level.surfaceY(x, z) + 0.04, z, frame: FRAME.link, size: 0.09, color: C.iron, life: 0.5, fadeIn: 0.05, fadeOut: 0.2 });
  }

  /** Murk swirling round its eyes, a little below the top of its head. */
  murk(m) {
    this.circle(m, { r: 0.06 + m.radius * 0.35, w: 1.7, h: rnd(-0.14, -0.06), tilt: 0.02 },
      { frame: FRAME.wisp, size: 0.14, size1: 0.2, color: C.murk, alpha: 0.9, life: 1.3, fadeIn: 0.3, fadeOut: 0.5 });
  }

  /** A bead of sweat flying off its head. */
  sweat(m) {
    const c = this.watched.get(m).crown, a = Math.random() * Math.PI * 2, out = rnd(0.4, 0.7);
    this.add({
      x: c.x + Math.cos(a) * 0.07, y: c.y - 0.04, z: c.z + Math.sin(a) * 0.07, vx: Math.cos(a) * out, vy: rnd(0.7, 1), vz: Math.sin(a) * out,
      g: 7, floor: this.level.surfaceY(c.x, c.z), frame: FRAME.drop, size: 0.09, color: C.sweat, life: 1.2, fadeOut: 0.05,
    });
  }

  /**
   * A sparkle on the floor at (x, y, z): glints and stars twinkling up off the tile there, one after another, where
   * you've found something hidden (a trap: see Level.showTrap). (A sprite with a negative age waits that long.)
   */
  sparkle(x, y, z) {
    for (let i = 0; i < 12; i++) {
      const star = Math.random() < 0.5;
      this.add({
        x: x + rnd(-0.45, 0.45), y: y + rnd(0.03, 0.2), z: z + rnd(-0.45, 0.45), vy: rnd(0.2, 0.45), age: -rnd(0, 0.7),
        frame: star ? FRAME.star : FRAME.glint, alt: star ? FRAME.glint : FRAME.star, twinkle: rnd(6, 10),
        size: rnd(0.08, 0.12), color: C.sparkle, life: rnd(0.7, 1.1), fadeIn: 0.12, fadeOut: 0.35,
      });
    }
  }

  /** Its wounds mending: a green cross rising off it, or a glint of gold. */
  mend(m) {
    if (!this.bodyPoint(m, P)) return;
    const glint = Math.random() < 0.3;
    this.add({
      x: P.x, y: P.y, z: P.z, vy: rnd(0.3, 0.5), wob: 0.02, wobF: 4,
      frame: glint ? FRAME.spark : FRAME.plus, size: glint ? 0.07 : 0.1, color: glint ? C.healGlint : C.heal,
      life: rnd(0.8, 1.2), fadeIn: 0.15, fadeOut: 0.4,
    });
  }

  /** Its strength draining out of it: a chevron sinking down its side. */
  drain(m) {
    const a = Math.random() * Math.PI * 2, r = m.radius * 0.9;
    this.add({
      x: m.x + Math.cos(a) * r, y: m.baseY + m.height * rnd(0.6, 0.9), z: m.z + Math.sin(a) * r, vy: rnd(-0.35, -0.22),
      frame: FRAME.chevron, size: 0.12, color: C.weak, life: 0.9, fadeIn: 0.2, fadeOut: 0.4,
    });
  }

  // --- Burning: flames on it ---

  /**
   * Keeps flames on it while it's `burning` (more on something bigger): each flares up at a spot on it, upper parts
   * likelier (fire climbs), burns a while, dies down, and flares up at another; once it's stopped burning, they die down.
   */
  updateFlames(st, m, burning, dt, time) {
    const want = burning ? (m.height < 0.7 ? 2 : m.height < 1.5 ? 3 : 4) : 0;
    while (st.flames.length < want) st.flames.push(this.newFlame(m, st.flames));
    for (let i = st.flames.length - 1; i >= 0; i--) {
      const f = st.flames[i];
      if (i >= want) f.age = Math.max(f.age, f.life - FLAME.down);
      f.age += dt;
      if (f.age >= f.life) {
        if (i < want) this.siteFlame(f, m, st.flames);
        else {
          this.dropFlame(f);
          st.flames.splice(i, 1);
        }
        continue;
      }
      const grown = smooth(Math.min(1, f.age / FLAME.up)) * smooth(Math.min(1, (f.life - f.age) / FLAME.down));
      const flick = 0.85 + Math.sin(time * 17 + f.seed * 9) * 0.08 + Math.sin(time * 5.3 + f.seed * 4) * 0.07;
      f.flame.update(time, flick * grown, Math.sin(time * 1.3 + f.seed * 7) * 0.15);
    }
  }

  newFlame(m, others) {
    const w = flameWidth(m.height), seed = Math.random();
    const flame = new Flame({ width: w, height: w * 1.6, pixel: w / 8, seed, toward: m.radius * 1.2 });
    const f = { flame, seed, age: 0, life: 1 };
    this.siteFlame(f, m, others);
    return f;
  }

  /** Moves a flame to a new spot on it (high up, likelier, and away from its others: `others`), to flare up there. */
  siteFlame(f, m, others) {
    const apart = Math.max(0.12, m.height * 0.2);
    let mesh = null;
    for (let i = 0; i < 6; i++) {
      mesh = this.bodyPoint(m, P, 2, L);
      if (!others.some((o) => o !== f && o.flame.parent && o.flame.getWorldPosition(V).distanceToSquared(P) < apart * apart)) break;
    }
    if (mesh) {
      f.flame.position.copy(L);
      mesh.add(f.flame);
    }
    f.age = 0;
    f.life = FLAME.up + rnd(...FLAME.burn) + FLAME.down;
    f.flame.update(0, 0);
  }

  dropFlame(f) {
    f.flame.removeFromParent();
    f.flame.material.dispose();
  }

  // --- Moving and drawing the sprites ---

  orbit(q, dt) {
    const o = q.orbit;
    o.a += o.w * dt;
    o.h += o.vh * dt;
    q.x = o.at.x + Math.cos(o.a) * o.r;
    q.y = o.at.y + o.h + Math.sin(o.a) * o.tilt;
    q.z = o.at.z + Math.sin(o.a) * o.r;
  }

  step(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt;
      if (q.orbit) this.orbit(q, dt);
      else if (q.age > q.hang) {
        q.vy -= q.g * dt;
        if (q.drag) {
          const k = Math.max(0, 1 - q.drag * dt);
          q.vx *= k;
          q.vy *= k;
          q.vz *= k;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        if (q.y < q.floor) q.age = q.life;
      }
      if (q.age >= q.life) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
      }
    }
  }

  draw(game) {
    const ps = this.parts;
    for (let i = 0; i < ps.length; i++) {
      const q = ps[i], k = q.age / q.life, left = q.life - q.age, popping = q.pop && left < 0.1;
      const sway = q.wob ? Math.sin(q.age * q.wobF + q.ph) * q.wob : 0;
      this.pos[i * 3] = q.x + sway;
      this.pos[i * 3 + 1] = q.y;
      this.pos[i * 3 + 2] = q.z + (q.wob ? Math.cos(q.age * q.wobF * 0.7 + q.ph) * q.wob * 0.5 : 0);
      this.size[i] = (q.size + (q.size1 - q.size) * k) * (popping ? 1.3 : 1);
      this.frame[i] = popping ? FRAME.pop : q.twinkle && Math.floor(q.age * q.twinkle + q.ph) % 2 ? q.alt : q.frame;
      for (let j = 0; j < 3; j++) this.col[i * 4 + j] = q.c1 ? q.color[j] + (q.c1[j] - q.color[j]) * k : q.color[j];
      this.col[i * 4 + 3] = q.alpha * Math.max(0, Math.min(1, q.age / q.fadeIn, left / q.fadeOut)); // (none yet if it's waiting)
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, ps.length);
    for (const name of ['position', 'aColor', 'aSize', 'aFrame']) geo.attributes[name].needsUpdate = true;
    // Sized in the world (metres), so they shrink with distance; and fading into the fog, as the walls do.
    const u = this.material.uniforms, fog = game.scene.fog;
    u.uScale.value = game.renderer.getDrawingBufferSize(SIZE).y * 0.5 * game.camera.projectionMatrix.elements[5];
    FOG.copy(fog.color).convertLinearToSRGB();
    u.uFogColor.value.set(FOG.r, FOG.g, FOG.b);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
  }
}
