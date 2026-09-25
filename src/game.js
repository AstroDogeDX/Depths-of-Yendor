import * as THREE from 'three';
import { TILE, EYE_H, MAX_DEPTH, ARTEFACT_DEPTHS, RENDER_HEIGHTS, HOTBAR_SIZE, CROUCH_DROP, danger, themeForDepth } from './config.js';
import { RNG, rand } from './rng.js';
import { generateLevel } from './dungeon/generator.js';
import { Level } from './world/level.js';
import { Player } from './player.js';
import { Knowledge } from './items/identify.js';
import { ARTEFACTS, WEAPONS } from './items/defs.js';
import { makeItem, randomItem, nextItemUid, reserveUids } from './items/generate.js';
import { itemActions, zapWand, drinkPotion, activateArtefact } from './items/use.js';
import { ViewModel } from './fx/viewmodel.js';
import { burst, ring, gasCloud, lightColumn } from './fx/particles.js';
import { playerPopupPos } from './combat.js';
import { Input, GAME_KEYS } from './input.js';
import { Sfx } from './audio.js';
import { useSlot } from './hotbar.js';
import { disposeGroup, propsForTheme } from './dungeon/levelBuilder.js';
import { loadProps } from './dungeon/props.js';
import { loadTraps } from './world/trapModels.js';
import { TitleScene } from './ui/titleScene.js';
import { SAVE_VERSION, writeSave, deleteSave, fingerprint } from './save.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W, matches stair `dir`

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 2, 22);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.torch = new THREE.PointLight(0xffb060, 26, 28, 1.7);
    this.scene.add(this.torch);
    this.ambient = new THREE.AmbientLight(0xffffff, 5);
    this.scene.add(this.ambient);

    this.viewmodel = new ViewModel();
    this.title = new TitleScene(this.renderer); // the walk through the dungeon behind the title screen
    this.input = new Input(canvas);
    this.audio = new Sfx();
    this.ui = ui;

    this.resIdx = 0;
    this.state = 'title'; // title | play | over
    this.paused = false;
    this.menu = null; // inventory | map | dialog | dev
    this.over = false;
    this.time = 0;
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.interaction = null;
    this.target = null;
    this.level = null;
    this.loading = false; // waiting for a floor's props to download (see enterLevel)
    this.dev = null; // the dev tools (ui/devTools.js), when main.js loads them
    this.running = false; // a run is under way (not over, not quit): what save() saves
    this.saveT = 0;

    this.input.onLockChange = (locked) => {
      if (this.state !== 'play') return;
      if (locked) this.paused = false;
      else if (!this.menu) this.paused = true;
    };
    try {
      this.fullscreenPref = localStorage.getItem('doy.fullscreen') !== 'off';
    } catch {
      this.fullscreenPref = true;
    }
    this.input.onLockError = () => {
      if (this.state === 'play' && !this.menu) this.paused = true;
    };
    canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.menu) this.resume();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Leaving the page (closing the tab or window, reloading, going elsewhere) saves the run on the way out.
    // Being hidden (another tab, minimised) saves it too, since a hidden page can be closed without warning.
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });

    ui.bind(this);
    this.title.start();
    loadTraps().catch(() => {}); // wanted once a trap is found; fetched while the title plays
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // --- Run lifecycle ---

  /** What a new run and a continued one both start with: the seed's dungeon, cleared of any last run. */
  beginRun(seed, name) {
    this.title.stop();
    this.seed = seed;
    this.playerName = name;
    const rng = new RNG(`${this.seed}:run`);
    this.knowledge = new Knowledge(rng);
    this.artefactQueue = rng.shuffle(Object.keys(ARTEFACTS));

    if (this.level) this.scene.remove(this.level.group);
    for (const lvl of this.levels?.values() ?? []) disposeGroup(lvl.group);
    this.level = null;
    this.levels = new Map();
    this.savedLevels = new Map(); // floors from a save not yet gone back to (see getLevel)
    this.player = new Player();
    this.time = 0;
    this.over = false;
    this.running = true;
    this.saveT = 60;
    this.amuletTaken = false;
    this.paraMsgT = -Infinity;
    this.menu = null;
  }

  newRun({ seed, name }) {
    this.beginRun(seed || Math.random().toString(36).slice(2, 8).toUpperCase(), name || 'Adventurer');
    const p = this.player;
    const sword = makeItem('weapon', 'shortsword', { identified: true, curseKnown: true, hitsToId: 0 });
    const armor = makeItem('armor', 'leather', { identified: true, curseKnown: true, hitsToId: 0 });
    p.addItem(sword);
    p.addItem(armor);
    p.addItem(makeItem('food', 'ration'));
    p.equip.weapon = sword;
    p.equip.armor = armor;
    this.viewmodel.setWeapon(WEAPONS.shortsword);

    this.ui.reset();
    // Sound, fullscreen and the mouse now, while the click that started the run still counts for them.
    this.audio.init();
    this.resume();
    this.enterLevel(1, 'start', () => {
      this.state = 'play';
      this.audio.setDrone(this.level.theme.drone);
      this.log(`Welcome, ${this.playerName}. Somewhere beneath you, beyond ${MAX_DEPTH} floors of darkness, lies the Amulet of Yendor.`, 'info');
      this.log('Click to take control. WASD move, mouse looks, click to attack, E to interact, I for your pack.', 'info');
      if (this.dev) this.log('Dev tools: press ` (the key left of 1).', 'info');
    });
  }

  /** Picks up a saved run (see save() and save.js) where it was left. */
  continueRun(s) {
    this.beginRun(s.seed, s.name);
    this.knowledge.restore(s.knowledge);
    this.artefactQueue = s.artefactQueue;
    this.savedLevels = new Map(s.levels.map((l) => [l.depth, l]));
    reserveUids(s.nextUid);
    this.player.restore(s.player);
    this.time = s.time;
    this.amuletTaken = s.amuletTaken;
    const weapon = this.player.equip.weapon;
    this.viewmodel.setWeapon(weapon ? WEAPONS[weapon.type] : null);

    this.ui.reset();
    this.audio.init();
    this.resume();
    this.enterLevel(s.depth, 'saved', () => {
      this.state = 'play';
      this.audio.setDrone(this.level.theme.drone);
      this.log(`Welcome back, ${this.playerName}. Depth ${this.level.depth}: ${this.level.theme.name}.`, 'info');
      if (this.dev) this.log('Dev tools: press ` (the key left of 1).', 'info');
    });
  }

  /**
   * Saves the run as it stands (see save.js): what you've learned, you and your things, and every floor you've
   * been to. False if there's no run to save, or storage refused it.
   */
  save() {
    if (!this.running || this.over || !this.level) return false;
    const p = this.player;
    const levels = [...this.levels.values()].map((l) => l.snapshot());
    for (const s of this.savedLevels.values()) levels.push(s); // (from the save we continued, not yet revisited)
    return writeSave({
      version: SAVE_VERSION, savedAt: Date.now(),
      seed: this.seed, name: this.playerName, depth: this.level.depth, time: Math.round(this.time),
      level: p.level, amuletTaken: this.amuletTaken, artefactQueue: this.artefactQueue, nextUid: nextItemUid(),
      knowledge: this.knowledge.snapshot(), player: p.snapshot(), levels,
    });
  }

  /** Saves, and leaves the run for the title screen, to be continued from there. */
  saveAndQuit() {
    this.save();
    this.running = false;
    this.audio.stopDrone();
    this.showTitle();
  }

  /** Back to the title screen (from the end of a run), its walk starting in the next theme. */
  showTitle() {
    this.state = 'title';
    this.menu = null;
    this.paused = false;
    this.input.unlock();
    this.title.start();
    this.ui.showTitle();
  }

  /** Stops play until a click on the pause panel resumes it. */
  pause() {
    this.paused = true;
    this.input.unlock();
  }

  resume() {
    this.audio.init();
    this.enterFullscreen();
    this.input.lock();
    this.paused = false;
  }

  /**
   * Fullscreen, plus Keyboard Lock where there is one (Chrome, Edge): browser shortcuts made with the game's keys
   * don't fire, and a tap of Escape pauses rather than leaving fullscreen (see GAME_KEYS).
   */
  enterFullscreen() {
    const el = document.documentElement;
    if (!this.fullscreenPref || document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => navigator.keyboard?.lock?.(GAME_KEYS))
      .catch(() => {});
  }

  setFullscreenPref(on) {
    this.fullscreenPref = on;
    try {
      localStorage.setItem('doy.fullscreen', on ? 'on' : 'off');
    } catch { /* storage unavailable; the choice just won't persist */ }
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  artefactFor(depth) {
    const i = ARTEFACT_DEPTHS.indexOf(depth);
    return i >= 0 ? this.artefactQueue[i] : null;
  }

  makeAmulet() {
    return makeItem('amulet', 'yendor');
  }

  getLevel(depth) {
    if (!this.levels.has(depth)) {
      const data = generateLevel(this.seed, depth, { artefact: this.artefactFor(depth) });
      // A floor from a save comes back as it was left, unless floors are laid out differently since it was saved
      // (a newer version of the game): then it starts afresh, rather than with things in its walls.
      const saved = this.savedLevels.get(depth);
      this.savedLevels.delete(depth);
      this.levels.set(depth, new Level(this, data, saved?.layout === fingerprint(data.grid) ? saved : null));
    }
    return this.levels.get(depth);
  }

  /**
   * Goes to floor `depth`, arriving by the stairs `arrive` names ('down' or 'start': the up stairs; 'up': the down
   * stairs; 'saved': where the save left you), then calls `done`. The first floor of a theme
   * whose props haven't downloaded yet waits for them in the dark (they're usually fetched on the floor before;
   * see arrive()).
   */
  enterLevel(depth, arrive, done = () => {}) {
    const pending = this.levels.has(depth) ? null : loadProps(propsForTheme(themeForDepth(depth)));
    if (!pending) {
      this.arrive(depth, arrive);
      done();
      return;
    }
    this.loading = true;
    this.ui.blackout(true);
    pending.then(() => {
      this.loading = false;
      this.ui.blackout(false);
      this.arrive(depth, arrive);
      done();
    }, () => {
      this.log('The way down is lost in the dark... (loading failed; trying again)', 'warn');
      setTimeout(() => this.enterLevel(depth, arrive, done), 2000);
    });
  }

  arrive(depth, arrive) {
    if (this.level) {
      for (const pr of this.level.projectiles) this.level.group.remove(pr.mesh);
      this.level.projectiles.length = 0;
      this.scene.remove(this.level.group);
    }
    const firstVisit = !this.levels.has(depth) && !this.savedLevels.has(depth);
    const level = this.getLevel(depth);
    this.level = level;
    this.scene.add(level.group);

    const th = level.theme;
    this.scene.fog.color.setHex(th.fog);
    this.scene.fog.near = th.fogNear;
    this.scene.fog.far = th.fogFar;
    this.renderer.setClearColor(th.fog);
    this.ambient.color.setHex(th.ambient);

    const p = this.player;
    // Back where a save left you, if the floor came back as it was; else by the stairs.
    if (!(arrive === 'saved' && level.restored && !level.isSolid(level.toTile(p.x), level.toTile(p.z)))) {
      const stairs = arrive === 'up' ? level.data.down : level.data.up;
      const [dx, dy] = DIRS[stairs.dir];
      p.x = (stairs.x + dx + 0.5) * TILE;
      p.z = (stairs.y + dy + 0.5) * TILE;
      p.yaw = Math.atan2(-dx, -dy);
      p.pitch = 0;
    }
    p.lastTrapTile = level.idx(level.toTile(p.x), level.toTile(p.z));
    p.maxDepth = Math.max(p.maxDepth, depth);
    level.visT = 0;
    level.flowT = 0;
    level.updateVisibility(p.x, p.z);

    if (this.state === 'play') this.audio.setDrone(th.drone); // (which also quiets the last floor's water)
    this.ui.onLevelChanged();

    if (firstVisit && depth === MAX_DEPTH) this.log('The air hums with ancient power. The Amulet is near — and so is its keeper.', 'danger');
    else if (firstVisit && level.data.shrine) this.log('You sense an artefact of power somewhere on this floor.', 'info');
    if (firstVisit && level.shopkeeper) this.log('Somewhere close by, coins clink in the dark.', 'info');

    if (p.hasAmulet() && arrive === 'up') {
      this.log('The dungeon howls as the Amulet passes through. Things are coming.', 'danger');
      level.spawnT = Math.min(level.spawnT, 6);
      for (let i = 0; i < 2; i++) level.spawnWanderer(true);
    }
    // Start fetching the next floor's props, so they're here by the time you go down.
    loadProps(propsForTheme(themeForDepth(Math.min(MAX_DEPTH, depth + 1))))?.catch(() => {});
    this.save(); // every floor you reach
  }

  changeLevel(depth, arrive) {
    this.audio.stairs();
    this.ui.fadeTransition();
    this.enterLevel(depth, arrive, () => {
      this.log(arrive === 'down' ? `You descend to depth ${depth}: ${this.level.theme.name}.` : `You climb to depth ${depth}.`);
    });
  }

  // --- Main loop ---

  loop = (now) => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 'play') {
      if (!this.loading) this.handleKeys();
      if (!this.paused && !this.menu && !this.over && !this.loading) this.update(dt);
      else this.updateCamera(0);
    }
    if (this.state === 'title') {
      this.title.update(dt);
      this.title.render();
    } else if (this.level) this.render();
    this.ui.update(dt);
    this.input.endFrame();
  };

  handleKeys() {
    const inp = this.input;
    if (this.menu) {
      if (inp.wasPressed('Escape') || (this.menu === 'map' && inp.wasPressed('KeyM')) ||
          (this.menu === 'inventory' && (inp.wasPressed('KeyI') || inp.wasPressed('Tab')))) {
        this.closeMenu();
      }
      return;
    }
    if (this.over || this.paused) return;
    // Escape pauses. Outside fullscreen (or where there's no Keyboard Lock) the browser has let go of the mouse
    // already, which pauses anyway; in fullscreen with Keyboard Lock, the tap comes to us instead.
    if (inp.wasPressed('Escape')) {
      this.pause();
      return;
    }
    // The map is memory, not action, so it stays available while paralysed; everything else checks canAct().
    if ((inp.wasPressed('KeyI') || inp.wasPressed('Tab')) && this.canAct()) this.openMenu('inventory');
    else if (inp.wasPressed('KeyM')) this.openMenu('map');
    if (inp.wasPressed('KeyE') && this.canAct()) this.interact();
    if ((inp.wasPressed('KeyF') || inp.wasPressed('Mouse2')) && this.canAct()) this.quickZap();
    if (inp.wasPressed('KeyQ') && this.canAct()) this.quickHeal();
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if ((inp.wasPressed(`Digit${i + 1}`) || inp.wasPressed(`Numpad${i + 1}`)) && useSlot(this, i)) this.ui.flashSlot(i);
    }
    if (inp.wasPressed('KeyR') && this.canAct()) activateArtefact(this, 0);
    if (inp.wasPressed('KeyT') && this.canAct()) activateArtefact(this, 1);
    if (inp.wasPressed('KeyP')) {
      this.resIdx = (this.resIdx + 1) % RENDER_HEIGHTS.length;
      this.resize();
      this.log(`Render resolution: ${RENDER_HEIGHTS[this.resIdx] || 'native'}.`, 'info');
    }
  }

  /** False while paralysed: no item use, pickups, stairs or powers. Says so, at most every 0.6s. */
  canAct() {
    if (this.player.status.paralysis <= 0) return true;
    if (this.time - this.paraMsgT >= 0.6) {
      this.paraMsgT = this.time;
      this.log('You cannot move a muscle!', 'warn');
    }
    return false;
  }

  openMenu(which) {
    this.menu = which;
    this.input.unlock();
    this.input.mouseDown = false;
    if (which === 'inventory') this.ui.openInventory();
    if (which === 'map') this.ui.openMap();
    if (which === 'dev') this.dev.show();
  }

  closeMenu() {
    const was = this.menu;
    this.menu = null;
    this.ui.closeMenus();
    this.dev?.hide();
    if (was && this.state === 'play' && !this.over) this.resume();
  }

  update(dt) {
    this.time += dt;
    if ((this.saveT -= dt) <= 0) {
      this.saveT = 60;
      this.save(); // a minute's play is the most a crash can cost
    }
    this.player.update(dt, this, this.input);
    if (this.over) return;
    this.level.update(dt, this);
    this.updateCamera(dt);
    const p = this.player;
    this.viewmodel.update(dt, {
      moving: p.moving, bob: p.bob, charge: p.charge, time: this.time, yaw: p.yaw, sprint: p.moving && p.mode === 'sprint',
      lightLevel: p.status.blind > 0 ? 0.1 : 1,
    });
    this.interaction = this.findInteraction();
    this.target = this.findTarget();
  }

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const cam = this.camera;
    const eye = EYE_H - p.crouch * CROUCH_DROP;
    const bobAmp = p.mode === 'sprint' ? 0.05 : p.mode === 'sneak' ? 0.015 : 0.03;
    const bobY = p.moving ? Math.sin(p.bob * 2) * bobAmp : 0;
    cam.position.set(p.x, eye + bobY, p.z);
    let roll = p.status.confusion > 0 ? Math.sin(this.time * 1.7) * 0.12 : 0;
    let pitch = p.pitch, yaw = p.yaw;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmt * Math.max(0, this.shakeT / 0.25);
      pitch += rand.range(-a, a) * 0.3;
      yaw += rand.range(-a, a) * 0.3;
      roll += rand.range(-a, a) * 0.2;
    }
    cam.rotation.set(pitch, yaw, roll);

    // The torch you carry is the main light: slightly left of and ahead of your eyes.
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    this.torch.position.set(p.x + fx * 0.35 + fz * 0.25, eye - 0.1, p.z + fz * 0.35 - fx * 0.25);
    const flick = 0.9 + Math.sin(this.time * 21) * 0.04 + Math.sin(this.time * 7.7) * 0.06;
    const blind = p.status.blind > 0;
    this.torch.intensity = (blind ? 4 : 26) * flick;
    this.scene.fog.far = blind ? 4 : this.level.theme.fogFar;
    this.ambient.intensity = blind ? 0.8 : 5;
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'play' && !this.over) {
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const target = RENDER_HEIGHTS[this.resIdx] || Math.round(h * Math.min(2, window.devicePixelRatio || 1));
    const rh = Math.min(target, Math.round(h * 2));
    const rw = Math.round((rh * w) / h);
    this.renderer.setSize(rw, rh, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.title.resize(w / h);
    this.viewmodel.resize(w / h);
  }

  // --- Feedback helpers used across systems ---

  log(text, cls = '') { this.ui.log(text, cls); }
  popup(pos, text, cls, tag) { this.ui.popup(pos, text, cls, tag); }
  flash(color, strength) { this.ui.flash(color, strength); }
  shake(amount) {
    this.shakeAmt = Math.max(this.shakeT > 0 ? this.shakeAmt : 0, amount);
    this.shakeT = 0.25;
  }

  // --- Interaction ---

  findInteraction() {
    const p = this.player, level = this.level;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bestScore = Infinity;
    for (const it of level.items) {
      const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
      if (d > (it.onPedestal ? 2.1 : 1.7)) continue;
      const facing = (dx * fx + dz * fz) / (d || 1);
      const score = d - facing * 0.6;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best) {
      if (!best.price) return { kind: 'item', entry: best, label: `Pick up ${this.knowledge.name(best.item, { article: true })}` };
      // Piles in the shop sell one at a time.
      const name = this.knowledge.name({ ...best.item, qty: 1 }, { article: true });
      const left = best.item.qty > 1 ? ` (${best.item.qty} left)` : '';
      const label = p.gold >= best.price ? `Buy ${name} for ${best.price} gold${left}` : `${name}: ${best.price} gold (you have ${p.gold})`;
      return { kind: 'buy', entry: best, label: label[0].toUpperCase() + label.slice(1) };
    }
    const door = level.doorAt(level.toTile(p.x + fx * 1.4), level.toTile(p.z + fz * 1.4));
    if (door && !door.open) {
      if (!door.locked) return { kind: 'door', door, label: 'Open the door' };
      const keys = p.keys[level.depth] || 0;
      return { kind: 'door', door, label: keys ? 'Unlock the door (uses an iron key)' : 'Locked. It needs an iron key from this floor' };
    }
    const near = (s) => s && Math.hypot((s.x + 0.5) * TILE - p.x, (s.y + 0.5) * TILE - p.z) < 1.95;
    if (near(level.data.down)) return { kind: 'down', label: `Descend to depth ${level.depth + 1}` };
    if (near(level.data.up)) {
      if (level.depth === 1) {
        return { kind: 'surface', label: p.hasAmulet() ? 'Climb into the daylight with the Amulet' : 'Return to the surface (abandon the quest)' };
      }
      return { kind: 'up', label: `Climb to depth ${level.depth - 1}` };
    }
    return null;
  }

  findTarget() {
    const p = this.player, level = this.level;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bestA = 0.2;
    for (const m of level.monsters) {
      if (m.dead) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > 14) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      const tol = Math.max(0.12, Math.atan2(m.radius + 0.2, d));
      if (a > tol || a > bestA + tol) continue;
      if (!level.los(p.x, p.z, m.x, m.z)) continue;
      if (!best || d < best.d) best = { m, d };
    }
    return best?.m ?? null;
  }

  interact() {
    const it = this.interaction;
    if (!it) return;
    const p = this.player;
    switch (it.kind) {
      case 'item': this.pickUp(it.entry); break;
      case 'buy': this.buy(it.entry); break;
      case 'door': this.useDoor(it.door); break;
      case 'down': this.changeLevel(this.level.depth + 1, 'down'); break;
      case 'up': this.changeLevel(this.level.depth - 1, 'up'); break;
      case 'surface':
        if (p.hasAmulet()) this.finish('ascended');
        else {
          this.dialog({
            title: 'The surface',
            body: 'Daylight glimmers far above. You could climb out now and live — but you would leave without the Amulet, and none would sing of you.',
            buttons: [
              { label: 'Stay and keep searching', fn: () => {} },
              { label: 'Abandon the quest', fn: () => this.finish('fled') },
            ],
          });
        }
        break;
    }
  }

  pickUp(entry) {
    const p = this.player, k = this.knowledge, item = entry.item;
    if (!p.addItem(item)) {
      this.log('Your pack is full.', 'warn');
      return;
    }
    this.level.removeItem(entry);
    this.audio.pickup();
    if (item.kind === 'gold') {
      this.log(`You pick up ${item.qty} gold.`);
      return;
    }
    if (item.kind === 'key') {
      this.log('You pick up an iron key. Somewhere on this floor, a lock is waiting for it.', 'good');
      return;
    }
    this.log(`You pick up ${k.name(item, { article: true })}.`);
    if (item.kind === 'artefact') {
      this.log(`${ARTEFACTS[item.type].name}: ${ARTEFACTS[item.type].desc} Put it on from your pack.`, 'good');
    }
    if (item.kind === 'amulet' && !this.amuletTaken) {
      this.amuletTaken = true;
      this.audio.victory();
      this.flash('#ffd040', 0.5);
      this.shake(0.4);
      this.amuletDialog(true);
    }
  }

  /** Buys an item from the shop: gold for goods, no haggling, no refunds. */
  buy(entry) {
    const p = this.player, level = this.level;
    if (!level.items.includes(entry)) return; // already sold
    if (p.gold < entry.price) {
      level.shopkeeper?.cantAfford(this);
      return;
    }
    const one = entry.item.qty > 1 ? { ...entry.item, qty: 1 } : entry.item; // piles sell one at a time
    if (!p.addItem(one)) {
      this.log('Your pack is full.', 'warn');
      return;
    }
    p.gold -= entry.price;
    if (one === entry.item) level.removeItem(entry);
    else entry.item.qty--;
    this.audio.coins();
    this.log(`You buy ${this.knowledge.name(one, { article: true })} for ${entry.price} gold.`, 'good');
    level.shopkeeper?.sold(this, level);
  }

  amuletDialog(first = false) {
    this.dialog({
      title: 'The Amulet of Yendor',
      body: (first ? 'The Amulet is warm, and it beats like a heart. Far above you the dungeon groans awake — everything in the depths is coming for you now.\n\n' : '') +
        'You may invoke the Amulet and be carried out of the depths this instant. Or you may carry it back up through every floor to the surface, and earn true glory — if you live.',
      buttons: [
        { label: 'Begin the ascent (double score)', fn: () => { this.log('Then climb. The way up is the way home.', 'good'); } },
        { label: 'Invoke the Amulet and escape', fn: () => this.finish('invoked') },
      ],
    });
  }

  dialog(opts) {
    this.menu = 'dialog';
    this.input.unlock();
    this.ui.dialog({
      ...opts,
      buttons: opts.buttons.map((b) => ({
        ...b,
        fn: () => {
          this.menu = null;
          this.ui.closeMenus();
          b.fn();
          if (!this.over) this.resume();
        },
      })),
    });
  }

  /** Open a door the player walked into or used. Locked doors take an iron key for this floor. */
  useDoor(door) {
    if (door.open) return;
    const p = this.player, depth = this.level.depth;
    if (door.locked) {
      if ((p.keys[depth] || 0) > 0) {
        p.keys[depth]--;
        door.locked = false;
        this.audio.unlock();
        this.log('You turn the iron key in the lock. The door grinds open.', 'good');
      } else {
        // Bumping a locked door repeatedly shouldn't spam the log.
        if (this.time - (door.lastRattle ?? -Infinity) > 2) {
          door.lastRattle = this.time;
          this.audio.locked();
          this.log('The door is locked. Its key must be somewhere on this floor.', 'warn');
        }
        return;
      }
    }
    this.level.openDoor(door);
  }

  quickZap() {
    const p = this.player;
    let wand = p.lastWand && p.inventory.includes(p.lastWand) ? p.lastWand : p.inventory.find((i) => i.kind === 'wand');
    if (!wand) {
      this.log('You have no wand to zap.', 'info');
      return;
    }
    zapWand(this, wand);
  }

  quickHeal() {
    const p = this.player;
    const potion = p.inventory.find((i) => i.kind === 'potion' && i.type === 'healing' && this.knowledge.isKnown(i));
    if (!potion) {
      this.log('You have no potion you know to be healing.', 'info');
      return;
    }
    drinkPotion(this, potion);
  }

  // --- Combat & events ---

  /**
   * Hurts the player by `amount`: less their armour's defense unless opts.ignoreArmor, then more or less as what
   * they wear resists or is weak to its damage type (see Player.resistMult). opts: { source (what killed them),
   * type (see damage.js; fire sets them burning too), monster, dot, ranged, ignoreArmor }.
   */
  hurtPlayer(amount, opts = {}) {
    if (this.over || this.dev?.god) return;
    const p = this.player;
    const mult = p.resistMult(opts.type);
    if (mult === 0) {
      if (!opts.dot) this.popup(playerPopupPos(p), 'IMMUNE', 'immune');
      return;
    }
    let dmg = amount;
    if (!opts.ignoreArmor) {
      const def = p.defense;
      if (def > 0) dmg -= rand.int(Math.ceil(def * 0.4), def);
      const a = p.equip.armor;
      if (a && !a.identified && --a.hitsToId <= 0) {
        this.knowledge.identify(a);
        this.log(`You've taken enough hits to know your armor: ${this.knowledge.name(a)}.`, 'info');
      }
    }
    dmg = Math.max(0, dmg);
    if (dmg > 0 && mult !== 1) dmg = Math.max(1, Math.round(dmg * mult));
    if (dmg === 0) {
      this.popup(playerPopupPos(p), 'blocked', 'miss');
      this.audio.block();
      return;
    }
    p.hp -= dmg;
    this.ui.hurtFlash(Math.min(1, (dmg / p.maxHp) * 3));
    if (mult > 1) this.popup(playerPopupPos(p), `-${dmg}`, 'hurt weak', 'WEAK SPOT');
    else if (mult < 1) this.popup(playerPopupPos(p), `-${dmg}`, 'hurt resist', 'RESISTED');
    else this.popup(playerPopupPos(p), `-${dmg}`, 'hurt');
    if (!opts.dot) {
      this.shake(0.1 + Math.min(0.3, dmg / p.maxHp));
      this.audio.hurt();
    }
    if (opts.type === 'fire' && !opts.dot) p.addStatus('burning', 3, this);
    if (p.hp <= 0) this.playerDied(opts.source || 'something');
  }

  onMonsterKilled(m) {
    const p = this.player;
    p.kills++;
    this.audio.kill();
    this.log(m.boss ? `The ${m.name} crashes to the floor and is still.` : `You kill the ${m.name}.`, m.boss ? 'good' : '');
    p.gainXp(Math.round(m.def.xp * (1 + (m.maxHp / m.def.hp - 1) * 0.5)), this);
    const level = this.level;
    // Whatever it carried falls where it died, or onto the bank if it flew over water.
    const at = level.landSpot(m.x, m.z);
    if (m.guardian || rand.chance(0.12)) level.addItem(randomItem(rand, level.depth), at.x, at.z);
    if (rand.chance(0.15)) level.addItem(makeItem('gold', 'gold', { qty: rand.int(4, 12) + Math.round(danger(level.depth) * 3) }), at.x + 0.3, at.z + 0.2);
  }

  triggerTrap(trap) {
    const p = this.player, level = this.level;
    const wasHidden = trap.hidden;
    trap.triggered = true;
    level.revealTrap(trap);
    trap.view?.set('active');
    this.audio.trap();
    const x = level.center(trap.x), z = level.center(trap.y);
    if (wasHidden) this.log('You step on a hidden pressure plate!', 'warn');
    switch (trap.type) {
      case 'spike':
        this.log('Iron spikes stab up from the floor!', 'danger');
        this.audio.spikes();
        burst(level, x, 0.2, z, 0xb0b0b0, 12, 3, 0.5);
        this.hurtPlayer(rand.int(3, 6) + level.depth, { source: 'a spike trap', type: 'stab' });
        break;
      case 'poison':
        this.log('A cloud of green gas billows up around you!', 'danger');
        this.audio.hiss();
        ring(level, x, z, 0x40c040, 3, 1);
        gasCloud(level, x, z, 0x6ac03a);
        p.addStatus('poison', 8, this);
        break;
      case 'teleport':
        this.log('The glyph flares and the world lurches!', 'warn');
        lightColumn(level, x, z, 0x3aa0ff);
        this.teleportPlayer(0x3aa0ff, '#4aa6ee');
        break;
      case 'alarm':
        this.log('A bell clangs out, ringing through the halls!', 'danger');
        this.audio.bell();
        for (const m of level.monsters) {
          if (!m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 30) m.notice(this);
        }
        break;
    }
  }

  /** Sends the player somewhere else on the floor, in a burst of `color` and a `flash` (violet, or a trap's azure). */
  teleportPlayer(color = 0x8040e0, flash = '#a060ff') {
    const p = this.player, level = this.level;
    const pos = level.randomFloorPos({ awayFrom: p, minDist: 12 });
    if (!pos) return;
    burst(level, p.x, 1, p.z, color, 14, 3, 0.6);
    p.x = pos.x;
    p.z = pos.z;
    p.lastTrapTile = level.idx(level.toTile(p.x), level.toTile(p.z));
    level.visT = 0;
    level.flowT = 0;
    this.audio.teleport();
    this.flash(flash, 0.35);
  }

  playerDied(source) {
    if (this.over) return;
    this.over = true;
    this.player.hp = 0;
    this.audio.death();
    this.audio.stopDrone();
    this.endRun({ won: false, killedBy: source });
  }

  finish(mode) {
    this.over = true;
    if (mode !== 'fled') this.audio.victory();
    this.audio.stopDrone();
    this.endRun({ won: mode !== 'fled', mode });
  }

  endRun(info) {
    this.state = 'over';
    this.running = false;
    deleteSave(); // death is permanent, and a won run is done
    this.menu = null;
    this.input.unlock();
    const p = this.player;
    let score = p.gold + p.maxDepth * 150 + p.level * 40 + p.kills * 5;
    if (p.hasAmulet()) score += 5000;
    if (info.mode === 'ascended') score *= 2;
    this.ui.showEnd({
      ...info, score: Math.round(score), name: this.playerName, depth: this.level.depth, maxDepth: p.maxDepth,
      level: p.level, gold: p.gold, kills: p.kills, time: this.time, seed: this.seed,
    });
  }

  actionsFor(item) {
    return itemActions(this, item);
  }
}
