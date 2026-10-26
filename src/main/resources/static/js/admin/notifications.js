
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const API = {
    list: "/api/notifications/admin",
    send: "/api/notifications/sms"
};

const ID = {
    content: "admin-notifications-content",
    refresh: "admin-notifications-refresh-button",
    retry: "admin-notifications-retry-button",
    compose: "admin-compose-notification-button",

    total: "admin-notifications-total",
    sent: "admin-notifications-sent",
    pending: "admin-notifications-pending",
    failed: "admin-notifications-failed",

    searchForm: "admin-notifications-search-form",
    search: "admin-notifications-search",
    filterToggle: "admin-notifications-filter-toggle",
    filters: "admin-notifications-filters",
    filterForm: "admin-notifications-filter-form",
    statusFilter: "admin-notifications-status-filter",
    sort: "admin-notifications-sort",
    pageSize: "admin-notifications-page-size",
    tabs: "admin-notifications-status-tabs",
    clearSearch: "admin-notifications-clear-search",

    loading: "admin-notifications-loading",
    error: "admin-notifications-error",
    errorMessage: "admin-notifications-error-message",
    empty: "admin-notifications-empty",
    filterEmpty: "admin-notifications-filter-empty",
    results: "admin-notifications-results-count",

    table: "admin-notifications-table-container",
    tableBody: "admin-notifications-table-body",
    footer: "admin-notifications-table-footer",
    paginationInfo: "admin-notifications-pagination-info",
    pagination: "admin-notifications-pagination",

    detailsModal: "admin-notification-details-modal",
    detailsClose: "admin-notification-details-close",
    detailsDone: "admin-notification-details-done",
    detailsCopy: "admin-notification-details-copy",

    composeModal: "admin-notification-compose-modal",
    composeForm: "admin-notification-compose-form",
    composeClose: "admin-notification-compose-close",
    composeCancel: "admin-notification-compose-cancel",
    composeError: "admin-notification-compose-error",
    recipientId: "admin-notification-recipient-id",
    recipientError: "admin-notification-recipient-error",
    phone: "admin-notification-phone-number",
    phoneError: "admin-notification-phone-error",
    message: "admin-notification-message",
    messageError: "admin-notification-message-error",
    messageCount: "admin-notification-message-count",
    messagePreview: "admin-notification-message-preview",
    send: "admin-notification-send-button",
    sendText: "admin-notification-send-text"
};

const STATUSES = ["SENT", "PENDING", "FAILED"];

const PAGE_SIZES = new Set([10, 20, 50]);

const PAGE_FETCH_SIZE = 50;
const MAX_FETCH_PAGES = 200;

const $ = id => document.getElementById(id);

const integers = new Intl.NumberFormat("kk-KZ");

const dates = new Intl.DateTimeFormat("kk-KZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
});

let initialized = false;
let active = false;
let loading = false;
let sending = false;
let requestVersion = 0;
let events = null;
let searchTimer = null;

let notifications = [];
let selectedNotification = null;
let focusBeforeModal = null;
let originalOverflow = "";

let state = defaultState();

function defaultState() {
    return {
        keyword: "",
        status: "ALL",
        sort: "newest",
        page: 0,
        size: 10
    };
}

function setText(id, value) {
    const target = $(id);

    if (target) {
        target.textContent = String(value ?? "—");
    }
}

function visible(id, value) {
    const target = $(id);

    if (!target) {
        return;
    }

    target.hidden = !value;
    target.classList.toggle("hidden", !value);
}

function make(tag, className = "", value = null) {
    const target = document.createElement(tag);

    if (className) {
        target.className = className;
    }

    if (value !== null && value !== undefined) {
        target.textContent = String(value);
    }

    return target;
}

function parseId(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}

function statusOf(value) {
    return String(value ?? "UNKNOWN")
        .trim()
        .toUpperCase();
}

function dateText(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? "—"
        : dates.format(date);
}

function badge(status) {
    const classes = {
        SENT: "badge-success",
        PENDING: "badge-warning",
        FAILED: "badge-danger"
    };

    const name = statusOf(status);

    return make(
        "span",
        `badge ${classes[name] ?? "badge-neutral"}`,
        name
    );
}

function normalizeNotification(raw) {
    const id = parseId(raw?.id);

    if (id === null) {
        return null;
    }

    const userId = parseId(raw.userId);

    return {
        id,
        userId,
        recipient: userId === null
            ? "Unknown"
            : `User #${userId}`,
        message: String(raw.message ?? ""),
        status: statusOf(raw.status),
        channel: "SMS",
        createdAt: raw.createdAt ?? null,
        sentAt: raw.sentAt ?? null
    };
}

function extractPage(response) {
    const source = response?.data?.content !== undefined
        ? response.data
        : response;

    if (Array.isArray(source)) {
        return {
            content: source,
            totalPages: null
        };
    }

    if (!Array.isArray(source?.content)) {
        throw new Error(
            "Notifications API дұрыс тізім қайтармады."
        );
    }

    const totalPages = Number(source.totalPages);

    return {
        content: source.content,
        totalPages:
            Number.isSafeInteger(totalPages) && totalPages >= 0
                ? totalPages
                : null
    };
}

async function fetchAll(version) {
    const all = [];

    for (let page = 0; page < MAX_FETCH_PAGES; page++) {
        const query = new URLSearchParams({
            page: String(page),
            size: String(PAGE_FETCH_SIZE),
            sort: "createdAt,desc"
        });

        const response = await api.get(
            `${API.list}?${query.toString()}`
        );

        if (!active || version !== requestVersion) {
            return null;
        }

        const result = extractPage(response);

        all.push(...result.content);

        if (
            result.totalPages === null ||
            page + 1 >= result.totalPages
        ) {
            return all;
        }
    }

    throw new Error(
        "Хабарламалар саны жүктеу шегінен асып кетті."
    );
}

function getFiltered() {
    const keyword = state.keyword.toLocaleLowerCase();

    return notifications
        .filter(item => {
            if (
                state.status !== "ALL" &&
                item.status !== state.status
            ) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            return [
                item.id,
                item.userId,
                item.recipient,
                item.message,
                item.status
            ]
                .join(" ")
                .toLocaleLowerCase()
                .includes(keyword);
        })
        .sort((a, b) => {
            switch (state.sort) {
                case "oldest":
                    return (
                        (Date.parse(a.createdAt) || 0) -
                        (Date.parse(b.createdAt) || 0)
                    ) || a.id - b.id;

                case "status-asc":
                    return a.status.localeCompare(b.status) ||
                        b.id - a.id;

                case "status-desc":
                    return b.status.localeCompare(a.status) ||
                        b.id - a.id;

                default:
                    return (
                        (Date.parse(b.createdAt) || 0) -
                        (Date.parse(a.createdAt) || 0)
                    ) || b.id - a.id;
            }
        });
}

function renderStatistics() {
    setText(
        ID.total,
        integers.format(notifications.length)
    );

    for (const [status, id] of [
        ["SENT", ID.sent],
        ["PENDING", ID.pending],
        ["FAILED", ID.failed]
    ]) {
        setText(
            id,
            integers.format(
                notifications.filter(
                    item => item.status === status
                ).length
            )
        );
    }
}

function makeRow(item) {
    const row = document.createElement("tr");

    row.dataset.notificationId = String(item.id);

    const id = make("td", "", `#${item.id}`);

    const recipient = make(
        "td",
        "admin-notification-recipient",
        item.recipient
    );

    const messageCell = document.createElement("td");

    const message = make(
        "div",
        "admin-notification-message"
    );

    message.appendChild(
        make(
            "p",
            "admin-notification-preview",
            item.message.length > 100
                ? `${item.message.slice(0, 100)}…`
                : item.message
        )
    );

    messageCell.appendChild(message);

    const channel = make(
        "td",
        "admin-notification-channel",
        item.channel
    );

    const statusCell = document.createElement("td");
    statusCell.appendChild(badge(item.status));

    const created = make(
        "td",
        "admin-notification-date",
        dateText(item.createdAt)
    );

    const actionsCell = document.createElement("td");

    const details = make(
        "button",
        "btn btn-outline btn-sm",
        "Details"
    );

    details.type = "button";
    details.dataset.notificationId = String(item.id);

    actionsCell.appendChild(details);

    row.append(
        id,
        recipient,
        messageCell,
        channel,
        statusCell,
        created,
        actionsCell
    );

    return row;
}

function pageButton(label, page, disabled = false, selected = false) {
    const button = make(
        "button",
        "pagination-button",
        label
    );

    button.type = "button";
    button.dataset.page = String(page);
    button.disabled = disabled || selected;

    button.classList.toggle("is-active", selected);

    if (selected) {
        button.setAttribute("aria-current", "page");
    }

    return button;
}

function renderPagination(totalPages) {
    const container = $(ID.pagination);

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    if (totalPages > 1) {
        fragment.appendChild(
            pageButton("Previous", state.page - 1, state.page === 0)
        );

        const start = Math.max(0, state.page - 2);
        const end = Math.min(totalPages - 1, state.page + 2);

        if (start > 0) {
            fragment.appendChild(pageButton("1", 0));
        }

        for (let page = start; page <= end; page++) {
            fragment.appendChild(
                pageButton(
                    String(page + 1),
                    page,
                    false,
                    page === state.page
                )
            );
        }

        if (end < totalPages - 1) {
            fragment.appendChild(
                pageButton(
                    String(totalPages),
                    totalPages - 1
                )
            );
        }

        fragment.appendChild(
            pageButton(
                "Next",
                state.page + 1,
                state.page === totalPages - 1
            )
        );
    }

    container.replaceChildren(fragment);
}

function syncControls() {
    const values = {
        [ID.search]: state.keyword,
        [ID.statusFilter]: state.status,
        [ID.sort]: state.sort,
        [ID.pageSize]: String(state.size)
    };

    for (const [id, value] of Object.entries(values)) {
        const target = $(id);

        if (target) {
            target.value = value;
        }
    }

    $(ID.tabs)?.querySelectorAll("[data-status]")
        .forEach(button => {
            const selected =
                button.dataset.status === state.status;

            button.classList.toggle(
                "is-active",
                selected
            );

            button.setAttribute(
                "aria-pressed",
                String(selected)
            );
        });
}

function render() {
    const filtered = getFiltered();

    const totalPages = Math.ceil(
        filtered.length / state.size
    );

    state.page = Math.min(
        state.page,
        Math.max(0, totalPages - 1)
    );

    const start = state.page * state.size;

    const displayed = filtered.slice(
        start,
        start + state.size
    );

    renderStatistics();

    setText(
        ID.results,
        `${integers.format(filtered.length)} хабарлама табылды`
    );

    visible(ID.empty, notifications.length === 0);

    visible(
        ID.filterEmpty,
        notifications.length > 0 && filtered.length === 0
    );

    visible(ID.table, displayed.length > 0);
    visible(ID.footer, displayed.length > 0);
    visible(ID.error, false);

    const fragment = document.createDocumentFragment();

    for (const item of displayed) {
        fragment.appendChild(makeRow(item));
    }

    $(ID.tableBody)?.replaceChildren(fragment);

    setText(
        ID.paginationInfo,
        displayed.length
            ? `${start + 1}–${start + displayed.length} / ${filtered.length}`
            : "0 / 0"
    );

    renderPagination(totalPages);
    syncControls();
}

function setLoading(value) {
    loading = value;

    visible(ID.loading, value);

    if (value) {
        visible(ID.error, false);
        visible(ID.empty, false);
        visible(ID.filterEmpty, false);
        visible(ID.table, false);
        visible(ID.footer, false);
    }

    for (const id of [ID.refresh, ID.retry]) {
        const button = $(id);

        if (button instanceof HTMLButtonElement) {
            button.disabled = value;
        }
    }
}

function renderLoadError(error) {
    notifications = [];

    for (const id of [
        ID.total,
        ID.sent,
        ID.pending,
        ID.failed
    ]) {
        setText(id, "—");
    }

    setText(
        ID.results,
        "Хабарламаларды жүктеу мүмкін болмады"
    );

    setText(
        ID.errorMessage,
        getErrorMessage(error)
    );

    visible(ID.error, true);
    visible(ID.empty, false);
    visible(ID.filterEmpty, false);
    visible(ID.table, false);
    visible(ID.footer, false);

    $(ID.tableBody)?.replaceChildren();
    $(ID.pagination)?.replaceChildren();

    if (!$(ID.error)) {
        showError(getErrorMessage(error));
    }
}

async function loadNotifications() {
    if (!active) {
        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const raw = await fetchAll(version);

        if (
            !active ||
            version !== requestVersion ||
            raw === null
        ) {
            return;
        }

        const unique = new Map();

        for (const entry of raw) {
            const item = normalizeNotification(entry);

            if (item) {
                unique.set(item.id, item);
            }
        }

        notifications = [...unique.values()];

        setLoading(false);
        render();
    } catch (error) {
        if (!active || version !== requestVersion) {
            return;
        }

        setLoading(false);
        renderLoadError(error);
    }
}

function openModal(id) {
    const modal = $(id);

    if (!modal) {
        return false;
    }

    focusBeforeModal =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    return true;
}

function closeModal(id) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.classList.add("hidden");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = originalOverflow;

    if (
        focusBeforeModal instanceof HTMLElement &&
        focusBeforeModal.isConnected
    ) {
        focusBeforeModal.focus();
    }

    focusBeforeModal = null;
}

function fillDetails(item) {
    const details = {
        "admin-notification-detail-number": `#${item.id}`,
        "admin-notification-detail-id": item.id,
        "admin-notification-detail-recipient": item.recipient,
        "admin-notification-detail-user-id": item.userId ?? "—",
        "admin-notification-detail-channel": item.channel,
        "admin-notification-detail-created-at": dateText(item.createdAt),
        "admin-notification-detail-status-text": item.status,
        "admin-notification-detail-message": item.message
    };

    for (const [id, value] of Object.entries(details)) {
        setText(id, value);
    }

    const badgeTarget = $("admin-notification-detail-status");

    if (badgeTarget) {
        badgeTarget.replaceWith(
            Object.assign(badge(item.status), {
                id: "admin-notification-detail-status"
            })
        );
    }

    visible(
        "admin-notification-detail-failure",
        item.status === "FAILED"
    );

    setText(
        "admin-notification-detail-failure-message",
        "Хабарлама жіберу операциясы сәтсіз аяқталды."
    );
}

function viewNotificationDetails(notificationId) {
    const item = notifications.find(
        entry => entry.id === notificationId
    );

    if (!item) {
        showError("Хабарлама табылмады.");
        return;
    }

    selectedNotification = item;

    fillDetails(item);

    if (openModal(ID.detailsModal)) {
        $(ID.detailsClose)?.focus();
    }
}

async function copyMessage() {
    if (!selectedNotification) {
        return;
    }

    const message = selectedNotification.message;

    try {
        await navigator.clipboard.writeText(message);

        showSuccess("Хабарлама мәтіні көшірілді.");
    } catch {
        const textarea = document.createElement("textarea");

        textarea.value = message;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);
        textarea.select();

        const copied = document.execCommand("copy");

        textarea.remove();

        if (copied) {
            showSuccess("Хабарлама мәтіні көшірілді.");
        } else {
            showError("Мәтінді көшіру мүмкін болмады.");
        }
    }
}

function closeDetails() {
    closeModal(ID.detailsModal);
    selectedNotification = null;
}

function updateMessagePreview() {
    const message = String(
        $(ID.message)?.value ?? ""
    );

    setText(
        ID.messageCount,
        `${message.length} / 1000`
    );

    setText(
        ID.messagePreview,
        message.trim() ||
        "Хабарлама мәтіні осы жерде көрсетіледі."
    );
}

function clearComposeErrors() {
    for (const id of [
        ID.composeError,
        ID.recipientError,
        ID.phoneError,
        ID.messageError
    ]) {
        visible(id, false);
    }
}

function showComposeError(id, message) {
    setText(id, message);
    visible(id, true);
}

function openComposeForm() {
    if (sending) {
        return;
    }

    $(ID.composeForm)?.reset();

    clearComposeErrors();
    updateMessagePreview();

    if (openModal(ID.composeModal)) {
        $(ID.recipientId)?.focus();
    }
}

function closeComposeForm() {
    if (sending) {
        return;
    }

    closeModal(ID.composeModal);
}

function getSendPayload() {
    const userId = parseId(
        $(ID.recipientId)?.value
    );

    const phoneNumber = String(
        $(ID.phone)?.value ?? ""
    ).trim();

    const message = String(
        $(ID.message)?.value ?? ""
    ).trim();

    return {
        userId,
        phoneNumber,
        message
    };
}

function validatePayload(payload) {
    clearComposeErrors();

    if (payload.userId === null) {
        showComposeError(
            ID.recipientError,
            "Дұрыс User ID енгіз."
        );

        $(ID.recipientId)?.focus();
        return false;
    }

    if (
        payload.phoneNumber.length < 7 ||
        payload.phoneNumber.length > 30 ||
        !/^\+?[0-9 ()-]+$/.test(payload.phoneNumber)
    ) {
        showComposeError(
            ID.phoneError,
            "Дұрыс телефон нөмірін енгіз."
        );

        $(ID.phone)?.focus();
        return false;
    }

    if (
        payload.message.length < 1 ||
        payload.message.length > 1000
    ) {
        showComposeError(
            ID.messageError,
            "Хабарлама 1–1000 таңбадан тұруы керек."
        );

        $(ID.message)?.focus();
        return false;
    }

    return true;
}

async function sendNotification(event) {
    event.preventDefault();

    if (sending) {
        return;
    }

    const payload = getSendPayload();

    if (!validatePayload(payload)) {
        return;
    }

    const confirmed = window.confirm(
        `User #${payload.userId} үшін SMS жіберу сұранысын растайсың ба?`
    );

    if (!confirmed) {
        return;
    }

    sending = true;

    const button = $(ID.send);

    if (button) {
        button.disabled = true;
    }

    setText(ID.sendText, "Жіберілуде...");

    try {
        await api.post(API.send, payload);

        sending = false;

        closeComposeForm();

        showSuccess(
            "Хабарлама сұранысы өңделді. Жіберілу нәтижесін тізімнен тексер."
        );

        await loadNotifications();
    } catch (error) {
        showComposeError(
            ID.composeError,
            getErrorMessage(error)
        );
    } finally {
        sending = false;

        if (button) {
            button.disabled = false;
        }

        setText(
            ID.sendText,
            "Send Notification"
        );
    }
}

function applyFilters() {
    const keyword = String(
        $(ID.search)?.value ?? ""
    ).trim();

    const requestedStatus = statusOf(
        $(ID.statusFilter)?.value ?? "ALL"
    );

    const requestedSort = String(
        $(ID.sort)?.value ?? "newest"
    );

    const requestedSize = Number(
        $(ID.pageSize)?.value ?? 10
    );

    state.keyword = keyword;

    state.status =
        requestedStatus === "ALL" ||
        STATUSES.includes(requestedStatus)
            ? requestedStatus
            : "ALL";

    state.sort = [
        "newest",
        "oldest",
        "status-asc",
        "status-desc"
    ].includes(requestedSort)
        ? requestedSort
        : "newest";

    state.size = PAGE_SIZES.has(requestedSize)
        ? requestedSize
        : 10;

    state.page = 0;

    render();
}

function resetFilters() {
    clearTimeout(searchTimer);
    searchTimer = null;

    state = defaultState();

    syncControls();
    render();
}

function on(target, event, callback) {
    target?.addEventListener(
        event,
        callback,
        {
            signal: events.signal
        }
    );
}

function setupEvents() {
    for (const id of [
        ID.refresh,
        ID.retry
    ]) {
        on($(id), "click", event => {
            event.preventDefault();
            loadNotifications();
        });
    }

    on($(ID.search), "input", () => {
        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            if (!active) {
                return;
            }

            state.keyword = String(
                $(ID.search)?.value ?? ""
            ).trim();

            state.page = 0;
            render();
        }, 300);
    });

    on($(ID.searchForm), "submit", event => {
        event.preventDefault();
        clearTimeout(searchTimer);
        applyFilters();
    });

    on($(ID.tabs), "click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest(
            "[data-status]"
        );

        if (!button) {
            return;
        }

        const requested = statusOf(
            button.dataset.status
        );

        if (
            requested !== "ALL" &&
            !STATUSES.includes(requested)
        ) {
            return;
        }

        state.status = requested;
        state.page = 0;

        render();
    });

    on($(ID.filterToggle), "click", event => {
        event.preventDefault();

        const panel = $(ID.filters);

        if (!panel) {
            return;
        }

        const expanded =
            panel.hidden ||
            panel.classList.contains("hidden");

        visible(ID.filters, expanded);

        $(ID.filterToggle)?.setAttribute(
            "aria-expanded",
            String(expanded)
        );
    });

    on($(ID.filterForm), "submit", event => {
        event.preventDefault();
        applyFilters();
    });

    on($(ID.filterForm), "reset", event => {
        event.preventDefault();
        resetFilters();
    });

    on($(ID.clearSearch), "click", event => {
        event.preventDefault();
        resetFilters();
    });

    for (const id of [
        ID.statusFilter,
        ID.sort,
        ID.pageSize
    ]) {
        on($(id), "change", applyFilters);
    }

    on($(ID.pagination), "click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest(
            "[data-page]"
        );

        if (!button || button.disabled) {
            return;
        }

        const page = Number(
            button.dataset.page
        );

        const totalPages = Math.ceil(
            getFiltered().length / state.size
        );

        if (
            !Number.isSafeInteger(page) ||
            page < 0 ||
            page >= totalPages
        ) {
            return;
        }

        state.page = page;
        render();
    });

    on($(ID.tableBody), "click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest(
            "[data-notification-id]"
        );

        if (!button) {
            return;
        }

        const id = parseId(
            button.dataset.notificationId
        );

        if (id !== null) {
            viewNotificationDetails(id);
        }
    });

    on($(ID.detailsClose), "click", closeDetails);
    on($(ID.detailsDone), "click", closeDetails);
    on($(ID.detailsCopy), "click", copyMessage);

    on($(ID.compose), "click", event => {
        event.preventDefault();
        openComposeForm();
    });

    on($(ID.composeClose), "click", closeComposeForm);
    on($(ID.composeCancel), "click", closeComposeForm);
    on($(ID.composeForm), "submit", sendNotification);

    on($(ID.message), "input", updateMessagePreview);

    for (const id of [
        ID.detailsModal,
        ID.composeModal
    ]) {
        on($(id), "click", event => {
            if (event.target !== event.currentTarget) {
                return;
            }

            if (id === ID.detailsModal) {
                closeDetails();
            } else {
                closeComposeForm();
            }
        });
    }

    on(document, "keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        if (!$(ID.composeModal)?.hidden) {
            closeComposeForm();
        } else if (!$(ID.detailsModal)?.hidden) {
            closeDetails();
        }
    });
}

export async function initAdminNotifications() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    events = new AbortController();

    const compose = $(ID.compose);

    if (compose) {
        compose.hidden = false;
        compose.classList.remove("hidden");
    }

    setupEvents();
    syncControls();

    await loadNotifications();
}

export function destroyAdminNotifications() {
    initialized = false;
    active = false;
    loading = false;
    sending = false;

    requestVersion++;

    clearTimeout(searchTimer);
    searchTimer = null;

    events?.abort();
    events = null;

    for (const id of [
        ID.detailsModal,
        ID.composeModal
    ]) {
        const modal = $(id);

        if (modal) {
            modal.hidden = true;
            modal.classList.add("hidden");
            modal.classList.remove("is-open");
        }
    }

    document.body.style.overflow =
        originalOverflow;

    notifications = [];
    selectedNotification = null;

    state = defaultState();
}

export const adminNotifications = {
    init: initAdminNotifications,
    destroy: destroyAdminNotifications,
    reload: loadNotifications,
    openSendForm: openComposeForm,
    closeSendForm: closeComposeForm,
    viewDetails: viewNotificationDetails,

    getNotifications() {
        return notifications.map(item => ({
            ...item
        }));
    },

    getState() {
        return {
            ...state
        };
    }
};

export default adminNotifications;
