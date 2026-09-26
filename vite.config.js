import { execSync } from 'node:child_process';

/**
 * What build of the game this is, stamped into the code as __BUILD__ (see src/build.js): when it was built, from
 * which commit, and on GitHub (see .github/workflows/deploy.yml) the deploy workflow's run number, which counts up
 * with every publish. The dev server stamps itself as a development build.
 */
function buildInfo(command) {
  let sha = process.env.GITHUB_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch { /* not a git checkout: no commit to name */ }
  }
  return { time: new Date().toISOString(), sha: sha.slice(0, 7), run: +(process.env.GITHUB_RUN_NUMBER ?? 0), dev: command === 'serve' };
}

export default ({ command }) => ({
  // Relative asset paths, so a build works wherever it's served from: the root of a site, or a subfolder like
  // GitHub Pages' https://<user>.github.io/<repo>/.
  base: './',
  define: { __BUILD__: JSON.stringify(buildInfo(command)) },
  // Blockbench models (assets/models/*.bbmodel) are JSON: import them as compact objects rather than text,
  // which keeps their whitespace and escaping out of the bundle.
  plugins: [{
    name: 'bbmodel',
    transform(code, id) {
      if (id.split('?')[0].endsWith('.bbmodel')) return { code: `export default ${JSON.stringify(JSON.parse(code))};`, map: null };
    },
  }],
});
