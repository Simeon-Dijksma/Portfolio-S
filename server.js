// Local development entrypoint. On Vercel, api/index.js is the entrypoint
// instead — the actual app (routes, middleware) lives in app.js so both can
// share it.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
