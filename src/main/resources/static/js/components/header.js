
import api, {
    isAuthenticationError
} from "../core/api.js";

import {
    getCurrentUser,
    getCachedUser,
    getUserDisplayName,
    getUserInitials,
    isAdmin,
    onAuthChange,
    logout
} from "../core/auth.js";

import {
    showError
} from "./toast.js";

const CART_UPDATED_EVENTS = [
    "nexora:cart-updated",
    "nexora:cart-changed",
    "cart:updated",
    "cart:changed"
];

let initialized = false;
let headerElement = null;
let mobileMenu = null;
let searchPanel = null;
let authUnsubscribe = null;
let eventController = null;
let cartRequestVersion = 0;
let currentCartCount = 0;
let mobileMenuOpen = false;

function findHeader() {
    return document.querySelector(
        "#site-header, .site-header, .main-header, header[role='banner']"
    );
}

function findFirst(selectors, root = document) {
    return root.querySelector(selectors);
}

function findAll(selectors) {
    const roots = [
        headerElement,
        mobileMenu,
        document
    ];

    const result = new Set();

    for (const root of roots) {
        if (!root) {
            continue;
        }

        for (const element of root.querySelectorAll(selectors)) {
            result.add(element);
        }
    }

    return [...result];
}

function setVisible(element, visible) {
    if (!element) {
        return;
    }

    element.hidden = !visible;
    element.classList.toggle("hidden", !visible);
}

function updateText(selectors, value) {
    for (const element of findAll(selectors)) {
        element.textContent = String(value);
    }
}

function getMobileMenu() {
    return findFirst(
        "#mobile-menu, #mobile-nav, #mobile-navigation, .mobile-menu, .mobile-navigation, [data-mobile-menu]"
    );
}

function getMenuButtons() {
    return findAll(
        "#mobile-menu-toggle, #header-menu-toggle, .mobile-menu-toggle, .header-menu-toggle, [data-menu-toggle]"
    );
}

function getMenuOverlay() {
    return findFirst(
        "#mobile-menu-overlay, .mobile-menu-overlay, [data-mobile-menu-overlay]"
    );
}

function getSearchPanel() {
    return findFirst(
        "#header-search-panel, .header-search-panel, [data-search-panel]"
    );
}

function updateMenuButtons(open) {
    for (const button of getMenuButtons()) {
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute(
            "aria-label",
            open ? "Мәзірді жабу" : "Мәзірді ашу"
        );

        button.classList.toggle("is-active", open);
    }
}

export function openMobileMenu() {
    mobileMenu = mobileMenu ?? getMobileMenu();

    if (!mobileMenu) {
        return;
    }

    mobileMenuOpen = true;

    setVisible(mobileMenu, true);

    mobileMenu.classList.add("is-open", "active", "open");
    mobileMenu.setAttribute("aria-hidden", "false");

    const overlay = getMenuOverlay();

    if (overlay) {
        setVisible(overlay, true);
        overlay.classList.add("is-visible", "is-active");
    }

    document.body.classList.add("mobile-menu-open");

    updateMenuButtons(true);
}

export function closeMobileMenu() {
    mobileMenu = mobileMenu ?? getMobileMenu();

    mobileMenuOpen = false;

    if (mobileMenu) {
        mobileMenu.classList.remove(
            "is-open",
            "active",
            "open"
        );

        mobileMenu.setAttribute("aria-hidden", "true");

        setVisible(mobileMenu, false);
    }

    const overlay = getMenuOverlay();

    if (overlay) {
        overlay.classList.remove(
            "is-visible",
            "is-active"
        );

        setVisible(overlay, false);
    }

    document.body.classList.remove("mobile-menu-open");

    updateMenuButtons(false);
}

export function toggleMobileMenu() {
    if (mobileMenuOpen) {
        closeMobileMenu();
    } else {
        openMobileMenu();
    }
}

export function openHeaderSearch() {
    searchPanel = searchPanel ?? getSearchPanel();

    if (!searchPanel) {
        return;
    }

    setVisible(searchPanel, true);

    searchPanel.classList.add("is-open");
    searchPanel.setAttribute("aria-hidden", "false");

    const searchInput = searchPanel.querySelector(
        'input[type="search"], input[name="keyword"], input[name="q"]'
    );

    searchInput?.focus();
}

export function closeHeaderSearch() {
    searchPanel = searchPanel ?? getSearchPanel();

    if (!searchPanel) {
        return;
    }

    searchPanel.classList.remove("is-open");
    searchPanel.setAttribute("aria-hidden", "true");

    setVisible(searchPanel, false);
}

function getCartCountFromResponse(cart) {
    if (!cart || typeof cart !== "object") {
        return 0;
    }

    const reportedCount = Number(
        cart.totalItems ?? cart.totalQuantity
    );

    if (
        Number.isFinite(reportedCount) &&
        reportedCount >= 0
    ) {
        return Math.trunc(reportedCount);
    }

    if (!Array.isArray(cart.items)) {
        return 0;
    }

    return cart.items.reduce((total, item) => {
        const quantity = Number(item.quantity);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            return total;
        }

        return total + Math.trunc(quantity);
    }, 0);
}

function getCartCountElements() {
    return findAll(
        "[data-cart-count], #header-cart-count, #mobile-cart-count, #cart-count, .header-cart-count, .cart-count, .cart-badge"
    ).filter(element => {
        return Boolean(
            element.closest(
                ".site-header, .main-header, .mobile-menu, .mobile-navigation, header[role='banner']"
            )
        );
    });
}

function createMissingCartBadges() {
    const cartLinks = findAll(
        'a[href="/pages/cart.html"], a[href="/pages/cart.html/"]'
    );

    for (const link of cartLinks) {
        if (
            !link.closest(
                ".site-header, .main-header, .mobile-menu, .mobile-navigation, header[role='banner']"
            )
        ) {
            continue;
        }

        const existingBadge = link.querySelector(
            "[data-cart-count], .cart-count, .cart-badge, .header-cart-count"
        );

        if (existingBadge) {
            continue;
        }

        const badge = document.createElement("span");

        badge.className = "cart-count header-cart-count";
        badge.dataset.cartCount = "";
        badge.setAttribute("aria-hidden", "true");

        link.appendChild(badge);
    }
}

export function setHeaderCartCount(value) {
    const number = Number(value);

    currentCartCount = (
        Number.isFinite(number) &&
        number > 0
    )
        ? Math.trunc(number)
        : 0;

    if (!headerElement) {
        return currentCartCount;
    }

    createMissingCartBadges();

    const displayValue = currentCartCount > 99
        ? "99+"
        : String(currentCartCount);

    for (const element of getCartCountElements()) {
        element.textContent = displayValue;

        const showZero =
            element.dataset.showZero === "true";

        setVisible(
            element,
            currentCartCount > 0 || showZero
        );
    }

    const cartLinks = findAll(
        'a[href="/pages/cart.html"], a[href="/pages/cart.html/"]'
    );

    for (const link of cartLinks) {
        link.setAttribute(
            "aria-label",
            currentCartCount > 0
                ? `Себет: ${currentCartCount} тауар`
                : "Себет бос"
        );
    }

    return currentCartCount;
}

export function getHeaderCartCount() {
    return currentCartCount;
}

export async function refreshCartCount() {
    const requestVersion = ++cartRequestVersion;

    if (!getCachedUser()) {
        setHeaderCartCount(0);
        return 0;
    }

    try {
        const cart = await api.cart.get();
        const count = getCartCountFromResponse(cart);

        if (requestVersion === cartRequestVersion) {
            setHeaderCartCount(count);
        }

        return count;
    } catch (error) {
        if (requestVersion === cartRequestVersion) {
            setHeaderCartCount(0);
        }

        if (!isAuthenticationError(error)) {
            console.warn(
                "Cart count could not be loaded:",
                error
            );
        }

        return 0;
    }
}

function updateAuthenticationElements(user) {
    const authenticated = Boolean(user);
    const admin = authenticated && isAdmin(user);

    const guestSelectors = [
        "[data-auth-guest]",
        "#header-guest-actions",
        "#header-login-link",
        "#header-register-link",
        ".header-guest-actions"
    ].join(", ");

    const userSelectors = [
        "[data-auth-user]",
        "#header-user-actions",
        "#header-user-menu",
        "#header-account-link",
        ".header-user-actions"
    ].join(", ");

    const adminSelectors = [
        "[data-admin-only]",
        "#header-admin-link",
        ".header-admin-link"
    ].join(", ");

    for (const element of findAll(guestSelectors)) {
        setVisible(element, !authenticated);
    }

    for (const element of findAll(userSelectors)) {
        setVisible(element, authenticated);
    }

    for (const element of findAll(adminSelectors)) {
        setVisible(element, admin);
    }

    const loginLinks = findAll(
        'a[href^="/pages/login.html"]'
    );

    const registerLinks = findAll(
        'a[href^="/pages/register.html"]'
    );

    const accountLinks = findAll(
        'a[href="/pages/account.html"]'
    );

    const adminLinks = findAll(
        'a[href="/admin/dashboard.html"]'
    );

    for (const link of [...loginLinks, ...registerLinks]) {
        if (
            link.closest(
                ".site-header, .main-header, .mobile-menu, .mobile-navigation, header[role='banner']"
            )
        ) {
            setVisible(link, !authenticated);
        }
    }

    for (const link of accountLinks) {
        if (
            link.closest(
                ".site-header, .main-header, .mobile-menu, .mobile-navigation, header[role='banner']"
            )
        ) {
            setVisible(link, authenticated);
        }
    }

    for (const link of adminLinks) {
        if (
            link.closest(
                ".site-header, .main-header, .mobile-menu, .mobile-navigation, header[role='banner']"
            )
        ) {
            setVisible(link, admin);
        }
    }

    if (authenticated) {
        updateText(
            "[data-user-name], #header-user-name, #mobile-user-name, .header-user-name",
            getUserDisplayName(user)
        );

        updateText(
            "[data-user-avatar], #header-user-avatar, #mobile-user-avatar, .header-user-avatar",
            getUserInitials(user)
        );

        updateText(
            "[data-user-role], #header-user-role",
            admin ? "ADMIN" : "CUSTOMER"
        );
    }

    const logoutButtons = findAll(
        "[data-header-logout], #header-logout-button, #mobile-logout-button"
    );

    for (const button of logoutButtons) {
        setVisible(button, authenticated);
    }

    if (!authenticated) {
        ++cartRequestVersion;
        setHeaderCartCount(0);
    }

    if (headerElement) {
        headerElement.dataset.authenticated = String(
            authenticated
        );

        headerElement.dataset.role = admin
            ? "ADMIN"
            : authenticated
                ? "CUSTOMER"
                : "GUEST";
    }
}

export function updateHeader(user = getCachedUser()) {
    if (!headerElement) {
        return;
    }

    updateAuthenticationElements(user);
    setHeaderCartCount(currentCartCount);
}

function handleSearchSubmit(event) {
    const form = event.target.closest(
        "#header-search-form, #mobile-search-form, .header-search-form, .mobile-search-form, [data-header-search-form]"
    );

    if (!form || !(form instanceof HTMLFormElement)) {
        return;
    }

    event.preventDefault();

    const input = form.querySelector(
        'input[type="search"], input[name="keyword"], input[name="q"]'
    );

    const keyword = input?.value.trim() ?? "";

    const url = new URL(
        "/pages/catalog.html",
        window.location.origin
    );

    if (keyword) {
        url.searchParams.set("keyword", keyword);
    }

    closeMobileMenu();
    closeHeaderSearch();

    window.location.assign(
        `${url.pathname}${url.search}`
    );
}

async function handleHeaderLogout(button) {
    if (button.disabled) {
        return;
    }

    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
        await logout();

        closeMobileMenu();
        closeHeaderSearch();

        window.location.assign("/");
    } catch (error) {
        showError(
            error?.message ??
            "Жүйеден шығу мүмкін болмады."
        );
    } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}

function handleHeaderClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    const toggleButton = target.closest(
        "#mobile-menu-toggle, #header-menu-toggle, .mobile-menu-toggle, .header-menu-toggle, [data-menu-toggle]"
    );

    if (toggleButton) {
        event.preventDefault();
        toggleMobileMenu();
        return;
    }

    const closeButton = target.closest(
        "#mobile-menu-close, .mobile-menu-close, [data-mobile-menu-close]"
    );

    if (closeButton) {
        event.preventDefault();
        closeMobileMenu();
        return;
    }

    const searchToggle = target.closest(
        "#header-search-toggle, #mobile-search-toggle, [data-search-toggle]"
    );

    if (searchToggle) {
        event.preventDefault();

        if (
            searchPanel &&
            !searchPanel.hidden &&
            searchPanel.classList.contains("is-open")
        ) {
            closeHeaderSearch();
        } else {
            openHeaderSearch();
        }

        return;
    }

    const searchClose = target.closest(
        "#header-search-close, [data-search-close]"
    );

    if (searchClose) {
        event.preventDefault();
        closeHeaderSearch();
        return;
    }

    const logoutButton = target.closest(
        "[data-header-logout], #header-logout-button, #mobile-logout-button"
    );

    if (logoutButton) {
        event.preventDefault();
        handleHeaderLogout(logoutButton);
        return;
    }

    if (
        mobileMenuOpen &&
        mobileMenu?.contains(target)
    ) {
        const link = target.closest("a[href]");

        if (link) {
            closeMobileMenu();
        }
    }
}

function handleEscape(event) {
    if (event.key !== "Escape") {
        return;
    }

    if (mobileMenuOpen) {
        closeMobileMenu();
        return;
    }

    if (searchPanel && !searchPanel.hidden) {
        closeHeaderSearch();
    }
}

function handleResize() {
    if (window.innerWidth > 1024 && mobileMenuOpen) {
        closeMobileMenu();
    }
}

function setupMobileMenuInitialState() {
    mobileMenu = getMobileMenu();

    if (!mobileMenu) {
        return;
    }

    const isAlreadyOpen =
        mobileMenu.classList.contains("is-open");

    if (isAlreadyOpen) {
        openMobileMenu();
    } else {
        closeMobileMenu();
    }
}

function setupSearchInitialState() {
    searchPanel = getSearchPanel();

    if (
        searchPanel &&
        !searchPanel.classList.contains("is-open")
    ) {
        closeHeaderSearch();
    }
}

function setupEventListeners() {
    eventController = new AbortController();

    const signal = eventController.signal;

    document.addEventListener(
        "click",
        handleHeaderClick,
        { signal }
    );

    document.addEventListener(
        "submit",
        handleSearchSubmit,
        { signal }
    );

    document.addEventListener(
        "keydown",
        handleEscape,
        { signal }
    );

    window.addEventListener(
        "resize",
        handleResize,
        { signal }
    );

    const overlay = getMenuOverlay();

    if (overlay) {
        overlay.addEventListener(
            "click",
            closeMobileMenu,
            { signal }
        );
    }

    for (const eventName of CART_UPDATED_EVENTS) {
        window.addEventListener(
            eventName,
            refreshCartCount,
            { signal }
        );

        document.addEventListener(
            eventName,
            refreshCartCount,
            { signal }
        );
    }
}

export async function initHeader() {
    if (initialized) {
        return headerElement;
    }

    headerElement = findHeader();

    if (!headerElement) {
        return null;
    }

    initialized = true;

    setupMobileMenuInitialState();
    setupSearchInitialState();
    setupEventListeners();

    authUnsubscribe = onAuthChange(snapshot => {
        updateHeader(snapshot.user);

        if (snapshot.authenticated) {
            refreshCartCount();
        } else {
            ++cartRequestVersion;
            setHeaderCartCount(0);
        }
    });

    try {
        const user = await getCurrentUser();

        if (!initialized) {
            return null;
        }

        updateHeader(user);

        if (user) {
            await refreshCartCount();
        }
    } catch (error) {
        console.warn(
            "Header authentication check failed:",
            error
        );

        if (initialized) {
            updateHeader(null);
        }
    }

    return headerElement;
}

export function destroyHeader() {
    if (!initialized) {
        return;
    }

    closeMobileMenu();
    closeHeaderSearch();

    eventController?.abort();
    authUnsubscribe?.();

    ++cartRequestVersion;

    eventController = null;
    authUnsubscribe = null;
    headerElement = null;
    mobileMenu = null;
    searchPanel = null;
    initialized = false;
}

export const header = {
    init: initHeader,
    update: updateHeader,
    destroy: destroyHeader,
    refreshCartCount,
    setCartCount: setHeaderCartCount,
    getCartCount: getHeaderCartCount,
    openMobileMenu,
    closeMobileMenu,
    toggleMobileMenu,
    openSearch: openHeaderSearch,
    closeSearch: closeHeaderSearch
};

export default header;
