// Minimal entry for Vercel deployment (self-contained under `node/`)
// Load the local `node/src/index.js` so the `node` folder is deployable by itself.
try {
  require('./src/index.js');
} catch (err) {
  console.warn('Could not load ./src/index.js from node/. This environment may be read-only or not support the bot.');
  console.warn('Error:', err && err.message);
  console.warn('Continuing without starting the WhatsApp bot. For a working persistent bot, deploy to a VPS/Render/Fly/Heroku.');
  // Do not throw — allow build/deploy to succeed on Vercel (serverless). The bot cannot run on Vercel.
}
