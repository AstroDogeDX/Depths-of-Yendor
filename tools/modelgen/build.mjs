// Regenerates Blockbench models from the code in this folder:
//
//   npm run models -- [--out <dir>] [--force] <name>... | all
//
// Writes assets/models/<file>.bbmodel. Once generated, those files are the game's source and may have been
// edited in Blockbench since, so one with uncommitted changes is left alone unless you pass --force.
// --out writes the models under another folder instead, to preview or compare them without touching the game.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { weapons } from './weapons.mjs';
import { torch } from './torch.mjs';
import { sconce } from './sconce.mjs';
import { items } from './items.mjs';
import { armors } from './armor.mjs';
import { artefacts } from './artefacts.mjs';
import { monsters } from './monsters.mjs';
import { props } from './props.mjs';
import { npcs } from './npcs.mjs';
import { sewers } from './sewers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODELS = {
  ...Object.fromEntries(Object.entries(weapons).map(([name, build]) => [name, { file: `weapons/${name}.bbmodel`, build }])),
  torch: { file: 'torch.bbmodel', build: torch },
  sconce: { file: 'sconce.bbmodel', build: sconce },
  ...Object.fromEntries(Object.entries(monsters).map(([name, build]) => [name, { file: `monsters/${name}.bbmodel`, build }])),
  ...Object.fromEntries(Object.entries({ ...props, ...sewers }).map(([name, build]) => [name, { file: `props/${name}.bbmodel`, build }])),
  ...Object.fromEntries(Object.entries(npcs).map(([name, build]) => [name, { file: `npcs/${name}.bbmodel`, build }])),
  ...Object.fromEntries(Object.entries({ ...items, ...armors, ...artefacts }).map(([name, build]) => [name, { file: `items/${name}.bbmodel`, build }])),
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const outAt = args.indexOf('--out');
const outDir = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(ROOT, 'assets/models');
const names = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
const list = names.includes('all') ? Object.keys(MODELS) : names;
const unknown = list.filter((n) => !MODELS[n]);
if (!list.length || unknown.length) {
  if (unknown.length) console.error(`Unknown model: ${unknown.join(', ')}`);
  console.error(`usage: npm run models -- [--out <dir>] [--force] <${Object.keys(MODELS).join('|')}|all>...`);
  process.exit(1);
}

// Uncommitted changes (or a file git doesn't track yet) may be edits made in Blockbench.
function hasLocalChanges(file) {
  if (!fs.existsSync(file)) return false;
  try {
    return execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  } catch {
    return false; // outside the repository
  }
}

for (const name of list) {
  const { file, build } = MODELS[name];
  const target = path.join(outDir, file);
  if (!force && hasLocalChanges(target)) {
    console.warn(`Skipped ${name}: ${path.relative(ROOT, target)} has uncommitted changes. Commit them, or pass --force to overwrite.`);
    process.exitCode = 1;
    continue;
  }
  const { text, stats } = build().bake();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  console.log(`${name}: ${stats.faces} faces, ${stats.texture} texture -> ${path.relative(process.cwd(), target)}`);
}
