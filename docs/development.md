# Development

Running, building and publishing the game, the dev tools, and where everything is in the code. [All the docs](README.md)

## Running and deploying

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, deployable anywhere
```

The build is plain static files with relative paths (`base: './'` in `vite.config.js`), so it works from any folder on any static host. Pushing to `master` publishes it to GitHub Pages (`.github/workflows/deploy.yml`) at https://astrodogedx.github.io/Depths-of-Yendor/. For that, the repo's Settings → Pages → Build and deployment → Source must be set to **GitHub Actions**. The workflow can also be run by hand from the Actions tab. Add `?dev` to the address to get the dev tools in a published build.

Every build stamps itself with when it was built and from which commit, and on GitHub with the deploy workflow's run number, which counts up with every publish (`vite.config.js`, read by `src/build.js`). The title screen shows it in its bottom-right corner, "Build 42 · 26 Sep 2026, 14:05 UTC" (UTC, so it reads the same for everyone; hover it for the commit). A build made on your own machine says "Local build", and the dev server "Development build".

A shared link to the site shows a preview card (Open Graph tags in `index.html`, which X's cards fall back on too): the title, a line about the game, and `public/og-image.png`, the title screen at 1200×630. Previews need absolute addresses, so the tags name the published site: change them if it moves. The tab's icon is the logo's gold Y (`public/favicon.svg`, with a 32 px PNG for browsers that want one and a 180 px `apple-touch-icon.png` for home screens). Everything in `public/` is copied into the build as it is.

## Dev tools

For testing by hand, press **`** (the key left of 1) during a run to open the dev tools panel. It's always there under `npm run dev`. A built copy has it only when opened with `?dev` in the address (e.g. `http://localhost:4173/?dev`), and players who don't ask for it never download it (`ui/devTools.js` loads on demand from `main.js`). The game waits while the panel is open. Press ` or Esc to close it.

- **Travel:** jump straight to any of the 25 floors, arriving at its entrance as if you'd walked down (boss floors are marked red, shop floors gold). **New layout** builds the floor you're on again from a new seed, for a quick look at another layout. **Reveal map** maps the whole floor and shows its hidden traps, and **To the stairs down** puts you at its exit.
- **You:** god mode (nothing can hurt you), health and maximum health, strength, levelling up, gold, **Restore** (full health and stamina, fed, every status cleared) and **Kill every monster**.
- **Items:** make any weapon, off-hand thing (the torch), armour, potion, scroll, wand, ring, artefact or food, or the Amulet, or an iron or gold key for this floor, with the +N (a charge more each, for a wand), quantity, curse (none, weakened or full), enchantment and identification you choose. It goes in your pack, or on the floor in front of you when the pack is full. **Identify everything** teaches you every potion, scroll, wand and ring, and identifies what you carry.
- **Monsters:** spawn any monster a few steps in front of you, awake or asleep. The mimic comes awake, as a monster: to meet one passing for a chest, use *Chests*.
- **Traps:** lay a trap of any kind on the floor in front of you, found and armed, to step on.
- **Chests:** set a chest, a locked chest or a mimic (passing for a chest) down in front of you, facing you, holding what one on this floor might.
- **Statuses:** give yourself, or the monster you're facing, any status for 15 s, as it would happen in play (immunities and how statuses meet included).

## Code map

```
src/
  config.js            world scale, themes and floors, boss/shop/shrine floors, the danger curve, tuning constants
  build.js             which build this is (stamped in by vite.config.js), for the title screen and saves
  game.js              run lifecycle, level transitions, rendering, interaction, traps, endings
  player.js            movement, attack meter, stats, grip, torchlight, statuses, hunger/regen, inventory
  combat.js            player melee resolution
  damage.js            damage types (physical, magic and the elements) and the resistances to them
  status.js            statuses for the player and monsters alike: what they do, what wards them off, how they meet
  hotbar.js            hotbar bindings and what each slot does when pressed
  input.js / audio.js  pointer-lock input; WebAudio synth sfx + ambient drone
  save.js              the saved run in local storage, and the helpers floors are saved with
  dungeon/generator.js pure data: plans the loop and branches, lays out rooms, routes corridors, populates (seeded)
  dungeon/rooms.js     room types (entrance, exit, standard, vault, shrine, shop): sizes, door style, furnishing
  dungeon/tiles.js     tile types
  dungeon/levelBuilder.js  merged wall/floor/ceiling geometry with baked corner AO, stairwells, wall lights, doors
  dungeon/roughRock.js  rough-hewn rock: splits surfaces into pieces and moves them with 3D noise, flat by doors and fittings (and in built rooms)
  dungeon/props.js     loads Blockbench furniture on demand and places it: meshes, obstacles, item slots, candles, glows, drips
  dungeon/decor.js     decorations by theme style, set about the rooms clear of doorways, and along the passages (the Caves' timber sets)
  dungeon/channels.js  trenches across rooms, crossed by bridges: the Sewers' water channels, the Catacombs' spike pits, the Caves' chasms, the Ruins' rifts, the Underworld's lava
  dungeon/pools.js     pools of standing water a step down, grown as blobs that run together, and flooded rooms
  dungeon/textures.js  procedural canvas textures per theme
  dungeon/sewerTextures.js  the Sewers' own textures: brickwork, cobbles, vault, channel sides, water, puddles
  dungeon/catacombTextures.js  the Catacombs': ashlar walls, flagstones, vault, pit sides and floor, cobwebs
  dungeon/caveTextures.js  the Caves': layered rock with cracks, veins and seeps, gritty floor, vault, chasm sides
  dungeon/dwarvenTextures.js  the Dwarven Ruins': porphyry, gold frieze and dado, inlaid marble, coffers, rift sides and glow
  dungeon/underworldTextures.js  the Underworld's: black brick and glowing runes, veined tunnels, basalt, crystal vault, lava
  dungeon/poolTextures.js  each theme's pool water, painted from its colours in config.js
  dungeon/texturePaint.js  helpers the themes' textures are painted with
  world/level.js       runtime level: collision, line of sight, doors, chests (and mimics passing for them), BFS flow field, fog of war, spawning
  world/shopkeeper.js  the shop's merchant: idle animation and remarks
  world/trapModels.js  the traps' models: their armed, active and used states, and how they move going off
  monsters/defs.js     bestiary stats, the floors each monster appears on, spawn tables
  monsters/monster.js  AI state machine (sleep → wander → hunt by sight or by ear, fear, ranged kiting), allies and brawls, attacks
  monsters/models.js   loads the rigged Blockbench monsters and animates their bones
  items/defs.js        item catalog and unidentified appearances
  items/identify.js    per-run appearance shuffle, naming, descriptions
  items/generate.js    random items by depth, their + and curses, what's in chests, shop stock, what things are worth
  items/enchant.js     Enchantments and Curses of ___ on weapons and armour, and what a curse's strength means
  items/use.js         potions, scrolls, wands, equip/curses, grip and off-hand use, throwing, artefact powers
  items/models.js      loads the weapon and item models, tinting each item in its colour
  items/bbmodel.js     loads Blockbench .bbmodel projects (cubes, meshes, groups, textures) into three.js
  fx/                  viewmodel (hands), pixel-art flames, projectiles, particles, drips, ripples round waders, haze over channels (the rifts' miasma, the lava's embers), glow sprites
  ui/ui.js             HUD, minimap, message log, floating text, pack, dialogs, title and end screens
  ui/logo.js           the pixel-art title logo, drawn from hand-made glyphs, with its moving glint
  ui/titleScene.js     the walk through a floor of each theme behind the title screen
  ui/devTools.js       the dev tools panel (the ` key): travel, stats, items and monsters for testing
assets/models/         Blockbench models: monsters/, npcs/, weapons/, items/, props/, the hand torch and the wall sconce
tools/modelgen/        builds those models from code (npm run models)
public/                copied into the build as it is: the favicon, and the picture a shared link shows
docs/                  these docs
```

Balance numbers live in `monsters/defs.js`, `items/defs.js` and `config.js`. `window.game` is exposed for poking at state from the dev console.

## Possible next steps

- Specialist side rooms behind locked doors (treasuries, libraries, armouries), secret doors
- More furniture for other room types
- More level shapes: caves via cellular automata, chasms that drop you a floor, rooms designed round their pools (a flooded crypt, a cistern, a bathhouse)
- Splitting oozes, invisible stalkers, thieves who steal and teleport away
- A shield/block action, and alchemy or crafting for spare potions
- Music, and positional audio for monsters you can hear but not see
