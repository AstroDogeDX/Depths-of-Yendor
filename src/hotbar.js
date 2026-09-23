import { POTIONS, ARTEFACTS } from './items/defs.js';
import { drinkPotion, throwPotion, readScroll, zapWand, eatFood, activateArtefact } from './items/use.js';
import { stackable } from './items/generate.js';

// Hotbar bindings live on the player as { kind, type, uid? }.
// Potions, scrolls and food bind by type, so a slot survives an empty stack and refills on pickup;
// wands and artefacts bind to the specific item.

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

/** An item sits in at most one slot; assigning it to the slot it already occupies clears that slot. */
export function assignSlot(player, i, item) {
  const already = slotHolds(player.hotbar[i], item);
  player.hotbar = player.hotbar.map((b) => (slotHolds(b, item) ? null : b));
  if (!already) player.hotbar[i] = bindingFor(item);
}

export function clearSlot(player, i) {
  player.hotbar[i] = null;
}

/** What pressing the slot does. Unidentified potions are always drunk: the hotbar must not leak what they are. */
export function slotAction(game, item) {
  switch (item.kind) {
    case 'potion': return game.knowledge.isKnown(item) && !POTIONS[item.type].good ? 'throw' : 'drink';
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
    case 'drink': drinkPotion(game, item); break;
    case 'throw': throwPotion(game, item); break;
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
