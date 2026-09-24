// The title logo: hand-drawn pixel capitals in shaded gold, "DEPTHS" over "YENDOR" with a small "OF" between
// two ruby-set rules. Drawn into a small canvas that CSS scales up with crisp pixels; update() sweeps a glint
// across it every few seconds.

const BIG = {
  D: [
    '##########...',
    '.###....####.',
    '.###.....###.',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###......###',
    '.###.....###.',
    '.###....####.',
    '##########...',
  ],
  E: [
    '############',
    '.###.....###',
    '.###......##',
    '.###.......#',
    '.###...#....',
    '.###...#....',
    '.#######....',
    '.#######....',
    '.###...#....',
    '.###...#....',
    '.###.......#',
    '.###......##',
    '.###.....###',
    '############',
  ],
  P: [
    '##########..',
    '.###....###.',
    '.###.....###',
    '.###.....###',
    '.###.....###',
    '.###.....###',
    '.###....###.',
    '.########...',
    '.###........',
    '.###........',
    '.###........',
    '.###........',
    '.###........',
    '#####.......',
  ],
  T: [
    '#############',
    '##...###...##',
    '#....###....#',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '...#######...',
  ],
  H: [
    '#####....#####',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '.############.',
    '.############.',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '.###......###.',
    '#####....#####',
  ],
  S: [
    '...#####..#',
    '.###...####',
    '###......##',
    '###.......#',
    '####.......',
    '.######....',
    '..#######..',
    '....######.',
    '......#####',
    '........###',
    '#.......###',
    '##......###',
    '####...###.',
    '#..#####...',
  ],
  Y: [
    '#####...#####',
    '.###.....###.',
    '.###.....###.',
    '..###...###..',
    '..###...###..',
    '...###.###...',
    '....#####....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '.....###.....',
    '...#######...',
  ],
  N: [
    '####.....####',
    '.####.....##.',
    '.####.....##.',
    '.#####....##.',
    '.#####....##.',
    '.##.###...##.',
    '.##..###..##.',
    '.##..###..##.',
    '.##...###.##.',
    '.##....#####.',
    '.##....#####.',
    '.##.....####.',
    '.##.....####.',
    '####.....###.',
  ],
  O: [
    '....#####....',
    '..###...###..',
    '.###.....###.',
    '.###.....###.',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '.###.....###.',
    '.###.....###.',
    '..###...###..',
    '....#####....',
  ],
  R: [
    '##########...',
    '.###....###..',
    '.###.....###.',
    '.###.....###.',
    '.###.....###.',
    '.###....###..',
    '.#########...',
    '.###...###...',
    '.###....###..',
    '.###....###..',
    '.###.....###.',
    '.###.....###.',
    '.###......###',
    '#####.....###',
  ],
};

const SMALL = {
  O: ['..###..', '.##.##.', '##...##', '##...##', '##...##', '##...##', '.##.##.', '..###..'],
  F: ['######', '.##..#', '.##...', '.####.', '.##...', '.##...', '.##...', '####..'],
};

const GEM = ['..#..', '.###.', '#####', '.###.', '..#..'];

const GAP = 2; // between letters
const PAD = 4; // room for the outline and shadow

// Polished gold, lit from above: bright at the top of each letter, a dark band across the middle like a
// reflected horizon, then warm again below.
const GOLD = ['#fff4c0', '#ffe08a', '#f4c860', '#e8b44a', '#d8a03c', '#c48a30', '#8a5a1c',
  '#a06c24', '#c08838', '#d49c44', '#c89040', '#b07c34', '#946428', '#7a501e'].map(rgb);
const RUBY = ['#ffd0d0', '#ff6060', '#d01828', '#8a0c18', '#50060c'].map(rgb);
const OUTLINE = rgb('#140a02');

function rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function wordWidth(word, font) {
  return [...word].reduce((w, ch) => w + font[ch][0].length, 0) + GAP * (word.length - 1);
}

export class Logo {
  constructor(canvas) {
    this.canvas = canvas;
    const top = 'DEPTHS', bottom = 'YENDOR';
    const inner = Math.max(wordWidth(top, BIG), wordWidth(bottom, BIG));
    this.w = inner + PAD * 2;
    this.h = 14 + 3 + 8 + 3 + 14 + PAD * 2;
    canvas.width = this.w;
    canvas.height = this.h;
    this.ctx = canvas.getContext('2d');
    this.image = this.ctx.createImageData(this.w, this.h);

    // Each lit pixel: which part it is (gold letters or ruby gems) and its shade row.
    this.kind = new Uint8Array(this.w * this.h); // 0 none, 1 gold, 2 ruby
    this.row = new Float32Array(this.w * this.h);
    const put = (glyph, x0, y0, kind, rows) => {
      glyph.forEach((line, y) => [...line].forEach((c, x) => {
        if (c !== '#') return;
        const i = (y0 + y) * this.w + x0 + x;
        this.kind[i] = kind;
        this.row[i] = (y / (glyph.length - 1)) * (rows - 1);
      }));
    };
    const word = (text, font, y0, rows) => {
      let x = PAD + Math.round((inner - wordWidth(text, font)) / 2);
      for (const ch of text) {
        put(font[ch], x, y0, 1, rows);
        x += font[ch][0].length + GAP;
      }
    };
    word(top, BIG, PAD, GOLD.length);
    const midY = PAD + 14 + 3;
    word('OF', SMALL, midY, GOLD.length);
    // Rules either side of "OF", each ending in a gem.
    const ofW = wordWidth('OF', SMALL), ofX = PAD + Math.round((inner - ofW) / 2);
    const ruleY = midY + 4;
    for (let x = PAD + 1; x < this.w - PAD - 1; x++) {
      if (x > ofX - 9 && x < ofX + ofW + 8) continue;
      this.kind[ruleY * this.w + x] = 1;
      this.row[ruleY * this.w + x] = 3;
    }
    put(GEM, ofX - 8, ruleY - 2, 2, RUBY.length);
    put(GEM, ofX + ofW + 3, ruleY - 2, 2, RUBY.length);
    word(bottom, BIG, midY + 8 + 3, GOLD.length);
    this.glintT = 1.5;
    this.draw(-100);
  }

  /** Pixels the size of whole screen pixels: the largest whole scale that fits `maxWidth`. */
  fit(maxWidth) {
    const scale = Math.max(1, Math.floor(maxWidth / this.w));
    this.canvas.style.width = `${this.w * scale}px`;
    this.canvas.style.height = `${this.h * scale}px`;
  }

  update(dt) {
    this.glintT -= dt;
    if (this.glintT < -1) this.glintT = 4 + Math.random() * 3;
    // The glint crosses in the second before glintT reaches -1.
    this.draw(this.glintT < 0 ? -20 + (-this.glintT) * (this.w + 40) : -100);
  }

  draw(glint) {
    const { w, h, kind, row } = this;
    const d = this.image.data;
    d.fill(0);
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && kind[y * w + x] !== 0;
    const set = (i, c, a = 255) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = a; };
    // Shadow, then outline, then the shaded letters on top.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) { near = true; break; }
      if (near) set(y * w + x, OUTLINE);
      else if (on(x - 1, y - 2) || on(x, y - 2) || on(x - 1, y - 1)) set(y * w + x, [0, 0, 0], 170);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!kind[i]) continue;
      const pal = kind[i] === 2 ? RUBY : GOLD;
      const r = Math.min(pal.length - 1, Math.max(0, Math.round(row[i])));
      let c = pal[r];
      if (!on(x, y - 1)) c = mix(c, [255, 255, 240], 0.3); // top edges catch the light
      if (!on(x, y + 1)) c = mix(c, [40, 20, 5], 0.3);
      if (!on(x - 1, y)) c = mix(c, [255, 250, 220], 0.12);
      if (!on(x + 1, y)) c = mix(c, [40, 20, 5], 0.18);
      const g = Math.abs(x + y * 0.6 - glint);
      if (g < 2.5) c = mix(c, [255, 252, 235], (1 - g / 2.5) * 0.85);
      set(i, c);
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
