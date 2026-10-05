import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { prepareIcons } from './ui/icons.js';

// The item icons are rendered from the models, once their textures have loaded: long before a run starts.
prepareIcons();
const ui = new UI();
const game = new Game(document.getElementById('view'), ui);

// Handy for poking at the game from the dev console.
window.game = game;

// Browsers hold all sound back till the first click or key on the page: that starts it, and the title theme with it.
const unlock = () => {
  game.audio.init();
  game.music.update();
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
};
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

// Dev tools (the ` key): always while developing, and in a build opened with ?dev in the address. They're
// their own small download, so players never fetch them.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) {
  import('./ui/devTools.js').then(({ DevTools }) => { game.dev = new DevTools(game); });
}
