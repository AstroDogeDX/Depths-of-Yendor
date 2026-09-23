// Blockbench models (assets/models/*.bbmodel) are JSON: import them as compact objects rather than text,
// which keeps their whitespace and escaping out of the bundle.
export default {
  plugins: [{
    name: 'bbmodel',
    transform(code, id) {
      if (id.endsWith('.bbmodel')) return { code: `export default ${JSON.stringify(JSON.parse(code))};`, map: null };
    },
  }],
};
