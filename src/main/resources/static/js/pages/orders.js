
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
    formatCurrency,
    formatDateTime,
    formatInteger,
    normalizeStatus,
    renderStatusBadge,
    renderPagination,
    updateQueryParams,
    debounce,
    parsePositiveId
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const PAGE_SIZE = 8;

const ORDER_STATUSES = new Set([
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED"
]);

const SORT_OPTIONS = new Set([
    "newest",
    "oldest",
    "price-desc",
    "price-asc",
    "total-desc",
    "total-asc"
]);

const SELECTORS = {
    loading: [
        "#orders-loading",
        "#orders-loading-state"
    ],
    content: [
        "#orders-content",
        "#orders-main-content"
    ],
    list: [
        "#orders-list",
        "#my-orders-list",
        "#orders-container",
        "[data-orders-list]"
    ],
    empty: [
        "#orders-empty",
        "#orders-empty-state"
    ],
    error: [
        "#orders-error",
        "#orders-error-state"
    ],
    auth: [
        "#orders-auth-required",
        "#orders-login-required"
    ],
    search: [
        "#orders-search",
        "#orders-search-input",
        'input[name="orderSearch"]',
        "[data-orders-search]"
    ],
    searchForm: [
        "#orders-search-form",
        "[data-orders-search-form]"
    ],
    status: [
        "#orders-status-filter",
        "#orders-filter-status",
        'select[name="status"]'
    ],
    statusTabs: [
        "#orders-status-tabs",
        "[data-orders-status-tabs]"
    ],
    sort: [
        "#orders-sort",
        "#orders-sort-select",
        'select[name="sort"]'
    ],
    count: [
        "#orders-result-count",
        "#orders-count",
        "#orders-results-count",
        "[data-orders-count]"
    ],
    pagination: [
        "#orders-pagination",
        "[data-orders-pagination]"
    ],
    paginationInfo: [
        "#orders-pagination-info",
        "[data-orders-pagination-info]"
    ],
    refresh: [
        "#orders-refresh-button",
        "#orders-refresh",
        "[data-orders-refresh]"
    ],
    totalOrders: [
        "#orders-total-count",
        "[data-total-orders]"
    ],
    pendingOrders: [
        "#orders-pending-count",
        "[data-pending-orders]"
    ],
    deliveredOrders: [
        "#orders-delivered-count",
        "[data-delivered-orders]"
    ],
    cancelledOrders: [
        "#orders-cancelled-count",
        "[data-cancelled-orders]"
    ],
    resetFilter: [
        "#orders-reset-filter"
    ],
    filterEmpty: [
        "#orders-filter-empty"
    ],
    retry: [
        "#orders-retry-button"
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let searchDebounce = null;

const cancellingOrders = new Set();

let allOrders = [];

let state = {
    keyword: "",
    status: "ALL",
    sort: "newest",
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
    const result = {};

    for (const [key, selectors] of Object.entries(SELECTORS)) {
        result[key] = findElement(selectors);
    }

    return result;
}

function setText(element, value) {
    if (element) {
        element.textContent = String(value ?? "");
    }
}

function show(element) {
    if (!element) {
        return;
    }

    element.hidden = false;
    element.classList.remove("hidden");
}

function hide(element) {
    if (!element) {
        return;
    }

    element.hidden = true;
    element.classList.add("hidden");
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

function normalizeOrder(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const id = parsePositiveId(raw.id ?? raw.orderId);

    if (id === null) {
        return null;
    }

    const total = Number(
        raw.totalAmount ??
        raw.totalPrice ??
        raw.total ??
        0
    );

    return {
        ...raw,
        id,
        status: normalizeStatus(
            raw.status ?? raw.orderStatus
        ),
        paymentStatus: normalizeStatus(
            raw.paymentStatus ?? raw.payment?.status
        ),
        totalAmount: Number.isFinite(total) ? total : 0,
        createdAt:
            raw.createdAt ??
            raw.orderDate ??
            raw.createdDate ??
            null,
        items: Array.isArray(raw.items) ? raw.items : []
    };
}

function extractOrders(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.orders)) {
        return response.orders;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    return [];
}

function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const requestedStatus = normalizeStatus(
        params.get("status") ?? "ALL"
    );

    const requestedSort = params.get("sort") ?? "newest";
    const requestedPage = Number(params.get("page") ?? 0);

    return {
        keyword: String(params.get("keyword") ?? "").trim(),
        status: ORDER_STATUSES.has(requestedStatus)
            ? requestedStatus
            : "ALL",
        sort: SORT_OPTIONS.has(requestedSort)
            ? requestedSort
            : "newest",
        page: Number.isSafeInteger(requestedPage) && requestedPage >= 0
            ? requestedPage
            : 0
    };
}

function syncUrl() {
    updateQueryParams({
        keyword: state.keyword || null,
        status: state.status === "ALL"
            ? null
            : state.status,
        sort: state.sort === "newest"
            ? null
            : state.sort,
        page: state.page > 0
            ? state.page
            : null
    });
}

function updateStatusTabs() {
    const container = getElements().statusTabs;

    if (!container) {
        return;
    }

    const buttons = container.querySelectorAll(
        "[data-status], [data-order-status]"
    );

    for (const button of buttons) {
        const requestedStatus = normalizeStatus(
            button.dataset.status ??
            button.dataset.orderStatus ??
            "ALL"
        );

        const selected = requestedStatus === state.status;

        button.classList.toggle("is-active", selected);
        button.classList.toggle("active", selected);

        button.setAttribute("aria-pressed", String(selected));
    }
}

function syncControls() {
    const elements = getElements();

    if (elements.search) {
        elements.search.value = state.keyword;
    }

    if (elements.status) {
        const option = Array.from(elements.status.options ?? [])
            .find(item => {
                return normalizeStatus(item.value) === state.status;
            });

        if (option) {
            elements.status.value = option.value;
        }
    }

    if (elements.sort) {
        const available = Array.from(elements.sort.options ?? [])
            .some(option => option.value === state.sort);

        if (available) {
            elements.sort.value = state.sort;
        }
    }

    updateStatusTabs();
}

function setPageState(pageState) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        empty: elements.empty,
        error: elements.error,
        auth: elements.auth
    };

    for (const [name, element] of Object.entries(sections)) {
        if (name === pageState) {
            show(element);
        } else {
            hide(element);
        }
    }

    if (pageState !== "content") {
        hide(elements.filterEmpty);
    }
}

function showFallbackMessage(title, description, linkText, linkUrl) {
    const elements = getElements();

    if (!elements.list || !elements.content) {
        showError(description);
        return;
    }

    const wrapper = createElement(
        "div",
        "empty-state orders-dynamic-state"
    );

    wrapper.appendChild(
        createElement("h3", "empty-state-title", title)
    );

    wrapper.appendChild(
        createElement("p", "empty-state-text", description)
    );

    if (linkText && linkUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            linkText
        );

        link.href = linkUrl;
        wrapper.appendChild(link);
    }

    elements.list.replaceChildren(wrapper);
    show(elements.content);
}

function showAuthRequired() {
    setPageState("auth");

    const elements = getElements();
    const loginUrl = getLoginUrl("/pages/orders.html");

    if (elements.auth) {
        const loginLink = elements.auth.querySelector(
            'a[href*="login.html"]'
        );

        if (loginLink) {
            loginLink.href = loginUrl;
        }
    } else {
        showFallbackMessage(
            "Жүйеге кіру қажет",
            "Тапсырыстарыңды көру үшін аккаунтыңа кір.",
            "Жүйеге кіру",
            loginUrl
        );
    }
}

function showOrdersError(error) {
    const elements = getElements();
    const message = getErrorMessage(error);

    setPageState("error");

    if (elements.error) {
        setText(
            document.getElementById("orders-error-message"),
            message
        );
    } else {
        showFallbackMessage(
            "Тапсырыстарды жүктеу мүмкін болмады",
            message,
            "Каталогты ашу",
            "/pages/catalog.html"
        );
    }
}

function getOrderItemCount(order) {
    if (Array.isArray(order.items) && order.items.length > 0) {
        return order.items.reduce((sum, item) => {
            const quantity = Number(item.quantity);

            return sum + (
                Number.isFinite(quantity)
                    ? Math.max(0, quantity)
                    : 0
            );
        }, 0);
    }

    const reported = Number(
        order.totalItems ??
        order.itemCount ??
        order.itemsCount
    );

    return Number.isFinite(reported)
        ? Math.max(0, reported)
        : null;
}

function createOrderMeta(label, value) {
    const wrapper = createElement(
        "div",
        "order-card-meta-item"
    );

    wrapper.append(
        createElement(
            "span",
            "order-card-meta-label",
            label
        ),
        createElement(
            "strong",
            "order-card-meta-value",
            value
        )
    );

    return wrapper;
}

function canCancelOrder(order) {
    return (
        order.status === "PENDING" ||
        order.status === "CONFIRMED"
    );
}

function createOrderCard(order) {
    const article = createElement(
        "article",
        "order-card orders-list-card"
    );

    article.dataset.orderId = String(order.id);

    const header = createElement("div", "order-card-header");
    const identity = createElement("div", "order-card-identity");

    identity.append(
        createElement(
            "span",
            "order-card-eyebrow",
            "ТАПСЫРЫС"
        ),
        createElement(
            "h3",
            "order-card-title",
            `Тапсырыс #${order.id}`
        )
    );

    const statusWrapper = createElement(
        "div",
        "order-card-status"
    );

    const statusBadge = createElement("span");

    statusBadge.innerHTML = renderStatusBadge(
        order.status,
        "order"
    );

    statusWrapper.appendChild(statusBadge);

    header.append(identity, statusWrapper);

    const details = createElement(
        "div",
        "order-card-details"
    );

    details.appendChild(
        createOrderMeta(
            "Тапсырыс күні",
            order.createdAt
                ? formatDateTime(order.createdAt)
                : "—"
        )
    );

    const itemCount = getOrderItemCount(order);

    if (itemCount !== null) {
        details.appendChild(
            createOrderMeta(
                "Тауар саны",
                formatInteger(itemCount)
            )
        );
    }

    details.appendChild(
        createOrderMeta(
            "Жалпы сомасы",
            formatCurrency(order.totalAmount)
        )
    );

    if (order.paymentStatus) {
        const payment = createOrderMeta(
            "Төлем статусы",
            order.paymentStatus
        );

        details.appendChild(payment);
    }

    const footer = createElement(
        "div",
        "order-card-footer"
    );

    const total = createElement(
        "div",
        "order-card-total"
    );

    total.append(
        createElement(
            "span",
            "order-card-total-label",
            "Тапсырыс сомасы"
        ),
        createElement(
            "strong",
            "order-card-total-amount",
            formatCurrency(order.totalAmount)
        )
    );

    const actions = createElement(
        "div",
        "order-card-actions"
    );

    const detailsLink = createElement(
        "a",
        "btn btn-primary order-details-button",
        "Толығырақ"
    );

    detailsLink.href =
        `/pages/order-details.html?id=${encodeURIComponent(order.id)}`;

    actions.appendChild(detailsLink);

    if (canCancelOrder(order)) {
        const cancelButton = createElement(
            "button",
            "btn btn-outline order-cancel-button",
            "Тапсырыстан бас тарту"
        );

        cancelButton.type = "button";
        cancelButton.dataset.cancelOrderId = String(order.id);

        actions.appendChild(cancelButton);
    }

    footer.append(total, actions);

    article.append(
        header,
        details,
        footer
    );

    return article;
}

function getFilteredOrders() {
    const keyword = state.keyword.trim().toLowerCase();

    const filtered = allOrders.filter(order => {
        if (
            state.status !== "ALL" &&
            order.status !== state.status
        ) {
            return false;
        }

        if (!keyword) {
            return true;
        }

        const searchable = [
            String(order.id),
            `#${order.id}`,
            order.status,
            order.shippingAddress,
            ...order.items.map(item => {
                return item.productName ?? item.name ?? "";
            })
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchable.includes(keyword);
    });

    filtered.sort((a, b) => {
        switch (state.sort) {
            case "oldest":
                return (
                    new Date(a.createdAt || 0).getTime() -
                    new Date(b.createdAt || 0).getTime()
                ) || a.id - b.id;

            case "price-desc":
            case "total-desc":
                return b.totalAmount - a.totalAmount;

            case "price-asc":
            case "total-asc":
                return a.totalAmount - b.totalAmount;

            default:
                return (
                    new Date(b.createdAt || 0).getTime() -
                    new Date(a.createdAt || 0).getTime()
                ) || b.id - a.id;
        }
    });

    return filtered;
}

function updateStatistics() {
    const elements = getElements();

    const total = allOrders.length;

    setText(
        elements.totalOrders,
        `${formatInteger(total)} тапсырыс`
    );

    setText(
        elements.pendingOrders,
        formatInteger(
            allOrders.filter(order =>
                order.status === "PENDING"
            ).length
        )
    );

    setText(
        elements.deliveredOrders,
        formatInteger(
            allOrders.filter(order =>
                order.status === "DELIVERED"
            ).length
        )
    );

    setText(
        elements.cancelledOrders,
        formatInteger(
            allOrders.filter(order =>
                order.status === "CANCELLED"
            ).length
        )
    );

    if (elements.totalOrders) {
        if (total > 0) {
            show(elements.totalOrders);
        } else {
            hide(elements.totalOrders);
        }
    }
}

function showEmptyOrders() {
    const elements = getElements();

    const isFiltered =
        Boolean(state.keyword) ||
        state.status !== "ALL";

    if (isFiltered && allOrders.length > 0 && elements.filterEmpty) {
        setPageState("content");
        show(elements.filterEmpty);

        elements.list?.replaceChildren();
        elements.pagination?.replaceChildren();

        setText(elements.count, "0 тапсырыс");

        return;
    }

    const title = isFiltered
        ? "Бұл сүзгі бойынша тапсырыс жоқ"
        : "Әзірге тапсырыстарың жоқ";

    const description = isFiltered
        ? "Басқа статусты таңда немесе барлық тапсырыстарыңды қарап көр."
        : "Сен әлі тапсырыс жасамадың. Каталогтан өзіңе ұнаған алғашқы тауарыңды таңда.";

    setPageState("empty");

    if (elements.empty) {
        setText(
            document.getElementById("orders-empty-title"),
            title
        );

        setText(
            document.getElementById("orders-empty-message"),
            description
        );
    } else {
        showFallbackMessage(
            title,
            description,
            "Каталогты ашу",
            "/pages/catalog.html"
        );
    }

    elements.list?.replaceChildren();
    elements.pagination?.replaceChildren();

    setText(elements.count, "0 тапсырыс");
    setText(elements.paginationInfo, "0 нәтиже");
}

function renderOrders() {
    if (!active) {
        return;
    }

    const elements = getElements();

    const filteredOrders = getFilteredOrders();

    updateStatistics();

    const totalPages = Math.ceil(
        filteredOrders.length / PAGE_SIZE
    );

    state.page = totalPages === 0
        ? 0
        : Math.min(state.page, totalPages - 1);

    syncUrl();

    if (filteredOrders.length === 0) {
        showEmptyOrders();
        return;
    }

    setPageState("content");

    const start = state.page * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    const visibleOrders = filteredOrders.slice(start, end);

    const fragment = document.createDocumentFragment();

    for (const order of visibleOrders) {
        fragment.appendChild(createOrderCard(order));
    }

    elements.list?.replaceChildren(fragment);

    setText(
        elements.count,
        `${formatInteger(filteredOrders.length)} тапсырыс`
    );

    const from = start + 1;
    const to = Math.min(end, filteredOrders.length);

    setText(
        elements.paginationInfo,
        `${from}–${to} / ${filteredOrders.length}`
    );

    const pageData = {
        number: state.page,
        size: PAGE_SIZE,
        totalElements: filteredOrders.length,
        totalPages
    };

    if (elements.pagination) {
        renderPagination(
            elements.pagination,
            pageData,
            page => {
                state.page = page;

                renderOrders();

                document.getElementById("orders-section")
                    ?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
            }
        );
    }
}

async function loadOrders() {
    const version = ++requestVersion;

    setPageState("loading");

    try {
        const user = await getCurrentUser();

        if (!active || version !== requestVersion) {
            return;
        }

        if (!user) {
            allOrders = [];
            showAuthRequired();
            return;
        }

        const response = await api.orders.mine();

        if (!active || version !== requestVersion) {
            return;
        }

        allOrders = extractOrders(response)
            .map(normalizeOrder)
            .filter(Boolean);

        renderOrders();
    } catch (error) {
        if (!active || version !== requestVersion) {
            return;
        }

        if (isAuthenticationError(error)) {
            clearAuthState();
            allOrders = [];
            showAuthRequired();
            return;
        }

        showOrdersError(error);
    }
}

async function cancelOrder(orderId) {
    if (cancellingOrders.has(orderId)) {
        return;
    }

    const order = allOrders.find(item => item.id === orderId);

    if (!order || !canCancelOrder(order)) {
        showError("Бұл тапсырысты қазір болдырмау мүмкін емес.");
        return;
    }

    const confirmed = window.confirm(
        `#${orderId} тапсырысынан бас тартқың келе ме?`
    );

    if (!confirmed) {
        return;
    }

    cancellingOrders.add(orderId);

    const button = document.querySelector(
        `[data-cancel-order-id="${orderId}"]`
    );

    if (button) {
        button.disabled = true;
        button.textContent = "Өңделуде...";
    }

    try {
        await api.orders.cancel(orderId);

        showSuccess(
            `#${orderId} тапсырысынан бас тарту орындалды.`
        );

        await loadOrders();
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
        } else {
            showError(getErrorMessage(error));
            await loadOrders();
        }
    } finally {
        cancellingOrders.delete(orderId);

        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = "Тапсырыстан бас тарту";
        }
    }
}

function applyFilters() {
    const elements = getElements();

    if (elements.search) {
        state.keyword = String(elements.search.value).trim();
    }

    if (elements.status) {
        const requestedStatus = normalizeStatus(
            elements.status.value
        );

        state.status = ORDER_STATUSES.has(requestedStatus)
            ? requestedStatus
            : "ALL";
    }

    if (elements.sort) {
        const requestedSort = elements.sort.value;

        state.sort = SORT_OPTIONS.has(requestedSort)
            ? requestedSort
            : "newest";
    }

    state.page = 0;

    updateStatusTabs();
    renderOrders();
}

function resetFilters() {
    state.keyword = "";
    state.status = "ALL";
    state.page = 0;

    syncControls();
    renderOrders();
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    searchDebounce = debounce(applyFilters, 300);

    elements.search?.addEventListener(
        "input",
        searchDebounce,
        { signal }
    );

    elements.searchForm?.addEventListener(
        "submit",
        event => {
            event.preventDefault();
            searchDebounce?.cancel();
            applyFilters();
        },
        { signal }
    );

    elements.status?.addEventListener(
        "change",
        applyFilters,
        { signal }
    );

    elements.sort?.addEventListener(
        "change",
        applyFilters,
        { signal }
    );

    elements.statusTabs?.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                "[data-status], [data-order-status]"
            );

            if (!button) {
                return;
            }

            const requestedStatus = normalizeStatus(
                button.dataset.status ??
                button.dataset.orderStatus ??
                "ALL"
            );

            state.status = ORDER_STATUSES.has(requestedStatus)
                ? requestedStatus
                : "ALL";

            state.page = 0;

            updateStatusTabs();
            renderOrders();
        },
        { signal }
    );

    elements.resetFilter?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            resetFilters();
        },
        { signal }
    );

    elements.refresh?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadOrders();
        },
        { signal }
    );

    elements.retry?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadOrders();
        },
        { signal }
    );
}

function setupOrderActions() {
    document.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                "[data-cancel-order-id]"
            );

            if (!button) {
                return;
            }

            const elements = getElements();

            if (!elements.list?.contains(button)) {
                return;
            }

            event.preventDefault();

            const orderId = parsePositiveId(
                button.dataset.cancelOrderId
            );

            if (orderId !== null) {
                cancelOrder(orderId);
            }
        },
        { signal: eventController.signal }
    );
}

function setupHistoryNavigation() {
    window.addEventListener(
        "popstate",
        () => {
            if (!active) {
                return;
            }

            state = readStateFromUrl();
            syncControls();

            if (allOrders.length > 0) {
                renderOrders();
            }
        },
        { signal: eventController.signal }
    );
}

export async function initOrders() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    state = readStateFromUrl();

    eventController = new AbortController();

    syncControls();
    setupFilters();
    setupOrderActions();
    setupHistoryNavigation();

    await loadOrders();
}

export function destroyOrders() {
    active = false;
    initialized = false;

    requestVersion += 1;

    searchDebounce?.cancel();
    eventController?.abort();

    searchDebounce = null;
    eventController = null;

    allOrders = [];
    cancellingOrders.clear();
}

export const orders = {
    init: initOrders,
    destroy: destroyOrders,
    reload: loadOrders,
    cancel: cancelOrder,
    getOrders() {
        return [...allOrders];
    },
    getState() {
        return { ...state };
    }
};

export default orders;
