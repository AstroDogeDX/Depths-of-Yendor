import { Game } from './game.js';
import { UI } from './ui/ui.js';

const ui = new UI();
const game = new Game(document.getElementById('view'), ui);

// Handy for poking at the game from the dev console.
window.game = game;
