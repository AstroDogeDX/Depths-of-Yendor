import { ARTEFACTS } from './items/defs.js';
import { drinkPotion, throwPotion, readScroll, zapWand, eatFood, activateArtefact } from './items/use.js';
import { stackable } from './items/generate.js';

// Hotbar bindings live on the player as { kind, type, uid? }.
// Potions, scrolls and food bind by type, so a slot survives an empty stack and refills on pickup;
// wands and artefacts bind to the specific item.
// What a slot holds is out of the pack (see Player.bags): it takes no pack slot, and taking it off the hotbar puts it
// back in the pack, so that needs room there.

export function canHotbar(item) {
  return item.kind === 'potion' || item.kind === 'scroll' || item.kind === 'food' || item.kind === 'wand' ||
    (item.kind === 'artefact' && !!ARTEFACTS[item.type].active);
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
 * What pressing the slot does. A potion waits for you to choose while you hold its key: click to throw it, right-click
 * to drink it (see Game.handleKeys and usePotionSlot).
 */
export function slotAction(game, item) {
  switch (item.kind) {
    case 'potion': return 'hold';
    case 'scroll': return 'read';
    case 'food': return 'eat';
    case 'wand': return 'zap';
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

/** Throws (`how` 'throw') or drinks ('drink') the potion in slot `i`. Returns true if it did. */
export function usePotionSlot(game, i, how) {
  const item = slotItem(game.player, i);
  if (!item || item.kind !== 'potion' || !game.canAct()) return false;
  if (how === 'throw') throwPotion(game, item);
  else drinkPotion(game, item);
  return true;
}
