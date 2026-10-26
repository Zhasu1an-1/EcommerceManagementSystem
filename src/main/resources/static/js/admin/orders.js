
import api, {
    getErrorMessage,
    isAuthenticationError
} from "../core/api.js";

import {
    formatCurrency,
    formatDateTime,
    formatInteger,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const PAGE_SIZE = 10;

const ORDER_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED"
];

const STATUS_LABELS = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
};

const STATUS_VARIANTS = {
    PENDING: "warning",
    CONFIRMED: "primary",
    SHIPPED: "primary",
    DELIVERED: "success",
    CANCELLED: "danger",
    PAID: "success",
    SUCCESS: "success",
    COMPLETED: "success",
    FAILED: "danger",
    PROCESSING: "warning"
};

const SELECTORS = {
    loading: [
        "#admin-orders-loading",
        "#orders-loading",
        "[data-admin-orders-loading]"
    ],
    content: [
        "#admin-orders-content",
        "[data-admin-orders-content]"
    ],
    tableBody: [
        "#admin-orders-table-body",
        "#orders-table-body",
        "#orders-tbody",
        "[data-admin-orders-table-body]"
    ],
    grid: [
        "#admin-orders-grid",
        "[data-admin-orders-grid]"
    ],
    search: [
        "#admin-orders-search",
        "#orders-search",
        "[data-admin-orders-search]"
    ],
    status: [
        "#admin-orders-status",
        "#orders-status-filter",
        'select[name="status"]'
    ],
    sort: [
        "#admin-orders-sort",
        "#orders-sort",
        'select[name="sort"]'
    ],
    count: [
        "#admin-orders-count",
        "#orders-results-count",
        "[data-admin-orders-count]"
    ],
    totalOrders: [
        "#admin-total-orders",
        "#orders-total-count",
        "[data-admin-total-orders]"
    ],
    pendingOrders: [
        "#admin-pending-orders",
        "[data-admin-pending-orders]"
    ],
    deliveredOrders: [
        "#admin-delivered-orders",
        "[data-admin-delivered-orders]"
    ],
    cancelledOrders: [
        "#admin-cancelled-orders",
        "[data-admin-cancelled-orders]"
    ],
    revenue: [
        "#admin-orders-revenue",
        "#orders-revenue",
        "[data-admin-orders-revenue]"
    ],
    pagination: [
        "#admin-orders-pagination",
        "#orders-pagination",
        "[data-admin-orders-pagination]"
    ],
    empty: [
        "#admin-orders-empty",
        "#orders-empty",
        "[data-admin-orders-empty]"
    ],
    error: [
        "#admin-orders-error",
        "#orders-error",
        "[data-admin-orders-error]"
    ],
    refresh: [
        "#admin-orders-refresh",
        "#orders-refresh",
        "[data-admin-orders-refresh]"
    ],
    modal: [
        "#admin-order-modal",
        "#order-details-modal",
        "[data-admin-order-modal]"
    ],
    modalContent: [
        "#admin-order-modal-content",
        "#order-modal-details",
        "[data-admin-order-details]"
    ],
    modalClose: [
        "#admin-order-modal-close",
        "#order-details-close",
        "[data-admin-order-close]"
    ]
};

let initialized = false;
let active = false;
let loading = false;
let updating = false;
let requestVersion = 0;

let eventController = null;
let searchTimer = null;

let orders = [];
let selectedOrder = null;
let totalElements = 0;
let serverPagination = false;

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

function parseId(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}

function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

function normalizeOrder(order) {
    if (!order || typeof order !== "object") {
        return null;
    }

    const id = parseId(order.id ?? order.orderId);

    if (id === null) {
        return null;
    }

    const amount = Number(
        order.totalAmount ??
        order.totalPrice ??
        order.finalAmount ??
        order.total
    );

    return {
        ...order,
        id,
        status: normalizeStatus(
            order.status ?? order.orderStatus
        ),
        paymentStatus: normalizeStatus(
            order.paymentStatus ??
            order.payment?.status
        ),
        customerName: String(
            order.customerName ??
            order.userName ??
            order.customer?.name ??
            order.user?.name ??
            ""
        ),
        customerEmail: String(
            order.customerEmail ??
            order.userEmail ??
            order.customer?.email ??
            order.user?.email ??
            ""
        ),
        shippingAddress: String(
            order.shippingAddress ?? ""
        ),
        totalAmount: Number.isFinite(amount)
            ? amount
            : null,
        createdAt:
            order.createdAt ??
            order.orderDate ??
            order.createdDate ??
            null,
        items: Array.isArray(order.items)
            ? order.items
            : Array.isArray(order.orderItems)
                ? order.orderItems
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

function resolveEndpoint(template, id = null) {
    if (!template) {
        return null;
    }

    const path = String(template)
        .replaceAll("{id}", String(id ?? ""))
        .replaceAll(":id", String(id ?? ""));

    try {
        const url = new URL(
            path,
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

function getEndpoint(kind, id = null) {
    const elements = getElements();

    const attributes = {
        list: "ordersEndpoint",
        details: "orderDetailsEndpoint",
        update: "orderUpdateEndpoint"
    };

    const key = attributes[kind];

    const template =
        document.body.dataset[key] ??
        elements.content?.dataset[key] ??
        elements.tableBody?.dataset[key];

    return resolveEndpoint(template, id);
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

function createBadge(status) {
    const value = normalizeStatus(status);

    const variant =
        STATUS_VARIANTS[value] ?? "neutral";

    return createElement(
        "span",
        `badge badge-${variant}`,
        STATUS_LABELS[value] ?? value ?? "Unknown"
    );
}

function createActionButton(label, action, id) {
    const button = createElement(
        "button",
        "btn btn-outline btn-sm",
        label
    );

    button.type = "button";
    button.dataset.orderAction = action;
    button.dataset.orderId = String(id);

    return button;
}

function createStatusSelect(order) {
    const select = createElement(
        "select",
        "form-select admin-order-status-select"
    );

    select.dataset.orderAction = "status";
    select.dataset.orderId = String(order.id);

    const editable = getEndpoint(
        "update",
        order.id
    ) !== null;

    select.disabled =
        !editable ||
        order.status === "CANCELLED" ||
        order.status === "DELIVERED";

    for (const status of ORDER_STATUSES) {
        const option = document.createElement("option");

        option.value = status;
        option.textContent = STATUS_LABELS[status];

        if (status === order.status) {
            option.selected = true;
        }

        select.appendChild(option);
    }

    if (
        order.status &&
        !ORDER_STATUSES.includes(order.status)
    ) {
        const option = document.createElement("option");

        option.value = order.status;
        option.textContent = order.status;
        option.selected = true;

        select.appendChild(option);
    }

    if (!editable) {
        select.title =
            "Тапсырыс статусын өзгерту API қосылмаған.";
    }

    select.setAttribute(
        "aria-label",
        `Order #${order.id} статусын өзгерту`
    );

    return select;
}

function createOrderRow(order) {
    const row = document.createElement("tr");

    row.dataset.orderId = String(order.id);

    const numberCell = document.createElement("td");

    const number = createElement(
        "strong",
        "admin-order-number",
        `#${order.id}`
    );

    numberCell.appendChild(number);

    const customerCell = document.createElement("td");

    const customer = createElement(
        "div",
        "admin-order-customer"
    );

    customer.appendChild(
        createElement(
            "strong",
            "admin-order-customer-name",
            order.customerName || "—"
        )
    );

    if (order.customerEmail) {
        customer.appendChild(
            createElement(
                "span",
                "admin-order-customer-email",
                order.customerEmail
            )
        );
    }

    customerCell.appendChild(customer);

    const dateCell = createElement(
        "td",
        "admin-order-date",
        order.createdAt
            ? formatDateTime(order.createdAt)
            : "—"
    );

    const totalCell = createElement(
        "td",
        "admin-order-total",
        order.totalAmount !== null
            ? formatCurrency(order.totalAmount)
            : "—"
    );

    const statusCell = document.createElement("td");

    statusCell.appendChild(
        createBadge(order.status)
    );

    const paymentCell = document.createElement("td");

    paymentCell.appendChild(
        createBadge(
            order.paymentStatus || "UNKNOWN"
        )
    );

    const actionsCell = document.createElement("td");

    const actions = createElement(
        "div",
        "admin-table-actions"
    );

    actions.appendChild(
        createActionButton(
            "Details",
            "details",
            order.id
        )
    );

    actions.appendChild(
        createStatusSelect(order)
    );

    actionsCell.appendChild(actions);

    row.append(
        numberCell,
        customerCell,
        dateCell,
        totalCell,
        statusCell,
        paymentCell,
        actionsCell
    );

    return row;
}

function createOrderCard(order) {
    const card = createElement(
        "article",
        "admin-order-card"
    );

    const header = createElement(
        "div",
        "admin-order-card-header"
    );

    header.append(
        createElement(
            "strong",
            "admin-order-number",
            `Order #${order.id}`
        ),
        createBadge(order.status)
    );

    const body = createElement(
        "div",
        "admin-order-card-body"
    );

    const details = [
        ["Customer", order.customerName || "—"],
        [
            "Date",
            order.createdAt
                ? formatDateTime(order.createdAt)
                : "—"
        ],
        [
            "Total",
            order.totalAmount !== null
                ? formatCurrency(order.totalAmount)
                : "—"
        ]
    ];

    for (const [label, value] of details) {
        const row = createElement(
            "div",
            "admin-order-card-detail"
        );

        row.append(
            createElement("span", "", label),
            createElement("strong", "", value)
        );

        body.appendChild(row);
    }

    const actions = createElement(
        "div",
        "admin-order-card-actions"
    );

    actions.append(
        createActionButton(
            "View Details",
            "details",
            order.id
        ),
        createStatusSelect(order)
    );

    card.append(header, body, actions);

    return card;
}

function getFilteredOrders() {
    const keyword = state.keyword.toLowerCase();

    const filtered = orders.filter(order => {
        if (
            state.status !== "ALL" &&
            order.status !== state.status
        ) {
            return false;
        }

        if (!keyword) {
            return true;
        }

        return [
            order.id,
            order.customerName,
            order.customerEmail,
            order.status,
            order.shippingAddress
        ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
    });

    return filtered.sort((a, b) => {
        switch (state.sort) {
            case "oldest":
                return (
                    (Date.parse(a.createdAt) || 0) -
                    (Date.parse(b.createdAt) || 0)
                );

            case "total-desc":
                return (
                    (b.totalAmount ?? 0) -
                    (a.totalAmount ?? 0)
                );

            case "total-asc":
                return (
                    (a.totalAmount ?? 0) -
                    (b.totalAmount ?? 0)
                );

            default:
                return (
                    (Date.parse(b.createdAt) || 0) -
                    (Date.parse(a.createdAt) || 0)
                ) || b.id - a.id;
        }
    });
}

function createEmptyRow(message) {
    const elements = getElements();

    if (elements.tableBody) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "admin-table-empty";
        cell.textContent = message;

        row.appendChild(cell);

        elements.tableBody.replaceChildren(row);
    }

    if (elements.grid) {
        elements.grid.replaceChildren(
            createElement(
                "p",
                "empty-state",
                message
            )
        );
    }
}

function updateStatistics() {
    const elements = getElements();

    if (serverPagination) {
        setText(
            elements.totalOrders,
            formatInteger(totalElements)
        );

        setText(elements.pendingOrders, "—");
        setText(elements.deliveredOrders, "—");
        setText(elements.cancelledOrders, "—");
        setText(elements.revenue, "—");

        return;
    }

    setText(
        elements.totalOrders,
        formatInteger(orders.length)
    );

    for (const [status, element] of [
        ["PENDING", elements.pendingOrders],
        ["DELIVERED", elements.deliveredOrders],
        ["CANCELLED", elements.cancelledOrders]
    ]) {
        setText(
            element,
            formatInteger(
                orders.filter(
                    order => order.status === status
                ).length
            )
        );
    }

    setText(elements.revenue, "—");
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

    previous.addEventListener("click", () => {
        changePage(state.page - 1);
    });

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

    next.addEventListener("click", () => {
        changePage(state.page + 1);
    });

    container.append(
        previous,
        indicator,
        next
    );
}

function renderOrders() {
    const elements = getElements();
    const filtered = getFilteredOrders();

    const total = serverPagination
        ? totalElements
        : filtered.length;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    state.page = totalPages === 0
        ? 0
        : Math.min(
            state.page,
            totalPages - 1
        );

    const visible = serverPagination
        ? filtered
        : filtered.slice(
            state.page * PAGE_SIZE,
            (state.page + 1) * PAGE_SIZE
        );

    setText(
        elements.count,
        `${formatInteger(total)} orders`
    );

    updateStatistics();
    renderPagination(totalPages);

    if (visible.length === 0) {
        if (elements.empty) {
            showElement(elements.empty);
        }

        createEmptyRow(
            "Тапсырыстар табылмады."
        );

        return;
    }

    hideElement(elements.empty);
    hideElement(elements.error);

    const container =
        elements.tableBody ?? elements.grid;

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const order of visible) {
        fragment.appendChild(
            container instanceof HTMLTableSectionElement
                ? createOrderRow(order)
                : createOrderCard(order)
        );
    }

    container.replaceChildren(fragment);

    showElement(elements.content);
}

function showOrdersError(message) {
    const elements = getElements();

    const target = elements.error?.querySelector(
        "[data-error-message], .error-message, p"
    ) ?? elements.error;

    if (target) {
        setText(target, message);
        showElement(elements.error);
    } else {
        createEmptyRow(message);
    }
}

function readEndpointParameters(endpoint) {
    if (!endpoint) {
        return null;
    }

    endpoint.searchParams.set(
        "page",
        String(state.page)
    );

    endpoint.searchParams.set(
        "size",
        String(PAGE_SIZE)
    );

    if (state.keyword) {
        endpoint.searchParams.set(
            "keyword",
            state.keyword
        );
    }

    if (state.status !== "ALL") {
        endpoint.searchParams.set(
            "status",
            state.status
        );
    }

    return `${endpoint.pathname}${endpoint.search}`;
}

async function loadOrders() {
    if (!active) {
        return;
    }

    const endpoint = getEndpoint("list");

    if (!endpoint) {
        const message =
            "Admin тапсырыстарын көру үшін Spring Boot-та admin orders API қосып, data-orders-endpoint атрибутын көрсету қажет.";

        showOrdersError(message);
        createEmptyRow(message);

        setText(getElements().totalOrders, "—");
        setText(getElements().revenue, "—");

        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const response = await api.get(
            readEndpointParameters(endpoint)
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        orders = extractOrders(response)
            .map(normalizeOrder)
            .filter(Boolean);

        const source = response?.data?.content
            ? response.data
            : response;

        const reportedTotal = Number(
            source?.totalElements
        );

        serverPagination =
            !Array.isArray(response) &&
            Number.isFinite(reportedTotal) &&
            reportedTotal >= 0;

        totalElements = serverPagination
            ? reportedTotal
            : orders.length;

        renderOrders();
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        if (isAuthenticationError(error)) {
            showOrdersError(
                "Сессия аяқталды. Аккаунтыңа қайта кір."
            );
        } else {
            showOrdersError(
                getErrorMessage(error)
            );
        }

        createEmptyRow(
            "Тапсырыстарды жүктеу мүмкін болмады."
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
        loadOrders();
    } else {
        renderOrders();
    }
}

function renderOrderDetails(order) {
    const container = getElements().modalContent;

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    const fields = [
        ["Order ID", `#${order.id}`],
        ["Customer", order.customerName || "—"],
        ["Email", order.customerEmail || "—"],
        ["Status", order.status || "—"],
        [
            "Payment",
            order.paymentStatus || "—"
        ],
        [
            "Date",
            order.createdAt
                ? formatDateTime(order.createdAt)
                : "—"
        ],
        [
            "Total",
            order.totalAmount !== null
                ? formatCurrency(order.totalAmount)
                : "—"
        ],
        [
            "Shipping Address",
            order.shippingAddress || "—"
        ]
    ];

    for (const [label, value] of fields) {
        const row = createElement(
            "div",
            "admin-order-detail-row"
        );

        row.append(
            createElement(
                "span",
                "admin-order-detail-label",
                label
            ),
            createElement(
                "strong",
                "admin-order-detail-value",
                value
            )
        );

        fragment.appendChild(row);
    }

    if (order.items.length > 0) {
        const section = createElement(
            "div",
            "admin-order-detail-items"
        );

        section.appendChild(
            createElement(
                "h3",
                "",
                "Order Items"
            )
        );

        for (const item of order.items) {
            const quantity = Number(item.quantity) || 1;

            const price = Number(
                item.subtotal ??
                item.totalPrice ??
                (
                    Number(item.unitPrice ?? item.price) *
                    quantity
                )
            );

            section.appendChild(
                createElement(
                    "div",
                    "admin-order-detail-item",
                    `${item.productName ?? item.name ?? "Product"} × ${quantity} — ${
                        Number.isFinite(price)
                            ? formatCurrency(price)
                            : "—"
                    }`
                )
            );
        }

        fragment.appendChild(section);
    }

    container.replaceChildren(fragment);
}

function openOrderModal() {
    const modal = getElements().modal;

    if (!modal) {
        return;
    }

    showElement(modal);
    modal.classList.add("is-open");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );
}

function closeOrderModal() {
    const modal = getElements().modal;

    if (!modal) {
        return;
    }

    modal.classList.remove("is-open");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    hideElement(modal);
    selectedOrder = null;
}

async function viewOrderDetails(orderId) {
    const order = orders.find(
        item => item.id === orderId
    );

    if (!order) {
        return;
    }

    selectedOrder = order;

    const endpoint = getEndpoint(
        "details",
        orderId
    );

    if (endpoint) {
        try {
            const response = await api.get(
                `${endpoint.pathname}${endpoint.search}`
            );

            const normalized = normalizeOrder(
                response?.data?.order ??
                response?.data ??
                response
            );

            if (normalized) {
                selectedOrder = normalized;
            }
        } catch (error) {
            showError(
                getErrorMessage(error)
            );
        }
    }

    if (!getElements().modal) {
        showInfo(
            "Тапсырыс мәліметтерін көрсету үшін admin order details modal қажет."
        );
        return;
    }

    renderOrderDetails(selectedOrder);
    openOrderModal();
}

async function updateOrderStatus(orderId, newStatus) {
    if (updating) {
        return;
    }

    const order = orders.find(
        item => item.id === orderId
    );

    if (
        !order ||
        !ORDER_STATUSES.includes(newStatus)
    ) {
        return;
    }

    if (order.status === newStatus) {
        return;
    }

    const endpoint = getEndpoint(
        "update",
        orderId
    );

    if (!endpoint) {
        showInfo(
            "Тапсырыс статусын өзгерту үшін admin update API қажет."
        );
        renderOrders();
        return;
    }

    const confirmed = window.confirm(
        `Order #${orderId}: ${order.status} → ${newStatus}. Өзгертуді растайсың ба?`
    );

    if (!confirmed) {
        renderOrders();
        return;
    }

    updating = true;

    try {
        await api.put(
            `${endpoint.pathname}${endpoint.search}`,
            {
                status: newStatus
            }
        );

        showSuccess(
            `Order #${orderId} статусы жаңартылды.`
        );

        await loadOrders();
    } catch (error) {
        showError(
            getErrorMessage(error)
        );

        renderOrders();
    } finally {
        updating = false;
    }
}

function setupOrderActions() {
    const signal = eventController.signal;

    document.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                '[data-order-action="details"]'
            );

            if (!button) {
                return;
            }

            event.preventDefault();

            const id = parseId(
                button.dataset.orderId
            );

            if (id !== null) {
                viewOrderDetails(id);
            }
        },
        { signal }
    );

    document.addEventListener(
        "change",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const select = event.target.closest(
                '[data-order-action="status"]'
            );

            if (!select) {
                return;
            }

            const id = parseId(
                select.dataset.orderId
            );

            if (id !== null) {
                updateOrderStatus(
                    id,
                    normalizeStatus(select.value)
                );
            }
        },
        { signal }
    );

    getElements().modalClose?.addEventListener(
        "click",
        closeOrderModal,
        { signal }
    );

    getElements().modal?.addEventListener(
        "click",
        event => {
            if (event.target === event.currentTarget) {
                closeOrderModal();
            }
        },
        { signal }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                closeOrderModal();
            }
        },
        { signal }
    );
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    searchTimer = null;

    elements.search?.addEventListener(
        "input",
        event => {
            window.clearTimeout(searchTimer);

            searchTimer = window.setTimeout(() => {
                state.keyword = event.target.value.trim();
                state.page = 0;

                if (serverPagination) {
                    loadOrders();
                } else {
                    renderOrders();
                }
            }, 350);
        },
        { signal }
    );

    elements.status?.addEventListener(
        "change",
        event => {
            const status = normalizeStatus(
                event.target.value
            );

            state.status = ORDER_STATUSES.includes(status)
                ? status
                : "ALL";

            state.page = 0;

            if (serverPagination) {
                loadOrders();
            } else {
                renderOrders();
            }
        },
        { signal }
    );

    elements.sort?.addEventListener(
        "change",
        event => {
            state.sort = event.target.value;
            state.page = 0;

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

export async function initAdminOrders() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupFilters();
    setupOrderActions();

    await loadOrders();
}

export function destroyAdminOrders() {
    initialized = false;
    active = false;
    loading = false;
    updating = false;

    requestVersion += 1;

    window.clearTimeout(searchTimer);

    eventController?.abort();
    eventController = null;

    orders = [];
    selectedOrder = null;
    totalElements = 0;
    serverPagination = false;

    state = {
        keyword: "",
        status: "ALL",
        sort: "newest",
        page: 0
    };
}

export const adminOrders = {
    init: initAdminOrders,
    destroy: destroyAdminOrders,
    reload: loadOrders,
    viewDetails: viewOrderDetails,
    updateStatus: updateOrderStatus,
    getOrders() {
        return [...orders];
    },
    getSelectedOrder() {
        return selectedOrder;
    },
    getState() {
        return { ...state };
    }
};

export default adminOrders;
