# LenaDijksma-Portfolio
My personal portfolio website

https://lenadijksma.is-a.dev/

## Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js (Express)
- Email: Resend
- Hosting: Vercel (free/Hobby tier)

## Running locally
1. Clone the repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your keys
4. Run `node server.js` (or `npm run dev` for auto-restart)

## Deploying to Vercel (free tier)
The app runs as a single Express serverless function (`api/index.js` → `app.js`),
with everything in `public/` served as static files by Vercel directly.

1. Push this repo to GitHub (the admin panel commits to it, so it needs to
   be a real GitHub repo either way).
2. In the Vercel dashboard: **Add New → Project**, import the repo, leave the
   framework preset as "Other" and the build settings default (no build
   command / output directory needed).
3. Add the environment variables below under Project Settings → Environment
   Variables.
4. Deploy. Every subsequent `git push` (including commits made by the admin
   panel itself) triggers a fresh deploy automatically.

**Note on the admin panel:** Vercel's filesystem is read-only at runtime, so
saving projects or uploading images no longer writes to local disk there —
it commits straight to GitHub instead (which was already the durable copy;
the local write was previously just a same-request convenience). This only
works if `GITHUB_TOKEN` and `GITHUB_REPO` are set — without them, save/upload
will fail on Vercel. Locally, or on a host with a writable disk, both still
happen as before.

## Environment Variables
RESEND_API_KEY=
### Only used by local dev (node server.js). Vercel ignores it.
PORT=

### email recaptcha
RECAPTCHA_SECRET=

### =========================
### ADMIN PANEL (/admin)
### =========================

### Password to log into /admin
ADMIN_PASSWORD=

### GitHub Personal Access Token with "Contents: Read and write" permission
### on this repo — required on Vercel, since it's how saves/uploads persist
GITHUB_TOKEN=

### "owner/repo", e.g. LenaDijksma/LenaDijksma-Portfolio
GITHUB_REPO=

### git-calendar (used by the /api/github/contributions route)
GITHUB_USERNAME=

### Optional, defaults shown
GITHUB_BRANCH=main
GITHUB_FILE_PATH=public/data/projects.json

## Client messaging (/messages)

Lets a returning client sign in with just their email (a magic link, no
password) and message you directly instead of a long email thread. You
reply from a "Messages" tab in the admin panel. Requires:

1. Add **Neon Postgres** to the project via the Vercel Marketplace
   (Project → Storage → Create Database → Neon). This sets `DATABASE_URL`
   automatically. Tables are created on first use, no manual migration step.
2. Set `SESSION_SECRET` to a long random string (`openssl rand -hex 32`) —
   used to sign client session cookies. Must differ from `ADMIN_PASSWORD`.
3. Set `SITE_ORIGIN` to your live URL (e.g. `https://lenadijksma.is-a.dev`),
   used to build links in emails.

```
DATABASE_URL=
SESSION_SECRET=
SITE_ORIGIN=https://lenadijksma.is-a.dev
```

