
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
    formatDateTime
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const RECENT_LIMIT = 5;
const ORDER_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 100;

const $ = id => document.getElementById(id);

let initialized = false;
let active = false;
let loading = false;
let loggingOut = false;
let updatingProfile = false;
let requestVersion = 0;
let events = null;

let currentUser = null;
let recentOrders = [];

let returnFocus = null;
let editProfileReturnFocus = null;
let originalOverflow = "";

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

function createElement(tag, className = "", value = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (value !== null && value !== undefined) {
        element.textContent = String(value);
    }

    return element;
}

function setPageState(state) {
    const states = {
        loading: "account-loading",
        content: "account-content",
        auth: "account-auth-required",
        error: "account-error"
    };

    for (const [name, id] of Object.entries(states)) {
        setVisible(id, name === state);
    }
}

function normalizeRole(user) {
    return isAdmin(user) ? "ADMIN" : "CUSTOMER";
}

function getDisplayName(user) {
    const name = getUserDisplayName(user);

    if (
        !name ||
        name === "Пайдаланушы" ||
        name === "anonymousUser"
    ) {
        return user.email ?? "Пайдаланушы";
    }

    return name;
}

function getGreetingName(user) {
    const displayName = getDisplayName(user);

    if (displayName.includes("@")) {
        return displayName.split("@")[0];
    }

    return displayName.split(/\s+/)[0] || "досым";
}

function formatUserId(user) {
    const id = user.id ?? user.userId;

    if (
        id === null ||
        id === undefined ||
        id === ""
    ) {
        return "—";
    }

    return String(id);
}

function renderProfile(user) {
    const displayName = getDisplayName(user);
    const role = normalizeRole(user);

    setText("account-name", displayName);
    setText("account-email", user.email ?? "—");
    setText("account-id", formatUserId(user));
    setText("account-role", role);

    setText("account-summary-name", displayName);
    setText("account-summary-email", user.email ?? "—");
    setText("account-summary-role", role);

    setText(
        "account-avatar-initials",
        getUserInitials({
            ...user,
            name: displayName
        })
    );

    setText(
        "account-hero-name",
        getGreetingName(user)
    );

    const roleBadge = $("account-summary-role");

    if (roleBadge) {
        roleBadge.classList.toggle(
            "badge-primary",
            role === "CUSTOMER"
        );

        roleBadge.classList.toggle(
            "badge-success",
            role === "ADMIN"
        );
    }

    setVisible(
        "account-admin-sidebar-link",
        role === "ADMIN"
    );

    setVisible(
        "account-admin-card",
        role === "ADMIN"
    );

    document.title = `${displayName} | NEXORA`;
}

function showAuthRequired() {
    currentUser = null;
    recentOrders = [];

    const login = $("account-auth-required")?.querySelector(
        'a[href*="/pages/login.html"]'
    );

    if (login) {
        login.href = getLoginUrl(
            "/pages/account.html"
        );
    }

    setPageState("auth");
}

function showAccountError(error) {
    setText(
        "account-error-message",
        getErrorMessage(error)
    );

    setPageState("error");
}

function parseOrder(raw) {
    const id = Number(
        raw?.id ?? raw?.orderId
    );

    if (
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    const amount =
        raw.totalAmount ??
        raw.totalPrice ??
        raw.finalAmount ??
        raw.total;

    const parsedAmount = Number(amount);

    return {
        id,
        status: String(
            raw.status ??
            raw.orderStatus ??
            "UNKNOWN"
        ).toUpperCase(),
        totalAmount:
            amount !== null &&
            amount !== undefined &&
            Number.isFinite(parsedAmount)
                ? parsedAmount
                : null,
        createdAt:
            raw.createdAt ??
            raw.orderDate ??
            raw.createdDate ??
            null
    };
}

function extractPage(response) {
    const source = response?.data?.content
        ? response.data
        : response;

    if (Array.isArray(source)) {
        return {
            orders: source,
            totalPages: 1
        };
    }

    if (!Array.isArray(source?.content)) {
        throw new Error(
            "Тапсырыстар API-і дұрыс жауап қайтармады."
        );
    }

    const pages = Number(source.totalPages);

    return {
        orders: source.content,
        totalPages:
            Number.isSafeInteger(pages) &&
            pages >= 0
                ? pages
                : null
    };
}

async function fetchAllMyOrders(version) {
    const all = [];

    for (
        let page = 0;
        page < MAX_ORDER_PAGES;
        page++
    ) {
        const params = new URLSearchParams({
            page: String(page),
            size: String(ORDER_PAGE_SIZE),
            sort: "createdAt,desc"
        });

        const response = await api.get(
            `/api/orders/my?${params.toString()}`
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return null;
        }

        const result = extractPage(response);

        all.push(...result.orders);

        if (
            result.totalPages !== null &&
            page + 1 >= result.totalPages
        ) {
            return all;
        }

        if (
            result.totalPages === null &&
            result.orders.length < ORDER_PAGE_SIZE
        ) {
            return all;
        }
    }

    throw new Error(
        "Тапсырыстар тізімін толық жүктеу мүмкін болмады."
    );
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

    const name = createElement(
        "a",
        "account-order-title",
        `Order #${order.id}`
    );

    name.href =
        `/pages/order-details.html?id=${encodeURIComponent(order.id)}`;

    const date = createElement(
        "span",
        "account-order-date",
        order.createdAt
            ? formatDateTime(order.createdAt)
            : "—"
    );

    information.append(name, date);

    const details = createElement(
        "div",
        "account-order-details"
    );

    const badge = createElement(
        "span",
        `badge badge-${getStatusVariant(order.status)}`,
        order.status
    );

    const total = createElement(
        "strong",
        "account-order-total",
        order.totalAmount === null
            ? "—"
            : formatCurrency(order.totalAmount)
    );

    details.append(badge, total);

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

function renderOrders(orders) {
    const unique = new Map();

    for (const raw of orders) {
        const order = parseOrder(raw);

        if (order) {
            unique.set(order.id, order);
        }
    }

    const normalized = [...unique.values()].sort(
        (a, b) =>
            (Date.parse(b.createdAt) || 0) -
            (Date.parse(a.createdAt) || 0) ||
            b.id - a.id
    );

    const activeCount = normalized.filter(
        order => [
            "PENDING",
            "CONFIRMED",
            "SHIPPED"
        ].includes(order.status)
    ).length;

    const completedCount = normalized.filter(
        order => order.status === "DELIVERED"
    ).length;

    setText(
        "account-orders-count",
        normalized.length
    );

    setText(
        "account-active-orders-count",
        activeCount
    );

    setText(
        "account-completed-orders-count",
        completedCount
    );

    recentOrders = normalized.slice(
        0,
        RECENT_LIMIT
    );

    const container = $("account-recent-orders");

    if (container) {
        const fragment = document.createDocumentFragment();

        for (const order of recentOrders) {
            fragment.appendChild(
                createOrderCard(order)
            );
        }

        container.replaceChildren(fragment);
    }

    setVisible(
        "account-recent-empty",
        normalized.length === 0
    );

    setVisible(
        "account-recent-error",
        false
    );
}

function renderOrdersError() {
    for (const id of [
        "account-orders-count",
        "account-active-orders-count",
        "account-completed-orders-count"
    ]) {
        setText(id, "—");
    }

    $("account-recent-orders")?.replaceChildren();

    setVisible("account-recent-empty", false);
    setVisible("account-recent-error", true);
}

async function loadMyOrders(version) {
    try {
        const orders = await fetchAllMyOrders(version);

        if (
            !active ||
            version !== requestVersion ||
            orders === null
        ) {
            return;
        }

        renderOrders(orders);
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

        renderOrdersError();
    }
}

async function loadAccount(forceRefresh = false) {
    if (!active || loading) {
        return;
    }

    loading = true;

    const version = ++requestVersion;

    setPageState("loading");

    try {
        const user = await getCurrentUser(
            forceRefresh
        );

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

        setPageState("content");

        await loadMyOrders(version);
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
        } else {
            showAccountError(error);
        }
    } finally {
        if (version === requestVersion) {
            loading = false;
        }
    }
}

function openLogoutModal() {
    if (
        loggingOut ||
        updatingProfile
    ) {
        return;
    }

    const modal = $("account-logout-modal");

    if (!modal) {
        return;
    }

    returnFocus =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    setVisible("account-logout-error", false);

    modal.hidden = false;
    modal.classList.add("is-open");
    modal.classList.remove("hidden");

    $("account-logout-cancel")?.focus();
}

function closeLogoutModal() {
    if (loggingOut) {
        return;
    }

    const modal = $("account-logout-modal");

    if (modal) {
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.classList.add("hidden");
    }

    document.body.style.overflow = originalOverflow;

    if (returnFocus?.isConnected) {
        returnFocus.focus();
    }

    returnFocus = null;
}

async function confirmLogout() {
    if (loggingOut) {
        return;
    }

    loggingOut = true;

    const button = $("account-logout-confirm");

    if (button) {
        button.disabled = true;
        button.textContent = "Шығуда...";
    }

    setVisible("account-logout-error", false);

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
        setText(
            "account-logout-error",
            getErrorMessage(error)
        );

        setVisible(
            "account-logout-error",
            true
        );

        showError(getErrorMessage(error));
    } finally {
        loggingOut = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Иә, шығу";
        }
    }
}

function openEditProfile() {
    if (
        !currentUser ||
        updatingProfile ||
        loggingOut
    ) {
        return;
    }

    const modal = $("account-edit-profile-modal");
    const input = $("account-edit-name");

    if (!modal || !input) {
        showError(
            "Edit Profile терезесі табылмады."
        );
        return;
    }

    editProfileReturnFocus =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    input.value = String(
        currentUser.name ?? ""
    );

    setText(
        "account-edit-profile-error",
        ""
    );

    setVisible(
        "account-edit-profile-error",
        false
    );

    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    input.focus();
    input.select();
}

function closeEditProfile() {
    if (updatingProfile) {
        return;
    }

    const modal = $("account-edit-profile-modal");

    if (modal) {
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.classList.add("hidden");
        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    document.body.style.overflow = originalOverflow;

    if (editProfileReturnFocus?.isConnected) {
        editProfileReturnFocus.focus();
    }

    editProfileReturnFocus = null;
}

function showEditProfileError(message) {
    setText(
        "account-edit-profile-error",
        message
    );

    setVisible(
        "account-edit-profile-error",
        true
    );
}

async function saveEditProfile(event) {
    event.preventDefault();

    if (
        !currentUser ||
        updatingProfile ||
        loggingOut
    ) {
        return;
    }

    const input = $("account-edit-name");

    const name = String(
        input?.value ?? ""
    ).trim();

    setVisible(
        "account-edit-profile-error",
        false
    );

    if (
        name.length < 2 ||
        name.length > 100
    ) {
        showEditProfileError(
            "Атың 2–100 таңба аралығында болуы керек."
        );

        input?.focus();
        return;
    }

    if (name === currentUser.name) {
        closeEditProfile();
        return;
    }

    updatingProfile = true;

    const button = $("account-edit-profile-save");

    if (button) {
        button.disabled = true;
        button.textContent = "Сақталуда...";
    }

    try {
        await api.patch(
            "/api/auth/me/name",
            { name }
        );

        const updatedUser = await getCurrentUser(true);

        if (!updatedUser) {
            throw new Error(
                "Жаңартылған аккаунт мәліметтерін алу мүмкін болмады."
            );
        }

        if (!active) {
            return;
        }

        currentUser = updatedUser;

        renderProfile(updatedUser);

        updatingProfile = false;
        closeEditProfile();

        showSuccess(
            "Профиль аты сәтті өзгертілді."
        );
    } catch (error) {
        const message = getErrorMessage(error);

        showEditProfileError(message);
    } finally {
        updatingProfile = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Save Changes";
        }
    }
}

function on(target, type, callback) {
    target?.addEventListener(
        type,
        callback,
        { signal: events.signal }
    );
}

function setupEvents() {
    on(
        $("account-retry-button"),
        "click",
        event => {
            event.preventDefault();
            loadAccount(true);
        }
    );

    on(
        $("account-logout-button"),
        "click",
        event => {
            event.preventDefault();
            openLogoutModal();
        }
    );

    for (const id of [
        "account-logout-modal-close",
        "account-logout-cancel"
    ]) {
        on(
            $(id),
            "click",
            event => {
                event.preventDefault();
                closeLogoutModal();
            }
        );
    }

    on(
        $("account-logout-confirm"),
        "click",
        event => {
            event.preventDefault();
            confirmLogout();
        }
    );

    on(
        $("account-logout-modal"),
        "click",
        event => {
            if (
                event.target === event.currentTarget
            ) {
                closeLogoutModal();
            }
        }
    );

    on(
        $("account-edit-profile-button"),
        "click",
        event => {
            event.preventDefault();
            openEditProfile();
        }
    );

    for (const id of [
        "account-edit-profile-close",
        "account-edit-profile-cancel"
    ]) {
        on(
            $(id),
            "click",
            event => {
                event.preventDefault();
                closeEditProfile();
            }
        );
    }

    on(
        $("account-edit-profile-form"),
        "submit",
        saveEditProfile
    );

    on(
        $("account-edit-profile-modal"),
        "click",
        event => {
            if (
                event.target === event.currentTarget
            ) {
                closeEditProfile();
            }
        }
    );

    on(
        $("account-edit-name"),
        "input",
        () => {
            setVisible(
                "account-edit-profile-error",
                false
            );
        }
    );

    on(document, "keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        const editModal = $(
            "account-edit-profile-modal"
        );

        const logoutModal = $(
            "account-logout-modal"
        );

        if (
            editModal &&
            !editModal.hidden
        ) {
            closeEditProfile();
            return;
        }

        if (
            logoutModal &&
            !logoutModal.hidden
        ) {
            closeLogoutModal();
        }
    });
}

export async function initAccount() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    events = new AbortController();

    setupEvents();

    await loadAccount();
}

export function destroyAccount() {
    active = false;
    initialized = false;
    loading = false;
    loggingOut = false;
    updatingProfile = false;

    requestVersion++;

    events?.abort();
    events = null;

    for (const id of [
        "account-logout-modal",
        "account-edit-profile-modal"
    ]) {
        const modal = $(id);

        if (modal) {
            modal.hidden = true;
            modal.classList.add("hidden");
            modal.classList.remove("is-open");
            modal.setAttribute(
                "aria-hidden",
                "true"
            );
        }
    }

    document.body.style.overflow = originalOverflow;

    returnFocus = null;
    editProfileReturnFocus = null;

    currentUser = null;
    recentOrders = [];
}

export const account = {
    init: initAccount,
    destroy: destroyAccount,
    reload: loadAccount,
    logout: confirmLogout,
    openEditProfile,

    getCurrentUser() {
        return currentUser;
    },

    getRecentOrders() {
        return [...recentOrders];
    }
};

export default account;
