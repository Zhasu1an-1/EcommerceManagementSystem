
import api from "./core/api.js";

import {
    getCurrentUser,
    checkAdminAccess,
    getUserDisplayName,
    getUserInitials,
    logout
} from "./core/auth.js";

import {
    byId,
    showElement,
    hideElement,
    setText,
    openModal,
    closeModal,
    setupModal
} from "./core/utils.js";

import {
    initHeader,
    destroyHeader
} from "./components/header.js";

import {
    initFooter,
    destroyFooter
} from "./components/footer.js";

import {
    showError
} from "./components/toast.js";

const PAGE_MODULES = {
    home: () => import("./pages/home.js"),
    catalog: () => import("./pages/catalog.js"),
    product: () => import("./pages/product.js"),
    cart: () => import("./pages/cart.js"),
    checkout: () => import("./pages/checkout.js"),
    payment: () => import("./pages/payment.js"),
    orders: () => import("./pages/orders.js"),
    "order-details": () => import("./pages/order-details.js"),
    login: () => import("./pages/login.js"),
    register: () => import("./pages/register.js"),
    account: () => import("./pages/account.js"),
    notifications: () => import("./pages/notifications.js"),
    "admin-dashboard": () => import("./admin/dashboard.js"),
    "admin-products": () => import("./admin/products.js"),
    "admin-product-form": () => import("./admin/product-form.js"),
    "admin-categories": () => import("./admin/categories.js"),
    "admin-orders": () => import("./admin/orders.js"),
    "admin-promotions": () => import("./admin/promotions.js"),
    "admin-notifications": () => import("./admin/notifications.js")
};

const PAGE_PATHS = {
    "/": "home",
    "/index.html": "home",
    "/pages/catalog.html": "catalog",
    "/pages/product.html": "product",
    "/pages/cart.html": "cart",
    "/pages/checkout.html": "checkout",
    "/pages/payment.html": "payment",
    "/pages/orders.html": "orders",
    "/pages/order-details.html": "order-details",
    "/pages/login.html": "login",
    "/pages/register.html": "register",
    "/pages/account.html": "account",
    "/pages/notifications.html": "notifications",
    "/admin/dashboard.html": "admin-dashboard",
    "/admin/products.html": "admin-products",
    "/admin/product-form.html": "admin-product-form",
    "/admin/categories.html": "admin-categories",
    "/admin/orders.html": "admin-orders",
    "/admin/promotions.html": "admin-promotions",
    "/admin/notifications.html": "admin-notifications"
};

let initialized = false;
let initializationPromise = null;

let activePage = null;
let activePageCleanup = null;

let adminShellController = null;
let adminLogoutModalCleanup = null;
let adminLogoutInProgress = false;

function resolvePageName() {
    const declaredPage = document.body.dataset.page;

    if (
        declaredPage &&
        Object.hasOwn(PAGE_MODULES, declaredPage)
    ) {
        return declaredPage;
    }

    return PAGE_PATHS[window.location.pathname] ?? null;
}

function isAdminPage(page) {
    return typeof page === "string" &&
        page.startsWith("admin-");
}

function setAdminAccessState(state) {
    const loading = byId("admin-access-loading");
    const denied = byId("admin-access-denied");

    const pageContent = document.querySelector(
        ".admin-dashboard-content, " +
        ".admin-products-content, " +
        ".admin-product-form-content, " +
        ".admin-categories-content, " +
        ".admin-orders-content, " +
        ".admin-promotions-content, " +
        ".admin-notifications-content"
    );

    if (loading) {
        if (state === "loading") {
            showElement(loading);
        } else {
            hideElement(loading);
        }
    }

    if (denied) {
        if (state === "denied") {
            showElement(denied);
        } else {
            hideElement(denied);
        }
    }

    if (pageContent) {
        if (state === "allowed") {
            showElement(pageContent);
        } else {
            hideElement(pageContent);
        }
    }
}

function updateAdminProfile(user) {
    if (!user) {
        return;
    }

    const name = getUserDisplayName(user);
    const initials = getUserInitials(user);

    setText("#admin-sidebar-name", name);
    setText("#admin-topbar-name", name);
    setText("#admin-welcome-name", name);

    setText("#admin-sidebar-avatar", initials);
    setText("#admin-topbar-avatar", initials);

    setText("#admin-sidebar-role", "Store Admin");
}

function getAdminSidebarElements() {
    return {
        sidebar: byId("admin-sidebar"),
        overlay: byId("admin-sidebar-overlay"),
        toggle: byId("admin-menu-toggle")
    };
}

function openAdminSidebar() {
    const {
        sidebar,
        overlay,
        toggle
    } = getAdminSidebarElements();

    if (!sidebar) {
        return;
    }

    sidebar.classList.add("is-open");

    document.body.classList.add(
        "admin-sidebar-open"
    );

    if (overlay) {
        overlay.classList.add("is-visible");
        overlay.setAttribute(
            "aria-hidden",
            "false"
        );
    }

    if (toggle) {
        toggle.setAttribute(
            "aria-expanded",
            "true"
        );
    }
}

function closeAdminSidebar() {
    const {
        sidebar,
        overlay,
        toggle
    } = getAdminSidebarElements();

    sidebar?.classList.remove("is-open");

    document.body.classList.remove(
        "admin-sidebar-open"
    );

    if (overlay) {
        overlay.classList.remove("is-visible");
        overlay.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    if (toggle) {
        toggle.setAttribute(
            "aria-expanded",
            "false"
        );
    }
}

function setupAdminSidebar() {
    const {
        sidebar,
        overlay,
        toggle
    } = getAdminSidebarElements();

    if (!sidebar || adminShellController) {
        return;
    }

    adminShellController = new AbortController();

    const signal = adminShellController.signal;

    toggle?.addEventListener(
        "click",
        openAdminSidebar,
        { signal }
    );

    byId("admin-sidebar-close")?.addEventListener(
        "click",
        closeAdminSidebar,
        { signal }
    );

    overlay?.addEventListener(
        "click",
        closeAdminSidebar,
        { signal }
    );

    sidebar.addEventListener(
        "click",
        event => {
            if (
                event.target instanceof Element &&
                event.target.closest(
                    ".admin-navigation a"
                )
            ) {
                closeAdminSidebar();
            }
        },
        { signal }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            if (
                document.body.classList.contains(
                    "admin-sidebar-open"
                )
            ) {
                closeAdminSidebar();
            }
        },
        { signal }
    );

    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 1024) {
                closeAdminSidebar();
            }
        },
        { signal }
    );
}

function setupAdminLogout() {
    const modal = byId("admin-logout-modal");
    const openButton = byId(
        "admin-sidebar-logout-button"
    );
    const confirmButton = byId(
        "admin-logout-confirm"
    );

    if (!modal || !adminShellController) {
        return;
    }

    const signal = adminShellController.signal;

    adminLogoutModalCleanup = setupModal(
        modal,
        {
            closeButtons: [
                "#admin-logout-modal-close",
                "#admin-logout-cancel"
            ]
        }
    );

    openButton?.addEventListener(
        "click",
        () => {
            hideElement("#admin-logout-error");
            openModal(modal);
        },
        { signal }
    );

    confirmButton?.addEventListener(
        "click",
        async () => {
            if (adminLogoutInProgress) {
                return;
            }

            adminLogoutInProgress = true;
            confirmButton.disabled = true;
            confirmButton.setAttribute(
                "aria-busy",
                "true"
            );

            hideElement("#admin-logout-error");

            try {
                await logout();

                closeModal(modal);

                window.location.assign("/");
            } catch (error) {
                const errorElement = byId(
                    "admin-logout-error"
                );

                setText(
                    errorElement,
                    error?.message ??
                    "Жүйеден шығу мүмкін болмады."
                );

                showElement(errorElement);
            } finally {
                adminLogoutInProgress = false;
                confirmButton.disabled = false;
                confirmButton.removeAttribute(
                    "aria-busy"
                );
            }
        },
        { signal }
    );
}

function setupAdminShell() {
    setupAdminSidebar();
    setupAdminLogout();
}

async function authorizeAdminPage() {
    setAdminAccessState("loading");

    try {
        const access = await checkAdminAccess();

        if (!access.allowed) {
            const message = access.reason === "UNAUTHENTICATED"
                ? "Admin Panel-ге кіру үшін алдымен аккаунтыңа кір."
                : "Бұл бөлімге тек ADMIN рөліндегі пайдаланушылар кіре алады.";

            setText(
                "#admin-access-denied-message",
                message
            );

            setAdminAccessState("denied");

            return null;
        }

        updateAdminProfile(access.user);

        setAdminAccessState("allowed");

        return access.user;
    } catch (error) {
        console.error(
            "Admin authorization failed:",
            error
        );

        setText(
            "#admin-access-denied-message",
            "Аккаунт құқықтарын тексеру мүмкін болмады. Сервер байланысын тексеріп, бетті қайта жүкте."
        );

        setAdminAccessState("denied");

        return null;
    }
}

function resolveInitializer(module, page) {
    if (typeof module.initPage === "function") {
        return module.initPage;
    }

    if (typeof module.init === "function") {
        return module.init;
    }

    if (
        module.default &&
        typeof module.default.init === "function"
    ) {
        return module.default.init.bind(
            module.default
        );
    }

    if (typeof module.default === "function") {
        return module.default;
    }

    const initializerNames = {
        home: "initHome",
        catalog: "initCatalog",
        product: "initProduct",
        cart: "initCart",
        checkout: "initCheckout",
        payment: "initPayment",
        orders: "initOrders",
        "order-details": "initOrderDetails",
        login: "initLogin",
        register: "initRegister",
        account: "initAccount",
        notifications: "initNotifications",
        "admin-dashboard": "initAdminDashboard",
        "admin-products": "initAdminProducts",
        "admin-product-form": "initAdminProductForm",
        "admin-categories": "initAdminCategories",
        "admin-orders": "initAdminOrders",
        "admin-promotions": "initAdminPromotions",
        "admin-notifications": "initAdminNotifications"
    };

    const initializerName = initializerNames[page];

    if (
        initializerName &&
        typeof module[initializerName] === "function"
    ) {
        return module[initializerName];
    }

    return null;
}

function showPageError(page, error) {
    const errorMessage = error?.message ??
        "Бетті жүктеу кезінде қате пайда болды.";

    console.error(
        `NEXORA page initialization failed: ${page}`,
        error
    );

    if (isAdminPage(page)) {
        const errorElement = byId(
            `${page}-error`
        );

        if (errorElement) {
            const messageElement =
                errorElement.querySelector(
                    '[id$="-error-message"]'
                );

            if (messageElement) {
                messageElement.textContent = errorMessage;
            }

            showElement(errorElement);
        }
    }

    showError(
        "Беттің кейбір функцияларын жүктеу мүмкін болмады."
    );
}

async function initializePage(page, user = null) {
    const loader = PAGE_MODULES[page];

    if (!loader) {
        return;
    }

    const module = await loader();
    const initializer = resolveInitializer(module, page);

    if (!initializer) {
        throw new Error(
            `${page} модулінде initPage немесе тиісті init функциясы табылмады.`
        );
    }

    const result = await initializer({
        page,
        user,
        api
    });

    if (typeof result === "function") {
        activePageCleanup = result;
    }

    activePage = page;
}

async function initializeStorefront() {
    const results = await Promise.allSettled([
        initHeader(),
        Promise.resolve().then(() => initFooter())
    ]);

    for (const result of results) {
        if (result.status === "rejected") {
            console.error(
                "Storefront component initialization failed:",
                result.reason
            );
        }
    }
}

async function initializeAdmin(page) {
    setupAdminShell();

    const user = await authorizeAdminPage();

    if (!user) {
        return;
    }

    try {
        await initializePage(page, user);
    } catch (error) {
        showPageError(page, error);
    }
}

async function initializeCustomerPage(page) {
    await initializeStorefront();

    try {
        await initializePage(page);
    } catch (error) {
        showPageError(page, error);
    }
}

async function initializeApplication() {
    if (initialized) {
        return;
    }

    initialized = true;

    const page = resolvePageName();

    if (!page) {
        await initializeStorefront();
        return;
    }

    document.body.dataset.page = page;

    if (isAdminPage(page)) {
        await initializeAdmin(page);
        return;
    }

    await initializeCustomerPage(page);
}

export function initApp() {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = initializeApplication()
        .catch(error => {
            console.error(
                "NEXORA application startup error:",
                error
            );

            showError(
                "Қосымшаны іске қосу мүмкін болмады."
            );

            initialized = false;

            throw error;
        })
        .finally(() => {
            initializationPromise = null;
        });

    return initializationPromise;
}

export function destroyApp() {
    if (typeof activePageCleanup === "function") {
        try {
            activePageCleanup();
        } catch (error) {
            console.error(
                "Page cleanup failed:",
                error
            );
        }
    }

    activePageCleanup = null;
    activePage = null;

    adminLogoutModalCleanup?.();
    adminLogoutModalCleanup = null;

    adminShellController?.abort();
    adminShellController = null;

    closeAdminSidebar();

    destroyHeader();
    destroyFooter();

    initialized = false;
}

export function getActivePage() {
    return activePage;
}

export const app = {
    init: initApp,
    destroy: destroyApp,
    getActivePage,
    openAdminSidebar,
    closeAdminSidebar
};

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            initApp().catch(() => {});
        },
        { once: true }
    );
} else {
    initApp().catch(() => {});
}

export default app;
