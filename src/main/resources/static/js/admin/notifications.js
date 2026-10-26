
import api, {
    getErrorMessage
} from "../core/api.js";

import {
    formatDateTime,
    formatInteger,
    debounce,
    showElement,
    hideElement,
    openModal,
    closeModal,
    setupModal,
    setButtonLoading
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const PAGE_SIZE = 10;

const STATUSES = [
    "PENDING",
    "SENT",
    "FAILED"
];

const STATUS_VARIANTS = {
    SENT: "success",
    PENDING: "warning",
    FAILED: "danger"
};

const SELECTORS = {
    loading: [
        "#admin-notifications-loading",
        "#notifications-loading",
        "[data-admin-notifications-loading]"
    ],
    content: [
        "#admin-notifications-content",
        "#notifications-content",
        "[data-admin-notifications-content]"
    ],
    tableBody: [
        "#admin-notifications-table-body",
        "#notifications-table-body",
        "#notifications-tbody",
        "[data-admin-notifications-table-body]"
    ],
    grid: [
        "#admin-notifications-grid",
        "[data-admin-notifications-grid]"
    ],
    search: [
        "#admin-notifications-search",
        "#notifications-search",
        "[data-admin-notifications-search]"
    ],
    statusFilter: [
        "#admin-notifications-status",
        "#notifications-status-filter",
        'select[name="status"]'
    ],
    channelFilter: [
        "#admin-notifications-channel",
        "#notifications-channel-filter",
        'select[name="channel"]'
    ],
    totalCount: [
        "#admin-total-notifications",
        "#notifications-total-count",
        "[data-total-notifications]"
    ],
    sentCount: [
        "#admin-sent-notifications",
        "#notifications-sent-count",
        "[data-sent-notifications]"
    ],
    pendingCount: [
        "#admin-pending-notifications",
        "#notifications-pending-count",
        "[data-pending-notifications]"
    ],
    failedCount: [
        "#admin-failed-notifications",
        "#notifications-failed-count",
        "[data-failed-notifications]"
    ],
    resultsCount: [
        "#admin-notifications-count",
        "#notifications-results-count",
        "[data-notifications-count]"
    ],
    pagination: [
        "#admin-notifications-pagination",
        "#notifications-pagination",
        "[data-admin-notifications-pagination]"
    ],
    empty: [
        "#admin-notifications-empty",
        "#notifications-empty",
        "[data-admin-notifications-empty]"
    ],
    error: [
        "#admin-notifications-error",
        "#notifications-error",
        "[data-admin-notifications-error]"
    ],
    refresh: [
        "#admin-notifications-refresh",
        "#notifications-refresh",
        "[data-admin-notifications-refresh]"
    ],
    sendButton: [
        "#admin-send-notification",
        "#send-notification-button",
        "[data-send-notification]"
    ],
    sendModal: [
        "#send-notification-modal",
        "#notification-send-modal",
        "[data-send-notification-modal]"
    ],
    sendForm: [
        "#send-notification-form",
        "#notification-send-form",
        "[data-send-notification-form]"
    ],
    sendSubmit: [
        "#send-notification-submit",
        "#notification-send-submit",
        "[data-notification-send-submit]"
    ],
    sendCancel: [
        "#send-notification-cancel",
        "[data-notification-send-cancel]"
    ],
    sendError: [
        "#send-notification-error",
        "[data-notification-send-error]"
    ],
    detailsModal: [
        "#notification-details-modal",
        "#admin-notification-modal",
        "[data-notification-details-modal]"
    ],
    detailsContent: [
        "#notification-details-content",
        "#admin-notification-details",
        "[data-notification-details-content]"
    ]
};

let initialized = false;
let active = false;
let loading = false;
let sending = false;
let requestVersion = 0;

let eventController = null;
let sendModalCleanup = null;
let detailsModalCleanup = null;
let searchDebounce = null;

let notifications = [];
let totalElements = 0;
let serverPagination = false;

let state = {
    keyword: "",
    status: "ALL",
    channel: "ALL",
    page: 0
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

function setText(element, value) {
    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

function normalizeNotification(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const id = Number(
        raw.id ?? raw.notificationId
    );

    if (!Number.isSafeInteger(id) || id <= 0) {
        return null;
    }

    return {
        id,
        title: String(
            raw.title ??
            raw.subject ??
            raw.type ??
            "Notification"
        ),
        message: String(
            raw.message ??
            raw.content ??
            raw.body ??
            ""
        ),
        recipient: String(
            raw.recipient ??
            raw.recipientEmail ??
            raw.phoneNumber ??
            raw.user?.email ??
            raw.userId ??
            ""
        ),
        channel: normalizeStatus(
            raw.channel ??
            raw.notificationChannel ??
            raw.type
        ),
        status: normalizeStatus(
            raw.status ??
            raw.notificationStatus
        ),
        createdAt:
            raw.createdAt ??
            raw.createdDate ??
            null,
        sentAt:
            raw.sentAt ??
            null,
        errorMessage: String(
            raw.errorMessage ??
            raw.failureReason ??
            ""
        )
    };
}

function extractNotifications(response) {
    if (Array.isArray(response)) {
        return response;
    }

    for (const items of [
        response?.content,
        response?.notifications,
        response?.data,
        response?.data?.content,
        response?.data?.notifications
    ]) {
        if (Array.isArray(items)) {
            return items;
        }
    }

    return [];
}

function resolveEndpoint(type) {
    const elements = getElements();

    const attributes = {
        list: "notificationsEndpoint",
        send: "notificationSendEndpoint"
    };

    const attribute = attributes[type];

    if (!attribute) {
        return null;
    }

    const endpoint =
        document.body.dataset[attribute] ??
        elements.content?.dataset[attribute] ??
        elements.sendForm?.dataset[attribute];

    if (!endpoint) {
        return null;
    }

    try {
        const url = new URL(
            endpoint,
            window.location.origin
        );

        if (
            url.origin !== window.location.origin ||
            !url.pathname.startsWith("/api/")
        ) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

function setLoading(value) {
    loading = value;

    const elements = getElements();

    if (value) {
        showElement(elements.loading);
        hideElement(elements.error);
    } else {
        hideElement(elements.loading);
    }

    if (elements.refresh) {
        elements.refresh.disabled = value;
    }

    const container =
        elements.tableBody ?? elements.grid;

    container?.setAttribute(
        "aria-busy",
        String(value)
    );
}

function createStatusBadge(status) {
    const variant =
        STATUS_VARIANTS[status] ?? "neutral";

    return createElement(
        "span",
        `badge badge-${variant}`,
        status || "UNKNOWN"
    );
}

function createNotificationRow(notification) {
    const row = document.createElement("tr");

    row.dataset.notificationId =
        String(notification.id);

    const idCell = createElement(
        "td",
        "admin-notification-id",
        `#${notification.id}`
    );

    const recipientCell = createElement(
        "td",
        "admin-notification-recipient",
        notification.recipient || "—"
    );

    const messageCell = document.createElement("td");

    const messageWrapper = createElement(
        "div",
        "admin-notification-message"
    );

    messageWrapper.appendChild(
        createElement(
            "strong",
            "admin-notification-title",
            notification.title
        )
    );

    messageWrapper.appendChild(
        createElement(
            "p",
            "admin-notification-preview",
            notification.message.length > 90
                ? `${notification.message.slice(0, 90)}…`
                : notification.message
        )
    );

    messageCell.appendChild(messageWrapper);

    const channelCell = createElement(
        "td",
        "admin-notification-channel",
        notification.channel || "—"
    );

    const statusCell = document.createElement("td");

    statusCell.appendChild(
        createStatusBadge(notification.status)
    );

    const dateCell = createElement(
        "td",
        "admin-notification-date",
        notification.createdAt
            ? formatDateTime(notification.createdAt)
            : "—"
    );

    const actionsCell = document.createElement("td");

    const button = createElement(
        "button",
        "btn btn-outline btn-sm",
        "Details"
    );

    button.type = "button";
    button.dataset.notificationDetailsId =
        String(notification.id);

    actionsCell.appendChild(button);

    row.append(
        idCell,
        recipientCell,
        messageCell,
        channelCell,
        statusCell,
        dateCell,
        actionsCell
    );

    return row;
}

function createNotificationCard(notification) {
    const card = createElement(
        "article",
        "admin-notification-card"
    );

    const header = createElement(
        "div",
        "admin-notification-card-header"
    );

    header.append(
        createElement(
            "strong",
            "",
            `#${notification.id}`
        ),
        createStatusBadge(notification.status)
    );

    const title = createElement(
        "h3",
        "admin-notification-card-title",
        notification.title
    );

    const message = createElement(
        "p",
        "admin-notification-card-message",
        notification.message
    );

    const metadata = createElement(
        "div",
        "admin-notification-card-meta"
    );

    metadata.append(
        createElement(
            "span",
            "",
            notification.recipient || "—"
        ),
        createElement(
            "span",
            "",
            notification.channel || "—"
        ),
        createElement(
            "span",
            "",
            notification.createdAt
                ? formatDateTime(notification.createdAt)
                : "—"
        )
    );

    const button = createElement(
        "button",
        "btn btn-outline btn-sm",
        "Details"
    );

    button.type = "button";
    button.dataset.notificationDetailsId =
        String(notification.id);

    card.append(
        header,
        title,
        message,
        metadata,
        button
    );

    return card;
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

        if (
            state.channel !== "ALL" &&
            notification.channel !== state.channel
        ) {
            return false;
        }

        if (!keyword) {
            return true;
        }

        return [
            notification.id,
            notification.title,
            notification.message,
            notification.recipient,
            notification.channel
        ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
    });
}

function updateStatistics(filteredCount) {
    const elements = getElements();

    setText(
        elements.totalCount,
        formatInteger(
            serverPagination
                ? totalElements
                : notifications.length
        )
    );

    setText(
        elements.resultsCount,
        `${formatInteger(filteredCount)} notifications`
    );

    for (const [status, element] of [
        ["SENT", elements.sentCount],
        ["PENDING", elements.pendingCount],
        ["FAILED", elements.failedCount]
    ]) {
        setText(
            element,
            serverPagination
                ? "—"
                : formatInteger(
                    notifications.filter(
                        item => item.status === status
                    ).length
                )
        );
    }
}

function createEmptyState(message) {
    const elements = getElements();

    const container =
        elements.tableBody ?? elements.grid;

    if (!container) {
        return;
    }

    if (container instanceof HTMLTableSectionElement) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "admin-table-empty";
        cell.textContent = message;

        row.appendChild(cell);
        container.replaceChildren(row);
    } else {
        container.replaceChildren(
            createElement(
                "p",
                "empty-state",
                message
            )
        );
    }
}

function renderPagination(totalPages) {
    const container = getElements().pagination;

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (totalPages <= 1) {
        return;
    }

    const previous = createElement(
        "button",
        "btn btn-outline btn-sm",
        "Previous"
    );

    previous.type = "button";
    previous.disabled = state.page === 0;

    const indicator = createElement(
        "span",
        "pagination-info",
        `${state.page + 1} / ${totalPages}`
    );

    const next = createElement(
        "button",
        "btn btn-outline btn-sm",
        "Next"
    );

    next.type = "button";
    next.disabled = state.page >= totalPages - 1;

    previous.addEventListener(
        "click",
        () => changePage(state.page - 1),
        { signal: eventController.signal }
    );

    next.addEventListener(
        "click",
        () => changePage(state.page + 1),
        { signal: eventController.signal }
    );

    container.append(
        previous,
        indicator,
        next
    );
}

function renderNotifications() {
    const elements = getElements();
    const filtered = getFilteredNotifications();

    const total = serverPagination
        ? totalElements
        : filtered.length;

    const totalPages = Math.ceil(
        total / PAGE_SIZE
    );

    if (!serverPagination) {
        state.page = Math.min(
            state.page,
            Math.max(0, totalPages - 1)
        );
    }

    const visible = serverPagination
        ? filtered
        : filtered.slice(
            state.page * PAGE_SIZE,
            (state.page + 1) * PAGE_SIZE
        );

    updateStatistics(
        serverPagination
            ? total
            : filtered.length
    );

    renderPagination(totalPages);

    const container =
        elements.tableBody ?? elements.grid;

    if (!container) {
        return;
    }

    if (visible.length === 0) {
        showElement(elements.empty);

        createEmptyState(
            "Хабарламалар табылмады."
        );

        return;
    }

    hideElement(elements.empty);
    hideElement(elements.error);

    const isTable =
        container instanceof HTMLTableSectionElement;

    const fragment = document.createDocumentFragment();

    for (const notification of visible) {
        fragment.appendChild(
            isTable
                ? createNotificationRow(notification)
                : createNotificationCard(notification)
        );
    }

    container.replaceChildren(fragment);
    showElement(elements.content);
}

function showListError(message) {
    const elements = getElements();

    const target = elements.error?.querySelector(
        "[data-error-message], .error-message, p"
    ) ?? elements.error;

    if (target) {
        setText(target, message);
        showElement(elements.error);
    } else {
        createEmptyState(message);
    }

    showError(message);
}

function buildListUrl(endpoint) {
    const url = new URL(endpoint);

    url.searchParams.set(
        "page",
        String(state.page)
    );

    url.searchParams.set(
        "size",
        String(PAGE_SIZE)
    );

    if (state.keyword) {
        url.searchParams.set(
            "keyword",
            state.keyword
        );
    } else {
        url.searchParams.delete("keyword");
    }

    if (state.status !== "ALL") {
        url.searchParams.set(
            "status",
            state.status
        );
    } else {
        url.searchParams.delete("status");
    }

    if (state.channel !== "ALL") {
        url.searchParams.set(
            "channel",
            state.channel
        );
    } else {
        url.searchParams.delete("channel");
    }

    return `${url.pathname}${url.search}`;
}

async function loadNotifications() {
    if (!active) {
        return;
    }

    const endpoint = resolveEndpoint("list");

    if (!endpoint) {
        notifications = [];
        totalElements = 0;

        showListError(
            "Admin хабарламаларына арналған API әлі байланыстырылмаған."
        );

        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const response = await api.get(
            buildListUrl(endpoint)
        );

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
                return (
                    (Date.parse(b.createdAt) || 0) -
                    (Date.parse(a.createdAt) || 0)
                ) || b.id - a.id;
            });

        const source = response?.data?.content
            ? response.data
            : response;

        const reportedTotal = Number(
            source?.totalElements
        );

        serverPagination =
            !Array.isArray(response) &&
            source?.totalElements != null &&
            Number.isFinite(reportedTotal);

        totalElements = serverPagination
            ? Math.max(0, reportedTotal)
            : notifications.length;

        renderNotifications();
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        notifications = [];

        showListError(
            getErrorMessage(error)
        );
    } finally {
        if (
            active &&
            version === requestVersion
        ) {
            setLoading(false);
        }
    }
}

function changePage(page) {
    if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page === state.page
    ) {
        return;
    }

    state.page = page;

    if (serverPagination) {
        loadNotifications();
    } else {
        renderNotifications();
    }
}

function getNotificationById(id) {
    return notifications.find(
        notification => notification.id === id
    ) ?? null;
}

function createDetailRow(label, value) {
    const row = createElement(
        "div",
        "admin-notification-detail-row"
    );

    row.append(
        createElement(
            "span",
            "admin-notification-detail-label",
            label
        ),
        createElement(
            "strong",
            "admin-notification-detail-value",
            value || "—"
        )
    );

    return row;
}

function viewNotificationDetails(id) {
    const notification = getNotificationById(id);
    const elements = getElements();

    if (!notification) {
        return;
    }

    if (
        !elements.detailsModal ||
        !elements.detailsContent
    ) {
        showInfo(
            `Хабарлама #${notification.id}: ${notification.status}`
        );
        return;
    }

    const details = [
        ["ID", `#${notification.id}`],
        ["Title", notification.title],
        ["Recipient", notification.recipient],
        ["Channel", notification.channel],
        ["Status", notification.status],
        [
            "Created",
            notification.createdAt
                ? formatDateTime(notification.createdAt)
                : "—"
        ],
        [
            "Sent",
            notification.sentAt
                ? formatDateTime(notification.sentAt)
                : "—"
        ],
        ["Message", notification.message]
    ];

    if (notification.errorMessage) {
        details.push([
            "Error",
            notification.errorMessage
        ]);
    }

    const fragment = document.createDocumentFragment();

    for (const [label, value] of details) {
        fragment.appendChild(
            createDetailRow(label, value)
        );
    }

    elements.detailsContent.replaceChildren(fragment);

    openModal(elements.detailsModal);
}

function openSendForm() {
    const elements = getElements();

    if (!elements.sendModal || !elements.sendForm) {
        showInfo(
            "Хабарлама жіберу формасы табылмады."
        );
        return;
    }

    elements.sendForm.reset();
    hideElement(elements.sendError);

    openModal(elements.sendModal);
}

function closeSendForm() {
    const elements = getElements();

    if (elements.sendModal) {
        closeModal(elements.sendModal);
    }
}

function getSendPayload() {
    const form = getElements().sendForm;

    if (!form) {
        return {};
    }

    const formData = new FormData(form);
    const payload = {};

    for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
            payload[key] = value.trim();
        }
    }

    if (payload.userId) {
        const userId = Number(payload.userId);

        if (Number.isSafeInteger(userId) && userId > 0) {
            payload.userId = userId;
        }
    }

    if (payload.channel) {
        payload.channel = normalizeStatus(
            payload.channel
        );
    }

    return payload;
}

function validateSendPayload(payload) {
    if (
        !payload.message ||
        !String(payload.message).trim()
    ) {
        return "Хабарлама мәтінін енгіз.";
    }

    if (
        !payload.recipient &&
        !payload.userId &&
        !payload.phoneNumber &&
        !payload.email
    ) {
        return "Хабарлама алушысын көрсет.";
    }

    return null;
}

function showSendError(message) {
    const element = getElements().sendError;

    if (element) {
        setText(element, message);
        showElement(element);
    } else {
        showError(message);
    }
}

async function handleSendNotification(event) {
    event.preventDefault();

    if (sending) {
        return;
    }

    const endpoint = resolveEndpoint("send");

    if (!endpoint) {
        showInfo(
            "Хабарлама жіберу үшін Spring Boot admin API қосу қажет."
        );
        return;
    }

    const payload = getSendPayload();
    const validationError = validateSendPayload(payload);

    if (validationError) {
        showSendError(validationError);
        return;
    }

    const button = getElements().sendSubmit;

    sending = true;

    if (button instanceof HTMLButtonElement) {
        setButtonLoading(
            button,
            true,
            "Sending..."
        );
    }

    try {
        await api.post(
            `${endpoint.pathname}${endpoint.search}`,
            payload
        );

        closeSendForm();

        showSuccess(
            "Хабарлама сұранысы серверге жіберілді. Жеткізу статусын тізімнен тексер."
        );

        await loadNotifications();
    } catch (error) {
        showSendError(
            getErrorMessage(error)
        );
    } finally {
        sending = false;

        if (button instanceof HTMLButtonElement) {
            setButtonLoading(button, false);
        }
    }
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    searchDebounce = debounce(() => {
        state.keyword = String(
            elements.search?.value ?? ""
        ).trim();

        state.page = 0;

        if (serverPagination) {
            loadNotifications();
        } else {
            renderNotifications();
        }
    }, 350);

    elements.search?.addEventListener(
        "input",
        searchDebounce,
        { signal }
    );

    elements.statusFilter?.addEventListener(
        "change",
        event => {
            const status = normalizeStatus(
                event.target.value
            );

            state.status = STATUSES.includes(status)
                ? status
                : "ALL";

            state.page = 0;

            if (serverPagination) {
                loadNotifications();
            } else {
                renderNotifications();
            }
        },
        { signal }
    );

    elements.channelFilter?.addEventListener(
        "change",
        event => {
            state.channel = normalizeStatus(
                event.target.value
            ) || "ALL";

            state.page = 0;

            if (serverPagination) {
                loadNotifications();
            } else {
                renderNotifications();
            }
        },
        { signal }
    );

    elements.refresh?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadNotifications();
        },
        { signal }
    );
}

function setupModals() {
    const elements = getElements();
    const signal = eventController.signal;

    if (elements.sendModal) {
        sendModalCleanup = setupModal(
            elements.sendModal,
            {
                closeButtons: [
                    "#send-notification-modal-close",
                    "#send-notification-cancel",
                    "[data-send-notification-close]"
                ]
            }
        );
    }

    if (elements.detailsModal) {
        detailsModalCleanup = setupModal(
            elements.detailsModal,
            {
                closeButtons: [
                    "#notification-details-close",
                    "[data-notification-details-close]"
                ]
            }
        );
    }

    elements.sendForm?.addEventListener(
        "submit",
        handleSendNotification,
        { signal }
    );

    if (
        elements.sendSubmit &&
        elements.sendForm &&
        !elements.sendForm.contains(elements.sendSubmit)
    ) {
        elements.sendSubmit.addEventListener(
            "click",
            event => {
                event.preventDefault();
                elements.sendForm.requestSubmit();
            },
            { signal }
        );
    }

    elements.sendCancel?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            closeSendForm();
        },
        { signal }
    );
}

function setupActions() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.sendButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            openSendForm();
        },
        { signal }
    );

    const container =
        elements.tableBody ?? elements.grid;

    container?.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                "[data-notification-details-id]"
            );

            if (!button) {
                return;
            }

            event.preventDefault();

            const id = Number(
                button.dataset.notificationDetailsId
            );

            if (
                Number.isSafeInteger(id) &&
                id > 0
            ) {
                viewNotificationDetails(id);
            }
        },
        { signal }
    );
}

export async function initAdminNotifications() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupFilters();
    setupModals();
    setupActions();

    await loadNotifications();
}

export function destroyAdminNotifications() {
    initialized = false;
    active = false;
    loading = false;
    sending = false;

    requestVersion++;

    searchDebounce?.cancel();
    eventController?.abort();

    sendModalCleanup?.();
    detailsModalCleanup?.();

    searchDebounce = null;
    eventController = null;
    sendModalCleanup = null;
    detailsModalCleanup = null;

    notifications = [];
    totalElements = 0;
    serverPagination = false;

    state = {
        keyword: "",
        status: "ALL",
        channel: "ALL",
        page: 0
    };
}

export const adminNotifications = {
    init: initAdminNotifications,
    destroy: destroyAdminNotifications,
    reload: loadNotifications,
    openSendForm,
    closeSendForm,
    viewDetails: viewNotificationDetails,
    getNotifications() {
        return [...notifications];
    },
    getState() {
        return { ...state };
    }
};

export default adminNotifications;
