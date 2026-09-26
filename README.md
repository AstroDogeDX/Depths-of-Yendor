# Depths of Yendor

A first-person, real-time roguelike for the browser, in the spirit of **King's Field** (slow, deliberate first-person melee in dark stone corridors) crossed with **Rogue / Pixel Dungeon** (procedural floors, unidentified items, curses, permadeath). Built with three.js and plain ES modules. The dungeon, its textures and the sound are generated in code. The monsters, the shopkeeper, the weapons, the torch, the lights on the walls, the shop's furniture and the items you find are Blockbench models (see [Blockbench models](#blockbench-models)).

Descend 25 floors and take the **Amulet of Yendor** from its Warden. Then choose: invoke the Amulet and escape at once, or carry it back up through every floor to the surface for double score while the dungeon throws everything it has at you.

## Running

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, deployable anywhere
```

The build is plain static files with relative paths (`base: './'` in `vite.config.js`), so it works from any folder on any static host. Pushing to `master` publishes it to GitHub Pages (`.github/workflows/deploy.yml`) at https://astrodogedx.github.io/Depths-of-Yendor/. For that, the repo's Settings → Pages → Build and deployment → Source must be set to **GitHub Actions**. The workflow can also be run by hand from the Actions tab. Add `?dev` to the address to get the dev tools in a published build.

Every build stamps itself with when it was built and from which commit, and on GitHub with the deploy workflow's run number, which counts up with every publish (`vite.config.js`, read by `src/build.js`). The title screen shows it in its bottom-right corner, "Build 42 · 26 Sep 2026, 14:05 UTC" (UTC, so it reads the same for everyone; hover it for the commit). A build made on your own machine says "Local build", and the dev server "Development build".

A shared link to the site shows a preview card (Open Graph tags in `index.html`, which X's cards fall back on too): the title, a line about the game, and `public/og-image.png`, the title screen at 1200×630. Previews need absolute addresses, so the tags name the published site: change them if it moves. The tab's icon is the logo's gold Y (`public/favicon.svg`, with a 32 px PNG for browsers that want one and a 180 px `apple-touch-icon.png` for home screens). Everything in `public/` is copied into the build as it is.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move; ← → turn (King's Field style) |
| Shift | Sprint: 1.6× speed, but loud (uses stamina) |
| C | Sneak on/off: half speed, crouched and near-silent (uses stamina); creeps over found traps without setting them off. Sprinting, or running out of stamina, ends it |
| Mouse | Look (click the view to capture the pointer) |
| Click / Space | Attack. Click swings once the meter is past 20%; holding re-swings only at full charge |
| E | Pick up / use stairs |
| I or Tab | Pack (click or ↑↓ select, double-click or Enter use, T throw, D drop) |
| M | Full map |
| 1–6 | Hotbar slots (see below) |
| F | Grip your weapon in both hands, or back in one (see *Off hand and two hands*) |
| Right-click | Use what's in your off hand, or, gripping your weapon in both hands, its special (none yet) |
| Q | Drink a potion you *know* is healing |
| R / T | Active power of artefact slot 1 / 2 |
| P | Cycle internal render resolution (270p → 360p → 540p → native) |
| Esc | Pause (the pause panel can also save and quit to the title) |
| ` | Dev tools (see below; only in development, or with `?dev` in the address) |

## Dev tools

For testing by hand, press **`** (the key left of 1) during a run to open the dev tools panel. It's always there under `npm run dev`. A built copy has it only when opened with `?dev` in the address (e.g. `http://localhost:4173/?dev`), and players who don't ask for it never download it (`ui/devTools.js` loads on demand from `main.js`). The game waits while the panel is open. Press ` or Esc to close it.

- **Travel:** jump straight to any of the 25 floors, arriving at its entrance as if you'd walked down (boss floors are marked red, shop floors gold). **New layout** builds the floor you're on again from a new seed, for a quick look at another layout. **Reveal map** maps the whole floor and shows its hidden traps, and **To the stairs down** puts you at its exit.
- **You:** god mode (nothing can hurt you), health and maximum health, strength, levelling up, gold, **Restore** (full health and stamina, fed, every status cleared) and **Kill every monster**.
- **Items:** make any weapon, off-hand thing (the torch), armour, potion, scroll, wand, ring, artefact or food, or the Amulet or an iron key for this floor, with the +N (a charge more each, for a wand), quantity, curse (none, weakened or full), enchantment and identification you choose. It goes in your pack, or on the floor in front of you when the pack is full. **Identify everything** teaches you every potion, scroll, wand and ring, and identifies what you carry.
- **Monsters:** spawn any monster a few steps in front of you, awake or asleep.
- **Traps:** lay a trap of any kind on the floor in front of you, found and armed, to step on.
- **Statuses:** give yourself, or the monster you're facing, any status for 15 s, as it would happen in play (immunities and how statuses meet included).

## The pack

The left of the pack shows a paper doll of what you have equipped: weapon in hand, what's in your off hand (the torch), armor on the chest (tinting the figure), two rings and two artefact attunements. A weapon gripped in both hands is marked *2H*, and what's in your off hand meanwhile *stowed*. A known curse gives the slot a red border. Clicking a filled slot selects that item. Selecting something you haven't equipped highlights the slot it would go into. Underneath are your derived stats (damage and its type, recovery, reach, defense, speed, strength), with anything too heavy for you shown in red. An unidentified weapon's + stays hidden: its damage shows as *(+?)*. A curse on it you don't know of stays hidden too.

## Off hand and two hands

Your weapon is in your main hand, and your other hand holds an **off-hand** thing: for now, only the **torch** you start with. Shields, throwing weapons, a bow and more are to come (`OFFHANDS` in `items/defs.js`). It's equipment like any other: **Put away** in the pack stows it with your things, **Hold** takes it back up, and you can drop it, or sell it (for next to nothing).

- **The torch is your light.** Held up, it lights the way as it always has. Without one in hand, only the floor's own dim light and the sconces show you anything.
- **F grips your weapon in both hands**, or takes it back into one. Every weapon can be gripped this way, and in both hands it needs **2 less strength** (`TWO_HAND_STR` in `config.js`): a war hammer, which needs 17, needs 15. So a weapon too heavy for you is less so: at 12 strength, the war hammer recovers in 2.7 s instead of 3.2, and its penalty to hit drops from 40% to 24%, while a long sword (14) is no longer too heavy at all. And one you're strong enough for hits harder, as strength beyond what a weapon needs always does: a short sword's 3–8 becomes 3–10. The price is what's in your off hand.
- **In both hands, the weapon takes a two-handed pose** (there are no hands to show yet). A sword, axe, mace or hammer is held from the off-hand side, as if your left hand held it and your right guided it: it rises diagonally across your body, and swings higher and further. A spear comes in nearer the middle, braced low from your right hip, and is driven further home. A dagger is held out before you in both hands, and jabbed forward with both arms. Both point straight at the crosshair all through the thrust, their flats turned toward you (`KEYS_2H` in `fx/viewmodel.js` gives a weapon a pose of its own).
- **Two hands stow what's in your off hand.** You can't use it, and the torch hangs at your belt, lighting far less (45%) from lower down. Taking something in your off hand takes your weapon back into one, and so does putting your weapon away.
- **Changing grip empties your attack meter**, as changing equipment does.
- **Right-click** uses what's in your off hand, if it has a use (the torch has none but its light), or, while you grip your weapon in both hands, the weapon's two-handed special (none yet). Each goes in `OFFHAND_USES` or `TWO_HAND_SPECIALS` in `items/use.js`.

Wands no longer have a key of their own: put them on the hotbar.

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
- **Clocks tick in seconds.** Hunger, regeneration, status effects, wand recharge and ring identification all run on real time. The world pauses while the pack or map is open, but drinking, eating, throwing, changing equipment or changing grip empties your attack meter, so doing it mid-fight still costs a swing.
- **Paralysis means paralysis.** While paralysed (or frozen) you can't use items (from the pack or the hotbar), pick things up, take stairs or invoke artefacts. Only the map stays available.
- **Identification is per run.** Potion colours, scroll labels, wand woods and ring gems are reshuffled from the seed. Potions reveal themselves when drunk, and throwing a potion identifies it if the splash does something visible. Weapons and armour reveal their + after enough hits, and any Enchantment or Curse of ___ as soon as you put them on. Rings reveal themselves after about 100 s of wear. A wand shows what kind it is the first time its spell does something you can see, but its + and its charges only after 3 zaps.
- **Curses.** About 16% of weapons and armour, a fifth of rings and an eighth of wands are cursed. See *Curses, upgrades and enchantments* below.
- **Persistent floors.** Levels are kept when you leave, so you can go back up, and they're saved with the run (see *Saving*). The dungeon also restocks itself slowly, and fast and angrily once you carry the Amulet.

## What's in it

- **25 floors in 5 themes** of five floors each: Sewers, Catacombs, Caves, Dwarven Ruins and the Underworld. Seeded layouts with pillared halls, wall sconces, doors and hidden traps (spike, poison gas, teleport, alarm). See *The dungeon* and *Floors and doors* below.
- **12 monsters:** rat, bat, ooze, goblin, goblin archer, skeleton, orc, wraith, fire imp, troll, stone golem, and the **Warden of Yendor**, who fires bolt volleys and raises the dead at half health.
- **Items:** 7 weapons with different reach, speed and damage types (spears out-reach swords, hammers hit hard but recover slowly), each to be gripped in one hand or both, the torch in your off hand, 5 armours with strength requirements, 10 potions, 10 scrolls, 5 wands, 6 rings, food.
- **A shop** on the first floor of each theme after the first (floors 6, 11, 16 and 21). See *The shop* below.
- **6 artefacts**, 5 per run in guarded shrines on the third floor of each theme (3, 8, 13, 18 and 23): Chalice of Crimson Thirst (lifesteal), Eye of the Deep (see all monsters and traps), Horn of Thunder (stun blast), Cloak of Shadows (invisibility), Boots of the Wind (speed), Emberheart (burning strikes, fire immunity). You have two attunement slots.
- A title screen that walks you through a floor of each theme in turn, down the stairs from one to the next.
- A Rogue tombstone when you die. Seeds are shareable.

## Damage types

Every source of damage has a type (`damage.js`), physical or magical. Only starvation and bleeding have none.

**Physical.** Every melee blow deals one of three kinds of physical damage: **slash** (the swords and the battle axe), **stab** (the dagger and the spear, which thrust rather than swing) or **bash** (the mace, the war hammer and your fists). A weapon's description and the pack's stats say which. Monsters' blows work the same way. Goblin archers' arrows stab, as do spike traps. A weapon or monster that doesn't give a type deals generic physical damage.

**Magical.** There's raw **magic** and five elements:

| Type | Comes from now | Notes |
| --- | --- | --- |
| Magic | the wand of magic missile, wraiths' and the Warden's bolts, the Horn of Thunder's blast | non-elemental magic |
| Fire | the wand of firebolt, liquid flame, fire imps' fireballs, burning | fire hits set you burning; being immune to fire means you can't burn |
| Ice | the wand of frost | chills, and freezes what's wet (see *Statuses*); being immune to ice means you can't be chilled or frozen |
| Lightning | the wand of lightning | |
| Poison | being poisoned (potions, gas traps, oozes) | being immune to poison means you can't be poisoned |
| Holy | nothing yet | holy light, for use against the undead and the cursed |

A wand's description says which type it deals. Magical damage numbers take the type's colour: violet magic, orange fire, blue ice, yellow lightning, green poison, and white holy light with a golden glow.

**Resistances.** Monsters, armour and artefacts can resist a type or be weak to it. `resist` in a monster's entry in `monsters/defs.js`, or an armour's or artefact's in `items/defs.js`, maps types to multipliers on the damage that gets through (after armour's defense has taken its share). For example, `{ slash: 0.5, fire: 1.5 }` takes half from blades and half as much again from fire, and 0 makes it immune. A resisted hit always does at least 1 unless it's immune. Your resistances multiply together from your armour and the artefacts you're attuned to: Emberheart's `{ fire: 0 }` is how it makes fire harmless. A weapon's type is its `dmgType` in `items/defs.js`, as is a wand's. A monster's is its `dmgType` in `monsters/defs.js`, and its `ranged` attack has its own.

Each armour turns some blows better than others, as its description says. The table gives the damage you take:

| Armour | Slash | Stab | Bash |
| --- | --- | --- | --- |
| Leather | +15% | | −15% |
| Studded leather | −15% | +15% | |
| Chain mail | −30% | +20% | +20% |
| Splint mail | −20% | +15% | −10% |
| Plate | −30% | −20% | +25% |

Each monster's blows fit what it fights with, and most resist some kinds of damage or are weak to others. The table gives the damage it takes:

| Monster | Attacks | Slash | Stab | Bash | Magic and elements |
| --- | --- | --- | --- | --- | --- |
| Giant rat | stab (bite) | | | | |
| Cave bat | stab (bite) | +25% | | | |
| Green ooze | bash | +25% | −25% | −50% | fire +25%, poison immune |
| Goblin | slash (short blade) | | | | |
| Goblin archer | stab (arrows), bash (its bow, up close) | | | | |
| Skeleton | slash (sword) | −25% | −50% | +50% | holy +50%, poison immune |
| Orc | slash (axe) | | +25% | | |
| Wraith | slash (claws), magic (bolts) | | −50% | −25% | holy +100%, ice −50%, poison immune |
| Fire imp | slash (claws), fire (fireballs) | | +25% | | ice +50%, holy +50%, fire immune |
| Troll | bash (club) | | +25% | −25% | fire +50% |
| Stone golem | bash (fists) | −50% | −50% | +50% | magic +25%, fire −50%, lightning −50%, poison immune |
| Warden of Yendor | slash (halberd), magic (bolts) | −30% | −20% | +25% | holy +25%, fire immune |

So a mace is the answer to skeletons, golems and the Warden but little use against oozes, wraiths and trolls. A spear or dagger runs through orcs, imps and trolls, but not the undead. Fire is the troll's bane, and magic is the golem's. Carrying a second weapon, and the right wand, pays. The dev tools' monster buttons list these as tooltips.

You can see when a type matters. A hit on a monster's weakness shows a bigger number tagged **WEAK!**, and a melee hit on a weakness lands with a crunch. A resisted hit shows a smaller number tagged **RESISTED**, and a resisted melee hit lands with a dull clank. For physical hits the number itself turns orange or grey. A monster immune to the damage shows **IMMUNE**, including when you try to poison or burn it. Burning and poison ticks aren't tagged; the hit that started them was. The first time in a run you see a kind of monster resist a type or be weak to it, the log says so, e.g. "The troll is weak to fire!" or "Poison can't harm the skeleton!". A hit on one of your armour's weaknesses is tagged **WEAK SPOT**, and one it resists is tagged **RESISTED**.

## Curses, upgrades and enchantments

Equipment has a **+N** (never below 0), which the scroll of **upgrade** raises. A weapon or armour can also have an **Enchantment of ___**, or a **Curse of ___**, but not both (`items/enchant.js`: the effects there so far are a first few).

Now and then a weapon or armour you find is already enchanted: about 5% of those that aren't cursed on the first floor, rising to about 10% on the last. A wand you find may have a +, as often as a weapon does. The shop's weapons and armour are never enchanted, and its wands never have a +.

You learn an Enchantment or Curse of ___ the moment you put the thing on ("Power stirs in the long sword: an Enchantment of Flames!"), and so, with an enchantment, that it's free of curses. Its + you only learn by using it (or a scroll of identify).

**Curses** come in two strengths (`item.curse`):

- **Full:** a cursed weapon, armour or ring binds itself to you once you put it on, and a weapon or armour has a Curse of ___ (clumsiness, frailty, burden, clamour...). A weapon's or armour's + still counts as normal. A cursed ring's + works *against* you instead: a cursed ring of protection +1 is −1 defense until the curse is lifted.
- **Weakened:** it comes off, but its Curse of ___ (or a ring's reversal) remains.

**Cursed wands** misfire. They don't cast their own spell, but some wand's bolt at random: missile, firebolt, frost or teleport other, never a line like lightning. A fifth of the time that fizzles, wasting the charge. Otherwise it flies as a wild, green, flickering bolt carrying that spell, or, while the curse is full, a quarter of the time the spell turns on you. The first misfire tells you the wand is cursed.

What you know shows in its name: "(cursed)", "(curse weakened)", or "(uncursed)" when you know it's clean but nothing more.

The scrolls:

| Scroll | On | Does |
| --- | --- | --- |
| Upgrade | a weapon, armour, ring or wand | +1, and a wand gains a charge. On anything cursed it goes into the curse instead: a full curse is weakened (a fifth of the time lifted outright), and a weakened one is lifted |
| Enchantment | a weapon or armour free of curses | a random enchantment, in place of any it had; identifies it. On something with a curse you didn't know of, the magic recoils and shows you the curse |
| Remove curse | one item that might be cursed | lifts any curse, and either way marks it clean. Things you know are clean aren't offered |

**Wands** keep their + and their charges to themselves until you know them: 3 zaps (misfires count), or a scroll of identify. Until then the hotbar shows **?** for its charges. Once you know it, the hotbar shows its charges, and an empty wand counts down the seconds to the next. Either way, while a wand is short of charges, a bar under its slot fills toward the next one, and its description says it's recharging. A charge returns every 55 s at +0, a tenth faster for each + (to no faster than every 27.5 s). Each + also adds a charge, and 2 to both ends of a damaging wand's damage, which its description shows once you know the wand.

## Statuses

Statuses afflict you and monsters alike, by one set of rules (`status.js`): what each does, what wards it off, and how they meet.

- **Showing them.** Yours show under your health, with the seconds left. The monster you're facing lists its own beside its name. Some also show as a colour on the monster, and a word pops up over it as they take hold.
- **Bosses** take any hostile status for half as long.
- **Floors you've left** stand still, since only the one you're on runs. When you come back, its monsters' statuses have worn down by the time you were away, without doing their damage.

| Status | Comes from | Does |
| --- | --- | --- |
| Burning | fire hits (the wand of firebolt, liquid flame, fire imps), Emberheart's strikes | fire damage every second |
| Poisoned | poison potions and gas traps, oozes' hits | poison damage every second, and you don't heal |
| Bleeding | nothing yet | damage every second that armour and resistances don't reduce, and you don't heal. The bloodless (skeletons, wraiths, golems, oozes) can't bleed |
| Chilled | the wand of frost | you move at 60% speed, and your weapon recovers a quarter slower; monsters move and strike at half speed |
| Frozen | cold on something wet, or on an ooze | frozen stiff: it can't move or act, a frozen monster takes a blow as if unaware (double damage), and it loses every resistance (weaknesses stay). A thaw leaves 4 s of Chilled |
| Wet | nothing yet (wading, to come) | won't burn, and lightning does half as much damage again |
| Oiled | nothing yet (oil flasks and traps, to come) | fire does half as much damage again, and set alight, it burns twice as long |
| Paralysed | paralysis potions, the Horn of Thunder | as Frozen, but its resistances stay |
| Weakened | nothing yet | you: 3 less strength. A monster: 3/4 of its damage and of its health |
| Confused | confusion potions | you stagger. Monsters stagger, shoot wide, and half the time lay into another monster in reach |
| Blind | potions of darkness | you see almost nothing; a monster sees only about a tile around it, so it hunts by ear (below) |
| Feared | scrolls of terror | monsters run from you |
| Charmed | nothing yet | you can't fight: no swinging, zapping, throwing or Horn. A monster takes your side (see *Allies* below); a boss just stops fighting. Striking a charmed monster breaks the charm |
| Smitten | nothing yet (the Bard, to come) | monsters only: a charm that never wears off. On a boss it's an ordinary charm |
| Heartbroken | a charm ending, or broken | no charm takes. 60 s for you, 30 s for a monster |
| Hasted, Mind vision, Invisible | their potions, the Cloak of Shadows | yours only: you're faster, you sense every monster on the floor, monsters lose track of you |
| Hunted | carrying the Amulet (not timed) | every monster on the floor knows where you are, even while you're invisible (but they can't strike what they can't see) |

How they meet (`afflict` in `status.js`):

- **Water puts out fire,** and nothing wet will burn.
- **Cold puts out fire, and heat drives out cold.** Setting something chilled or frozen alight thaws it instead, and chilling something that's burning douses it instead. A fire hit on something frozen thaws it and does its full damage.
- **Cold on something wet freezes it solid,** as does wetting something chilled. Oozes are `fluid` (a trait in `monsters/defs.js`), so cold alone freezes them.
- **A charm leaves its target Heartbroken,** whether it wears off or is broken, and nothing heartbroken can be charmed.
- **Immunity to a damage type wards off its status.** A resistance of 0 to fire, poison or ice (the fire imp to fire, Emberheart's wearer, the undead to poison) means no burning, no poison, or no chill or freezing.

**Allies.** A charmed or smitten monster fights for you. It keeps near you, and goes for any monster in sight that's hunting you or fighting it, while leaving sleepers and wanderers be. Hostile monsters turn on an ally that strikes them or comes within a few metres. Any monster struck by another holds a grudge for 8 s, so a confused one's wild blows start brawls too. Striking a monster yourself pulls it back onto you for as long.

- **Your attacks spare your allies.** Your sword goes for an enemy in reach before an ally. Your bolts, the lightning wand and the Horn pass them by, and so do your allies' own shots. Enemies' shots can hit them. Splashes and fire catch everyone.
- **Striking an ally** (or a charmed boss) breaks its charm, and it turns on you.
- **Kills:** what your allies kill (or a brawl does) counts as yours, experience and all. An ally that falls counts as nothing.
- **Charmed allies stay on their floor** when you take the stairs. That floor stands still while you're away, but its charms still wear off by the time you come back (see above).

**Hunger** has three stages:

- **Hungry:** a warning.
- **Famished** (below 80 of 1,000): your wounds stop healing.
- **Starving** (at 0): you lose 1 health every 3 s and move slower.

**Hunting by ear.** A monster knows where you are only while it can see you (or while you're Hunted).

- When it hears you, it goes to where the sound came from. Footsteps, the alarm trap and a scroll of aggravate monsters all count.
- When it loses sight of you, it goes to where it last saw you.
- Either way, it looks around when it gets there and heads for anything else it hears.
- It gives up after 12 s with no sign of you. A boss never gives up.

## Stamina, sprinting and sneaking

Stamina is a separate bar from the attack meter and is never spent on swings. It drains only while you're *moving* in a mode: sprinting uses 22 a second, sneaking 9. Sprinting or sneaking while standing still is free. It refills (18 a second, half as fast again standing still) after a short pause. Run it dry and you're *Winded*: no sprinting or sneaking until it's back to 30%. It stands you up out of a sneak too, so tap C again once you've got your breath back. You start with 100, and gain 10 more per level.

- **Noise.** Your footsteps carry by walking distance, round corners but not through walls: about 6 m walking, 16 m sprinting, 1.5 m sneaking, and nothing standing still. Heavy armour is a quarter louder. A sprint can wake monsters in neighbouring rooms.
- **Hearing and searching.** A monster that hears you comes *searching* (a **?**). Only when it actually sees you does it become fully aware (a **!**). Until then it can still be struck unaware.
- **Sneaking up on sleepers.** Sleepers wake mostly to footsteps, or to someone standing right over them, and sneaking cuts both. In testing, sneaking up to within 2 m of a sleeper woke it about 14% of the time, against about 75% for walking up.

**Esc and fullscreen:** fullscreen is on by default (see the title screen or pause panel). In Chrome and Edge it also uses Keyboard Lock for the game's keys (`GAME_KEYS` in `input.js`), Esc included, which has two effects:

- A browser shortcut made with one of those keys can't fire by accident (a slip onto Ctrl+W can't close the tab).
- A tap of Esc pauses the game and stays in fullscreen. Holding Esc down leaves fullscreen, as the browser says when fullscreen starts.

Firefox and Safari have no Keyboard Lock, so there Esc pauses and leaves fullscreen together, as it did before. No browser lets a page stop Esc from giving the mouse back, fullscreen or not: that's what pauses the game there.

## Saving

There's one run saved at a time, in the browser's local storage (`save.js`). It's saved:

- on reaching every floor,
- when you choose **Save and quit to title** on the pause panel,
- every minute of play,
- when the page is closed, reloaded or left, or hidden (another tab, minimised).

Writing to local storage is synchronous, so the save is done before the page is gone. There's no warning prompt on closing. **Continue** on the title screen picks the run up where it was left, down to the monsters mid-hunt. A new run while one is saved takes a second click, since it ends the saved one. Dying or winning deletes the save, so death is still permanent.

Floors are made from the seed, so a save keeps only what's changed on each floor you've been to:

- its monsters,
- the things lying in it or for sale,
- its doors and traps,
- how much of it you've mapped (`Level.snapshot`).

With you, your things and what you've learned, a run through all 25 floors saves as about 90 KB, in about 3 ms.

A save whose format is out of date (`SAVE_VERSION`) can't be continued. A floor saved before a change to how floors are laid out starts afresh rather than with things in its walls: each saved floor keeps a fingerprint of its layout to check against. Each save also records the build of the game that made it (`save.build`, see *Running*), though nothing reads it back yet.

## The dungeon

| Floors | Theme | Meant to be | Boss floor |
|---|---|---|---|
| 1–5 | Sewers | dank and wet | 5 |
| 6–10 | Catacombs | old jail cells, cages and chains | 10 |
| 11–15 | Caves | natural, rough-hewn rock | 15 |
| 16–20 | Dwarven Ruins | an ancient civilisation's halls, fallen apart | 20 |
| 21–25 | Underworld | hellish, demonic and hot | 25: the Warden of Yendor and the Amulet |

Each theme has four ordinary floors and a boss floor (`isBossDepth` in `config.js`). For now the boss floors are built like any other, except floor 25, which holds the Amulet's vault and its keeper, the Warden. Each theme has its own look (below).

**The Sewers** have slimy brick walls with a damp band and a tide mark along their foot, wet cobbled floors and a brick vault overhead (`dungeon/sewerTextures.js`). Two or three rooms on each Sewers floor have a **water channel** running straight across them from wall to wall (`channels` in the theme's entry in `config.js`). The murky water flows in through a barred grate in one wall and out through another, and one or two plank bridges cross it. Nothing can walk through water: players, walking monsters and dropped items all stay on the banks, and walking monsters path round by the bridges. Flying monsters (bats, wraiths) go straight over it, and anything they drop over the water lands on the nearest bank. You can still see and shoot across. A channel never blocks a doorway, and one that would cut off any part of the floor is never dug (`dungeon/channels.js`). You can hear the water running as you get near. Water drips from the drain pipes, and from the vault into puddles and channels, each drop landing with a spreading ring and a quiet plip (`fx/drips.js`). The rooms are dressed with drain pipes, pipes with valve wheels, rubble, barrels, floor drains and puddles (`dungeon/decor.js`). They keep clear of doorways and stairs, and sconces keep off walls that already have something on them.

**The Catacombs** are a tomb and a jail in one: heavy rough-hewn blocks, sooty under the vault and grey with bone dust at their feet, big worn flagstones, and a rough stone vault (`dungeon/catacombTextures.js`). The stone is cold grey, so torchlight and bone stand out warm against it. One or two rooms on each floor have a **spike pit** where the Sewers have a channel: the same trench, 1.5 m deep, its floor a thicket of rusted, blood-tipped spikes among the bones of whoever fell in, with a skull left on a spike here and there. Iron grating walkways cross the pits, and you can look down through them. The pits follow the channels' rules: you can't step in, walking monsters go round, and fliers pass over. The jail has barred cell doors set into the walls, shackles on chains (some still holding a slumped skeleton), and gibbet cages hung from the vault. The tomb has burial niches of skulls and bones, bone piles, stone sarcophagi with their lids pushed askew, clusters of candles whose flames flicker like the sconces', engraved grave slabs set in the floor, and cobwebs in the corners of the rooms. A hanging cage only goes where there's open floor all round it, so it never blocks a way through.

**The Caves** are natural rock that miners dug into and then abandoned. Every surface is rough-hewn: walls, floor, vault and pit sides are split into pieces about 0.7 m across, and a smooth noise field pushes each piece in or out. The walls bulge and lean, the vault sags, and the floor is a little uneven underfoot (`dungeon/roughRock.js`, switched on by `rough` in the theme's entry in `config.js`). The rock stays flat round doorways and stairs and behind anything fixed to a wall, so frames and fittings sit true. Collision still follows the tile grid. The walls are banded strata, cracked and threaded with pale veins and dark seeps, and the floor is rock, grit and pebbles (`dungeon/caveTextures.js`). One or two rooms on each floor have a **bottomless chasm** where the Sewers have a channel. Its sides fade into blackness, a cold wind moans up out of it as you get near, and it is crossed by a sagging rope bridge with a couple of planks missing, which holds, whatever it looks like. The chasms follow the channels' rules. The Caves have no sconces: torches in iron brackets are braced against the rock, and oil lanterns hang from wall arms (`lights` in the theme's entry). The miners left timber supports against the walls, minecarts of ore on lengths of rail (and loose rails), pickaxes, shovels and buckets, barrels and crates. The rock has seams of gold and copper ore, clusters of glowing blue crystals, heaps of fallen boulders, stalagmites rising from the floor, and stalactites that drip from the vault.

**The Dwarven Ruins** were the halls of a great dwarven kingdom of red stone and gold, which fell into ruin when the evil below broke through. The walls are polished red porphyry ashlar under a gilded cornice, with a frieze of dwarven knotwork in gold (looters have prised the gold out of some of it) above a dark panelled dado. The floors are inlaid in red and cream marble with lines of gold, and the vaults are coffered, a gold boss in each coffer (`dungeon/dwarvenTextures.js`). Everything is cracked, sooty and dusty. One or two rooms on each floor have a **rift** torn open where the Sewers have a channel. Its raw sides are veined with violet light that shines by itself and fall away to a violet glow far below. A pixel-art miasma wells up out of it, with motes of light drifting up through it, thinning away below head height (`fx/haze.js`). Broken slabs of the floor sag out over its lips, cracks run back from them, and an uneasy hum and whispering rise from it as you get near. The rifts are crossed on makeshift bridges: two salvaged beams (one a gilded beam from some hall's ceiling), planks of odd lengths and half a door, all lashed together, with a pole on posts for a rail. The rifts follow the channels' rules. The halls are lit by gilded wall braziers and by oil lamps of ruby glass hung from gilt arms. On the walls hang the kingdom's banners, gone to rags at the hem, portraits of its kings (one slashed across), round shields over crossed axes, and here and there black crystal bursting out of a glowing crack, where the evil below has come through. The furnishings are in disarray: great rugs frayed, torn and scorched, a throne with an arm broken off, feast tables knocked over like barricades, chairs flung about, a statue of a dwarf warrior whose head lies at its feet, fallen columns, gold candelabra, suits of armour on stands, looted bookcases with their books strewn across the floor, an anvil, paintings fallen from their nails, and heaps of fallen masonry.

**The Underworld** is a temple to the evil below, dug into caverns in the dark depths. Its rooms are masonry: walls of black-violet brick rising into the raw rock of the cavern, a frieze of runes glowing violet running round them, floors of great basalt slabs, some carved with rings. Above them is the cavern's own rough vault, glinting with specks of violet crystal. The passages between the rooms are rough tunnels hewn through the rock, veined with faint violet light (`rough: 'tunnels'` in the theme's entry in `config.js`: `dungeon/roughRock.js` keeps the rooms flat below their vaults; `dungeon/underworldTextures.js`). Every flame burns violet (`fire: 'violet'`): the horned skulls on the walls with fire in their cracked-open crowns, the torches, the braziers and the candles. One or two rooms on each floor have **lava** creeping along a channel where the Sewers have water. It pours from the jaws of a demon's head carved in the wall at one end. Its crust breaks and glows over the molten rock, embers fly up off it, crusted rock sags over its lips with molten rock oozing between, and it lights the room orange. It rumbles and bubbles as you get near, and it's crossed on narrow arches of black brick with runes glowing along their parapets. The lava follows the channels' rules. The temple's furnishings are summoning circles laid in lines of violet light with candles at the star's points, obelisks with columns of glowing runes, blood-stained altars before steles bearing the cult's sigil (an eye in a ring of rays), crouching winged demons on plinths with fire in their eyes, demon faces carved in rune-ringed medallions, black banners bearing the sigil, standing braziers, offerings of skulls, cages hung from the vault, a prisoner left in chains, and the violet crystal of the evil below breaking through the walls. The cavern shows through too: fallen rock, stalactites dripping from the vault, and cracks in the floor where magma glows close beneath.

**Difficulty** follows `danger(depth)` in `config.js`, which rises evenly from 1 on floor 1 to 10 on floor 25. How many monsters a floor has, how tough they are, loot quality, gold and shop prices all work from it, so the curve spans the whole dungeon and would stretch again if floors were added. Monsters' first and last floors (`depth` in `monsters/defs.js`) are real floor numbers. Experience per level is scaled to match, so your level keeps pace with the danger rather than with the floor count.

## Floors and doors

Floors are generated the Pixel Dungeon way, graph first:

- **The loop.** A ring of rooms with the entrance stairs on one side and the exit (or, on the last floor, the Amulet's vault) opposite. There are always two independent routes between them, so both stair rooms always have at least two ways in and out.
- **Branches.** Rooms that hang off the loop, or off other branches, as dead ends. The artefact shrine is one: a side room behind a door.
- **Sealed rooms.** Every connection is a doorway on each room's wall plus an A*-routed corridor. Corridors can never cut through a room, so a room can only be entered through its own doorways.

Some themes add features to their rooms, like the Sewers' water channels, the Catacombs' spike pits, the Caves' chasms, the Dwarven Ruins' rifts and the Underworld's lava (see *The dungeon*).

A doorway is either an open arch or a wooden door. Doors swing open when anyone walks into them (or on **E**), and swing shut once the doorway has been clear for a couple of seconds. A closed door blocks sight, arrows and bolts, so slipping through one is a way to break a chase. Monsters path through doors and open them.

**Locked doors** are fully working but not placed yet. They can only go on a branch, never the loop. Each needs an iron key, which is always placed somewhere on that floor's loop so it can never be locked away. Keys don't take pack slots: they show as *Keys* on the stat line and are used up when you walk into (or use) the locked door. Monsters can't path through a locked door, and teleports never drop you inside a locked room.

**Traps** lie hidden in rooms and corridors (never near the entrance, in the shop or behind a locked door). You notice one now and then when you pass within a couple of tiles of it; the Eye of the Deep and a scroll of magic mapping reveal them all. Step on one and it goes off, whether you'd found it or not, and it's spent afterwards. **Sneak** onto one you've found and you creep over it without setting it off (it stays armed): stop sneaking before you're off its tile (tap C, sprint, or run out of stamina) and your weight comes down on it. Sneaking is no help with a trap you haven't found. Each kind has its own model (`world/trapModels.js`), told apart at a glance by shape and colour, with three states: **armed** (found, waiting), **active** (going off) and **used** (spent):

| Trap | Looks like | Goes off | Spent |
| --- | --- | --- | --- |
| Spike | a square iron grate, spike points glinting in its holes | spikes thrust up half a metre (damage) | spikes left stuck half out, bent and bloodied |
| Poison | a round vent in a green stain, a slotted brass cap over it | the cap blows off in a cloud of green gas (poisoned) | the cap lying where it fell, the vent open |
| Teleport | a stone disc with an azure glyph slowly turning on it | the glyph spins and flares in a column of light (you're thrown elsewhere on the floor) | the glyph burnt out, the stone cracked |
| Alarm | a wooden plate with a brass bell on a post | the plate goes down and the bell swings and rings (monsters within 30 m come) | the plate jammed down, the bell fallen and cracked |

The minimap marks found traps in the same colours (grey, green, azure, yellow), spent ones dimmed. The used state would also serve for a trap that's been disarmed.

## The shop

On the first floor of each new theme after the first (floors 6, 11, 16 and 21), a door in the room you arrive in leads to a shop. A small hooded shopkeeper stands on a stool behind the counter, idly shaking a purse of coins, watching you and passing remarks. The shop is lit by blue-flamed sconces.

- **Stock:** five items, three on the counter and one on each display table. There's always a ration, a potion and a scroll (often healing and identify), a piece of uncursed gear from a little deeper than the floor you're on, and an uncursed wand or ring. Items keep their unidentified names. What the shop charges depends only on the kind of item (and, for weapons and armour, which one: its `value` in `items/defs.js`), never on what's hidden about it, so prices give nothing away. Prices rise a little on deeper floors (see `shopStock` and `worth` in `items/generate.js`).
- **Buying:** walk up to an item and press **E**. The prompt shows the price, or what you're short. Gold goes, the item goes into your pack, and there's no haggling or refunds.
- **Selling:** open your pack while you're in the shop and every item gets a **Sell** button with its price: 40% of what it's worth, as far as you know it (`worth` in `items/generate.js`). The price never tells you more than you knew:
  - **A potion, scroll, wand or ring of a kind you don't know** fetches a low price, the same for every kind.
  - **Known potions and scrolls** fetch their value.
  - **Equipment you know nothing about** (not even whether it's cursed) fetches a share of what its kind is worth, cursed or not.
  - **Known to be clean** but not identified, it fetches its full value, plus what an enchantment you know of is worth. **Identified**, add what its + is worth too.
  - **A weakened curse you know of** halves the price. **A full curse you know of**, and the shopkeeper refuses it outright.
  - Stacks sell one at a time, equipped items come off first (not if they're cursed), and the shopkeeper won't buy the Amulet.
- **Buying back:** the shopkeeper sets what you sell out with its wares, at its usual price for that item. It goes on the first free spot on the counter or the display tables, then on the rug, which holds six. Potions, scrolls and food of the same kind pile up on one spot and sell back one at a time. When every spot is taken, the item you sold longest ago goes to make room.
- **Monsters** never spawn, wander or get teleported into the shop. Only a monster that was chasing you when you went in may follow you in. Any other monster that comes looking waits at the door, unless you attack it from inside.

**Adding a specialist room:** add a type to `dungeon/rooms.js` (size, door style, whether the normal population pass may use it, and a `furnish(ctx, room)` that places its contents), then put it in the plan in `dungeon/generator.js` as a branch, e.g. `{ type: 'treasury', locked: true }`.

## Blockbench models

The monsters, the shopkeeper, the weapons you hold and find, the torch in your off hand (and on the floor, dropped), the sconces, torches and lanterns on the walls, room furniture, traps and the items lying on the floor are [Blockbench](https://www.blockbench.net) projects in `assets/models/`:

- `monsters/` has one per monster type in `monsters/defs.js` (`rat`, `bat`, `slime`, `goblin`, `archer`, `skeleton`, `orc`, `wraith`, `imp`, `troll`, `golem`, `warden`).
- `weapons/` has one per `model` name in `items/defs.js` (`dagger`, `sword`, `longsword`, `mace`, `spear`, `axe`, `hammer`).
- `items/` has one per kind of item (`potion`, `scroll`, `wand`, `ring`, `gold`, `key`, `amulet`), plus one per armour (`armor_leather` … `armor_plate`), artefact (`chalice`, `eye`, `horn`, `cloak`, `boots`, `ember`) and food (`apple`, `ration`).
- `props/` has room furniture and decorations: the shop's `shop_counter`, `display_table`, `shelf`, `barrel`, `crates` and `rug` (placed by `dungeon/rooms.js`), the Sewers' `bridge`, `channel_grate`, `drain_pipe`, `pipe_valve`, `rubble` and `floor_drain`, and the Catacombs' `spike_pit`, `grate_bridge`, `cell_door`, `wall_niches`, `shackles`, `chained_skeleton`, `bone_pile`, `sarcophagus`, `hanging_cage`, `candles` and `grave_slab`, and the Caves' `rope_bridge`, `ore_vein`, `crystals`, `mine_timbers`, `minecart`, `rails`, `tools`, `rocks`, `stalagmite` and `stalactites`, and the Dwarven Ruins' `rift_bridge`, `rift_lip`, `rift_lip_2`, `banner`, `painting`, `fallen_painting`, `wall_shield`, `void_shards`, `grand_rug`, `throne`, `toppled_table`, `chair`, `dwarf_statue`, `fallen_column`, `candelabra`, `armor_stand`, `bookcase`, `anvil` and `ruin_rubble`, and the Underworld's `lava_bridge`, `lava_lip`, `lava_lip_2`, `lava_mouth`, `obelisk`, `altar`, `rune_circle`, `demon_statue`, `demon_face`, `cult_banner`, `floor_brazier` and `magma_crack` (placed by `dungeon/decor.js` and the channels; the Underworld reuses some of the other themes' too). A channel's lips have their pivot on its edge, the channel in front of them. Wall pieces like the pipes, grates, cells, niches and ore have their pivot on the wall face at floor level and stand out from it along +Z. Stalactites have their pivot on the floor like any other prop, and reach up past the vault (2.8 m), so the rough rock never lifts clear of them. Empty groups named `candle_1`, `candle_2`… mark where the game lights a small flame, as on the candles and in the niches, `glow_1`… where a soft glow shines (the crystals, the void shards), `drip_1`… where water drips from (the stalactites' tips), and `fire_1`… where a full-size fire burns (the brazier), with a light of its own if one is to spare.
  The Caves' wall lights, `wall_torch` and `lantern`, the Dwarven Ruins', `wall_brazier` and `hanging_lamp`, and the Underworld's `skull_sconce`, are props too, but they're built like the sconce: the pivot sits on the wall at the height they hang (1.85 m), and a `flame` group marks the fire. `FITTINGS` in `dungeon/levelBuilder.js` sets each one's flame size and light.
  Props load on demand, each its own small download: the game fetches a theme's props before building one of its floors, and the next theme's while you play the current one, so starting up only waits for the Sewers'. The title screen's walk does the same, fetching each theme during the one before. So the game knows what a theme needs, a new decoration goes in its set's `props` list in `dungeon/decor.js` as well as in the set's placement code (the shop's props are listed in `SHOP_PROPS` in `dungeon/rooms.js`, the channels' in `FILLS` in `dungeon/levelBuilder.js`, and the wall lights in the theme's `lights`).
- `npcs/` has characters who aren't monsters: the `shopkeeper`.
- `traps/` has one per kind of trap (`spike`, `poison`, `teleport`, `alarm`), its origin on the floor at the middle of its tile. Each has three groups for its states, shown one at a time: `armed`, `active` and `used`; anything outside them always shows. `world/trapModels.js` moves the active state's parts (the whole `active` group, or a named group inside it, like the alarm's `bell`) and says how long each kind stays active.
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

These models were first built in code by `tools/modelgen/`. It shapes low-poly meshes from lathes and lofts, unwraps their UVs automatically and paints pixel-art textures procedurally. `npm run models -- sword torch` rebuilds the named models, and `all` rebuilds every one. Rebuilding replaces the whole file, so any Blockbench edits to it are lost. The script skips a file with uncommitted changes unless you pass `--force`, and `--out <dir>` writes the results somewhere else so you can compare first. To add a model, write a builder like those in `items.mjs`, `monsters.mjs`, `props.mjs`, `sewers.mjs`, `catacombs.mjs`, `caves.mjs`, `dwarven.mjs`, `underworld.mjs`, `traps.mjs` or `sconce.mjs` and list it in `build.mjs`.

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
  dungeon/decor.js     decorations by theme style, set about the rooms clear of doorways
  dungeon/channels.js  trenches across rooms, crossed by bridges: the Sewers' water channels, the Catacombs' spike pits, the Caves' chasms, the Ruins' rifts, the Underworld's lava
  dungeon/textures.js  procedural canvas textures per theme
  dungeon/sewerTextures.js  the Sewers' own textures: brickwork, cobbles, vault, channel sides, water, puddles
  dungeon/catacombTextures.js  the Catacombs': ashlar walls, flagstones, vault, pit sides and floor, cobwebs
  dungeon/caveTextures.js  the Caves': layered rock with cracks, veins and seeps, gritty floor, vault, chasm sides
  dungeon/dwarvenTextures.js  the Dwarven Ruins': porphyry, gold frieze and dado, inlaid marble, coffers, rift sides and glow
  dungeon/underworldTextures.js  the Underworld's: black brick and glowing runes, veined tunnels, basalt, crystal vault, lava
  dungeon/texturePaint.js  helpers the themes' textures are painted with
  world/level.js       runtime level: collision, line of sight, doors, BFS flow field, fog of war, spawning
  world/shopkeeper.js  the shop's merchant: idle animation and remarks
  world/trapModels.js  the traps' models: their armed, active and used states, and how they move going off
  monsters/defs.js     bestiary stats, the floors each monster appears on, spawn tables
  monsters/monster.js  AI state machine (sleep → wander → hunt by sight or by ear, fear, ranged kiting), allies and brawls, attacks
  monsters/models.js   loads the rigged Blockbench monsters and animates their bones
  items/defs.js        item catalog and unidentified appearances
  items/identify.js    per-run appearance shuffle, naming, descriptions
  items/generate.js    random items by depth, their + and curses, shop stock, what things are worth
  items/enchant.js     Enchantments and Curses of ___ on weapons and armour, and what a curse's strength means
  items/use.js         potions, scrolls, wands, equip/curses, grip and off-hand use, throwing, artefact powers
  items/models.js      loads the weapon and item models, tinting each item in its colour
  items/bbmodel.js     loads Blockbench .bbmodel projects (cubes, meshes, groups, textures) into three.js
  fx/                  viewmodel (hands), pixel-art flames, projectiles, particles, drips, haze over channels (the rifts' miasma, the lava's embers), glow sprites
  ui/ui.js             HUD, minimap, message log, floating text, pack, dialogs, title and end screens
  ui/logo.js           the pixel-art title logo, drawn from hand-made glyphs, with its moving glint
  ui/titleScene.js     the walk through a floor of each theme behind the title screen
  ui/devTools.js       the dev tools panel (the ` key): travel, stats, items and monsters for testing
assets/models/         Blockbench models: monsters/, npcs/, weapons/, items/, props/, the hand torch and the wall sconce
tools/modelgen/        builds those models from code (npm run models)
public/                copied into the build as it is: the favicon, and the picture a shared link shows
```

Balance numbers live in `monsters/defs.js`, `items/defs.js` and `config.js`. `window.game` is exposed for poking at state from the dev console.

## Possible next steps

- Specialist side rooms behind locked doors (treasuries, libraries, armouries), secret doors
- More furniture for other room types
- More level shapes: caves via cellular automata, flooded rooms, chasms that drop you a floor
- Mimics, splitting oozes, invisible stalkers, thieves who steal and teleport away
- A shield/block action, and alchemy or crafting for spare potions
- Music, and positional audio for monsters you can hear but not see
