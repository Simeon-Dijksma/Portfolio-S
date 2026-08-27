const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Resend } = require('resend');
const rateLimit = require("express-rate-limit");
const { renderProjectPage } = require('./templates');

const router = express.Router();

const resend =
    new Resend(process.env.RESEND_API_KEY);

const PROJECTS_PATH = path.join(__dirname, 'public', 'data', 'projects.json');
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 10 minutes
    max: 3, // limit each IP to 3 requests per window
    message: {
        error: "Too many messages. Try again later."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// =========================
// ADMIN AUTH HELPERS
// =========================

function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        cookies[key] = decodeURIComponent(val);
    });
    return cookies;
}

function createSessionToken() {
    const secret = process.env.ADMIN_PASSWORD;
    const expiry = Date.now() + SESSION_MAX_AGE_MS;
    const hmac = crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
    return `${expiry}.${hmac}`;
}

function verifySessionToken(token) {
    if (!token || !process.env.ADMIN_PASSWORD) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [expiryStr, hmac] = parts;
    const expiry = Number(expiryStr);
    if (!expiry || Date.now() > expiry) return false;

    const secret = process.env.ADMIN_PASSWORD;
    const expected = crypto.createHmac('sha256', secret).update(expiryStr).digest('hex');

    const a = Buffer.from(hmac);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function setSessionCookie(res, token) {
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader(
        'Set-Cookie',
        `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_MS / 1000}; SameSite=Strict${isProd ? '; Secure' : ''}`
    );
}

function clearSessionCookie(res) {
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader(
        'Set-Cookie',
        `admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${isProd ? '; Secure' : ''}`
    );
}

function requireAuth(req, res, next) {
    const cookies = parseCookies(req);
    if (verifySessionToken(cookies.admin_session)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// Very small in-memory brute-force guard (resets on restart, fine for a personal site)
const loginAttempts = new Map(); // ip -> { count, firstAttempt }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function isLockedOut(ip) {
    const entry = loginAttempts.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(ip);
        return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
    const entry = loginAttempts.get(ip);
    if (!entry || Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
        loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
    } else {
        entry.count += 1;
    }
}

function clearAttempts(ip) {
    loginAttempts.delete(ip);
}

// =========================
// GITHUB COMMIT HELPER
// =========================

async function commitFileToGitHub(repoFilePath, base64Content, message) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // "owner/repo"
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !repo) {
        throw new Error('GitHub integration is not configured (missing GITHUB_TOKEN or GITHUB_REPO)');
    }

    const apiUrl = `https://api.github.com/repos/${repo}/contents/${repoFilePath}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'lenadijksma-portfolio-admin',
        Accept: 'application/vnd.github+json'
    };

    // Look up the current sha if the file already exists (needed to update rather than create)
    let sha;
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (getRes.ok) {
        sha = (await getRes.json()).sha;
    } else if (getRes.status !== 404) {
        throw new Error(`Could not read current file from GitHub (${getRes.status})`);
    }

    const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            content: base64Content,
            ...(sha ? { sha } : {}),
            branch
        })
    });

    if (!putRes.ok) {
        const errBody = await putRes.text();
        throw new Error(`GitHub commit failed (${putRes.status}): ${errBody}`);
    }

    return putRes.json();
}

async function commitProjectsToGitHub(projects) {
    const filePath = process.env.GITHUB_FILE_PATH || 'public/data/projects.json';
    const content = Buffer
        .from(JSON.stringify(projects, null, 4) + '\n')
        .toString('base64');

    return commitFileToGitHub(filePath, content, 'Update projects.json via admin panel');
}

// Reads projects.json straight from GitHub (the real source of truth once
// GITHUB_TOKEN/GITHUB_REPO are set). This matters on serverless platforms
// like Vercel, where the local copy on disk is whatever was bundled at the
// last deploy and can't reflect a save made since then. Returns null if
// GitHub isn't configured or the read fails, so callers can fall back to disk.
async function getProjectsFromGitHub() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) return null;

    const branch = process.env.GITHUB_BRANCH || 'main';
    const filePath = process.env.GITHUB_FILE_PATH || 'public/data/projects.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;

    try {
        const res = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                'User-Agent': 'lenadijksma-portfolio-admin',
                Accept: 'application/vnd.github+json'
            }
        });
        if (!res.ok) return null;
        const json = await res.json();
        return JSON.parse(Buffer.from(json.content, 'base64').toString('utf-8'));
    } catch (error) {
        console.warn('Could not read projects.json from GitHub:', error.message);
        return null;
    }
}

// Writing to disk is best-effort: it works locally and on traditional hosts,
// but serverless platforms like Vercel have a read-only filesystem at
// runtime, so this fails there — which is fine, since GitHub is the durable
// copy. Callers should only treat persistence as failed if the GitHub commit
// *also* fails.
async function persistProjectsLocal(projects) {
    try {
        await fs.promises.writeFile(
            PROJECTS_PATH,
            JSON.stringify(projects, null, 4) + '\n'
        );
        return true;
    } catch (error) {
        console.warn('Local projects.json write skipped (read-only filesystem?):', error.message);
        return false;
    }
}

async function commitImageToGitHub(imageRelativePath, base64Content) {
    // imageRelativePath e.g. "public/images/netscan-showcase.webp"
    return commitFileToGitHub(imageRelativePath, base64Content, `Add ${imageRelativePath} via admin panel`);
}

// =========================
// PAGES
// =========================

router.get('/', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});

router.get('/autonote', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'autonote.html')
    );
});

router.get('/admin43AE39', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'admin.html')
    );
});

// =========================
// ADMIN API
// =========================

router.post('/admin/api/login', (req, res) => {

    if (!process.env.ADMIN_PASSWORD) {
        return res.status(500).json({ error: 'Admin login is not configured on the server' });
    }

    const ip = req.ip;

    if (isLockedOut(ip)) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    const { password } = req.body || {};
    const supplied = Buffer.from(String(password || ''));
    const expected = Buffer.from(process.env.ADMIN_PASSWORD);

    const match = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);

    if (!match) {
        recordFailedAttempt(ip);
        return res.status(401).json({ error: 'Incorrect password' });
    }

    clearAttempts(ip);
    setSessionCookie(res, createSessionToken());
    res.json({ success: true });
});

router.post('/admin/api/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ success: true });
});

router.get('/admin/api/session', requireAuth, (req, res) => {
    res.json({ authenticated: true });
});

router.get('/admin/api/projects', requireAuth, async (req, res) => {
    const fromGitHub = await getProjectsFromGitHub();
    if (fromGitHub) return res.json(fromGitHub);

    try {
        const raw = await fs.promises.readFile(PROJECTS_PATH, 'utf-8');
        res.json(JSON.parse(raw));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to read projects.json' });
    }
});

router.post('/admin/api/projects', requireAuth, async (req, res) => {

    const projects = req.body;

    if (!Array.isArray(projects)) {
        return res.status(400).json({ error: 'Expected a JSON array of projects' });
    }

    for (const project of projects) {
        if (typeof project.title !== 'string' || typeof project.name !== 'string') {
            return res.status(400).json({ error: 'Every project needs at least a title and a name' });
        }
    }

    const localSaved = await persistProjectsLocal(projects);

    try {
        await commitProjectsToGitHub(projects);
        res.json({ success: true, committed: true, localSaved });
    } catch (error) {
        console.error(error);
        if (!localSaved) {
            // Neither the local write nor the GitHub commit worked - nothing
            // was actually persisted.
            return res.status(500).json({ error: `Failed to save projects: ${error.message}` });
        }
        res.json({
            success: true,
            committed: false,
            localSaved,
            warning: `Saved on the live server, but the GitHub commit failed: ${error.message}`
        });
    }
});

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function sanitizeImageFilename(name) {
    const ext = path.extname(String(name || '')).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) return null;

    const base = path.basename(String(name || ''), ext)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${Date.now()}-${base || 'image'}${ext}`;
}

router.post('/admin/api/upload-image', requireAuth, express.json({ limit: '8mb' }), async (req, res) => {

    const { filename, data } = req.body || {};

    if (!filename || !data) {
        return res.status(400).json({ error: 'Missing filename or image data' });
    }

    const safeName = sanitizeImageFilename(filename);
    if (!safeName) {
        return res.status(400).json({ error: 'Unsupported file type. Use png, jpg, jpeg, webp, gif, or svg.' });
    }

    const base64 = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({ error: 'Image is too large. Max size is 5MB.' });
    }

    const localPath = path.join(__dirname, 'public', 'images', safeName);

    let localSaved = false;
    try {
        await fs.promises.writeFile(localPath, buffer);
        localSaved = true;
    } catch (error) {
        // Read-only filesystem (e.g. Vercel) — not fatal, GitHub is the durable copy.
        console.warn('Local image write skipped (read-only filesystem?):', error.message);
    }

    const publicPath = `/images/${safeName}`;

    try {
        await commitImageToGitHub(`public/images/${safeName}`, base64);
        res.json({ success: true, path: publicPath, committed: true, localSaved });
    } catch (error) {
        console.error(error);
        if (!localSaved) {
            return res.status(500).json({ error: `Failed to save image: ${error.message}` });
        }
        res.json({
            success: true,
            path: publicPath,
            committed: false,
            localSaved,
            warning: `Saved on the live server, but the GitHub commit failed: ${error.message}`
        });
    }
});

// =========================
// SEND EMAIL
// =========================

router.post("/send-email", contactLimiter, async (req, res) => {

    try {

        const {
            name,
            email,
            subject,
            message,
            company,
            captcha
        } = req.body;

        // HONEYPOT SPAM CHECK

        if (company) {
            return res
                .status(400)
                .json({
                    error: 'Spam detected'
                });
        }

        const verifyResponse = await fetch(
            "https://www.google.com/recaptcha/api/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    secret: process.env.RECAPTCHA_SECRET,
                    response: captcha
                })
            }
        );

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
            return res.status(400).json({
                error: "Captcha verification failed"
            });
        }

        const data =
            await resend.emails.send({

                from:
                    'Portfolio Contact <noreply@lenadijksma.is-a.dev>',

                to:
                    'lenadijksma08@gmail.com',

                subject:
                    `[Portfolio] ${subject}`,

                html: `
                    <h2>New Portfolio Contact</h2>

                    <p>
                        <strong>Name:</strong>
                        ${name}
                    </p>

                    <p>
                        <strong>Email:</strong>
                        ${email}
                    </p>

                    <p>
                        <strong>Subject:</strong>
                        ${subject}
                    </p>

                    <p>
                        <strong>Message:</strong>
                    </p>

                    <p>
                        ${message}
                    </p>
                `
            });

        res.json({
            success: true,
            data
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Failed to send email'
        });
    }
});

// =========================
// AUTO-GENERATED PROJECT PAGES
// =========================
// Any private project with a "page" object in projects.json gets a page
// rendered on the fly here, matching whatever it links to (e.g. "/netscan").
// Explicit routes registered above (like /netscan, /autonote) always win,
// so this only fires for slugs that don't already have a real route/file.

router.get('/:slug', async (req, res, next) => {

    const slug = req.params.slug;

    try {
        const raw = await fs.promises.readFile(PROJECTS_PATH, 'utf-8');
        const projects = JSON.parse(raw);

        const project = projects.find(
            p => !p.public && p.page && p.link === `/${slug}`
        );

        if (!project) return next();

        res.send(renderProjectPage(project, slug));
    } catch (error) {
        console.error(error);
        next();
    }
});

// =========================
// GITHUB CONTRIBUTIONS
// =========================

router.get('/api/github/contributions', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const username = process.env.GITHUB_USERNAME;

        if (!username) {
            return res.status(500).json({
                error: "GitHub username not configured"
            });
        }

        // GitHub's GraphQL API only folds private/internal repo activity into
        // contributionsCollection when the token carries the "read:user" scope
        // (see docs.github.com/en/graphql/reference/users#contributionscollection).
        // That's a much broader grant than the fine-grained, single-repo token
        // used for the admin panel commits above, so this route deliberately
        // uses its own token (GITHUB_CONTRIB_TOKEN) rather than widening
        // GITHUB_TOKEN. Falls back to GITHUB_TOKEN if a dedicated one isn't set.
        const contribToken = process.env.GITHUB_CONTRIB_TOKEN || process.env.GITHUB_TOKEN;

        if (!contribToken) {
            return res.status(500).json({
                error: "GitHub token not configured"
            });
        }

        const query = `
            query($userName:String!) {
                user(login: $userName) {
                    contributionsCollection {
                        contributionCalendar {
                            totalContributions
                            weeks {
                                contributionDays {
                                    date
                                    contributionCount
                                }
                            }
                        }
                    }
                }
            }
        `;

        const response = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${contribToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query,
                variables: {
                    userName: username
                }
            })
        });

        const result = await response.json();

        if (result.errors) {
            console.error(result.errors);

            return res.status(500).json({
                error: "GitHub API error"
            });
        }

        const calendar =
            result.data.user.contributionsCollection.contributionCalendar;


        const days = [];

        calendar.weeks.forEach(week => {
            week.contributionDays.forEach(day => {

                let level = 0;

                if (day.contributionCount > 0)
                    level = 1;

                if (day.contributionCount >= 3)
                    level = 2;

                if (day.contributionCount >= 6)
                    level = 3;

                if (day.contributionCount >= 10)
                    level = 4;


                days.push({
                    date: day.date,
                    count: day.contributionCount,
                    level
                });
            });
        });


        res.json({
            totalContributions: calendar.totalContributions,
            days
        });


    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to load GitHub contributions"
        });
    }
});

// =========================
// 404 (must stay last)
// =========================

router.use((req, res) => {
    res.status(404).sendFile(
        path.join(__dirname, 'public', '404.html')
    );
});

module.exports = router;