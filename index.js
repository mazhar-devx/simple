// Minimal entry for Vercel deployment (self-contained under `node/`)
// Load the local `node/src/index.js` so the `node` folder is deployable by itself.
try {
  require('./src/index.js');
} catch (err) {
  console.error('Failed to load ./src/index.js from node/ -', err && err.message);
  // Re-throw to make deployment/build failure visible
  throw err;
}
