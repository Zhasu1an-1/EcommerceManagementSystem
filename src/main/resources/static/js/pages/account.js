
import api, {
    getErrorMessage,
    isAuthenticationError
} from "../core/api.js";

import {
    getCurrentUser,
    getUserDisplayName,
    getUserInitials,
    getLoginUrl,
    isAdmin,
    logout,
    clearAuthState
} from "../core/auth.js";

import {
    formatCurrency,
    formatDateTime,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const RECENT_ORDERS_LIMIT = 5;

const SELECTORS = {
    loading: [
        "#account-loading",
        "#account-loading-state"
    ],
    content: [
        "#account-content",
        "#account-main-content"
    ],
    auth: [
        "#account-auth-required",
        "#account-login-required"
    ],
    error: [
        "#account-error",
        "#account-error-state"
    ],
    name: [
        "#account-name",
        "#profile-name",
        "[data-account-name]"
    ],
    email: [
        "#account-email",
        "#profile-email",
        "[data-account-email]"
    ],
    role: [
        "#account-role",
        "#profile-role",
        "[data-account-role]"
    ],
    avatar: [
        "#account-avatar",
        "#profile-avatar",
        "[data-account-avatar]"
    ],
    greeting: [
        "#account-greeting-name",
        "#account-welcome-name",
        "[data-account-greeting]"
    ],
    userId: [
        "#account-user-id",
        "[data-account-user-id]"
    ],
    createdAt: [
        "#account-created-at",
        "#account-member-since",
        "[data-account-created-at]"
    ],
    recentOrders: [
        "#account-recent-orders",
        "#recent-orders-list",
        "[data-account-recent-orders]"
    ],
    ordersEmpty: [
        "#account-orders-empty",
        "#account-recent-orders-empty"
    ],
    ordersLoading: [
        "#account-orders-loading",
        "[data-account-orders-loading]"
    ],
    ordersCount: [
        "#account-orders-count",
        "#account-total-orders",
        "[data-account-orders-count]"
    ],
    totalSpent: [
        "#account-total-spent",
        "[data-account-total-spent]"
    ],
    refreshButton: [
        "#account-refresh",
        "#account-refresh-button",
        "[data-account-refresh]"
    ],
    logoutButton: [
        "#account-logout",
        "#account-logout-button",
        "[data-account-logout]"
    ],
    adminLink: [
        "#account-admin-link",
        "[data-account-admin-link]"
    ],
    editForm: [
        "#account-edit-form",
        "#profile-edit-form",
        "[data-account-edit-form]"
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let loggingOut = false;

let currentUser = null;
let recentOrders = [];

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

    for (const [key, selectors] of Object.entries(SELECTORS)) {
        elements[key] = findElement(selectors);
    }

    return elements;
}

function setText(element, value) {
    if (!element) {
        return;
    }

    const text = String(value ?? "—");

    if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
    ) {
        element.value = text;
    } else {
        element.textContent = text;
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

function setPageState(state) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        auth: elements.auth,
        error: elements.error
    };

    for (const [name, element] of Object.entries(sections)) {
        if (!element) {
            continue;
        }

        if (name === state) {
            showElement(element);
        } else {
            hideElement(element);
        }
    }
}

function showFallbackState(
    title,
    description,
    linkText,
    linkUrl
) {
    let container = document.getElementById(
        "account-dynamic-state"
    );

    if (!container) {
        container = createElement(
            "div",
            "empty-state account-dynamic-state"
        );

        container.id = "account-dynamic-state";

        document.querySelector("main")?.prepend(
            container
        );
    }

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

    container.replaceChildren(heading, paragraph);

    if (linkText && linkUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            linkText
        );

        link.href = linkUrl;
        container.appendChild(link);
    }

    showElement(container);
}

function hideFallbackState() {
    const container = document.getElementById(
        "account-dynamic-state"
    );

    if (container) {
        hideElement(container);
    }
}

function showAuthRequired() {
    currentUser = null;
    recentOrders = [];

    setPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/account.html"
    );

    const authElement = getElements().auth;

    if (authElement) {
        const loginLink = authElement.querySelector(
            "a[href]"
        );

        if (loginLink) {
            loginLink.href = loginUrl;
        }
    } else {
        showFallbackState(
            "Sign in to your account",
            "Жеке кабинетіңді көру үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showAccountError(error) {
    const message = getErrorMessage(error);
    const errorElement = getElements().error;

    setPageState("error");

    if (errorElement) {
        const description = errorElement.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackState(
            "Account unavailable",
            message,
            "Back to Home",
            "/"
        );
    }
}

function renderProfile(user) {
    const elements = getElements();

    const name = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const admin = isAdmin(user);

    setText(elements.name, name);
    setText(elements.email, user.email ?? "—");
    setText(elements.role, admin ? "ADMIN" : "CUSTOMER");
    setText(elements.avatar, initials);
    setText(elements.greeting, name);
    setText(elements.userId, user.id ?? "—");

    if (user.createdAt) {
        setText(
            elements.createdAt,
            formatDateTime(user.createdAt)
        );
    } else if (elements.createdAt) {
        setText(elements.createdAt, "—");
    }

    if (elements.adminLink) {
        if (admin) {
            if (
                elements.adminLink instanceof HTMLAnchorElement
            ) {
                elements.adminLink.href =
                    "/admin/dashboard.html";
            }

            showElement(elements.adminLink);
        } else {
            hideElement(elements.adminLink);
        }
    }

    document.title = "My Account | NEXORA";

    hideFallbackState();
    setPageState("content");
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

function normalizeOrder(order) {
    if (!order || typeof order !== "object") {
        return null;
    }

    const id = Number(
        order.id ?? order.orderId
    );

    if (!Number.isSafeInteger(id) || id <= 0) {
        return null;
    }

    const amount = Number(
        order.totalAmount ??
        order.totalPrice ??
        order.total ??
        0
    );

    return {
        id,
        status: String(
            order.status ?? order.orderStatus ?? "PENDING"
        ).toUpperCase(),
        totalAmount: Number.isFinite(amount)
            ? Math.max(0, amount)
            : 0,
        createdAt:
            order.createdAt ??
            order.orderDate ??
            order.createdDate ??
            null
    };
}

function getStatusVariant(status) {
    switch (status) {
        case "DELIVERED":
            return "success";

        case "CANCELLED":
            return "danger";

        case "PENDING":
            return "warning";

        case "CONFIRMED":
        case "SHIPPED":
            return "primary";

        default:
            return "neutral";
    }
}

function createOrderCard(order) {
    const article = createElement(
        "article",
        "account-order-card"
    );

    const information = createElement(
        "div",
        "account-order-info"
    );

    const title = createElement(
        "a",
        "account-order-title",
        `Order #${order.id}`
    );

    title.href =
        `/pages/order-details.html?id=${encodeURIComponent(order.id)}`;

    const date = createElement(
        "span",
        "account-order-date",
        order.createdAt
            ? formatDateTime(order.createdAt)
            : "—"
    );

    information.append(title, date);

    const details = createElement(
        "div",
        "account-order-details"
    );

    const status = createElement(
        "span",
        `badge badge-${getStatusVariant(order.status)}`,
        order.status
    );

    const total = createElement(
        "strong",
        "account-order-total",
        formatCurrency(order.totalAmount)
    );

    details.append(status, total);

    const link = createElement(
        "a",
        "btn btn-outline btn-sm",
        "View Details"
    );

    link.href =
        `/pages/order-details.html?id=${encodeURIComponent(order.id)}`;

    article.append(
        information,
        details,
        link
    );

    return article;
}

function renderRecentOrders(orders, response) {
    const elements = getElements();

    const sortedOrders = [...orders].sort(
        (a, b) => {
            const first = Date.parse(a.createdAt) || 0;
            const second = Date.parse(b.createdAt) || 0;

            return second - first || b.id - a.id;
        }
    );

    recentOrders = sortedOrders.slice(
        0,
        RECENT_ORDERS_LIMIT
    );

    const pageData = response?.data?.content
        ? response.data
        : response;

    const reportedTotal = Number(
        pageData?.totalElements
    );

    const isPaged = Number.isFinite(reportedTotal);

    setText(
        elements.ordersCount,
        isPaged
            ? Math.max(0, reportedTotal)
            : orders.length
    );

    if (!isPaged) {
        const totalSpent = orders.reduce(
            (sum, order) => sum + order.totalAmount,
            0
        );

        setText(
            elements.totalSpent,
            formatCurrency(totalSpent)
        );
    } else if (elements.totalSpent) {
        setText(elements.totalSpent, "—");
    }

    if (!elements.recentOrders) {
        return;
    }

    if (recentOrders.length === 0) {
        elements.recentOrders.replaceChildren();

        if (elements.ordersEmpty) {
            showElement(elements.ordersEmpty);
        } else {
            const message = createElement(
                "div",
                "empty-state account-orders-empty"
            );

            const heading = createElement(
                "h3",
                "empty-state-title",
                "No orders yet"
            );

            const paragraph = createElement(
                "p",
                "empty-state-description",
                "Сен әлі тапсырыс жасамағансың."
            );

            const link = createElement(
                "a",
                "btn btn-primary",
                "Explore Products"
            );

            link.href = "/pages/catalog.html";

            message.append(
                heading,
                paragraph,
                link
            );

            elements.recentOrders.appendChild(message);
        }

        return;
    }

    hideElement(elements.ordersEmpty);

    const fragment = document.createDocumentFragment();

    for (const order of recentOrders) {
        fragment.appendChild(
            createOrderCard(order)
        );
    }

    elements.recentOrders.replaceChildren(fragment);
}

async function loadRecentOrders(version) {
    const elements = getElements();

    if (
        !elements.recentOrders &&
        !elements.ordersCount &&
        !elements.totalSpent
    ) {
        return;
    }

    showElement(elements.ordersLoading);

    try {
        const response = await api.orders.mine();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const orders = extractOrders(response)
            .map(normalizeOrder)
            .filter(Boolean);

        renderRecentOrders(orders, response);
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
            "Account orders loading failed:",
            error
        );

        if (elements.recentOrders) {
            elements.recentOrders.replaceChildren(
                createElement(
                    "p",
                    "account-orders-error",
                    "Соңғы тапсырыстарды жүктеу мүмкін болмады."
                )
            );
        }

        setText(elements.ordersCount, "—");
        setText(elements.totalSpent, "—");
    } finally {
        if (
            active &&
            version === requestVersion
        ) {
            hideElement(elements.ordersLoading);
        }
    }
}

async function loadAccount(forceRefresh = false) {
    const version = ++requestVersion;

    setPageState("loading");

    try {
        const user = await getCurrentUser(forceRefresh);

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

        currentUser = user;

        renderProfile(user);

        await loadRecentOrders(version);
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

        showAccountError(error);
    }
}

async function handleLogout(event) {
    event?.preventDefault();

    if (loggingOut) {
        return;
    }

    loggingOut = true;

    const button = getElements().logoutButton;

    if (button && "disabled" in button) {
        button.disabled = true;
    }

    try {
        await logout({
            redirect: false
        });

        showSuccess(
            "Аккаунттан сәтті шықтың."
        );

        window.location.replace(
            "/pages/login.html?logout=true"
        );
    } catch (error) {
        showError(getErrorMessage(error));
    } finally {
        loggingOut = false;

        if (button && "disabled" in button) {
            button.disabled = false;
        }
    }
}

function setupAccountActions() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.refreshButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadAccount(true);
        },
        { signal }
    );

    elements.logoutButton?.addEventListener(
        "click",
        handleLogout,
        { signal }
    );

    elements.editForm?.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            showInfo(
                "Профиль мәліметтерін өзгерту функциясы серверде әлі іске асырылмаған."
            );
        },
        { signal }
    );
}

export async function initAccount() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupAccountActions();

    await loadAccount();
}

export function destroyAccount() {
    active = false;
    initialized = false;
    loggingOut = false;

    requestVersion += 1;

    eventController?.abort();
    eventController = null;

    currentUser = null;
    recentOrders = [];
}

export const account = {
    init: initAccount,
    destroy: destroyAccount,
    reload: loadAccount,
    logout: handleLogout,
    getCurrentUser() {
        return currentUser;
    },
    getRecentOrders() {
        return [...recentOrders];
    }
};

export default account;
