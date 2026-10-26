
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const ID = {
    content: "admin-dashboard-content",
    error: "admin-dashboard-error",
    errorMessage: "admin-dashboard-error-message",
    retry: "admin-dashboard-retry-button",
    refresh: "admin-dashboard-refresh-button",
    welcome: "admin-welcome-name",

    revenue: "admin-total-revenue",
    orders: "admin-total-orders",
    products: "admin-total-products",
    users: "admin-total-users",

    pending: "admin-pending-orders",
    lowStock: "admin-low-stock-products",
    categories: "admin-total-categories",
    promotions: "admin-active-promotions",

    recentOrdersBody: "admin-recent-orders-body",
    recentOrdersLoading: "admin-recent-orders-loading",
    recentOrdersEmpty: "admin-recent-orders-empty",
    recentOrdersError: "admin-recent-orders-error",

    statusChart: "admin-order-status-chart",
    statusLoading: "admin-order-status-loading",
    statusEmpty: "admin-order-status-empty",

    stockList: "admin-low-stock-list",
    stockEmpty: "admin-low-stock-empty",
    stockError: "admin-low-stock-error",

    promotionsList: "admin-active-promotions-list",
    promotionsEmpty: "admin-active-promotions-empty",
    promotionsError: "admin-active-promotions-error"
};

const ENDPOINTS = {
    dashboard: "/api/admin/dashboard",
    products: "/api/products",
    categories: "/api/categories",
    promotions: "/api/promotions/active",
    orders: "/api/orders"
};

const LOW_STOCK_THRESHOLD = 5;
const PRODUCT_PAGE_SIZE = 50;
const MAX_PRODUCT_PAGES = 200;
const RECENT_ORDERS_LIMIT = 5;
const STOCK_ALERTS_LIMIT = 5;
const PROMOTIONS_LIMIT = 5;

const ORDER_STATUSES = [
    {
        key: "pendingOrders",
        name: "Pending",
        color: "#f59e0b"
    },
    {
        key: "confirmedOrders",
        name: "Confirmed",
        color: "#3b82f6"
    },
    {
        key: "shippedOrders",
        name: "Shipped",
        color: "#8b5cf6"
    },
    {
        key: "deliveredOrders",
        name: "Delivered",
        color: "#10b981"
    },
    {
        key: "cancelledOrders",
        name: "Cancelled",
        color: "#ef4444"
    }
];

const integerFormatter = new Intl.NumberFormat("kk-KZ");

const currencyFormatter = new Intl.NumberFormat("kk-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("kk-KZ", {
    day: "2-digit",
    month: "short",
    year: "numeric"
});

const $ = id => document.getElementById(id);

let initialized = false;
let active = false;
let loading = false;
let requestVersion = 0;
let eventController = null;

let dashboardData = createEmptyDashboardData();

function createEmptyDashboardData() {
    return {
        totalUsers: null,
        totalProducts: null,
        totalCategories: null,
        totalOrders: null,
        totalRevenue: null,

        pendingOrders: null,
        confirmedOrders: null,
        shippedOrders: null,
        deliveredOrders: null,
        cancelledOrders: null,

        successfulPayments: null,
        failedPayments: null,

        lowStockCount: null,
        activePromotionsCount: null,

        products: [],
        categories: [],
        promotions: [],
        recentOrders: [],

        inventoryLoaded: false,
        promotionsLoaded: false,
        ordersLoaded: false,

        lastUpdated: null
    };
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function setVisible(id, visible) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.hidden = !visible;
    element.classList.toggle("hidden", !visible);
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

function parseId(value) {
    const text = String(value ?? "").trim();

    if (!/^[1-9]\d*$/.test(text)) {
        return null;
    }

    const id = Number(text);

    return Number.isSafeInteger(id)
        ? id
        : null;
}

function parseCount(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isSafeInteger(number) && number >= 0
        ? number
        : null;
}

function parseRevenue(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : null;
}

function formatInteger(value) {
    return value === null || value === undefined
        ? "—"
        : integerFormatter.format(value);
}

function formatCurrency(value) {
    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(Number(value))
    ) {
        return "—";
    }

    return currencyFormatter.format(Number(value));
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? "—"
        : dateFormatter.format(date);
}

function safeImageUrl(value) {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(
            String(value),
            window.location.origin
        );

        return ["http:", "https:"].includes(url.protocol)
            ? url.href
            : null;
    } catch {
        return null;
    }
}

function extractArray(response) {
    if (Array.isArray(response)) {
        return response;
    }

    const possible = [
        response?.content,
        response?.data,
        response?.data?.content,
        response?.products,
        response?.orders,
        response?.promotions
    ];

    return possible.find(Array.isArray) ?? null;
}

function normalizeDashboard(response) {
    const source = response?.data ?? response;

    if (
        !source ||
        typeof source !== "object" ||
        Array.isArray(source)
    ) {
        throw new Error(
            "Admin Dashboard API дұрыс жауап қайтармады."
        );
    }

    const fields = [
        "totalUsers",
        "totalProducts",
        "totalCategories",
        "totalOrders",
        "pendingOrders",
        "confirmedOrders",
        "shippedOrders",
        "deliveredOrders",
        "cancelledOrders",
        "successfulPayments",
        "failedPayments"
    ];

    const result = {};

    for (const field of fields) {
        const value = parseCount(source[field]);

        if (value === null) {
            throw new Error(
                `Dashboard API ішінде ${field} мәліметі дұрыс емес.`
            );
        }

        result[field] = value;
    }

    result.totalRevenue = parseRevenue(
        source.totalRevenue
    );

    return result;
}

function normalizeProduct(product) {
    const id = parseId(product?.id);

    if (id === null) {
        return null;
    }

    const stock = Number(product.stock);

    return {
        id,
        name: String(product.name ?? "Product"),
        stock:
            product.stock !== null &&
            product.stock !== undefined &&
            Number.isSafeInteger(stock) &&
            stock >= 0
                ? stock
                : null,
        price: Number(product.price ?? 0),
        imageUrl: safeImageUrl(product.imageUrl)
    };
}

function normalizePromotion(promotion) {
    const id = parseId(promotion?.id);

    if (id === null) {
        return null;
    }

    const value = Number(promotion.value);

    return {
        id,
        code: String(promotion.code ?? ""),
        discountType: String(
            promotion.discountType ?? ""
        ).toUpperCase(),
        value: Number.isFinite(value)
            ? value
            : null,
        active: promotion.active === true
    };
}

function normalizeOrder(order) {
    const id = parseId(
        order?.id ?? order?.orderId
    );

    if (id === null) {
        return null;
    }

    const total = order.totalAmount ??
        order.totalPrice ??
        order.finalAmount ??
        order.total;

    const customer = order.customerName ??
        order.userName ??
        order.customer?.name ??
        order.user?.name ??
        order.customerEmail ??
        order.user?.email ??
        "Customer";

    return {
        id,
        customer: String(customer),
        date: order.createdAt ??
            order.orderDate ??
            order.createdDate ??
            null,
        amount:
            total !== null &&
            total !== undefined &&
            Number.isFinite(Number(total))
                ? Number(total)
                : null,
        status: String(
            order.status ?? "UNKNOWN"
        ).toUpperCase()
    };
}

function setLoading(value) {
    loading = value;

    const refresh = $(ID.refresh);
    const retry = $(ID.retry);

    if (refresh instanceof HTMLButtonElement) {
        refresh.disabled = value;
        refresh.setAttribute(
            "aria-busy",
            String(value)
        );
    }

    if (retry instanceof HTMLButtonElement) {
        retry.disabled = value;
    }
}

function showPageError(message) {
    setText(ID.errorMessage, message);
    setVisible(ID.error, true);

    if (!$(ID.error)) {
        showError(message);
    }
}

function hidePageError() {
    setVisible(ID.error, false);
}

function renderMetric(id, value, formatter = formatInteger) {
    setText(id, formatter(value));
}

function renderMetrics() {
    renderMetric(
        ID.products,
        dashboardData.totalProducts
    );

    renderMetric(
        ID.categories,
        dashboardData.totalCategories
    );

    renderMetric(
        ID.orders,
        dashboardData.totalOrders
    );

    renderMetric(
        ID.users,
        dashboardData.totalUsers
    );

    renderMetric(
        ID.pending,
        dashboardData.pendingOrders
    );

    renderMetric(
        ID.lowStock,
        dashboardData.lowStockCount
    );

    renderMetric(
        ID.promotions,
        dashboardData.activePromotionsCount
    );

    renderMetric(
        ID.revenue,
        dashboardData.totalRevenue,
        formatCurrency
    );
}

function renderOrderStatus() {
    const chart = $(ID.statusChart);

    if (!chart) {
        return;
    }

    setVisible(ID.statusLoading, false);

    const total = dashboardData.totalOrders;

    if (total === null || total === 0) {
        chart.replaceChildren();

        setVisible(
            ID.statusEmpty,
            total === 0
        );

        return;
    }

    setVisible(ID.statusEmpty, false);

    const fragment = document.createDocumentFragment();

    const container = createElement(
        "div",
        "admin-order-status-breakdown"
    );

    const totalLabel = createElement(
        "div",
        "admin-order-status-total"
    );

    totalLabel.style.marginBottom = "20px";
    totalLabel.style.fontWeight = "700";

    totalLabel.textContent =
        `${formatInteger(total)} тапсырыс`;

    container.appendChild(totalLabel);

    for (const status of ORDER_STATUSES) {
        const count = dashboardData[status.key];

        if (count === null) {
            continue;
        }

        const percentage =
            total > 0
                ? count / total * 100
                : 0;

        const item = createElement(
            "div",
            "admin-order-status-item"
        );

        item.style.marginBottom = "18px";

        const header = createElement(
            "div",
            "admin-order-status-item-header"
        );

        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.gap = "12px";
        header.style.marginBottom = "8px";

        const label = createElement(
            "span",
            "",
            status.name
        );

        const value = createElement(
            "strong",
            "",
            `${count} (${percentage.toFixed(1)}%)`
        );

        header.append(label, value);

        const track = createElement(
            "div",
            "admin-order-status-track"
        );

        track.style.height = "9px";
        track.style.borderRadius = "999px";
        track.style.backgroundColor = "#eef0f7";
        track.style.overflow = "hidden";

        const fill = createElement(
            "div",
            "admin-order-status-fill"
        );

        fill.style.width =
            `${Math.min(100, percentage)}%`;

        fill.style.height = "100%";
        fill.style.backgroundColor = status.color;
        fill.style.borderRadius = "999px";

        track.appendChild(fill);

        item.append(header, track);
        container.appendChild(item);
    }

    fragment.appendChild(container);
    chart.replaceChildren(fragment);
}

function renderStockAlerts() {
    const container = $(ID.stockList);

    if (!container) {
        return;
    }

    if (!dashboardData.inventoryLoaded) {
        container.replaceChildren();

        setVisible(ID.stockEmpty, false);
        setVisible(ID.stockError, true);

        return;
    }

    const lowStock = dashboardData.products
        .filter(product =>
            product.stock !== null &&
            product.stock <= LOW_STOCK_THRESHOLD
        )
        .sort((a, b) =>
            a.stock - b.stock ||
            a.id - b.id
        );

    setVisible(
        ID.stockEmpty,
        lowStock.length === 0
    );

    setVisible(ID.stockError, false);

    const fragment = document.createDocumentFragment();

    for (const product of lowStock.slice(
        0,
        STOCK_ALERTS_LIMIT
    )) {
        const card = createElement(
            "div",
            "dashboard-stock-item"
        );

        const info = createElement(
            "div",
            "dashboard-stock-item-info"
        );

        const link = createElement(
            "a",
            "dashboard-stock-item-name",
            product.name
        );

        link.href =
            `/admin/product-form.html?id=${product.id}`;

        const badge = createElement(
            "span",
            product.stock === 0
                ? "badge badge-danger"
                : "badge badge-warning",
            product.stock === 0
                ? "Out of Stock"
                : `Low Stock (${product.stock})`
        );

        info.append(link, badge);

        const manage = createElement(
            "a",
            "btn btn-outline btn-sm",
            "Manage"
        );

        manage.href =
            `/admin/product-form.html?id=${product.id}`;

        card.append(info, manage);
        fragment.appendChild(card);
    }

    container.replaceChildren(fragment);
}

function renderPromotions() {
    const container = $(ID.promotionsList);

    if (!container) {
        return;
    }

    if (!dashboardData.promotionsLoaded) {
        container.replaceChildren();

        setVisible(ID.promotionsEmpty, false);
        setVisible(ID.promotionsError, true);

        return;
    }

    const activePromotions =
        dashboardData.promotions.filter(
            promotion => promotion.active
        );

    setVisible(
        ID.promotionsEmpty,
        activePromotions.length === 0
    );

    setVisible(ID.promotionsError, false);

    const fragment = document.createDocumentFragment();

    for (const promotion of activePromotions.slice(
        0,
        PROMOTIONS_LIMIT
    )) {
        const card = createElement(
            "div",
            "dashboard-stock-item"
        );

        const info = createElement(
            "div",
            "dashboard-stock-item-info"
        );

        const code = createElement(
            "strong",
            "dashboard-stock-item-name",
            promotion.code
        );

        const discount =
            promotion.value === null
                ? "—"
                : promotion.discountType === "PERCENTAGE"
                    ? `${promotion.value}%`
                    : formatCurrency(promotion.value);

        const badge = createElement(
            "span",
            "badge badge-success",
            discount
        );

        info.append(code, badge);

        const manage = createElement(
            "a",
            "btn btn-outline btn-sm",
            "Manage"
        );

        manage.href = "/admin/promotions.html";

        card.append(info, manage);
        fragment.appendChild(card);
    }

    container.replaceChildren(fragment);
}

function createOrderRow(order) {
    const row = document.createElement("tr");

    const id = createElement(
        "td",
        "",
        `#${order.id}`
    );

    const customer = createElement(
        "td",
        "",
        order.customer
    );

    const date = createElement(
        "td",
        "",
        formatDate(order.date)
    );

    const amount = createElement(
        "td",
        "",
        formatCurrency(order.amount)
    );

    const statusCell = document.createElement("td");

    const status = createElement(
        "span",
        "badge",
        order.status
    );

    status.classList.add(
        order.status === "DELIVERED"
            ? "badge-success"
            : order.status === "CANCELLED"
                ? "badge-danger"
                : order.status === "PENDING"
                    ? "badge-warning"
                    : "badge-neutral"
    );

    statusCell.appendChild(status);

    const actionsCell = document.createElement("td");

    const view = createElement(
        "a",
        "btn btn-outline btn-sm",
        "View"
    );

    view.href = "/admin/orders.html";

    actionsCell.appendChild(view);

    row.append(
        id,
        customer,
        date,
        amount,
        statusCell,
        actionsCell
    );

    return row;
}

function renderRecentOrders() {
    const body = $(ID.recentOrdersBody);

    if (!body) {
        return;
    }

    setVisible(ID.recentOrdersLoading, false);

    if (!dashboardData.ordersLoaded) {
        body.replaceChildren();

        setVisible(ID.recentOrdersEmpty, false);
        setVisible(ID.recentOrdersError, true);

        return;
    }

    const orders = dashboardData.recentOrders
        .slice(0, RECENT_ORDERS_LIMIT);

    setVisible(
        ID.recentOrdersEmpty,
        orders.length === 0
    );

    setVisible(ID.recentOrdersError, false);

    const fragment = document.createDocumentFragment();

    for (const order of orders) {
        fragment.appendChild(
            createOrderRow(order)
        );
    }

    body.replaceChildren(fragment);
}

function renderDashboard() {
    renderMetrics();
    renderOrderStatus();
    renderStockAlerts();
    renderPromotions();
    renderRecentOrders();

    setVisible(ID.content, true);
}

async function loadAdminStatistics() {
    const response = await api.get(
        ENDPOINTS.dashboard
    );

    return normalizeDashboard(response);
}

async function loadProducts(version) {
    const all = [];
    let completed = false;

    for (
        let page = 0;
        page < MAX_PRODUCT_PAGES;
        page++
    ) {
        const query = new URLSearchParams({
            page: String(page),
            size: String(PRODUCT_PAGE_SIZE)
        });

        const response = await api.get(
            `${ENDPOINTS.products}?${query.toString()}`
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return null;
        }

        const source = response?.data?.content
            ? response.data
            : response;

        const content = extractArray(source);

        if (!content) {
            throw new Error(
                "Products API дұрыс тізім қайтармады."
            );
        }

        all.push(...content);

        if (Array.isArray(source)) {
            completed = true;
            break;
        }

        const totalPages = parseCount(
            source.totalPages
        );

        if (totalPages !== null) {
            if (page + 1 >= totalPages) {
                completed = true;
                break;
            }
        } else if (
            content.length < PRODUCT_PAGE_SIZE
        ) {
            completed = true;
            break;
        }
    }

    if (!completed) {
        throw new Error(
            "Барлық тауарларды жүктеу мүмкін болмады."
        );
    }

    const unique = new Map();

    for (const raw of all) {
        const product = normalizeProduct(raw);

        if (product) {
            unique.set(product.id, product);
        }
    }

    return [...unique.values()];
}

async function loadCategories() {
    const response = await api.get(
        ENDPOINTS.categories
    );

    const list = extractArray(response);

    if (!list) {
        throw new Error(
            "Categories API дұрыс жауап қайтармады."
        );
    }

    return list;
}

async function loadPromotions() {
    const response = await api.get(
        ENDPOINTS.promotions
    );

    const list = extractArray(response);

    if (!list) {
        throw new Error(
            "Promotions API дұрыс жауап қайтармады."
        );
    }

    return list
        .map(normalizePromotion)
        .filter(Boolean);
}

async function loadOrders() {
    const query = new URLSearchParams({
        page: "0",
        size: String(RECENT_ORDERS_LIMIT),
        sort: "id,desc"
    });

    const response = await api.get(
        `${ENDPOINTS.orders}?${query.toString()}`
    );

    const list = extractArray(response);

    if (!list) {
        throw new Error(
            "Orders API дұрыс тізім қайтармады."
        );
    }

    return list
        .map(normalizeOrder)
        .filter(Boolean)
        .sort((a, b) => b.id - a.id);
}

async function loadDashboard(options = {}) {
    if (!active || loading) {
        return;
    }

    const current = ++requestVersion;
    const silent = options.silent === true;

    setLoading(true);
    hidePageError();

    setVisible(
        ID.recentOrdersLoading,
        true
    );

    setVisible(
        ID.statusLoading,
        true
    );

    const results = await Promise.allSettled([
        loadAdminStatistics(),
        loadProducts(current),
        loadCategories(),
        loadPromotions(),
        loadOrders()
    ]);

    if (
        !active ||
        current !== requestVersion
    ) {
        return;
    }

    dashboardData = createEmptyDashboardData();

    const [
        statisticsResult,
        productsResult,
        categoriesResult,
        promotionsResult,
        ordersResult
    ] = results;

    const errors = [];

    if (statisticsResult.status === "fulfilled") {
        Object.assign(
            dashboardData,
            statisticsResult.value
        );
    } else {
        errors.push(
            getErrorMessage(statisticsResult.reason)
        );
    }

    if (
        productsResult.status === "fulfilled" &&
        productsResult.value !== null
    ) {
        dashboardData.products =
            productsResult.value;

        dashboardData.inventoryLoaded = true;

        dashboardData.lowStockCount =
            dashboardData.products.filter(
                product =>
                    product.stock !== null &&
                    product.stock > 0 &&
                    product.stock <= LOW_STOCK_THRESHOLD
            ).length;

        if (dashboardData.totalProducts === null) {
            dashboardData.totalProducts =
                dashboardData.products.length;
        }
    } else if (productsResult.status === "rejected") {
        errors.push(
            getErrorMessage(productsResult.reason)
        );
    }

    if (categoriesResult.status === "fulfilled") {
        dashboardData.categories =
            categoriesResult.value;

        if (dashboardData.totalCategories === null) {
            dashboardData.totalCategories =
                dashboardData.categories.length;
        }
    } else {
        errors.push(
            getErrorMessage(categoriesResult.reason)
        );
    }

    if (promotionsResult.status === "fulfilled") {
        dashboardData.promotions =
            promotionsResult.value;

        dashboardData.promotionsLoaded = true;

        dashboardData.activePromotionsCount =
            dashboardData.promotions.filter(
                promotion => promotion.active
            ).length;
    } else {
        errors.push(
            getErrorMessage(promotionsResult.reason)
        );
    }

    if (ordersResult.status === "fulfilled") {
        dashboardData.recentOrders =
            ordersResult.value;

        dashboardData.ordersLoaded = true;
    } else {
        errors.push(
            getErrorMessage(ordersResult.reason)
        );
    }

    dashboardData.lastUpdated = new Date();

    setLoading(false);
    renderDashboard();

    if (statisticsResult.status === "rejected") {
        showPageError(
            "Admin статистикасын алу мүмкін болмады: " +
            getErrorMessage(statisticsResult.reason)
        );
    } else if (errors.length > 0) {
        console.warn(
            "Dashboard partial loading errors:",
            errors
        );
    } else if (!silent) {
        showSuccess(
            "Dashboard мәліметтері жаңартылды."
        );
    }
}

function setupWelcome(user) {
    if (!user) {
        return;
    }

    const name = String(
        user.name ??
        user.fullName ??
        user.username ??
        "Administrator"
    ).trim();

    setText(
        ID.welcome,
        name || "Administrator"
    );
}

function setupLinks() {
    const routes = {
        products: "/admin/products.html",
        "add-product": "/admin/product-form.html",
        categories: "/admin/categories.html",
        orders: "/admin/orders.html",
        promotions: "/admin/promotions.html",
        notifications: "/admin/notifications.html"
    };

    document.querySelectorAll(
        "[data-dashboard-link]"
    ).forEach(link => {
        if (!(link instanceof HTMLAnchorElement)) {
            return;
        }

        const route = routes[
            link.dataset.dashboardLink
        ];

        if (route) {
            link.href = route;
        }
    });
}

function setupEvents() {
    const signal = eventController.signal;

    for (const id of [
        ID.refresh,
        ID.retry
    ]) {
        $(id)?.addEventListener(
            "click",
            event => {
                event.preventDefault();

                loadDashboard({
                    silent: false
                });
            },
            { signal }
        );
    }
}

export async function initAdminDashboard(context = {}) {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupWelcome(context.user);
    setupLinks();
    setupEvents();

    await loadDashboard({
        silent: true
    });
}

export function destroyAdminDashboard() {
    initialized = false;
    active = false;
    loading = false;

    requestVersion++;

    eventController?.abort();
    eventController = null;
}

export const dashboard = {
    init: initAdminDashboard,
    destroy: destroyAdminDashboard,
    reload: loadDashboard,

    getData() {
        return {
            ...dashboardData,
            products: [...dashboardData.products],
            categories: [...dashboardData.categories],
            promotions: [...dashboardData.promotions],
            recentOrders: [...dashboardData.recentOrders]
        };
    }
};

export default dashboard;
