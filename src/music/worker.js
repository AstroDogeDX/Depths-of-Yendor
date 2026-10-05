// Renders the title theme off the main thread (it takes a few seconds), and hands its samples back (see music.js).
import { renderTheme } from './theme.js';

const theme = renderTheme();
postMessage(theme, [theme.L.buffer, theme.R.buffer]);
