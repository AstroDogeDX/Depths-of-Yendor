// Hand-drawn pixel art for the icons (painted by icons.js, which renders the items' own icons from their models): the
// runes painted on scrolls' icons, and the marks for what things do. A map is rows of characters, one per pixel: '.' is
// nothing, and every other character a colour from PALETTE, or from the map's own `colors`. Leave a pixel's margin
// round the art: icons.js outlines everything in OUTLINE.

export const OUTLINE = '#170d07';

// Colours the marks share: the outline's (for dark lines inside the art), white glints, a pink and a pale blue
// highlight, and fire, light to dark.
export const PALETTE = {
  '#': OUTLINE,
  W: '#ffffff',
  P: '#ff8a8a',
  V: '#eef7ff',
  a: '#fff6c4', b: '#ffc948', c: '#ff8325',
};

// Runes for the scrolls, 5 across and 6 down, painted in RUNE_INK on the middle of an open scroll's sheet: each kind of
// scroll is given one each run (Knowledge.rune). There are more than kinds of scroll, to leave room for new ones.
export const RUNE_INK = '#5a1c12';
export const RUNES = [
  ['..x..', '.xxx.', 'x.x.x', '..x..', '..x..', '..x..'],
  ['x.x.x', '.xxx.', '..x..', '..x..', '..x..', '..x..'],
  ['..x..', '.x.x.', 'x...x', '.x.x.', '..x..', '.x.x.'],
  ['x...x', 'xx.xx', 'x.x.x', 'x.x.x', 'xx.xx', 'x...x'],
  ['x...x', '.x.x.', '..x..', '..x..', '.x.x.', 'x...x'],
  ['...x.', '..x..', '.xxx.', '...x.', '..x..', '.x...'],
  ['x....', 'xx...', 'x.x..', 'x.x..', 'xx...', 'x....'],
  ['xxx..', 'x..x.', 'xxx..', 'x.x..', 'x..x.', 'x...x'],
  ['...x.', '..x..', '.x...', '.x...', '..x..', '...x.'],
  ['x...x', 'x...x', 'xx..x', 'x.x.x', 'x..xx', 'x...x'],
  ['..x..', 'x.x..', '.xx..', '..xx.', '..x.x', '..x..'],
  ['xx...', 'x.x..', 'x..x.', 'x....', 'x....', 'x....'],
  ['xx...', 'x.x..', 'xx...', 'xx...', 'x.x..', 'xx...'],
  ['.....', '.xxx.', 'x...x', 'x.x.x', 'x...x', '.xxx.'],
  ['..xx.', '..x..', '..x..', '..x..', '..x..', '.xx..'],
  ['xx...', 'x.x..', 'xx...', 'x....', 'x....', 'x....'],
];

// The marks in the corners of pack tiles (MARKS in tiles.js), for what a thing does: 9 rows of 9, the same way.
export const MARK_ICONS = {
  fire: { map: ['.........', '....c....', '...cb....', '...cbc...', '..cbabc..', '..cbaac..', '..cbaac..', '...ccc...', '.........'] },
  ice: { map: ['.........', '....i....', '..i.i.i..', '...iji...', '.iijWjii.', '...iji...', '..i.i.i..', '....i....', '.........'], colors: { i: '#9fdcff', j: '#e2f6ff' } },
  lightning: { map: ['.........', '.....yy..', '....yy...', '...yyyy..', '....yy...', '...yy....', '...y.....', '..y......', '.........'], colors: { y: '#ffe04a' } },
  poison: { map: ['.........', '....g....', '...ggg...', '..gghgg..', '..gWggg..', '..ggggh..', '..gghhh..', '...hhh...', '.........'], colors: { g: '#b466e8', h: '#6a2a98' } },
  magic: { map: ['.........', '....v....', '....v....', '...vwv...', '.vvwWwvv.', '...vwv...', '....v....', '....v....', '.........'], colors: { v: '#9a5cff', w: '#d8b8ff' } },
  // (Healing's green cross, as you see it rise up your view as you heal: see fx/screenFx.js.)
  heal: { map: ['.........', '...ggh...', '...gWh...', '.ggggggh.', '.ggggggh.', '.hhggghh.', '...ggh...', '...hhh...', '.........'], colors: { g: '#99f28c', h: '#4fa046' } },
  // (A heart, for a charm: nothing has it yet.)
  charm: { map: ['.........', '..rr.rr..', '.rPrrrrr.', '.rrrrrrq.', '.rrrrrrq.', '..rrrrq..', '...rrq...', '....q....', '.........'], colors: { r: '#e8364a', q: '#9c1a2a' } },
  strength: { map: ['.........', '..oooo...', '.opopopo.', '.opopopo.', '.ooooooo.', '.oppppq..', '.ooopq...', '..oooq...', '.........'], colors: { o: '#f0a848', p: '#b86a22', q: '#8a4a14' } },
  experience: { map: ['.........', '....y....', '...yky...', '.yyykyyy.', '..yyyyy..', '..yyzyy..', '.yyz.zyy.', '.yz...zy.', '.........'], colors: { y: '#f4c440', k: '#fff2b0', z: '#b4841c' } },
  haste: { map: ['.........', '.t..t....', '..t..t...', '...t..t..', '....t..t.', '...t..t..', '..t..t...', '.t..t....', '.........'], colors: { t: '#5ee0d0' } },
  mind: { map: ['.........', '.........', '..vvvvv..', '.vwwiwwv.', '.vwikiwv.', '.vwwiwwv.', '..vvvvv..', '.........', '.........'], colors: { v: '#a47cff', w: '#ece4ff', i: '#b890ff', k: '#2a1a4a' } },
  confusion: { map: ['.........', '..pppp...', '.p....p..', '.p.pp.p..', '.p.p..p..', '.p..pp...', '..p......', '...ppppp.', '.........'], colors: { p: '#e070e0' } },
  darkness: { map: ['.........', '...mmm...', '..mm.....', '.mm......', '.mm......', '.mm......', '..mm.....', '...mmm...', '.........'], colors: { m: '#8a8ab8' } },
  paralysis: { map: ['.........', '.zzzzz...', '....z....', '...z.....', '..z......', '.zzzzz...', '.....zzz.', '......z..', '.........'], colors: { z: '#a8c8ff' } },
  identify: { map: ['.........', '..www....', '.w...w...', '.w.V.w...', '.w...w...', '..www....', '.....ss..', '......ss.', '.........'], colors: { w: '#e8dcb0', s: '#a08050' } },
  upgrade: { map: ['.........', '....u....', '...uuu...', '..uuuuu..', '.uuuuuuu.', '...uuu...', '...uuu...', '...uuu...', '.........'], colors: { u: '#6aa8ff' } },
  cleanse: { map: ['.........', '....k....', '.k..k..k.', '..k.k.k..', '.kkkWkkk.', '..k.k.k..', '.k..k..k.', '....k....', '.........'], colors: { k: '#fff0b8' } },
  teleport: { map: ['.........', '...ppp...', '..p...p..', '.p..q..p.', '.p.qWq.p.', '.p..q..p.', '..p...p..', '...ppp...', '.........'], colors: { p: '#9a58ff', q: '#d8b8ff' } },
  map: { map: ['.........', '.sssssss.', '.s..s..s.', '.s..s..s.', '.ssss.ss.', '.s.....s.', '.s..s..s.', '.sssssss.', '.........'], colors: { s: '#d8b070' } },
  aggravate: { map: ['.........', '....r....', '...rrr...', '...rrr...', '...rrr...', '....r....', '.........', '....r....', '.........'], colors: { r: '#ff5a3a' } },
  fear: { map: ['.........', '..sssss..', '.sssssss.', '.s#sss#s.', '.s#sss#s.', '.ssss#ss.', '..sssss..', '..s.s.s..', '.........'], colors: { s: '#e8e4b8' } },
  summon: { map: ['.........', '.r.....r.', '.rr...rr.', '..rrrrr..', '..ryryr..', '..rrrrr..', '...rqr...', '....r....', '.........'], colors: { r: '#e84830', q: '#8a1a10', y: '#ffe04a' } },
  recharge: { map: ['.........', '......k..', '.....kWk.', '....y.k..', '...y.....', '..y......', '.y.......', '.........', '.........'], colors: { y: '#c89a50', k: '#ffd040' } },
  enchant: { map: ['.........', '.........', '....y....', '...yky...', '.yykWkyy.', '...yky...', '....y....', '.........', '.........'], colors: { y: '#f4c860', k: '#fff2b0' } },
  protection: { map: ['.........', '.sssssss.', '.sWsssst.', '.sssssst.', '.sssssst.', '..sssst..', '...sst...', '....t....', '.........'], colors: { s: '#c8d0dc', t: '#7c8898' } },
  food: { map: ['.........', '....bbb..', '...bbbbb.', '...bbbbc.', '....bbc..', '...w.....', '..ww.....', '.w.......', '.........'], colors: { b: '#c8783a', c: '#8a4a1e', w: '#f0e8d8' } },
  quiet: { map: ['.........', '......ww.', '.....wgw.', '....wgw..', '...wgw...', '..wgw....', '..g......', '.g.......', '.........'], colors: { w: '#dde4ee', g: '#8894a4' } },
  steady: { map: ['.........', '...aaa...', '...a.a...', '....a....', '..aaaaa..', '....a....', '.a..a..a.', '..aaaaa..', '.........'], colors: { a: '#a8bcd4' } },
  thorns: { map: ['.........', '...t.t...', '...t.t...', '..tt.tt..', '..tt.tt..', '.ttttttt.', '.uuuuuuu.', '.........', '.........'], colors: { t: '#e0dcc0', u: '#8a4a2a' } },
};
