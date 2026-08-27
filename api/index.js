// Vercel serverless entrypoint. Every request that isn't a static file gets
// routed here by vercel.json, and Vercel's Node runtime invokes the exported
// Express app directly (it has the same (req, res) signature Vercel expects).
module.exports = require('../app');
