import * as THREE from 'three';

// Haze rising out of channels, in chunky pixels: the violet miasma welling up out of the Dwarven Ruins' rifts,
// and the shimmer of heat and flying embers over the Underworld's lava. Each channel tile has a tall quad that
// turns to face the camera (like the flames), all sharing one material, each its own pattern (seeded by where it
// stands): billows scrolling upward, thick low down and thinning away above the floor, with motes of light
// drifting up through them. It fades as you come close, so it never fills the screen, and with the fog.

const GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // base at the origin

/**
 * base/height/width: where the quads stand (metres, from `base` below the floor) and how big; pixel: metres per
 * haze pixel; rise: where the haze thins out, from and to (in quad heights above the floor); speed: how fast it
 * billows up; motes: how many (at most 8) to a quad, each rising from `moteStart` (up the quad) to the top in
 * `moteLife` [min, max] seconds; colors: the haze's three shades, dark to bright, and the motes'. Colours are
 * display colours, like the flames'.
 */
export const HAZES = {
  miasma: {
    base: -2.5, height: 5, width: 2.6, pixel: 0.09, rise: [-0.1, 0.4], speed: 0.32, motes: 3, moteStart: 0.3, moteLife: [3, 6],
    colors: [[0.07, 0.02, 0.11], [0.13, 0.04, 0.21], [0.24, 0.09, 0.37], [0.7, 0.5, 0.95]],
  },
  embers: {
    base: -0.7, height: 2.8, width: 2.2, pixel: 0.07, rise: [-0.2, 0.13], speed: 0.55, motes: 6, moteStart: 0.03, moteLife: [1.2, 2.8],
    colors: [[0.12, 0.03, 0.0], [0.24, 0.07, 0.01], [0.4, 0.14, 0.02], [1.0, 0.6, 0.16]],
  },
};

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
varying float vNear;
varying float vSeed;
void main() {
  vUv = uv;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - center;
  toCam.y = 0.0;
  float away = length(toCam);
  vec3 right = away > 1e-4 ? normalize(cross(vec3(0.0, 1.0, 0.0), toCam)) : vec3(1.0, 0.0, 0.0);
  vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec3 world = center + right * position.x * size.x + vec3(0.0, position.y * size.y, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  vNear = smoothstep(0.9, 2.6, away); // thin out when you're right over it
  vSeed = fract(center.x * 0.137 + center.z * 0.311);
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec2 uGrid;
uniform float uFloor; // where the floor is, up the quad (0..1)
uniform vec2 uRise;
uniform float uSpeed;
uniform int uMotes;
uniform float uMoteStart;
uniform vec2 uMoteLife;
uniform vec3 uColors[4];
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vDepth;
varying float vNear;
varying float vSeed;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 9.1) * 0.15; }

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 uv = (cell + 0.5) / uGrid;
  float t = uTime + vSeed * 40.0;
  // Billows, rising and swaying.
  vec2 q = vec2(uv.x * 2.4 + sin(uv.y * 3.0 + t * 0.4 + vSeed * 6.0) * 0.3, uv.y * 3.2 - t * uSpeed);
  float n = fbm(q + vSeed * 17.0);
  float rise = 1.0 - smoothstep(uFloor + uRise.x, uFloor + uRise.y, uv.y);
  float side = 1.0 - smoothstep(0.18, 0.46, abs(uv.x - 0.5));
  float d = n * rise * side * (0.55 + 0.45 * vNear);
  vec3 col = d > 0.56 ? uColors[2] : d > 0.44 ? uColors[1] : d > 0.32 ? uColors[0] : vec3(0.0);

  // Motes drifting up, fading as they go.
  for (int i = 0; i < 8; i++) {
    if (i >= uMotes) break;
    float fi = float(i) + vSeed * 7.0;
    float period = uMoteLife.x + hash(vec2(fi, 1.7)) * (uMoteLife.y - uMoteLife.x);
    float phase = t / period + hash(vec2(fi, 4.2));
    float k = fract(phase), cycle = floor(phase);
    float x0 = 0.3 + hash(vec2(fi, cycle)) * 0.4;
    vec2 sp = vec2(x0 + sin(k * 5.0 + fi) * 0.08, uMoteStart + k * (1.0 - uMoteStart));
    if (floor(sp * uGrid) == cell) col = max(col, uColors[3] * (1.0 - k));
  }
  if (col == vec3(0.0)) discard;
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(col * fog * vNear, 1.0);
}`;

export class Haze {
  /**
   * `tiles`: the channel tiles' centres ({ x, z } in metres); `kind`: a key of HAZES; `scroll`: a texture to churn
   * slowly with it (the glow at the bottom of a rift).
   */
  constructor(group, tiles, kind, { fogNear, fogFar }, scroll = null) {
    const h = HAZES[kind];
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGrid: { value: new THREE.Vector2(Math.round(h.width / h.pixel), Math.round(h.height / h.pixel)) },
        uFloor: { value: -h.base / h.height },
        uRise: { value: new THREE.Vector2(...h.rise) },
        uSpeed: { value: h.speed },
        uMotes: { value: h.motes },
        uMoteStart: { value: h.moteStart },
        uMoteLife: { value: new THREE.Vector2(...h.moteLife) },
        uColors: { value: h.colors.map((c) => new THREE.Vector3(...c)) },
        uFogNear: { value: fogNear },
        uFogFar: { value: fogFar },
      },
      vertexShader, fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    for (const t of tiles) {
      const quad = new THREE.Mesh(GEO, this.material);
      quad.position.set(t.x, h.base, t.z);
      quad.scale.set(h.width, h.height, 1);
      group.add(quad);
    }
    this.scroll = scroll;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    this.scroll?.offset.set(time * 0.013, time * 0.008);
  }
}
