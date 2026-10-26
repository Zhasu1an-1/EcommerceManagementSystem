
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const API = {
    orders: "/api/orders",
    dashboard: "/api/admin/dashboard"
};

const ID = {
    refresh: "admin-orders-refresh-button",
    retry: "admin-orders-retry-button",
    total: "admin-orders-total",
    pending: "admin-orders-pending",
    shipped: "admin-orders-shipped",
    delivered: "admin-orders-delivered",
    searchForm: "admin-orders-search-form",
    search: "admin-orders-search",
    filterToggle: "admin-orders-filter-toggle",
    filters: "admin-orders-filters",
    filterForm: "admin-orders-filter-form",
    statusFilter: "admin-orders-status-filter",
    paymentFilter: "admin-orders-payment-filter",
    sort: "admin-orders-sort",
    pageSize: "admin-orders-page-size",
    tabs: "admin-orders-status-tabs",
    clearSearch: "admin-orders-clear-search",
    loading: "admin-orders-loading",
    error: "admin-orders-error",
    errorMessage: "admin-orders-error-message",
    empty: "admin-orders-empty",
    filterEmpty: "admin-orders-filter-empty",
    resultsCount: "admin-orders-results-count",
    tableContainer: "admin-orders-table-container",
    tableBody: "admin-orders-table-body",
    tableFooter: "admin-orders-table-footer",
    paginationInfo: "admin-orders-pagination-info",
    pagination: "admin-orders-pagination",
    detailsModal: "admin-order-details-modal",
    detailsClose: "admin-order-details-close",
    detailsDone: "admin-order-details-done",
    detailsLoading: "admin-order-details-loading",
    detailsError: "admin-order-details-error",
    detailsContent: "admin-order-details-modal-content",
    detailsEdit: "admin-order-details-edit-status",
    statusModal: "admin-order-status-modal",
    statusClose: "admin-order-status-close",
    statusCancel: "admin-order-status-cancel",
    statusForm: "admin-order-status-form",
    statusSelect: "admin-order-new-status",
    statusSave: "admin-order-status-save",
    statusSaveText: "admin-order-status-save-text",
    statusError: "admin-order-status-error"
};

const ORDER_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED"
];

const STATUS_COLORS = {
    PENDING: "warning",
    CONFIRMED: "primary",
    SHIPPED: "primary",
    DELIVERED: "success",
    CANCELLED: "danger",
    SUCCESS: "success",
    PAID: "success",
    FAILED: "danger",
    UNKNOWN: "neutral"
};

const PAGE_SIZES = new Set([10, 20, 50]);
const FETCH_SIZE = 50;
const MAX_FETCH_PAGES = 200;

const $ = id => document.getElementById(id);

const integers = new Intl.NumberFormat("kk-KZ");

const currency = new Intl.NumberFormat("kk-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2
});

const dates = new Intl.DateTimeFormat("kk-KZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

let initialized = false;
let active = false;
let loading = false;
let updating = false;
let requestVersion = 0;
let controller = null;
let searchTimer = null;

let orders = [];
let dashboardStats = null;
let selectedOrder = null;
let statusOrder = null;
let returnFocus = null;
let oldOverflow = "";

let state = initialState();

function initialState() {
    return {
        keyword: "",
        status: "ALL",
        paymentStatus: "ALL",
        sort: "newest",
        page: 0,
        size: 10
    };
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function show(id, visible) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.hidden = !visible;
    element.classList.toggle("hidden", !visible);
}

function el(tag, className = "", text = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== null && text !== undefined) {
        element.textContent = String(text);
    }

    return element;
}

function parseId(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}

function numberValue(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function money(value) {
    const number = numberValue(value);

    return number === null ? "—" : currency.format(number);
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

function statusOf(value) {
    return String(value ?? "UNKNOWN").trim().toUpperCase();
}

function badge(value) {
    const status = statusOf(value);

    return el(
        "span",
        `badge badge-${STATUS_COLORS[status] ?? "neutral"}`,
        status
    );
}

function setBadge(id, value) {
    const target = $(id);

    if (!target) {
        return;
    }

    const status = statusOf(value);

    target.className =
        `badge badge-${STATUS_COLORS[status] ?? "neutral"}`;

    target.textContent = status;
}

function normalizeOrder(raw) {
    const id = parseId(raw?.id ?? raw?.orderId);

    if (id === null) {
        return null;
    }

    return {
        ...raw,
        id,
        status: statusOf(raw.status ?? raw.orderStatus),
        paymentStatus: statusOf(
            raw.paymentStatus ?? raw.payment?.status
        ),
        paymentMethod: String(
            raw.paymentMethod ?? raw.payment?.method ?? ""
        ),
        customerName: String(
            raw.customerName ??
            raw.userName ??
            raw.customer?.name ??
            raw.user?.name ??
            ""
        ),
        customerEmail: String(
            raw.customerEmail ??
            raw.userEmail ??
            raw.customer?.email ??
            raw.user?.email ??
            ""
        ),
        createdAt:
            raw.createdAt ??
            raw.orderDate ??
            raw.createdDate ??
            null,
        totalAmount: numberValue(
            raw.totalAmount ??
            raw.totalPrice ??
            raw.finalAmount ??
            raw.total
        ),
        shippingAddress:
            raw.shippingAddress ??
            raw.deliveryAddress ??
            "",
        promotionCode:
            raw.promotionCode ??
            raw.promotion?.code ??
            "",
        items: Array.isArray(raw.items)
            ? raw.items
            : Array.isArray(raw.orderItems)
                ? raw.orderItems
                : []
    };
}

function extractPage(response) {
    const source =
        response?.data?.content !== undefined
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
            "Orders API күтілген тізімді қайтармады."
        );
    }

    const pages =
        source.totalPages === undefined
            ? null
            : Number(source.totalPages);

    return {
        content: source.content,
        totalPages:
            Number.isSafeInteger(pages) && pages >= 0
                ? pages
                : null
    };
}

async function fetchAllOrders(version) {
    const result = [];

    for (let page = 0; page < MAX_FETCH_PAGES; page++) {
        const query = new URLSearchParams({
            page: String(page),
            size: String(FETCH_SIZE),
            sort: "createdAt,desc"
        });

        const response = await api.get(
            `${API.orders}?${query.toString()}`
        );

        if (!active || version !== requestVersion) {
            return null;
        }

        const data = extractPage(response);

        result.push(...data.content);

        if (
            data.totalPages === null ||
            page + 1 >= data.totalPages
        ) {
            return result;
        }
    }

    throw new Error(
        "Тапсырыстар тізімі жүктеу шегінен асып кетті."
    );
}

async function fetchStats() {
    const response = await api.get(API.dashboard);

    const source = response?.data ?? response;

    if (!source || typeof source !== "object") {
        throw new Error(
            "Dashboard статистикасын алу мүмкін болмады."
        );
    }

    return source;
}

function getFiltered() {
    const keyword = state.keyword.toLocaleLowerCase();

    const filtered = orders.filter(order => {
        if (
            state.status !== "ALL" &&
            order.status !== state.status
        ) {
            return false;
        }

        if (
            state.paymentStatus !== "ALL" &&
            order.paymentStatus !== state.paymentStatus &&
            !(
                state.paymentStatus === "PAID" &&
                order.paymentStatus === "SUCCESS"
            )
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
            order.paymentStatus
        ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(keyword);
    });

    filtered.sort((a, b) => {
        switch (state.sort) {
            case "oldest":
                return (
                    (Date.parse(a.createdAt) || 0) -
                    (Date.parse(b.createdAt) || 0)
                ) || a.id - b.id;

            case "amount-desc":
                return (b.totalAmount ?? 0) -
                    (a.totalAmount ?? 0) || b.id - a.id;

            case "amount-asc":
                return (a.totalAmount ?? 0) -
                    (b.totalAmount ?? 0) || a.id - b.id;

            default:
                return (
                    (Date.parse(b.createdAt) || 0) -
                    (Date.parse(a.createdAt) || 0)
                ) || b.id - a.id;
        }
    });

    return filtered;
}

function renderStatistics() {
    const total = dashboardStats?.totalOrders ?? orders.length;

    const pending = dashboardStats?.pendingOrders ??
        orders.filter(o => o.status === "PENDING").length;

    const shipped = dashboardStats?.shippedOrders ??
        orders.filter(o => o.status === "SHIPPED").length;

    const delivered = dashboardStats?.deliveredOrders ??
        orders.filter(o => o.status === "DELIVERED").length;

    setText(ID.total, integers.format(total));
    setText(ID.pending, integers.format(pending));
    setText(ID.shipped, integers.format(shipped));
    setText(ID.delivered, integers.format(delivered));
}

function actionButton(label, action, orderId) {
    const button = el(
        "button",
        "btn btn-outline btn-sm",
        label
    );

    button.type = "button";
    button.dataset.orderAction = action;
    button.dataset.orderId = String(orderId);

    return button;
}

function makeRow(order) {
    const row = document.createElement("tr");

    row.dataset.orderId = String(order.id);

    const idCell = el("td", "", `#${order.id}`);

    const customerCell = document.createElement("td");
    const customer = el(
        "div",
        "admin-order-customer"
    );

    customer.appendChild(
        el(
            "strong",
            "admin-order-customer-name",
            order.customerName || "Customer"
        )
    );

    if (order.customerEmail) {
        customer.appendChild(
            el(
                "span",
                "admin-order-customer-email",
                order.customerEmail
            )
        );
    }

    customerCell.appendChild(customer);

    const dateCell = el(
        "td",
        "admin-order-date",
        dateText(order.createdAt)
    );

    const amountCell = el(
        "td",
        "admin-order-total",
        money(order.totalAmount)
    );

    const paymentCell = document.createElement("td");
    paymentCell.appendChild(badge(order.paymentStatus));

    const statusCell = document.createElement("td");
    statusCell.appendChild(badge(order.status));

    const actionsCell = document.createElement("td");
    const actions = el("div", "admin-table-actions");

    actions.appendChild(
        actionButton("Details", "details", order.id)
    );

    const update = actionButton(
        "Update Status",
        "status",
        order.id
    );

    update.disabled = [
        "CANCELLED",
        "DELIVERED"
    ].includes(order.status);

    actions.appendChild(update);
    actionsCell.appendChild(actions);

    row.append(
        idCell,
        customerCell,
        dateCell,
        amountCell,
        paymentCell,
        statusCell,
        actionsCell
    );

    return row;
}

function pageButton(label, page, disabled = false, current = false) {
    const button = el(
        "button",
        "pagination-button",
        label
    );

    button.type = "button";
    button.dataset.page = String(page);
    button.disabled = disabled || current;
    button.classList.toggle("is-active", current);

    if (current) {
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
        [ID.paymentFilter]: state.paymentStatus,
        [ID.sort]: state.sort,
        [ID.pageSize]: String(state.size)
    };

    for (const [id, value] of Object.entries(values)) {
        const element = $(id);

        if (element) {
            element.value = value;
        }
    }

    $(ID.tabs)?.querySelectorAll("[data-status]")
        .forEach(button => {
            const current = button.dataset.status === state.status;

            button.classList.toggle("is-active", current);
            button.setAttribute("aria-pressed", String(current));
        });
}

function render() {
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / state.size);

    state.page = Math.min(
        state.page,
        Math.max(0, totalPages - 1)
    );

    const start = state.page * state.size;
    const displayed = filtered.slice(start, start + state.size);

    renderStatistics();

    setText(
        ID.resultsCount,
        `${integers.format(filtered.length)} тапсырыс табылды`
    );

    show(ID.empty, orders.length === 0);
    show(
        ID.filterEmpty,
        orders.length > 0 && filtered.length === 0
    );
    show(ID.tableContainer, displayed.length > 0);
    show(ID.tableFooter, displayed.length > 0);
    show(ID.error, false);

    const fragment = document.createDocumentFragment();

    for (const order of displayed) {
        fragment.appendChild(makeRow(order));
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

    show(ID.loading, value);

    for (const id of [ID.refresh, ID.retry]) {
        const button = $(id);

        if (button instanceof HTMLButtonElement) {
            button.disabled = value;
        }
    }

    if (value) {
        show(ID.error, false);
    }
}

async function loadOrders() {
    if (!active) {
        return;
    }

    const currentVersion = ++requestVersion;

    setLoading(true);

    try {
        const [ordersResult, statsResult] = await Promise.allSettled([
            fetchAllOrders(currentVersion),
            fetchStats()
        ]);

        if (!active || currentVersion !== requestVersion) {
            return;
        }

        if (ordersResult.status === "rejected") {
            throw ordersResult.reason;
        }

        if (ordersResult.value === null) {
            return;
        }

        const unique = new Map();

        for (const raw of ordersResult.value) {
            const order = normalizeOrder(raw);

            if (order) {
                unique.set(order.id, order);
            }
        }

        orders = [...unique.values()];

        dashboardStats =
            statsResult.status === "fulfilled"
                ? statsResult.value
                : null;

        if (statsResult.status === "rejected") {
            console.warn(
                "Admin order statistics unavailable:",
                statsResult.reason
            );
        }

        setLoading(false);
        render();
    } catch (error) {
        if (!active || currentVersion !== requestVersion) {
            return;
        }

        orders = [];
        dashboardStats = null;

        setLoading(false);

        setText(ID.errorMessage, getErrorMessage(error));
        setText(ID.resultsCount, "Тапсырыстар жүктелмеді");

        for (const id of [
            ID.total,
            ID.pending,
            ID.shipped,
            ID.delivered
        ]) {
            setText(id, "—");
        }

        $(ID.tableBody)?.replaceChildren();
        $(ID.pagination)?.replaceChildren();

        show(ID.tableContainer, false);
        show(ID.tableFooter, false);
        show(ID.empty, false);
        show(ID.filterEmpty, false);
        show(ID.error, true);
    }
}

function setModal(id, open) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.hidden = !open;
    modal.classList.toggle("hidden", !open);
    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", String(!open));

    if (open) {
        oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    } else {
        document.body.style.overflow = oldOverflow;
    }
}

function closeDetails() {
    setModal(ID.detailsModal, false);
    selectedOrder = null;

    if (returnFocus?.isConnected) {
        returnFocus.focus();
    }
}

function detailText(id, value) {
    setText(
        id,
        value === null ||
        value === undefined ||
        value === ""
            ? "—"
            : value
    );
}

function renderDetails(order) {
    detailText("admin-order-detail-number", `#${order.id}`);
    detailText("admin-order-detail-customer", order.customerName);
    detailText("admin-order-detail-email", order.customerEmail);
    detailText("admin-order-detail-date", dateText(order.createdAt));
    detailText("admin-order-detail-status-text", order.status);
    detailText("admin-order-detail-address", order.shippingAddress);
    detailText("admin-order-detail-payment-method", order.paymentMethod);
    detailText("admin-order-detail-promotion", order.promotionCode);
    detailText("admin-order-detail-total", money(order.totalAmount));

    setBadge("admin-order-detail-status", order.status);
    setBadge(
        "admin-order-detail-payment-status",
        order.paymentStatus
    );

    const itemsContainer = $("admin-order-detail-items");
    const fragment = document.createDocumentFragment();

    for (const item of order.items) {
        const quantity = Number(item.quantity ?? 1);

        const total = numberValue(
            item.subtotal ??
            item.totalPrice ??
            (
                Number(item.unitPrice ?? item.price ?? 0) *
                quantity
            )
        );

        fragment.appendChild(
            el(
                "div",
                "admin-order-detail-item",
                `${item.productName ?? item.name ?? "Product"} × ${quantity} — ${money(total)}`
            )
        );
    }

    if (order.items.length === 0) {
        fragment.appendChild(
            el(
                "p",
                "text-muted",
                "Тауарлар туралы мәлімет API жауабында жоқ."
            )
        );
    }

    itemsContainer?.replaceChildren(fragment);

    const extras = $("admin-order-detail-extras");

    extras?.replaceChildren(
        el(
            "p",
            "text-muted",
            "Қосымша қызметтер көрсетілмеген."
        )
    );

    detailText(
        "admin-order-detail-subtotal",
        money(order.subtotal ?? order.itemsSubtotal)
    );

    const discount = numberValue(order.discountAmount);
    const extraCost = numberValue(
        order.extraCost ?? order.additionalServicesCost
    );

    show(
        "admin-order-detail-discount-row",
        discount !== null && discount > 0
    );

    show(
        "admin-order-detail-extra-cost-row",
        extraCost !== null && extraCost > 0
    );

    detailText(
        "admin-order-detail-discount",
        discount === null ? "—" : `−${money(discount)}`
    );

    detailText(
        "admin-order-detail-extra-cost",
        money(extraCost)
    );

    show(ID.detailsLoading, false);
    show(ID.detailsError, false);
    show(ID.detailsContent, true);

    const editButton = $(ID.detailsEdit);

    show(
        ID.detailsEdit,
        !["DELIVERED", "CANCELLED"].includes(order.status)
    );

    if (editButton) {
        editButton.disabled = false;
    }
}

function viewOrderDetails(orderId) {
    const order = orders.find(item => item.id === orderId);

    if (!order) {
        showError("Тапсырыс табылмады.");
        return;
    }

    selectedOrder = order;
    returnFocus = document.activeElement;

    renderDetails(order);
    setModal(ID.detailsModal, true);
}

function closeStatusModal() {
    if (updating) {
        return;
    }

    setModal(ID.statusModal, false);
    statusOrder = null;

    if (returnFocus?.isConnected) {
        returnFocus.focus();
    }
}

function openStatusModal(orderId) {
    const order = orders.find(item => item.id === orderId);

    if (!order || updating) {
        return;
    }

    if (["DELIVERED", "CANCELLED"].includes(order.status)) {
        showError(
            "Бұл тапсырыстың статусы аяқталған. Оны өзгертуге болмайды."
        );
        return;
    }

    statusOrder = order;
    returnFocus = document.activeElement;

    setText("admin-order-status-id", order.id);
    setText(
        "admin-order-status-order-number",
        `Order #${order.id}`
    );

    setText("admin-order-status-current", order.status);
    setBadge("admin-order-status-current-badge", order.status);
    setText("admin-order-status-new-preview", "Not Selected");

    show(ID.statusError, false);

    const select = $(ID.statusSelect);

    if (select) {
        select.replaceChildren();

        const placeholder = el(
            "option",
            "",
            "Жаңа статус таңда"
        );

        placeholder.value = "";
        select.appendChild(placeholder);

        for (const status of ORDER_STATUSES) {
            if (status === order.status) {
                continue;
            }

            const option = el("option", "", status);
            option.value = status;
            select.appendChild(option);
        }

        select.value = "";
        select.disabled = false;
    }

    const save = $(ID.statusSave);

    if (save) {
        save.disabled = true;
    }

    setText(
        "admin-order-status-help",
        "Мүмкін ауысуларды сервер тексереді. Сақтаудан бұрын жаңа статусты раста."
    );

    setModal(ID.statusModal, true);
    select?.focus();
}

async function saveStatus(event) {
    event.preventDefault();

    if (!statusOrder || updating) {
        return;
    }

    const newStatus = statusOf($(ID.statusSelect)?.value);

    if (
        !ORDER_STATUSES.includes(newStatus) ||
        newStatus === statusOrder.status
    ) {
        show(ID.statusError, true);
        setText(
            ID.statusError,
            "Басқа дұрыс статус таңда."
        );
        return;
    }

    const approved = window.confirm(
        `Order #${statusOrder.id}: ${statusOrder.status} → ${newStatus}. Растайсың ба?`
    );

    if (!approved) {
        return;
    }

    updating = true;

    const button = $(ID.statusSave);

    if (button) {
        button.disabled = true;
    }

    setText(ID.statusSaveText, "Сақталуда...");
    show(ID.statusError, false);

    try {
        await api.put(
            `${API.orders}/${statusOrder.id}/status`,
            { status: newStatus }
        );

        updating = false;

        closeStatusModal();

        showSuccess(
            "Тапсырыс статусы сәтті жаңартылды."
        );

        await loadOrders();
    } catch (error) {
        setText(ID.statusError, getErrorMessage(error));
        show(ID.statusError, true);
    } finally {
        updating = false;

        if (button) {
            button.disabled = false;
        }

        setText(ID.statusSaveText, "Save Changes");
    }
}

function applyFilters() {
    state.keyword = String($(ID.search)?.value ?? "").trim();

    const status = statusOf($(ID.statusFilter)?.value ?? "ALL");
    const payment = statusOf($(ID.paymentFilter)?.value ?? "ALL");
    const size = Number($(ID.pageSize)?.value ?? 10);
    const sort = String($(ID.sort)?.value ?? "newest");

    state.status = [
        ...ORDER_STATUSES,
        "ALL"
    ].includes(status) ? status : "ALL";

    state.paymentStatus = [
        "ALL",
        "PAID",
        "PENDING",
        "FAILED"
    ].includes(payment) ? payment : "ALL";

    state.sort = [
        "newest",
        "oldest",
        "amount-asc",
        "amount-desc"
    ].includes(sort) ? sort : "newest";

    state.size = PAGE_SIZES.has(size) ? size : 10;
    state.page = 0;

    render();
}

function resetFilters() {
    clearTimeout(searchTimer);

    state = initialState();

    syncControls();
    render();
}

function on(target, type, callback) {
    target?.addEventListener(
        type,
        callback,
        { signal: controller.signal }
    );
}

function setupEvents() {
    for (const id of [ID.refresh, ID.retry]) {
        on($(id), "click", event => {
            event.preventDefault();
            loadOrders();
        });
    }

    on($(ID.searchForm), "submit", event => {
        event.preventDefault();
        clearTimeout(searchTimer);
        applyFilters();
    });

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
        }, 350);
    });

    on($(ID.filterToggle), "click", event => {
        event.preventDefault();

        const panel = $(ID.filters);

        if (!panel) {
            return;
        }

        const expanded = panel.hidden ||
            panel.classList.contains("hidden");

        show(ID.filters, expanded);

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

    on($(ID.tabs), "click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest("[data-status]");

        if (!button) {
            return;
        }

        state.status = statusOf(button.dataset.status);
        state.page = 0;

        render();
    });

    on($(ID.pagination), "click", event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) {
            return;
        }

        const page = Number(button.dataset.page);

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

        const button = event.target.closest("[data-order-action]");

        if (!button || button.disabled) {
            return;
        }

        const id = parseId(button.dataset.orderId);

        if (id === null) {
            return;
        }

        if (button.dataset.orderAction === "details") {
            viewOrderDetails(id);
        } else if (button.dataset.orderAction === "status") {
            openStatusModal(id);
        }
    });

    for (const id of [
        ID.detailsClose,
        ID.detailsDone
    ]) {
        on($(id), "click", closeDetails);
    }

    on($(ID.detailsEdit), "click", () => {
        const id = selectedOrder?.id;

        closeDetails();

        if (id !== undefined) {
            openStatusModal(id);
        }
    });

    for (const id of [
        ID.statusClose,
        ID.statusCancel
    ]) {
        on($(id), "click", closeStatusModal);
    }

    on($(ID.statusSelect), "change", () => {
        const value = String(
            $(ID.statusSelect)?.value ?? ""
        );

        setText(
            "admin-order-status-new-preview",
            value || "Not Selected"
        );

        const button = $(ID.statusSave);

        if (button) {
            button.disabled = !value || updating;
        }

        show(ID.statusError, false);
    });

    on($(ID.statusForm), "submit", saveStatus);

    for (const id of [
        ID.detailsModal,
        ID.statusModal
    ]) {
        on($(id), "click", event => {
            if (event.target !== event.currentTarget) {
                return;
            }

            if (id === ID.detailsModal) {
                closeDetails();
            } else {
                closeStatusModal();
            }
        });
    }

    on(document, "keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        if (!$(ID.statusModal)?.hidden) {
            closeStatusModal();
        } else if (!$(ID.detailsModal)?.hidden) {
            closeDetails();
        }
    });
}

export async function initAdminOrders() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    controller = new AbortController();

    setupEvents();
    syncControls();

    await loadOrders();
}

export function destroyAdminOrders() {
    initialized = false;
    active = false;
    loading = false;
    updating = false;

    requestVersion++;

    clearTimeout(searchTimer);
    searchTimer = null;

    controller?.abort();
    controller = null;

    for (const id of [
        ID.detailsModal,
        ID.statusModal
    ]) {
        const modal = $(id);

        if (modal) {
            modal.hidden = true;
            modal.classList.add("hidden");
            modal.classList.remove("is-open");
        }
    }

    document.body.style.overflow = oldOverflow;

    orders = [];
    dashboardStats = null;
    selectedOrder = null;
    statusOrder = null;

    state = initialState();
}

export const adminOrders = {
    init: initAdminOrders,
    destroy: destroyAdminOrders,
    reload: loadOrders,
    viewDetails: viewOrderDetails,
    updateStatus: openStatusModal,

    getOrders() {
        return orders.map(order => ({ ...order }));
    },

    getState() {
        return { ...state };
    }
};

export default adminOrders;
