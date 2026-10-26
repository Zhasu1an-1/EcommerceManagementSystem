
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
    normalizeStatus,
    showElement,
    hideElement,
    openModal,
    closeModal,
    setupModal,
    setButtonLoading
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const ORDER_STEPS = [
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED"
];

const STATUS_LABELS = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
};

const PAYMENT_STATUS_LABELS = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    PAID: "Paid",
    SUCCESS: "Success",
    COMPLETED: "Completed",
    FAILED: "Failed",
    REFUNDED: "Refunded"
};

const PAID_STATUSES = new Set([
    "PAID",
    "SUCCESS",
    "COMPLETED",
    "SUCCEEDED"
]);

const SELECTORS = {
    loading: [
        "#order-details-loading",
        "#order-loading"
    ],
    content: [
        "#order-details-content",
        "#order-content"
    ],
    error: [
        "#order-details-error",
        "#order-error"
    ],
    auth: [
        "#order-details-auth-required",
        "#order-details-login-required"
    ],
    orderNumber: [
        "#order-details-number",
        "#order-details-order-number",
        "#order-number",
        "[data-order-number]"
    ],
    orderDate: [
        "#order-details-date",
        "#order-date",
        "[data-order-date]"
    ],
    status: [
        "#order-details-status",
        "#order-status",
        "[data-order-status]"
    ],
    statusDescription: [
        "#order-details-status-description",
        "[data-order-status-description]"
    ],
    timeline: [
        "#order-details-timeline",
        "#order-status-timeline",
        "[data-order-timeline]"
    ],
    items: [
        "#order-details-items",
        "#order-items-list",
        "[data-order-items]"
    ],
    itemCount: [
        "#order-details-items-count",
        "#order-items-count",
        "[data-order-item-count]"
    ],
    shippingAddress: [
        "#order-details-shipping-address",
        "#order-shipping-address",
        "[data-order-shipping-address]"
    ],
    subtotal: [
        "#order-details-subtotal",
        "#order-subtotal",
        "[data-order-subtotal]"
    ],
    shippingFee: [
        "#order-details-shipping-fee",
        "#order-shipping-fee",
        "[data-order-shipping-fee]"
    ],
    discount: [
        "#order-details-discount",
        "#order-discount",
        "[data-order-discount]"
    ],
    total: [
        "#order-details-total",
        "#order-total",
        "[data-order-total]"
    ],
    promotion: [
        "#order-details-promotion",
        "#order-promotion-code",
        "[data-order-promotion]"
    ],
    extras: [
        "#order-details-extras",
        "#order-extras",
        "[data-order-extras]"
    ],
    paymentStatus: [
        "#order-details-payment-status",
        "#order-payment-status",
        "[data-order-payment-status]"
    ],
    paymentMethod: [
        "#order-details-payment-method",
        "#order-payment-method",
        "[data-order-payment-method]"
    ],
    paymentId: [
        "#order-details-payment-id",
        "[data-order-payment-id]"
    ],
    paymentDate: [
        "#order-details-payment-date",
        "[data-order-payment-date]"
    ],
    payButton: [
        "#order-details-pay-button",
        "#order-pay-button",
        "[data-order-pay]"
    ],
    cancelButton: [
        "#order-details-cancel-button",
        "#cancel-order-button",
        "[data-order-cancel]"
    ],
    cancelModal: [
        "#order-cancel-modal",
        "#cancel-order-modal",
        "#order-details-cancel-modal"
    ],
    confirmCancel: [
        "#order-cancel-confirm",
        "#confirm-cancel-order",
        "[data-confirm-order-cancel]"
    ],
    cancelMessage: [
        "#order-cancel-error",
        "[data-order-cancel-error]"
    ],
    refresh: [
        "#order-details-refresh",
        "[data-order-refresh]"
    ]
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let modalCleanup = null;

let currentOrder = null;
let currentPayment = null;
let cancelling = false;

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
        element.textContent = String(value ?? "—");
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

function getOrderId() {
    const params = new URLSearchParams(
        window.location.search
    );

    return parsePositiveId(
        params.get("id") ??
        params.get("orderId") ??
        document.body.dataset.orderId
    );
}

function toAmount(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const amount = Number(value);

    return Number.isFinite(amount)
        ? amount
        : null;
}

function normalizeOrderItem(item) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const quantity = Math.max(
        1,
        Math.trunc(Number(item.quantity) || 1)
    );

    const unitPrice = toAmount(
        item.unitPrice ??
        item.price ??
        item.productPrice
    );

    const subtotal = toAmount(
        item.subtotal ??
        item.totalPrice ??
        item.totalAmount
    );

    return {
        ...item,
        productId: parsePositiveId(
            item.productId ??
            item.product?.id
        ),
        productName: String(
            item.productName ??
            item.name ??
            item.product?.name ??
            "Product"
        ),
        imageUrl: getSafeImageUrl(
            item.imageUrl ??
            item.productImageUrl ??
            item.product?.imageUrl
        ),
        quantity,
        unitPrice,
        subtotal: subtotal ??
            (
                unitPrice !== null
                    ? unitPrice * quantity
                    : null
            )
    };
}

function normalizeOrder(response) {
    const order = response?.data?.order ??
        response?.data ??
        response?.order ??
        response;

    if (
        !order ||
        typeof order !== "object"
    ) {
        return null;
    }

    const id = parsePositiveId(
        order.id ?? order.orderId
    );

    if (id === null) {
        return null;
    }

    const rawItems = Array.isArray(order.items)
        ? order.items
        : Array.isArray(order.orderItems)
            ? order.orderItems
            : [];

    return {
        ...order,
        id,
        status: normalizeStatus(
            order.status ??
            order.orderStatus
        ),
        createdAt:
            order.createdAt ??
            order.orderDate ??
            order.createdDate ??
            null,
        shippingAddress:
            order.shippingAddress ??
            order.deliveryAddress ??
            null,
        totalAmount: toAmount(
            order.totalAmount ??
            order.totalPrice ??
            order.finalAmount ??
            order.total
        ),
        subtotalAmount: toAmount(
            order.subtotalAmount ??
            order.subtotal ??
            order.itemsTotal
        ),
        shippingFee: toAmount(
            order.shippingFee ??
            order.deliveryFee ??
            order.shippingCost
        ),
        discountAmount: toAmount(
            order.discountAmount ??
            order.discount
        ),
        promotionCode:
            order.promotionCode ??
            order.promoCode ??
            null,
        items: rawItems
            .map(normalizeOrderItem)
            .filter(Boolean)
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
        status: normalizeStatus(
            payment.status ??
            payment.paymentStatus
        ),
        method: String(
            payment.method ??
            payment.paymentMethod ??
            ""
        ).toUpperCase(),
        createdAt:
            payment.createdAt ??
            payment.paymentDate ??
            payment.paidAt ??
            null
    };
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

function showFallbackState(
    title,
    description,
    linkText,
    linkUrl
) {
    let container = document.getElementById(
        "order-details-dynamic-state"
    );

    if (!container) {
        container = createElement(
            "div",
            "empty-state order-details-dynamic-state"
        );

        container.id = "order-details-dynamic-state";

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

    container.replaceChildren(
        heading,
        paragraph
    );

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
    hideElement("#order-details-dynamic-state");
}

function showAuthRequired() {
    const elements = getElements();

    setPageState("auth");

    const loginUrl = getLoginUrl(
        window.location.pathname +
        window.location.search
    );

    if (elements.auth) {
        const link = elements.auth.querySelector(
            "a[href]"
        );

        if (link) {
            link.href = loginUrl;
        }
    } else {
        showFallbackState(
            "Sign in to view order",
            "Тапсырыс мәліметтерін көру үшін аккаунтыңа кір.",
            "Sign In",
            loginUrl
        );
    }
}

function showOrderError(message) {
    const elements = getElements();

    setPageState("error");

    if (elements.error) {
        const description = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(description, message);
    } else {
        showFallbackState(
            "Order unavailable",
            message,
            "My Orders",
            "/pages/orders.html"
        );
    }
}

function createStatusBadge(status, type = "order") {
    const value = normalizeStatus(status);

    const label = type === "payment"
        ? PAYMENT_STATUS_LABELS[value] ?? value
        : STATUS_LABELS[value] ?? value;

    let variant = "neutral";

    if (
        value === "DELIVERED" ||
        value === "PAID" ||
        value === "SUCCESS" ||
        value === "COMPLETED" ||
        value === "SENT"
    ) {
        variant = "success";
    } else if (
        value === "PENDING" ||
        value === "PROCESSING"
    ) {
        variant = "warning";
    } else if (
        value === "CANCELLED" ||
        value === "FAILED"
    ) {
        variant = "danger";
    } else if (
        value === "CONFIRMED" ||
        value === "SHIPPED"
    ) {
        variant = "primary";
    }

    return createElement(
        "span",
        `badge badge-${variant}`,
        label || "Unknown"
    );
}

function renderStatus(element, status, type = "order") {
    if (!element) {
        return;
    }

    element.replaceChildren(
        createStatusBadge(status, type)
    );
}

function renderTimeline(order) {
    const container = getElements().timeline;

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    const currentIndex = ORDER_STEPS.indexOf(
        order.status
    );

    const cancelled = order.status === "CANCELLED";

    for (let index = 0; index < ORDER_STEPS.length; index++) {
        const step = ORDER_STEPS[index];

        const completed =
            !cancelled &&
            currentIndex >= index;

        const current =
            !cancelled &&
            currentIndex === index;

        const item = createElement(
            "div",
            "order-timeline-step"
        );

        item.dataset.status = step;

        if (completed) {
            item.classList.add(
                "is-completed",
                "completed"
            );
        }

        if (current) {
            item.classList.add(
                "is-current",
                "active"
            );
            item.setAttribute(
                "aria-current",
                "step"
            );
        }

        const marker = createElement(
            "span",
            "order-timeline-marker"
        );

        marker.textContent = completed
            ? "✓"
            : String(index + 1);

        const content = createElement(
            "div",
            "order-timeline-content"
        );

        const title = createElement(
            "strong",
            "order-timeline-title",
            STATUS_LABELS[step]
        );

        const description = createElement(
            "span",
            "order-timeline-description",
            completed ? "Completed" : "Awaiting"
        );

        content.append(title, description);
        item.append(marker, content);
        fragment.appendChild(item);
    }

    if (cancelled) {
        const item = createElement(
            "div",
            "order-timeline-step is-cancelled"
        );

        const marker = createElement(
            "span",
            "order-timeline-marker",
            "×"
        );

        const content = createElement(
            "div",
            "order-timeline-content"
        );

        content.appendChild(
            createElement(
                "strong",
                "order-timeline-title",
                "Cancelled"
            )
        );

        content.appendChild(
            createElement(
                "span",
                "order-timeline-description",
                "This order has been cancelled"
            )
        );

        item.append(marker, content);
        fragment.appendChild(item);
    }

    container.replaceChildren(fragment);
}

function createOrderItem(item) {
    const row = createElement(
        "article",
        "order-details-item"
    );

    const imageWrapper = createElement(
        "div",
        "order-details-item-image"
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

    const information = createElement(
        "div",
        "order-details-item-info"
    );

    const name = item.productId !== null
        ? createElement(
            "a",
            "order-details-item-name",
            item.productName
        )
        : createElement(
            "strong",
            "order-details-item-name",
            item.productName
        );

    if (name instanceof HTMLAnchorElement) {
        name.href =
            `/pages/product.html?id=${encodeURIComponent(item.productId)}`;
    }

    const quantity = createElement(
        "span",
        "order-details-item-quantity",
        `Quantity: ${formatInteger(item.quantity)}`
    );

    information.append(name, quantity);

    if (item.unitPrice !== null) {
        information.appendChild(
            createElement(
                "span",
                "order-details-item-unit-price",
                formatCurrency(item.unitPrice)
            )
        );
    }

    const price = createElement(
        "strong",
        "order-details-item-total",
        formatCurrency(item.subtotal)
    );

    row.append(
        imageWrapper,
        information,
        price
    );

    return row;
}

function renderItems(order) {
    const elements = getElements();

    if (elements.items) {
        const fragment = document.createDocumentFragment();

        for (const item of order.items) {
            fragment.appendChild(
                createOrderItem(item)
            );
        }

        elements.items.replaceChildren(fragment);
    }

    const reportedCount = Number(
        order.totalItems ??
        order.itemsCount ??
        order.itemCount
    );

    const calculatedCount = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    const count = Number.isFinite(reportedCount)
        ? reportedCount
        : calculatedCount;

    setText(
        elements.itemCount,
        formatInteger(count)
    );
}

function createExtra(label, enabled) {
    const row = createElement(
        "div",
        "order-details-extra-item"
    );

    const name = createElement(
        "span",
        "order-details-extra-name",
        label
    );

    const status = createElement(
        "span",
        enabled
            ? "badge badge-success"
            : "badge badge-neutral",
        enabled ? "Included" : "Not included"
    );

    row.append(name, status);

    return row;
}

function renderExtras(order) {
    const container = getElements().extras;

    if (!container) {
        return;
    }

    const extras = [
        {
            label: "Gift Wrapping",
            value: order.giftWrapping
        },
        {
            label: "Express Delivery",
            value: order.expressDelivery
        },
        {
            label: "Extended Warranty",
            value: order.extendedWarranty
        }
    ];

    const fragment = document.createDocumentFragment();
    let count = 0;

    for (const extra of extras) {
        if (typeof extra.value !== "boolean") {
            continue;
        }

        fragment.appendChild(
            createExtra(extra.label, extra.value)
        );

        count++;
    }

    if (count === 0) {
        hideElement(container);
        return;
    }

    container.replaceChildren(fragment);
    showElement(container);
}

function renderTotals(order) {
    const elements = getElements();

    const calculatedSubtotal = order.items.every(
        item => item.subtotal !== null
    )
        ? order.items.reduce(
            (sum, item) => sum + item.subtotal,
            0
        )
        : null;

    setText(
        elements.subtotal,
        formatCurrency(
            order.subtotalAmount ??
            calculatedSubtotal
        )
    );

    setText(
        elements.shippingFee,
        order.shippingFee !== null
            ? formatCurrency(order.shippingFee)
            : "—"
    );

    setText(
        elements.discount,
        order.discountAmount !== null
            ? formatCurrency(order.discountAmount)
            : "—"
    );

    setText(
        elements.total,
        formatCurrency(order.totalAmount)
    );

    setText(
        elements.promotion,
        order.promotionCode || "Not applied"
    );
}

function canCancelOrder(order) {
    return (
        order?.status === "PENDING" ||
        order?.status === "CONFIRMED"
    );
}

function updateActionButtons() {
    const elements = getElements();

    if (!currentOrder) {
        return;
    }

    const paid = Boolean(
        currentPayment &&
        PAID_STATUSES.has(currentPayment.status)
    );

    const cancelled =
        currentOrder.status === "CANCELLED";

    if (elements.cancelButton) {
        if (canCancelOrder(currentOrder)) {
            showElement(elements.cancelButton);
        } else {
            hideElement(elements.cancelButton);
        }

        elements.cancelButton.disabled = cancelling;
    }

    if (elements.payButton) {
        const canPay =
            !cancelled &&
            !paid;

        if (canPay) {
            showElement(elements.payButton);

            if (
                elements.payButton instanceof HTMLAnchorElement
            ) {
                elements.payButton.href =
                    `/pages/payment.html?orderId=${encodeURIComponent(currentOrder.id)}`;
            }
        } else {
            hideElement(elements.payButton);
        }
    }
}

function renderOrder(order) {
    currentOrder = order;

    const elements = getElements();

    setText(
        elements.orderNumber,
        `#${order.id}`
    );

    setText(
        elements.orderDate,
        formatDateTime(order.createdAt)
    );

    setText(
        elements.shippingAddress,
        order.shippingAddress || "—"
    );

    renderStatus(
        elements.status,
        order.status
    );

    const statusDescriptions = {
        PENDING: "Тапсырысың қабылданды және өңделуді күтуде.",
        CONFIRMED: "Тапсырысың расталды.",
        SHIPPED: "Тапсырысың жеткізуге жіберілді.",
        DELIVERED: "Тапсырысың жеткізілді.",
        CANCELLED: "Тапсырысың жойылды."
    };

    setText(
        elements.statusDescription,
        statusDescriptions[order.status] ??
        "Тапсырыс статусы жаңартылды."
    );

    renderTimeline(order);
    renderItems(order);
    renderTotals(order);
    renderExtras(order);
    updateActionButtons();

    document.title =
        `Order #${order.id} | NEXORA`;

    hideFallbackState();
    setPageState("content");
}

function renderPayment(payment) {
    currentPayment = payment;

    const elements = getElements();

    if (!payment) {
        renderStatus(
            elements.paymentStatus,
            "UNPAID",
            "payment"
        );

        setText(
            elements.paymentMethod,
            "Not selected"
        );

        setText(elements.paymentId, "—");
        setText(elements.paymentDate, "—");

        updateActionButtons();
        return;
    }

    renderStatus(
        elements.paymentStatus,
        payment.status,
        "payment"
    );

    setText(
        elements.paymentMethod,
        payment.method || "—"
    );

    setText(
        elements.paymentId,
        payment.id !== null
            ? `#${payment.id}`
            : "—"
    );

    setText(
        elements.paymentDate,
        formatDateTime(payment.createdAt)
    );

    updateActionButtons();
}

async function loadExistingPayment(orderId) {
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

async function loadOrder() {
    const orderId = getOrderId();

    if (orderId === null) {
        showOrderError(
            "Тапсырыс ID нөмірі көрсетілмеген."
        );

        return;
    }

    const version = ++requestVersion;

    setPageState("loading");
    hideFallbackState();

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

        const response = await api.orders.getById(
            orderId
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const order = normalizeOrder(response);

        if (!order) {
            throw new Error(
                "Тапсырыс мәліметтері дұрыс алынбады."
            );
        }

        currentPayment = null;

        renderOrder(order);
        renderPayment(null);

        try {
            const payment = await loadExistingPayment(
                order.id
            );

            if (
                !active ||
                version !== requestVersion
            ) {
                return;
            }

            renderPayment(payment);
        } catch (error) {
            if (
                !active ||
                version !== requestVersion
            ) {
                return;
            }

            console.error(
                "Order payment loading failed:",
                error
            );

            setText(
                getElements().paymentStatus,
                "Unavailable"
            );

            hideElement(
                getElements().payButton
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

        showOrderError(
            getErrorMessage(error)
        );
    }
}

function showCancelError(message) {
    const element = getElements().cancelMessage;

    if (element) {
        setText(element, message);
        showElement(element);
    } else {
        showError(message);
    }
}

async function confirmCancelOrder() {
    if (
        cancelling ||
        !currentOrder ||
        !canCancelOrder(currentOrder)
    ) {
        return;
    }

    const orderId = currentOrder.id;
    const elements = getElements();

    cancelling = true;

    if (
        elements.confirmCancel instanceof HTMLButtonElement
    ) {
        setButtonLoading(
            elements.confirmCancel,
            true,
            "Cancelling..."
        );
    }

    updateActionButtons();

    try {
        await api.orders.cancel(orderId);

        if (elements.cancelModal) {
            closeModal(elements.cancelModal);
        }

        showSuccess(
            `#${orderId} тапсырысы жойылды.`
        );

        await loadOrder();
    } catch (error) {
        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        showCancelError(
            getErrorMessage(error)
        );
    } finally {
        cancelling = false;

        if (
            elements.confirmCancel instanceof HTMLButtonElement
        ) {
            setButtonLoading(
                elements.confirmCancel,
                false
            );
        }

        updateActionButtons();
    }
}

function openCancelConfirmation() {
    if (
        !currentOrder ||
        !canCancelOrder(currentOrder)
    ) {
        return;
    }

    const elements = getElements();

    hideElement(elements.cancelMessage);

    if (elements.cancelModal) {
        const orderNumber = elements.cancelModal.querySelector(
            "[data-cancel-order-number]"
        );

        setText(
            orderNumber,
            `#${currentOrder.id}`
        );

        openModal(elements.cancelModal);
        return;
    }

    if (
        window.confirm(
            `#${currentOrder.id} тапсырысын жоюды растайсың ба?`
        )
    ) {
        confirmCancelOrder();
    }
}

function setupCancelModal() {
    const elements = getElements();

    if (elements.cancelModal) {
        modalCleanup = setupModal(
            elements.cancelModal,
            {
                closeButtons: [
                    "#order-cancel-modal-close",
                    "#cancel-order-modal-close",
                    "#order-cancel-dismiss",
                    "#order-cancel-back",
                    "#cancel-order-cancel",
                    "[data-order-cancel-close]"
                ]
            }
        );
    }

    elements.cancelButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            openCancelConfirmation();
        },
        {
            signal: eventController.signal
        }
    );

    elements.confirmCancel?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            confirmCancelOrder();
        },
        {
            signal: eventController.signal
        }
    );
}

function setupActions() {
    const elements = getElements();

    setupCancelModal();

    elements.refresh?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadOrder();
        },
        {
            signal: eventController.signal
        }
    );

    if (
        elements.payButton instanceof HTMLButtonElement
    ) {
        elements.payButton.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (!currentOrder) {
                    return;
                }

                window.location.assign(
                    `/pages/payment.html?orderId=${encodeURIComponent(currentOrder.id)}`
                );
            },
            {
                signal: eventController.signal
            }
        );
    }
}

export async function initOrderDetails() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupActions();

    await loadOrder();
}

export function destroyOrderDetails() {
    active = false;
    initialized = false;
    cancelling = false;

    requestVersion += 1;

    modalCleanup?.();
    eventController?.abort();

    modalCleanup = null;
    eventController = null;

    currentOrder = null;
    currentPayment = null;
}

export const orderDetails = {
    init: initOrderDetails,
    destroy: destroyOrderDetails,
    reload: loadOrder,
    cancel: confirmCancelOrder,
    getCurrentOrder() {
        return currentOrder;
    },
    getCurrentPayment() {
        return currentPayment;
    }
};

export default orderDetails;
