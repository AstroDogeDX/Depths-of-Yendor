import * as THREE from 'three';

// Builds three.js meshes from Blockbench project files (.bbmodel, format 4.x and 5.0), so models
// saved from Blockbench load as-is with no export step. Supports cubes, meshes and nested groups with
// pivots and rotations, plus embedded textures. Everything is baked into one mesh per texture.
// Blockbench works in pixels; `scale` converts them to world units.

// Cube vertex order per face (top-left, top-right, bottom-left, bottom-right as seen from outside),
// matching Blockbench's own cube geometry so face UVs land the same way round.
const CUBE_FACES = {
  east: (f, t) => [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]], [t[0], f[1], f[2]]],
  west: (f, t) => [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]], [f[0], f[1], t[2]]],
  up: (f, t) => [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]], [t[0], t[1], t[2]]],
  down: (f, t) => [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]], [t[0], f[1], f[2]]],
  south: (f, t) => [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]], [t[0], f[1], t[2]]],
  north: (f, t) => [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]], [f[0], f[1], f[2]]],
};

const DEG = Math.PI / 180;

function loadTexture(tex) {
  const t = new THREE.TextureLoader().load(tex.source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

// Blockbench texture render modes: 'emissive' ignores lighting, 'additive' also adds onto what's behind.
// Render sides 'double' draws the back of each face too. A texture whose name ends in "_translucent" is
// alpha-blended (see-through) rather than having its transparent texels cut out.
// Emissive cut-outs (glowing runes and glyphs, often a texel or two wide) keep texels down to a low alpha, so
// their lines don't vanish in the blurrier mipmaps they're drawn with from a distance or a glancing angle.
function material(tex, name) {
  const map = tex.source ? loadTexture(tex) : null;
  const side = tex.render_sides === 'double' ? THREE.DoubleSide : THREE.FrontSide;
  if (tex.render_mode === 'emissive') return new THREE.MeshBasicMaterial({ map, side, alphaTest: 0.2 });
  if (tex.render_mode === 'additive') {
    return new THREE.MeshBasicMaterial({ map, side, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  if (name.endsWith('_translucent')) return new THREE.MeshLambertMaterial({ map, side, flatShading: true, transparent: true, alphaTest: 0.02 });
  return new THREE.MeshLambertMaterial({ map, side, flatShading: true, alphaTest: 0.5 });
}

class Builder {
  constructor(json) {
    this.json = json;
    const res = json.resolution || { width: 16, height: 16 };
    this.textures = (json.textures || []).map((tex) => {
      const name = (tex.name || '').replace(/\.png$/i, '');
      return { name, uvW: tex.uv_width || res.width, uvH: tex.uv_height || res.height, material: material(tex, name) };
    });
    this.fallback = { uvW: res.width, uvH: res.height, material: new THREE.MeshLambertMaterial({ color: 0xff00ff, flatShading: true }) };
    this.elements = new Map((json.elements || []).map((e) => [e.uuid, e]));
    this.groups = new Map((json.groups || []).map((g) => [g.uuid, g]));
    // Group pivots by name, in model space: empty groups make handy attachment points.
    this.anchors = {};
  }

  // Triangles are gathered per texture ("buckets": flat arrays of positions and uvs), then made into meshes.
  // Faces with no texture assigned use the first one; a missing texture shows magenta.
  bucket(buckets, index) {
    const tex = this.textures[index ?? 0] || this.fallback;
    if (!buckets.has(tex)) buckets.set(tex, { pos: [], uv: [], tex });
    return buckets.get(tex);
  }

  tri(buckets, texIndex, matrix, a, b, c) {
    const bk = this.bucket(buckets, texIndex);
    const v = new THREE.Vector3();
    for (const p of [a, b, c]) {
      v.set(p.xyz[0], p.xyz[1], p.xyz[2]).applyMatrix4(matrix);
      bk.pos.push(v.x, v.y, v.z);
      bk.uv.push(p.uv[0] / bk.tex.uvW, 1 - p.uv[1] / bk.tex.uvH);
    }
  }

  cube(buckets, el, matrix) {
    const inf = el.inflate || 0;
    const f = el.from.map((v, i) => v - inf - el.origin[i]);
    const t = el.to.map((v, i) => v + inf - el.origin[i]);
    for (const dir in CUBE_FACES) {
      const face = el.faces?.[dir];
      if (!face || face.texture === null || face.enabled === false) continue;
      const corners = CUBE_FACES[dir](f, t);
      const [u1, v1, u2, v2] = face.uv;
      let uv = [[u1, v1], [u2, v1], [u1, v2], [u2, v2]];
      for (let r = face.rotation || 0; r > 0; r -= 90) uv = [uv[2], uv[0], uv[3], uv[1]];
      const p = corners.map((xyz, i) => ({ xyz, uv: uv[i] }));
      this.tri(buckets, face.texture, matrix, p[0], p[2], p[1]);
      this.tri(buckets, face.texture, matrix, p[2], p[3], p[1]);
    }
  }

  mesh(buckets, el, matrix) {
    for (const key in el.faces) {
      const face = el.faces[key];
      if (face.texture === null || face.vertices.length < 3) continue;
      const keys = sortQuad(el.vertices, face.vertices);
      const p = keys.map((k) => ({ xyz: el.vertices[k], uv: face.uv[k] || [0, 0] }));
      this.tri(buckets, face.texture, matrix, p[0], p[1], p[2]);
      if (p.length === 4) this.tri(buckets, face.texture, matrix, p[0], p[2], p[3]);
    }
  }

  // Walks the outliner. Nodes sit at their pivot relative to the parent's pivot and rotate in ZYX order.
  // `world` places a node in the model; `geo` is what its geometry is baked with. They are the same unless
  // rigging, where every group becomes its own object and the geometry under it is local to it.
  walk(items, world, geo, parentOrigin, obj, buckets) {
    for (const item of items) {
      const isGroup = typeof item === 'object';
      // Format 5 keeps group data in `groups`; format 4 inlines it in the outliner.
      const node = isGroup ? (this.groups.get(item.uuid) || item) : this.elements.get(item);
      if (!node || node.export === false) continue;
      const origin = node.origin || [0, 0, 0];
      const offset = new THREE.Vector3(origin[0] - parentOrigin[0], origin[1] - parentOrigin[1], origin[2] - parentOrigin[2]);
      const rotation = new THREE.Euler(...(node.rotation || [0, 0, 0]).map((r) => r * DEG), 'ZYX');
      const scale = new THREE.Vector3(...(node.scale || [1, 1, 1]));
      const local = new THREE.Matrix4().compose(offset, new THREE.Quaternion().setFromEuler(rotation), scale);
      const placed = world.clone().multiply(local);
      if (!isGroup) {
        const matrix = geo.clone().multiply(local);
        if (node.type === 'mesh') this.mesh(buckets, node, matrix);
        else if (!node.type || node.type === 'cube') this.cube(buckets, node, matrix);
        continue;
      }
      this.anchors[node.name] = new THREE.Vector3().setFromMatrixPosition(placed).toArray();
      if (!this.rig) {
        this.walk(item.children || [], placed, geo.clone().multiply(local), origin, obj, buckets);
        continue;
      }
      const bone = new THREE.Group();
      bone.name = node.name;
      bone.position.copy(offset).multiplyScalar(this.scale);
      bone.rotation.copy(rotation);
      bone.scale.copy(scale);
      obj.add(bone);
      const own = new Map();
      this.walk(item.children || [], placed, new THREE.Matrix4().makeScale(this.scale, this.scale, this.scale), origin, bone, own);
      this.flush(own, bone);
    }
  }

  flush(buckets, obj) {
    for (const bk of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, bk.tex.material);
      mesh.name = bk.tex.name || '';
      obj.add(mesh);
    }
  }

  build(scale, rig) {
    this.scale = scale;
    this.rig = rig;
    const s = new THREE.Matrix4().makeScale(scale, scale, scale);
    const root = new THREE.Group();
    const buckets = new Map();
    // Older files without an outliner list their elements loose at the root.
    this.walk(this.json.outliner || (this.json.elements || []).map((e) => e.uuid), s, s, [0, 0, 0], root, buckets);
    this.flush(buckets, root);
    root.userData.anchors = this.anchors;
    return root;
  }
}

// Blockbench saves quads in perimeter order, but older files may not; this is its own reordering test.
function sortQuad(vertices, keys) {
  if (keys.length < 4) return keys;
  const v = keys.map((k) => new THREE.Vector3(...vertices[k]));
  const across = (b1, b2, top, check) => {
    const normal = new THREE.Line3(b1, b2).closestPointToPoint(top, false, new THREE.Vector3()).sub(top);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, b2).distanceToPoint(check) > 0;
  };
  if (across(v[1], v[2], v[0], v[3])) return [keys[2], keys[0], keys[1], keys[3]];
  if (across(v[0], v[1], v[2], v[3])) return [keys[0], keys[2], keys[1], keys[3]];
  return keys;
}

/**
 * Parses a .bbmodel (JSON text or object) into a Group of meshes, one per texture and named after it.
 * With `rig`, each Blockbench group instead becomes a child Group (a bone) of the same name, placed at its
 * pivot, holding the meshes of its own elements, so code can move and turn the parts.
 * `userData.anchors` maps each group's name to its pivot as [x, y, z] in the returned group's space.
 */
export function buildBBModel(source, scale = 1 / 16, { rig = false } = {}) {
  const json = typeof source === 'string' ? JSON.parse(source) : source;
  return new Builder(json).build(scale, rig);
}

