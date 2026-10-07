import { rand } from './rng.js';
import { danger, WADE_WET } from './config.js';

// Status effects: things that afflict the player or a monster for a while, each a number of seconds left in
// `who.status` (0 when it isn't in effect). Both go through the same afflict() and tickStatuses(), so immunities,
// how statuses meet (fire and water, heat and cold) and what bosses shrug off work alike for either.
//
// Each status in STATUSES may give:
//   label, color     how the HUD and the target bar name it
//   tint             a monster's glow while it has it (the first in this list that it has wins). Kept for a few:
//                    what afflicts a monster shows on it as sprites and flames (see fx/statusFx.js)
//   harm             a hostile one: bosses take it for BOSS_STATUS as long
//   stack: 'add'     a new dose adds its time (haste). Otherwise a new dose tops it up to the longer of the two.
//   permanent        it never wears off (it's 1 while in effect), only ends when something ends it
//   hold(who)        while this is true it doesn't wear down (Wet, while wading)
//   dot              hurts every second: { type (a damage type, see damage.js, or none), source (what killed you),
//                    player(game), monster(game, m) (how much) }
//   regen(who)       heals this much a second, little by little
//   resist           the damage type whose immunity wards it off (fire for burning: nothing burns a fire imp)
//   immune(who)      anything else that wards it off
//   start, end       what the log says as it starts ([text, kind]) and ends, for the player
//   mark             what pops up over a monster as it starts on one
//   onStart, onEnd   (game, who): what else happens as it starts and wears off
//   player, monster  false if it never afflicts one of them
//
// What the effects themselves do is in the code for the player and monsters (e.g. `held()` for paralysed or frozen).
// How they look is in fx/statusFx.js (on monsters) and fx/screenFx.js (over your view).
// Being Hunted isn't one of these: it's carrying the Amulet (see Game.hunted).
//
// `who` is the player or a monster, with: status, isPlayer, boss, resistMult(type), hasTrait(trait),
// statusNote(game, key, event) (says what happened: 'start', 'end', 'immune', 'doused', 'thawed', 'washed' (water
// kept a malediction off)), `wading` (standing in a pool: see wade), and `noFreeze` (nothing freezes it now).

export const BOSS_STATUS = 0.5;
export const SHACKLED_SPEED = 0.55; // Shackled, you (or a monster) move this much as fast
// A potion of healing's Healing (see drinkPotion and potionSplash in items/use.js): how long it lasts, and how much of
// your health (or a monster's) it mends over that time. Another adds its time to what's left.
export const HEALING = { secs: 8, share: { player: 0.75, monster: 0.5 } };
const FROZEN_THAW_CHILL = 4; // seconds of Chilled a thaw leaves behind
// How long a charm leaves its target heartbroken (immune to charms) once it ends, or is broken.
export const HEARTBREAK = { player: 60, monster: 30 };

/** A charm ending (or broken): heartbreak, and a monster turns on you again (see Monster.uncharm). */
const charmEnds = (game, who) => {
  afflict(game, who, 'heartbroken', HEARTBREAK[who.isPlayer ? 'player' : 'monster'], { show: false });
  who.uncharm?.(game);
};

const poisonDose = { player: (game) => 1 + Math.floor(danger(game.level.depth) / 4), monster: (game, m) => 1 + Math.floor(m.danger / 3) };
// A malediction's bite, every second until water washes it off: 2 on the Sewers' last floor, where the ooze spits it.
const maledictionDose = { player: (game) => 1 + Math.floor(danger(game.level.depth) / 2), monster: (game, m) => 1 + Math.floor(m.danger / 2) };

export const STATUSES = {
  frozen: {
    label: 'Frozen', color: '#c8ecff', tint: 0x4a7aa8, harm: true, resist: 'ice', mark: 'FROZEN',
    // (Past half its health, the Maledicted Ooze's taint boils too hot to freeze: see monsters/bosses.js.)
    immune: (who) => !!who.noFreeze,
    start: ['You are frozen solid!', 'danger'], end: 'You thaw out.',
    onEnd: (game, who) => afflict(game, who, 'chilled', FROZEN_THAW_CHILL, { show: false, thaw: true }),
  },
  burning: {
    label: 'Burning', color: '#ff7a3a', tint: 0x5a1600, harm: true, resist: 'fire',
    dot: { type: 'fire', source: 'flames', player: () => rand.int(1, 3), monster: () => rand.int(2, 4) },
    start: ['You are on fire!', 'danger'], end: 'The flames go out.',
  },
  paralysed: {
    label: 'Paralysed', color: '#8fb0ff', harm: true,
    start: ['Your limbs lock rigid!', 'danger'], end: 'You can move again.',
  },
  // Stunned: knocked senseless (the Forgotten Jailer, charging into a wall: see monsters/bosses.js). As Paralysed: it
  // can't move or act, and takes a blow as if unaware. Monsters only, for now.
  stunned: { label: 'Stunned', color: '#f0e0a0', harm: true, mark: 'STUNNED', player: false },
  // Shackled: a manacle round the ankle, its broken chain dragging (the Forgotten Jailer's chain: see
  // monsters/bosses.js). You move at SHACKLED_SPEED and can't sprint; a monster moves at that and strikes as ever.
  shackled: {
    label: 'Shackled', color: '#a8b4c0', harm: true, mark: 'SHACKLED',
    start: ['A manacle snaps shut round your ankle! You drag its chain.', 'danger'], end: 'The manacle falls open, and you kick it off.',
  },
  chilled: {
    label: 'Chilled', color: '#8fd8ff', harm: true, resist: 'ice', mark: 'CHILLED',
    start: ['The cold bites deep, and you slow.', 'warn'], end: 'The chill leaves you.',
  },
  poisoned: {
    label: 'Poisoned', color: '#c27ae8', harm: true, resist: 'poison',
    dot: { type: 'poison', source: 'poison', ...poisonDose },
    start: ['You feel very sick.', 'danger'], end: 'You feel less sick.',
  },
  bleeding: {
    label: 'Bleeding', color: '#ff5060', harm: true, mark: 'BLEEDING',
    dot: { type: null, source: 'blood loss', ...poisonDose },
    immune: (who) => who.hasTrait('bloodless'),
    start: ['You are bleeding!', 'danger'], end: 'The bleeding stops.',
  },
  // The Maledicted Ooze's taint (see monsters/bosses.js): it eats at you every second, through armour and resistances,
  // and you don't heal, for as long as it clings to you, which is until water washes it off (see afflict). Nothing
  // wet can take it, and the ooze itself is made of it.
  malediction: {
    label: 'Malediction', color: '#f05ad0', harm: true, permanent: true, mark: 'MALEDICTION',
    dot: { type: null, source: 'a malediction', ...maledictionDose },
    immune: (who) => who.hasTrait('maledicted'),
    start: ['A malediction seeps into you! Only water will wash it off.', 'danger'], end: 'The water washes the malediction off you.',
  },
  weakened: {
    label: 'Weakened', color: '#d0a878', harm: true, mark: 'WEAKENED',
    start: ['Your strength drains away.', 'warn'], end: 'Your strength returns.',
    // A monster fights at 3/4 of its damage (see Monster), with 3/4 of its health.
    onStart: (game, who) => {
      if (who.isPlayer) return;
      who.weakBase = who.maxHp;
      who.maxHp = Math.max(1, Math.round(who.maxHp * 0.75));
      who.hp = Math.min(who.hp, who.maxHp);
    },
    onEnd: (game, who) => {
      if (who.isPlayer || !who.weakBase) return;
      who.maxHp = who.weakBase;
      who.weakBase = null;
    },
  },
  // Charmed: you can't fight (see Game.canFight). A monster takes your side and fights for you (see Monster), and a
  // boss just stops fighting. Striking one breaks it (see breakCharm). Smitten is a charm that never wears off (for the
  // Bard, to come); on a boss it's an ordinary charm. Either leaves its target Heartbroken, and no charm takes on the
  // heartbroken.
  charmed: {
    label: 'Charmed', color: '#ff8ac8', harm: true, mark: 'CHARMED',
    immune: (who) => who.status.heartbroken > 0 || who.status.smitten > 0,
    start: ["You are charmed! You can't bring yourself to fight.", 'warn'], end: 'The charm on you breaks.',
    onStart: (game, who) => who.charm?.(game),
    onEnd: charmEnds,
  },
  smitten: {
    label: 'Smitten', color: '#ff8ac8', permanent: true, player: false, mark: 'SMITTEN',
    immune: (who) => who.status.heartbroken > 0,
    onStart: (game, who) => who.charm?.(game),
    onEnd: charmEnds,
  },
  heartbroken: {
    label: 'Heartbroken', color: '#b07898', mark: 'HEARTBROKEN',
    start: ['Your heart aches. No charm will take you for a while.', 'info'], end: 'Your heart has mended.',
  },
  confused: {
    label: 'Confused', color: '#e0a8ff', harm: true,
    start: ['Huh? What? Where am I?', 'warn'], end: 'You feel less confused now.',
  },
  blind: {
    label: 'Blind', color: '#a0a0b8', harm: true,
    start: ['Darkness swallows your sight!', 'warn'], end: 'Your sight returns.',
  },
  feared: { label: 'Feared', color: '#e0d890', harm: true, player: false },
  oiled: {
    label: 'Oiled', color: '#d8b050', harm: true, mark: 'OILED',
    start: ['You are slick with oil.', 'warn'], end: 'The oil on you has worn off.',
  },
  wet: {
    label: 'Wet', color: '#70b0ff', mark: 'WET', hold: (who) => !!who.wading,
    start: ['You are soaked through.', 'info'], end: 'You have dried off.',
  },
  healing: {
    label: 'Healing', color: '#8cf08a', stack: 'add', mark: 'HEALING', end: 'The healing warmth fades.',
    regen: (who) => (who.maxHp * HEALING.share[who.isPlayer ? 'player' : 'monster']) / HEALING.secs,
  },
  hasted: { label: 'Hasted', color: '#a8e890', stack: 'add', monster: false, end: 'You feel yourself slow down.' },
  mindvision: { label: 'Mind vision', color: '#a8e890', monster: false, end: "Your mind's eye closes." },
  invisible: { label: 'Invisible', color: '#a8e890', monster: false, end: 'You fade back into view.' },
};

// Old names for statuses, from saves made before they were renamed: slowness was replaced by chill.
const ALIASES = { haste: 'hasted', poison: 'poisoned', confusion: 'confused', paralysis: 'paralysed', paralyzed: 'paralysed', slowed: 'chilled' };

/** A status record for the player (`forPlayer`) or a monster, every status it can have at 0. */
export function blankStatus(forPlayer) {
  const s = {};
  for (const [key, def] of Object.entries(STATUSES)) if (def[forPlayer ? 'player' : 'monster'] !== false) s[key] = 0;
  return s;
}

/** Puts saved statuses (see snapshots) back into a status record, under their current names. */
export function restoreStatus(status, saved = {}) {
  for (const [key, secs] of Object.entries(saved)) {
    const k = ALIASES[key] ?? key;
    if (k in status) status[k] = secs;
  }
}

/** The statuses a status record has in effect, rounded for a save. */
export function saveStatus(status) {
  const s = {};
  for (const k in status) if (status[k] > 0) s[k] = Math.round(status[k] * 100) / 100;
  return s;
}

/** Whether `who` can't be given this status at all. */
export function immuneTo(who, key) {
  const def = STATUSES[key];
  return (def.resist && who.resistMult(def.resist) === 0) || !!def.immune?.(who);
}

/**
 * Gives `who` a status for `secs`, if it can take it, working out how it meets what's there already:
 * - Water puts out fire, and nothing wet will burn.
 * - Cold puts out fire, and heat drives out cold: burning something chilled or frozen thaws it instead of setting
 *   it alight, and chilling something burning douses it instead of chilling it.
 * - Cold on something wet (or `fluid`, like an ooze) freezes it solid, as does wetting something chilled: unless it
 *   can't be frozen, when it's only chilled.
 * - Oil makes fire worse: set alight, it burns twice as long (and fire hurts it more; see damageTakenMult).
 * - Water washes a malediction off, and nothing wet can take one.
 * `show`: say so when it's immune (leave it off when a hit that has just done so brought the status). `thaw`: the
 * chill a thaw leaves, which never freezes anything again (else an ooze, or anything standing in water, would thaw
 * straight back into ice, for ever).
 * Returns whether it took.
 */
export function afflict(game, who, key, secs, { show = true, thaw = false, halved = false } = {}) {
  const def = STATUSES[key], s = who.status;
  if (!def) {
    console.warn(`afflict: no status called '${key}'`); // (ALIASES are only for old saves)
    return false;
  }
  if (!(key in s) || secs <= 0) return false;
  if (immuneTo(who, key)) {
    if (show) who.statusNote(game, key, 'immune');
    return false;
  }
  // (`halved`: it has been already, as the chill that freezes something wet was.)
  if (def.harm && who.boss && !halved) secs *= BOSS_STATUS;
  switch (key) {
    case 'smitten':
      // A boss is only ever charmed, for a while; anything else stays smitten, and is no longer merely charmed.
      if (who.boss) return afflict(game, who, 'charmed', secs, { show });
      s.charmed = 0;
      break;
    case 'burning':
      if (s.wet > 0) return false;
      if (s.frozen > 0 || s.chilled > 0) {
        warm(game, who);
        return false;
      }
      if (s.oiled > 0) {
        secs *= 2;
        s.oiled = 0;
      }
      break;
    case 'chilled':
      if (s.burning > 0) {
        douse(game, who);
        return false;
      }
      if (!thaw && (s.wet > 0 || who.hasTrait('fluid')) && !immuneTo(who, 'frozen')) return afflict(game, who, 'frozen', secs * 0.75, { show, halved: true });
      break;
    case 'frozen':
      s.burning = 0;
      s.chilled = 0;
      s.wet = 0;
      break;
    case 'wet':
      if (s.burning > 0) douse(game, who);
      if (s.malediction > 0) cure(game, who, 'malediction');
      if (s.chilled > 0 && !immuneTo(who, 'frozen')) {
        const chill = s.chilled;
        s.chilled = 0;
        return afflict(game, who, 'frozen', chill * 0.75, { show, halved: true });
      }
      break;
    case 'malediction':
      if (s.wet > 0) {
        who.statusNote(game, key, 'washed');
        return false;
      }
      break;
  }
  const fresh = !(s[key] > 0);
  s[key] = def.permanent ? 1 : def.stack === 'add' ? s[key] + secs : Math.max(s[key], secs);
  if (fresh) {
    def.onStart?.(game, who);
    who.statusNote(game, key, 'start');
  }
  return true;
}

/**
 * Keeps `who` (the player or a monster on foot) in step with the water it stands in (see Level.inPool): stepping into
 * a pool soaks it, which puts out fire, or freezes it solid if it's chilled; and it stays soaked while it wades, Wet
 * only starting to wear off once it's out (WADE_WET seconds; see `hold`). Something the cold has dried (frozen, then
 * still chilled from the thaw) is soaked again once the chill has worn off, not before, or it would freeze again.
 * Returns whether it has just stepped in.
 */
export function wade(game, who, inWater) {
  const entered = inWater && !who.wading, s = who.status;
  who.wading = inWater;
  if (entered || (inWater && !(s.wet > 0) && !(s.chilled > 0) && !(s.frozen > 0))) afflict(game, who, 'wet', WADE_WET, { show: false });
  return entered;
}

/** Takes a status away early, as if it had worn off (though a cured freeze leaves no chill behind). */
export function cure(game, who, key, { quiet = false } = {}) {
  if (!(who.status[key] > 0)) return;
  who.status[key] = 0;
  if (key !== 'frozen') STATUSES[key].onEnd?.(game, who);
  if (!quiet) who.statusNote(game, key, 'end');
}

/** Breaks a charm (or a smitten's devotion) on `who`: struck by the one it was charmed by, it's heartbroken. */
export function breakCharm(game, who) {
  if (!(who.status.charmed > 0 || who.status.smitten > 0)) return;
  const key = who.status.smitten > 0 ? 'smitten' : 'charmed';
  who.status.charmed = 0;
  who.status.smitten = 0;
  STATUSES[key].onEnd(game, who);
  who.statusNote(game, key, 'end');
}

function douse(game, who) {
  who.status.burning = 0;
  who.statusNote(game, 'burning', 'doused');
}

function warm(game, who) {
  who.status.frozen = 0;
  who.status.chilled = 0;
  who.statusNote(game, 'frozen', 'thawed');
}

/**
 * What damage of `type` does to `who` beyond their resistances (`mult`, from resistMult): being frozen strips
 * resistances (weaknesses stay), being wet makes lightning hurt half as much again, and being oiled, fire.
 */
export function damageTakenMult(who, type, mult) {
  if (!type) return mult;
  const s = who.status;
  if (s.frozen > 0) mult = Math.max(1, mult);
  if (type === 'lightning' && s.wet > 0) mult *= 1.5;
  if (type === 'fire' && s.oiled > 0) mult *= 1.5;
  return mult;
}

/**
 * What a hit of `type` does to `who`'s statuses as it lands (see Monster.takeDamage, Game.hurtPlayer): fire thaws
 * something frozen or chilled (the hit still lands), and otherwise may set it alight (`ignite` seconds); ice may chill
 * it (`chill` seconds).
 */
export function hitStatuses(game, who, type, { ignite = 0, chill = 0 } = {}) {
  const s = who.status;
  if (type === 'fire' && (s.frozen > 0 || s.chilled > 0)) warm(game, who);
  else if (ignite) afflict(game, who, 'burning', ignite, { show: false });
  if (chill) afflict(game, who, 'chilled', chill, { show: false });
}

/**
 * Runs `who`'s statuses on by `dt` seconds: they wear down (and off, with what that does), those that heal, heal, and
 * those that hurt, hurt once a second. `damage: false` for catching a floor up on the time you were away (see
 * Level.catchUp): they only wear down.
 */
export function tickStatuses(game, who, dt, { damage = true } = {}) {
  const s = who.status;
  let hurting = false;
  for (const key in s) {
    if (!(s[key] > 0)) continue;
    const def = STATUSES[key];
    // (One that never wears off, or isn't wearing down just now, still hurts: a malediction.)
    if (def.permanent || def.hold?.(who)) {
      if (def.dot) hurting = true;
      continue;
    }
    s[key] = Math.max(0, s[key] - dt);
    if (s[key] === 0) {
      def.onEnd?.(game, who);
      who.statusNote(game, key, 'end');
    } else if (def.dot) hurting = true;
  }
  if (damage && !who.dead) for (const key in s) if (s[key] > 0 && STATUSES[key].regen) who.heal(STATUSES[key].regen(who) * dt);
  if (!damage || !hurting) return;
  who.dotT = (who.dotT ?? 0) + dt;
  if (who.dotT < 1) return;
  who.dotT -= 1;
  for (const key in s) {
    const dot = STATUSES[key].dot;
    if (!dot || !(s[key] > 0) || who.dead || game.over) continue;
    if (who.isPlayer) game.hurtPlayer(dot.player(game), { source: dot.source, type: dot.type, ignoreArmor: true, dot: true });
    else who.takeDamage(game, dot.monster(game, who), { dot: true, type: dot.type });
  }
}
