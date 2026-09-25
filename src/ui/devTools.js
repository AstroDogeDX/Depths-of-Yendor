import { THEMES, FLOORS_PER_THEME, TILE, HUNGER_MAX, isBossDepth, isShopDepth } from '../config.js';
import { WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, ARTEFACTS, FOOD } from '../items/defs.js';
import { makeItem, stackable } from '../items/generate.js';
import { MONSTERS } from '../monsters/defs.js';
import { generateLevel } from '../dungeon/generator.js';
import { disposeGroup } from '../dungeon/levelBuilder.js';
import { Level } from '../world/level.js';
import { T } from '../dungeon/tiles.js';
import { DAMAGE_TYPES, damageType, describeResist } from '../damage.js';
import { STATUSES, afflict, cure } from '../status.js';
import './devTools.css';

// Dev tools, for testing by hand: jump to any floor, give yourself items, change your stats, give you or a monster a
// status, spawn monsters, lay traps.
// The ` key opens and closes the panel during a run. main.js only loads this in development, or in a build
// opened with ?dev in the address, so players never download it.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W, as stairs' `dir`
const KINDS = [
  ['weapon', 'Weapons', WEAPONS], ['armor', 'Armour', ARMORS], ['potion', 'Potions', POTIONS], ['scroll', 'Scrolls', SCROLLS],
  ['wand', 'Wands', WANDS], ['ring', 'Rings', RINGS], ['artefact', 'Artefacts', ARTEFACTS], ['food', 'Food', FOOD],
  ['special', 'Other', { amulet: { name: 'Amulet of Yendor' }, key: { name: 'iron key (this floor)' } }],
];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const SHOTS = { arrow: 'Arrows', bolt: 'Bolts', fire: 'Fireballs' }; // monsters' ranged attacks, by kind

export class DevTools {
  constructor(game) {
    this.game = game;
    this.god = false; // no damage (see Game.hurtPlayer)
    this.kind = 'weapon';
    this.layouts = 0; // how many times "New layout" has rerolled a floor, for fresh seeds
    this.build();
    window.addEventListener('keydown', (e) => {
      const g = this.game, open = g.menu === 'dev';
      if ((e.code === 'Backquote' || e.key === '`') && g.state === 'play' && !g.over && !g.loading && (open || !g.menu)) {
        e.preventDefault();
        if (open) g.closeMenu();
        else g.openMenu('dev');
      } else if (e.code === 'Escape' && open && e.target instanceof HTMLInputElement) {
        g.closeMenu(); // (the game's own Escape handling doesn't see keys typed into a field)
      }
    });
  }

  build() {
    const el = document.createElement('div');
    el.id = 'dev';
    el.className = 'overlay';
    el.hidden = true;
    el.innerHTML = `
      <div class="panel dev">
        <div class="dev-head"><h2>Dev tools</h2><span class="dev-note"></span><button class="alt" data-act="close">Close [\`]</button></div>
        <div class="dev-cols">
          <div>
            <h3>Travel</h3>
            <div class="dev-floors"></div>
            <div class="dev-row">
              <button class="alt" data-act="layout" title="Build this floor again from a new seed">New layout</button>
              <button class="alt" data-act="reveal">Reveal map</button>
              <button class="alt" data-act="stairs">To the stairs down</button>
            </div>
            <h3>You</h3>
            <label class="check"><input type="checkbox" data-opt="god" /> God mode <span>(take no damage)</span></label>
            <div class="dev-stats"></div>
            <div class="dev-row">
              <button class="alt" data-act="restore" title="Full health and stamina, not hungry, no statuses">Restore</button>
              <button class="alt" data-act="kill">Kill every monster</button>
            </div>
            <h3>Statuses</h3>
            <div class="dev-opts"><span>Give one for 15 s to you, or</span><label class="check"><input type="checkbox" data-opt="stmonster" /> the monster you're facing</label></div>
            <div class="dev-grid dev-statuses"></div>
            <h3>Monsters</h3>
            <div class="dev-opts"><span>Spawn one in front of you</span><label class="check"><input type="checkbox" data-opt="asleep" /> Asleep</label></div>
            <div class="dev-grid dev-monsters"></div>
            <h3>Traps</h3>
            <div class="dev-opts"><span>Lay one on the floor in front of you, armed and in plain sight</span></div>
            <div class="dev-grid dev-traps"></div>
          </div>
          <div>
            <h3>Items</h3>
            <div class="dev-tabs"></div>
            <div class="dev-opts">
              <label>Enchant <input type="number" data-opt="ench" value="0" min="-5" max="20" /></label>
              <label>Quantity <input type="number" data-opt="qty" value="1" min="1" max="99" /></label>
              <label class="check"><input type="checkbox" data-opt="cursed" /> Cursed</label>
              <label class="check"><input type="checkbox" data-opt="identified" checked /> Identified</label>
            </div>
            <div class="dev-grid dev-items"></div>
            <div class="dev-row"><button class="alt" data-act="identify" title="Learn every potion, scroll, wand and ring, and identify all you carry">Identify everything</button></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.$ = (sel) => el.querySelector(sel);
    this.opt = (name) => this.$(`[data-opt="${name}"]`);

    // Floors, a row per theme.
    const floors = this.$('.dev-floors');
    THEMES.forEach((theme, i) => {
      floors.insertAdjacentHTML('beforeend', `<span>${theme.name}</span>`);
      for (let f = 1; f <= FLOORS_PER_THEME; f++) {
        const depth = i * FLOORS_PER_THEME + f;
        const tags = [isBossDepth(depth) && 'boss floor', isShopDepth(depth) && 'shop'].filter(Boolean);
        floors.insertAdjacentHTML('beforeend', `<button class="alt${isBossDepth(depth) ? ' boss' : ''}${isShopDepth(depth) ? ' shop' : ''}" data-depth="${depth}"
          title="Floor ${depth}: ${theme.name}${tags.length ? ` (${tags.join(', ')})` : ''}">${depth}</button>`);
      }
    });
    this.$('.dev-monsters').innerHTML = Object.entries(MONSTERS)
      .map(([type, def]) => {
        const shots = def.ranged ? ` ${SHOTS[def.ranged.kind]}: ${DAMAGE_TYPES[damageType(def.ranged)].name}.` : '';
        const tip = `${cap(def.name)}. Melee: ${DAMAGE_TYPES[damageType(def)].name}.${shots} ${describeResist(def)}`;
        return `<button class="alt" data-monster="${type}" title="${tip.trim()}">${cap(def.name)}</button>`;
      }).join('');
    this.$('.dev-statuses').innerHTML = Object.entries(STATUSES)
      .map(([key, def]) => `<button class="alt" data-status="${key}">${def.label}</button>`).join('');
    this.$('.dev-traps').innerHTML = ['spike', 'poison', 'teleport', 'alarm']
      .map((type) => `<button class="alt" data-trap="${type}">${cap(type)}</button>`).join('');
    this.$('.dev-tabs').innerHTML = KINDS.map(([kind, label]) => `<button class="alt" data-kind="${kind}">${label}</button>`).join('');
    this.renderItems();

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) {
        if (e.target === el) this.game.closeMenu(); // a click outside the panel
        return;
      }
      const d = b.dataset;
      if (d.depth) this.travel(+d.depth);
      else if (d.kind) { this.kind = d.kind; this.renderItems(); }
      else if (d.type) this.give(d.type);
      else if (d.monster) this.spawn(d.monster);
      else if (d.trap) this.layTrap(d.trap);
      else if (d.status) this.giveStatus(d.status);
      else if (d.stat) this.stat(d.stat);
      else if (d.act) this.act(d.act);
      this.refresh();
    });
    this.opt('god').addEventListener('change', (e) => {
      this.god = e.target.checked;
      this.note(this.god ? 'God mode on: nothing can hurt you.' : 'God mode off.');
    });
  }

  show() {
    this.el.hidden = false;
    this.note('');
    this.refresh();
  }

  hide() {
    this.el.hidden = true;
  }

  note(text) {
    this.$('.dev-note').textContent = text;
  }

  /** Brings the numbers and the current floor up to date. */
  refresh() {
    const g = this.game, p = g.player;
    if (!p || !g.level) return;
    for (const b of this.el.querySelectorAll('[data-depth]')) b.classList.toggle('here', +b.dataset.depth === g.level.depth);
    const rows = [
      ['Health', `${Math.ceil(p.hp)} / ${p.maxHp}`, [['hp-', '−5'], ['hp+', '+5'], ['max-', 'Max −5'], ['max+', 'Max +5']]],
      ['Strength', p.str === p.baseStr ? String(p.str) : `${p.baseStr} (${p.str} now)`, [['str-', '−1'], ['str+', '+1']]],
      ['Level', `${p.level}  ·  XP ${p.xp}/${p.xpToNext()}`, [['lvl', 'Level up'], ['lvl5', '+5 levels']]],
      ['Gold', String(p.gold), [['gold', '+100'], ['gold10', '+1000']]],
    ];
    this.$('.dev-stats').innerHTML = rows.map(([label, value, btns]) =>
      `<span>${label}</span><b>${value}</b><div>${btns.map(([k, t]) => `<button class="alt" data-stat="${k}">${t}</button>`).join('')}</div>`).join('');
  }

  renderItems() {
    for (const b of this.el.querySelectorAll('[data-kind]')) b.classList.toggle('alt', b.dataset.kind !== this.kind);
    const defs = KINDS.find(([k]) => k === this.kind)[2];
    this.$('.dev-items').innerHTML = Object.entries(defs)
      .map(([type, def]) => `<button class="alt" data-type="${type}" title="${def.name}">${cap(def.name)}</button>`).join('');
  }

  // --- Travel ---

  travel(depth) {
    const g = this.game;
    if (depth === g.level.depth) return this.note(`You're already on floor ${depth}. "New layout" rebuilds it.`);
    g.closeMenu();
    g.changeLevel(depth, 'down'); // arriving by the up stairs, as if you'd walked down
  }

  /** Builds this floor again from a new seed and puts you at its entrance: a quick look at another layout. */
  newLayout() {
    const g = this.game, depth = g.level.depth, old = g.level;
    this.layouts++;
    g.levels.set(depth, new Level(g, generateLevel(`${g.seed}~${this.layouts}`, depth, { artefact: g.artefactFor(depth) })));
    g.closeMenu();
    g.ui.fadeTransition();
    g.arrive(depth, 'down');
    disposeGroup(old.group);
    g.log(`Floor ${depth} rebuilt with a new layout.`, 'info');
  }

  toStairs() {
    const g = this.game, p = g.player, lvl = g.level, s = lvl.data.down;
    if (!s) return this.note('This floor has no way down.');
    const [dx, dy] = DIRS[s.dir];
    p.x = (s.x + dx + 0.5) * TILE;
    p.z = (s.y + dy + 0.5) * TILE;
    p.yaw = Math.atan2(dx, dy); // facing the stairs
    p.pitch = 0;
    p.lastTrapTile = lvl.idx(lvl.toTile(p.x), lvl.toTile(p.z));
    lvl.updateVisibility(p.x, p.z);
    g.closeMenu();
  }

  // --- You ---

  stat(key) {
    const g = this.game, p = g.player;
    switch (key) {
      case 'hp-': p.hp = Math.max(1, p.hp - 5); break;
      case 'hp+': p.hp = Math.min(p.maxHp, p.hp + 5); break;
      case 'max-': p.maxHp = Math.max(1, p.maxHp - 5); p.hp = Math.min(p.hp, p.maxHp); break;
      case 'max+': p.maxHp += 5; p.hp += 5; break;
      case 'str-': p.baseStr = Math.max(1, p.baseStr - 1); break;
      case 'str+': p.baseStr++; break;
      case 'lvl': p.xp = 0; p.levelUp(g); break;
      case 'lvl5': p.xp = 0; for (let i = 0; i < 5; i++) p.levelUp(g); break;
      case 'gold': p.gold += 100; break;
      case 'gold10': p.gold += 1000; break;
    }
  }

  act(key) {
    const g = this.game, p = g.player;
    switch (key) {
      case 'close': g.closeMenu(); break;
      case 'layout': this.newLayout(); break;
      case 'reveal':
        g.level.revealAll();
        for (const t of g.level.traps) g.level.revealTrap(t);
        this.note('The whole floor is on your map, traps and all.');
        break;
      case 'stairs': this.toStairs(); break;
      case 'restore':
        p.hp = p.maxHp;
        p.stamina = p.maxStamina;
        p.winded = false;
        p.hunger = HUNGER_MAX;
        for (const k in p.status) cure(g, p, k, { quiet: true });
        this.note('Restored: full health and stamina, fed, and every status cleared.');
        break;
      case 'kill': {
        const alive = g.level.monsters.filter((m) => !m.dead);
        for (const m of alive) m.die(g);
        this.note(`Killed ${alive.length} monster${alive.length === 1 ? '' : 's'}.`);
        break;
      }
      case 'identify': {
        for (const [kind, , defs] of KINDS) if (g.knowledge.known[kind]) for (const type in defs) g.knowledge.known[kind].add(type);
        for (const it of p.inventory) g.knowledge.identify(it);
        this.note('Every kind of potion, scroll, wand and ring is known, and all you carry is identified.');
        break;
      }
    }
  }

  // --- Items and monsters ---

  /** Makes an item of `type` (of the selected kind) as the options say and puts it in your pack, or at your feet. */
  give(type) {
    const g = this.game, p = g.player, kind = this.kind;
    const ench = Math.round(+this.opt('ench').value || 0), qty = Math.max(1, Math.round(+this.opt('qty').value || 1));
    let item;
    switch (kind) {
      case 'weapon': item = makeItem('weapon', type, { hitsToId: 20 }); break;
      case 'armor': item = makeItem('armor', type, { hitsToId: 14 }); break;
      case 'ring': item = makeItem('ring', type, { wornTime: 0 }); break;
      case 'wand': {
        const max = Math.max(1, WANDS[type].charges[1] + ench); // for a wand, the enchantment adds charges
        item = makeItem('wand', type, { charges: max, maxCharges: max, rechargeT: 0 });
        break;
      }
      case 'special':
        item = type === 'amulet' ? g.makeAmulet() : makeItem('key', 'iron', { depth: g.level.depth });
        if (type === 'amulet') g.amuletTaken = true;
        break;
      default: item = makeItem(kind, type);
    }
    if (kind === 'weapon' || kind === 'armor' || kind === 'ring') {
      item.ench = ench;
      item.cursed = this.opt('cursed').checked;
    }
    if (stackable(item)) item.qty = qty;
    if (this.opt('identified').checked) g.knowledge.identify(item);
    const name = g.knowledge.name(item, { article: true });
    if (p.addItem(item)) {
      this.note(`Added ${name} to your pack.`);
    } else {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), at = g.level.landSpot(p.x + fx * 0.9, p.z + fz * 0.9);
      g.level.addItem(item, at.x, at.z);
      this.note(`Your pack is full, so ${name} is on the floor in front of you.`);
    }
  }

  /** Lays a trap of `type` on the tile in front of you, found and armed. */
  layTrap(type) {
    const g = this.game, p = g.player, lvl = g.level;
    const tx = lvl.toTile(p.x - Math.sin(p.yaw) * TILE), ty = lvl.toTile(p.z - Math.cos(p.yaw) * TILE);
    if (lvl.grid[lvl.idx(tx, ty)] !== T.FLOOR || (tx === lvl.toTile(p.x) && ty === lvl.toTile(p.z))) return this.note('Face a floor tile next to you to lay a trap on it.');
    if (lvl.traps.some((t) => t.x === tx && t.y === ty)) return this.note('There\'s a trap there already.');
    const trap = { x: tx, y: ty, type, hidden: true, triggered: false, view: null };
    lvl.traps.push(trap);
    lvl.revealTrap(trap);
    this.note(`Laid a ${type} trap in front of you. Close the panel and step on it to set it off.`);
  }

  /**
   * Gives you a status, or the monster you're facing (the one whose health shows, else the nearest you can see), as it
   * would come in play: immunities and how it meets what's there already apply (see status.js).
   */
  giveStatus(key) {
    const g = this.game, p = g.player, lvl = g.level, def = STATUSES[key];
    let who = p;
    if (this.opt('stmonster').checked) {
      who = g.target && !g.target.dead ? g.target : lvl.monsters
        .filter((m) => !m.dead && lvl.isVisibleWorld(m.x, m.z))
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!who) return this.note('There\'s no monster in sight to give it to.');
    }
    if (def[who.isPlayer ? 'player' : 'monster'] === false) return this.note(`${def.label} only happens to ${who.isPlayer ? 'monsters' : 'you'}.`);
    const name = who.isPlayer ? 'You' : `The ${who.name}`;
    const took = afflict(g, who, key, 15);
    const now = Object.entries(STATUSES).filter(([k]) => who.status[k] > 0).map(([, d]) => d.label).join(', ') || 'nothing';
    this.note(`${took ? `${name}: ${def.label}.` : `${def.label} didn't take on ${name.toLowerCase()} (immune, or it met something).`} Now: ${now}.`);
  }

  /** Puts a monster a few steps in front of you, or as near as there's room. */
  spawn(type) {
    const g = this.game, p = g.player, lvl = g.level, flying = !!MONSTERS[type].flying;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (let d = 3; d >= 1; d -= 0.5) {
      const x = p.x + fx * d, z = p.z + fz * d;
      if (lvl.blocksPath(lvl.toTile(x), lvl.toTile(z), flying) || !lvl.clearPath(p.x, p.z, x, z, flying)) continue;
      const asleep = this.opt('asleep').checked;
      lvl.addMonster(type, x, z, { asleep, boss: type === 'warden' });
      this.note(`Spawned ${/^[A-Z]/.test(MONSTERS[type].name) ? 'the' : 'a'} ${MONSTERS[type].name}${asleep ? ', asleep' : ''}. Close the panel to meet it.`);
      return;
    }
    this.note('There\'s no room in front of you: face some open floor.');
  }
}
