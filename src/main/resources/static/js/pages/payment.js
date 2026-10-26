
import api, {
    getErrorMessage,
    isAuthenticationError,
    isApiError
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
    getSafeImageUrl,
    parsePositiveId,
    setButtonLoading,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const PAYMENT_METHODS = new Set([
    "KASPI",
    "CARD",
    "PAYPAL"
]);

const PAID_STATUSES = new Set([
    "PAID",
    "SUCCESS",
    "COMPLETED",
    "SUCCEEDED"
]);

const PENDING_STATUSES = new Set([
    "PENDING",
    "PROCESSING"
]);

const SELECTORS = {
    loading: [
        "#payment-loading",
        "#payment-loading-state"
    ],
    content: [
        "#payment-content",
        "#payment-main-content"
    ],
    error: [
        "#payment-error",
        "#payment-error-state"
    ],
    auth: [
        "#payment-auth-required",
        "#payment-login-required"
    ],
    form: [
        "#payment-form",
        "[data-payment-form]"
    ],
    orderId: [
        "#payment-order-id",
        "#payment-order-number",
        "[data-payment-order-id]"
    ],
    orderTotal: [
        "#payment-order-total",
        "#payment-total",
        "#payment-total-amount",
        "[data-payment-total]"
    ],
    orderSubtotal: [
        "#payment-order-subtotal",
        "[data-payment-subtotal]"
    ],
    orderStatus: [
        "#payment-order-status",
        "[data-payment-order-status]"
    ],
    paymentStatus: [
        "#payment-status",
        "[data-payment-status]"
    ],
    itemsCount: [
        "#payment-items-count",
        "#payment-item-count",
        "[data-payment-items-count]"
    ],
    items: [
        "#payment-items",
        "#payment-order-items",
        "#payment-items-list",
        "[data-payment-items]"
    ],
    methodSelect: [
        "#payment-method",
        'select[name="paymentMethod"]',
        'select[name="method"]'
    ],
    submitButton: [
        "#payment-submit",
        "#payment-submit-button",
        "#pay-now-button",
        "#payment-pay-button",
        "[data-payment-submit]"
    ],
    statusMessage: [
        "#payment-status-message",
        "#payment-message",
        "[data-payment-message]"
    ],
    success: [
        "#payment-success",
        "#payment-success-state"
    ],
    paymentDetails: [
        "#payment-details",
        "[data-payment-details]"
    ],
    paymentId: [
        "#payment-id",
        "[data-payment-id]"
    ],
    paymentDate: [
        "#payment-date",
        "[data-payment-date]"
    ],
    paymentMethod: [
        "#payment-selected-method",
        "[data-payment-selected-method]"
    ],
    orderLink: [
        "#payment-view-order",
        "#payment-order-details-link",
        "[data-payment-order-link]"
    ],
    retryButton: [
        "#payment-retry",
        "[data-payment-retry]"
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;

let currentOrder = null;
let currentPayment = null;
let selectedMethod = null;
let submitting = false;

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

function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

function normalizeMethod(value) {
    const method = normalizeStatus(value);

    return PAYMENT_METHODS.has(method)
        ? method
        : null;
}

function getOrderId() {
    const params = new URLSearchParams(
        window.location.search
    );

    return parsePositiveId(
        params.get("orderId") ??
        params.get("id") ??
        document.body.dataset.orderId
    );
}

function getOrderDetailsUrl(orderId) {
    return (
        "/pages/order-details.html?id=" +
        encodeURIComponent(orderId)
    );
}

function normalizeOrder(response) {
    const order = response?.data?.order ??
        response?.data ??
        response?.order ??
        response;

    if (!order || typeof order !== "object") {
        return null;
    }

    const id = parsePositiveId(
        order.id ?? order.orderId
    );

    if (id === null) {
        return null;
    }

    const amount = Number(
        order.totalAmount ??
        order.totalPrice ??
        order.total ??
        order.finalAmount
    );

    return {
        ...order,
        id,
        totalAmount: Number.isFinite(amount)
            ? amount
            : null,
        status: normalizeStatus(
            order.status ?? order.orderStatus
        ),
        items: Array.isArray(order.items)
            ? order.items
            : []
    };
}

function normalizePayment(response) {
    const payment = response?.data?.payment ??
        response?.data ??
        response?.payment ??
        response;

    if (
        !payment ||
        typeof payment !== "object" ||
        Array.isArray(payment)
    ) {
        return null;
    }

    return {
        ...payment,
        id: parsePositiveId(
            payment.id ?? payment.paymentId
        ),
        orderId: parsePositiveId(
            payment.orderId ??
            payment.order?.id
        ),
        method: normalizeMethod(
            payment.method ??
            payment.paymentMethod
        ),
        status: normalizeStatus(
            payment.status ??
            payment.paymentStatus
        )
    };
}

function isPaymentPaid(payment) {
    return Boolean(
        payment &&
        PAID_STATUSES.has(payment.status)
    );
}

function isPaymentPending(payment) {
    return Boolean(
        payment &&
        PENDING_STATUSES.has(payment.status)
    );
}

function setPageState(state) {
    const elements = getElements();

    const sections = {
        loading: elements.loading,
        content: elements.content,
        error: elements.error,
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

function showFallbackMessage(
    title,
    description,
    buttonText,
    buttonUrl
) {
    let container = document.getElementById(
        "payment-dynamic-state"
    );

    if (!container) {
        container = createElement(
            "div",
            "empty-state payment-dynamic-state"
        );

        container.id = "payment-dynamic-state";

        const target = document.querySelector(
            ".payment-page, .payment-section, main"
        );

        target?.prepend(container);
    }

    if (!container) {
        showError(description);
        return;
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

    container.replaceChildren(
        heading,
        paragraph
    );

    if (buttonText && buttonUrl) {
        const link = createElement(
            "a",
            "btn btn-primary",
            buttonText
        );

        link.href = buttonUrl;
        container.appendChild(link);
    }

    showElement(container);
}

function showPaymentError(message) {
    const elements = getElements();

    setPageState("error");

    if (elements.error) {
        const description = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackMessage(
            "Payment unavailable",
            message,
            "My Orders",
            "/pages/orders.html"
        );
    }
}

function showAuthRequired() {
    const elements = getElements();

    currentOrder = null;
    currentPayment = null;

    setPageState("auth");

    const loginUrl = getLoginUrl(
        window.location.pathname +
        window.location.search
    );

    if (elements.auth) {
        const loginLink = elements.auth.querySelector(
            "a[href]"
        );

        if (loginLink) {
            loginLink.href = loginUrl;
        }
    } else {
        showFallbackMessage(
            "Sign in to continue",
            "Төлем жасау үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function createOrderItem(item) {
    const row = createElement(
        "div",
        "payment-summary-item"
    );

    const imageWrapper = createElement(
        "div",
        "payment-summary-item-image"
    );

    const imageUrl = getSafeImageUrl(
        item.imageUrl ??
        item.productImageUrl
    );

    const name = String(
        item.productName ??
        item.name ??
        item.product?.name ??
        "Product"
    );

    if (imageUrl) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = name;
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

    const quantity = Math.max(
        1,
        Number(item.quantity) || 1
    );

    const details = createElement(
        "div",
        "payment-summary-item-details"
    );

    const nameElement = createElement(
        "strong",
        "payment-summary-item-name",
        name
    );

    const quantityElement = createElement(
        "span",
        "payment-summary-item-quantity",
        `Qty: ${quantity}`
    );

    details.append(
        nameElement,
        quantityElement
    );

    const amount = Number(
        item.subtotal ??
        item.totalPrice ??
        (
            Number(item.unitPrice ?? item.price) *
            quantity
        )
    );

    const priceElement = createElement(
        "strong",
        "payment-summary-item-price",
        formatCurrency(amount)
    );

    row.append(
        imageWrapper,
        details,
        priceElement
    );

    return row;
}

function renderOrderItems(order) {
    const elements = getElements();

    if (!elements.items) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of order.items) {
        fragment.appendChild(
            createOrderItem(item)
        );
    }

    elements.items.replaceChildren(fragment);
}

function renderOrder(order) {
    const elements = getElements();

    setText(
        elements.orderId,
        `#${order.id}`
    );

    setText(
        elements.orderTotal,
        formatCurrency(order.totalAmount)
    );

    setText(
        elements.orderSubtotal,
        formatCurrency(order.totalAmount)
    );

    setText(
        elements.orderStatus,
        order.status || "UNKNOWN"
    );

    setText(
        elements.itemsCount,
        formatInteger(
            order.items.reduce(
                (total, item) =>
                    total + (Number(item.quantity) || 0),
                0
            )
        )
    );

    renderOrderItems(order);

    if (elements.orderLink instanceof HTMLAnchorElement) {
        elements.orderLink.href = getOrderDetailsUrl(
            order.id
        );
    }

    document.title =
        `Payment #${order.id} | NEXORA`;
}

function getMethodInputs() {
    return Array.from(
        document.querySelectorAll(
            'input[type="radio"][name="paymentMethod"], ' +
            'input[type="radio"][name="method"], ' +
            'input[type="radio"][name="payment-method"]'
        )
    );
}

function readSelectedMethod() {
    const inputs = getMethodInputs();

    const checkedInput = inputs.find(
        input => input.checked
    );

    if (checkedInput) {
        return normalizeMethod(
            checkedInput.value
        );
    }

    const select = getElements().methodSelect;

    if (select) {
        return normalizeMethod(
            select.value
        );
    }

    return selectedMethod;
}

function updateMethodSelection(method) {
    selectedMethod = normalizeMethod(method);

    const inputs = getMethodInputs();

    for (const input of inputs) {
        const selected =
            normalizeMethod(input.value) === selectedMethod;

        input.checked = selected;

        const card = input.closest(
            ".payment-method-card, .payment-method-option, .payment-option, [data-payment-method-card]"
        );

        if (card) {
            card.classList.toggle(
                "is-selected",
                selected
            );

            card.classList.toggle(
                "selected",
                selected
            );

            card.classList.toggle(
                "active",
                selected
            );
        }
    }

    const methodCards = document.querySelectorAll(
        "[data-payment-method]"
    );

    for (const card of methodCards) {
        const cardMethod = normalizeMethod(
            card.dataset.paymentMethod
        );

        const selected =
            cardMethod === selectedMethod;

        card.classList.toggle(
            "is-selected",
            selected
        );

        card.classList.toggle(
            "selected",
            selected
        );

        card.setAttribute(
            "aria-pressed",
            String(selected)
        );
    }

    const select = getElements().methodSelect;

    if (
        select &&
        selectedMethod &&
        Array.from(select.options).some(
            option =>
                normalizeMethod(option.value) === selectedMethod
        )
    ) {
        const option = Array.from(
            select.options
        ).find(
            item =>
                normalizeMethod(item.value) === selectedMethod
        );

        select.value = option.value;
    }
}

function setPaymentMessage(message, type = "info") {
    const element = getElements().statusMessage;

    if (!element) {
        return;
    }

    element.textContent = message;

    element.classList.remove(
        "is-success",
        "is-error",
        "is-warning",
        "is-info"
    );

    element.classList.add(
        `is-${type}`
    );

    showElement(element);
}

function updatePaymentButton() {
    const button = getElements().submitButton;

    if (!button) {
        return;
    }

    const completed = isPaymentPaid(currentPayment);
    const pending = isPaymentPending(currentPayment);

    const cancelled =
        currentOrder?.status === "CANCELLED";

    const disabled =
        submitting ||
        completed ||
        pending ||
        cancelled;

    if ("disabled" in button) {
        button.disabled = disabled;
    }

    button.setAttribute(
        "aria-disabled",
        String(disabled)
    );

    if (completed) {
        button.textContent = "Payment Completed";
    } else if (pending) {
        button.textContent = "Payment Pending";
    } else if (cancelled) {
        button.textContent = "Order Cancelled";
    }
}

function renderPaymentDetails(payment) {
    const elements = getElements();

    if (!payment) {
        hideElement(elements.paymentDetails);
        hideElement(elements.success);

        setText(
            elements.paymentStatus,
            "NOT PAID"
        );

        return;
    }

    setText(
        elements.paymentStatus,
        payment.status || "UNKNOWN"
    );

    setText(
        elements.paymentId,
        payment.id !== null
            ? `#${payment.id}`
            : "—"
    );

    setText(
        elements.paymentMethod,
        payment.method || "—"
    );

    setText(
        elements.paymentDate,
        formatDateTime(
            payment.createdAt ??
            payment.paidAt ??
            payment.paymentDate
        )
    );

    showElement(elements.paymentDetails);

    if (payment.method) {
        updateMethodSelection(payment.method);
    }

    if (isPaymentPaid(payment)) {
        showElement(elements.success);

        setPaymentMessage(
            "Төлем серверде сәтті орындалған деп тіркелді.",
            "success"
        );
    } else if (isPaymentPending(payment)) {
        hideElement(elements.success);

        setPaymentMessage(
            "Төлем өңделуде. Қайта төлем жасамас бұрын оның статусын тексер.",
            "warning"
        );
    } else if (payment.status === "FAILED") {
        hideElement(elements.success);

        setPaymentMessage(
            "Алдыңғы төлем сәтсіз аяқталды. Қайта төлем жасауға болады.",
            "error"
        );
    } else {
        hideElement(elements.success);

        setPaymentMessage(
            `Төлем статусы: ${payment.status || "UNKNOWN"}`,
            "info"
        );
    }
}

async function getExistingPayment(orderId) {
    try {
        const response = await api.payments.getByOrder(
            orderId
        );

        return normalizePayment(response);
    } catch (error) {
        if (
            isApiError(error) &&
            error.status === 404
        ) {
            return null;
        }

        throw error;
    }
}

async function loadPayment() {
    const orderId = getOrderId();
    const version = ++requestVersion;

    if (orderId === null) {
        showPaymentError(
            "Төлем жасау үшін тапсырыстың ID нөмірі қажет."
        );

        return;
    }

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

        const orderResponse = await api.orders.getById(
            orderId
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const order = normalizeOrder(orderResponse);

        if (!order) {
            throw new Error(
                "Тапсырыс мәліметтері дұрыс алынбады."
            );
        }

        const payment = await getExistingPayment(
            orderId
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        currentOrder = order;
        currentPayment = payment;

        renderOrder(order);
        renderPaymentDetails(payment);
        updatePaymentButton();

        setPageState("content");

        if (
            order.status === "CANCELLED" &&
            !isPaymentPaid(payment)
        ) {
            setPaymentMessage(
                "Бұл тапсырыс жойылған. Оған төлем жасау мүмкін емес.",
                "error"
            );
        }
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

        showPaymentError(
            getErrorMessage(error)
        );
    }
}

async function handlePaymentSubmit(event) {
    event?.preventDefault();

    if (submitting || !currentOrder) {
        return;
    }

    if (currentOrder.status === "CANCELLED") {
        showError(
            "Жойылған тапсырысқа төлем жасау мүмкін емес."
        );

        return;
    }

    if (isPaymentPaid(currentPayment)) {
        showInfo(
            "Бұл тапсырыстың төлемі бұрын орындалған."
        );

        return;
    }

    if (isPaymentPending(currentPayment)) {
        showInfo(
            "Төлем өңделуде. Алдымен оның нәтижесін тексер."
        );

        return;
    }

    const method = readSelectedMethod();

    if (!method) {
        showError(
            "Төлем әдісін таңда: Kaspi, Card немесе PayPal."
        );

        return;
    }

    const button = getElements().submitButton;

    submitting = true;

    if (button instanceof HTMLButtonElement) {
        setButtonLoading(
            button,
            true,
            "Processing Payment..."
        );
    }

    try {
        const response = await api.payments.create(
            currentOrder.id,
            method
        );

        let payment = normalizePayment(response);

        if (!payment || !payment.status) {
            payment = await getExistingPayment(
                currentOrder.id
            );
        }

        if (!payment) {
            throw new Error(
                "Төлем сұранысы жіберілді, бірақ нәтижесін растау мүмкін болмады. Қайта төлем жасамай, тапсырыс мәліметтерін тексер."
            );
        }

        currentPayment = payment;

        renderPaymentDetails(payment);

        if (isPaymentPaid(payment)) {
            showSuccess(
                "Төлем сәтті орындалды!"
            );
        } else if (isPaymentPending(payment)) {
            showInfo(
                "Төлем сұранысы қабылданды. Нәтижесі әлі өңделуде."
            );
        } else if (payment.status === "FAILED") {
            showError(
                "Төлем сәтсіз аяқталды."
            );
        } else {
            showInfo(
                `Төлем статусы: ${payment.status}`
            );
        }

        window.dispatchEvent(
            new CustomEvent("nexora:payment-updated", {
                detail: {
                    orderId: currentOrder.id,
                    payment
                }
            })
        );
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        const message = getErrorMessage(error);

        setPaymentMessage(
            message,
            "error"
        );

        showError(message);
    } finally {
        submitting = false;

        if (button instanceof HTMLButtonElement) {
            setButtonLoading(button, false);
        }

        updatePaymentButton();
    }
}

function setupPaymentMethods() {
    const signal = eventController.signal;

    const inputs = getMethodInputs();

    for (const input of inputs) {
        input.addEventListener(
            "change",
            () => {
                if (input.checked) {
                    updateMethodSelection(
                        input.value
                    );
                }
            },
            { signal }
        );
    }

    const select = getElements().methodSelect;

    select?.addEventListener(
        "change",
        event => {
            updateMethodSelection(
                event.target.value
            );
        },
        { signal }
    );

    document.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const card = event.target.closest(
                "[data-payment-method]"
            );

            if (!card) {
                return;
            }

            const method = normalizeMethod(
                card.dataset.paymentMethod
            );

            if (!method) {
                return;
            }

            updateMethodSelection(method);
        },
        { signal }
    );

    const initialMethod = readSelectedMethod();

    if (initialMethod) {
        updateMethodSelection(initialMethod);
    }
}

function setupPaymentForm() {
    const elements = getElements();
    const signal = eventController.signal;

    if (elements.form) {
        elements.form.addEventListener(
            "submit",
            handlePaymentSubmit,
            { signal }
        );
    }

    if (
        elements.submitButton &&
        (
            !elements.form ||
            !elements.form.contains(elements.submitButton)
        )
    ) {
        elements.submitButton.addEventListener(
            "click",
            handlePaymentSubmit,
            { signal }
        );
    }

    elements.retryButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            loadPayment();
        },
        { signal }
    );
}

export async function initPayment() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupPaymentMethods();
    setupPaymentForm();

    await loadPayment();
}

export function destroyPayment() {
    active = false;
    initialized = false;
    submitting = false;

    requestVersion += 1;

    eventController?.abort();
    eventController = null;

    currentOrder = null;
    currentPayment = null;
    selectedMethod = null;
}

export const payment = {
    init: initPayment,
    destroy: destroyPayment,
    reload: loadPayment,
    submit: handlePaymentSubmit,
    getCurrentOrder() {
        return currentOrder;
    },
    getCurrentPayment() {
        return currentPayment;
    },
    getSelectedMethod() {
        return selectedMethod;
    }
};

export default payment;
