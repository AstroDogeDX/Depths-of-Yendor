import { Game } from './game.js';
import { UI } from './ui/ui.js';

const ui = new UI();
const game = new Game(document.getElementById('view'), ui);

// Handy for poking at the game from the dev console.
window.game = game;

// Dev tools (the ` key): always while developing, and in a build opened with ?dev in the address. They're
// their own small download, so players never fetch them.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) {
  import('./ui/devTools.js').then(({ DevTools }) => { game.dev = new DevTools(game); });
}
