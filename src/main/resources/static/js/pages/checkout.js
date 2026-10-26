
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
    parsePositiveId
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const SELECTORS = {
    loading: "#checkout-loading",
    content: "#checkout-content",
    empty: "#checkout-empty-cart",
    auth: "#checkout-auth-required",
    error: "#checkout-error",
    errorMessage: "#checkout-error-message",
    retry: "#checkout-retry-button",
    form: "#checkout-form",
    address: "#checkout-shipping-address",
    addressError: "#checkout-address-error",
    promotion: "#checkout-promo-code",
    promotionApply: "#checkout-apply-promo",
    promotionFeedback: "#checkout-promo-feedback",
    promotionPreview: "#checkout-promo-preview",
    giftWrapping: "#checkout-gift-wrapping",
    expressDelivery: "#checkout-express-delivery",
    extendedWarranty: "#checkout-extended-warranty",
    extrasNote: "#checkout-extras-note",
    items: "#checkout-summary-items",
    itemCount: "#checkout-items-count",
    subtotal: "#checkout-subtotal",
    discountRow: "#checkout-discount-row",
    discountAmount: "#checkout-discount-amount",
    extrasRow: "#checkout-extras-row",
    extrasTotal: "#checkout-extras-total",
    total: "#checkout-total",
    totalNote: "#checkout-total-note",
    submitButton: "#checkout-submit-button",
    submitText: "#checkout-submit-text",
    submitError: "#checkout-submit-error"
};

let initialized = false;
let active = false;
let submitting = false;
let checkingPromotion = false;

let currentCart = null;
let promotionPreview = null;

let requestVersion = 0;
let promotionVersion = 0;
let eventController = null;

function $(selector) {
    return document.querySelector(selector);
}

function element(name) {
    return $(SELECTORS[name]);
}

function setText(target, value) {
    if (target) {
        target.textContent = String(value ?? "");
    }
}

function setVisible(target, visible) {
    if (!target) {
        return;
    }

    target.hidden = !visible;
    target.classList.toggle("hidden", !visible);
}

function showPageState(state) {
    const sections = {
        loading: element("loading"),
        content: element("content"),
        empty: element("empty"),
        auth: element("auth"),
        error: element("error")
    };

    for (const [name, target] of Object.entries(sections)) {
        setVisible(target, name === state);
    }
}

function createElement(tag, className = "", text = null) {
    const target = document.createElement(tag);

    if (className) {
        target.className = className;
    }

    if (text !== null && text !== undefined) {
        target.textContent = String(text);
    }

    return target;
}

function toNonNegativeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : fallback;
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

    const unitPrice = toNonNegativeNumber(
        item.unitPrice ?? item.price
    );

    const subtotal = toNonNegativeNumber(
        item.subtotal,
        unitPrice * quantity
    );

    return {
        productId,
        productName: String(
            item.productName ?? "Тауар"
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

    const calculatedCount = items.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    const calculatedAmount = items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    return {
        items,
        totalItems: toNonNegativeNumber(
            data?.totalItems,
            calculatedCount
        ),
        totalAmount: toNonNegativeNumber(
            data?.totalAmount,
            calculatedAmount
        )
    };
}

function createCartSignature(cart) {
    if (!cart) {
        return "";
    }

    const items = cart.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal
    }));

    items.sort((a, b) => a.productId - b.productId);

    return JSON.stringify({
        items,
        totalItems: cart.totalItems,
        totalAmount: cart.totalAmount
    });
}

function createProductImage(item) {
    const wrapper = createElement(
        "div",
        "checkout-summary-item-image"
    );

    if (!item.imageUrl) {
        setText(wrapper, "N");
        return wrapper;
    }

    const image = document.createElement("img");

    image.src = item.imageUrl;
    image.alt = item.productName;
    image.loading = "lazy";

    image.addEventListener(
        "error",
        () => {
            image.remove();
            setText(wrapper, "N");
        },
        { once: true }
    );

    wrapper.appendChild(image);

    return wrapper;
}

function createCheckoutItem(item) {
    const wrapper = createElement(
        "div",
        "checkout-summary-item"
    );

    const image = createProductImage(item);

    const details = createElement(
        "div",
        "checkout-summary-item-details"
    );

    const name = createElement(
        "a",
        "checkout-summary-item-name",
        item.productName
    );

    name.href = `/pages/product.html?id=${encodeURIComponent(
        item.productId
    )}`;

    const quantity = createElement(
        "span",
        "checkout-summary-item-quantity",
        `Саны: ${item.quantity}`
    );

    details.append(name, quantity);

    const price = createElement(
        "strong",
        "checkout-summary-item-price",
        formatCurrency(item.subtotal)
    );

    wrapper.append(image, details, price);

    return wrapper;
}

function renderCartItems() {
    const container = element("items");

    if (!container || !currentCart) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of currentCart.items) {
        fragment.appendChild(
            createCheckoutItem(item)
        );
    }

    container.replaceChildren(fragment);
}

function selectedExtras() {
    return {
        giftWrapping: Boolean(element("giftWrapping")?.checked),
        expressDelivery: Boolean(element("expressDelivery")?.checked),
        extendedWarranty: Boolean(element("extendedWarranty")?.checked)
    };
}

function hasSelectedExtras() {
    const extras = selectedExtras();

    return Object.values(extras).some(Boolean);
}

function renderExtraSummary() {
    const selected = hasSelectedExtras();

    setVisible(element("extrasRow"), selected);

    if (selected) {
        setText(
            element("extrasTotal"),
            "Тапсырыс кезінде есептеледі"
        );
    }

    const note = element("extrasNote");

    if (note) {
        note.textContent = selected
            ? "Таңдалған қосымша қызметтердің нақты құнын сервер тапсырысты рәсімдеу кезінде есептейді."
            : "Қосымша қызметтер міндетті емес. Оларды өз қалауыңа қарай таңда.";
    }
}

function renderOrderSummary() {
    if (!currentCart) {
        return;
    }

    renderCartItems();

    setText(
        element("itemCount"),
        formatInteger(currentCart.totalItems)
    );

    setText(
        element("subtotal"),
        formatCurrency(currentCart.totalAmount)
    );

    const hasPromotion = promotionPreview !== null;

    setVisible(
        element("discountRow"),
        hasPromotion
    );

    if (hasPromotion) {
        setText(
            element("discountAmount"),
            `−${formatCurrency(promotionPreview.discountAmount)}`
        );
    } else {
        setText(element("discountAmount"), "");
    }

    const estimatedTotal = hasPromotion
        ? promotionPreview.finalAmount
        : currentCart.totalAmount;

    setText(
        element("total"),
        formatCurrency(estimatedTotal)
    );

    let note = hasPromotion
        ? "Промокод жеңілдігі есептелді. Бұл — алдын ала сома."
        : "Бұл — себеттегі тауарлардың бастапқы сомасы.";

    if (hasSelectedExtras()) {
        note += " Қосымша қызметтердің құны тапсырысты рәсімдеу кезінде қосылады.";
    } else {
        note += " Нақты төлем сомасын сервер растайды.";
    }

    setText(element("totalNote"), note);

    renderExtraSummary();
}

function showPromotionMessage(message, type = "info") {
    const target = element("promotionFeedback");

    if (!target) {
        if (type === "error") {
            showError(message);
        }

        return;
    }

    target.classList.remove(
        "is-success",
        "is-error"
    );

    if (type === "success") {
        target.classList.add("is-success");
    }

    if (type === "error") {
        target.classList.add("is-error");
    }

    setText(target, message);
    setVisible(target, true);
}

function hidePromotionMessage() {
    const target = element("promotionFeedback");

    if (!target) {
        return;
    }

    target.classList.remove(
        "is-success",
        "is-error"
    );

    setText(target, "");
    setVisible(target, false);
}

function resetPromotionPreview() {
    promotionPreview = null;

    const preview = element("promotionPreview");

    if (preview) {
        preview.replaceChildren();
        setVisible(preview, false);
    }

    hidePromotionMessage();
    renderOrderSummary();
}

function renderPromotionPreview() {
    const container = element("promotionPreview");

    if (!container || !promotionPreview) {
        return;
    }

    const label = createElement(
        "span",
        "checkout-preview-label",
        `Промокод: ${promotionPreview.code}`
    );

    const discount = createElement(
        "span",
        "checkout-preview-discount",
        `Жеңілдік: −${formatCurrency(
            promotionPreview.discountAmount
        )}`
    );

    const total = createElement(
        "strong",
        "checkout-preview-total",
        `Жеңілдіктен кейін: ${formatCurrency(
            promotionPreview.finalAmount
        )}`
    );

    container.replaceChildren(
        label,
        discount,
        total
    );

    setVisible(container, true);
}

function setPromotionLoading(loading) {
    checkingPromotion = loading;

    const button = element("promotionApply");

    if (!button) {
        return;
    }

    button.disabled = loading || submitting;

    button.textContent = loading
        ? "Тексерілуде..."
        : "Тексеру";

    button.setAttribute(
        "aria-busy",
        String(loading)
    );
}

function getPromotionCode() {
    return String(
        element("promotion")?.value ?? ""
    ).trim();
}

async function applyPromotion() {
    if (!active || checkingPromotion || submitting) {
        return;
    }

    const code = getPromotionCode();

    if (!code) {
        resetPromotionPreview();

        showPromotionMessage(
            "Алдымен промокодты енгіз.",
            "error"
        );

        element("promotion")?.focus();
        return;
    }

    if (!currentCart || currentCart.items.length === 0) {
        showPromotionMessage(
            "Алдымен себетке тауар қос.",
            "error"
        );
        return;
    }

    const version = ++promotionVersion;

    resetPromotionPreview();
    setPromotionLoading(true);

    showPromotionMessage(
        "Промокод серверде тексерілуде..."
    );

    try {
        const response = await api.promotions.preview(code);

        if (!active || version !== promotionVersion) {
            return;
        }

        const data = response?.data ?? response;

        const discountAmount = Number(
            data?.discountAmount
        );

        const finalAmount = Number(
            data?.finalAmount
        );

        const originalAmount = Number(
            data?.originalAmount
        );

        if (
            !Number.isFinite(discountAmount) ||
            !Number.isFinite(finalAmount) ||
            !Number.isFinite(originalAmount) ||
            discountAmount < 0 ||
            finalAmount < 0 ||
            originalAmount < 0 ||
            Math.abs(
                originalAmount -
                discountAmount -
                finalAmount
            ) > 0.01
        ) {
            throw new Error(
                "Сервер жеңілдік сомасын дұрыс қайтармады."
            );
        }

        if (
            Math.abs(
                originalAmount - currentCart.totalAmount
            ) > 0.01
        ) {
            throw new Error(
                "Себет сомасы өзгерген. Бетті жаңартып, промокодты қайта тексер."
            );
        }

        promotionPreview = {
            code: String(data.code ?? code).trim(),
            originalAmount,
            discountAmount,
            finalAmount
        };

        renderPromotionPreview();
        renderOrderSummary();

        showPromotionMessage(
            `Промокод жарамды! Жеңілдік: ${formatCurrency(discountAmount)}`,
            "success"
        );
    } catch (error) {
        if (!active || version !== promotionVersion) {
            return;
        }

        resetPromotionPreview();

        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        showPromotionMessage(
            getErrorMessage(error),
            "error"
        );
    } finally {
        if (active && version === promotionVersion) {
            setPromotionLoading(false);
        }
    }
}

function getCheckoutData() {
    const extras = selectedExtras();

    return {
        shippingAddress: String(
            element("address")?.value ?? ""
        ).trim(),
        promotionCode: getPromotionCode() || null,
        ...extras
    };
}

function clearValidationErrors() {
    const address = element("address");

    address?.removeAttribute("aria-invalid");
    address?.classList.remove("is-invalid");

    setText(element("addressError"), "");
    setVisible(element("addressError"), false);

    setText(element("submitError"), "");
    setVisible(element("submitError"), false);
}

function showValidationError(message, field = null) {
    if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("is-invalid");
        field.focus();
    }

    const target = field === element("address")
        ? element("addressError")
        : element("submitError");

    if (target) {
        setText(target, message);
        setVisible(target, true);
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

    if (data.shippingAddress.length < 10) {
        showValidationError(
            "Жеткізу мекенжайын кемінде 10 таңбамен толық енгіз.",
            element("address")
        );
        return false;
    }

    if (data.shippingAddress.length > 500) {
        showValidationError(
            "Жеткізу мекенжайы 500 таңбадан аспауы керек.",
            element("address")
        );
        return false;
    }

    return true;
}

function extractOrderId(response) {
    if (
        typeof response === "number" ||
        typeof response === "string"
    ) {
        return parsePositiveId(response);
    }

    const order = response?.order ??
        response?.data?.order ??
        response?.data ??
        response;

    return parsePositiveId(
        order?.id ?? order?.orderId
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

function setSubmitting(value) {
    submitting = value;

    const button = element("submitButton");
    const text = element("submitText");
    const promotionButton = element("promotionApply");

    if (button) {
        button.disabled = value;
        button.setAttribute(
            "aria-busy",
            String(value)
        );
    }

    if (text) {
        text.textContent = value
            ? "Рәсімделуде..."
            : "Тапсырысты рәсімдеу";
    }

    if (promotionButton) {
        promotionButton.disabled = value || checkingPromotion;
    }
}

async function handleCheckoutSubmit(event) {
    event.preventDefault();

    if (!active || submitting || checkingPromotion) {
        return;
    }

    const data = getCheckoutData();

    if (!validateCheckout(data)) {
        return;
    }

    setSubmitting(true);

    try {
        const latestResponse = await api.cart.get();

        if (!active) {
            return;
        }

        const latestCart = normalizeCart(latestResponse);

        if (latestCart.items.length === 0) {
            currentCart = latestCart;
            promotionVersion += 1;
            promotionPreview = null;
            showEmptyCart();
            return;
        }

        if (
            createCartSignature(currentCart) !==
            createCartSignature(latestCart)
        ) {
            currentCart = latestCart;
            promotionVersion += 1;
            resetPromotionPreview();

            showValidationError(
                "Себеттегі тауарлар немесе олардың бағасы өзгерген. Жаңартылған соманы тексеріп, тапсырысты қайта рәсімде."
            );

            return;
        }

        currentCart = latestCart;

        const response = await api.orders.checkout(data);

        if (!active) {
            return;
        }

        const orderId = extractOrderId(response);

        if (orderId === null) {
            showValidationError(
                "Тапсырыс жасалған болуы мүмкін, бірақ оның нөмірі алынбады. Қайта рәсімдемей тұрып, «Менің тапсырыстарым» бөлімін тексер."
            );

            return;
        }

        window.dispatchEvent(
            new CustomEvent("nexora:cart-updated")
        );

        showSuccess("Тапсырыс сәтті рәсімделді!");

        window.location.assign(
            getPaymentUrl(orderId)
        );
    } catch (error) {
        if (!active) {
            return;
        }

        if (isAuthenticationError(error)) {
            clearAuthState();
            showAuthRequired();
            return;
        }

        showValidationError(
            getErrorMessage(error)
        );
    } finally {
        if (active) {
            setSubmitting(false);
        }
    }
}

function showAuthRequired() {
    currentCart = null;
    promotionPreview = null;
    showPageState("auth");

    const loginUrl = getLoginUrl(
        "/pages/checkout.html"
    );

    const link = element("auth")?.querySelector(
        "a[href*='login']"
    );

    if (link) {
        link.href = loginUrl;
    }
}

function showEmptyCart() {
    currentCart = currentCart ?? {
        items: [],
        totalItems: 0,
        totalAmount: 0
    };

    promotionPreview = null;
    showPageState("empty");
}

function showCheckoutError(error) {
    setText(
        element("errorMessage"),
        getErrorMessage(error)
    );

    showPageState("error");
}

function setupPromotionEvents() {
    const button = element("promotionApply");
    const input = element("promotion");

    button?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            applyPromotion();
        },
        {
            signal: eventController.signal
        }
    );

    input?.addEventListener(
        "input",
        () => {
            promotionVersion += 1;

            if (checkingPromotion) {
                setPromotionLoading(false);
            }

            resetPromotionPreview();
        },
        {
            signal: eventController.signal
        }
    );

    input?.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyPromotion();
            }
        },
        {
            signal: eventController.signal
        }
    );
}

function setupExtrasEvents() {
    const fields = [
        element("giftWrapping"),
        element("expressDelivery"),
        element("extendedWarranty")
    ];

    for (const field of fields) {
        field?.addEventListener(
            "change",
            () => {
                renderOrderSummary();
            },
            {
                signal: eventController.signal
            }
        );
    }
}

function setupAddressEvents() {
    const address = element("address");

    address?.addEventListener(
        "input",
        () => {
            address.removeAttribute("aria-invalid");
            address.classList.remove("is-invalid");

            setText(element("addressError"), "");
            setVisible(element("addressError"), false);

            setText(element("submitError"), "");
            setVisible(element("submitError"), false);
        },
        {
            signal: eventController.signal
        }
    );
}

function setupCheckoutEvents() {
    const form = element("form");

    form?.addEventListener(
        "submit",
        handleCheckoutSubmit,
        {
            signal: eventController.signal
        }
    );

    const submitButton = element("submitButton");

    if (submitButton && form && !form.contains(submitButton)) {
        submitButton.addEventListener(
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

    element("retry")?.addEventListener(
        "click",
        () => {
            loadCheckout();
        },
        {
            signal: eventController.signal
        }
    );

    setupAddressEvents();
    setupPromotionEvents();
    setupExtrasEvents();
}

async function loadCheckout() {
    if (!active) {
        return;
    }

    const version = ++requestVersion;

    promotionVersion += 1;
    currentCart = null;
    promotionPreview = null;

    clearValidationErrors();
    hidePromotionMessage();

    setVisible(element("promotionPreview"), false);
    setVisible(element("discountRow"), false);

    showPageState("loading");

    try {
        const user = await getCurrentUser();

        if (!active || version !== requestVersion) {
            return;
        }

        if (!user) {
            showAuthRequired();
            return;
        }

        const response = await api.cart.get();

        if (!active || version !== requestVersion) {
            return;
        }

        currentCart = normalizeCart(response);

        if (currentCart.items.length === 0) {
            showEmptyCart();
            return;
        }

        renderOrderSummary();
        showPageState("content");
    } catch (error) {
        if (!active || version !== requestVersion) {
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

    requestVersion = 0;
    promotionVersion = 0;

    submitting = false;
    checkingPromotion = false;

    eventController = new AbortController();

    setupCheckoutEvents();

    await loadCheckout();
}

export function destroyCheckout() {
    active = false;
    initialized = false;

    requestVersion += 1;
    promotionVersion += 1;

    eventController?.abort();
    eventController = null;

    currentCart = null;
    promotionPreview = null;

    submitting = false;
    checkingPromotion = false;
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
