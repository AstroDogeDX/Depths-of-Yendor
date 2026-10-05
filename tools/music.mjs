// Renders the game's music (src/music/) to .wav files, to listen to as it's worked on, and says how loud each
// instrument came out: `npm run music` renders every piece into dist/ (title-theme.wav, shop-theme.wav), and
// `npm run music -- shop` just that one. It's the same rendering the game does in a worker as it starts (see
// src/music/music.js).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderTitle } from '../src/music/title.js';
import { renderShop } from '../src/music/shop.js';

const PIECES = { title: renderTitle, shop: renderShop };

/** 16-bit stereo PCM in a RIFF/WAVE file. */
function wav(left, right, rate) {
  const n = left.length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(2, 22); // two channels
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return data;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PIECES);
mkdirSync(resolve('dist'), { recursive: true });
for (const name of names) {
  if (!PIECES[name]) {
    console.error(`No piece called ${name}: ${Object.keys(PIECES).join(', ')}`);
    process.exitCode = 1;
    continue;
  }
  const t0 = performance.now();
  const { L, R, sampleRate, loop, levels } = PIECES[name]();
  const out = resolve(`dist/${name}-theme.wav`);
  writeFileSync(out, wav(L, R, sampleRate));
  console.log(`${name}: ${loop.toFixed(1)} s, rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${out}`);
  console.log('  each instrument, while it plays (dB):', Object.entries(levels).map(([k, v]) => `${k} ${v}`).join(', '));
}
