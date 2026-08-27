require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

app.set("trust proxy", 1);

// Serve static files (mainly a fallback for local dev — on Vercel, files in
// /public are served directly by the platform without hitting this function)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const routes = require('./routes');
app.use('/', routes);

// Make body-parser errors (e.g. payload too large) return JSON instead of
// Express's default HTML error page, which breaks fetch()'s res.json() calls
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload too large.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body.' });
  }
  next(err);
});

module.exports = app;
