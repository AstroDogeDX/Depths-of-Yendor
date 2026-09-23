# Depths of Yendor

A first-person, real-time roguelike for the browser, in the spirit of **King's Field** (slow, deliberate first-person melee in dark stone corridors) crossed with **Rogue / Pixel Dungeon** (procedural floors, unidentified items, curses, permadeath). Built with three.js and plain ES modules. Nearly everything is generated in code: textures, sound and most models. The weapons and the hand torch are the exception. They are Blockbench models (see [Blockbench models](#blockbench-models)).

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
| Shift | Sprint: 1.6× speed, but loud (uses stamina) |
| Ctrl or C | Sneak: half speed, crouched and near-silent (uses stamina) |
| Mouse | Look (click the view to capture the pointer) |
| Click / Space | Attack. Click swings once the meter is past 20%; holding re-swings only at full charge |
| E | Pick up / use stairs |
| I or Tab | Pack (click or ↑↓ select, double-click or Enter use, T throw, D drop) |
| M | Full map |
| 1–6 | Hotbar slots (see below) |
| F / right-click | Zap your last-used wand |
| Q | Drink a potion you *know* is healing |
| R / T | Active power of artefact slot 1 / 2 |
| P | Cycle internal render resolution (270p → 360p → 540p → native) |
| Esc | Pause |

## The pack

The left of the pack shows a paper doll of what you have equipped: weapon in hand, armor on the chest (tinting the figure), two rings and two artefact attunements. A known curse gives the slot a red border. Clicking a filled slot selects that item. Selecting something you haven't equipped highlights the slot it would go into. Underneath are your derived stats (damage, recovery, reach, defense, speed, strength), with anything too heavy for you shown in red. An unidentified weapon's enchantment stays hidden: its damage shows as *(+?)*.

## Hotbar

Open your pack, select a potion, scroll, food, wand or artefact, then press 1–6 (or click a slot on the pack's hotbar row) to bind it. Pressing the same number on the same item unbinds it, and right-clicking a slot clears it. In play, the number key uses the item:

- **Potions** are drunk, unless you've identified them as harmful (poison, confusion, darkness, paralysis, liquid flame), in which case they're **thrown** where you're looking. Unidentified potions are always drunk, so the hotbar never gives away what a potion is.
- **Scrolls** are read, **food** is eaten, and **wands** are zapped at the crosshair.
- **Artefacts** trigger their active power if you're attuned to them. The slot shows the cooldown.

Potion, scroll and food slots remember the *type*, so a slot whose stack runs out shows 0 and refills when you pick up more. Wand and artefact slots remember that specific item.

## Moving Rogue to real time

- **Attack meter instead of turns.** Every weapon has a recovery time. You can swing early, but damage scales with the charge, like King's Field's power bar. The weapon visibly sags while the meter refills.
- **Telegraphed monster attacks.** Monsters wind up before striking, and during the windup they turn slowly toward you. Stepping back or circle-strafing makes them whiff, which replaces Rogue's to-hit dice for defence. Heavy hits can stagger a monster out of its windup.
- **Stealth and sneak attacks.** Monsters start asleep or wandering. Unaware targets take double damage and cannot dodge (Pixel Dungeon's surprise attacks). Monsters notice you by sight and by the sound of your footsteps (see below). Standing still, rings of stealth and light armour help. Heavy armour hurts.
- **Clocks tick in seconds.** Hunger, regeneration, status effects, wand recharge and ring identification all run on real time. The world pauses while the pack or map is open, but drinking, eating, throwing or changing equipment empties your attack meter, so doing it mid-fight still costs a swing.
- **Paralysis means paralysis.** While paralysed you can't use items (from the pack or the hotbar), pick things up, take stairs or invoke artefacts. Only the map stays available.
- **Identification is per run.** Potion colours, scroll labels, wand woods and ring gems are reshuffled from the seed. Potions reveal themselves when drunk, and throwing a potion identifies it if the splash does something visible. Weapons and armour reveal their enchantment after enough hits. Rings reveal themselves after about 100 s of wear.
- **Curses.** About 16% of equipment is cursed with a negative enchantment and binds to you when equipped. Scrolls of remove curse or enchanting break the curse.
- **Persistent floors.** Levels are kept when you leave, so you can go back up. The dungeon also restocks itself slowly, and fast and angrily once you carry the Amulet.

## What's in it

- **10 floors in 4 themes:** Upper Catacombs, Sunken Halls, Ember Deep, Yendor's Vault. Seeded layouts with pillared halls, wall sconces, doors and hidden traps (spike, poison gas, teleport, alarm). See *Floors and doors* below.
- **12 monsters:** rat, bat, ooze, goblin, goblin archer, skeleton, orc, wraith, fire imp, troll, stone golem, and the **Warden of Yendor**, who fires bolt volleys and raises the dead at half health.
- **Items:** 7 weapons with different reach and speed (spears out-reach swords, hammers hit hard but recover slowly), 5 armours with strength requirements, 10 potions, 9 scrolls, 5 wands, 6 rings, food.
- **6 artefacts**, 4 per run in guarded shrines on floors 3, 5, 7 and 9: Chalice of Crimson Thirst (lifesteal), Eye of the Deep (see all monsters and traps), Horn of Thunder (stun blast), Cloak of Shadows (invisibility), Boots of the Wind (speed), Emberheart (burning strikes, fire immunity). You have two attunement slots.
- A Rogue tombstone when you die. Seeds are shareable.

## Stamina, sprinting and sneaking

Stamina is a separate bar from the attack meter and is never spent on swings. It drains only while you're *moving* in a mode: sprinting uses 22 a second, sneaking 9. Holding the key while standing still is free. It refills (18 a second, half as fast again standing still) after a short pause. Run it dry and you're *Winded*: no sprinting or sneaking until it's back to 30%. You start with 100, and gain 10 more per level.

- **Noise.** Your footsteps carry by walking distance, round corners but not through walls: about 6 m walking, 16 m sprinting, 1.5 m sneaking, and nothing standing still. Heavy armour is a quarter louder. A sprint can wake monsters in neighbouring rooms.
- **Hearing and searching.** A monster that hears you comes *searching* (a **?**). Only when it actually sees you does it become fully aware (a **!**). Until then it can still be struck unaware.
- **Sneaking up on sleepers.** Sleepers wake mostly to footsteps, or to someone standing right over them, and sneaking cuts both. In testing, sneaking up to within 2 m of a sleeper woke it about 14% of the time, against about 75% for walking up.

**Ctrl and the browser:** Ctrl+W, Ctrl+T and Ctrl+N are reserved by browsers, and Ctrl+W is also "sneak forward". So:

- **Fullscreen** (on by default; see the title screen or pause panel) uses Keyboard Lock in Chrome and Edge, so those keys go to the game.
- **Outside fullscreen**, the game asks before the tab closes or reloads while Ctrl is held.
- Other Ctrl shortcuts are suppressed during play.
- **C** is an alternative sneak key with no conflicts at all.

## Floors and doors

Floors are generated the Pixel Dungeon way, graph first:

- **The loop.** A ring of rooms with the entrance stairs on one side and the exit (or, on the last floor, the Amulet's vault) opposite. There are always two independent routes between them, so both stair rooms always have at least two ways in and out.
- **Branches.** Rooms that hang off the loop, or off other branches, as dead ends. The artefact shrine is one: a side room behind a door.
- **Sealed rooms.** Every connection is a doorway on each room's wall plus an A*-routed corridor. Corridors can never cut through a room, so a room can only be entered through its own doorways.

A doorway is either an open arch or a wooden door. Doors swing open when anyone walks into them (or on **E**), and swing shut once the doorway has been clear for a couple of seconds. A closed door blocks sight, arrows and bolts, so slipping through one is a way to break a chase. Monsters path through doors and open them.

**Locked doors** are fully working but not placed yet. They can only go on a branch, never the loop. Each needs an iron key, which is always placed somewhere on that floor's loop so it can never be locked away. Keys don't take pack slots: they show as *Keys* on the stat line and are used up when you walk into (or use) the locked door. Monsters can't path through a locked door, and teleports never drop you inside a locked room.

**Adding a specialist room:** add a type to `dungeon/rooms.js` (size, door style, whether the normal population pass may use it, and a `furnish(ctx, room)` that places its contents), then put it in the plan in `dungeon/generator.js` as a branch, e.g. `{ type: 'treasury', locked: true }`.

## Blockbench models

The weapons you hold and find, and the torch in your other hand, are [Blockbench](https://www.blockbench.net) projects in `assets/models/`. Weapons live in `weapons/`, one per `model` name in `items/defs.js` (`dagger`, `sword`, `longsword`, `mace`, `spear`, `axe`, `hammer`), and the torch is `torch.bbmodel`. The game reads the `.bbmodel` files directly, so there is no export step. Open one in Blockbench (desktop or web), edit it, save over the file, and the dev server reloads.

- **Format:** Generic Model. Cubes, meshes and groups (with pivots and rotations) all work. Each texture becomes one flat-shaded material, and texels under 50% alpha are cut out. Elements with *Export* unticked are left out.
- **Glowing parts:** a texture whose render mode is *Emissive* ignores lighting, like the torch's burning crown. *Additive* also blends onto whatever is behind it.
- **Anchors:** the game can find a group's pivot by the group's name. The torch's empty `flame` group marks where the fire burns, so moving that group in Blockbench moves the flame.
- **Scale:** one Blockbench pixel is 1/64 m, so a 16-pixel block is 25 cm.
- **Orientation:** the pivot (0, 0, 0) is where the hand grips, and the tip or head points up (+Y). On weapons, the cutting edge or striking face points north (−Z). The swing animation depends on this.
- **Textures** must stay embedded in the project file, which is Blockbench's default. The game ignores texture file paths.
- **New weapons:** give the `WEAPONS` entry a new `model` name and add `<name>.bbmodel` to the folder.

## Code map

```
src/
  config.js            world scale, depth count, themes, tuning constants
  game.js              run lifecycle, level transitions, rendering, interaction, traps, endings
  player.js            movement, attack meter, stats, statuses, hunger/regen, inventory
  combat.js            player melee resolution
  hotbar.js            hotbar bindings and what each slot does when pressed
  input.js / audio.js  pointer-lock input; WebAudio synth sfx + ambient drone
  dungeon/generator.js pure data: plans the loop and branches, lays out rooms, routes corridors, populates (seeded)
  dungeon/rooms.js     room types (entrance, exit, standard, vault, shrine): sizes, door style, furnishing
  dungeon/tiles.js     tile types
  dungeon/levelBuilder.js  merged wall/floor/ceiling geometry with baked corner AO, stairwells, sconces, doors
  dungeon/textures.js  procedural canvas textures per theme
  world/level.js       runtime level: collision, line of sight, doors, BFS flow field, fog of war, spawning
  monsters/defs.js     bestiary stats + depth spawn tables
  monsters/monster.js  AI state machine (sleep → wander → hunt, fear, ranged kiting), attacks, statuses
  monsters/models.js   low-poly primitive models with per-type animation
  items/defs.js        item catalog and unidentified appearances
  items/identify.js    per-run appearance shuffle, naming, descriptions
  items/generate.js    random items by depth, enchant/curse rolls
  items/use.js         potions, scrolls, wands, equip/curses, throwing, artefact powers
  items/models.js      item models: primitives for most items, Blockbench files for weapons
  items/bbmodel.js     loads Blockbench .bbmodel projects (cubes, meshes, groups, textures) into three.js
  fx/                  viewmodel (hands), pixel-art flames, projectiles, particles, glow sprites
  ui/ui.js             HUD, minimap, message log, floating text, pack, dialogs, end screens
assets/models/         Blockbench models: weapons/ and the hand torch
```

Balance numbers live in `monsters/defs.js`, `items/defs.js` and `config.js`. `window.game` is exposed for poking at state from the dev console.

## Possible next steps

- Save on exit (serialise the level map and player to localStorage) for proper roguelike permadeath-with-resume
- Specialist side rooms behind locked doors (treasuries, libraries, armouries), secret doors
- Shops (Pixel Dungeon style) to give gold a use
- More level shapes: caves via cellular automata, flooded rooms, chasms that drop you a floor
- Mimics, splitting oozes, invisible stalkers, thieves who steal and teleport away
- A shield/block action, and alchemy or crafting for spare potions
- Music, and positional audio for monsters you can hear but not see
