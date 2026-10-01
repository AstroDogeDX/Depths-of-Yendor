# Item icons

The pack, the paper doll and the hotbar show each item as a small pixel-art icon, drawn in code: the art is in `src/ui/iconArt.js`, and `src/ui/icons.js` paints it. [All the docs](README.md)

## How they're drawn

Each icon is a map of 16 rows of 16 characters, one character to a pixel: `.` is nothing, and any other character a colour from `PALETTE`, or from the icon's own `colors`, which can add colours or change the palette's for that icon. The palette has ramps from light to dark for the things items are made of, lit from the top left:

| Characters | Colours |
| --- | --- |
| `A` `B` `C` `D` | steel |
| `E` `F` `G` | wood |
| `H` `I` `J` | leather |
| `K` `L` `M` `N` | gold and brass |
| `P` `Q` `R` | red, for rubies and blood |
| `S` `T` `U` | parchment |
| `V` `X` `Y` | glass |
| `a` `b` `c` `d` | fire |
| `W` | white, for glints |
| `#` | the outline's colour, for dark lines inside the art |

`icons.js` draws a dark outline round everything, so the maps hold only the coloured pixels. Leave a pixel's margin all round for it. The game shows icons at three times their size in the pack and on the paper doll (twice in the ring slots), and twice on the hotbar, lifted clear of the label along the bottom that says what pressing the key does. They're scaled in whole pixels, so they stay crisp. Each look is painted once and kept.

The weapons lie on the diagonal, blade or head up to the right and hilt down to the left, their blades a band two pixels wide (three for the long sword) with the guard across it. An arrow lies the same way, point up to the right, and the bow bends toward the top left, its string straight from tip to tip. The armours share one tunic's shape, in leather, mail or plate.

## What changes from run to run

Potions, wands, rings and keys each have one icon drawn for every type, with `tint` set. Its pixels `1` to `5` are shaded, light to dark, from the item's colour as it looks this run (`Knowledge.color`): the potion's colour, the wand's wood or metal, the ring's gem, or the key's iron or gold. `ramp` in `icons.js` keeps the colour's hue and lifts its lightest shades, so even an inky potion or an onyx gem shows its shape.

Scrolls are one open scroll with a rune painted on it. `RUNES` in `iconArt.js` are 5 pixels across and 6 down, painted in `RUNE_INK` at `RUNE_AT`. Each kind of scroll is given a rune of its own each run, as it's given a label (`Knowledge.rune`, drawn from the run's labels and saved with the run), so a rune tells you no more than the label does. `SCROLL_RUNES` in `items/defs.js` is how many runes there are. It must be at least the number of kinds of scroll, and `RUNES` must have that many.

## Marks

The mark for what a thing does (see [The pack](gameplay.md#the-pack)), in the bottom right corner of its tile in the pack and beside its icon on the hotbar, is a smaller icon: 9 rows of 9, drawn the same way, in `MARK_ICONS`. `MARK_OF` in `ui/tiles.js` says which things get which mark, and `MARKS` there gives each mark's name in words.

## Adding an icon

1. Draw the map in `ICONS` in `ui/iconArt.js`, keyed `<kind>:<type>` (`weapon:dagger`), or by kind alone for one icon for every type (`potion`).
2. Look at it: in the dev tools (the ` key), **Show every icon** under *Icons* lays out every icon three times its size, with each tinted one in every colour it comes in, the scroll with each rune, and the marks. In development, the console warns about a map of the wrong size, a character with no colour, or art right to its edge.
3. An item with no icon yet shows its glyph (`KIND_GLYPH` in `items/defs.js`), so nothing breaks in the meantime.

A new kind of scroll needs no drawing, since it gets a rune. A new mark is an entry in `MARKS` and `MARK_OF` in `ui/tiles.js`, and its picture in `MARK_ICONS`.
