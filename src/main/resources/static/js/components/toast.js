
const TOAST_TYPES = new Set([
    "success",
    "error",
    "warning",
    "info"
]);

const DEFAULT_DURATION = 4500;
const MAX_TOASTS = 5;
const REMOVE_DELAY = 250;

const TOAST_TITLES = {
    success: "Сәтті орындалды",
    error: "Қате пайда болды",
    warning: "Ескерту",
    info: "Ақпарат"
};

const TOAST_ICONS = {
    success: `
        <circle cx="12" cy="12" r="9"/>
        <path d="m8 12 3 3 5-6"/>
    `,
    error: `
        <circle cx="12" cy="12" r="9"/>
        <path d="M8 8l8 8M16 8l-8 8"/>
    `,
    warning: `
        <path d="M10.3 3.9 1.8 18.5A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z"/>
        <path d="M12 9v4M12 17h.01"/>
    `,
    info: `
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 11v5M12 8h.01"/>
    `
};

let toastCounter = 0;

const activeToasts = [];

function createIcon(type) {
    const wrapper = document.createElement("span");

    wrapper.className = `toast-icon toast-icon-${type}`;
    wrapper.setAttribute("aria-hidden", "true");

    wrapper.innerHTML = `
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            ${TOAST_ICONS[type]}
        </svg>
    `;

    return wrapper;
}

function createCloseButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "toast-close";
    button.setAttribute("aria-label", "Хабарламаны жабу");

    button.innerHTML = `
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
        >
            <path d="M5 5l14 14M19 5 5 19"/>
        </svg>
    `;

    return button;
}

export function getToastContainer() {
    let container = document.getElementById(
        "toast-container"
    );

    if (container) {
        return container;
    }

    container = document.createElement("div");

    container.id = "toast-container";
    container.className = "toast-container";

    container.setAttribute("role", "region");
    container.setAttribute(
        "aria-label",
        "Жүйелік хабарламалар"
    );
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions");

    document.body.appendChild(container);

    return container;
}

function normalizeToastOptions(
    message,
    type,
    options
) {
    const settings =
        message !== null &&
        typeof message === "object" &&
        !Array.isArray(message)
            ? { ...message }
            : {
                ...options,
                message,
                type
            };

    const normalizedType = TOAST_TYPES.has(
        settings.type
    )
        ? settings.type
        : "info";

    const duration = Number(settings.duration);

    return {
        message: String(settings.message ?? "").trim(),
        title: String(
            settings.title ??
            TOAST_TITLES[normalizedType]
        ),
        type: normalizedType,
        duration:
            settings.duration === 0
                ? 0
                : Number.isFinite(duration) && duration > 0
                    ? duration
                    : DEFAULT_DURATION,
        dismissible: settings.dismissible !== false
    };
}

export function showToast(
    message,
    type = "info",
    options = {}
) {
    const settings = normalizeToastOptions(
        message,
        type,
        options
    );

    if (!settings.message) {
        return null;
    }

    const container = getToastContainer();

    while (activeToasts.length >= MAX_TOASTS) {
        activeToasts[0].dismiss();
    }

    const id = ++toastCounter;

    const element = document.createElement("div");

    element.id = `toast-${id}`;
    element.className = [
        "toast",
        `toast-${settings.type}`,
        `toast--${settings.type}`
    ].join(" ");

    element.setAttribute(
        "role",
        settings.type === "error"
            ? "alert"
            : "status"
    );

    element.setAttribute("aria-atomic", "true");

    const icon = createIcon(settings.type);

    const content = document.createElement("div");

    content.className = "toast-content";

    const title = document.createElement("strong");

    title.className = "toast-title";
    title.textContent = settings.title;

    const description = document.createElement("p");

    description.className = "toast-message";
    description.textContent = settings.message;

    content.append(title, description);

    element.append(icon, content);

    let closeButton = null;

    if (settings.dismissible) {
        closeButton = createCloseButton();
        element.appendChild(closeButton);
    }

    let timeoutId = null;
    let startedAt = 0;
    let remaining = settings.duration;
    let dismissed = false;

    function stopTimer() {
        if (timeoutId === null) {
            return;
        }

        clearTimeout(timeoutId);
        timeoutId = null;

        remaining -= Date.now() - startedAt;
        remaining = Math.max(0, remaining);
    }

    function startTimer() {
        if (
            dismissed ||
            settings.duration === 0 ||
            timeoutId !== null
        ) {
            return;
        }

        startedAt = Date.now();

        timeoutId = setTimeout(() => {
            timeoutId = null;
            dismiss();
        }, remaining);
    }

    function dismiss() {
        if (dismissed) {
            return;
        }

        dismissed = true;

        stopTimer();

        const index = activeToasts.findIndex(
            item => item.id === id
        );

        if (index !== -1) {
            activeToasts.splice(index, 1);
        }

        element.classList.remove("is-visible");
        element.classList.add("is-leaving");

        element.setAttribute("aria-hidden", "true");

        setTimeout(() => {
            element.remove();
        }, REMOVE_DELAY);
    }

    function pauseOnFocus() {
        stopTimer();
    }

    function resumeOnBlur(event) {
        if (
            event.relatedTarget instanceof Node &&
            element.contains(event.relatedTarget)
        ) {
            return;
        }

        startTimer();
    }

    const toastInstance = {
        id,
        element,
        type: settings.type,
        dismiss
    };

    element.addEventListener(
        "mouseenter",
        stopTimer
    );

    element.addEventListener(
        "mouseleave",
        startTimer
    );

    element.addEventListener(
        "focusin",
        pauseOnFocus
    );

    element.addEventListener(
        "focusout",
        resumeOnBlur
    );

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            dismiss
        );
    }

    activeToasts.push(toastInstance);

    container.appendChild(element);

    requestAnimationFrame(() => {
        if (!dismissed) {
            element.classList.add("is-visible");
        }
    });

    startTimer();

    return toastInstance;
}

export function showSuccess(
    message,
    options = {}
) {
    return showToast(
        message,
        "success",
        options
    );
}

export function showError(
    message,
    options = {}
) {
    return showToast(
        message,
        "error",
        {
            duration: 6500,
            ...options
        }
    );
}

export function showWarning(
    message,
    options = {}
) {
    return showToast(
        message,
        "warning",
        options
    );
}

export function showInfo(
    message,
    options = {}
) {
    return showToast(
        message,
        "info",
        options
    );
}

export function dismissToast(id) {
    const instance = activeToasts.find(
        item => item.id === id
    );

    if (!instance) {
        return false;
    }

    instance.dismiss();

    return true;
}

export function dismissAllToasts() {
    for (const instance of [...activeToasts]) {
        instance.dismiss();
    }
}

export function getActiveToasts() {
    return [...activeToasts];
}

export const toast = {
    show: showToast,
    success: showSuccess,
    error: showError,
    warning: showWarning,
    info: showInfo,
    dismiss: dismissToast,
    dismissAll: dismissAllToasts,
    getActive: getActiveToasts
};

export default toast;
