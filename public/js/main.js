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
    "Building modern frontends.",
    "Engineering reliable backends.",
    "Crafting applications in C#.",
    "Shipping full-stack projects.",
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

        if (isDeleting) {

            typedText.textContent =
                currentText.substring(0, charIndex--);

        } else {

            typedText.textContent =
                currentText.substring(0, charIndex++);
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
        ? `<a href="${project.srcLink}" target="_blank">Open source code<i class="ri-arrow-right-up-line" style="margin-left: 5px"></i></a>`
        : "";

    return `
        <div
            class="project-card"
            style="--card-accent: ${project.color}"
            data-aos="fade-up"
            data-aos-delay="${index * 100}"
        >
            <div class="project-top">
                <span class="project-tag" style="color: ${project.color}">
                    ${project.title}
                </span>
                <i class="ri-arrow-right-up-line" style="color: ${project.color}"></i>
            </div>

            <h3>${project.name}</h3>
            <p>${project.desc}</p>
            <img src="${project.img}" alt="${escapeAttr(project.name)} — ${escapeAttr(project.desc)}" class="cover-img" loading="lazy">

            <div class="card-divider"></div>

            ${techTags ? `<div class="tech-tags">${techTags}</div>` : ""}

            ${srcCodeLink}

            <a href="${project.link}" ${project.isPublic ? 'target="_blank"' : ""} rel="noopener noreferrer">
                ${linkLabel}<i class="ri-arrow-right-up-line" style="margin-left: 5px"></i>
            </a>
        </div>
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
// CONTACT FORM
// =========================

const contactForm =
    document.getElementById("contact-form");

const formFeedback =
    document.getElementById("form-feedback");

function showFeedback(message, type) {

    if (!formFeedback) return;

    formFeedback.textContent = message;
    formFeedback.className = `form-feedback ${type}`;
    formFeedback.style.display = "block";

    if (type === "success") {
        setTimeout(() => {
            formFeedback.style.display = "none";
        }, 5000);
    }
}

// =========================
// LAZY-LOAD RECAPTCHA
// =========================
// reCAPTCHA's script does its own layout/sizing work once it runs, which
// is expensive under mobile CPU throttling and was flagged as part of
// the "Forced reflow" / render-blocking cost on every single page view -
// even for visitors who never reach the contact form. Load it only once
// the form is about to scroll into view instead.

let recaptchaLoadPromise = null;

function loadRecaptcha() {
    if (recaptchaLoadPromise) return recaptchaLoadPromise;

    recaptchaLoadPromise = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://www.google.com/recaptcha/api.js";
        script.async = true;
        script.onload = resolve;
        document.head.appendChild(script);
    });

    return recaptchaLoadPromise;
}

if (contactForm) {
    if ("IntersectionObserver" in window) {
        const recaptchaObserver = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                loadRecaptcha();
                recaptchaObserver.disconnect();
            }
        }, { rootMargin: "600px" });

        recaptchaObserver.observe(contactForm);
    } else {
        loadRecaptcha();
    }
}

if (contactForm) {

    contactForm.addEventListener(
        "submit",
        async (e) => {

            e.preventDefault();

            const submitBtn = contactForm.querySelector(".contact-btn");
            submitBtn.disabled = true;
            submitBtn.classList.add("loading");
            submitBtn.innerHTML = `<i class="ri-loader-4-line"></i>`;

            // Safety net: normally already loaded via the IntersectionObserver
            // above by the time someone's ready to submit, but this covers
            // edge cases (e.g. keyboard navigation without a scroll event).
            await loadRecaptcha();

            const formData =
                new FormData(contactForm);

            const data = {

                name:
                    formData.get("name"),

                email:
                    formData.get("email"),

                subject:
                    formData.get("subject"),

                message:
                    formData.get("message"),

                company:
                    formData.get("company"),

                captcha:
                    grecaptcha.getResponse()
            };

            if (!data.captcha) {

                showFeedback(
                    "Please complete the captcha.",
                    "error"
                );

                submitBtn.disabled = false;
                submitBtn.classList.remove("loading");
                submitBtn.innerHTML = "Send Message";

                return;
            }

            try {

                const response =
                    await fetch("/send-email", {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(data)
                    });

                const result =
                    await response.json();

                if (result.success) {

                    showFeedback(
                        "Message sent successfully!",
                        "success"
                    );

                    contactForm.reset();
                    grecaptcha.reset();


                } else {

                    showFeedback(
                        "Failed to send message. Please try again.",
                        "error"
                    );

                    grecaptcha.reset();
                }

            } catch (error) {

                console.error(error);

                showFeedback(
                    "Something went wrong. Please try again later.",
                    "error"
                );
            } finally {

                submitBtn.disabled = false;
                submitBtn.classList.remove("loading");
                submitBtn.innerHTML = "Send Message";
            }

        }
    );
}

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

