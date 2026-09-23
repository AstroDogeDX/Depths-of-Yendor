# Depths of Yendor

A first-person, real-time roguelike for the browser, in the spirit of **King's Field** (slow, deliberate first-person melee in dark stone corridors) crossed with **Rogue / Pixel Dungeon** (procedural floors, unidentified items, curses, permadeath). Built with three.js and plain ES modules. There are no asset files: textures, models and sound are all generated in code.

Descend ten floors and take the **Amulet of Yendor** from its Warden. Then choose: invoke the Amulet and escape at once, or carry it back up through every floor to the surface for double score while the dungeon throws everything it has at you.

## Running

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, deployable anywhere
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move; ← → turn (King's Field style) |
| Mouse | Look (click the view to capture the pointer) |
| Click / Space | Attack. Click swings once the meter is past 20%; holding re-swings only at full charge |
| E | Pick up / use stairs |
| I or Tab | Pack (↑↓ select, Enter use, T throw, D drop) |
| M | Full map |
| F / right-click | Zap your last-used wand |
| Q | Drink a potion you *know* is healing |
| R / T | Active power of artefact slot 1 / 2 |
| P | Cycle internal render resolution (270p → 360p → 540p → native) |
| Esc | Pause |

## Moving Rogue to real time

- **Attack meter instead of turns.** Every weapon has a recovery time. You can swing early, but damage scales with the charge, like King's Field's power bar. The weapon visibly sags while the meter refills.
- **Telegraphed monster attacks.** Monsters wind up before striking, and during the windup they turn slowly toward you. Stepping back or circle-strafing makes them whiff, which replaces Rogue's to-hit dice for defence. Heavy hits can stagger a monster out of its windup.
- **Stealth and sneak attacks.** Monsters start asleep or wandering. Unaware targets take double damage and cannot dodge (Pixel Dungeon's surprise attacks). Standing still, rings of stealth and light armour help. Heavy armour hurts.
- **Clocks tick in seconds.** Hunger, regeneration, status effects, wand recharge and ring identification all run on real time. The world pauses while the pack or map is open, but using an item empties your attack meter, so drinking mid-fight still costs a swing.
- **Identification is per run.** Potion colours, scroll labels, wand woods and ring gems are reshuffled from the seed. Potions reveal themselves when drunk, and throwing a potion identifies it if the splash does something visible. Weapons and armour reveal their enchantment after enough hits. Rings reveal themselves after about 100 s of wear.
- **Curses.** About 16% of equipment is cursed with a negative enchantment and binds to you when equipped. Scrolls of remove curse or enchanting break the curse.
- **Persistent floors.** Levels are kept when you leave, so you can go back up. The dungeon also restocks itself slowly, and fast and angrily once you carry the Amulet.

## What's in it

- **10 floors in 4 themes:** Upper Catacombs, Sunken Halls, Ember Deep, Yendor's Vault. Floors are rooms and corridors (MST plus loops), with pillared halls, wall sconces, hidden traps (spike, poison gas, teleport, alarm) and seeded layouts.
- **12 monsters:** rat, bat, ooze, goblin, goblin archer, skeleton, orc, wraith, fire imp, troll, stone golem, and the **Warden of Yendor**, who fires bolt volleys and raises the dead at half health.
- **Items:** 7 weapons with different reach and speed (spears out-reach swords, hammers hit hard but recover slowly), 5 armours with strength requirements, 10 potions, 9 scrolls, 5 wands, 6 rings, food.
- **6 artefacts**, 4 per run in guarded shrines on floors 3, 5, 7 and 9: Chalice of Crimson Thirst (lifesteal), Eye of the Deep (see all monsters and traps), Horn of Thunder (stun blast), Cloak of Shadows (invisibility), Boots of the Wind (speed), Emberheart (burning strikes, fire immunity). You have two attunement slots.
- A Rogue tombstone when you die. Seeds are shareable.

## Code map

```
src/
  config.js            world scale, depth count, themes, tuning constants
  game.js              run lifecycle, level transitions, rendering, interaction, traps, endings
  player.js            movement, attack meter, stats, statuses, hunger/regen, inventory
  combat.js            player melee resolution
  input.js / audio.js  pointer-lock input; WebAudio synth sfx + ambient drone
  dungeon/generator.js pure data: rooms, corridors, stairs, shrines, population (seeded)
  dungeon/levelBuilder.js  merged wall/floor/ceiling geometry with baked corner AO, stairwells, sconces
  dungeon/textures.js  procedural canvas textures per theme
  world/level.js       runtime level: collision, line of sight, BFS flow field, fog of war, spawning
  monsters/defs.js     bestiary stats + depth spawn tables
  monsters/monster.js  AI state machine (sleep → wander → hunt, fear, ranged kiting), attacks, statuses
  monsters/models.js   low-poly primitive models with per-type animation
  items/defs.js        item catalog and unidentified appearances
  items/identify.js    per-run appearance shuffle, naming, descriptions
  items/generate.js    random items by depth, enchant/curse rolls
  items/use.js         potions, scrolls, wands, equip/curses, throwing, artefact powers
  fx/                  viewmodel (hands), projectiles, particles, glow sprites
  ui/ui.js             HUD, minimap, message log, floating text, pack, dialogs, end screens
```

Balance numbers live in `monsters/defs.js`, `items/defs.js` and `config.js`. `window.game` is exposed for poking at state from the dev console.

## Possible next steps

- Save on exit (serialise the level map and player to localStorage) for proper roguelike permadeath-with-resume
- Doors, secret doors, keys and locked vaults
- Shops (Pixel Dungeon style) to give gold a use
- More level shapes: caves via cellular automata, flooded rooms, chasms that drop you a floor
- Mimics, splitting oozes, invisible stalkers, thieves who steal and teleport away
- A shield/block action, and alchemy or crafting for spare potions
- Music, and positional audio for monsters you can hear but not see
