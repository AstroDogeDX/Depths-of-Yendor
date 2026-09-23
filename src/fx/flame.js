import * as THREE from 'three';

// Pixel-art flame. A quad that turns about the vertical to face the camera (so flames always rise,
// however the torch is tilted), shaded on a coarse grid of "pixels" to match the chunky textures:
// a teardrop of stepped fire colours, its edges licked away by scrolling noise, and a few sparks
// drifting up off the top.

const GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // base at the origin

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - center;
  toCam.y = 0.0;
  vec3 right = length(toCam) > 1e-4 ? normalize(cross(vec3(0.0, 1.0, 0.0), toCam)) : vec3(1.0, 0.0, 0.0);
  vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec3 world = center + right * position.x * size.x + vec3(0.0, position.y * size.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uFlick; // height of the flame, ~0.7-1.0 of the quad's lower part
uniform float uLean;  // sideways lean of the tip, in quad widths
uniform vec2 uGrid;   // flame pixels across and up
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Output is already display colour (sRGB), like the palettes in the textures.
const vec3 WHITE = vec3(1.0, 0.957, 0.784);
const vec3 YELLOW = vec3(1.0, 0.824, 0.29);
const vec3 ORANGE = vec3(1.0, 0.54, 0.11);
const vec3 RED = vec3(0.82, 0.25, 0.09);
const vec3 EMBER = vec3(0.5, 0.12, 0.05);

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 uv = (cell + 0.5) / uGrid;
  float t = uTime + uSeed * 37.0;
  float h = 0.8 * uFlick;
  float fy = uv.y / h; // 0 at the base, 1 at the tip
  vec4 col = vec4(0.0);

  if (fy < 1.0) {
    float sway = (noise(vec2(t * 1.6, fy * 1.5 + uSeed * 9.0)) - 0.5) * 0.24 * fy + uLean * fy * fy;
    float x = uv.x - 0.5 - sway;
    float w = 0.4 * pow(1.0 - fy, 0.7) * (0.72 + 0.28 * smoothstep(0.0, 0.3, fy));
    float f = 1.0 - abs(x) / max(w, 1e-3);
    f += (1.0 - fy) * 0.3; // hotter low down
    f -= noise(vec2(uv.x * 5.0 + uSeed * 13.0, fy * 3.2 - t * 4.2)) * (0.2 + 0.6 * fy); // licking tongues
    if (f > 0.8) col = vec4(WHITE, 1.0);
    else if (f > 0.55) col = vec4(YELLOW, 1.0);
    else if (f > 0.3) col = vec4(ORANGE, 1.0);
    else if (f > 0.08) col = vec4(RED, 0.9);
  }

  // Sparks: a few single pixels that rise off the flame, cooling from yellow to a dull ember.
  if (col.a == 0.0) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i) + uSeed * 5.0;
      float period = 0.7 + hash(vec2(fi, 1.3)) * 0.8;
      float phase = t / period + hash(vec2(fi, 7.1));
      float k = fract(phase), cycle = floor(phase);
      if (hash(vec2(fi, cycle + 0.5)) < 0.4) continue; // not every cycle throws a spark
      float x0 = 0.5 + (hash(vec2(fi, cycle)) - 0.5) * 0.4;
      vec2 sp = vec2(x0 + sin(k * 7.0 + fi) * 0.06 + uLean * (0.4 + k), h * 0.6 + k * (1.0 - h * 0.6));
      if (floor(sp * uGrid) == cell) col = vec4(mix(YELLOW, EMBER, k), 1.0 - k * 0.5);
    }
  }
  if (col.a == 0.0) discard;
  gl_FragColor = col;
}`;

export class Flame extends THREE.Mesh {
  /**
   * @param width, height  size of the quad in world units; the flame fills the lower ~3/4, sparks the rest
   * @param pixel          size of one flame pixel in world units
   */
  constructor({ width, height, pixel, seed = Math.random() }) {
    super(GEO, new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uFlick: { value: 1 },
        uLean: { value: 0 },
        uGrid: { value: new THREE.Vector2(Math.round(width / pixel), Math.round(height / pixel)) },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
    }));
    this.scale.set(width, height, 1);
  }

  update(time, flick = 1, lean = 0) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uFlick.value = flick;
    u.uLean.value = lean;
  }
}
