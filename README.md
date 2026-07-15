Deployment instructions

- To deploy only the Node app on Vercel set the Project Root to `node` in the Vercel project settings.
- Or deploy with the Vercel CLI from repository root: `vercel --cwd node`.
- The `node/index.js` file loads the app from `../src/index.js` to avoid copying code.

Local Python dashboard

- Run `python dashboard.py` from repository root to run the dashboard locally.
- The Python dashboard and virtual environment remain at repository root and are not required for the Node deployment.
