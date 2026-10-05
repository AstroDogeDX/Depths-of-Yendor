# Gameplay

How the game plays and the rules behind it: what's in it, the controls, the pack and hotbar, shields, bows and arrows, thrown weapons, combat and damage, curses, statuses, stealth, saving and the title screen. [All the docs](README.md)

## What's in it

- **25 floors in 5 themes** of five floors each: Sewers, Catacombs, Caves, Dwarven Ruins and the Underworld. Seeded layouts with pillared halls, wall sconces, doors and hidden traps (spike, poison gas, teleport, alarm). See [The dungeon](dungeon.md).
- **13 monsters:** rat, bat, ooze, goblin, goblin archer, skeleton, orc, wraith, fire imp, troll, stone golem, the **mimic**, which passes for a chest until you reach for it, and the **Warden of Yendor**, who fires bolt volleys and raises the dead at half health.
- **Items:** 7 weapons with different reach, speed and damage types (spears out-reach swords, hammers hit hard but recover slowly), each to be gripped in one hand or both, the lantern, a **shield** or a **bow** (with **arrows** in your quiver) in your off hand, **thrown weapons** (stones, darts and throwing knives), 5 armours with strength requirements, 10 potions, 10 scrolls, 5 wands, 6 rings, food. Most are found in **chests**, and the best in locked ones. See [Chests and mimics](dungeon.md#chests-and-mimics).
- **A shop** on the first floor of each theme after the first (floors 6, 11, 16 and 21). See [The shop](dungeon.md#the-shop).
- **6 artefacts**, 5 per run in guarded shrines on the third floor of each theme (3, 8, 13, 18 and 23): Chalice of Crimson Thirst (lifesteal), Eye of the Deep (see all monsters, even through walls, and traps), Horn of Thunder (stun blast), Cloak of Shadows (invisibility), Boots of the Wind (speed), Emberheart (burning strikes, fire immunity). You have two attunement slots.
- A Rogue tombstone when you die. Seeds are shareable.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move; ← → turn (King's Field style) |
| Shift | Sprint: 1.6× speed, but loud (uses stamina) |
| C | Sneak on/off: half speed, crouched and near-silent (uses stamina); creeps over found traps without setting them off. Sprinting, or running out of stamina, ends it |
| Mouse | Look (click the view to capture the pointer) |
| Click / Space | Attack. Click swings once the meter is past 20%; holding re-swings only at full charge. With a bow in hand, a jab with the arrow in your hand (see [Bows and arrows](#bows-and-arrows)) |
| E | Pick up, open a chest or door, use stairs |
| I or Tab | Pack (click or arrow keys select, drag to the doll or hotbar, 1–4 put on the hotbar, Q next tab, double-click or Enter use, T throw, D drop) |
| M | Full map |
| 1–4 | Hotbar slots (see [Hotbar](#hotbar)). For a potion or wand, hold the key: click throws or zaps it, right-click drinks it or zaps yourself. For a thrown weapon, hold the key, hold right-click to draw your arm back, and click to throw (see [Thrown weapons](#thrown-weapons)). A weapon, lantern, shield or bow there swaps with what's in that hand |
| F | Grip your weapon in both hands, or back in one (see [Off hand and two hands](#off-hand-and-two-hands)): with a bow, it changes between your bow and your weapon |
| Right-click | Hold to raise a shield (click meanwhile to shove with it: see [Shields](#shields)), or with a bow, to nock an arrow (then hold click to draw, and let go to loose it: see [Bows and arrows](#bows-and-arrows)); otherwise use what's in your off hand, or, gripping your weapon in both hands, its special (none yet) |
| Q | Quaff a potion you *know* is healing: your weapon goes down, the potion comes up and is drunk, and your weapon comes back up, as if you'd held it up from the hotbar and right-clicked (clicks meanwhile do nothing) |
| R / T | Active power of artefact slot 1 / 2 |
| P | Cycle internal render resolution (270p → 360p → 540p → native) |
| Esc | Pause (the pause panel can also save and quit to the title) |
| ` | Dev tools (see [Dev tools](development.md#dev-tools); only in development, or with `?dev` in the address) |

## Moving Rogue to real time

- **Attack meter instead of turns.** Every weapon has a recovery time. You can swing early, but damage scales with the charge, like King's Field's power bar. The weapon visibly sags while the meter refills.
- **Swings are slow and deliberate.** A cut winds up high over your shoulder, holds there a moment, then comes down and across, following through well past where it struck; a thrust draws back and lunges, with less of either. The blow lands half way through, as the cut or lunge is at its fastest, and you can't swing again until the swing is done. A swing takes most of the weapon's recovery time, so it slows as that does (short of strength, or chilled): 0.6 s for a short sword, up to 1.1 s for a war hammer, a little less for a thrust (0.4 s for a dagger). See `SWING_TIME` in `player.js`, and the keys in `fx/viewmodel.js`.
- **Telegraphed monster attacks.** Monsters wind up before striking, and during the windup they turn slowly toward you. Stepping back or circle-strafing makes them whiff, which replaces Rogue's to-hit dice for defence. Heavy hits can stagger a monster out of its windup.
- **Stealth and sneak attacks.** Monsters start asleep or wandering. Unaware targets take double damage and cannot dodge (Pixel Dungeon's surprise attacks). Monsters notice you by sight and by the sound of your footsteps (see [Stamina, sprinting and sneaking](#stamina-sprinting-and-sneaking)). Standing still, rings of stealth and light armour help. Heavy armour hurts.
- **Clocks tick in seconds.** Hunger, regeneration, status effects, wand recharge and ring identification all run on real time. The world pauses while the pack or map is open, but drinking, eating, throwing, changing equipment or changing grip empties your attack meter, so doing it mid-fight still costs a swing.
- **Paralysis means paralysis.** While paralysed (or frozen) you can't use items (from the pack or the hotbar), pick things up, take stairs or invoke artefacts. Only the map stays available.
- **Identification is per run.** Potion colours, scroll labels, wand woods and ring gems are reshuffled from the seed. Potions reveal themselves when drunk, and throwing a potion identifies it if the splash does something visible. Weapons, armour, shields and bows reveal their + after enough hits (a shield's, blows it takes; a bow's, arrows that strike home), and any Enchantment or Curse of ___ as soon as you put them on. Rings reveal themselves after about 100 s of wear. A wand shows what kind it is the first time its spell does something you can see, but its + and its charges only after 3 zaps.
- **Curses.** About 16% of weapons, armour, shields and bows, a fifth of rings and an eighth of wands are cursed. See [Curses, upgrades and enchantments](#curses-upgrades-and-enchantments).
- **Persistent floors.** Levels are kept when you leave, so you can go back up, and they're saved with the run (see [Saving](#saving)). The dungeon also restocks itself slowly, and fast and angrily once you carry the Amulet.

## The pack

The left of the pack shows a paper doll of what you have equipped: weapon in hand, what's in your off hand (the lantern, a shield or a bow), the arrows in your quiver (by its shoulder, with how many there are), armor on the chest (tinting the figure), two rings and two artefact attunements. A weapon gripped in both hands is marked *2H*, and what's in your off hand meanwhile *stowed* (a shield or a bow, *on back*); with a bow in hand, your weapon is marked *lowered*. A known curse gives the slot a red border, and something you know is clean but haven't identified a blue one. Clicking a filled slot selects that item. Selecting something you haven't equipped highlights the slot it would go into. Underneath are your derived stats (damage and its type, recovery, reach, defense, speed, strength, or, with a bow in hand, what an arrow from it does at full draw, its draw and how many arrows you have), with anything too heavy for you shown in red. An unidentified weapon's + stays hidden: its damage shows as *(+?)*. A curse on it you don't know of stays hidden too.

**What's equipped or on the hotbar is out of the pack.** It takes no slot, and you get at it from its doll or hotbar slot: click one to select what's in it, like a tile. Taking something off (or off the hotbar) puts it back in the pack, so that needs a free slot; the pack says so when there isn't one. Swapping one thing for another (a new weapon for the old) always works, since the one coming out makes room for the one going in. A hotbar slot waiting for more of a stack you ran out of (see [Hotbar](#hotbar)) takes a new one straight back, full pack or not.

**Moving things about.** Drag a tile to a doll slot to put it on (a ring or artefact to the slot you choose; a ring dragged from one hand to the other swaps them), or to a hotbar slot to put it there. Drag from a doll or hotbar slot back onto the pack to put it away, or from one hotbar slot to another to swap them. The old ways work too: select a thing and use its buttons (**Wield**, **Put on**, **Remove**, **Off the hotbar**...), press 1–4 to put it in that hotbar slot (again to take it off), or double-click it. While the pack is open, the HUD's hotbar below it is live for all of this, and right-clicking a hotbar slot empties it.

What's in the pack is a grid of tiles, one for each of its 20 slots. It keeps things of a kind together (weapons, bows, arrows, thrown weapons, off-hand things, shields, armour, rings, artefacts, wands, potions, scrolls, food: `packOrder` in `player.js`), so you know roughly where to look. Weapons, armour and the like go by type within their group, weakest first; potions, scrolls, wands and rings by when you got them, since an order by type would give away what you don't know. Each tile shows the item's icon (see [Item icons](icons.md)), and in its corners what you know of it (`ui/tiles.js`):

| Corner | Shows |
| --- | --- |
| Top left | a weapon's, armour's, shield's, bow's, ring's or wand's +, or **?** until you know it (a cursed ring's as the minus it gives you) |
| Top right | how many there are, or a wand's charges (**?** until you know the wand) |
| Bottom right | a mark for what it does: its element or enchantment (a long sword of flames, a wand of firebolt, a potion of liquid flame), or what a potion, scroll, wand or ring you know does (a map for magic mapping, a green cross for healing), as a small icon of its own (see [Item icons](icons.md#marks)). The hotbar shows the same marks |
| Bottom left | nothing yet |

Point at a tile, or at a slot on the doll or the hotbar, and a tooltip names what's there at once, with a note if there's more to say (a weapon *in both hands*, a hotbar slot with none left): `UI.showTip`, from what `setTip` in `ui/ui.js` put on each.

A tile's colour says what you know of a curse. Equipment you know nothing about has no tint at all: a tint would tell you something. You find out by trying it: putting on a weapon, armour, shield, bow or ring tells you whether it's cursed (a curse binds it to you, or taints you if it's weakened, and otherwise it's clean), and so does zapping a wand (a cursed one never casts its own spell). A scroll of remove curse, identify or upgrade tells you too. **Blue** is something you know is free of curses but haven't identified: safe to use, though its + is still a mystery. **Red** is a curse you know of, and stays red once you know everything else about it. Identified and clean, it looks like anything that can't be cursed. The same tints show on the doll and the hotbar.

**Pack expansions.** Each shop sells one of four expansions (`CONTAINERS` in `items/defs.js`): the **scroll holder**, the **potion bandolier**, the **wand holster** and the **bullet pouch**, the last for thrown weapons (see [Thrown weapons](#thrown-weapons)). Each adds 10 slots for its own kinds of thing, on a tab of its own above the grid (**Pack**, **Scrolls**, **Potions**, **Wands**, **Pouch**), with how full it is. Click a tab or press **Q** (Shift+Q goes back) to switch. An expansion isn't something you carry: once you have one it's part of your pack for good, and doesn't take a slot. Where each thing goes follows from the pack's order (`Player.bags`): into the expansion for its kind while that has room, otherwise into the pack. So what you already carry moves in the moment you get an expansion, anything you find later goes straight in, and when an expansion fills up (only wands can, one to a slot) the rest go in the pack and move over as room frees up. Stacks work as before, one stack to a slot. Asked to choose an item (to identify, say), the pack opens on the tab with the first thing that will do, and dims tabs with nothing that will. New expansions (a satchel for food, say) are an entry in `CONTAINERS` naming the kinds they hold; one without `shop` isn't sold, and comes some other way.

## Off hand and two hands

Your weapon is in your main hand, and your other hand holds an **off-hand** thing: the **lantern** you start with, a **shield** (see [Shields](#shields)) or a **bow** (see [Bows and arrows](#bows-and-arrows)). More are to come (`OFFHANDS`, `SHIELDS` and `BOWS` in `items/defs.js`). It's equipment like any other: **Put away** in the pack stows it with your things, **Hold** takes it back up, and you can drop it, or sell it. Hang one on the hotbar and its key swaps it with what's in your off hand (see [Hotbar](#hotbar)).

- **The lantern is your light.** Held up by its handle, it lights the way. Its flame burns behind glass, so its light flickers only a little, and the lantern swings from your hand: out as you turn, back as you walk, a little with each stride, settling slowly, and the light sways with it (`LANTERN_SWING` in `fx/viewmodel.js`). Hung at your belt on the hotbar, while you hold a shield, it still lights the way, as one stowed does (`Player.carriedLight`). Without one in hand or at your belt, only the floor's own dim light and the sconces show you anything.
- **F grips your weapon in both hands**, or takes it back into one. Every weapon can be gripped this way, and in both hands it needs **2 less strength** (`TWO_HAND_STR` in `config.js`): a war hammer, which needs 17, needs 15. So a weapon too heavy for you is less so: at 12 strength, the war hammer recovers in 2.7 s instead of 3.2, and its penalty to hit drops from 40% to 24%, while a long sword (14) is no longer too heavy at all. And one you're strong enough for hits harder, as strength beyond what a weapon needs always does: a short sword's 3–8 becomes 3–10. The price is what's in your off hand.
- **In both hands, the weapon takes a two-handed pose** (there are no hands to show yet). A sword, axe, mace or hammer is held from the off-hand side, as if your left hand held it and your right guided it: it rises diagonally across your body, and swings higher and further. A spear comes in nearer the middle, braced low from your right hip, and is driven further home. A dagger is held out before you in both hands, and jabbed forward with both arms. Both point straight at the crosshair all through the thrust, their flats turned toward you (`KEYS_2H` in `fx/viewmodel.js` gives a weapon a pose of its own).
- **Two hands stow what's in your off hand.** You can't use it: the lantern hangs at your belt, lighting far less (45%) from lower down, a shield is slung on your back, where it guards you from behind (see [Shields](#shields)), and a bow over your shoulder, so your weapon comes back up. Taking something in your off hand takes your weapon back into one (or, a bow, lowers it), and so does putting your weapon away.
- **Changing grip empties your attack meter**, as changing equipment does.
- **Right-click** uses what's in your off hand, if it has a use (the lantern has none but its light), or, while you grip your weapon in both hands, the weapon's two-handed special (none yet). Each goes in `OFFHAND_USES` or `TWO_HAND_SPECIALS` in `items/use.js`. A shield is raised by holding it instead, and a bow nocked.

## Shields

A shield is held in your off hand, in place of the lantern (hang the lantern on the hotbar to keep some light: see [Off hand and two hands](#off-hand-and-two-hands)). Shields are found like other gear (now and then on the floor and in chests, and in locked chests and on the shop's tables), and work by their numbers in `SHIELDS` in `items/defs.js`: everything about how any shield behaves is in `shield.js`, so a new one is just an entry there. The **wooden shield** is the first.

- **Hold right-click to raise it** (it comes up in 0.18 s, `GUARD_RAISE`). While it's up, it takes its **block** (3 for the wooden shield) off each blow from in front of you, within 60° either side of where you face, as armour takes its defense: a roll up to it, before your armour takes its share. Blows from monsters and their shots count; traps, and whatever ignores armour, don't.
- **Blocking costs stamina:** each point it takes costs 5 of yours. Meanwhile your stamina doesn't come back, you move at 65% of your speed, and you can't sprint. Run out of stamina and **your guard breaks**: you're winded, the shield drops, and you can't raise it again until you've your breath back (30% of your stamina, as for sprinting). The stamina bar turns blue while it's up.
- **Click while it's up to shove with it** (a bash), instead of swinging your weapon: 1–3 bash damage to the nearest monster in reach in front of you, pushing it back 1.5 m (not bosses, golems or trolls) and knocking it out of any blow it was winding up. It costs 12 stamina, and can be done again after 0.8 s.
- **On your back:** gripping your weapon in both hands slings it on your back, where it takes its **back** (2 for the wooden shield) off each blow from behind, for nothing: no stamina, and no slowing. Monsters mostly come at you from in front, so it's a small comfort for gripping your weapon in both.
- **Like other gear,** a shield has a +, which adds to its block, its back and its bash's damage, and which you learn after it's taken 10 blows (`SHIELD_HITS_TO_ID`), or from a scroll of identify. It can be cursed, binding itself to your arm when you take it up, with a Curse of ___: **burden** (raised, it slows you even more, and a shove costs half as much stamina again) or **brittleness** (each blow it takes costs twice the stamina). Or it can be enchanted, found so or by a scroll of enchantment: **steadfastness** (each blow it takes costs half the stamina) or **thorns** (a blow it takes, raised, hurts the one who struck it, for 2–5). See `items/enchant.js`.

## Bows and arrows

A bow is held in your off hand, like a shield, and shoots the **arrows** in your quiver: the **Arrows** slot on the paper doll, by the shoulder (`Player.equip.arrows`). Put a stack of arrows there from the pack (**Put in quiver**, or drag it there) and it stays there whether you've a bow in hand or not, out of the pack and taking no slot in it. Arrows you pick up go straight into an empty quiver, or join the stack in it if they're its kind. Bows are found like other gear (now and then on the floor and in chests, in locked chests and on the shop's tables), and arrows in bundles of 6 to 14 on the floor and in chests, always on one of the shop's tables, by the pile, and in what goblin archers leave behind. Bows work by their numbers in `BOWS` in `items/defs.js`, arrows by theirs in `ARROWS`, and everything about how any of them behaves is in `bow.js`, so a new one is just an entry there. The **wooden bow** and plain **arrows** are the first.

- **In hand, a bow lowers your weapon**, and your main hand takes an arrow from your quiver in its place. **F** slings the bow over your shoulder and brings your weapon back up, in both hands, and again takes the bow back up: so F changes between your bow and your weapon, as the hotbar does between your bow and your shield or lantern.
- **Hold right-click to nock an arrow:** the bow comes up before you, and an arrow goes to the string (0.35 s for the wooden bow). Then **hold click as well to draw it**: your right hand brings the string back toward your shoulder over its draw (0.9 s), and the bow comes over to the right of your view with it, the arrow still pointing at the crosshair, filling the attack meter, and you slow to 60% of your speed (you can't sprint with an arrow nocked). **Let go of click to loose it**, once it's drawn past a fifth of the way (less, and the string eases back, the arrow still nocked). Drawn further, it flies faster and drops less, and hits harder, as a swing does with the meter: from under half its damage, barely drawn, to all of it at full draw, which for the wooden bow is 3–8 stab. While you hold right-click, another arrow is nocked after each shot.
- **Let go of right-click first** and the shot's off: the string eases back and the arrow returns to your hand, unshot, and the click does nothing more until you let go of it.
- **Click without right-click to jab** with the arrow in your hand, a stab for 30% of what it would do shot (`JAB` in `bow.js`), with a reach of 1.5 m: something for a monster that gets too close before you can change to your weapon.
- **Where it lands.** An arrow hits the first monster in its way, which takes double damage if it didn't know you were there, as from any blow, while one that's ready for you may dodge it, as it would a blow (less the bow's aim: its +). An arrow that strikes a monster breaks a third of the time (its `breaks`, 35% for plain arrows), and otherwise falls at its feet; one that misses falls where it strikes a wall, a chest or the floor. Either joins any pile of its kind there, to be picked up again. One that strikes a wall clatters, and monsters near where it fell that aren't hunting you may come to look into it.
- **Like other gear,** a bow has a +, which adds to its arrows' damage and to its aim, and which you learn after 12 arrows have struck home with it (`BOW_HITS_TO_ID`), or from a scroll of identify. It can be cursed, binding itself to your hand, with a Curse of ___: **wavering** (its arrows fly wide of where you aim) or **frailty** (its arrows do a quarter less damage). Or it can be enchanted, found so or by a scroll of enchantment, and every arrow it shoots brings the enchantment, as an enchanted weapon's blows do: **flames** (they set what they strike alight), **frost** (they chill it) or **venom** (they poison it). Arrows of other kinds, with effects of their own to pair with these, are to come (`onHit` in `ARROWS`).

Wands no longer have a key of their own: put them on the hotbar.

## Thrown weapons

Stones, darts and throwing knives are thrown by hand, no bow needed, one at a time from a stack. They work by their numbers in `THROWN` in `items/defs.js`, and everything about how any of them is thrown is in `thrown.js`, so a new one is just an entry there. They're found in piles, now and then on the floor and in chests, and on the shop's tables, sold by the pile. Nothing about one is hidden: they have no +, no curses or enchantments, and can't be upgraded. The bullet pouch keeps them apart from your pack (see [The pack](#the-pack)).

| | Thrown as hard as you can | Charge | Breaks | A pile found |
| --- | --- | --- | --- | --- |
| Stone | 1–4 bash | 0.7 s | 10% | 4 to 9 |
| Dart | 2–5 stab | 0.55 s | 30% | 3 to 7 |
| Throwing knife | 3–6 slash | 0.8 s | 12% | 2 to 5 |

- **Put them on the hotbar** to throw them, and **hold the slot's key**: your weapon goes down and one comes up in your hand, as a potion or wand does (see [Hotbar](#hotbar)).
- **Hold right-click to draw your arm back** (0.25 s, `WIND`), up over your shoulder, and then the throw charges, filling the attack meter (its charge, above). Meanwhile you slow to 75% of your speed, and can't sprint.
- **Click to throw it**, as hard as it's charged: from under half its damage, barely charged, to all of it at full charge, as with a bow's draw, and harder, it flies faster and drops less. A click before it's a fifth charged waits for that. It goes a little up over where you're looking, so it comes down through the crosshair a few metres off, then drops below it: further off for a dart, which flies fastest, and nearer for a stone. A dart flies point first, and a knife or a stone turns end over end. The next comes up into your hand, and while you still hold right-click, you draw back to throw it in turn.
- **Let go of right-click first** and the throw's off: you lower your arm, and it's still in your hand (the attack meter empties, as it does when you ease a bow's string).
- **Where it lands,** it does as an arrow does (`missileLands` in `combat.js`). It hits the first monster in its way, which takes double damage if it didn't know you were there, while one that's ready for you may dodge it. One that strikes a monster may break (as the table says), and otherwise falls at its feet; one that misses falls where it strikes a wall, a chest or the floor. Either joins any pile of its kind there, to be picked up again. One that strikes a wall clatters (a stone clacks, a knife rings), and monsters near where it fell that aren't hunting you may come to look into it, so a stone can draw a monster off.
- **From the pack,** **Throw** (or **T**) tosses one where you're looking, half as hard as you can throw it, there being no drawing back there.

## Hotbar

Open your pack, select a potion, scroll, food, wand, thrown weapon, artefact, or something you hold in a hand, then press 1–4 to put it in that slot, or drag it onto the hotbar under the pack. Pressing the same number on the same item takes it off again, as does dragging it back onto the pack or right-clicking the slot. What's on the hotbar is out of the pack (see [The pack](#the-pack)). In play, the number key uses the item:

- **Potions and wands are held up.** Hold the key down and you lower your weapon and raise the potion or wand in its place (0.4 s in all: `HOLD_RAISE` in `fx/viewmodel.js`). Once it's up, **click** to throw the potion where you're looking or zap the wand at the crosshair, or **right-click** to use it on yourself: drink the potion, or zap yourself with the wand. Click again for another while you still hold the key (after 0.35 s, `HOLD_USE`), and a click while it's still coming up waits for it. Let go and it goes back down and your weapon comes back up. The slot lifts and the prompt says what each click does while you hold it, and meanwhile the mouse does nothing else: no swing, nothing from your off hand (`Game.holdSlot`, `HELD` in `hotbar.js`).
  - Having to raise each one in turn is what keeps a hotbar of wands from being played like piano keys: each wand costs a lower and a raise before it fires.
  - The choice is always yours, so the hotbar never gives away what a potion is, and you can throw a good one where that helps (at allies, one day).
  - **Zapping yourself** (also **Zap yourself** in the pack) does to you what the wand's spell does to a monster, through your armour: frost puts out the fire on you and chills you, fire thaws you out of a freeze (and sets you alight), teleport other takes you somewhere else on the floor, and missile and lightning just hurt. You know what the wand is straight away. A cursed wand misfires at you as it would at anything: some wand's bolt at random, or nothing.
- **Thrown weapons are held up** too, and thrown from your hand: once it's up, hold right-click to draw your arm back and click to throw (see [Thrown weapons](#thrown-weapons)). The prompt says what to do next.
- **Scrolls** are read and **food** is eaten the moment you press the key.
- **Artefacts** trigger their active power if you're attuned to them. The slot shows the cooldown.
- **Weapons, lanterns, shields and bows** hang at your belt there, and the key **swaps** one with what's in that hand (`HAND_KINDS` and `swapSlot` in `hotbar.js`): what you held goes on the hotbar in its place, going down out of sight before the other comes up, as a potion or wand held up does. So you can change weapons, or take up your shield, your bow or your lantern, without opening the pack. One you're holding goes to your belt when you put it on the hotbar (press its number in the pack, or drag it there from the doll), and comes off the hotbar when you take it up some other way. A cursed thing in your hand won't let go. A lantern at your belt still gives some light (see [Off hand and two hands](#off-hand-and-two-hands)).

Potion, scroll, food and thrown weapon slots remember the *type*, so a slot whose stack runs out shows 0 and refills when you pick up more. Wand, artefact and hand slots remember that specific item.

## Damage types

Every source of damage has a type (`damage.js`), physical or magical. Only starvation and bleeding have none.

**Physical.** Every melee blow deals one of three kinds of physical damage: **slash** (the swords and the battle axe), **stab** (the dagger and the spear, which thrust rather than swing) or **bash** (the mace, the war hammer and your fists). A weapon's description and the pack's stats say which. Monsters' blows work the same way. Arrows stab, goblin archers' and yours alike, as do darts and spike traps; a thrown stone bashes, and a throwing knife slashes. A weapon or monster that doesn't give a type deals generic physical damage.

**Magical.** There's raw **magic** and five elements:

| Type | Comes from now | Notes |
| --- | --- | --- |
| Magic | the wand of magic missile, wraiths' and the Warden's bolts, the Horn of Thunder's blast | non-elemental magic |
| Fire | the wand of firebolt, liquid flame, fire imps' fireballs, burning | fire hits set you burning; being immune to fire means you can't burn |
| Ice | the wand of frost | chills, and freezes what's wet (see [Statuses](#statuses)); being immune to ice means you can't be chilled or frozen |
| Lightning | the wand of lightning | |
| Poison | being poisoned (potions, gas traps, oozes) | being immune to poison means you can't be poisoned |
| Holy | nothing yet | holy light, for use against the undead and the cursed |

A wand's description says which type it deals. Magical damage numbers take the type's colour: violet magic, orange fire, blue ice, yellow lightning, purple poison, and white holy light with a golden glow.

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
| Mimic | stab (bite) | | −25% | | fire +50% |
| Warden of Yendor | slash (halberd), magic (bolts) | −30% | −20% | +25% | holy +25%, fire immune |

So a mace is the answer to skeletons, golems and the Warden but little use against oozes, wraiths and trolls. A spear or dagger runs through orcs, imps and trolls, but not the undead. Fire is the troll's bane, and magic is the golem's. Carrying a second weapon, and the right wand, pays. The dev tools' monster buttons list these as tooltips.

You can see when a type matters. A hit on a monster's weakness shows a bigger number tagged **WEAK!**, and a melee hit on a weakness lands with a crunch. A resisted hit shows a smaller number tagged **RESISTED**, and a resisted melee hit lands with a dull clank. For physical hits the number itself turns orange or grey. A monster immune to the damage shows **IMMUNE**, including when you try to poison or burn it. Burning and poison ticks aren't tagged; the hit that started them was. The first time in a run you see a kind of monster resist a type or be weak to it, the log says so, e.g. "The troll is weak to fire!" or "Poison can't harm the skeleton!". A hit on one of your armour's weaknesses is tagged **WEAK SPOT**, and one it resists is tagged **RESISTED**.

## Curses, upgrades and enchantments

Equipment has a **+N** (never below 0), which the scroll of **upgrade** raises. A weapon, armour, shield or bow can also have an **Enchantment of ___**, or a **Curse of ___**, but not both (`items/enchant.js`: the effects there so far are a first few).

Now and then a weapon, armour, shield or bow you find is already enchanted: about 5% of those that aren't cursed on the first floor, rising to about 10% on the last. A wand you find may have a +, as often as a weapon does. The shop's weapons and armour on its tables are never enchanted, and its wands never have a +.

You learn an Enchantment or Curse of ___ the moment you put the thing on ("Power stirs in the long sword: an Enchantment of Flames!"). Putting something on always tells you whether it's cursed: if nothing binds or taints you, it's clean. Its + you only learn by using it (or a scroll of identify).

**Curses** come in two strengths (`item.curse`):

- **Full:** a cursed weapon, armour, shield, bow or ring binds itself to you once you put it on, and a weapon, armour, shield or bow has a Curse of ___ (clumsiness, frailty, burden, clamour, wavering...). A weapon's or armour's + still counts as normal. A cursed ring's + works *against* you instead: a cursed ring of protection +1 is −1 defense until the curse is lifted.
- **Weakened:** it comes off, but its Curse of ___ (or a ring's reversal) remains.

**Cursed wands** misfire. They don't cast their own spell, but some wand's bolt at random: missile, firebolt, frost or teleport other, never a line like lightning. A fifth of the time that fizzles, wasting the charge. Otherwise it flies as a wild, green, flickering bolt carrying that spell, or, while the curse is full, a quarter of the time the spell turns on you. The first misfire tells you the wand is cursed, and since a cursed wand never casts its own spell, the first zap that does tells you it's clean.

What you know shows in its name: "(cursed)", "(curse weakened)", or "(uncursed)" when you know it's clean but nothing more.

The scrolls:

| Scroll | On | Does |
| --- | --- | --- |
| Upgrade | a weapon, armour, shield, bow, ring or wand | +1, and a wand gains a charge. On anything cursed it goes into the curse instead: a full curse is weakened (a fifth of the time lifted outright), and a weakened one is lifted |
| Enchantment | a weapon, armour, shield or bow free of curses | a random enchantment, in place of any it had; identifies it. On something with a curse you didn't know of, the magic recoils and shows you the curse |
| Remove curse | one item that might be cursed | lifts any curse, and either way marks it clean. Things you know are clean aren't offered |

**Wands** keep their + and their charges to themselves until you know them: 3 zaps (misfires count), or a scroll of identify. Until then the hotbar shows **?** for its charges. Once you know it, the hotbar shows its charges, and an empty wand counts down the seconds to the next. Either way, while a wand is short of charges, a bar under its slot fills toward the next one, and its description says it's recharging. A charge returns every 55 s at +0, a tenth faster for each + (to no faster than every 27.5 s). Each + also adds a charge, and 2 to both ends of a damaging wand's damage, which its description shows once you know the wand.

## Statuses

Statuses afflict you and monsters alike, by one set of rules (`status.js`): what each does, what wards it off, and how they meet.

- **Showing them.** Yours show under your health, with the seconds left. The monster you're facing lists its own beside its name, a word pops up over it as some take hold, and what afflicts a monster shows on it (`fx/statusFx.js`), on any near you in sight:
  - **Wet, bleeding, oiled:** water, blood or oil drips off it.
  - **Burning:** flames lick up off it, flaring up and dying down from spot to spot, with embers and smoke rising, and it glows with the fire.
  - **Chilled:** frost glitters about it, drifting down. **Frozen:** thicker frost, and it's tinted blue.
  - **Poisoned:** purple bubbles rise off its head and burst.
  - **Charmed or smitten:** hearts circle its head. **Heartbroken:** now and then a cracked heart sinks from it.
  - **Confused:** stars whirl round its head. **Blind:** murk swirls round its eyes. **Feared:** sweat flies off its head. **Weakened:** red chevrons sink down it as its strength drains.
  - **Paralysed:** it strains against its locked limbs, shaking in fits.
  - **Healing:** green crosses rise off it, with glints of gold.
- **Yours show over your view** too (`fx/screenFx.js`), in the same chunky pixels, fading in and out, as well as under your health:
  - **Burning:** a fiery glow round the edges, flames licking up from the bottom (higher at the sides), embers, and the air shimmering low down.
  - **Chilled:** frost creeps in from the edges and corners, snow drifts down, and the view cools. **Frozen:** thick frost, the view grey-blue and cracked across like ice.
  - **Poisoned:** a throbbing sickly purple round the edges, the view swimming, bubbles rising up the sides. **Bleeding:** red round the edges, beating, with blood running down from the top.
  - **Wet:** drops of water by the edges, each a little lens on the view, sliding down. **Oiled:** a dark amber smear with an oily sheen.
  - **Weakened:** the colour drains, the edges darken. **Confused:** the view swims and doubles. **Paralysed:** grey and blue, with static crackling at the edges and the view jolting as you strain.
  - **Charmed:** a rosy glow, hearts floating up the sides. **Heartbroken:** a cold grey edge. **Healing:** a warm green glow round the edges, swelling and ebbing, and green crosses rising up the sides.
  - **Hasted:** streaks rushing out past the edges. **Mind vision:** violet edges, rings rippling out, and every creature on the floor outlined in violet, even through walls (fainter the further off; a mimic passing for a chest too). Attuned to the Eye of the Deep, you see the same outlines for as long as you wear it, without the violet edges. **Invisible:** the edges shimmer, and your own hands and what's in them turn see-through.
  - **Hunger:** famished, the colour drains toward the edges; starving, more, the edges darker, and now and then everything swims as you nearly faint. **Hunted** (carrying the Amulet): the edges darken red with a heartbeat. **Winded:** the edges darken and lighten with your breath. **Wounded:** below 45% of your health (`WOUNDED`), your heart pounds in red at the edges, quicker as you weaken, the colour drains and the dark closes in; near death, dark veins creep in from the edges, throbbing with it. (Blindness darkens all but the middle of the view, as before.)
- **Bosses** take any hostile status for half as long.
- **Floors you've left** stand still, since only the one you're on runs. When you come back, its monsters' statuses have worn down by the time you were away, without doing their damage.

| Status | Comes from | Does |
| --- | --- | --- |
| Burning | fire hits (the wand of firebolt, liquid flame, fire imps), Emberheart's strikes | fire damage every second |
| Poisoned | poison potions and gas traps, oozes' hits | poison damage every second, and you don't heal |
| Bleeding | nothing yet | damage every second that armour and resistances don't reduce, and you don't heal. The bloodless (skeletons, wraiths, golems, oozes) can't bleed |
| Chilled | the wand of frost | you move at 60% speed, and your weapon recovers a quarter slower; monsters move and strike at half speed |
| Frozen | cold on something wet, or on an ooze | frozen stiff: it can't move or act, a frozen monster takes a blow as if unaware (double damage), and it loses every resistance (weaknesses stay). A thaw leaves 4 s of Chilled |
| Healing | potions of healing, drunk (which also purges poison, bleeding, blindness and confusion at once) or thrown | mends 3/4 of your health over 8 s, or half of a monster's (`HEALING` in `status.js`); another potion adds its 8 s to what's left |
| Wet | wading through a pool (see [Pools](dungeon.md#pools)): it lasts as long as you wade, and wears off over 10 s once you're out (`WADE_WET`) | won't burn, and lightning does half as much damage again |
| Oiled | nothing yet (oil flasks and traps, to come) | fire does half as much damage again, and set alight, it burns twice as long |
| Paralysed | paralysis potions, the Horn of Thunder | as Frozen, but its resistances stay |
| Weakened | nothing yet | you: 3 less strength. A monster: 3/4 of its damage and of its health |
| Confused | confusion potions | you stagger. Monsters stagger, shoot wide, and half the time lay into another monster in reach |
| Blind | potions of darkness | you see almost nothing; a monster sees only about a tile around it, so it hunts by ear (below) |
| Feared | scrolls of terror | monsters run from you |
| Charmed | nothing yet | you can't fight: no swinging, zapping, throwing or Horn. A monster takes your side (see *Allies* below); a boss just stops fighting. Striking a charmed monster breaks the charm |
| Smitten | nothing yet (the Bard, to come) | monsters only: a charm that never wears off. On a boss it's an ordinary charm |
| Heartbroken | a charm ending, or broken | no charm takes. 60 s for you, 30 s for a monster |
| Hasted, Mind vision, Invisible | their potions, the Cloak of Shadows | yours only: you're faster, you sense every monster on the floor (on the map, and outlined in violet where you look, walls or no walls), monsters lose track of you |
| Hunted | carrying the Amulet (not timed) | every monster on the floor knows where you are, even while you're invisible (but they can't strike what they can't see) |

How they meet (`afflict` in `status.js`):

- **Water puts out fire,** and nothing wet will burn.
- **Cold puts out fire, and heat drives out cold.** Setting something chilled or frozen alight thaws it instead, and chilling something that's burning douses it instead. A fire hit on something frozen thaws it and does its full damage.
- **Cold on something wet freezes it solid,** as does wetting something chilled (wading into a pool while chilled, say). Oozes are `fluid` (a trait in `monsters/defs.js`), so cold alone freezes them. The chill a thaw leaves never freezes anything again, so an ooze, or something frozen where it stands in water, thaws out for good; the ice dries it, and the water only soaks it again once that chill has gone.
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

Stamina is a separate bar from the attack meter and is never spent on swings. It drains only while you're *moving* in a mode: sprinting uses 22 a second, sneaking 9. Sprinting or sneaking while standing still is free. It refills (18 a second, half as fast again standing still) after a short pause, though not while a shield is raised, and blows a raised shield takes cost it too (see [Shields](#shields)). Run it dry and you're *Winded*: no sprinting, sneaking or raising a shield until it's back to 30%. It stands you up out of a sneak too, so tap C again once you've got your breath back. You start with 100, and gain 10 more per level.

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

- its monsters (a woken mimic still carrying what its chest held),
- the things lying in it or for sale,
- its chests, and what's still in them,
- its doors and traps,
- how much of it you've mapped (`Level.snapshot`).

With you, your things and what you've learned, a run through all 25 floors saves as about 90 KB, in about 3 ms.

A save whose format is out of date (`SAVE_VERSION`) can't be continued. A floor saved before a change to how floors are laid out starts afresh rather than with things in its walls: each saved floor keeps a fingerprint of its layout to check against. A floor saved before there were chests gets the chests its seed gives it now, and its traps start hidden again, since making room for the chests moved them. Each save also records the build of the game that made it (`save.build`, see [Running and deploying](development.md#running-and-deploying)), though nothing reads it back yet.

## The title screen

Behind the title screen, the game walks you through a floor of each theme in turn, down the stairs from one to the next (`ui/titleScene.js`; see [Stairs](dungeon.md#stairs)). The logo sits in the top left corner and the menu down the right (`index.html`, styled in `style.css`): Continue, with a run saved, saying whose it is and how far down; your name and a seed for a new run; How to play; Fullscreen, on or off; Music, on or off (the title theme and the shop's music: see [Music](development.md#music); it's on the pause panel too); and a link to the repository on GitHub. The button to press first, Continue or else Descend, has its gem lit (`refreshContinue` in `ui/ui.js`). On a narrow screen the menu goes under the logo.
