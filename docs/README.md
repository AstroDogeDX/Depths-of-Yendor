# Depths of Yendor: development docs

How the game works, in detail, for anyone working on it. The [project README](../README.md) is the short version for players.

| Doc | What's in it |
| --- | --- |
| [Development](development.md) | Running, building and publishing (GitHub Pages, build stamps, link previews), the dev tools, a map of the code, and ideas for what's next |
| [Gameplay](gameplay.md) | The full controls, and the rules: the attack meter and real-time Rogue, the pack, off hand and two hands, the hotbar, damage types and resistances, curses and upgrades, statuses and allies, stamina and stealth, saving, the title screen |
| [The dungeon](dungeon.md) | The five themes and how each looks, lights, pools, difficulty, how floors are generated, doors and locked rooms, stairs, traps, chests and mimics, and the shop |
| [Blockbench models](models.md) | Where the models are, the names and conventions the game relies on (pivots, groups, anchors, textures), monster rigs, and the code that builds the models |
| [Item icons](icons.md) | The pixel-art icons in the pack and on the hotbar, rendered from the items' models: how, their poses, the tinted ones and the scrolls' runes, the marks, and how to add one |

When a change alters how something works, update its doc in the same change, so these stay true to the code.
