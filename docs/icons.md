# Item icons

The pack, the paper doll and the hotbar show each item as a small pixel-art icon, rendered from the item's own model: `src/ui/icons.js` does it. The marks for what things do, and the runes on scrolls, are drawn by hand, in `src/ui/iconArt.js`. [All the docs](README.md)

## How they're made

Each icon is a photograph of the item's model (see [Blockbench models](models.md)), the model the game shows on the floor or in your hand, with its own textures, lit from the top left. It's rendered six times bigger than wanted and brought down to `ICON_SIZE` (24) pixels a block at a time: a pixel is filled if the item covers enough of its block, in the colour seen in the block that's nearest the block's average, so the model's own texels come through rather than a blur of them. A dark outline goes round everything. Each item is framed to fit, so a ring fills its icon as an armour does.

The game shows icons at twice their size (`ICON_SCALE`), 48 px, everywhere: in the pack's tiles, on the paper doll and on the hotbar. They're scaled in whole pixels, so they stay crisp.

The models load with the game, and their textures a moment after; icons show once they have (`prepareIcons`, called by `main.js`, long before a run starts). Then every look of every icon is rendered ahead, a few milliseconds each, while the browser is idle on the title screen, so opening the pack never waits for one. Each is rendered once and kept.

## Poses

`POSES` in `icons.js` says how each thing is posed for its picture, by `<kind>:<type>`, else by kind, else the `default`: seen from the front and a little above (`tilt`), turned toward the light (`turn`), and for a few, rolled in the picture first (`roll`), like the wand and the key, which lie on the diagonal.

Weapons, bows and arrows are `diagonal`: seen from the side, their edge or striking face toward the bottom right, then laid on the diagonal, blade or head up to the right. They're made `thick` times as thick across their length, or a blade or a haft would be a hairline at this size.

## What changes from run to run

Potions, wands and rings have one model for every type, with a `_tint` texture (see [Blockbench models](models.md)), so their icons come in the item's colour as it looks this run (`Knowledge.color`): the potion's colour, the wand's wood or metal, the ring's gem.

A scroll's icon is an open scroll, `scroll_open.bbmodel` (the one on the floor is rolled up), with a rune painted on its sheet where the model's empty group `rune` is. `RUNES` in `iconArt.js` are 5 pixels across and 6 down, painted in `RUNE_INK`. Each kind of scroll is given a rune of its own each run, as it's given a label (`Knowledge.rune`, drawn from the run's labels and saved with the run), so a rune tells you no more than the label does. `SCROLL_RUNES` in `items/defs.js` is how many runes there are. It must be at least the number of kinds of scroll, and `RUNES` must have that many.

## Marks

The mark for what a thing does (see [The pack](gameplay.md#the-pack)), in the bottom right corner of its tile in the pack and beside its icon on the hotbar, is a small icon drawn by hand: 9 rows of 9 in `MARK_ICONS` in `iconArt.js`, one character to a pixel. `.` is nothing, and any other character a colour from `PALETTE` or from the mark's own `colors`. `icons.js` outlines it as it does the items, so leave a pixel's margin all round. `MARK_OF` in `ui/tiles.js` says which things get which mark, and `MARKS` there gives each mark's name in words. A new mark is an entry in `MARKS` and `MARK_OF`, and its picture in `MARK_ICONS`. In development, the console warns about a mark of the wrong size, a character with no colour, or art right to its edge.

## Adding an icon

A new item gets its icon from its model, with nothing more to do. If it doesn't read well:

1. Look at it: in the dev tools (the ` key), **Show every icon** under *Icons* lays out every icon as big as the game shows it, with each tinted one in every colour it comes in, the scroll with each rune, and the marks.
2. Give it a pose of its own in `POSES`, if the default shows it from a poor side. Something long and thin is best `diagonal`, like the weapons.
3. If it still doesn't read, the model may want bolder shapes or colours: it's what the icon is made of. An item that should look different in its icon than on the floor can have a model of its own for it, as the scroll does (`iconItemModel` in `items/models.js` picks the model).

An item with no model shows the same placeholder box as on the floor.
