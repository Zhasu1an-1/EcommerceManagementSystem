
import {
    isValidEmail
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "./toast.js";

let initialized = false;
let footerElement = null;
let eventController = null;
let newsletterHandler = null;
let scrollButtons = [];

function findFooter() {
    return document.querySelector(
        "#site-footer, .site-footer, .main-footer, footer:not(.admin-footer)"
    );
}

function updateCopyrightYear() {
    if (!footerElement) {
        return;
    }

    const currentYear = new Date().getFullYear();

    const yearElements = footerElement.querySelectorAll(
        "#footer-year, .footer-year, [data-current-year], [data-footer-year]"
    );

    for (const element of yearElements) {
        element.textContent = String(currentYear);
    }
}

function updateFooterActiveLinks() {
    if (!footerElement) {
        return;
    }

    const currentPath = window.location.pathname;

    const links = footerElement.querySelectorAll(
        "a[href]"
    );

    for (const link of links) {
        const href = link.getAttribute("href");

        if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
        ) {
            continue;
        }

        let url;

        try {
            url = new URL(href, window.location.origin);
        } catch {
            continue;
        }

        if (url.origin !== window.location.origin) {
            continue;
        }

        const isActive = url.pathname === currentPath;

        link.classList.toggle(
            "is-active",
            isActive
        );

        if (isActive) {
            link.setAttribute(
                "aria-current",
                "page"
            );
        } else if (link.getAttribute("aria-current") === "page") {
            link.removeAttribute("aria-current");
        }
    }
}

function getScrollButtons() {
    return Array.from(
        document.querySelectorAll(
            "#back-to-top, #footer-back-to-top, .back-to-top, [data-back-to-top]"
        )
    );
}

function updateScrollButtons() {
    const shouldShow = window.scrollY > 350;

    for (const button of scrollButtons) {
        button.hidden = !shouldShow;

        button.classList.toggle(
            "is-visible",
            shouldShow
        );

        button.setAttribute(
            "aria-hidden",
            String(!shouldShow)
        );

        if (shouldShow) {
            button.removeAttribute("tabindex");
        } else {
            button.setAttribute("tabindex", "-1");
        }
    }
}

export function scrollToTop() {
    const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion
            ? "instant"
            : "smooth"
    });
}

function findNewsletterForm(target) {
    return target.closest(
        "#footer-newsletter-form, .footer-newsletter-form, [data-newsletter-form]"
    );
}

function getNewsletterEmailInput(form) {
    return form.querySelector(
        'input[type="email"], input[name="email"], #footer-newsletter-email'
    );
}

function getNewsletterFeedback(form) {
    return (
        form.querySelector(
            "[data-newsletter-feedback], .footer-newsletter-feedback"
        ) ??
        footerElement?.querySelector(
            "#footer-newsletter-feedback"
        )
    );
}

function setNewsletterFeedback(
    form,
    message,
    type = "info"
) {
    const feedback = getNewsletterFeedback(form);

    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.hidden = false;

    feedback.classList.remove(
        "is-success",
        "is-error",
        "is-info"
    );

    feedback.classList.add(`is-${type}`);

    feedback.setAttribute(
        "role",
        type === "error" ? "alert" : "status"
    );
}

async function handleNewsletterSubmit(event) {
    if (!(event.target instanceof Element)) {
        return;
    }

    const form = findNewsletterForm(event.target);

    if (
        !form ||
        !(form instanceof HTMLFormElement) ||
        !footerElement?.contains(form)
    ) {
        return;
    }

    event.preventDefault();

    const input = getNewsletterEmailInput(form);

    if (!input) {
        return;
    }

    const email = input.value.trim();

    if (!isValidEmail(email)) {
        const message = "Жарамды email мекенжайын енгіз.";

        input.setAttribute(
            "aria-invalid",
            "true"
        );

        setNewsletterFeedback(
            form,
            message,
            "error"
        );

        showError(message);

        input.focus();

        return;
    }

    input.removeAttribute("aria-invalid");

    if (typeof newsletterHandler !== "function") {
        const message = "Email жазылым қызметі әзірге іске қосылмаған.";

        setNewsletterFeedback(
            form,
            message,
            "info"
        );

        showInfo(message);

        return;
    }

    const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
    );

    if (submitButton?.disabled) {
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute(
            "aria-busy",
            "true"
        );
    }

    try {
        const result = await newsletterHandler(email);

        if (result?.success === false) {
            throw new Error(
                result.message ??
                "Жазылымды рәсімдеу мүмкін болмады."
            );
        }

        const message = "Жазылым сәтті рәсімделді!";

        setNewsletterFeedback(
            form,
            message,
            "success"
        );

        showSuccess(message);

        form.reset();
    } catch (error) {
        const message = error?.message ??
            "Жазылымды рәсімдеу кезінде қате пайда болды.";

        setNewsletterFeedback(
            form,
            message,
            "error"
        );

        showError(message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.removeAttribute("aria-busy");
        }
    }
}

function getAccordionPanel(button) {
    const panelId = button.getAttribute(
        "aria-controls"
    );

    if (panelId) {
        return document.getElementById(panelId);
    }

    const targetId = button.dataset.footerTarget;

    if (targetId) {
        return document.getElementById(
            targetId.replace(/^#/, "")
        );
    }

    return button.nextElementSibling;
}

function toggleFooterAccordion(button) {
    const panel = getAccordionPanel(button);

    if (!panel) {
        return;
    }

    const expanded =
        button.getAttribute("aria-expanded") === "true";

    const nextExpanded = !expanded;

    button.setAttribute(
        "aria-expanded",
        String(nextExpanded)
    );

    button.classList.toggle(
        "is-active",
        nextExpanded
    );

    panel.hidden = !nextExpanded;

    panel.classList.toggle(
        "is-open",
        nextExpanded
    );
}

function handleFooterClick(event) {
    if (!(event.target instanceof Element)) {
        return;
    }

    const scrollButton = event.target.closest(
        "#back-to-top, #footer-back-to-top, .back-to-top, [data-back-to-top]"
    );

    if (scrollButton) {
        event.preventDefault();
        scrollToTop();
        return;
    }

    const accordionButton = event.target.closest(
        "[data-footer-toggle], .footer-accordion-toggle"
    );

    if (
        accordionButton &&
        footerElement?.contains(accordionButton)
    ) {
        event.preventDefault();

        toggleFooterAccordion(
            accordionButton
        );
    }
}

function initializeAccordionButtons() {
    if (!footerElement) {
        return;
    }

    const buttons = footerElement.querySelectorAll(
        "[data-footer-toggle], .footer-accordion-toggle"
    );

    for (const button of buttons) {
        if (!button.hasAttribute("aria-expanded")) {
            button.setAttribute(
                "aria-expanded",
                "false"
            );
        }

        const panel = getAccordionPanel(button);

        if (!panel) {
            continue;
        }

        const expanded =
            button.getAttribute("aria-expanded") === "true";

        panel.hidden = !expanded;

        panel.classList.toggle(
            "is-open",
            expanded
        );
    }
}

function secureExternalLinks() {
    if (!footerElement) {
        return;
    }

    const externalLinks = footerElement.querySelectorAll(
        'a[target="_blank"]'
    );

    for (const link of externalLinks) {
        const existing = (
            link.getAttribute("rel") ?? ""
        ).split(/\s+/).filter(Boolean);

        const values = new Set(existing);

        values.add("noopener");
        values.add("noreferrer");

        link.setAttribute(
            "rel",
            [...values].join(" ")
        );
    }
}

export function refreshFooter() {
    if (!footerElement) {
        return;
    }

    updateCopyrightYear();
    updateFooterActiveLinks();
    secureExternalLinks();
    updateScrollButtons();
}

export function initFooter(options = {}) {
    if (initialized) {
        return footerElement;
    }

    footerElement = findFooter();

    if (!footerElement) {
        return null;
    }

    initialized = true;

    newsletterHandler =
        typeof options.onNewsletterSubmit === "function"
            ? options.onNewsletterSubmit
            : null;

    eventController = new AbortController();

    const signal = eventController.signal;

    scrollButtons = getScrollButtons();

    for (const button of scrollButtons) {
        if (
            button instanceof HTMLButtonElement &&
            !button.hasAttribute("type")
        ) {
            button.type = "button";
        }

        if (!button.hasAttribute("aria-label")) {
            button.setAttribute(
                "aria-label",
                "Беттің басына оралу"
            );
        }
    }

    refreshFooter();
    initializeAccordionButtons();

    document.addEventListener(
        "click",
        handleFooterClick,
        { signal }
    );

    document.addEventListener(
        "submit",
        handleNewsletterSubmit,
        { signal }
    );

    window.addEventListener(
        "scroll",
        updateScrollButtons,
        {
            signal,
            passive: true
        }
    );

    window.addEventListener(
        "pageshow",
        refreshFooter,
        { signal }
    );

    return footerElement;
}

export function destroyFooter() {
    if (!initialized) {
        return;
    }

    eventController?.abort();

    initialized = false;
    footerElement = null;
    eventController = null;
    newsletterHandler = null;
    scrollButtons = [];
}

export const footer = {
    init: initFooter,
    refresh: refreshFooter,
    destroy: destroyFooter,
    scrollToTop
};

export default footer;
