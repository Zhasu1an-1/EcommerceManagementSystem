
import api, {
    getErrorMessage,
    isAuthenticationError
} from "../core/api.js";

import {
    getCurrentUser,
    getLoginUrl,
    clearAuthState
} from "../core/auth.js";

import {
    formatDateTime,
    formatInteger,
    showElement,
    hideElement,
    debounce
} from "../core/utils.js";

import {
    showError,
    showInfo
} from "../components/toast.js";

const NOTIFICATION_STATUSES = new Set([
    "SENT",
    "PENDING",
    "FAILED"
]);

const STATUS_LABELS = {
    SENT: "Sent",
    PENDING: "Pending",
    FAILED: "Failed"
};

const CHANNEL_LABELS = {
    EMAIL: "Email",
    SMS: "SMS",
    IN_APP: "In-App"
};

const SELECTORS = {
    loading: [
        "#notifications-loading",
        "#notifications-loading-state"
    ],
    content: [
        "#notifications-content",
        "#notifications-main-content"
    ],
    list: [
        "#notifications-list",
        "#notifications-container",
        "[data-notifications-list]"
    ],
    empty: [
        "#notifications-empty",
        "#notifications-empty-state"
    ],
    error: [
        "#notifications-error",
        "#notifications-error-state"
    ],
    auth: [
        "#notifications-auth-required",
        "#notifications-login-required"
    ],
    search: [
        "#notifications-search",
        "#notifications-search-input",
        "[data-notifications-search]"
    ],
    status: [
        "#notifications-status-filter",
        "#notifications-filter-status",
        'select[name="notificationStatus"]'
    ],
    tabs: [
        "#notifications-tabs",
        "#notifications-status-tabs",
        "[data-notifications-tabs]"
    ],
    count: [
        "#notifications-count",
        "[data-notifications-count]"
    ],
    totalCount: [
        "#notifications-total-count",
        "[data-notifications-total]"
    ],
    sentCount: [
        "#notifications-sent-count",
        "[data-notifications-sent]"
    ],
    pendingCount: [
        "#notifications-pending-count",
        "[data-notifications-pending]"
    ],
    failedCount: [
        "#notifications-failed-count",
        "[data-notifications-failed]"
    ],
    refresh: [
        "#notifications-refresh",
        "#notifications-refresh-button",
        "[data-notifications-refresh]"
    ],
    markAllRead: [
        "#notifications-mark-all-read",
        "[data-mark-all-read]"
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let searchDebounce = null;

let notifications = [];

let state = {
    keyword: "",
    status: "ALL"
};

function findElement(selectors) {
    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function getElements() {
    const elements = {};

    for (const [name, selectors] of Object.entries(SELECTORS)) {
        elements[name] = findElement(selectors);
    }

    return elements;
}

function setText(element, value) {
    if (element) {
        element.textContent = String(value ?? "");
    }
}

function createElement(tag, className = "", text = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== null && text !== undefined) {
        element.textContent = String(text);
    }

    return element;
}

function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

function extractNotifications(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.notifications)) {
        return response.notifications;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    if (Array.isArray(response?.data?.notifications)) {
        return response.data.notifications;
    }

    return [];
}

function normalizeNotification(item, index) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const status = normalizeStatus(
        item.status ?? item.notificationStatus
    );

    const channel = normalizeStatus(
        item.channel ?? item.notificationChannel
    );

    const message = String(
        item.message ??
        item.content ??
        item.body ??
        ""
    ).trim();

    const title = String(
        item.title ??
        item.subject ??
        item.notificationType ??
        item.type ??
        "Notification"
    ).trim();

    return {
        id: item.id ?? item.notificationId ?? index,
        title,
        message,
        status,
        channel,
        createdAt:
            item.createdAt ??
            item.sentAt ??
            item.createdDate ??
            null
    };
}

function setPageState(pageState) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        error: elements.error,
        auth: elements.auth
    };

    for (const [name, element] of Object.entries(sections)) {
        if (!element) {
            continue;
        }

        if (name === pageState) {
            showElement(element);
        } else {
            hideElement(element);
        }
    }
}

function createStateMessage(
    title,
    description,
    linkText = null,
    linkUrl = null
) {
    const wrapper = createElement(
        "div",
        "empty-state notifications-dynamic-state"
    );

    const heading = createElement(
        "h2",
        "empty-state-title",
        title
    );

    const paragraph = createElement(
        "p",
        "empty-state-description",
        description
    );

    wrapper.append(heading, paragraph);

    if (linkText && linkUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            linkText
        );

        link.href = linkUrl;
        wrapper.appendChild(link);
    }

    return wrapper;
}

function showFallbackMessage(
    title,
    description,
    linkText,
    linkUrl
) {
    let container = document.getElementById(
        "notifications-dynamic-state"
    );

    if (!container) {
        container = createElement(
            "div",
            "notifications-state-container"
        );

        container.id = "notifications-dynamic-state";

        const target =
            document.querySelector("main") ??
            document.body;

        target.prepend(container);
    }

    container.replaceChildren(
        createStateMessage(
            title,
            description,
            linkText,
            linkUrl
        )
    );

    showElement(container);
}

function hideFallbackMessage() {
    const container = document.getElementById(
        "notifications-dynamic-state"
    );

    hideElement(container);
}

function showAuthRequired() {
    notifications = [];

    setPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/notifications.html"
    );

    const authElement = getElements().auth;

    if (authElement) {
        const link = authElement.querySelector(
            "a[href]"
        );

        if (link) {
            link.href = loginUrl;
        }
    } else {
        showFallbackMessage(
            "Sign in to view notifications",
            "Хабарламаларыңды көру үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showNotificationsError(error) {
    const message = getErrorMessage(error);
    const element = getElements().error;

    setPageState("error");

    if (element) {
        const description = element.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackMessage(
            "Notifications unavailable",
            message,
            "Back to Account",
            "/pages/account.html"
        );
    }
}

function getStatusVariant(status) {
    switch (status) {
        case "SENT":
            return "success";

        case "PENDING":
            return "warning";

        case "FAILED":
            return "danger";

        default:
            return "neutral";
    }
}

function getStatusIcon(status) {
    switch (status) {
        case "SENT":
            return "✓";

        case "PENDING":
            return "◷";

        case "FAILED":
            return "!";

        default:
            return "✉";
    }
}

function createNotificationCard(notification) {
    const article = createElement(
        "article",
        "notification-card"
    );

    article.dataset.notificationId =
        String(notification.id);

    article.dataset.status = notification.status;

    const variant = getStatusVariant(
        notification.status
    );

    article.classList.add(
        `notification-${variant}`
    );

    const iconWrapper = createElement(
        "div",
        `notification-icon notification-icon-${variant}`
    );

    iconWrapper.textContent = getStatusIcon(
        notification.status
    );

    iconWrapper.setAttribute(
        "aria-hidden",
        "true"
    );

    const content = createElement(
        "div",
        "notification-content"
    );

    const header = createElement(
        "div",
        "notification-header"
    );

    const title = createElement(
        "h3",
        "notification-title",
        notification.title
    );

    const status = createElement(
        "span",
        `badge badge-${variant}`,
        STATUS_LABELS[notification.status] ??
        notification.status ??
        "Unknown"
    );

    header.append(title, status);

    const message = createElement(
        "p",
        "notification-message",
        notification.message ||
        "No additional details available."
    );

    const metadata = createElement(
        "div",
        "notification-meta"
    );

    if (notification.channel) {
        const channel = createElement(
            "span",
            "notification-channel",
            CHANNEL_LABELS[notification.channel] ??
            notification.channel
        );

        metadata.appendChild(channel);
    }

    if (notification.createdAt) {
        const date = createElement(
            "time",
            "notification-date",
            formatDateTime(notification.createdAt)
        );

        date.dateTime = String(
            notification.createdAt
        );

        metadata.appendChild(date);
    }

    content.append(
        header,
        message,
        metadata
    );

    article.append(
        iconWrapper,
        content
    );

    return article;
}

function getFilteredNotifications() {
    const keyword = state.keyword.toLowerCase();

    return notifications.filter(notification => {
        if (
            state.status !== "ALL" &&
            notification.status !== state.status
        ) {
            return false;
        }

        if (!keyword) {
            return true;
        }

        const searchable = [
            notification.title,
            notification.message,
            notification.status,
            notification.channel
        ]
            .join(" ")
            .toLowerCase();

        return searchable.includes(keyword);
    });
}

function updateStatistics() {
    const elements = getElements();

    setText(
        elements.totalCount,
        formatInteger(notifications.length)
    );

    for (const [status, element] of [
        ["SENT", elements.sentCount],
        ["PENDING", elements.pendingCount],
        ["FAILED", elements.failedCount]
    ]) {
        setText(
            element,
            formatInteger(
                notifications.filter(
                    item => item.status === status
                ).length
            )
        );
    }
}

function updateStatusTabs() {
    const container = getElements().tabs;

    if (!container) {
        return;
    }

    const buttons = container.querySelectorAll(
        "[data-notification-status], [data-status]"
    );

    for (const button of buttons) {
        const status = normalizeStatus(
            button.dataset.notificationStatus ??
            button.dataset.status
        );

        const selected = status === state.status;

        button.classList.toggle(
            "is-active",
            selected
        );

        button.classList.toggle(
            "active",
            selected
        );

        button.setAttribute(
            "aria-pressed",
            String(selected)
        );
    }
}

function showEmptyNotifications() {
    const elements = getElements();

    const filtered = Boolean(state.keyword) ||
        state.status !== "ALL";

    const title = filtered
        ? "No matching notifications"
        : "No notifications yet";

    const description = filtered
        ? "Іздеу шарттарын немесе статус фильтрін өзгертіп көр."
        : "Жаңа хабарламалар пайда болған кезде осы жерде көрсетіледі.";

    if (elements.empty) {
        const heading = elements.empty.querySelector(
            "h2, h3, .empty-state-title"
        );

        const paragraph = elements.empty.querySelector(
            "p, .empty-state-description"
        );

        setText(heading, title);
        setText(paragraph, description);

        showElement(elements.empty);
        elements.list?.replaceChildren();
    } else if (elements.list) {
        elements.list.replaceChildren(
            createStateMessage(
                title,
                description
            )
        );
    }
}

function renderNotifications() {
    const elements = getElements();

    const filtered = getFilteredNotifications();

    updateStatistics();
    updateStatusTabs();

    setText(
        elements.count,
        `${formatInteger(filtered.length)} notifications`
    );

    setPageState("content");
    hideFallbackMessage();

    if (filtered.length === 0) {
        showEmptyNotifications();
        return;
    }

    hideElement(elements.empty);

    if (!elements.list) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const notification of filtered) {
        fragment.appendChild(
            createNotificationCard(notification)
        );
    }

    elements.list.replaceChildren(fragment);
}

async function loadNotifications() {
    const version = ++requestVersion;

    setPageState("loading");

    try {
        const user = await getCurrentUser();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        if (!user) {
            showAuthRequired();
            return;
        }

        const response = await api.notifications.mine();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        notifications = extractNotifications(response)
            .map(normalizeNotification)
            .filter(Boolean)
            .sort((a, b) => {
                const first = Date.parse(a.createdAt) || 0;
                const second = Date.parse(b.createdAt) || 0;

                return second - first;
            });

        renderNotifications();
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        console.error(
            "Notifications loading failed:",
            error
        );

        showNotificationsError(error);
    }
}

function applyFilters() {
    const elements = getElements();

    state.keyword = String(
        elements.search?.value ?? ""
    ).trim();

    if (elements.status) {
        const status = normalizeStatus(
            elements.status.value
        );

        state.status = NOTIFICATION_STATUSES.has(status)
            ? status
            : "ALL";
    }

    renderNotifications();
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    searchDebounce = debounce(
        applyFilters,
        300
    );

    elements.search?.addEventListener(
        "input",
        searchDebounce,
        { signal }
    );

    elements.status?.addEventListener(
        "change",
        applyFilters,
        { signal }
    );

    elements.tabs?.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                "[data-notification-status], [data-status]"
            );

            if (!button) {
                return;
            }

            const status = normalizeStatus(
                button.dataset.notificationStatus ??
                button.dataset.status
            );

            state.status = NOTIFICATION_STATUSES.has(status)
                ? status
                : "ALL";

            if (elements.status) {
                const option = Array.from(
                    elements.status.options ?? []
                ).find(item => {
                    return normalizeStatus(item.value) === state.status;
                });

                if (option) {
                    elements.status.value = option.value;
                }
            }

            renderNotifications();
        },
        { signal }
    );
}

function setupActions() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.refresh?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadNotifications();
        },
        { signal }
    );

    elements.markAllRead?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            showInfo(
                "Хабарламаларды оқылды деп белгілеу функциясы серверде әзірге қарастырылмаған."
            );
        },
        { signal }
    );
}

export async function initNotifications() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupFilters();
    setupActions();

    await loadNotifications();
}

export function destroyNotifications() {
    active = false;
    initialized = false;

    requestVersion += 1;

    searchDebounce?.cancel();
    eventController?.abort();

    searchDebounce = null;
    eventController = null;

    notifications = [];

    state = {
        keyword: "",
        status: "ALL"
    };
}

export const notificationsPage = {
    init: initNotifications,
    destroy: destroyNotifications,
    reload: loadNotifications,
    getNotifications() {
        return [...notifications];
    },
    getState() {
        return { ...state };
    }
};

export default notificationsPage;
