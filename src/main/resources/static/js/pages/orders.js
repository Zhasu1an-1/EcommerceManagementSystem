
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
    parsePositiveId,
    showElement,
    hideElement
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
        '[data-orders-search]'
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
        "#orders-refresh",
        "#orders-refresh-button",
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
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let searchDebounce = null;
let cancellingOrders = new Set();

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
    if (
        !raw ||
        typeof raw !== "object"
    ) {
        return null;
    }

    const id = parsePositiveId(
        raw.id ?? raw.orderId
    );

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
            raw.paymentStatus ??
            raw.payment?.status
        ),
        totalAmount: Number.isFinite(total)
            ? total
            : 0,
        createdAt:
            raw.createdAt ??
            raw.orderDate ??
            raw.createdDate ??
            null,
        items: Array.isArray(raw.items)
            ? raw.items
            : []
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
    const params = new URLSearchParams(
        window.location.search
    );

    const status = normalizeStatus(
        params.get("status") ?? "ALL"
    );

    const sort = params.get("sort") ?? "newest";
    const page = Number(params.get("page"));

    return {
        keyword: String(
            params.get("keyword") ?? ""
        ).trim(),
        status: ORDER_STATUSES.has(status)
            ? status
            : "ALL",
        sort: [
            "newest",
            "oldest",
            "total-desc",
            "total-asc"
        ].includes(sort)
            ? sort
            : "newest",
        page: Number.isSafeInteger(page) && page >= 0
            ? page
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

function syncControls() {
    const elements = getElements();

    if (elements.search) {
        elements.search.value = state.keyword;
    }

    if (elements.status) {
        const matchingOption = Array.from(
            elements.status.options ?? []
        ).find(option => {
            return normalizeStatus(option.value) === state.status;
        });

        if (matchingOption) {
            elements.status.value = matchingOption.value;
        }
    }

    if (elements.sort) {
        elements.sort.value = state.sort;
    }

    updateStatusTabs();
}

function updateStatusTabs() {
    const container = getElements().statusTabs;

    if (!container) {
        return;
    }

    const buttons = container.querySelectorAll(
        "[data-order-status], [data-status], button"
    );

    for (const button of buttons) {
        const status = normalizeStatus(
            button.dataset.orderStatus ??
            button.dataset.status ??
            button.value ??
            "ALL"
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

function showFallbackMessage(
    title,
    description,
    linkText,
    linkUrl
) {
    const container = getElements().list;

    if (!container) {
        showError(description);
        return;
    }

    const wrapper = createElement(
        "div",
        "empty-state orders-dynamic-state"
    );

    const heading = createElement(
        "h3",
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

    container.replaceChildren(wrapper);

    showElement(getElements().content);
}

function showAuthRequired() {
    setPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/orders.html"
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
            "Sign in to view orders",
            "Тапсырыстарыңды көру үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showOrdersError(error) {
    const message = getErrorMessage(error);
    const errorElement = getElements().error;

    setPageState("error");

    if (errorElement) {
        const description = errorElement.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackMessage(
            "Orders unavailable",
            message,
            "Back to Shop",
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

    const labelElement = createElement(
        "span",
        "order-card-meta-label",
        label
    );

    const valueElement = createElement(
        "strong",
        "order-card-meta-value",
        value
    );

    wrapper.append(
        labelElement,
        valueElement
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

    const header = createElement(
        "div",
        "order-card-header"
    );

    const identity = createElement(
        "div",
        "order-card-identity"
    );

    const eyebrow = createElement(
        "span",
        "order-card-eyebrow",
        "ORDER"
    );

    const title = createElement(
        "h3",
        "order-card-title",
        `Order #${order.id}`
    );

    identity.append(eyebrow, title);

    const statusWrapper = createElement(
        "div",
        "order-card-status"
    );

    const badgeContainer = createElement("span");

    badgeContainer.innerHTML = renderStatusBadge(
        order.status,
        "order"
    );

    statusWrapper.appendChild(badgeContainer);

    header.append(identity, statusWrapper);

    const details = createElement(
        "div",
        "order-card-details"
    );

    details.appendChild(
        createOrderMeta(
            "Order Date",
            formatDateTime(order.createdAt)
        )
    );

    const itemCount = getOrderItemCount(order);

    if (itemCount !== null) {
        details.appendChild(
            createOrderMeta(
                "Items",
                formatInteger(itemCount)
            )
        );
    }

    details.appendChild(
        createOrderMeta(
            "Total",
            formatCurrency(order.totalAmount)
        )
    );

    const footer = createElement(
        "div",
        "order-card-footer"
    );

    const total = createElement(
        "div",
        "order-card-total"
    );

    total.appendChild(
        createElement(
            "span",
            "order-card-total-label",
            "Order Total"
        )
    );

    total.appendChild(
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
        "View Details"
    );

    detailsLink.href =
        `/pages/order-details.html?id=${encodeURIComponent(order.id)}`;

    actions.appendChild(detailsLink);

    if (canCancelOrder(order)) {
        const cancelButton = createElement(
            "button",
            "btn btn-outline order-cancel-button",
            "Cancel Order"
        );

        cancelButton.type = "button";
        cancelButton.dataset.cancelOrderId =
            String(order.id);

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
    const keyword = state.keyword
        .trim()
        .toLowerCase();

    let result = allOrders.filter(order => {
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
                return item.productName ??
                    item.name ??
                    "";
            })
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchable.includes(keyword);
    });

    result = [...result];

    result.sort((a, b) => {
        switch (state.sort) {
            case "oldest":
                return (
                    new Date(a.createdAt || 0).getTime() -
                    new Date(b.createdAt || 0).getTime()
                ) || a.id - b.id;

            case "total-desc":
                return b.totalAmount - a.totalAmount;

            case "total-asc":
                return a.totalAmount - b.totalAmount;

            default:
                return (
                    new Date(b.createdAt || 0).getTime() -
                    new Date(a.createdAt || 0).getTime()
                ) || b.id - a.id;
        }
    });

    return result;
}

function updateStatistics() {
    const elements = getElements();

    setText(
        elements.totalOrders,
        formatInteger(allOrders.length)
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
}

function showEmptyOrders(filteredCount) {
    const elements = getElements();

    const isFiltered =
        Boolean(state.keyword) ||
        state.status !== "ALL";

    const title = isFiltered
        ? "No matching orders"
        : "No orders yet";

    const description = isFiltered
        ? "Іздеу немесе статус фильтрін өзгертіп көр."
        : "Сен әлі тапсырыс жасамағансың. Каталогтан алғашқы тауарыңды таңда.";

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
    } else {
        showFallbackMessage(
            title,
            description,
            isFiltered ? null : "Start Shopping",
            isFiltered ? null : "/pages/catalog.html"
        );
    }

    elements.pagination?.replaceChildren();

    setText(
        elements.count,
        `${filteredCount} orders`
    );

    setText(
        elements.paginationInfo,
        "0 нәтиже"
    );
}

function renderOrders() {
    const elements = getElements();
    const filteredOrders = getFilteredOrders();

    updateStatistics();

    const totalPages = Math.ceil(
        filteredOrders.length / PAGE_SIZE
    );

    state.page = totalPages === 0
        ? 0
        : Math.min(
            state.page,
            totalPages - 1
        );

    syncUrl();

    if (filteredOrders.length === 0) {
        showEmptyOrders(0);
        return;
    }

    hideElement(elements.empty);
    setPageState("content");

    const start = state.page * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    const visibleOrders = filteredOrders.slice(
        start,
        end
    );

    const fragment = document.createDocumentFragment();

    for (const order of visibleOrders) {
        fragment.appendChild(
            createOrderCard(order)
        );
    }

    elements.list?.replaceChildren(fragment);

    setText(
        elements.count,
        `${formatInteger(filteredOrders.length)} orders`
    );

    const pageData = {
        number: state.page,
        size: PAGE_SIZE,
        totalElements: filteredOrders.length,
        totalPages
    };

    const from = start + 1;
    const to = Math.min(
        end,
        filteredOrders.length
    );

    setText(
        elements.paginationInfo,
        `${from}–${to} / ${filteredOrders.length}`
    );

    renderPagination(
        elements.pagination,
        pageData,
        page => {
            state.page = page;

            renderOrders();

            document.querySelector(
                ".orders-list-section, .orders-main, #orders-content"
            )?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    );
}

async function loadOrders() {
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

        const response = await api.orders.mine();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        allOrders = extractOrders(response)
            .map(normalizeOrder)
            .filter(Boolean);

        renderOrders();
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

        showOrdersError(error);
    }
}

async function cancelOrder(orderId) {
    if (cancellingOrders.has(orderId)) {
        return;
    }

    const order = allOrders.find(
        item => item.id === orderId
    );

    if (!order || !canCancelOrder(order)) {
        showError(
            "Бұл тапсырысты қазір жою мүмкін емес."
        );

        return;
    }

    const confirmed = window.confirm(
        `#${orderId} тапсырысын жоюды растайсың ба?`
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
        button.textContent = "Cancelling...";
    }

    try {
        await api.orders.cancel(orderId);

        showSuccess(
            `#${orderId} тапсырысы жойылды.`
        );

        await loadOrders();
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
        } else {
            showError(
                getErrorMessage(error)
            );

            await loadOrders();
        }
    } finally {
        cancellingOrders.delete(orderId);
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

        state.status = ORDER_STATUSES.has(status)
            ? status
            : "ALL";
    }

    if (elements.sort) {
        const sort = elements.sort.value;

        state.sort = [
            "newest",
            "oldest",
            "total-desc",
            "total-asc"
        ].includes(sort)
            ? sort
            : "newest";
    }

    state.page = 0;

    renderOrders();
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

    elements.searchForm?.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            searchDebounce.cancel();
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
                "[data-order-status], [data-status], button"
            );

            if (!button) {
                return;
            }

            const status = normalizeStatus(
                button.dataset.orderStatus ??
                button.dataset.status ??
                button.value ??
                "ALL"
            );

            state.status = ORDER_STATUSES.has(status)
                ? status
                : "ALL";

            state.page = 0;

            if (elements.status) {
                const matchingOption = Array.from(
                    elements.status.options ?? []
                ).find(option => {
                    return normalizeStatus(option.value) === state.status;
                });

                if (matchingOption) {
                    elements.status.value = matchingOption.value;
                }
            }

            updateStatusTabs();
            renderOrders();
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

            const list = getElements().list;

            if (!list?.contains(button)) {
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
        {
            signal: eventController.signal
        }
    );
}

function setupHistoryNavigation() {
    window.addEventListener(
        "popstate",
        () => {
            state = readStateFromUrl();

            syncControls();
            renderOrders();
        },
        {
            signal: eventController.signal
        }
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
