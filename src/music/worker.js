// Renders the game's music off the main thread (it takes a few seconds), the title theme first, and hands each
// piece's samples back as it's done (see music.js).
import { renderTitle } from './title.js';
import { renderShop } from './shop.js';

for (const [name, renderPiece] of [['title', renderTitle], ['shop', renderShop]]) {
  const piece = renderPiece();
  postMessage({ name, ...piece }, [piece.L.buffer, piece.R.buffer]);
}
