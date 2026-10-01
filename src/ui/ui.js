import * as THREE from 'three';
import { KIND_GLYPH, ARTEFACTS, ARMORS, CONTAINERS, wandRecharge } from '../items/defs.js';
import { equipSlotFor, equipItem, putAway, unequipItem, DOLL_SLOTS_FOR } from '../items/use.js';
import { T } from '../dungeon/tiles.js';
import { TRAP_COLORS } from '../world/level.js';
import { HUNGER_HUNGRY, HUNGER_FAMISHED, TILE, HOTBAR_SIZE, PLAYER_SPEED, MAX_DEPTH, THEMES, FLOORS_PER_THEME, TWO_HAND_STR, themeForDepth } from '../config.js';
import { canHotbar, slotItem, slotHolds, slotAction, assignSlot, clearSlot, moveSlot, HELD, HAND_KINDS } from '../hotbar.js';
import { stackable } from '../items/generate.js';
import { DAMAGE_TYPES } from '../damage.js';
import { Logo } from './logo.js';
import { readSave } from '../save.js';
import { STATUSES } from '../status.js';
import { BUILD, buildLabel } from '../build.js';
import { tileInfo } from './tiles.js';
import { iconHTML, markIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const KIND_COLOR = {
  weapon: '#c8ccd4', offhand: '#ffa050', shield: '#b08050', armor: '#c0a880', scroll: '#e8dcb0', wand: '#a0c8ff', ring: '#e0a0ff',
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
// A pool on the map (its theme's `pools.map` colour), as it is where you can't see it just now: darker.
const dimPool = (hex) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.62).toString(16).padStart(2, '0')).join('')}`;
const PACK_COLUMNS = 5; // tiles across the pack (see renderInventory)
// Paper-doll slots, positioned over the 240x300 figure in index.html.
const DOLL_SLOTS = [
  { key: 'art0', label: 'Artefact', x: 14, y: 12 },
  { key: 'art1', label: 'Artefact', x: 174, y: 12 },
  { key: 'armor', label: 'Armor', x: 94, y: 88 },
  { key: 'weapon', label: 'Weapon', x: 14, y: 150 },
  { key: 'offhand', label: 'Off hand', x: 174, y: 150 },
  { key: 'ring0', label: 'Ring', x: 20, y: 228, small: true },
  { key: 'ring1', label: 'Ring', x: 180, y: 228, small: true },
];
const equippedIn = (p, key) => {
  if (key === 'weapon') return p.equip.weapon;
  if (key === 'offhand') return p.equip.offhand;
  if (key === 'armor') return p.equip.armor;
  if (key.startsWith('ring')) return p.equip.rings[+key[4]];
  return p.equip.artefacts[+key[3]];
};
const glyphColor = (k, it) => (it.kind === 'potion' ? hex(k.color(it)) : KIND_COLOR[it.kind]);
/** An item's icon (see icons.js), `scale` times its size, or its glyph if it has none yet. */
const itemIcon = (k, it, scale) => iconHTML(it, k, { scale, fallback: `<span style="color:${glyphColor(k, it)}">${KIND_GLYPH[it.kind]}</span>` });
/** What the pack's tooltip says over `el` (see UI.showTip): a thing's name, and a note under it; none, without a name. */
function setTip(el, name, note = '') {
  if (!name) {
    if (el.dataset.tip !== undefined) { delete el.dataset.tip; delete el.dataset.tipNote; }
    return;
  }
  if (el.dataset.tip !== name) el.dataset.tip = name;
  if (el.dataset.tipNote !== note) el.dataset.tipNote = note;
}

export class UI {
  constructor() {
    this.popups = [];
    this.logEntries = [];
    this.invTab = 'pack'; // the tab of the pack on show (see Player.bags)
    this.invSel = 0; // the thing selected on it, by its place there
    this.pick = null; // or the thing selected on the paper doll or the hotbar (see selected)
    this.drag = null; // what's being dragged about the pack screen (see dragSource)
    this.note = ''; // a passing note over the pack (see packNote)
    this.selectMode = null;
    this.cache = {};
    this.v = new THREE.Vector3();
  }

  bind(game) {
    this.game = game;
    this.logo = new Logo($('logo'));
    // The pack's tooltip: the name of whatever you point at in it (a tile, or a slot on the doll or the hotbar), at once.
    this.pointer = { x: -1, y: -1 };
    document.addEventListener('mousemove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.showTip(e.target);
    });
    document.addEventListener('dragstart', () => this.hideTip());
    // Up in its corner, no more than about 40% of the screen's width or 30% of its height (on a narrow screen, where
    // the menu goes under it, as wide as fits).
    const fitLogo = () => {
      const wide = window.innerWidth > 820;
      this.logo.fit(Math.min(620, window.innerWidth * (wide ? 0.4 : 0.86), window.innerHeight * (wide ? 0.3 : 0.26) * (this.logo.w / this.logo.h)));
    };
    fitLogo();
    window.addEventListener('resize', fitLogo);
    $('title-sub').textContent = `${MAX_DEPTH} floors down, the Amulet of Yendor waits. Take it, and climb home, if you can.`;
    $('title-build').textContent = buildLabel();
    if (BUILD.sha) $('title-build').title = `Commit ${BUILD.sha}`;
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
    this.dollEls = {};
    for (const d of DOLL_SLOTS) {
      const el = document.createElement('div');
      el.className = 'ds' + (d.small ? ' ring' : '');
      el.style.left = `${d.x}px`;
      el.style.top = `${d.y}px`;
      $('inv-doll').appendChild(el);
      this.dollEls[d.key] = el;
    }
    this.bindDoll();
    this.bindHotbar();
    $('inv-list').style.gridTemplateColumns = `repeat(${PACK_COLUMNS}, var(--tile))`;
  }

  reset() {
    this.logEntries.forEach((e) => e.el.remove());
    this.logEntries = [];
    this.popups.forEach((p) => p.el.remove());
    this.popups = [];
    this.closeMenus();
    this.hotKeys = [];
    this.invTab = 'pack';
    this.invSel = 0;
    $('hud').hidden = $('hotbar').hidden = false;
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
    $('hud').hidden = $('hotbar').hidden = true;
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
    $('start-btn').classList.toggle('primary', !save); // (with a run saved, Continue is)
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
    // Keys for this floor's locks: iron for doors, gold for chests.
    const keys = [[p.keys[lvl.depth], 'iron'], [p.goldKeys[lvl.depth], 'gold']].filter(([n]) => n > 0).map(([n, kind]) => `${n} ${kind}`).join(', ');
    this.set('stat-line', `Lv ${p.level}   XP ${p.xp}/${p.xpToNext()}   Str ${p.str}   Def ${p.defense}   Gold ${p.gold}${keys ? `   Keys: ${keys}` : ''}`);

    const hpFrac = Math.max(0, p.hp / p.maxHp);
    $('hp-fill').style.width = `${hpFrac * 100}%`;
    this.set('hp-text', `HP ${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
    $('atk-fill').style.width = `${p.charge * 100}%`;
    $('st-fill').style.width = `${(p.stamina / p.maxStamina) * 100}%`;
    $('st-bar').classList.toggle('winded', p.winded);
    $('st-bar').classList.toggle('guard', p.guard > 0); // (a raised shield: it isn't coming back meanwhile)
    $('atk-bar').classList.toggle('ready', p.charge >= 1);
    document.body.classList.toggle('lowhp', hpFrac < 0.25);
    document.body.classList.toggle('blind', p.status.blind > 0);

    const st = [];
    if (g.hunted) st.push('<span class="st-hunted">Hunted</span>');
    for (const [key, def] of Object.entries(STATUSES)) {
      // (One that isn't wearing down, as you're wet while you wade, shows no time.)
      if (p.status[key] > 0) st.push(`<span style="color:${def.color}">${def.label}${def.permanent || def.hold?.(p) ? '' : ` ${Math.ceil(p.status[key])}`}</span>`);
    }
    if (p.winded) st.push('<span class="st-winded">Winded</span>');
    else if (p.mode === 'sneak') st.push('<span class="st-sneak">Sneaking</span>');
    else if (p.mode === 'sprint' && p.moving) st.push('<span class="st-sprint">Sprinting</span>');
    if (p.hunger <= 0) st.push('<span class="st-starving">Starving</span>');
    else if (p.hunger < HUNGER_FAMISHED) st.push('<span class="st-famished">Famished</span>');
    else if (p.hunger < HUNGER_HUNGRY) st.push('<span class="st-hungry">Hungry</span>');
    this.setHtml('status-line', st.join(' '));

    const gear = [];
    gear.push(`<div>${p.equip.weapon ? k.name(p.equip.weapon) : 'bare hands'}${p.twoHanded ? ' <span class="grip">(both hands)</span>' : ''}</div>`);
    const off = p.equip.offhand, slung = off?.kind === 'shield' ? 'on your back' : 'stowed';
    if (off) gear.push(`<div class="off">${k.name(off)}${p.twoHanded ? ` <span class="grip">(${slung})</span>` : p.guarding ? ' <span class="grip">(raised)</span>' : ''}</div>`);
    p.equip.artefacts.forEach((a, i) => {
      if (!a) return;
      const def = ARTEFACTS[a.type];
      const cd = p.artefactCD[i];
      gear.push(`<div class="art">${def.active ? `[${i === 0 ? 'R' : 'T'}] ` : ''}${def.name}${def.active ? (cd > 0 ? ` <span class="cd">${Math.ceil(cd)}s</span>` : ' <span class="ok">ready</span>') : ''}</div>`);
    });
    this.setHtml('gear', gear.join(''));

    // Holding a hotbar key for something held up, what the mouse does with it (see Game.holdSlot).
    const held = g.hold && slotItem(p, g.hold.i), how = held && HELD[held.kind];
    const prompt = g.menu ? '' : how ? `${g.knowledge.name(held)}: [Click] ${how.left} · [Right-click] ${how.right}`
      : g.interaction ? `[E] ${g.interaction.label}` : '';
    this.set('prompt', prompt);

    const t = g.target;
    $('target').hidden = !t;
    if (t) {
      const tag = t.isAlly() ? ' (fighting for you)' : t.charmed() ? '' : t.state === 'sleep' ? ' (asleep)' : t.state !== 'hunt' ? ' (unaware)'
        : !t.seen ? ' (searching)' : '';
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
        else if (t === T.POOL) c = lvl.visible[i] ? lvl.theme.pools.map : dimPool(lvl.theme.pools.map);
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
    // Chests you've seen: shut ones tan (a locked one gold, like a locked door), open or smashed ones dim. A mimic passes
    // for one.
    const sense = p.status.mindvision > 0 || p.hasArtefact('eye');
    for (const c of lvl.chests) {
      if (!c.seen) continue;
      ctx.fillStyle = c.state !== 'closed' ? '#5a4632' : c.kind === 'locked' ? '#f0c040' : '#dca064';
      const s = Math.max(2, scale * 0.55);
      ctx.fillRect(ox + (c.x / TS) * scale - s / 2, oy + (c.z / TS) * scale - s / 2, s, s * 0.7);
    }
    for (const m of lvl.monsters) {
      if (m.dead) continue;
      const seen = lvl.isVisibleWorld(m.x, m.z) && p.status.blind <= 0;
      if (!seen && !sense) continue;
      ctx.fillStyle = m.isAlly() ? '#ff8ac8' : m.boss ? '#ff40ff' : seen ? '#ff4030' : '#b03060';
      const s = Math.max(3, scale * (m.boss ? 0.9 : 0.6));
      ctx.fillRect(ox + (m.x / TS) * scale - s / 2, oy + (m.z / TS) * scale - s / 2, s, s);
    }
    // A mimic passing for a chest has a mind all the same: sensed, it shows as the monster it is.
    for (const c of sense ? lvl.chests : []) {
      if (c.kind !== 'mimic') continue;
      ctx.fillStyle = '#b03060';
      const s = Math.max(3, scale * 0.6);
      ctx.fillRect(ox + (c.x / TS) * scale - s / 2, oy + (c.z / TS) * scale - s / 2, s, s);
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
    $('hotbar').classList.remove('live');
    this.selectMode = null;
    this.pick = null;
    this.endDrag();
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
    $('hud').hidden = $('hotbar').hidden = true;
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
  //
  // The pack screen: the paper doll of what you have equipped, the pack's tabs over a grid of tiles, what's selected,
  // and, below the panel, the HUD's own hotbar, live while the pack is open. What you have equipped or on the hotbar is
  // out of the pack (see Player.bags). Select a thing by clicking it, wherever it is; drag it to a doll slot to put it
  // on, to a hotbar slot to put it there, or from either back to the pack. Number keys put the selected thing on the
  // hotbar, as dragging it there does. `pick`: the thing selected on the doll or the hotbar, else null, and the
  // selection is `invSel` on the tab on show.

  openInventory() {
    $('inventory').hidden = false;
    $('hotbar').classList.add('live');
    this.renderInventory();
  }

  /** The tab of the pack on show: one of Player.bags. */
  shownBag() {
    const bags = this.game.player.bags();
    return bags.find((b) => b.key === this.invTab) ?? bags[0];
  }

  /** The thing selected, if any. */
  selected() {
    return this.pick ?? this.shownBag().items[this.invSel] ?? null;
  }

  /** Points the selection at `it`, wherever it is now (on its tab, or on the doll or hotbar), without redrawing. */
  aim(it) {
    const p = this.game.player;
    if (!it || !p.inventory.includes(it)) {
      this.pick = null;
      return;
    }
    if (!p.inPack(it)) {
      this.pick = it;
      return;
    }
    const bag = p.bags().find((b) => b.items.includes(it));
    this.pick = null;
    this.invTab = bag.key;
    this.invSel = bag.items.indexOf(it);
  }

  /** Selects `it`, showing its tab if it's in the pack. */
  showItem(it) {
    this.aim(it);
    this.renderInventory();
  }

  /** Shows the tab `step` tabs on from the one on show (wrapping round). */
  switchTab(step) {
    const bags = this.game.player.bags();
    const i = Math.max(0, bags.findIndex((b) => b.key === this.invTab));
    this.showTab(bags[(i + step + bags.length) % bags.length].key);
  }

  showTab(key) {
    if (key === this.invTab && !this.pick) return;
    this.invTab = key;
    this.invSel = 0;
    this.pick = null;
    this.renderInventory();
  }

  selectItem(prompt, filter, cb) {
    this.selectMode = { prompt, filter, cb };
    // The first thing that will do: on the tab on show if there's one there, else another tab, else on the doll or the
    // hotbar.
    const p = this.game.player, bags = p.bags(), shown = this.shownBag();
    const bag = shown.items.some(filter) ? shown : bags.find((b) => b.items.some(filter));
    this.aim(bag ? bag.items.find(filter) : p.inventory.find(filter));
    if (this.game.menu !== 'inventory') this.game.openMenu('inventory');
    else this.renderInventory();
  }

  /**
   * Full rebuild — only when the pack's contents may have changed. The pack has a tab for itself and one for each
   * expansion you have (see Player.bags), each showing how full it is; the one on show is a grid of tiles, one for
   * every slot it has, kept in groups (see packOrder in player.js). Each tile shows the item's glyph, and in its corners
   * and tint what you know of it (see tiles.js).
   */
  renderInventory() {
    const g = this.game, p = g.player, k = g.knowledge;
    const bags = p.bags(), bag = bags.find((b) => b.key === this.invTab) ?? bags[0];
    this.invTab = bag.key;
    if (this.pick && (!p.inventory.includes(this.pick) || p.inPack(this.pick))) this.pick = null;
    const inv = bag.items;
    const tabs = $('inv-tabs');
    tabs.innerHTML = '';
    for (const b of bags) {
      const el = document.createElement('div');
      el.className = `tab${b === bag ? ' on' : ''}${this.selectMode && !b.items.some(this.selectMode.filter) ? ' dim' : ''}`;
      el.innerHTML = `<span>${b.holds ? CONTAINERS[b.key].tab : 'Pack'}</span><span class="n">${b.items.length}/${b.size}</span>`;
      el.addEventListener('click', () => this.showTab(b.key));
      tabs.appendChild(el);
    }
    const grid = $('inv-list');
    grid.innerHTML = '';
    this.invSel = Math.max(0, Math.min(this.invSel, inv.length - 1));
    $('inv-count').textContent = `${p.gold} gold`;
    this.renderPrompt();

    for (let i = 0; i < Math.max(bag.size, inv.length); i++) {
      const it = inv[i], tile = document.createElement('div');
      grid.appendChild(tile);
      if (!it) {
        tile.className = 'tile empty';
        continue;
      }
      const t = tileInfo(it, k);
      tile.className = `tile ${t.tint}${!this.selectMode || this.selectMode.filter(it) ? '' : ' dim'}`;
      tile.innerHTML = `<span class="tg">${itemIcon(k, it, 3)}</span>` +
        `<span class="c tl">${t.level}</span><span class="c tr">${t.count}</span><span class="c bl"></span>` +
        (t.mark ? `<img class="c br mark" src="${markIcon(t.mark.name)}" width="18" height="18" alt="" draggable="false" />` : '');
      setTip(tile, k.name(it));
      // Click selects; double-click performs the first action. Hover only highlights.
      tile.addEventListener('click', () => this.selectRow(i));
      tile.addEventListener('dblclick', () => { this.selectRow(i); this.activate(0); });
      tile.draggable = !this.selectMode;
      this.dragSource(tile, () => ({ item: it, from: 'pack' }));
    }
    this.selectRow(this.pick ? -1 : this.invSel);
    this.showTip(); // (for whatever's under the pointer now)
  }

  /**
   * Shows the pack's tooltip beside the pointer, for what's under it (`target`, by default whatever is there now) if
   * that has one (see setTip), and hides it otherwise. Only while the pack is open.
   */
  showTip(target = document.elementFromPoint(this.pointer.x, this.pointer.y)) {
    const el = this.game?.menu === 'inventory' && !this.drag ? target?.closest?.('[data-tip]') : null;
    if (!el) return this.hideTip();
    const tip = $('tip'), { tip: name, tipNote: note } = el.dataset;
    if (tip.dataset.name !== name || tip.dataset.note !== note) {
      tip.dataset.name = name;
      tip.dataset.note = note;
      tip.innerHTML = '<b></b><span></span>';
      tip.firstChild.textContent = name[0].toUpperCase() + name.slice(1);
      tip.lastChild.textContent = note;
    }
    tip.hidden = false;
    // Below and to the right of the pointer, unless that would run off the screen.
    const { x, y } = this.pointer, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${x + 16 + w > window.innerWidth ? x - 10 - w : x + 16}px`;
    tip.style.top = `${y + 22 + h > window.innerHeight ? y - 8 - h : y + 22}px`;
  }

  hideTip() {
    if (!$('tip').hidden) $('tip').hidden = true;
  }

  /** The line over the pack: a passing note (see packNote), a choice asked of you, or the shopkeeper buying. */
  renderPrompt() {
    const g = this.game;
    const shop = g.level.shopkeeper && g.level.playerInShop ? 'The shopkeeper is buying: pick an item and choose Sell.' : '';
    const text = this.note || (this.selectMode ? this.selectMode.prompt : shop);
    // The prompt's space is always reserved so the pack never shifts when it appears.
    $('inv-prompt').textContent = text;
    $('inv-prompt').classList.toggle('off', !text);
    $('inv-prompt').classList.toggle('warn', !!this.note);
  }

  /** Says something over the pack for a moment: why that didn't work. */
  packNote(text) {
    this.note = text;
    this.renderPrompt();
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => {
      this.note = '';
      if (this.game.menu === 'inventory') this.renderPrompt();
    }, 2600);
  }

  /** Selects the `i`th tile on the tab on show (or, with -1, keeps `pick`), without rebuilding the pack. */
  selectRow(i) {
    if (i >= 0) {
      this.invSel = i;
      this.pick = null;
    }
    const tiles = $('inv-list').children, n = this.shownBag().items.length;
    for (let r = 0; r < tiles.length; r++) tiles[r].classList.toggle('sel', !this.pick && r === this.invSel && r < n);
    this.renderDetail();
    this.renderDoll();
    this.updateHotbar();
  }

  renderDetail() {
    const g = this.game, p = g.player, k = g.knowledge;
    const it = this.selected();
    const acts = $('inv-actions');
    acts.innerHTML = '';
    const button = (label, fn, disabled = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    };
    if (it) {
      const slot = p.hotbar.findIndex((b) => slotHolds(b, it));
      const where = [equipTag(p, it), slot >= 0 && `on the hotbar, ${slot + 1}`].filter(Boolean).join(', ');
      $('inv-name').textContent = k.name(it) + (where ? ` (${where})` : '');
      $('inv-desc').textContent = k.describe(it);
      if (this.selectMode) {
        const ok = this.selectMode.filter(it);
        button(ok ? 'Choose this' : 'Not a valid choice', () => this.activate(0), !ok);
      } else {
        g.actionsFor(it).forEach((a, ai) => button(a.label, () => this.activate(ai)));
        if (slot >= 0) button('Off the hotbar', () => this.perform(it, () => this.unslot(slot)));
      }
    } else {
      $('inv-name').textContent = '';
      const bag = this.shownBag();
      $('inv-desc').textContent = bag.items.length ? '' : bag.holds ? `Your ${CONTAINERS[bag.key].name} is empty.` : 'Your pack is empty.';
    }
  }

  renderDoll() {
    const g = this.game, p = g.player, k = g.knowledge;
    const sel = this.selected();
    // Where the selected, not-yet-equipped item would go (same rule equipItem uses).
    const target = sel && !this.selectMode && !p.isEquipped(sel) ? equipSlotFor(p, sel) : null;
    for (const d of DOLL_SLOTS) {
      const el = this.dollEls[d.key];
      const it = equippedIn(p, d.key);
      const tint = it ? tileInfo(it, k).tint : '';
      el.classList.toggle('empty', !it);
      el.classList.toggle('cursed', tint === 'cursed');
      el.classList.toggle('clean', tint === 'clean');
      el.classList.toggle('sel', !!it && it === sel);
      el.classList.toggle('target', d.key === target);
      el.classList.toggle('dim', !!it && !!this.selectMode && !this.selectMode.filter(it));
      el.draggable = !!it && !this.selectMode;
      // Gripping your weapon in both hands: it says so, and what's in your off hand is shown stowed.
      el.classList.toggle('stowed', !!it && d.key === 'offhand' && p.twoHanded);
      if (it) {
        // Its + (a cursed ring's shown as what it does to you: against you).
        const showPlus = it.identified && (['weapon', 'armor', 'shield'].includes(it.kind) || (it.kind === 'ring' && it.type !== 'teleportation'));
        const against = it.kind === 'ring' && it.curse > 0;
        const plus = showPlus ? `<span class="de${against ? ' bad' : ''}">${against ? '−' : '+'}${it.plus}</span>` : '';
        const grip = d.key === 'weapon' && p.twoHanded ? '<span class="dh">2H</span>'
          : d.key === 'offhand' && p.twoHanded ? `<span class="dh">${it.kind === 'shield' ? 'on back' : 'stowed'}</span>` : '';
        el.innerHTML = `<span class="dg">${itemIcon(k, it, d.small ? 2 : 3)}</span>${plus}${grip}`;
        setTip(el, k.name(it), d.key === 'weapon' && p.twoHanded ? 'In both hands'
          : d.key === 'offhand' && p.twoHanded ? (it.kind === 'shield' ? 'On your back' : 'Stowed') : '');
      } else {
        el.innerHTML = `<span class="dl">${d.label}</span>`;
        setTip(el, '');
      }
    }
    // Worn armor tints the figure's torso.
    const a = p.equip.armor;
    $('doll-torso').style.fill = a ? hex(ARMORS[a.type].color) : '';

    const w = p.weaponStats(), wi = p.equip.weapon;
    // An unknown + or curse must not leak through the numbers.
    const known = !wi || wi.identified;
    const mult = !wi || wi.curseKnown ? w.dmgMult : 1;
    const heavy = w.short > 0; // (with your grip: see Player.weaponStats)
    const slow = !!a && ARMORS[a.type].str > p.str;
    const lo = Math.max(1, Math.round((w.dmg[0] + (known ? w.plus : 0)) * mult));
    const hi = Math.max(1, Math.round((w.dmg[1] + (known ? w.plus : 0) + w.excess) * mult));
    // Two label/value pairs per row: wide values on the left, short ones on the right.
    const rows = [
      ['Damage', `${lo}–${hi}${known ? '' : ' (+?)'} ${DAMAGE_TYPES[w.dmgType].name}`, heavy], ['Reach', `${w.reach}m`],
      ['Recovery', `${w.recharge.toFixed(2)}s`, heavy], ['Defense', String(p.defense)],
      ['Speed', `${Math.round((p.moveSpeed() / PLAYER_SPEED) * 100)}%`, slow], ['Strength', String(p.str)],
    ];
    let html = rows.map(([label, v, bad]) => `<span>${label}</span><b${bad ? ' class="bad"' : ''}>${v}</b>`).join('');
    if (heavy) {
      html += `<div class="warn">${p.twoHanded ? 'Your weapon is too heavy for you, even in both hands.'
        : w.short <= TWO_HAND_STR ? 'Your weapon is too heavy for you in one hand: F grips it in both.'
        : 'Your weapon is too heavy for you. Gripping it in both hands (F) would help.'}</div>`;
    } else if (p.twoHanded) html += '<div class="note">Your weapon is gripped in both hands (F for one).</div>';
    if (slow) html += '<div class="warn">Your armor is weighing you down.</div>';
    $('inv-stats').innerHTML = html;
  }

  /** Sets up the paper doll's slots: click to select what's in one, drag to or from them to put things on or away. */
  bindDoll() {
    const g = this.game;
    for (const d of DOLL_SLOTS) {
      const el = this.dollEls[d.key];
      el.addEventListener('click', () => {
        const it = equippedIn(g.player, d.key);
        if (it) this.showItem(it);
      });
      el.addEventListener('dblclick', () => {
        const it = equippedIn(g.player, d.key);
        if (!it) return;
        this.showItem(it);
        this.activate(0);
      });
      this.dragSource(el, () => {
        const it = equippedIn(g.player, d.key);
        return it ? { item: it, from: 'doll', slot: d.key } : null;
      });
      this.dropTarget(el, (dr) => dr.slot !== d.key && !!DOLL_SLOTS_FOR[dr.item?.kind]?.includes(d.key),
        (dr) => equipItem(g, dr.item, d.key));
    }
  }

  activate(actionIndex) {
    const g = this.game, p = g.player;
    const it = this.selected();
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
    else this.showItem(it); // (following it, if it's gone on or off the doll)
  }

  /** Makes a change by hand (a drag, a number key), then shows `it` wherever it's gone. Not while you can't act. */
  perform(it, fn) {
    const g = this.game;
    if (!g.canAct()) {
      g.closeMenu();
      return;
    }
    fn();
    if (g.menu === 'inventory') this.showItem(it);
  }

  // --- Dragging (HTML drag and drop): `drag` is { item, from: 'pack' | 'doll' | 'hotbar', slot } while it's going ---

  /** Lets `el` be dragged: `get()` says what's being dragged from it, or null for nothing. */
  dragSource(el, get) {
    el.addEventListener('dragstart', (e) => {
      const d = this.game.menu === 'inventory' && !this.selectMode ? get() : null;
      if (!d) {
        e.preventDefault();
        return;
      }
      this.drag = d;
      e.dataTransfer.setData('text/plain', '');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => this.endDrag());
  }

  /** Lets things be dropped on `el`: those `accepts(drag)` says will do, which `drop(drag)` then does. */
  dropTarget(el, accepts, drop) {
    const ok = () => !!this.drag && this.game.menu === 'inventory' && accepts(this.drag);
    el.addEventListener('dragover', (e) => {
      if (!ok()) return;
      e.preventDefault();
      el.classList.add('drop');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const d = ok() && this.drag;
      this.endDrag();
      if (d) this.perform(d.item, () => drop(d));
    });
  }

  endDrag() {
    this.drag = null;
    for (const el of document.querySelectorAll('.drop')) el.classList.remove('drop');
  }

  /** Puts the thing in hotbar slot `i` back in the pack, if there's room. */
  unslot(i) {
    if (!clearSlot(this.game.player, i)) this.packNote("There's no room in your pack for it.");
  }

  onKey(e) {
    const g = this.game;
    if (e.code === 'Escape' && !$('howto').hidden) {
      $('howto').hidden = true;
      return;
    }
    if (!g || g.menu !== 'inventory') return;
    const n = this.shownBag().items.length;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit && +digit[1] <= HOTBAR_SIZE) { this.assignSelected(+digit[1] - 1); return; }
    // Arrows (or W and S, up and down) move about the grid of tiles, wrapping round the things in the pack. From
    // something selected on the doll or the hotbar, they come back to the grid.
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -PACK_COLUMNS, KeyW: -PACK_COLUMNS, ArrowDown: PACK_COLUMNS, KeyS: PACK_COLUMNS }[e.code];
    if (step && n) this.selectRow(this.pick ? this.invSel : (((this.invSel + step) % n) + n) % n);
    else if (e.code === 'KeyQ') this.switchTab(e.shiftKey ? -1 : 1);
    else if (e.code === 'Enter' || e.code === 'KeyE') this.activate(0);
    else if (e.code === 'KeyD' && !this.selectMode) {
      const it = this.selected();
      if (it) this.activate(g.actionsFor(it).length - 1);
    } else if (e.code === 'KeyT' && !this.selectMode) {
      const it = this.selected();
      if (it && it.kind === 'potion') this.activate(1);
    }
  }

  // --- Hotbar ---

  /**
   * The HUD's hotbar, drawn every frame. While the pack is open it's live: click a slot to select what's in it,
   * double-click to use it, drag it to another slot or back to the pack, right-click to put it back in the pack.
   */
  updateHotbar() {
    const g = this.game, p = g.player, k = g.knowledge;
    const live = g.menu === 'inventory', sel = live ? this.selected() : null;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = this.hotEls[i];
      const b = p.hotbar[i];
      const it = b ? slotItem(p, i) : null;
      let html = `<span class="key">${i + 1}</span>`;
      let unattuned = false;
      if (b) {
        const probe = it ?? { ...b, qty: 0 };
        let qty = '', cd = 0, rc = '';
        if (stackable(b)) qty = String(it ? it.qty : 0);
        else if (b.kind === 'wand' && it) {
          // Its charges, and while it's short of them, how near the next is (the seconds to it, when it's empty). Until
          // you know the wand, only that it's recharging.
          qty = it.identified ? String(it.charges) : '?';
          if (it.charges < it.maxCharges) {
            const every = wandRecharge(it.plus);
            rc = `<span class="rc"><i style="width:${Math.round((it.rechargeT / every) * 50) * 2}%"></i></span>`;
            if (it.charges === 0 && it.identified) qty = `${Math.ceil(every - it.rechargeT)}s`;
          }
        }
        else if (b.kind === 'artefact' && it) {
          const s = p.equip.artefacts.indexOf(it);
          if (s < 0) unattuned = true;
          else if (p.artefactCD[s] > 0) {
            cd = p.artefactCD[s] / ARTEFACTS[it.type].active.cooldown;
            qty = `${Math.ceil(p.artefactCD[s])}s`;
          }
        }
        const act = it ? (unattuned ? 'attune' : slotAction(g, it)) : '';
        const mark = tileInfo(probe, k).mark; // (what it does, as in the pack, if you know)
        // Cooldown shade sits over the glyph but under the text, so a recharging power reads as dimmed.
        html = `<span class="glyph">${itemIcon(k, probe, 2)}</span>` +
          (mark ? `<img class="mark" src="${markIcon(mark.name)}" width="18" height="18" alt="" draggable="false" />` : '') +
          (cd > 0 ? `<span class="cd" style="height:${Math.round(cd * 100)}%"></span>` : '') +
          html + `<span class="qty">${qty}</span><span class="act ${act}">${act}</span>${rc}`;
      }
      if (this.hotKeys[i] !== html) {
        this.hotKeys[i] = html;
        el.innerHTML = html;
      }
      const tint = it ? tileInfo(it, k).tint : '';
      el.classList.toggle('empty', !b);
      el.classList.toggle('missing', !!b && !it);
      el.classList.toggle('na', unattuned);
      el.classList.toggle('cursed', tint === 'cursed');
      el.classList.toggle('clean', tint === 'clean');
      el.classList.toggle('held', g.hold?.i === i && !g.menu);
      el.classList.toggle('sel', !!it && it === sel);
      el.classList.toggle('dim', live && !!it && !!this.selectMode && !this.selectMode.filter(it));
      el.draggable = live && !!b && !this.selectMode;
      setTip(el, live && b ? k.name(it ?? { ...b, qty: 1 }) : '', it ? '' : 'None left: right-click to clear the slot');
    }
    if (!live) this.hideTip();
  }

  /** Sets up the hotbar's slots: drawn by updateHotbar, and live while the pack is open. */
  bindHotbar() {
    const g = this.game, p = () => g.player;
    this.hotEls.forEach((el, i) => {
      el.addEventListener('click', () => {
        const it = g.menu === 'inventory' && slotItem(p(), i);
        if (it) this.showItem(it);
      });
      el.addEventListener('dblclick', () => {
        const it = g.menu === 'inventory' && slotItem(p(), i);
        if (!it) return;
        this.showItem(it);
        this.activate(0);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (g.menu !== 'inventory' || this.selectMode || !p().hotbar[i]) return;
        this.perform(slotItem(p(), i), () => this.unslot(i));
      });
      this.dragSource(el, () => (p().hotbar[i] ? { item: slotItem(p(), i), from: 'hotbar', slot: i } : null));
      this.dropTarget(el, (d) => (d.from === 'hotbar' ? d.slot !== i : !!d.item && canHotbar(d.item)), (d) => {
        if (d.from === 'hotbar') moveSlot(p(), d.slot, i);
        else if (!slotHolds(p().hotbar[i], d.item)) this.toHotbar(i, d.item);
      });
    });
    // Dropped back on the pack (its tabs or its grid), off the doll or the hotbar.
    this.dropTarget($('inv-pack'), (d) => d.from !== 'pack' && !!d.item, (d) => {
      if (d.from === 'hotbar') this.unslot(d.slot);
      else putAway(g, d.item);
    });
  }

  flashSlot(i) {
    const el = this.hotEls[i];
    el.classList.remove('fired');
    void el.offsetWidth;
    el.classList.add('fired');
    clearTimeout(el.fireT);
    el.fireT = setTimeout(() => el.classList.remove('fired'), 180);
  }

  /** A number key in the pack: puts the selected thing in that hotbar slot (or, if it's there already, takes it out). */
  assignSelected(i) {
    const p = this.game.player;
    const it = this.selected();
    if (this.selectMode || !it) return;
    if (!canHotbar(it)) {
      this.packNote(it.kind === 'artefact' ? 'That artefact has no power to invoke.'
        : 'Only potions, scrolls, food, wands, artefact powers and things you hold in your hands go on the hotbar.');
      return;
    }
    this.perform(it, () => this.toHotbar(i, it));
  }

  /**
   * Puts `it` in hotbar slot `i` (see assignSlot), or takes it off if it's there already. Something you hold that's in
   * your hand comes out of it to hang at your belt there (see HAND_KINDS), unless a curse binds it to you.
   */
  toHotbar(i, it) {
    const g = this.game, p = g.player, was = [...p.hotbar];
    if (!assignSlot(p, i, it)) {
      this.packNote("There's no room in your pack for what's in that slot.");
      return;
    }
    if (!HAND_KINDS.has(it.kind) || !p.isEquipped(it) || !p.onHotbar(it)) return;
    if (unequipItem(g, it, true)) g.log(`You hang the ${g.knowledge.name(it)} at your belt.`);
    else p.hotbar = was;
  }
}

function equipTag(p, it) {
  const e = p.equip;
  if (e.weapon === it) return p.twoHanded ? 'in both hands' : 'in hand';
  if (e.offhand === it) return p.twoHanded ? (it.kind === 'shield' ? 'on your back' : 'stowed') : 'in off hand';
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
