import * as THREE from 'three';

// Every builder returns { root, animate(s), materials, height } plus `weapon` for armed humanoids.
// root's origin is at the creature's feet and it faces local +z.
// animate(s) receives { t, walk, windup, strike, dead } where windup/strike are 0..1 progress or -1.

function kit() {
  const materials = [];
  const mat = (color, opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
    m.userData.baseEmissive = m.emissive.getHex();
    materials.push(m);
    return m;
  };
  const glow = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
  const mesh = (geo, m) => new THREE.Mesh(geo, m);
  const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
  return { materials, mat, glow, mesh, box };
}

function eyes(k, parent, color, y, z, spread, size = 0.04) {
  const g = k.glow(color);
  for (const s of [-1, 1]) {
    const e = k.box(size, size, size * 0.5, g);
    e.position.set(s * spread, y, z);
    parent.add(e);
  }
}

// Generic biped used by most dungeon denizens.
function humanoid(k, o) {
  const h = o.h, bulk = o.bulk ?? 1, limb = (o.limb ?? 0.11) * bulk;
  const legLen = h * 0.44, torsoH = h * 0.32, armLen = h * (o.armFactor ?? 0.36), headS = o.head ?? h * 0.16;
  const skin = k.mat(o.skin), cloth = k.mat(o.cloth ?? o.skin, o.clothOpts);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const leg = (side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.1 * bulk, legLen, 0);
    const m = k.box(limb * 1.1, legLen, limb * 1.1, cloth);
    m.position.y = -legLen / 2;
    p.add(m);
    root.add(p);
    return p;
  };
  const legL = leg(-1), legR = leg(1);

  const torso = k.box(0.34 * bulk, torsoH, 0.2 * bulk, cloth);
  torso.position.y = legLen + torsoH / 2;
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = legLen + torsoH + headS / 2 + 0.02;
  const headMesh = o.headGeo ? k.mesh(o.headGeo, skin) : k.box(headS, headS, headS, skin);
  head.add(headMesh);
  eyes(k, head, o.eyes ?? 0xff3020, headS * 0.1, headS / 2 + 0.005, headS * 0.22, Math.max(0.035, headS * 0.14));
  body.add(head);

  const arm = (side) => {
    const p = new THREE.Group();
    p.position.set(side * (0.17 * bulk + limb / 2), legLen + torsoH - 0.05, 0);
    const m = k.box(limb, armLen, limb, skin);
    m.position.y = -armLen / 2;
    p.add(m);
    body.add(p);
    return p;
  };
  const armL = arm(-1), armR = arm(1);
  const hand = new THREE.Group();
  hand.position.y = -armLen;
  armR.add(hand);

  const parts = { root, body, legL, legR, armL, armR, head, hand, torso, skin, cloth, armLen };
  const lean = o.lean ?? 0;
  body.rotation.x = lean;

  const animate = (s) => {
    const sw = Math.sin(s.walk) * 0.55;
    legL.rotation.x = sw;
    legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.8;
    let ar = sw * 0.8;
    body.rotation.x = lean;
    if (s.windup >= 0) ar = -2.7 * easeOut(s.windup);
    else if (s.strike >= 0) {
      ar = -2.7 + 2.4 * easeOut(Math.min(1, s.strike * 2));
      body.rotation.x = lean + 0.25 * Math.sin(Math.PI * s.strike);
    }
    armR.rotation.x = ar;
    body.position.y = Math.abs(Math.sin(s.walk)) * 0.03;
  };
  return { parts, animate };
}

const easeOut = (x) => 1 - (1 - x) * (1 - x);

// Monster weapons point +z out of the hand. The overhead chop rotates the arm about x, which leads
// with the weapon's -y side, so axe bits and halberd blades hang toward -y and blades are wide along y.
function weaponBlade(k, parent, len, color = 0xb8bcc4) {
  const m = k.mat(color);
  const hilt = k.box(0.04, 0.04, 0.12, k.mat(0x3a2a1a));
  const blade = k.box(0.03, 0.05, len, m);
  blade.position.z = len / 2 + 0.05;
  const guard = k.box(0.03, 0.16, 0.03, k.mat(0x6a5a3a));
  guard.position.z = 0.06;
  const g = new THREE.Group();
  g.add(hilt, blade, guard);
  parent.add(g);
  return g;
}

function weaponAxe(k, parent, len) {
  const g = new THREE.Group();
  const haft = k.box(0.05, 0.05, len, k.mat(0x5a3a1a));
  haft.position.z = len / 2;
  const headM = k.box(0.04, 0.32, 0.22, k.mat(0x8a8e94));
  headM.position.set(0, -0.1, len - 0.1);
  g.add(haft, headM);
  parent.add(g);
  return g;
}

const BUILDERS = {
  rat() {
    const k = kit();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const fur = k.mat(0x6a5040);
    const torso = k.box(0.34, 0.24, 0.62, fur);
    torso.position.y = 0.22;
    const head = k.mesh(new THREE.ConeGeometry(0.14, 0.32, 5), fur);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.24, 0.45);
    eyes(k, body, 0xff2010, 0.3, 0.42, 0.07, 0.04);
    const tail = k.mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.6, 4), k.mat(0xb08878));
    tail.rotation.x = Math.PI / 2 - 0.3;
    tail.position.set(0, 0.16, -0.58);
    for (const s of [-1, 1]) {
      const ear = k.box(0.08, 0.1, 0.03, k.mat(0xb08878));
      ear.position.set(s * 0.1, 0.36, 0.34);
      body.add(ear);
    }
    body.add(torso, head, tail);
    const legs = [];
    for (const [x, z] of [[-0.14, 0.2], [0.14, 0.2], [-0.14, -0.2], [0.14, -0.2]]) {
      const l = k.box(0.06, 0.14, 0.06, fur);
      l.position.set(x, 0.07, z);
      root.add(l);
      legs.push(l);
    }
    const animate = (s) => {
      legs.forEach((l, i) => (l.position.y = 0.07 + Math.max(0, Math.sin(s.walk * 1.5 + i * 1.6)) * 0.05));
      body.position.z = s.windup >= 0 ? -0.12 * s.windup : s.strike >= 0 ? 0.3 * Math.sin(Math.PI * s.strike) : 0;
      tail.rotation.y = Math.sin(s.t * 6) * 0.3;
    };
    return { root, animate, materials: k.materials, height: 0.45 };
  },

  bat() {
    const k = kit();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const fur = k.mat(0x3a2a24);
    const wingMat = k.mat(0x2a1e1a, { side: THREE.DoubleSide });
    const torso = k.mesh(new THREE.SphereGeometry(0.14, 6, 4), fur);
    body.add(torso);
    eyes(k, body, 0xff3020, 0.05, 0.13, 0.05, 0.035);
    for (const s of [-1, 1]) {
      const ear = k.mesh(new THREE.ConeGeometry(0.04, 0.12, 4), fur);
      ear.position.set(s * 0.06, 0.15, 0.03);
      body.add(ear);
    }
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.1, 0.6, 0.05, 0.0, 0.2, 0, -0.18,
      0.6, 0.05, 0.0, 0.5, -0.02, -0.22, 0.2, 0, -0.18,
    ], 3));
    wingGeo.computeVertexNormals();
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = k.mesh(wingGeo, wingMat);
      w.scale.x = s;
      pivot.add(w);
      body.add(pivot);
      wings.push({ pivot, s });
    }
    const animate = (s) => {
      const f = Math.sin(s.t * 20) * 0.9;
      wings.forEach(({ pivot, s: side }) => (pivot.rotation.z = side * f));
      body.position.y = Math.sin(s.t * 5) * 0.08;
      body.position.z = s.strike >= 0 ? 0.35 * Math.sin(Math.PI * s.strike) : 0;
    };
    return { root, animate, materials: k.materials, height: 0.3 };
  },

  slime() {
    const k = kit();
    const root = new THREE.Group();
    const gel = k.mat(0x40b040, { transparent: true, opacity: 0.78, emissive: 0x0a300a });
    gel.userData.baseEmissive = 0x0a300a;
    const blob = k.mesh(new THREE.SphereGeometry(0.46, 8, 6), gel);
    const core = k.mesh(new THREE.SphereGeometry(0.16, 5, 4), k.mat(0x205020));
    core.position.set(0.05, -0.05, -0.05);
    blob.add(core);
    for (const s of [-1, 1]) {
      const e = k.mesh(new THREE.SphereGeometry(0.05, 4, 3), k.glow(0x101010));
      e.position.set(s * 0.13, 0.12, 0.4);
      blob.add(e);
    }
    root.add(blob);
    const animate = (s) => {
      let sy = 0.65 + Math.sin(s.t * 4) * 0.06;
      let z = 0;
      if (s.windup >= 0) sy = 0.65 - 0.2 * s.windup;
      else if (s.strike >= 0) { sy = 0.45 + 0.4 * Math.sin(Math.PI * s.strike); z = 0.3 * Math.sin(Math.PI * s.strike); }
      blob.scale.set(1 + (0.65 - sy) * 0.5, sy, 1 + (0.65 - sy) * 0.5);
      blob.position.set(0, 0.46 * sy, z);
    };
    return { root, animate, materials: k.materials, height: 0.6 };
  },

  goblin() {
    const k = kit();
    const { parts, animate } = humanoid(k, { h: 1.15, skin: 0x5a8a3a, cloth: 0x5a4030, head: 0.26, eyes: 0xffd020 });
    for (const s of [-1, 1]) {
      const ear = k.mesh(new THREE.ConeGeometry(0.05, 0.2, 4), parts.skin);
      ear.rotation.z = s * -Math.PI / 2;
      ear.position.set(s * 0.2, 0.03, 0);
      parts.head.add(ear);
    }
    const w = weaponBlade(k, parts.hand, 0.28);
    return { root: parts.root, animate, materials: k.materials, height: 1.15, weapon: w };
  },

  archer() {
    const k = kit();
    const { parts, animate: base } = humanoid(k, { h: 1.15, skin: 0x4a7a3a, cloth: 0x2a4a2a, head: 0.26, eyes: 0xffd020 });
    const hood = k.mesh(new THREE.ConeGeometry(0.2, 0.3, 5), parts.cloth);
    hood.position.y = 0.16;
    parts.head.add(hood);
    const bowHand = new THREE.Group();
    bowHand.position.y = -parts.armLen;
    parts.armL.add(bowHand);
    const bow = k.mesh(new THREE.TorusGeometry(0.3, 0.02, 3, 8, Math.PI), k.mat(0x6a4a2a));
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
    bowHand.add(bow);
    const animate = (s) => {
      base({ ...s, windup: -1, strike: -1 });
      if (s.windup >= 0 || s.strike >= 0) {
        parts.armL.rotation.x = -Math.PI / 2;
        parts.armR.rotation.x = -Math.PI / 2 + (s.windup >= 0 ? 0 : 0.3);
      }
    };
    return { root: parts.root, animate, materials: k.materials, height: 1.15 };
  },

  skeleton() {
    const k = kit();
    const { parts, animate } = humanoid(k, {
      h: 1.75, skin: 0xd8d0b8, cloth: 0xc8c0a8, limb: 0.07, head: 0.24, eyes: 0xff4010,
      headGeo: new THREE.SphereGeometry(0.13, 6, 5),
    });
    // Ribs
    for (let i = 0; i < 3; i++) {
      const rib = k.box(0.38, 0.03, 0.22, parts.skin);
      rib.position.y = parts.torso.position.y + 0.12 - i * 0.1;
      parts.body.add(rib);
    }
    parts.torso.scale.set(0.3, 1, 0.6);
    const w = weaponBlade(k, parts.hand, 0.7);
    return { root: parts.root, animate, materials: k.materials, height: 1.75, weapon: w };
  },

  orc() {
    const k = kit();
    const { parts, animate } = humanoid(k, { h: 1.95, bulk: 1.35, skin: 0x6a7a4a, cloth: 0x3a2a20, head: 0.3, eyes: 0xff2010 });
    for (const s of [-1, 1]) {
      const tusk = k.mesh(new THREE.ConeGeometry(0.025, 0.1, 4), k.mat(0xeee8d0));
      tusk.position.set(s * 0.08, -0.1, 0.16);
      parts.head.add(tusk);
    }
    const w = weaponAxe(k, parts.hand, 0.8);
    return { root: parts.root, animate, materials: k.materials, height: 1.95, weapon: w };
  },

  wraith() {
    const k = kit();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const robe = k.mat(0x1a1428, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: 0x0c0818 });
    robe.userData.baseEmissive = 0x0c0818;
    const cone = k.mesh(new THREE.ConeGeometry(0.45, 1.5, 7, 1, true), robe);
    cone.position.y = 0.75;
    const hood = k.mesh(new THREE.SphereGeometry(0.22, 6, 5), robe);
    hood.position.set(0, 1.55, 0.02);
    const face = k.mesh(new THREE.SphereGeometry(0.15, 6, 4), k.glow(0x000000));
    face.position.set(0, 1.53, 0.1);
    body.add(cone, hood, face);
    eyes(k, body, 0x80e0ff, 1.56, 0.25, 0.06, 0.045);
    const arms = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      p.position.set(s * 0.25, 1.25, 0.05);
      const a = k.box(0.08, 0.08, 0.6, robe);
      a.position.z = 0.3;
      p.add(a);
      body.add(p);
      arms.push(p);
    }
    const animate = (s) => {
      body.position.y = Math.sin(s.t * 2) * 0.1;
      body.rotation.z = Math.sin(s.t * 1.3) * 0.05;
      let ax = 0.4;
      if (s.windup >= 0) ax = 0.4 - 1.4 * s.windup;
      else if (s.strike >= 0) ax = -1.0 + 1.4 * s.strike;
      arms.forEach((a) => (a.rotation.x = ax));
      body.position.z = s.strike >= 0 ? 0.3 * Math.sin(Math.PI * s.strike) : 0;
    };
    return { root, animate, materials: k.materials, height: 1.7 };
  },

  imp() {
    const k = kit();
    const { parts, animate: base } = humanoid(k, {
      h: 0.95, skin: 0xb02a10, cloth: 0x6a1408, head: 0.24, eyes: 0xffff60,
      clothOpts: { emissive: 0x200400 },
    });
    parts.skin.emissive.setHex(0x3a0800);
    parts.skin.userData.baseEmissive = 0x3a0800;
    for (const s of [-1, 1]) {
      const horn = k.mesh(new THREE.ConeGeometry(0.035, 0.15, 4), k.mat(0x201010));
      horn.position.set(s * 0.08, 0.15, 0);
      horn.rotation.z = -s * 0.4;
      parts.head.add(horn);
    }
    const wingMat = k.mat(0x501008, { side: THREE.DoubleSide });
    const wings = [];
    for (const s of [-1, 1]) {
      const w = k.mesh(new THREE.PlaneGeometry(0.35, 0.3), wingMat);
      w.position.set(s * 0.2, parts.torso.position.y + 0.08, -0.14);
      w.rotation.y = s * 0.6;
      parts.body.add(w);
      wings.push({ w, s });
    }
    const animate = (s) => {
      base(s);
      wings.forEach(({ w, s: side }) => (w.rotation.y = side * (0.6 + Math.sin(s.t * 14) * 0.4)));
      parts.root.position.y = 0.1 + Math.sin(s.t * 6) * 0.05;
    };
    return { root: parts.root, animate, materials: k.materials, height: 1.0 };
  },

  troll() {
    const k = kit();
    const { parts, animate } = humanoid(k, {
      h: 2.3, bulk: 1.6, skin: 0x5a6a5a, cloth: 0x3a3228, head: 0.34, eyes: 0xffa010, armFactor: 0.46, lean: 0.3,
    });
    const club = k.mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.9, 5), k.mat(0x4a3420));
    club.rotation.x = Math.PI / 2;
    club.position.z = 0.4;
    parts.hand.add(club);
    return { root: parts.root, animate, materials: k.materials, height: 2.2 };
  },

  golem() {
    const k = kit();
    const { parts, animate } = humanoid(k, {
      h: 2.35, bulk: 1.9, skin: 0x7a7870, cloth: 0x686660, head: 0.34, eyes: 0xff8020, limb: 0.14,
    });
    const core = k.box(0.18, 0.18, 0.05, k.glow(0xff7010));
    core.position.set(0, parts.torso.position.y + 0.05, 0.2 * 1.9 / 2 + 0.01);
    parts.body.add(core);
    for (const arm of [parts.armL, parts.armR]) {
      const fist = k.box(0.3, 0.3, 0.3, parts.skin);
      fist.position.y = -parts.armLen;
      arm.add(fist);
    }
    return { root: parts.root, animate, materials: k.materials, height: 2.35 };
  },

  warden() {
    const k = kit();
    const { parts, animate } = humanoid(k, {
      h: 2.7, bulk: 1.6, skin: 0x2e2440, cloth: 0x3a2a5a, head: 0.36, eyes: 0xffd040,
    });
    const gold = k.mat(0xc8a030, { emissive: 0x302000 });
    gold.userData.baseEmissive = 0x302000;
    for (let i = 0; i < 5; i++) {
      const spike = k.mesh(new THREE.ConeGeometry(0.04, 0.22, 4), gold);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.sin(a) * 0.15, 0.24, Math.cos(a) * 0.15);
      parts.head.add(spike);
    }
    const trim = k.box(0.6, 0.06, 0.36, gold);
    trim.position.y = parts.torso.position.y - 0.36;
    parts.body.add(trim);
    const cape = k.mesh(new THREE.PlaneGeometry(0.8, 1.6), k.mat(0x401028, { side: THREE.DoubleSide }));
    cape.position.set(0, parts.torso.position.y - 0.35, -0.2);
    parts.body.add(cape);
    const halberd = new THREE.Group();
    const pole = k.box(0.06, 0.06, 2.0, k.mat(0x2a1a10));
    pole.position.z = 0.5;
    const blade = k.box(0.04, 0.45, 0.35, gold);
    blade.position.set(0, -0.18, 1.35);
    halberd.add(pole, blade);
    parts.hand.add(halberd);
    return { root: parts.root, animate, materials: k.materials, height: 2.8, weapon: halberd };
  },
};

export function buildMonsterModel(type) {
  const b = BUILDERS[type];
  if (!b) throw new Error(`No model for monster ${type}`);
  return b();
}
