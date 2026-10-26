
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
    formatInteger,
    getSafeImageUrl,
    parsePositiveId,
    toNumber,
    showElement,
    hideElement,
    openModal,
    closeModal,
    setupModal
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const SELECTORS = {
    loading: [
        "#cart-loading",
        "#cart-loading-state"
    ],
    content: [
        "#cart-content",
        "#cart-main-content"
    ],
    items: [
        "#cart-items-list",
        "#cart-items-container",
        "#cart-items",
        "[data-cart-items]"
    ],
    empty: [
        "#cart-empty",
        "#cart-empty-state"
    ],
    error: [
        "#cart-error",
        "#cart-error-state"
    ],
    auth: [
        "#cart-auth-required",
        "#cart-login-required",
        "#cart-unauthorized"
    ],
    summary: [
        "#cart-summary",
        "#cart-order-summary"
    ],
    subtotal: [
        "#cart-subtotal",
        "[data-cart-subtotal]"
    ],
    total: [
        "#cart-total",
        "#cart-total-amount",
        "[data-cart-total]"
    ],
    count: [
        "#cart-items-count",
        "#cart-item-count",
        "[data-cart-items-count]"
    ],
    summaryCount: [
        "#cart-summary-count",
        "[data-cart-summary-count]"
    ],
    clearButton: [
        "#cart-clear-button",
        "#clear-cart-button",
        "[data-cart-clear]"
    ],
    checkoutButton: [
        "#cart-checkout-button",
        "#proceed-to-checkout",
        "[data-cart-checkout]"
    ],
    modal: [
        "#clear-cart-modal",
        "#cart-clear-modal",
        "#cart-clear-confirmation-modal"
    ],
    confirmClear: [
        "#confirm-clear-cart",
        "#cart-clear-confirm",
        "[data-confirm-clear-cart]"
    ]
};

const PRODUCT_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m3 17 5-5 4 4 3-3 6 6"/>
    </svg>
`;

const TRASH_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path d="M3 6h18"/>
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
        <path d="M5 6l1 15h12l1-15"/>
        <path d="M10 10v7M14 10v7"/>
    </svg>
`;

const MINUS_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
    >
        <path d="M5 12h14"/>
    </svg>
`;

const PLUS_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
    >
        <path d="M12 5v14M5 12h14"/>
    </svg>
`;

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let modalCleanup = null;
let currentCart = null;
let isUpdating = false;

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

function createIcon(markup) {
    const element = createElement(
        "span",
        "cart-action-icon"
    );

    element.innerHTML = markup;
    element.setAttribute("aria-hidden", "true");

    return element;
}

function normalizeCartItem(item) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const id = parsePositiveId(item.id);
    const productId = parsePositiveId(item.productId);

    if (id === null || productId === null) {
        return null;
    }

    const quantity = Math.max(
        1,
        Math.trunc(toNumber(item.quantity, 1))
    );

    const unitPrice = Math.max(
        0,
        toNumber(item.unitPrice ?? item.price)
    );

    const subtotal = Math.max(
        0,
        toNumber(
            item.subtotal,
            unitPrice * quantity
        )
    );

    return {
        id,
        productId,
        productName: String(
            item.productName ?? "Product"
        ),
        imageUrl: getSafeImageUrl(item.imageUrl),
        unitPrice,
        quantity,
        subtotal
    };
}

function normalizeCart(data) {
    const source = data?.data?.items
        ? data.data
        : data;

    if (!source || typeof source !== "object") {
        return {
            items: [],
            totalItems: 0,
            totalAmount: 0
        };
    }

    const items = Array.isArray(source.items)
        ? source.items.map(normalizeCartItem).filter(Boolean)
        : [];

    const quantitySum = items.reduce(
        (total, item) => total + item.quantity,
        0
    );

    const calculatedTotal = items.reduce(
        (total, item) => total + item.subtotal,
        0
    );

    return {
        ...source,
        items,
        totalItems: Math.max(
            0,
            Math.trunc(
                toNumber(source.totalItems, quantitySum)
            )
        ),
        totalAmount: Math.max(
            0,
            toNumber(source.totalAmount, calculatedTotal)
        )
    };
}

function notifyCartUpdated(cart = currentCart) {
    window.dispatchEvent(
        new CustomEvent("nexora:cart-updated", {
            detail: {
                cart
            }
        })
    );
}

function setCartPageState(state) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        empty: elements.empty,
        error: elements.error,
        auth: elements.auth
    };

    for (const [key, element] of Object.entries(sections)) {
        if (!element) {
            continue;
        }

        if (key === state) {
            showElement(element);
        } else {
            hideElement(element);
        }
    }

    if (elements.summary) {
        if (state === "content") {
            showElement(elements.summary);
        } else {
            hideElement(elements.summary);
        }
    }
}

function createMessageState(
    title,
    description,
    actionText = null,
    actionUrl = null
) {
    const wrapper = createElement(
        "div",
        "empty-state cart-dynamic-state"
    );

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

    wrapper.append(heading, paragraph);

    if (actionText && actionUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            actionText
        );

        link.href = actionUrl;
        wrapper.appendChild(link);
    }

    return wrapper;
}

function showFallbackState(
    title,
    description,
    actionText,
    actionUrl
) {
    const elements = getElements();
    const container = elements.items;

    if (!container) {
        return;
    }

    container.replaceChildren(
        createMessageState(
            title,
            description,
            actionText,
            actionUrl
        )
    );

    showElement(elements.content);
    hideElement(elements.summary);
}

function showEmptyCart() {
    const elements = getElements();

    setCartPageState("empty");

    if (!elements.empty) {
        showFallbackState(
            "Your cart is empty",
            "Себетің әзірге бос. Каталогтан өзіңе ұнайтын тауарларды таңда.",
            "Explore Products",
            "/pages/catalog.html"
        );
    }

    elements.items?.replaceChildren();

    if (!elements.empty && elements.items) {
        showFallbackState(
            "Your cart is empty",
            "Себетің әзірге бос. Каталогтан өзіңе ұнайтын тауарларды таңда.",
            "Explore Products",
            "/pages/catalog.html"
        );
    }

    updateSummary({
        items: [],
        totalItems: 0,
        totalAmount: 0
    });
}

function showAuthRequired() {
    const elements = getElements();

    setCartPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/cart.html"
    );

    if (elements.auth) {
        const loginLink = elements.auth.querySelector(
            'a[href*="login"], [data-cart-login]'
        );

        if (loginLink instanceof HTMLAnchorElement) {
            loginLink.href = loginUrl;
        }
    } else {
        showFallbackState(
            "Sign in to view your cart",
            "Себеттегі тауарларды көру үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showCartError(error) {
    const elements = getElements();
    const message = getErrorMessage(error);

    setCartPageState("error");

    if (elements.error) {
        const text = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(text, message);
    } else {
        showFallbackState(
            "Себетті жүктеу мүмкін болмады",
            message,
            "Каталогқа өту",
            "/pages/catalog.html"
        );
    }
}

function createProductImage(item) {
    const wrapper = createElement(
        "a",
        "cart-item-image"
    );

    wrapper.href =
        `/pages/product.html?id=${encodeURIComponent(item.productId)}`;

    wrapper.setAttribute(
        "aria-label",
        `${item.productName} тауарын қарау`
    );

    if (!item.imageUrl) {
        wrapper.appendChild(
            createIcon(PRODUCT_ICON)
        );

        return wrapper;
    }

    const image = document.createElement("img");

    image.src = item.imageUrl;
    image.alt = item.productName;
    image.loading = "lazy";

    image.addEventListener(
        "error",
        () => {
            wrapper.replaceChildren(
                createIcon(PRODUCT_ICON)
            );
        },
        { once: true }
    );

    wrapper.appendChild(image);

    return wrapper;
}

function createQuantityControls(item) {
    const controls = createElement(
        "div",
        "quantity-selector cart-quantity-selector"
    );

    const minus = createElement(
        "button",
        "quantity-btn cart-quantity-minus"
    );

    minus.type = "button";
    minus.dataset.cartAction = "decrease";
    minus.dataset.itemId = String(item.id);
    minus.setAttribute(
        "aria-label",
        `${item.productName} санын азайту`
    );

    minus.disabled = item.quantity <= 1;
    minus.appendChild(createIcon(MINUS_ICON));

    const input = document.createElement("input");

    input.type = "number";
    input.className =
        "quantity-input cart-quantity-input";

    input.value = String(item.quantity);
    input.min = "1";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.itemId = String(item.id);

    input.setAttribute(
        "aria-label",
        `${item.productName} саны`
    );

    const plus = createElement(
        "button",
        "quantity-btn cart-quantity-plus"
    );

    plus.type = "button";
    plus.dataset.cartAction = "increase";
    plus.dataset.itemId = String(item.id);
    plus.setAttribute(
        "aria-label",
        `${item.productName} санын арттыру`
    );

    plus.appendChild(createIcon(PLUS_ICON));

    controls.append(
        minus,
        input,
        plus
    );

    return controls;
}

function createCartItem(item) {
    const article = createElement(
        "article",
        "cart-item"
    );

    article.dataset.cartItemId = String(item.id);
    article.dataset.productId = String(item.productId);

    const image = createProductImage(item);

    const information = createElement(
        "div",
        "cart-item-info"
    );

    const heading = createElement(
        "h3",
        "cart-item-title"
    );

    const productLink = createElement(
        "a",
        "cart-item-name",
        item.productName
    );

    productLink.href =
        `/pages/product.html?id=${encodeURIComponent(item.productId)}`;

    heading.appendChild(productLink);

    const unitPrice = createElement(
        "span",
        "cart-item-unit-price",
        formatCurrency(item.unitPrice)
    );

    const details = createElement(
        "div",
        "cart-item-details"
    );

    details.append(
        heading,
        unitPrice
    );

    information.appendChild(details);

    const quantity = createQuantityControls(item);

    const subtotal = createElement(
        "strong",
        "cart-item-subtotal",
        formatCurrency(item.subtotal)
    );

    const removeButton = createElement(
        "button",
        "cart-item-remove"
    );

    removeButton.type = "button";
    removeButton.dataset.cartAction = "remove";
    removeButton.dataset.itemId = String(item.id);

    removeButton.setAttribute(
        "aria-label",
        `${item.productName} тауарын себеттен жою`
    );

    removeButton.appendChild(
        createIcon(TRASH_ICON)
    );

    const actions = createElement(
        "div",
        "cart-item-actions"
    );

    actions.append(
        quantity,
        subtotal,
        removeButton
    );

    article.append(
        image,
        information,
        actions
    );

    return article;
}

function updateSummary(cart) {
    const elements = getElements();

    setText(
        elements.subtotal,
        formatCurrency(cart.totalAmount)
    );

    setText(
        elements.total,
        formatCurrency(cart.totalAmount)
    );

    setText(
        elements.count,
        formatInteger(cart.totalItems)
    );

    setText(
        elements.summaryCount,
        formatInteger(cart.totalItems)
    );

    if (elements.checkoutButton) {
        const disabled = cart.items.length === 0;

        if ("disabled" in elements.checkoutButton) {
            elements.checkoutButton.disabled = disabled;
        }

        elements.checkoutButton.setAttribute(
            "aria-disabled",
            String(disabled)
        );

        if (elements.checkoutButton instanceof HTMLAnchorElement) {
            elements.checkoutButton.href = disabled
                ? "#"
                : "/pages/checkout.html";
        }
    }

    if (elements.clearButton) {
        elements.clearButton.disabled =
            cart.items.length === 0;
    }
}

function renderCart(cart) {
    const elements = getElements();

    currentCart = cart;

    if (cart.items.length === 0) {
        showEmptyCart();
        return;
    }

    if (!elements.items) {
        showError(
            "Себет элементтеріне арналған контейнер табылмады."
        );

        return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of cart.items) {
        fragment.appendChild(
            createCartItem(item)
        );
    }

    elements.items.replaceChildren(fragment);

    updateSummary(cart);
    setCartPageState("content");
}

function getItem(itemId) {
    if (!currentCart) {
        return null;
    }

    return currentCart.items.find(
        item => item.id === itemId
    ) ?? null;
}

async function loadCart(options = {}) {
    const {
        checkAuth = true
    } = options;

    const version = ++requestVersion;

    setCartPageState("loading");

    try {
        if (checkAuth) {
            const user = await getCurrentUser();

            if (
                !active ||
                version !== requestVersion
            ) {
                return;
            }

            if (!user) {
                currentCart = null;
                showAuthRequired();
                return;
            }
        }

        const response = await api.cart.get();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        renderCart(
            normalizeCart(response)
        );
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        if (isAuthenticationError(error)) {
            clearAuthState();
            currentCart = null;
            showAuthRequired();
            return;
        }

        showCartError(error);
    }
}

async function runCartMutation(action, successMessage) {
    if (isUpdating) {
        return false;
    }

    isUpdating = true;

    const elements = getElements();

    if (elements.items) {
        elements.items.setAttribute(
            "aria-busy",
            "true"
        );
    }

    try {
        await action();

        await loadCart({
            checkAuth: false
        });

        notifyCartUpdated();

        if (successMessage) {
            showSuccess(successMessage);
        }

        return true;
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            currentCart = null;
            showAuthRequired();
        } else {
            showError(getErrorMessage(error));
        }

        return false;
    } finally {
        isUpdating = false;

        elements.items?.removeAttribute(
            "aria-busy"
        );
    }
}

async function updateItemQuantity(itemId, quantity) {
    const item = getItem(itemId);

    if (!item) {
        return;
    }

    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1
    ) {
        showError(
            "Тауар саны 1 немесе одан үлкен болуы керек."
        );

        return;
    }

    if (quantity === item.quantity) {
        return;
    }

    await runCartMutation(
        () => api.cart.updateItem(
            itemId,
            quantity
        ),
        "Тауар саны жаңартылды."
    );
}

async function removeCartItem(itemId) {
    const item = getItem(itemId);

    if (!item) {
        return;
    }

    await runCartMutation(
        () => api.cart.removeItem(itemId),
        `${item.productName} себеттен жойылды.`
    );
}

async function clearCart() {
    if (
        !currentCart ||
        currentCart.items.length === 0
    ) {
        return;
    }

    const success = await runCartMutation(
        () => api.cart.clear(),
        "Себет тазаланды."
    );

    if (success) {
        const modal = getElements().modal;

        if (modal) {
            closeModal(modal);
        }
    }
}

function handleCartAction(event) {
    if (!(event.target instanceof Element)) {
        return;
    }

    const button = event.target.closest(
        "[data-cart-action]"
    );

    const container = getElements().items;

    if (
        !button ||
        !container?.contains(button) ||
        isUpdating
    ) {
        return;
    }

    event.preventDefault();

    const itemId = parsePositiveId(
        button.dataset.itemId
    );

    if (itemId === null) {
        return;
    }

    const item = getItem(itemId);

    if (!item) {
        return;
    }

    const action = button.dataset.cartAction;

    if (action === "increase") {
        updateItemQuantity(
            itemId,
            item.quantity + 1
        );
    }

    if (action === "decrease") {
        updateItemQuantity(
            itemId,
            item.quantity - 1
        );
    }

    if (action === "remove") {
        removeCartItem(itemId);
    }
}

function handleQuantityChange(event) {
    if (!(event.target instanceof HTMLInputElement)) {
        return;
    }

    const input = event.target;

    if (
        !input.classList.contains(
            "cart-quantity-input"
        )
    ) {
        return;
    }

    const container = getElements().items;

    if (!container?.contains(input)) {
        return;
    }

    const itemId = parsePositiveId(
        input.dataset.itemId
    );

    if (itemId === null) {
        return;
    }

    const quantity = Number(input.value);
    const item = getItem(itemId);

    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1
    ) {
        if (item) {
            input.value = String(item.quantity);
        }

        showError(
            "Тауар саны дұрыс енгізілмеген."
        );

        return;
    }

    updateItemQuantity(
        itemId,
        quantity
    );
}

function setupClearCart() {
    const elements = getElements();
    const signal = eventController.signal;

    if (elements.modal) {
        modalCleanup = setupModal(
            elements.modal,
            {
                closeButtons: [
                    "#clear-cart-modal-close",
                    "#cart-clear-modal-close",
                    "#cancel-clear-cart",
                    "#cart-clear-cancel",
                    "[data-close-clear-cart]"
                ]
            }
        );
    }

    elements.clearButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            if (
                !currentCart ||
                currentCart.items.length === 0
            ) {
                return;
            }

            if (elements.modal) {
                openModal(elements.modal);
            } else if (
                window.confirm(
                    "Себеттегі барлық тауарларды жоюды растайсың ба?"
                )
            ) {
                clearCart();
            }
        },
        { signal }
    );

    elements.confirmClear?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            clearCart();
        },
        { signal }
    );
}

function setupCheckout() {
    const button = getElements().checkoutButton;

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        event => {
            if (
                !currentCart ||
                currentCart.items.length === 0
            ) {
                event.preventDefault();
                showError(
                    "Тапсырыс беру үшін себетке тауар қос."
                );
                return;
            }

            if (button instanceof HTMLButtonElement) {
                event.preventDefault();

                window.location.assign(
                    "/pages/checkout.html"
                );
            }
        },
        {
            signal: eventController.signal
        }
    );
}

function setupCartEvents() {
    const signal = eventController.signal;

    document.addEventListener(
        "click",
        handleCartAction,
        { signal }
    );

    document.addEventListener(
        "change",
        handleQuantityChange,
        { signal }
    );

    setupClearCart();
    setupCheckout();
}

export async function initCart() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupCartEvents();

    await loadCart();
}

export function destroyCart() {
    active = false;
    initialized = false;
    requestVersion += 1;

    modalCleanup?.();
    eventController?.abort();

    modalCleanup = null;
    eventController = null;
    currentCart = null;
    isUpdating = false;
}

export const cart = {
    init: initCart,
    destroy: destroyCart,
    reload: loadCart,
    updateQuantity: updateItemQuantity,
    removeItem: removeCartItem,
    clear: clearCart,
    getCurrentCart() {
        return currentCart;
    }
};

export default cart;
