# Depths of Yendor

A first-person, real-time roguelike for the browser, in the spirit of **King's Field** (slow, deliberate first-person melee in dark stone corridors) crossed with **Rogue / Pixel Dungeon** (procedural floors, unidentified items, curses, permadeath). Built with three.js and plain ES modules. The dungeon, its textures and the sound are generated in code. The monsters, the shopkeeper, the weapons, the torch, the lights on the walls, the shop's furniture and the items you find are Blockbench models (see [Blockbench models](#blockbench-models)).

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
| ` | Dev tools (see below; only in development, or with `?dev` in the address) |

## Dev tools

For testing by hand, press **`** (the key left of 1) during a run to open the dev tools panel. It's always there under `npm run dev`. A built copy has it only when opened with `?dev` in the address (e.g. `http://localhost:4173/?dev`), and players who don't ask for it never download it (`ui/devTools.js` loads on demand from `main.js`). The game waits while the panel is open. Press ` or Esc to close it.

- **Travel:** jump straight to any of the 25 floors, arriving at its entrance as if you'd walked down (boss floors are marked red, shop floors gold). **New layout** builds the floor you're on again from a new seed, for a quick look at another layout. **Reveal map** maps the whole floor, and **To the stairs down** puts you at its exit.
- **You:** god mode (nothing can hurt you), health and maximum health, strength, levelling up, gold, **Restore** (full health and stamina, fed, every status cleared) and **Kill every monster**.
- **Items:** make any weapon, armour, potion, scroll, wand, ring, artefact or food, or the Amulet or an iron key for this floor, with the enchantment (extra charges, for a wand), quantity, curse and identification you choose. It goes in your pack, or on the floor in front of you when the pack is full. **Identify everything** teaches you every potion, scroll, wand and ring, and identifies what you carry.
- **Monsters:** spawn any monster a few steps in front of you, awake or asleep.

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

- **25 floors in 5 themes** of five floors each: Sewers, Catacombs, Caves, Dwarven Ruins and the Underworld. Seeded layouts with pillared halls, wall sconces, doors and hidden traps (spike, poison gas, teleport, alarm). See *The dungeon* and *Floors and doors* below.
- **12 monsters:** rat, bat, ooze, goblin, goblin archer, skeleton, orc, wraith, fire imp, troll, stone golem, and the **Warden of Yendor**, who fires bolt volleys and raises the dead at half health.
- **Items:** 7 weapons with different reach and speed (spears out-reach swords, hammers hit hard but recover slowly), 5 armours with strength requirements, 10 potions, 9 scrolls, 5 wands, 6 rings, food.
- **A shop** on the first floor of each theme after the first (floors 6, 11, 16 and 21). See *The shop* below.
- **6 artefacts**, 5 per run in guarded shrines on the third floor of each theme (3, 8, 13, 18 and 23): Chalice of Crimson Thirst (lifesteal), Eye of the Deep (see all monsters and traps), Horn of Thunder (stun blast), Cloak of Shadows (invisibility), Boots of the Wind (speed), Emberheart (burning strikes, fire immunity). You have two attunement slots.
- A title screen that walks you through a floor of each theme in turn, down the stairs from one to the next.
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

## The dungeon

| Floors | Theme | Meant to be | Boss floor |
|---|---|---|---|
| 1–5 | Sewers | dank and wet | 5 |
| 6–10 | Catacombs | old jail cells, cages and chains | 10 |
| 11–15 | Caves | natural, rough-hewn rock | 15 |
| 16–20 | Dwarven Ruins | an ancient civilisation's halls, fallen apart | 20 |
| 21–25 | Underworld | hellish, demonic and hot | 25: the Warden of Yendor and the Amulet |

Each theme has four ordinary floors and a boss floor (`isBossDepth` in `config.js`). For now the boss floors are built like any other, except floor 25, which holds the Amulet's vault and its keeper, the Warden. The Sewers, the Catacombs and the Caves have their own looks (below). The other themes' colours are placeholders until each gets its own.

**The Sewers** have slimy brick walls with a damp band and a tide mark along their foot, wet cobbled floors and a brick vault overhead (`dungeon/sewerTextures.js`). Two or three rooms on each Sewers floor have a **water channel** running straight across them from wall to wall (`channels` in the theme's entry in `config.js`). The murky water flows in through a barred grate in one wall and out through another, and one or two plank bridges cross it. Nothing can walk through water: players, walking monsters and dropped items all stay on the banks, and walking monsters path round by the bridges. Flying monsters (bats, wraiths) go straight over it, and anything they drop over the water lands on the nearest bank. You can still see and shoot across. A channel never blocks a doorway, and one that would cut off any part of the floor is never dug (`dungeon/channels.js`). You can hear the water running as you get near. Water drips from the drain pipes, and from the vault into puddles and channels, each drop landing with a spreading ring and a quiet plip (`fx/drips.js`). The rooms are dressed with drain pipes, pipes with valve wheels, rubble, barrels, floor drains and puddles (`dungeon/decor.js`). They keep clear of doorways and stairs, and sconces keep off walls that already have something on them.

**The Catacombs** are a tomb and a jail in one: heavy rough-hewn blocks, sooty under the vault and grey with bone dust at their feet, big worn flagstones, and a rough stone vault (`dungeon/catacombTextures.js`). The stone is cold grey, so torchlight and bone stand out warm against it. One or two rooms on each floor have a **spike pit** where the Sewers have a channel: the same trench, 1.5 m deep, its floor a thicket of rusted, blood-tipped spikes among the bones of whoever fell in, with a skull left on a spike here and there. Iron grating walkways cross the pits, and you can look down through them. The pits follow the channels' rules: you can't step in, walking monsters go round, and fliers pass over. The jail has barred cell doors set into the walls, shackles on chains (some still holding a slumped skeleton), and gibbet cages hung from the vault. The tomb has burial niches of skulls and bones, bone piles, stone sarcophagi with their lids pushed askew, clusters of candles whose flames flicker like the sconces', engraved grave slabs set in the floor, and cobwebs in the corners of the rooms. A hanging cage only goes where there's open floor all round it, so it never blocks a way through.

**The Caves** are natural rock that miners dug into and then abandoned. Every surface is rough-hewn: walls, floor, vault and pit sides are split into pieces about 0.7 m across, and a smooth noise field pushes each piece in or out. The walls bulge and lean, the vault sags, and the floor is a little uneven underfoot (`dungeon/roughRock.js`, switched on by `rough` in the theme's entry in `config.js`). The rock stays flat round doorways and stairs and behind anything fixed to a wall, so frames and fittings sit true. Collision still follows the tile grid. The walls are banded strata, cracked and threaded with pale veins and dark seeps, and the floor is rock, grit and pebbles (`dungeon/caveTextures.js`). One or two rooms on each floor have a **bottomless chasm** where the Sewers have a channel. Its sides fade into blackness, a cold wind moans up out of it as you get near, and it is crossed by a sagging rope bridge with a couple of planks missing, which holds, whatever it looks like. The chasms follow the channels' rules. The Caves have no sconces: torches in iron brackets are braced against the rock, and oil lanterns hang from wall arms (`lights` in the theme's entry). The miners left timber supports against the walls, minecarts of ore on lengths of rail (and loose rails), pickaxes, shovels and buckets, barrels and crates. The rock has seams of gold and copper ore, clusters of glowing blue crystals, heaps of fallen boulders, stalagmites rising from the floor, and stalactites that drip from the vault.

**Difficulty** follows `danger(depth)` in `config.js`, which rises evenly from 1 on floor 1 to 10 on floor 25. How many monsters a floor has, how tough they are, loot quality, gold and shop prices all work from it, so the curve spans the whole dungeon and would stretch again if floors were added. Monsters' first and last floors (`depth` in `monsters/defs.js`) are real floor numbers. Experience per level is scaled to match, so your level keeps pace with the danger rather than with the floor count.

## Floors and doors

Floors are generated the Pixel Dungeon way, graph first:

- **The loop.** A ring of rooms with the entrance stairs on one side and the exit (or, on the last floor, the Amulet's vault) opposite. There are always two independent routes between them, so both stair rooms always have at least two ways in and out.
- **Branches.** Rooms that hang off the loop, or off other branches, as dead ends. The artefact shrine is one: a side room behind a door.
- **Sealed rooms.** Every connection is a doorway on each room's wall plus an A*-routed corridor. Corridors can never cut through a room, so a room can only be entered through its own doorways.

Some themes add features to their rooms, like the Sewers' water channels, the Catacombs' spike pits and the Caves' chasms (see *The dungeon*).

A doorway is either an open arch or a wooden door. Doors swing open when anyone walks into them (or on **E**), and swing shut once the doorway has been clear for a couple of seconds. A closed door blocks sight, arrows and bolts, so slipping through one is a way to break a chase. Monsters path through doors and open them.

**Locked doors** are fully working but not placed yet. They can only go on a branch, never the loop. Each needs an iron key, which is always placed somewhere on that floor's loop so it can never be locked away. Keys don't take pack slots: they show as *Keys* on the stat line and are used up when you walk into (or use) the locked door. Monsters can't path through a locked door, and teleports never drop you inside a locked room.

## The shop

On the first floor of each new theme after the first (floors 6, 11, 16 and 21), a door in the room you arrive in leads to a shop. A small hooded shopkeeper stands on a stool behind the counter, idly shaking a purse of coins, watching you and passing remarks. The shop is lit by blue-flamed sconces.

- **Stock:** five items, three on the counter and one on each display table. There's always a ration, a potion and a scroll (often healing and identify), a piece of uncursed gear from a little deeper than the floor you're on, and a wand or an uncursed ring. Items keep their unidentified names. A price depends only on the kind of item (and, for weapons and armour, which one), never on what's hidden about it, so prices give nothing away. Prices rise a little on deeper floors (see `shopStock` and `sellPrice` in `items/generate.js`).
- **Buying:** walk up to an item and press **E**. The prompt shows the price, or what you're short. Gold goes, the item goes into your pack, and there's no haggling or refunds.
- **Selling:** open your pack while you're in the shop and every item gets a **Sell** button with its price: 40% of what the shop would charge for that kind of item, by the same rules, so selling something unidentified tells you nothing about it. Stacks sell one at a time, equipped items come off first (not if they're cursed), and the shopkeeper won't buy the Amulet.
- **Buying back:** the shopkeeper sets what you sell out with its wares, at its usual price for that item. It goes on the first free spot on the counter or the display tables, then on the rug, which holds six. Potions, scrolls and food of the same kind pile up on one spot and sell back one at a time. When every spot is taken, the item you sold longest ago goes to make room.
- **Monsters** never spawn, wander or get teleported into the shop. Only a monster that was chasing you when you went in may follow you in. Any other monster that comes looking waits at the door, unless you attack it from inside.

**Adding a specialist room:** add a type to `dungeon/rooms.js` (size, door style, whether the normal population pass may use it, and a `furnish(ctx, room)` that places its contents), then put it in the plan in `dungeon/generator.js` as a branch, e.g. `{ type: 'treasury', locked: true }`.

## Blockbench models

The monsters, the shopkeeper, the weapons you hold and find, the torch in your other hand, the sconces, torches and lanterns on the walls, room furniture and the items lying on the floor are [Blockbench](https://www.blockbench.net) projects in `assets/models/`:

- `monsters/` has one per monster type in `monsters/defs.js` (`rat`, `bat`, `slime`, `goblin`, `archer`, `skeleton`, `orc`, `wraith`, `imp`, `troll`, `golem`, `warden`).
- `weapons/` has one per `model` name in `items/defs.js` (`dagger`, `sword`, `longsword`, `mace`, `spear`, `axe`, `hammer`).
- `items/` has one per kind of item (`potion`, `scroll`, `wand`, `ring`, `gold`, `key`, `amulet`), plus one per armour (`armor_leather` … `armor_plate`), artefact (`chalice`, `eye`, `horn`, `cloak`, `boots`, `ember`) and food (`apple`, `ration`).
- `props/` has room furniture and decorations: the shop's `shop_counter`, `display_table`, `shelf`, `barrel`, `crates` and `rug` (placed by `dungeon/rooms.js`), the Sewers' `bridge`, `channel_grate`, `drain_pipe`, `pipe_valve`, `rubble` and `floor_drain`, and the Catacombs' `spike_pit`, `grate_bridge`, `cell_door`, `wall_niches`, `shackles`, `chained_skeleton`, `bone_pile`, `sarcophagus`, `hanging_cage`, `candles` and `grave_slab`, and the Caves' `rope_bridge`, `ore_vein`, `crystals`, `mine_timbers`, `minecart`, `rails`, `tools`, `rocks`, `stalagmite` and `stalactites` (placed by `dungeon/decor.js` and the channels). Wall pieces like the pipes, grates, cells, niches and ore have their pivot on the wall face at floor level and stand out from it along +Z. Stalactites have their pivot on the floor like any other prop, and reach up past the vault (2.8 m), so the rough rock never lifts clear of them. Empty groups named `candle_1`, `candle_2`… mark where the game lights a small flame, as on the candles and in the niches, `glow_1`… where a soft glow shines (the crystals), and `drip_1`… where water drips from (the stalactites' tips).
  The Caves' wall lights, `wall_torch` and `lantern`, are props too, but they're built like the sconce: the pivot sits on the wall at the height they hang (1.85 m), and a `flame` group marks the fire. `FITTINGS` in `dungeon/levelBuilder.js` sets each one's flame size and light.
  Props load on demand, each its own small download: the game fetches a theme's props before building one of its floors, and the next theme's while you play the current one, so starting up only waits for the Sewers'. The title screen's walk does the same, fetching each theme during the one before. So the game knows what a theme needs, a new decoration goes in its set's `props` list in `dungeon/decor.js` as well as in the set's placement code (the shop's props are listed in `SHOP_PROPS` in `dungeon/rooms.js`, the channels' in `FILLS` in `dungeon/levelBuilder.js`, and the wall lights in the theme's `lights`).
- `npcs/` has characters who aren't monsters: the `shopkeeper`.
- `torch.bbmodel` and `sconce.bbmodel`.

The game reads the `.bbmodel` files directly, so there is no export step. Open one in Blockbench (desktop or web), edit it, save over the file, and the dev server reloads. (`vite.config.js` imports them as JSON, which keeps the bundle smaller than importing them as text.)

- **Format:** Generic Model. Cubes, meshes and groups (with pivots and rotations) all work. Each texture becomes one flat-shaded material, and texels under 50% alpha are cut out. Elements with *Export* unticked are left out.
- **Glowing parts:** a texture whose render mode is *Emissive* ignores lighting, like the torch's burning crown. *Additive* also blends onto whatever is behind it.
- **Tinted parts:** the parts of an item that change colour from run to run (a potion's liquid, a wand's shaft, a ring's stone) are painted in greys on a texture whose name ends in `_tint`. The game multiplies that texture by the item's colour, so in Blockbench those parts look grey.
- **Double-sided faces:** set a texture's render sides to *Double* for thin things you can see from both sides, like the cloak's open hem.
- **See-through parts:** a texture whose name ends in `_translucent` is blended by its alpha instead of having low-alpha texels cut out, like the slime's gel and the wraith's robe.
- **Anchors:** the game can find a group's pivot by the group's name. The torch, the sconce and the Caves' wall lights each have an empty `flame` group that marks where the fire burns, so moving that group in Blockbench moves the flame. Props have empty groups named `slot_1`, `slot_2`… where items for sale rest (three on the counter, one on each display table, six on the rug).
- **Scale:** one Blockbench pixel is 1/64 m, so a 16-pixel block is 25 cm. Build items life-size: in the world, the game draws anything whose longest side is under a quarter of a tile (`ITEM_MIN_SIZE` in `config.js`) bigger, so it can be seen from across a room.
- **Orientation:** +Y is always up. For things you hold, the pivot (0, 0, 0) is where the hand grips and the tip or head points up. On weapons, the cutting edge or striking face points north (−Z), which the swing animation depends on. The sconce's pivot sits on the wall, and it stands out to the south (+Z). Props sit on the floor with their pivot in the middle and their front facing south (+Z); solid props block movement across their bounding box (the barrel is treated as round). Floor items bob and spin about their pivot, which should be their middle.
- **Textures** must stay embedded in the project file, which is Blockbench's default. The game ignores texture file paths.
- **New weapons:** give the `WEAPONS` entry a new `model` name and add `<name>.bbmodel` to the folder.

**Monster rigs.** A monster's moving parts are groups, and the game animates them by turning and shifting each group about its pivot, so put a group's pivot on its joint. The code finds them by name (see `monsters/models.js`):

- Bipeds (goblin, archer, skeleton, orc, imp, troll, golem, Warden): `body` (pivoting at the hips) holds `head` and `arm_left`/`arm_right` (at the shoulders), with `leg_left`/`leg_right` beside it. The weapon belongs in `arm_right`, pointing forward (+Z) from the hand. The imp adds `wing_left`/`wing_right`.
- The shopkeeper (see `world/shopkeeper.js`) has `body` holding `head`, `arm_left` and `arm_right`, and a `purse` group in the right hand that swings as it's shaken. The stool isn't in a group, so it stays put.
- The rat has `body`, `tail` and `leg_front_left`, `leg_front_right`, `leg_back_left` and `leg_back_right`. The bat has `body` holding `wing_left`/`wing_right`, the slime a single `blob` squashed about its base, and the wraith `body` holding `arm_left`/`arm_right`.

Animations add to each group's pose in Blockbench, so a limb you rotate there stays rotated in the game. Monsters face south (+Z) with their origin between their feet. Each one gets its own copy of the lit materials so it can flash red when hurt.

These models were first built in code by `tools/modelgen/`. It shapes low-poly meshes from lathes and lofts, unwraps their UVs automatically and paints pixel-art textures procedurally. `npm run models -- sword torch` rebuilds the named models, and `all` rebuilds every one. Rebuilding replaces the whole file, so any Blockbench edits to it are lost. The script skips a file with uncommitted changes unless you pass `--force`, and `--out <dir>` writes the results somewhere else so you can compare first. To add a model, write a builder like those in `items.mjs`, `monsters.mjs`, `props.mjs`, `sewers.mjs`, `catacombs.mjs`, `caves.mjs` or `sconce.mjs` and list it in `build.mjs`.

## Code map

```
src/
  config.js            world scale, themes and floors, boss/shop/shrine floors, the danger curve, tuning constants
  game.js              run lifecycle, level transitions, rendering, interaction, traps, endings
  player.js            movement, attack meter, stats, statuses, hunger/regen, inventory
  combat.js            player melee resolution
  hotbar.js            hotbar bindings and what each slot does when pressed
  input.js / audio.js  pointer-lock input; WebAudio synth sfx + ambient drone
  dungeon/generator.js pure data: plans the loop and branches, lays out rooms, routes corridors, populates (seeded)
  dungeon/rooms.js     room types (entrance, exit, standard, vault, shrine, shop): sizes, door style, furnishing
  dungeon/tiles.js     tile types
  dungeon/levelBuilder.js  merged wall/floor/ceiling geometry with baked corner AO, stairwells, wall lights, doors
  dungeon/roughRock.js  rough-hewn rock: splits surfaces into pieces and moves them with 3D noise, flat by doors and fittings
  dungeon/props.js     loads Blockbench furniture on demand and places it: meshes, obstacles, item slots, candles, glows, drips
  dungeon/decor.js     decorations by theme style, set about the rooms clear of doorways
  dungeon/channels.js  trenches across rooms, crossed by bridges: the Sewers' water channels, the Catacombs' spike pits, the Caves' chasms
  dungeon/textures.js  procedural canvas textures per theme
  dungeon/sewerTextures.js  the Sewers' own textures: brickwork, cobbles, vault, channel sides, water, puddles
  dungeon/catacombTextures.js  the Catacombs': ashlar walls, flagstones, vault, pit sides and floor, cobwebs
  dungeon/caveTextures.js  the Caves': layered rock with cracks, veins and seeps, gritty floor, vault, chasm sides
  dungeon/texturePaint.js  helpers the themes' textures are painted with
  world/level.js       runtime level: collision, line of sight, doors, BFS flow field, fog of war, spawning
  world/shopkeeper.js  the shop's merchant: idle animation and remarks
  monsters/defs.js     bestiary stats, the floors each monster appears on, spawn tables
  monsters/monster.js  AI state machine (sleep → wander → hunt, fear, ranged kiting), attacks, statuses
  monsters/models.js   loads the rigged Blockbench monsters and animates their bones
  items/defs.js        item catalog and unidentified appearances
  items/identify.js    per-run appearance shuffle, naming, descriptions
  items/generate.js    random items by depth, enchant/curse rolls, shop stock and prices
  items/use.js         potions, scrolls, wands, equip/curses, throwing, artefact powers
  items/models.js      loads the weapon and item models, tinting each item in its colour
  items/bbmodel.js     loads Blockbench .bbmodel projects (cubes, meshes, groups, textures) into three.js
  fx/                  viewmodel (hands), pixel-art flames, projectiles, particles, drips, glow sprites
  ui/ui.js             HUD, minimap, message log, floating text, pack, dialogs, title and end screens
  ui/logo.js           the pixel-art title logo, drawn from hand-made glyphs, with its moving glint
  ui/titleScene.js     the walk through a floor of each theme behind the title screen
  ui/devTools.js       the dev tools panel (the ` key): travel, stats, items and monsters for testing
assets/models/         Blockbench models: monsters/, npcs/, weapons/, items/, props/, the hand torch and the wall sconce
tools/modelgen/        builds those models from code (npm run models)
```

Balance numbers live in `monsters/defs.js`, `items/defs.js` and `config.js`. `window.game` is exposed for poking at state from the dev console.

## Possible next steps

- Save on exit (serialise the level map and player to localStorage) for proper roguelike permadeath-with-resume
- Specialist side rooms behind locked doors (treasuries, libraries, armouries), secret doors
- More furniture for other room types
- More level shapes: caves via cellular automata, flooded rooms, chasms that drop you a floor
- Mimics, splitting oozes, invisible stalkers, thieves who steal and teleport away
- A shield/block action, and alchemy or crafting for spare potions
- Music, and positional audio for monsters you can hear but not see
