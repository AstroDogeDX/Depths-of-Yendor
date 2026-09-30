# Depths of Yendor

A first-person real-time roguelike in three.js and plain ES modules, built with Vite.

- **Docs:** how everything works is in `docs/` (index: `docs/README.md`): `development.md` (running, deploying, dev tools, code map), `gameplay.md` (controls and rules), `dungeon.md` (themes, generation, doors, stairs, traps, chests, shop) and `models.md` (Blockbench conventions). Read the one that covers what you're changing first.
- **Keep them current:** when a change alters how something works, update its doc in the same change. `README.md` is the short, player-facing front page: keep development detail out of it.
- **Models** in `assets/models/` are built from code in `tools/modelgen/`: change the builder, then `npm run models -- <name>` (or `all`; `--force` to overwrite a file with uncommitted changes, `--out <dir>` to compare first). See `docs/models.md`.
- **Checking changes:** `npx vite build` must pass. In the browser, `window.game` exposes the game, and the dev tools (the ` key) jump between floors, spawn things and so on.
