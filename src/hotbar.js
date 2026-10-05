import { ARTEFACTS } from './items/defs.js';
import { drinkPotion, throwPotion, readScroll, zapWand, zapSelf, eatFood, activateArtefact, equipItem } from './items/use.js';
import { stackable } from './items/generate.js';

// Hotbar bindings live on the player as { kind, type, uid? }.
// Potions, scrolls and food bind by type, so a slot survives an empty stack and refills on pickup;
// wands, artefacts and things you hold bind to the specific item.
// What a slot holds is out of the pack (see Player.bags): it takes no pack slot, and taking it off the hotbar puts it
// back in the pack, so that needs room there.
//
// Things you hold in a hand (HAND_KINDS) hang at your belt on the hotbar: pressing the slot's key swaps one with what's
// in that hand (see swapSlot), so you can change weapons, or take up your shield, your bow or your lantern, without
// opening the pack. A lantern there still gives some light, hung at your belt (see Player.carriedLight).
export const HAND_KINDS = new Set(['weapon', 'offhand', 'shield', 'bow']);

export function canHotbar(item) {
  return item.kind === 'potion' || item.kind === 'scroll' || item.kind === 'food' || item.kind === 'wand' || item.kind === 'thrown' ||
    (item.kind === 'artefact' && !!ARTEFACTS[item.type].active) || HAND_KINDS.has(item.kind);
}

function bindingFor(item) {
  return stackable(item)
    ? { kind: item.kind, type: item.type }
    : { kind: item.kind, type: item.type, uid: item.uid };
}

export function slotHolds(binding, item) {
  if (!binding) return false;
  return binding.uid ? binding.uid === item.uid : binding.kind === item.kind && binding.type === item.type;
}

export function slotItem(player, i) {
  const b = player.hotbar[i];
  return b ? player.inventory.find((it) => slotHolds(b, it)) ?? null : null;
}

/**
 * Puts an item in slot `i`, out of any other slot it was in; what was in slot `i` goes back in the pack. An item sits
 * in at most one slot, and putting it in the slot it's in already takes it off the hotbar. Returns false, changing
 * nothing, if that would leave more in the pack than fits.
 */
export function assignSlot(player, i, item) {
  const was = player.hotbar;
  const already = slotHolds(was[i], item);
  player.hotbar = was.map((b) => (slotHolds(b, item) ? null : b));
  if (!already) player.hotbar[i] = bindingFor(item);
  if (player.packFits()) return true;
  player.hotbar = was;
  return false;
}

/** Empties slot `i`, putting what was in it back in the pack. Returns false, changing nothing, if there's no room. */
export function clearSlot(player, i) {
  const was = player.hotbar[i];
  player.hotbar[i] = null;
  if (player.packFits()) return true;
  player.hotbar[i] = was;
  return false;
}

/** Moves what's in slot `from` to slot `to`, swapping it with what was there. */
export function moveSlot(player, from, to) {
  const h = player.hotbar;
  [h[from], h[to]] = [h[to], h[from]];
}

/**
 * What holding a slot's key lets you do with what's in it, by kind: raised in place of your weapon, click for `left`
 * and right-click for `right`, which is always on yourself (see Game.holdSlot and useHeldSlot). A thrown weapon
 * (`wind`) is wound up instead, while right-click is held, and thrown with a click (see thrown.js). Anything else is
 * used the moment its key is pressed.
 */
export const HELD = {
  potion: { left: 'Throw', right: 'Drink' },
  wand: { left: 'Zap', right: 'Zap yourself' },
  thrown: { left: 'Throw', right: 'Draw back', wind: true },
};

/** What pressing the slot does: for what's HELD, 'hold' (you choose, holding its key); for what you hold, 'swap'. */
export function slotAction(game, item) {
  if (HELD[item.kind]) return 'hold';
  if (HAND_KINDS.has(item.kind)) return 'swap';
  switch (item.kind) {
    case 'scroll': return 'read';
    case 'food': return 'eat';
    case 'artefact': return 'use';
  }
  return '';
}

/** Returns true if something was used. */
export function useSlot(game, i) {
  const p = game.player;
  const b = p.hotbar[i];
  if (!b || !game.canAct()) return false;
  const item = slotItem(p, i);
  if (!item) {
    const name = game.knowledge.name({ ...b, qty: 1 });
    game.log(b.uid ? `You no longer carry the ${name}.` : `You have no ${name} left.`, 'info');
    return false;
  }
  switch (slotAction(game, item)) {
    case 'hold': return false;
    case 'swap': return swapSlot(game, i, item);
    case 'read': readScroll(game, item); break;
    case 'eat': eatFood(game, item); break;
    case 'zap': zapWand(game, item); break;
    case 'use': {
      const slot = p.equip.artefacts.indexOf(item);
      if (slot < 0) {
        game.log(`Attune yourself to the ${ARTEFACTS[item.type].name} before you can use it.`, 'info');
        return false;
      }
      activateArtefact(game, slot);
      break;
    }
  }
  return true;
}

/**
 * Takes up `item`, from slot `i`, in its hand (your weapon's, or your off hand), and hangs what was in that hand at your
 * belt in its place, in the slot (or leaves the slot empty, if your hand was). A cursed thing in your hand won't let go.
 * Returns whether it swapped.
 */
function swapSlot(game, i, item) {
  const p = game.player, hand = item.kind === 'weapon' ? 'weapon' : 'offhand';
  const held = p.equip[hand], was = p.hotbar[i];
  p.hotbar[i] = held ? bindingFor(held) : null;
  equipItem(game, item);
  if (p.equip[hand] === item) return true;
  p.hotbar[i] = was;
  return false;
}

/**
 * Uses what's held up from slot `i` (see HELD): with the `button` clicked ('left' or 'right'), which the hand holding it
 * acts out (see ViewModel.act). Returns true if it did anything.
 */
export function useHeldSlot(game, i, button) {
  return useHeld(game, slotItem(game.player, i), button);
}

/**
 * Uses `item`, held up in place of your weapon (from the hotbar, or a healing potion quaffed with Q), as useHeldSlot.
 * (Not a thrown weapon, which is thrown as it's wound up: see updateThrow.)
 */
export function useHeld(game, item, button) {
  if (!item || !HELD[item.kind] || HELD[item.kind].wind || !game.canAct() || !game.player.inventory.includes(item)) return false;
  const last = item.qty <= 1 && item.kind === 'potion'; // (a wand stays, spent or not)
  let did, act;
  if (item.kind === 'potion') {
    act = button === 'left' ? 'throw' : 'drink';
    did = button === 'left' ? throwPotion(game, item) : (drinkPotion(game, item), true);
  } else {
    act = button === 'left' ? 'zap' : 'self';
    did = button === 'left' ? zapWand(game, item) : zapSelf(game, item);
  }
  if (did) game.viewmodel.act(act, last);
  return !!did;
}
