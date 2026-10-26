
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
    setButtonLoading,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const SELECTORS = {
    form: [
        "#checkout-form",
        "[data-checkout-form]"
    ],
    loading: [
        "#checkout-loading",
        "#checkout-loading-state"
    ],
    content: [
        "#checkout-content",
        "#checkout-main-content"
    ],
    error: [
        "#checkout-error",
        "#checkout-error-state"
    ],
    empty: [
        "#checkout-empty",
        "#checkout-empty-state"
    ],
    auth: [
        "#checkout-auth-required",
        "#checkout-login-required"
    ],
    shippingAddress: [
        "#shipping-address",
        "#checkout-shipping-address",
        '[name="shippingAddress"]'
    ],
    promotionCode: [
        "#promotion-code",
        "#checkout-promotion-code",
        '[name="promotionCode"]'
    ],
    giftWrapping: [
        "#gift-wrapping",
        "#checkout-gift-wrapping",
        '[name="giftWrapping"]'
    ],
    expressDelivery: [
        "#express-delivery",
        "#checkout-express-delivery",
        '[name="expressDelivery"]'
    ],
    extendedWarranty: [
        "#extended-warranty",
        "#checkout-extended-warranty",
        '[name="extendedWarranty"]'
    ],
    items: [
        "#checkout-items",
        "#checkout-items-list",
        "#checkout-order-items",
        "[data-checkout-items]"
    ],
    itemCount: [
        "#checkout-items-count",
        "#checkout-item-count",
        "[data-checkout-item-count]"
    ],
    subtotal: [
        "#checkout-subtotal",
        "[data-checkout-subtotal]"
    ],
    total: [
        "#checkout-total",
        "#checkout-total-amount",
        "[data-checkout-total]"
    ],
    submitButton: [
        "#checkout-submit",
        "#checkout-submit-button",
        "#place-order-button",
        '[data-checkout-submit]'
    ],
    promotionApply: [
        "#checkout-apply-promotion",
        "#apply-promotion-button",
        "[data-apply-promotion]"
    ],
    promotionMessage: [
        "#checkout-promotion-message",
        "[data-promotion-message]"
    ],
    formError: [
        "#checkout-form-error",
        "[data-checkout-form-error]"
    ]
};

let initialized = false;
let active = false;
let submitting = false;
let requestVersion = 0;
let eventController = null;
let currentCart = null;

function findElement(selectors, root = document) {
    for (const selector of selectors) {
        const element = root.querySelector(selector);

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

function normalizeCartItem(item) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const productId = parsePositiveId(item.productId);

    if (productId === null) {
        return null;
    }

    const quantity = Math.max(
        1,
        Math.trunc(Number(item.quantity) || 1)
    );

    const unitPrice = Math.max(
        0,
        Number(item.unitPrice ?? item.price) || 0
    );

    const subtotal = Math.max(
        0,
        Number(item.subtotal ?? unitPrice * quantity) || 0
    );

    return {
        productId,
        productName: String(
            item.productName ?? "Product"
        ),
        imageUrl: getSafeImageUrl(item.imageUrl),
        quantity,
        unitPrice,
        subtotal
    };
}

function normalizeCart(response) {
    const data = response?.data?.items
        ? response.data
        : response;

    const items = Array.isArray(data?.items)
        ? data.items.map(normalizeCartItem).filter(Boolean)
        : [];

    const calculatedQuantity = items.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    const calculatedTotal = items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    const reportedQuantity = Number(data?.totalItems);
    const reportedTotal = Number(data?.totalAmount);

    return {
        items,
        totalItems:
            Number.isFinite(reportedQuantity) &&
            reportedQuantity >= 0
                ? reportedQuantity
                : calculatedQuantity,
        totalAmount:
            Number.isFinite(reportedTotal) &&
            reportedTotal >= 0
                ? reportedTotal
                : calculatedTotal
    };
}

function setPageState(state) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        error: elements.error,
        empty: elements.empty,
        auth: elements.auth
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

function createStateMessage(
    title,
    description,
    buttonText,
    buttonUrl
) {
    const wrapper = createElement(
        "div",
        "empty-state checkout-dynamic-state"
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

    if (buttonText && buttonUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            buttonText
        );

        link.href = buttonUrl;
        wrapper.appendChild(link);
    }

    return wrapper;
}

function showFallbackMessage(
    title,
    description,
    buttonText,
    buttonUrl
) {
    const elements = getElements();

    const target = elements.content ??
        elements.form?.parentElement ??
        document.querySelector("main");

    if (!target) {
        showError(description);
        return;
    }

    let message = document.getElementById(
        "checkout-dynamic-state"
    );

    if (!message) {
        message = createElement(
            "div",
            "",
            null
        );

        message.id = "checkout-dynamic-state";
        target.prepend(message);
    }

    message.replaceChildren(
        createStateMessage(
            title,
            description,
            buttonText,
            buttonUrl
        )
    );

    showElement(message);

    if (elements.form) {
        hideElement(elements.form);
    }

    showElement(elements.content);
}

function showAuthRequired() {
    const elements = getElements();

    currentCart = null;

    setPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/checkout.html"
    );

    if (elements.auth) {
        const link = elements.auth.querySelector(
            "a[href]"
        );

        if (link) {
            link.href = loginUrl;
        }
    } else {
        showFallbackMessage(
            "Sign in to checkout",
            "Тапсырысты рәсімдеу үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showEmptyCart() {
    const elements = getElements();

    setPageState("empty");

    if (!elements.empty) {
        showFallbackMessage(
            "Your cart is empty",
            "Тапсырыс рәсімдеу үшін алдымен себетке тауар қос.",
            "Explore Products",
            "/pages/catalog.html"
        );
    }
}

function showCheckoutError(error) {
    const elements = getElements();
    const message = getErrorMessage(error);

    setPageState("error");

    if (elements.error) {
        const description = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackMessage(
            "Checkout unavailable",
            message,
            "Back to Cart",
            "/pages/cart.html"
        );
    }
}

function renderCheckoutItem(item) {
    const wrapper = createElement(
        "div",
        "checkout-summary-item"
    );

    const imageWrapper = createElement(
        "div",
        "checkout-summary-item-image"
    );

    if (item.imageUrl) {
        const image = document.createElement("img");

        image.src = item.imageUrl;
        image.alt = item.productName;
        image.loading = "lazy";

        image.addEventListener(
            "error",
            () => {
                imageWrapper.textContent = "N";
            },
            { once: true }
        );

        imageWrapper.appendChild(image);
    } else {
        imageWrapper.textContent = "N";
    }

    const details = createElement(
        "div",
        "checkout-summary-item-details"
    );

    const name = createElement(
        "a",
        "checkout-summary-item-name",
        item.productName
    );

    name.href =
        `/pages/product.html?id=${encodeURIComponent(item.productId)}`;

    const quantity = createElement(
        "span",
        "checkout-summary-item-quantity",
        `Qty: ${item.quantity}`
    );

    details.append(name, quantity);

    const price = createElement(
        "strong",
        "checkout-summary-item-price",
        formatCurrency(item.subtotal)
    );

    wrapper.append(
        imageWrapper,
        details,
        price
    );

    return wrapper;
}

function renderOrderSummary(cart) {
    const elements = getElements();

    if (elements.items) {
        const fragment = document.createDocumentFragment();

        for (const item of cart.items) {
            fragment.appendChild(
                renderCheckoutItem(item)
            );
        }

        elements.items.replaceChildren(fragment);
    }

    setText(
        elements.itemCount,
        formatInteger(cart.totalItems)
    );

    setText(
        elements.subtotal,
        formatCurrency(cart.totalAmount)
    );

    setText(
        elements.total,
        formatCurrency(cart.totalAmount)
    );
}

function getInput(selectors) {
    const form = getElements().form;

    if (form) {
        const field = findElement(selectors, form);

        if (field) {
            return field;
        }
    }

    return findElement(selectors);
}

function readCheckbox(selectors) {
    const element = getInput(selectors);

    return element instanceof HTMLInputElement
        ? element.checked
        : false;
}

function getCheckoutData() {
    const address = getInput(
        SELECTORS.shippingAddress
    );

    const promotion = getInput(
        SELECTORS.promotionCode
    );

    return {
        shippingAddress: String(
            address?.value ?? ""
        ).trim(),
        promotionCode: String(
            promotion?.value ?? ""
        ).trim() || null,
        giftWrapping: readCheckbox(
            SELECTORS.giftWrapping
        ),
        expressDelivery: readCheckbox(
            SELECTORS.expressDelivery
        ),
        extendedWarranty: readCheckbox(
            SELECTORS.extendedWarranty
        )
    };
}

function clearValidationErrors() {
    const elements = getElements();

    hideElement(elements.formError);

    for (const selectors of [
        SELECTORS.shippingAddress,
        SELECTORS.promotionCode
    ]) {
        const field = getInput(selectors);

        field?.removeAttribute("aria-invalid");
        field?.classList.remove("is-invalid");
    }
}

function showValidationError(message, field = null) {
    const elements = getElements();

    if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("is-invalid");
        field.focus();
    }

    if (elements.formError) {
        setText(elements.formError, message);
        showElement(elements.formError);
    } else {
        showError(message);
    }
}

function validateCheckout(data) {
    clearValidationErrors();

    if (!currentCart || currentCart.items.length === 0) {
        showValidationError(
            "Себетте кемінде бір тауар болуы керек."
        );

        return false;
    }

    if (!data.shippingAddress) {
        showValidationError(
            "Жеткізу мекенжайын енгіз.",
            getInput(SELECTORS.shippingAddress)
        );

        return false;
    }

    return true;
}

function extractOrderId(response) {
    if (response === null || response === undefined) {
        return null;
    }

    if (
        typeof response === "number" ||
        typeof response === "string"
    ) {
        return parsePositiveId(response);
    }

    const order = response.order ??
        response.data?.order ??
        response.data ??
        response;

    return parsePositiveId(
        order.id ?? order.orderId
    );
}

function getPaymentUrl(orderId) {
    const url = new URL(
        "/pages/payment.html",
        window.location.origin
    );

    url.searchParams.set(
        "orderId",
        String(orderId)
    );

    return `${url.pathname}${url.search}`;
}

async function handleCheckoutSubmit(event) {
    event.preventDefault();

    if (submitting) {
        return;
    }

    const data = getCheckoutData();

    if (!validateCheckout(data)) {
        return;
    }

    const button = getElements().submitButton;

    submitting = true;

    if (button instanceof HTMLButtonElement) {
        setButtonLoading(
            button,
            true,
            "Placing Order..."
        );
    }

    try {
        const response = await api.orders.checkout(data);

        const orderId = extractOrderId(response);

        if (orderId === null) {
            throw new Error(
                "Тапсырыс серверде жасалған болуы мүмкін, бірақ оның ID нөмірі алынбады. Қайталап тапсырыс бермей, My Orders бөлімін тексер."
            );
        }

        window.dispatchEvent(
            new CustomEvent("nexora:cart-updated")
        );

        showSuccess(
            "Тапсырыс сәтті рәсімделді!"
        );

        window.location.assign(
            getPaymentUrl(orderId)
        );
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        showValidationError(
            getErrorMessage(error)
        );
    } finally {
        submitting = false;

        if (button instanceof HTMLButtonElement) {
            setButtonLoading(button, false);
        }
    }
}

function setupPromotionCode() {
    const elements = getElements();

    elements.promotionApply?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            const input = getInput(
                SELECTORS.promotionCode
            );

            const code = String(
                input?.value ?? ""
            ).trim();

            if (!code) {
                showError(
                    "Промокодты енгіз."
                );

                return;
            }

            const message =
                "Промокод тапсырысты рәсімдеу кезінде серверде тексеріледі.";

            if (elements.promotionMessage) {
                setText(
                    elements.promotionMessage,
                    message
                );

                showElement(
                    elements.promotionMessage
                );
            }
        },
        {
            signal: eventController.signal
        }
    );
}

function setupExtraOptions() {
    const selectors = [
        SELECTORS.giftWrapping,
        SELECTORS.expressDelivery,
        SELECTORS.extendedWarranty
    ];

    for (const selector of selectors) {
        const checkbox = getInput(selector);

        checkbox?.addEventListener(
            "change",
            () => {
                const message = document.querySelector(
                    "#checkout-extras-note, [data-checkout-extras-note]"
                );

                if (message) {
                    message.textContent =
                        "Қосымша қызметтердің нақты құны мен жеңілдіктер тапсырысты рәсімдеген кезде серверде есептеледі.";
                }
            },
            {
                signal: eventController.signal
            }
        );
    }
}

function setupCheckoutForm() {
    const elements = getElements();
    const form = elements.form;

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        handleCheckoutSubmit,
        {
            signal: eventController.signal
        }
    );

    if (
        elements.submitButton &&
        !form.contains(elements.submitButton)
    ) {
        elements.submitButton.addEventListener(
            "click",
            event => {
                event.preventDefault();
                form.requestSubmit();
            },
            {
                signal: eventController.signal
            }
        );
    }

    const address = getInput(
        SELECTORS.shippingAddress
    );

    address?.addEventListener(
        "input",
        () => {
            address.removeAttribute("aria-invalid");
            address.classList.remove("is-invalid");

            hideElement(elements.formError);
        },
        {
            signal: eventController.signal
        }
    );

    setupPromotionCode();
    setupExtraOptions();
}

async function loadCheckout() {
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

        const response = await api.cart.get();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const cart = normalizeCart(response);

        currentCart = cart;

        if (cart.items.length === 0) {
            showEmptyCart();
            return;
        }

        renderOrderSummary(cart);
        setPageState("content");
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

        showCheckoutError(error);
    }
}

export async function initCheckout() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupCheckoutForm();

    await loadCheckout();
}

export function destroyCheckout() {
    active = false;
    initialized = false;
    submitting = false;

    requestVersion += 1;

    eventController?.abort();
    eventController = null;

    currentCart = null;
}

export const checkout = {
    init: initCheckout,
    destroy: destroyCheckout,
    reload: loadCheckout,
    getCurrentCart() {
        return currentCart;
    },
    getCheckoutData
};

export default checkout;
