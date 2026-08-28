// =========================
// AOS
// =========================

AOS.init({
    duration: 900,
    once: true
});

// =========================
// THEME TOGGLE (light/dark only)
// =========================

const themeTrigger = document.getElementById("theme-trigger");
const root = document.documentElement;
const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function updateThemeIcon() {
    const icon = themeTrigger.querySelector("i");
    if (!icon) return;
    icon.className = root.classList.contains("dark") ? "ri-sun-line" : "ri-moon-line";
}

themeTrigger.addEventListener("click", () => {
    root.classList.toggle("dark");
    localStorage.setItem("theme", root.classList.contains("dark") ? "dark" : "light");
    updateThemeIcon();
});

// INIT: explicit saved choice wins; otherwise follow the OS/browser's
// dark-mode setting (already applied pre-paint by the inline script in
// <head>, this just keeps the toggle icon and JS state in sync with it).
updateThemeIcon();

// If the visitor never explicitly picked a theme, keep following the
// system setting live (e.g. their OS switches to dark mode at sunset).
if (!localStorage.getItem("theme")) {
    darkMediaQuery.addEventListener("change", (e) => {
        root.classList.toggle("dark", e.matches);
        updateThemeIcon();
    });
}

// =========================
// TYPING EFFECT
// =========================

const texts = [
    "building modern frontends",
    "engineering reliable backends",
    "crafting applications in C#",
    "shipping full-stack projects",
];

const typedText =
    document.getElementById("typed-text");

const typingTitle =
    document.querySelector(".typing-title");

// ONLY RUN ON PAGES
// THAT HAVE TYPED TEXT

if (typedText && typingTitle) {

    // PRE-MEASURE: render each phrase
    // invisibly, record the tallest height,
    // then lock the container to that value
    // so the page never shifts during typing.

    function measureTallestPhrase() {
        const measurer = document.createElement("span");

        measurer.style.cssText = `
            position: absolute;
            visibility: hidden;
            pointer-events: none;
            white-space: normal;
            width: ${typingTitle.offsetWidth}px;
            font-size: ${getComputedStyle(typingTitle).fontSize};
            font-family: ${getComputedStyle(typingTitle).fontFamily};
            font-weight: ${getComputedStyle(typingTitle).fontWeight};
            line-height: ${getComputedStyle(typingTitle).lineHeight};
            max-width: 900px;
        `;

        // Write every phrase into its own hidden span, all in a single
        // batched DOM mutation, BEFORE reading any layout back. Reading
        // offsetHeight right after each write (in the same loop) forces
        // the browser to synchronously recompute layout on every single
        // iteration - measuring 8 phrases meant 8 forced reflows back
        // to back during the hero's initial paint. Splitting it into a
        // write pass then a read pass collapses that down to one.
        const fragment = document.createDocumentFragment();
        const spans = texts.map(text => {
            const el = measurer.cloneNode();
            el.textContent = text;
            fragment.appendChild(el);
            return el;
        });

        document.body.appendChild(fragment);

        let maxHeight = 0;
        spans.forEach(el => {
            maxHeight = Math.max(maxHeight, el.offsetHeight);
        });

        spans.forEach(el => el.remove());

        return maxHeight;
    }

    typingTitle.style.height = measureTallestPhrase() + "px";

    // RE-MEASURE ON RESIZE (viewport changes
    // affect clamp font-size, so heights shift)

    let resizeTimer;

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            typingTitle.style.height = measureTallestPhrase() + "px";
        }, 150);
    });

    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    function typeEffect() {

        const currentText =
            texts[textIndex];

        const cursor = '<span class="cursor">|</span>';

        if (isDeleting) {

            typedText.innerHTML =
                currentText.substring(0, charIndex--) + cursor;

        } else {

            typedText.innerHTML =
                currentText.substring(0, charIndex++) + cursor;
        }

        let speed =
            isDeleting ? 50 : 100;

        if (
            !isDeleting &&
            charIndex === currentText.length + 1
        ) {

            speed = 1400;

            isDeleting = true;
        }

        if (
            isDeleting &&
            charIndex === 0
        ) {

            isDeleting = false;

            textIndex =
                (textIndex + 1) % texts.length;

            speed = 250;
        }

        setTimeout(typeEffect, speed);
    }

    typeEffect();
}

// =========================
// NAVBAR SCROLL EFFECT
// =========================

const header =
    document.querySelector(".header");

function updateNavbar() {

    if (!header) return;

    if (window.scrollY > 20) {

        header.classList.add("scrolled");

    } else {

        header.classList.remove("scrolled");
    }
}

window.addEventListener(
    "scroll",
    updateNavbar
);

updateNavbar();

// =========================
// PROJECTS FROM JSON
// =========================

const publicProjectsGrid =
    document.getElementById(
        "public-projects"
    );

const privateProjectsGrid =
    document.getElementById(
        "private-projects"
    );

function escapeAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function createProjectCard(project, index) {

    const techTags = project.tech
        ? project.tech.map(t => `<span class="tech-tag">${t}</span>`).join("")
        : "";

    const linkLabel = project.type === "website" ? "View Website"
        : project.type === "program" ? "View Program"
            : "View Project Page";

    const srcCodeLink = (!project.isPublic && project.srcLink)
        ? `<a href="${project.srcLink}" target="_blank" rel="noopener noreferrer">Open source code</a>`
        : "";

    const idx = String(index + 1).padStart(2, "0");

    return `
        <article
            class="log-row"
            data-aos="fade-up"
            data-aos-delay="${Math.min(index, 6) * 70}"
        >
            <div class="log-row-idx">${idx}</div>

            <div class="log-row-main">
                <div class="log-row-top">
                    <h3>${project.name}</h3>
                    <span class="log-row-tag">${project.title}</span>
                </div>

                <p>${project.desc}</p>

                ${techTags ? `<div class="tech-tags">${techTags}</div>` : ""}

                <div class="log-row-links">
                    ${srcCodeLink}
                    <a href="${project.link}" ${project.isPublic ? 'target="_blank"' : ""} rel="noopener noreferrer">
                        ${linkLabel}
                    </a>
                </div>
            </div>

            <div class="log-row-thumb">
                <img src="${project.img}" alt="${escapeAttr(project.name)} — ${escapeAttr(project.desc)}" loading="lazy">
            </div>
        </article>
    `;
}

// LOAD PROJECTS

fetch("/data/projects.json")

    .then(response => response.json())

    .then(projects => {

        // =========================
        // PUBLIC PROJECTS
        // =========================

        if (publicProjectsGrid) {

            const publicProjects =
                projects.filter(
                    project => project.isPublic
                );

            publicProjects.forEach(
                (project, index) => {

                    publicProjectsGrid.innerHTML +=
                        createProjectCard(
                            project,
                            index
                        );
                }
            );
        }

        // =========================
        // PRIVATE PROJECTS
        // =========================

        if (privateProjectsGrid) {

            const privateProjects =
                projects.filter(
                    project => !project.isPublic
                );

            privateProjects.forEach(
                (project, index) => {

                    privateProjectsGrid.innerHTML +=
                        createProjectCard(
                            project,
                            index
                        );
                }
            );
        }

        // COUNTS
        const countPublicEl = document.getElementById("countPublic");
        const countPrivateEl = document.getElementById("countPrivate");
        if (countPublicEl) countPublicEl.textContent = publicProjectsGrid ? publicProjectsGrid.children.length : 0;
        if (countPrivateEl) countPrivateEl.textContent = privateProjectsGrid ? privateProjectsGrid.children.length : 0;

        // REFRESH AOS
        AOS.refresh();
    })

    .catch(error => {

        console.error(
            "Failed to load projects:",
            error
        );
    });

// =========================
// PROJECT TABS (public / private)
// =========================

const projTabs = document.querySelectorAll(".proj-tab");
const projTabDesc = document.getElementById("projTabDesc");

const tabDescriptions = {
    "public-projects": "Live sites — shipped for real clients, out in the world.",
    "private-projects": "Personal tools and experiments, built for the problem itself."
};

projTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        projTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const target = tab.dataset.target;

        if (publicProjectsGrid) publicProjectsGrid.classList.toggle("grid-hidden", target !== "public-projects");
        if (privateProjectsGrid) privateProjectsGrid.classList.toggle("grid-hidden", target !== "private-projects");

        if (projTabDesc) projTabDesc.textContent = tabDescriptions[target] || "";

        AOS.refresh();
    });
});

// =========================
// FOOTER
// =========================

document.getElementById("year").textContent = new Date().getFullYear();

// =========================
// COPY EMAIL
// =========================

document.querySelectorAll(".copy-email-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const email = btn.dataset.email;
        try {
            await navigator.clipboard.writeText(email);
            const icon = btn.querySelector("i");
            icon.className = "ri-check-line";
            setTimeout(() => {
                icon.className = "ri-file-copy-line";
            }, 1500);
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });
});

