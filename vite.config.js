// Blockbench models (assets/models/*.bbmodel) are JSON: import them as compact objects rather than text,
// which keeps their whitespace and escaping out of the bundle.
export default {
  // Relative asset paths, so a build works wherever it's served from: the root of a site, or a subfolder like
  // GitHub Pages' https://<user>.github.io/<repo>/.
  base: './',
  plugins: [{
    name: 'bbmodel',
    transform(code, id) {
      if (id.split('?')[0].endsWith('.bbmodel')) return { code: `export default ${JSON.stringify(JSON.parse(code))};`, map: null };
    },
  }],
};
