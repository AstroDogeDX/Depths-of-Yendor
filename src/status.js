import { rand } from './rng.js';
import { danger } from './config.js';

// Status effects: things that afflict the player or a monster for a while, each a number of seconds left in
// `who.status` (0 when it isn't in effect). Both go through the same afflict() and tickStatuses(), so immunities,
// how statuses meet (fire and water, heat and cold) and what bosses shrug off work alike for either.
//
// Each status in STATUSES may give:
//   label, color     how the HUD and the target bar name it
//   tint             a monster's glow while it has it (the first in this list that it has wins)
//   harm             a hostile one: bosses take it for BOSS_STATUS as long
//   stack: 'add'     a new dose adds its time (haste). Otherwise a new dose tops it up to the longer of the two.
//   dot              hurts every second: { type (a damage type, see damage.js, or none), source (what killed you),
//                    player(game), monster(game, m) (how much) }
//   resist           the damage type whose immunity wards it off (fire for burning: nothing burns a fire imp)
//   immune(who)      anything else that wards it off
//   start, end       what the log says as it starts ([text, kind]) and ends, for the player
//   mark             what pops up over a monster as it starts on one
//   onStart, onEnd   (game, who): what else happens as it starts and wears off
//   player, monster  false if it never afflicts one of them
//
// What the effects themselves do is in the code for the player and monsters (e.g. `held()` for paralysed or frozen).
// Being Hunted isn't one of these: it's carrying the Amulet (see Game.hunted).
//
// `who` is the player or a monster, with: status, isPlayer, boss, resistMult(type), hasTrait(trait),
// statusNote(game, key, event) (says what happened: 'start', 'end', 'immune', 'doused', 'thawed').

export const BOSS_STATUS = 0.5;
const FROZEN_THAW_CHILL = 4; // seconds of Chilled a thaw leaves behind

const poisonDose = { player: (game) => 1 + Math.floor(danger(game.level.depth) / 4), monster: (game, m) => 1 + Math.floor(m.danger / 3) };

export const STATUSES = {
  frozen: {
    label: 'Frozen', color: '#c8ecff', tint: 0x4a7aa8, harm: true, resist: 'ice', mark: 'FROZEN',
    start: ['You are frozen solid!', 'danger'], end: 'You thaw out.',
    onEnd: (game, who) => afflict(game, who, 'chilled', FROZEN_THAW_CHILL, { show: false }),
  },
  burning: {
    label: 'Burning', color: '#ff7a3a', tint: 0x802000, harm: true, resist: 'fire',
    dot: { type: 'fire', source: 'flames', player: () => rand.int(1, 3), monster: () => rand.int(2, 4) },
    start: ['You are on fire!', 'danger'], end: 'The flames go out.',
  },
  paralysed: {
    label: 'Paralysed', color: '#8fb0ff', tint: 0x103060, harm: true,
    start: ['Your limbs lock rigid!', 'danger'], end: 'You can move again.',
  },
  chilled: {
    label: 'Chilled', color: '#8fd8ff', tint: 0x203a58, harm: true, resist: 'ice', mark: 'CHILLED',
    start: ['The cold bites deep, and you slow.', 'warn'], end: 'The chill leaves you.',
  },
  poisoned: {
    label: 'Poisoned', color: '#9ee070', tint: 0x105010, harm: true, resist: 'poison',
    dot: { type: 'poison', source: 'poison', ...poisonDose },
    start: ['You feel very sick.', 'danger'], end: 'You feel less sick.',
  },
  bleeding: {
    label: 'Bleeding', color: '#ff5060', tint: 0x500010, harm: true, mark: 'BLEEDING',
    dot: { type: null, source: 'blood loss', ...poisonDose },
    immune: (who) => who.hasTrait('bloodless'),
    start: ['You are bleeding!', 'danger'], end: 'The bleeding stops.',
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
    label: 'Wet', color: '#70b0ff', mark: 'WET',
    start: ['You are soaked through.', 'info'], end: 'You have dried off.',
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
 * - Cold on something wet (or `fluid`, like an ooze) freezes it solid, as does wetting something chilled.
 * - Oil makes fire worse: set alight, it burns twice as long (and fire hurts it more; see damageTakenMult).
 * `show`: say so when it's immune (leave it off when a hit that has just done so brought the status).
 * Returns whether it took.
 */
export function afflict(game, who, key, secs, { show = true } = {}) {
  const def = STATUSES[key], s = who.status;
  if (!def || !(key in s) || secs <= 0) return false;
  if (immuneTo(who, key)) {
    if (show) who.statusNote(game, key, 'immune');
    return false;
  }
  if (def.harm && who.boss) secs *= BOSS_STATUS;
  switch (key) {
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
      if (s.wet > 0 || who.hasTrait('fluid')) return afflict(game, who, 'frozen', secs * 0.75, { show });
      break;
    case 'frozen':
      s.burning = 0;
      s.chilled = 0;
      s.wet = 0;
      break;
    case 'wet':
      if (s.burning > 0) douse(game, who);
      if (s.chilled > 0) {
        const chill = s.chilled;
        s.chilled = 0;
        return afflict(game, who, 'frozen', chill * 0.75, { show });
      }
      break;
  }
  const fresh = !(s[key] > 0);
  s[key] = def.stack === 'add' ? s[key] + secs : Math.max(s[key], secs);
  if (fresh) {
    def.onStart?.(game, who);
    who.statusNote(game, key, 'start');
  }
  return true;
}

/** Takes a status away early, as if it had worn off (though a cured freeze leaves no chill behind). */
export function cure(game, who, key, { quiet = false } = {}) {
  if (!(who.status[key] > 0)) return;
  who.status[key] = 0;
  if (key !== 'frozen') STATUSES[key].onEnd?.(game, who);
  if (!quiet) who.statusNote(game, key, 'end');
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
 * Runs `who`'s statuses on by `dt` seconds: they wear down (and off, with what that does), and those that hurt,
 * hurt once a second. `damage: false` for catching a floor up on the time you were away (see Level.catchUp).
 */
export function tickStatuses(game, who, dt, { damage = true } = {}) {
  const s = who.status;
  let hurting = false;
  for (const key in s) {
    if (!(s[key] > 0)) continue;
    s[key] = Math.max(0, s[key] - dt);
    if (s[key] === 0) {
      STATUSES[key].onEnd?.(game, who);
      who.statusNote(game, key, 'end');
    } else if (STATUSES[key].dot) hurting = true;
  }
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
