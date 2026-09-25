import * as THREE from 'three';
import { KIND_GLYPH, ARTEFACTS, WEAPONS, ARMORS } from '../items/defs.js';
import { equipSlotFor } from '../items/use.js';
import { T } from '../dungeon/tiles.js';
import { TRAP_COLORS } from '../world/level.js';
import { HUNGER_HUNGRY, HUNGER_FAMISHED, INVENTORY_SIZE, TILE, HOTBAR_SIZE, PLAYER_SPEED, MAX_DEPTH, THEMES, FLOORS_PER_THEME, themeForDepth } from '../config.js';
import { canHotbar, slotItem, slotHolds, slotAction, assignSlot, clearSlot } from '../hotbar.js';
import { stackable } from '../items/generate.js';
import { DAMAGE_TYPES } from '../damage.js';
import { Logo } from './logo.js';
import { readSave } from '../save.js';
import { STATUSES } from '../status.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const KIND_COLOR = {
  weapon: '#c8ccd4', armor: '#c0a880', scroll: '#e8dcb0', wand: '#a0c8ff', ring: '#e0a0ff',
  food: '#c09060', artefact: '#ffb040', amulet: '#ffd040', gold: '#ffd040',
};
// Floating text over the world, by class (see .popup in style.css): how many seconds it lasts, how far it rises
// (metres), how much bigger it starts before it settles (a punch in), and whether it's scattered to one side so a
// flurry of hits doesn't stack up in one column. Later classes override earlier ones, so the modifiers for a blow
// the target is weak to or resists ('dmg weak', 'hurt resist'...) change the look of the number they're on.
const POPUP_BASE = { life: 1, rise: 0.6, punch: 0, scatter: false };
const POPUPS = {
  dmg: { life: 1.1, punch: 0.7, scatter: true },
  crit: { life: 1.4, punch: 1, scatter: true },
  dot: { life: 0.9, scatter: true },
  hurt: { life: 1.1, punch: 0.5, scatter: true },
  miss: { life: 0.9, scatter: true },
  immune: { life: 1.1, punch: 0.4 },
  alert: { life: 1.1, rise: 0.35, punch: 0.6 },
  zzz: { life: 1.6, rise: 1.1 },
  status: { life: 1.2, rise: 0.45, punch: 0.4 },
  weak: { life: 1.4, punch: 1 },
  resist: { life: 1.2, punch: 0.2 },
};
// Channels on the map by what fills them, [in sight, remembered]; any other fill is a dark pit.
const CHANNEL_COLORS = { water: ['#2f5f66', '#1f3c40'], lava: ['#a8400e', '#5a2208'] };
const HOT_HINT = `Press 1–${HOTBAR_SIZE} or click a slot to put the selected item there · right-click a slot to clear it`;
// Paper-doll slots, positioned over the 240x300 figure in index.html.
const DOLL_SLOTS = [
  { key: 'art0', label: 'Artefact', x: 14, y: 12 },
  { key: 'art1', label: 'Artefact', x: 174, y: 12 },
  { key: 'armor', label: 'Armor', x: 94, y: 88 },
  { key: 'weapon', label: 'Weapon', x: 14, y: 150 },
  { key: 'ring0', label: 'Ring', x: 20, y: 228, small: true },
  { key: 'ring1', label: 'Ring', x: 180, y: 228, small: true },
];
const equippedIn = (p, key) => {
  if (key === 'weapon') return p.equip.weapon;
  if (key === 'armor') return p.equip.armor;
  if (key.startsWith('ring')) return p.equip.rings[+key[4]];
  return p.equip.artefacts[+key[3]];
};
const glyphColor = (k, it) => (it.kind === 'potion' ? hex(k.color(it)) : KIND_COLOR[it.kind]);

export class UI {
  constructor() {
    this.popups = [];
    this.logEntries = [];
    this.invSel = 0;
    this.selectMode = null;
    this.cache = {};
    this.v = new THREE.Vector3();
  }

  bind(game) {
    this.game = game;
    this.logo = new Logo($('logo'));
    // As wide as fits, but no more than about 40% of the screen's height.
    const fitLogo = () => this.logo.fit(Math.min(760, window.innerWidth * 0.86, window.innerHeight * 0.42 * (this.logo.w / this.logo.h)));
    fitLogo();
    window.addEventListener('resize', fitLogo);
    $('title-sub').textContent = `${MAX_DEPTH} floors down, the Amulet of Yendor waits. Take it, and climb home, if you can.`;
    $('howto-realms').innerHTML = THEMES.map((t, i) => {
      const first = i * FLOORS_PER_THEME + 1, last = first + FLOORS_PER_THEME - 1;
      return `<li>${t.name} <span>· floors ${first}–${last}${last === MAX_DEPTH ? ': the Amulet, and the Warden who keeps it' : ''}</span></li>`;
    }).join('');
    $('howto-btn').addEventListener('click', () => { $('howto').hidden = false; });
    $('howto-close').addEventListener('click', () => { $('howto').hidden = true; });
    $('howto').addEventListener('click', (e) => { if (e.target === $('howto')) $('howto').hidden = true; });

    const start = () => {
      // With a run saved, a new one takes a second click: it ends the saved one.
      if (readSave() && !this.confirmNew) {
        this.confirmNew = true;
        $('start-btn').textContent = 'Abandon saved run?';
        $('start-btn').classList.add('warn');
        clearTimeout(this.confirmT);
        this.confirmT = setTimeout(() => this.refreshContinue(), 4000);
        return;
      }
      clearTimeout(this.confirmT);
      $('title').hidden = true;
      $('howto').hidden = true;
      this.fadeTransition();
      game.newRun({ seed: $('seed-in').value.trim().toUpperCase(), name: $('name-in').value.trim() });
    };
    $('continue-btn').addEventListener('click', () => {
      const save = readSave();
      if (!save) {
        this.refreshContinue();
        return;
      }
      $('title').hidden = true;
      $('howto').hidden = true;
      this.fadeTransition();
      try {
        game.continueRun(save);
      } catch (err) {
        console.error('Loading the save failed:', err);
        game.running = false;
        game.showTitle();
        $('continue-info').textContent = "That saved run couldn't be loaded.";
      }
    });
    this.refreshContinue();
    $('start-btn').addEventListener('click', start);
    for (const id of ['seed-in', 'name-in']) {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    }
    $('again-btn').addEventListener('click', () => {
      $('end').hidden = true;
      game.newRun({ seed: '', name: game.playerName });
    });
    $('retry-btn').addEventListener('click', () => {
      $('end').hidden = true;
      game.newRun({ seed: game.seed, name: game.playerName });
    });
    $('menu-btn').addEventListener('click', () => game.showTitle());
    // One fullscreen preference, shown on the title screen and the pause panel.
    for (const id of ['fs-in', 'fs-pause']) {
      const box = $(id);
      box.checked = game.fullscreenPref;
      box.addEventListener('click', (e) => e.stopPropagation()); // don't let the pause panel's click resume
      box.addEventListener('change', () => {
        game.setFullscreenPref(box.checked);
        $('fs-in').checked = $('fs-pause').checked = box.checked;
      });
    }
    $('pause-fs').addEventListener('click', (e) => e.stopPropagation());
    $('quit-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // (not a click to resume)
      game.saveAndQuit();
    });
    // The pause overlay covers the canvas, so it has to take the resume click itself.
    $('pause').addEventListener('click', () => {
      if (game.state === 'play' && !game.menu) game.resume();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.hotEls = [];
    this.hotKeys = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      $('hotbar').appendChild(el);
      this.hotEls.push(el);
    }
    $('inv-hot-note').textContent = HOT_HINT;
    this.dollEls = {};
    for (const d of DOLL_SLOTS) {
      const el = document.createElement('div');
      el.className = 'ds' + (d.small ? ' ring' : '');
      el.style.left = `${d.x}px`;
      el.style.top = `${d.y}px`;
      // Clicking a filled slot selects that item in the list; equipping still goes through the action buttons.
      el.addEventListener('click', () => {
        const it = equippedIn(this.game.player, d.key);
        if (it) this.selectRow(this.game.player.inventory.indexOf(it));
      });
      $('inv-doll').appendChild(el);
      this.dollEls[d.key] = el;
    }
    $('inv-hot-slots').style.gridTemplateColumns = `repeat(${HOTBAR_SIZE}, minmax(0, 1fr))`;
  }

  reset() {
    this.logEntries.forEach((e) => e.el.remove());
    this.logEntries = [];
    this.popups.forEach((p) => p.el.remove());
    this.popups = [];
    this.closeMenus();
    this.hotKeys = [];
    $('hud').hidden = false;
    $('end').hidden = true;
  }

  onLevelChanged() {
    this.cache = {};
  }

  // --- Messages & feedback ---

  log(text, cls = '') {
    const el = document.createElement('div');
    el.className = `msg ${cls}`;
    el.textContent = text;
    $('log').appendChild(el);
    this.logEntries.push({ el, t: 0 });
    while (this.logEntries.length > 7) this.logEntries.shift().el.remove();
  }

  /** Floating text at a point in the world, in one or more classes (see POPUPS), with a smaller `tag` under it. */
  popup(pos, text, cls = '', tag = '') {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    if (tag) el.appendChild(document.createElement('small')).textContent = tag;
    $('popups').appendChild(el);
    const look = Object.assign({}, POPUP_BASE, ...cls.split(' ').map((c) => POPUPS[c]));
    // Scattered ones go to alternate sides, so one hit's number moves away from the last one's.
    if (look.scatter) this.popupSide = -(this.popupSide || 1);
    const drift = look.scatter ? this.popupSide * (0.35 + Math.random() * 0.65) : 0;
    this.popups.push({ el, x: pos.x, y: pos.y, z: pos.z, t: 0, ...look, drift });
    while (this.popups.length > 40) this.popups.shift().el.remove();
  }

  flash(color, strength = 0.4) {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = strength;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.5s ease-out';
    el.style.opacity = 0;
  }

  hurtFlash(k) {
    const el = $('hurt');
    el.style.transition = 'none';
    el.style.opacity = 0.35 + k * 0.65;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = 0;
  }

  /** Holds the screen black while a floor loads, or fades back in from black when `on` is false. */
  blackout(on) {
    if (!on) return this.fadeTransition();
    const el = $('fade');
    el.style.transition = 'none';
    el.style.opacity = 1;
  }

  fadeTransition() {
    const el = $('fade');
    el.style.transition = 'none';
    el.style.opacity = 1;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.7s ease-in';
    el.style.opacity = 0;
  }

  set(id, text) {
    if (this.cache[id] !== text) {
      this.cache[id] = text;
      $(id).textContent = text;
    }
  }

  setHtml(id, html) {
    if (this.cache[id] !== html) {
      this.cache[id] = html;
      $(id).innerHTML = html;
    }
  }

  // --- Per-frame ---

  showTitle() {
    this.closeMenus();
    $('end').hidden = true;
    $('hud').hidden = true;
    $('pause').hidden = true;
    $('title').hidden = false;
    this.refreshContinue();
  }

  /** Offers Continue on the title screen when there's a run saved, and says whose and how far down. */
  refreshContinue() {
    const save = readSave();
    this.confirmNew = false;
    $('continue').hidden = !save;
    $('start-btn').textContent = save ? 'New run' : 'Descend';
    $('start-btn').classList.toggle('alt', !!save);
    $('start-btn').classList.remove('warn');
    if (!save) return;
    const mins = Math.round((Date.now() - save.savedAt) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 48 * 60 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
    $('continue-info').textContent =
      `${save.name}, level ${save.level} · depth ${save.depth}, ${themeForDepth(save.depth).name} · saved ${ago}`;
  }

  update(dt) {
    const g = this.game;
    if (g.state === 'title') {
      this.logo.update(dt);
      $('title-fade').style.opacity = g.title.fade;
      this.set('title-caption', g.title.caption);
      return;
    }
    if (g.state !== 'play' || !g.player || !g.level) return;
    const p = g.player, lvl = g.level, k = g.knowledge;

    this.set('depth-line', `Depth ${lvl.depth} · ${lvl.theme.name}${p.hasAmulet() ? '  ✦ Amulet' : ''}`);
    const keys = p.keys[lvl.depth] || 0;
    this.set('stat-line', `Lv ${p.level}   XP ${p.xp}/${p.xpToNext()}   Str ${p.str}   Def ${p.defense}   Gold ${p.gold}${keys ? `   Keys ${keys}` : ''}`);

    const hpFrac = Math.max(0, p.hp / p.maxHp);
    $('hp-fill').style.width = `${hpFrac * 100}%`;
    this.set('hp-text', `HP ${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    $('atk-fill').style.width = `${p.charge * 100}%`;
    $('st-fill').style.width = `${(p.stamina / p.maxStamina) * 100}%`;
    $('st-bar').classList.toggle('winded', p.winded);
    $('atk-bar').classList.toggle('ready', p.charge >= 1);
    document.body.classList.toggle('lowhp', hpFrac < 0.25);
    document.body.classList.toggle('blind', p.status.blind > 0);

    const st = [];
    if (g.hunted) st.push('<span class="st-hunted">Hunted</span>');
    for (const [key, def] of Object.entries(STATUSES)) {
      if (p.status[key] > 0) st.push(`<span style="color:${def.color}">${def.label} ${Math.ceil(p.status[key])}</span>`);
    }
    if (p.winded) st.push('<span class="st-winded">Winded</span>');
    else if (p.mode === 'sneak') st.push('<span class="st-sneak">Sneaking</span>');
    else if (p.mode === 'sprint' && p.moving) st.push('<span class="st-sprint">Sprinting</span>');
    if (p.hunger <= 0) st.push('<span class="st-starving">Starving</span>');
    else if (p.hunger < HUNGER_FAMISHED) st.push('<span class="st-famished">Famished</span>');
    else if (p.hunger < HUNGER_HUNGRY) st.push('<span class="st-hungry">Hungry</span>');
    this.setHtml('status-line', st.join(' '));

    const gear = [];
    gear.push(`<div>${p.equip.weapon ? k.name(p.equip.weapon) : 'bare hands'}</div>`);
    p.equip.artefacts.forEach((a, i) => {
      if (!a) return;
      const def = ARTEFACTS[a.type];
      const cd = p.artefactCD[i];
      gear.push(`<div class="art">${def.active ? `[${i === 0 ? 'R' : 'T'}] ` : ''}${def.name}${def.active ? (cd > 0 ? ` <span class="cd">${Math.ceil(cd)}s</span>` : ' <span class="ok">ready</span>') : ''}</div>`);
    });
    const wand = p.lastWand && p.inventory.includes(p.lastWand) ? p.lastWand : p.inventory.find((i) => i.kind === 'wand');
    if (wand) gear.push(`<div class="wand">[F] ${k.name(wand)}</div>`);
    this.setHtml('gear', gear.join(''));

    const prompt = g.interaction && !g.menu ? `[E] ${g.interaction.label}` : '';
    this.set('prompt', prompt);

    const t = g.target;
    $('target').hidden = !t;
    if (t) {
      const tag = t.state === 'sleep' ? ' (asleep)' : t.state !== 'hunt' ? ' (unaware)' : !t.seen ? ' (searching)' : '';
      const sts = Object.entries(STATUSES).filter(([key]) => t.status[key] > 0)
        .map(([, def]) => `<span style="color:${def.color}">${def.label}</span>`).join(' ');
      this.setHtml('target-name', `${t.name}${tag}${sts ? ` <span class="target-st">${sts}</span>` : ''}`);
      $('target-fill').style.width = `${Math.max(0, t.hp / t.maxHp) * 100}%`;
    }

    const heading = ((-p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.set('compass', COMPASS[Math.round(heading / (Math.PI / 4)) % 8]);

    for (const e of this.logEntries) {
      e.t += dt;
      if (e.t > 14 && !e.old) {
        e.old = true;
        e.el.classList.add('old');
      }
    }

    this.updateHotbar();
    this.updatePopups(dt);
    this.drawMinimap();
    $('pause').hidden = !(g.paused && !g.menu && !g.over);
  }

  updatePopups(dt) {
    if (!this.popups.length) return;
    const cam = this.game.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const em = parseFloat(getComputedStyle($('popups')).fontSize); // their size, which scales with the window
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pp = this.popups[i];
      pp.t += dt;
      if (pp.t > pp.life) {
        pp.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      // Punching in, then rising (quickly at first) and drifting out to its side, fading over its last 40%.
      const k = pp.t / pp.life;
      this.v.set(pp.x, pp.y + pp.rise * (1 - (1 - k) ** 2), pp.z).project(cam);
      if (this.v.z > 1 || this.v.z < -1) {
        pp.el.style.display = 'none';
        continue;
      }
      pp.el.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * W + pp.drift * em * (0.35 + 0.65 * Math.min(1, k * 3));
      const y = (-this.v.y * 0.5 + 0.5) * H;
      const scale = 1 + pp.punch * Math.max(0, 1 - pp.t / 0.15) ** 2;
      pp.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      pp.el.style.opacity = k < 0.6 ? 1 : 1 - ((k - 0.6) / 0.4) ** 2;
    }
  }

  // --- Maps ---

  drawMap(ctx, size, cx, cy, scale, full) {
    const g = this.game, lvl = g.level, p = g.player;
    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(0, 0, size, size);
    const x0 = full ? 0 : Math.floor(cx - size / scale / 2), y0 = full ? 0 : Math.floor(cy - size / scale / 2);
    const x1 = full ? lvl.w - 1 : Math.ceil(cx + size / scale / 2), y1 = full ? lvl.h - 1 : Math.ceil(cy + size / scale / 2);
    const ox = full ? (size - lvl.w * scale) / 2 : size / 2 - cx * scale;
    const oy = full ? (size - lvl.h * scale) / 2 : size / 2 - cy * scale;
    const px = (tx) => ox + tx * scale, py = (ty) => oy + ty * scale;

    for (let ty = Math.max(0, y0); ty <= Math.min(lvl.h - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(lvl.w - 1, x1); tx++) {
        const i = lvl.idx(tx, ty);
        if (!lvl.explored[i]) continue;
        const t = lvl.grid[i];
        let c;
        if (t === T.WALL) c = '#857b6b';
        else if (t === T.STAIRS_DOWN) c = '#5aa0ff';
        else if (t === T.STAIRS_UP) c = '#ffd27a';
        else if (t === T.PEDESTAL) c = '#d0a040';
        else if (t === T.CHANNEL) c = CHANNEL_COLORS[lvl.theme.channels.fill]?.[lvl.visible[i] ? 0 : 1] ?? (lvl.visible[i] ? '#1c1916' : '#121010');
        else if (t === T.BRIDGE) c = lvl.visible[i] ? '#7a5a36' : '#4e3a24';
        else if (t === T.DOOR) {
          const d = lvl.doorAt(tx, ty);
          c = d.locked ? '#e8c040' : d.open ? '#6a4a2a' : '#b0703a';
        }
        else c = lvl.visible[i] ? '#4e473d' : '#302b25';
        ctx.fillStyle = c;
        ctx.fillRect(px(tx), py(ty), scale, scale);
      }
    }
    for (const tr of lvl.traps) {
      if (tr.hidden) continue;
      ctx.globalAlpha = tr.triggered ? 0.4 : 1; // spent traps dimmed
      ctx.fillStyle = hex(TRAP_COLORS[tr.type]);
      ctx.fillRect(px(tr.x) + scale * 0.25, py(tr.y) + scale * 0.25, scale * 0.5, scale * 0.5);
    }
    ctx.globalAlpha = 1;
    const TS = TILE;
    for (const it of lvl.items) {
      if (!it.seen) continue;
      ctx.fillStyle = it.item.kind === 'amulet' || it.item.kind === 'artefact' ? '#ffb040' : '#e8d070';
      const s = Math.max(2, scale * 0.4);
      ctx.fillRect(ox + (it.x / TS) * scale - s / 2, oy + (it.z / TS) * scale - s / 2, s, s);
    }
    const sense = p.status.mindvision > 0 || p.hasArtefact('eye');
    for (const m of lvl.monsters) {
      if (m.dead) continue;
      const seen = lvl.isVisibleWorld(m.x, m.z) && p.status.blind <= 0;
      if (!seen && !sense) continue;
      ctx.fillStyle = m.boss ? '#ff40ff' : seen ? '#ff4030' : '#b03060';
      const s = Math.max(3, scale * (m.boss ? 0.9 : 0.6));
      ctx.fillRect(ox + (m.x / TS) * scale - s / 2, oy + (m.z / TS) * scale - s / 2, s, s);
    }
    // Player arrow
    const ax = ox + (p.x / TS) * scale, ay = oy + (p.z / TS) * scale;
    const fx = -Math.sin(p.yaw), fy = -Math.cos(p.yaw);
    const r = Math.max(4, scale * 0.9);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ax + fx * r, ay + fy * r);
    ctx.lineTo(ax - fx * r * 0.6 + fy * r * 0.6, ay - fy * r * 0.6 - fx * r * 0.6);
    ctx.lineTo(ax - fx * r * 0.6 - fy * r * 0.6, ay - fy * r * 0.6 + fx * r * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  drawMinimap() {
    const c = $('minimap');
    const g = this.game, p = g.player;
    this.drawMap(c.getContext('2d'), c.width, p.x / TILE, p.z / TILE, 5, false);
  }

  openMap() {
    const c = $('bigmap');
    const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.85);
    c.width = c.height = size;
    $('mapview').hidden = false;
    const lvl = this.game.level;
    this.drawMap(c.getContext('2d'), size, 0, 0, Math.floor(size / Math.max(lvl.w, lvl.h)), true);
  }

  closeMenus() {
    $('inventory').hidden = true;
    $('mapview').hidden = true;
    $('dialog').hidden = true;
    this.selectMode = null;
  }

  // --- Dialogs & end screens ---

  dialog({ title, body, buttons }) {
    $('dialog-title').textContent = title;
    $('dialog-body').textContent = body;
    const box = $('dialog-buttons');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      el.addEventListener('click', b.fn);
      box.appendChild(el);
    }
    $('dialog').hidden = false;
  }

  showEnd(info) {
    $('hud').hidden = true;
    this.closeMenus();
    const mins = Math.floor(info.time / 60), secs = Math.floor(info.time % 60).toString().padStart(2, '0');
    const stats = [
      ['Score', info.score], ['Deepest floor', info.maxDepth], ['Level', info.level],
      ['Kills', info.kills], ['Gold', info.gold], ['Time', `${mins}:${secs}`], ['Seed', info.seed],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('end-stats').innerHTML = stats;

    const tomb = $('tomb');
    if (!info.won && info.killedBy) {
      $('end-title').textContent = 'You have died';
      $('end-text').textContent = '';
      tomb.hidden = false;
      tomb.textContent = tombstone(info);
    } else {
      tomb.hidden = true;
      const texts = {
        ascended: [`${info.name} returns in triumph`, `You climb out into the daylight with the Amulet of Yendor. Every floor, every horror, behind you. The bards will sing of ${info.name} for a thousand years.`],
        invoked: ['The Amulet answers', 'The Amulet flares, and the dungeon falls away like a dream. You wake on the hillside with the Amulet cold in your hand. A victory — though the bards will mutter that you took the easy road.'],
        fled: ['You abandon the quest', 'You clamber out into the light, empty-handed but alive. The Amulet waits below for someone braver.'],
      };
      const [title, text] = texts[info.mode];
      $('end-title').textContent = title;
      $('end-text').textContent = text;
    }
    $('end').hidden = false;
  }

  // --- Inventory ---

  openInventory() {
    this.invSel = Math.min(this.invSel, Math.max(0, this.game.player.inventory.length - 1));
    $('inventory').hidden = false;
    this.renderInventory();
  }

  selectItem(prompt, filter, cb) {
    this.selectMode = { prompt, filter, cb };
    const inv = this.game.player.inventory;
    const first = inv.findIndex(filter);
    if (first >= 0) this.invSel = first;
    if (this.game.menu !== 'inventory') this.game.openMenu('inventory');
    else this.renderInventory();
  }

  /** Full rebuild — only when the pack's contents may have changed. Keeps the list's scroll position. */
  renderInventory() {
    const g = this.game, p = g.player, k = g.knowledge;
    const inv = p.inventory;
    const list = $('inv-list');
    const scroll = list.scrollTop;
    list.innerHTML = '';
    this.invSel = Math.max(0, Math.min(this.invSel, inv.length - 1));
    $('inv-count').textContent = `${inv.length} / ${INVENTORY_SIZE}   ·   ${p.gold} gold`;
    // The prompt's space is always reserved so the list never shifts when it appears.
    const shop = g.level.shopkeeper && g.level.playerInShop ? 'The shopkeeper is buying: pick an item and choose Sell.' : '';
    $('inv-prompt').textContent = this.selectMode ? this.selectMode.prompt : shop;
    $('inv-prompt').classList.toggle('off', !this.selectMode && !shop);

    inv.forEach((it, i) => {
      const li = document.createElement('li');
      const ok = !this.selectMode || this.selectMode.filter(it);
      li.className = ok ? '' : 'dim';
      const color = glyphColor(k, it);
      const eq = equipTag(p, it);
      li.innerHTML = `<span class="glyph" style="color:${color}">${KIND_GLYPH[it.kind]}</span><span class="nm"></span>${eq ? `<span class="eq">${eq}</span>` : ''}`;
      li.querySelector('.nm').textContent = k.name(it);
      // Click selects; double-click performs the first action. Hover only highlights.
      li.addEventListener('click', () => this.selectRow(i));
      li.addEventListener('dblclick', () => { this.selectRow(i); this.activate(0); });
      list.appendChild(li);
    });
    if (!inv.length) list.innerHTML = '<li class="dim">Your pack is empty.</li>';
    list.scrollTop = scroll;
    this.selectRow(this.invSel);
  }

  /** Change the selection without rebuilding the list. */
  selectRow(i) {
    this.invSel = i;
    const rows = $('inv-list').children;
    for (let r = 0; r < rows.length; r++) rows[r].classList.toggle('sel', r === i);
    rows[i]?.scrollIntoView({ block: 'nearest' });
    this.renderDetail();
    this.renderHotStrip();
    this.renderDoll();
  }

  renderDetail() {
    const g = this.game, p = g.player, k = g.knowledge;
    const it = p.inventory[this.invSel];
    const acts = $('inv-actions');
    acts.innerHTML = '';
    if (it) {
      $('inv-name').textContent = k.name(it);
      $('inv-desc').textContent = k.describe(it);
      if (this.selectMode) {
        const ok = this.selectMode.filter(it);
        const b = document.createElement('button');
        b.textContent = ok ? 'Choose this' : 'Not a valid choice';
        b.disabled = !ok;
        b.addEventListener('click', () => this.activate(0));
        acts.appendChild(b);
      } else {
        g.actionsFor(it).forEach((a, ai) => {
          const b = document.createElement('button');
          b.textContent = a.label;
          b.addEventListener('click', () => this.activate(ai));
          acts.appendChild(b);
        });
      }
    } else {
      $('inv-name').textContent = '';
      $('inv-desc').textContent = '';
    }
  }

  renderDoll() {
    const g = this.game, p = g.player, k = g.knowledge;
    const sel = p.inventory[this.invSel];
    // Where the selected, not-yet-equipped item would go (same rule equipItem uses).
    const target = sel && !this.selectMode && !p.isEquipped(sel) ? equipSlotFor(p, sel) : null;
    for (const d of DOLL_SLOTS) {
      const el = this.dollEls[d.key];
      const it = equippedIn(p, d.key);
      el.classList.toggle('empty', !it);
      el.classList.toggle('cursed', !!it && it.cursed && it.curseKnown);
      el.classList.toggle('sel', !!it && it === sel);
      el.classList.toggle('target', d.key === target);
      if (it) {
        const showEnch = it.identified && (it.kind === 'weapon' || it.kind === 'armor' || (it.kind === 'ring' && it.type !== 'teleportation'));
        const ench = showEnch ? `<span class="de">${it.ench >= 0 ? '+' : ''}${it.ench}</span>` : '';
        el.innerHTML = `<span class="dg" style="color:${glyphColor(k, it)}">${KIND_GLYPH[it.kind]}</span>${ench}`;
        el.title = k.name(it);
      } else {
        el.innerHTML = `<span class="dl">${d.label}</span>`;
        el.title = '';
      }
    }
    // Worn armor tints the figure's torso.
    const a = p.equip.armor;
    $('doll-torso').style.fill = a ? hex(ARMORS[a.type].color) : '';

    const w = p.weaponStats(), wi = p.equip.weapon;
    const known = !wi || wi.identified; // an unidentified enchantment must not leak through the numbers
    const heavy = !!wi && WEAPONS[wi.type].str > p.str;
    const slow = !!a && ARMORS[a.type].str > p.str;
    const lo = Math.max(1, w.dmg[0] + (known ? w.ench : 0));
    const hi = Math.max(1, w.dmg[1] + (known ? w.ench : 0) + w.excess);
    // Two label/value pairs per row: wide values on the left, short ones on the right.
    const rows = [
      ['Damage', `${lo}–${hi}${known ? '' : ' (+?)'} ${DAMAGE_TYPES[w.dmgType].name}`, heavy], ['Reach', `${w.reach}m`],
      ['Recovery', `${w.recharge.toFixed(2)}s`, heavy], ['Defense', String(p.defense)],
      ['Speed', `${Math.round((p.moveSpeed() / PLAYER_SPEED) * 100)}%`, slow], ['Strength', String(p.str)],
    ];
    let html = rows.map(([label, v, bad]) => `<span>${label}</span><b${bad ? ' class="bad"' : ''}>${v}</b>`).join('');
    if (heavy) html += '<div class="warn">Your weapon is too heavy for you.</div>';
    if (slow) html += '<div class="warn">Your armor is weighing you down.</div>';
    $('inv-stats').innerHTML = html;
  }

  activate(actionIndex) {
    const g = this.game, p = g.player;
    const it = p.inventory[this.invSel];
    if (!it) return;
    if (!g.canAct()) {
      g.closeMenu();
      return;
    }
    if (this.selectMode) {
      if (!this.selectMode.filter(it)) return;
      const cb = this.selectMode.cb;
      this.selectMode = null;
      cb(it);
      g.closeMenu();
      return;
    }
    const acts = g.actionsFor(it);
    const a = acts[actionIndex];
    if (!a) return;
    const res = a.fn();
    if (g.over || g.menu === 'dialog') return;
    // Close on request, or if that action just paralysed you (a potion of paralysis drunk from the pack).
    if (res === true || p.held()) g.closeMenu();
    else this.renderInventory();
  }

  onKey(e) {
    const g = this.game;
    if (e.code === 'Escape' && !$('howto').hidden) {
      $('howto').hidden = true;
      return;
    }
    if (!g || g.menu !== 'inventory') return;
    const n = g.player.inventory.length;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit && +digit[1] <= HOTBAR_SIZE) { this.assignSelected(+digit[1] - 1); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.selectRow((this.invSel - 1 + n) % Math.max(1, n));
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.selectRow((this.invSel + 1) % Math.max(1, n));
    else if (e.code === 'Enter' || e.code === 'KeyE') this.activate(0);
    else if (e.code === 'KeyD' && !this.selectMode) {
      const it = g.player.inventory[this.invSel];
      if (it) this.activate(g.actionsFor(it).length - 1);
    } else if (e.code === 'KeyT' && !this.selectMode) {
      const it = g.player.inventory[this.invSel];
      if (it && it.kind === 'potion') this.activate(1);
    }
  }

  // --- Hotbar ---

  updateHotbar() {
    const g = this.game, p = g.player, k = g.knowledge;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = this.hotEls[i];
      const b = p.hotbar[i];
      const it = b ? slotItem(p, i) : null;
      let html = `<span class="key">${i + 1}</span>`;
      let unattuned = false;
      if (b) {
        const probe = it ?? { ...b, qty: 0 };
        let qty = '', cd = 0;
        if (stackable(b)) qty = String(it ? it.qty : 0);
        else if (b.kind === 'wand' && it) qty = it.identified ? String(it.charges) : '?';
        else if (b.kind === 'artefact' && it) {
          const s = p.equip.artefacts.indexOf(it);
          if (s < 0) unattuned = true;
          else if (p.artefactCD[s] > 0) {
            cd = p.artefactCD[s] / ARTEFACTS[it.type].active.cooldown;
            qty = `${Math.ceil(p.artefactCD[s])}s`;
          }
        }
        const act = it ? (unattuned ? 'attune' : slotAction(g, it)) : '';
        // Cooldown shade sits over the glyph but under the text, so a recharging power reads as dimmed.
        html = `<span class="glyph" style="color:${glyphColor(k, probe)}">${KIND_GLYPH[b.kind]}</span>` +
          (cd > 0 ? `<span class="cd" style="height:${Math.round(cd * 100)}%"></span>` : '') +
          html + `<span class="qty">${qty}</span><span class="act ${act}">${act}</span>`;
      }
      if (this.hotKeys[i] !== html) {
        this.hotKeys[i] = html;
        el.innerHTML = html;
      }
      el.classList.toggle('empty', !b);
      el.classList.toggle('missing', !!b && !it);
      el.classList.toggle('na', unattuned);
    }
  }

  flashSlot(i) {
    const el = this.hotEls[i];
    el.classList.remove('fired');
    void el.offsetWidth;
    el.classList.add('fired');
    clearTimeout(el.fireT);
    el.fireT = setTimeout(() => el.classList.remove('fired'), 180);
  }

  renderHotStrip() {
    const g = this.game, p = g.player, k = g.knowledge;
    const sel = p.inventory[this.invSel];
    const box = $('inv-hot-slots');
    box.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const b = p.hotbar[i];
      const it = b ? slotItem(p, i) : null;
      const probe = it ?? (b ? { ...b, qty: 1 } : null);
      const cell = document.createElement('div');
      cell.className = 'hs' + (b && !it ? ' missing' : '') + (sel && slotHolds(b, sel) ? ' has-sel' : '');
      cell.innerHTML = `<span class="k">${i + 1}</span>` + (probe
        ? `<span class="g" style="color:${glyphColor(k, probe)}">${KIND_GLYPH[probe.kind]}</span><span class="n"></span>`
        : '<span class="n none">empty</span>');
      if (probe) {
        const name = k.name(probe);
        cell.querySelector('.n').textContent = name;
        cell.title = name;
      }
      cell.addEventListener('click', () => this.assignSelected(i));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        clearSlot(p, i);
        this.renderHotStrip();
      });
      box.appendChild(cell);
    }
  }

  assignSelected(i) {
    const p = this.game.player;
    const it = p.inventory[this.invSel];
    if (this.selectMode || !it) return;
    if (!canHotbar(it)) {
      this.hotNote(it.kind === 'artefact' ? 'That artefact has no power to invoke.' : 'Only potions, scrolls, food, wands and artefact powers go on the hotbar.');
      return;
    }
    assignSlot(p, i, it);
    this.renderHotStrip();
  }

  hotNote(text) {
    const el = $('inv-hot-note');
    el.textContent = text;
    el.classList.add('warn');
    clearTimeout(this.hotNoteT);
    this.hotNoteT = setTimeout(() => {
      el.textContent = HOT_HINT;
      el.classList.remove('warn');
    }, 2200);
  }
}

function equipTag(p, it) {
  const e = p.equip;
  if (e.weapon === it) return 'in hand';
  if (e.armor === it) return 'worn';
  if (e.rings.includes(it)) return 'on finger';
  if (e.artefacts.includes(it)) return 'attuned';
  return '';
}


function killerPhrase(src) {
  if (['poison', 'starvation', 'flames'].includes(src)) return src;
  if (/^(a|an|the) /.test(src)) return src;
  if (/^[A-Z]/.test(src)) return `the ${src}`;
  return (/^[aeiou]/.test(src) ? 'an ' : 'a ') + src;
}

function tombstone(info) {
  const W = 18;
  const center = (s) => {
    s = s.slice(0, W);
    const l = Math.floor((W - s.length) / 2);
    return ' '.repeat(l) + s + ' '.repeat(W - s.length - l);
  };
  const killer = killerPhrase(info.killedBy);
  const words = killer.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > W - 2) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  lines.push(cur.trim());
  const body = [info.name, `${info.gold} Au`, 'killed by', ...lines, `on depth ${info.depth}`, String(new Date().getFullYear())];
  return [
    '              __________',
    '             /          \\',
    '            /    REST    \\',
    '           /      IN      \\',
    '          /     PEACE      \\',
    '         /                  \\',
    ...body.map((l) => `         |${center(l)}|`),
    '        *|     *  *  *      | *',
    '________)/\\\\_//(\\/(/\\)/\\//\\/|_)_______',
  ].join('\n');
}
