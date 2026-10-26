
const DEFAULT_LOCALE = "kk-KZ";
const DEFAULT_CURRENCY = "KZT";
const EMPTY_VALUE = "—";

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});

const currencyNumberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    maximumFractionDigits: 0
});

const buttonLoadingStates = new WeakMap();
const modalPreviousFocus = new WeakMap();
const openedModals = new Set();

let originalBodyOverflow = null;

const ORDER_STATUSES = Object.freeze({
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
});

const PAYMENT_STATUSES = Object.freeze({
    PENDING: "Pending",
    PAID: "Paid",
    FAILED: "Failed",
    SUCCESS: "Success",
    COMPLETED: "Completed",
    REFUNDED: "Refunded"
});

const NOTIFICATION_STATUSES = Object.freeze({
    PENDING: "Pending",
    SENT: "Sent",
    FAILED: "Failed"
});

const DISCOUNT_TYPES = Object.freeze({
    PERCENTAGE: "Percentage",
    FIXED: "Fixed Amount"
});

const STATUS_VARIANTS = Object.freeze({
    PENDING: "warning",
    CONFIRMED: "primary",
    SHIPPED: "primary",
    DELIVERED: "success",
    CANCELLED: "danger",
    PAID: "success",
    SUCCESS: "success",
    COMPLETED: "success",
    SENT: "success",
    FAILED: "danger",
    ACTIVE: "success",
    INACTIVE: "neutral",
    IN_STOCK: "success",
    LOW_STOCK: "warning",
    OUT_OF_STOCK: "danger",
    REFUNDED: "neutral"
});

export function toNumber(value, fallback = 0) {
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? value
            : fallback;
    }

    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value
        .trim()
        .replace(/[\s\u00a0\u202f]/g, "")
        .replace(",", ".");

    if (!normalized) {
        return fallback;
    }

    const result = Number(normalized);

    return Number.isFinite(result)
        ? result
        : fallback;
}

export function toInteger(value, fallback = 0) {
    const number = toNumber(value, NaN);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.trunc(number);
}

export function parsePositiveId(value) {
    const number = toNumber(value, NaN);

    if (
        !Number.isSafeInteger(number) ||
        number <= 0
    ) {
        return null;
    }

    return number;
}

export function clamp(value, min, max) {
    const number = toNumber(value, min);

    return Math.min(
        Math.max(number, min),
        max
    );
}

export function formatNumber(value, fallback = EMPTY_VALUE) {
    const number = toNumber(value, NaN);

    return Number.isFinite(number)
        ? numberFormatter.format(number)
        : fallback;
}

export function formatInteger(value, fallback = EMPTY_VALUE) {
    const number = toNumber(value, NaN);

    return Number.isFinite(number)
        ? integerFormatter.format(number)
        : fallback;
}

export function formatCurrency(
    value,
    currency = DEFAULT_CURRENCY
) {
    const amount = toNumber(value, NaN);

    if (!Number.isFinite(amount)) {
        return EMPTY_VALUE;
    }

    if (currency === "KZT") {
        return `${currencyNumberFormatter.format(amount)} ₸`;
    }

    try {
        return new Intl.NumberFormat(DEFAULT_LOCALE, {
            style: "currency",
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${numberFormatter.format(amount)} ${currency}`;
    }
}

export const formatPrice = formatCurrency;
export const formatMoney = formatCurrency;

export function formatPercentage(
    value,
    fractionDigits = 2
) {
    const number = toNumber(value, NaN);

    if (!Number.isFinite(number)) {
        return EMPTY_VALUE;
    }

    return `${new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits
    }).format(number)}%`;
}

export function calculatePercentage(value, percentage) {
    const amount = toNumber(value);
    const rate = toNumber(percentage);

    return amount * rate / 100;
}

export function formatDiscount(type, value) {
    const normalizedType = String(
        type ?? ""
    ).trim().toUpperCase();

    if (normalizedType === "PERCENTAGE") {
        return formatPercentage(value);
    }

    if (normalizedType === "FIXED") {
        return formatCurrency(value);
    }

    return EMPTY_VALUE;
}

export function calculateDiscount(
    total,
    discountType,
    discountValue
) {
    const amount = Math.max(0, toNumber(total));
    const value = Math.max(0, toNumber(discountValue));

    let discount = 0;

    if (String(discountType).toUpperCase() === "PERCENTAGE") {
        discount = amount * Math.min(value, 100) / 100;
    }

    if (String(discountType).toUpperCase() === "FIXED") {
        discount = value;
    }

    return Math.min(amount, Math.max(0, discount));
}

export function parseDate(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : value;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

export function formatDate(
    value,
    options = {}
) {
    const date = parseDate(value);

    if (!date) {
        return EMPTY_VALUE;
    }

    const {
        locale = DEFAULT_LOCALE,
        year = "numeric",
        month = "long",
        day = "numeric",
        ...otherOptions
    } = options;

    return new Intl.DateTimeFormat(locale, {
        year,
        month,
        day,
        ...otherOptions
    }).format(date);
}

export function formatShortDate(value) {
    return formatDate(value, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
}

export function formatDateTime(value) {
    return formatDate(value, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

export function formatTime(value) {
    return formatDate(value, {
        year: undefined,
        month: undefined,
        day: undefined,
        hour: "2-digit",
        minute: "2-digit"
    });
}

export function formatRelativeDate(value) {
    const date = parseDate(value);

    if (!date) {
        return EMPTY_VALUE;
    }

    const seconds = Math.round(
        (date.getTime() - Date.now()) / 1000
    );

    const absoluteSeconds = Math.abs(seconds);

    const formatter = new Intl.RelativeTimeFormat(
        DEFAULT_LOCALE,
        {
            numeric: "auto"
        }
    );

    if (absoluteSeconds < 60) {
        return formatter.format(seconds, "second");
    }

    if (absoluteSeconds < 3600) {
        return formatter.format(
            Math.round(seconds / 60),
            "minute"
        );
    }

    if (absoluteSeconds < 86400) {
        return formatter.format(
            Math.round(seconds / 3600),
            "hour"
        );
    }

    if (absoluteSeconds < 604800) {
        return formatter.format(
            Math.round(seconds / 86400),
            "day"
        );
    }

    return formatDate(value);
}

export function escapeHtml(value) {
    const text = String(value ?? "");

    return text.replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

export const escapeHTML = escapeHtml;
export const escapeAttribute = escapeHtml;

export function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}

export function truncateText(
    value,
    maxLength = 100,
    suffix = "..."
) {
    const text = normalizeText(value);
    const limit = Math.max(0, toInteger(maxLength, 100));

    if (text.length <= limit) {
        return text;
    }

    return text.slice(0, limit).trimEnd() + suffix;
}

export function capitalize(value) {
    const text = normalizeText(value);

    if (!text) {
        return "";
    }

    return text.charAt(0).toUpperCase() +
        text.slice(1).toLowerCase();
}

export function getInitials(
    value,
    fallback = "U"
) {
    const words = normalizeText(value)
        .split(" ")
        .filter(Boolean);

    if (words.length === 0) {
        return fallback;
    }

    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }

    return (
        words[0].charAt(0) +
        words[words.length - 1].charAt(0)
    ).toUpperCase();
}

export function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

export function formatStatus(
    value,
    type = "order"
) {
    const status = normalizeStatus(value);

    const mappings = {
        order: ORDER_STATUSES,
        payment: PAYMENT_STATUSES,
        notification: NOTIFICATION_STATUSES,
        discount: DISCOUNT_TYPES
    };

    const mapping = mappings[type] ?? {};

    if (mapping[status]) {
        return mapping[status];
    }

    if (!status) {
        return "Unknown";
    }

    return status
        .toLowerCase()
        .split("_")
        .map(capitalize)
        .join(" ");
}

export function getStatusVariant(value) {
    const status = normalizeStatus(value);

    return STATUS_VARIANTS[status] ?? "neutral";
}

export function getStatusBadgeClass(value) {
    return `badge badge-${getStatusVariant(value)}`;
}

export function renderStatusBadge(
    value,
    type = "order"
) {
    const label = formatStatus(value, type);
    const className = getStatusBadgeClass(value);

    return `<span class="${className}">${escapeHtml(label)}</span>`;
}

export function getSafeImageUrl(
    value,
    fallback = ""
) {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return fallback;
    }

    const raw = value.trim();

    if (
        raw.startsWith("//") ||
        raw.includes("\\")
    ) {
        return fallback;
    }

    try {
        const url = new URL(
            raw,
            window.location.origin
        );

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            return fallback;
        }

        if (url.username || url.password) {
            return fallback;
        }

        return url.toString();
    } catch {
        return fallback;
    }
}

export function setImage(
    imageElement,
    url,
    fallback = ""
) {
    const image = resolveElement(imageElement);

    if (!(image instanceof HTMLImageElement)) {
        return false;
    }

    const safeUrl = getSafeImageUrl(
        url,
        getSafeImageUrl(fallback)
    );

    if (!safeUrl) {
        image.removeAttribute("src");
        return false;
    }

    image.src = safeUrl;
    image.loading = "lazy";

    return true;
}

export function resolveElement(target) {
    if (target instanceof Element) {
        return target;
    }

    if (typeof target !== "string") {
        return null;
    }

    if (target.startsWith("#")) {
        return document.getElementById(
            target.substring(1)
        );
    }

    return document.querySelector(target);
}

export function byId(id) {
    return document.getElementById(id);
}

export function qs(
    selector,
    parent = document
) {
    return parent.querySelector(selector);
}

export function qsa(
    selector,
    parent = document
) {
    return Array.from(
        parent.querySelectorAll(selector)
    );
}

export function showElement(target) {
    const element = resolveElement(target);

    if (!element) {
        return null;
    }

    element.hidden = false;
    element.classList.remove("hidden");

    return element;
}

export function hideElement(target) {
    const element = resolveElement(target);

    if (!element) {
        return null;
    }

    element.hidden = true;
    element.classList.add("hidden");

    return element;
}

export function toggleElement(
    target,
    shouldShow
) {
    return shouldShow
        ? showElement(target)
        : hideElement(target);
}

export function isVisible(target) {
    const element = resolveElement(target);

    if (!element) {
        return false;
    }

    return !element.hidden &&
        !element.classList.contains("hidden");
}

export function setText(
    target,
    value,
    fallback = EMPTY_VALUE
) {
    const element = resolveElement(target);

    if (!element) {
        return null;
    }

    element.textContent =
        value === undefined ||
        value === null ||
        value === ""
            ? fallback
            : String(value);

    return element;
}

export function setValue(target, value) {
    const element = resolveElement(target);

    if (
        !element ||
        !("value" in element)
    ) {
        return null;
    }

    element.value = String(value ?? "");

    return element;
}

export function setDisabled(
    target,
    disabled = true
) {
    const element = resolveElement(target);

    if (
        !element ||
        !("disabled" in element)
    ) {
        return null;
    }

    element.disabled = Boolean(disabled);

    return element;
}

export function clearElement(target) {
    const element = resolveElement(target);

    if (element) {
        element.replaceChildren();
    }

    return element;
}

export function createElement(
    tagName,
    options = {}
) {
    const element = document.createElement(tagName);

    const {
        className,
        text,
        attributes = {},
        children = []
    } = options;

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = String(text);
    }

    for (const [name, value] of Object.entries(attributes)) {
        if (
            value === undefined ||
            value === null ||
            value === false
        ) {
            continue;
        }

        element.setAttribute(
            name,
            value === true ? "" : String(value)
        );
    }

    for (const child of children) {
        if (child instanceof Node) {
            element.appendChild(child);
        } else if (
            child !== undefined &&
            child !== null
        ) {
            element.appendChild(
                document.createTextNode(String(child))
            );
        }
    }

    return element;
}

export function setButtonLoading(
    target,
    loading = true,
    loadingText = "Жүктелуде..."
) {
    const button = resolveElement(target);

    if (!(button instanceof HTMLButtonElement)) {
        return;
    }

    if (loading) {
        if (buttonLoadingStates.has(button)) {
            return;
        }

        buttonLoadingStates.set(button, {
            nodes: Array.from(button.childNodes),
            disabled: button.disabled
        });

        button.replaceChildren(
            document.createTextNode(loadingText)
        );

        button.disabled = true;
        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");

        return;
    }

    const previous = buttonLoadingStates.get(button);

    if (!previous) {
        return;
    }

    button.replaceChildren(...previous.nodes);
    button.disabled = previous.disabled;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");

    buttonLoadingStates.delete(button);
}

export function debounce(
    callback,
    delay = 300
) {
    let timerId = null;

    const debounced = function (...args) {
        clearTimeout(timerId);

        timerId = setTimeout(() => {
            timerId = null;
            callback.apply(this, args);
        }, delay);
    };

    debounced.cancel = () => {
        clearTimeout(timerId);
        timerId = null;
    };

    return debounced;
}

export function throttle(
    callback,
    delay = 300
) {
    let lastExecuted = 0;
    let timeoutId = null;

    const throttled = function (...args) {
        const now = Date.now();
        const remaining = delay - (now - lastExecuted);

        if (remaining <= 0) {
            clearTimeout(timeoutId);
            timeoutId = null;
            lastExecuted = now;
            callback.apply(this, args);
            return;
        }

        if (timeoutId === null) {
            const context = this;

            timeoutId = setTimeout(() => {
                lastExecuted = Date.now();
                timeoutId = null;
                callback.apply(context, args);
            }, remaining);
        }
    };

    throttled.cancel = () => {
        clearTimeout(timeoutId);
        timeoutId = null;
    };

    return throttled;
}

export function sleep(milliseconds = 0) {
    return new Promise(resolve => {
        setTimeout(
            resolve,
            Math.max(0, milliseconds)
        );
    });
}

export function getQueryParam(
    name,
    fallback = null
) {
    const params = new URLSearchParams(
        window.location.search
    );

    return params.get(name) ?? fallback;
}

export function getQueryParams() {
    return new URLSearchParams(
        window.location.search
    );
}

export function updateQueryParams(
    values,
    options = {}
) {
    const {
        replace = true
    } = options;

    const url = new URL(window.location.href);

    for (const [key, value] of Object.entries(values)) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(
                key,
                String(value)
            );
        }
    }

    const method = replace
        ? "replaceState"
        : "pushState";

    window.history[method](
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
    );

    return url;
}

export function getPaginationData(
    pageData = {},
    defaultSize = 10
) {
    const nested = pageData.page &&
        typeof pageData.page === "object"
            ? pageData.page
            : {};

    const number = Math.max(
        0,
        toInteger(
            pageData.number ??
            pageData.pageNumber ??
            nested.number ??
            nested.pageNumber ??
            0
        )
    );

    const size = Math.max(
        1,
        toInteger(
            pageData.size ??
            pageData.pageSize ??
            nested.size ??
            defaultSize
        )
    );

    const totalElements = Math.max(
        0,
        toInteger(
            pageData.totalElements ??
            pageData.totalItems ??
            nested.totalElements ??
            0
        )
    );

    const totalPages = Math.max(
        0,
        toInteger(
            pageData.totalPages ??
            nested.totalPages ??
            Math.ceil(totalElements / size)
        )
    );

    return {
        page: number,
        size,
        totalElements,
        totalPages,
        first: number <= 0,
        last: totalPages === 0 ||
            number >= totalPages - 1,
        hasPrevious: number > 0,
        hasNext: number < totalPages - 1
    };
}

export function getPaginationItems(
    currentPage,
    totalPages,
    siblingCount = 1
) {
    const total = Math.max(
        0,
        toInteger(totalPages)
    );

    if (total === 0) {
        return [];
    }

    const current = clamp(
        toInteger(currentPage),
        0,
        total - 1
    );

    const siblings = Math.max(
        0,
        toInteger(siblingCount)
    );

    const selectedPages = new Set([
        0,
        total - 1
    ]);

    for (
        let page = Math.max(0, current - siblings);
        page <= Math.min(total - 1, current + siblings);
        page++
    ) {
        selectedPages.add(page);
    }

    const pages = [...selectedPages].sort(
        (a, b) => a - b
    );

    const result = [];

    for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const previous = pages[index - 1];

        if (
            previous !== undefined &&
            page - previous > 1
        ) {
            if (page - previous === 2) {
                result.push(previous + 1);
            } else {
                result.push("...");
            }
        }

        result.push(page);
    }

    return result;
}

export function renderPagination(
    target,
    pageData,
    onPageChange,
    options = {}
) {
    const container = resolveElement(target);

    if (!container) {
        return;
    }

    container.replaceChildren();

    const {
        siblingCount = 1
    } = options;

    const data = getPaginationData(pageData);

    if (data.totalPages <= 1) {
        return;
    }

    const currentPage = Math.min(
        data.page,
        data.totalPages - 1
    );

    const pages = getPaginationItems(
        currentPage,
        data.totalPages,
        siblingCount
    );

    function createPageButton(
        label,
        page,
        disabled = false,
        active = false
    ) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = active
            ? "pagination-button is-active"
            : "pagination-button";

        button.textContent = String(label);
        button.disabled = disabled;

        if (active) {
            button.setAttribute("aria-current", "page");
        }

        if (!disabled && !active) {
            button.addEventListener("click", () => {
                if (typeof onPageChange === "function") {
                    onPageChange(page);
                }
            });
        }

        return button;
    }

    container.appendChild(
        createPageButton(
            "‹",
            currentPage - 1,
            currentPage === 0
        )
    );

    for (const page of pages) {
        if (page === "...") {
            const dots = document.createElement("span");

            dots.className = "pagination-ellipsis";
            dots.textContent = "...";
            dots.setAttribute("aria-hidden", "true");

            container.appendChild(dots);

            continue;
        }

        container.appendChild(
            createPageButton(
                page + 1,
                page,
                false,
                page === currentPage
            )
        );
    }

    container.appendChild(
        createPageButton(
            "›",
            currentPage + 1,
            currentPage >= data.totalPages - 1
        )
    );
}

export function formatPaginationSummary(pageData) {
    const data = getPaginationData(pageData);

    if (data.totalElements === 0) {
        return "0 нәтиже";
    }

    const start = data.page * data.size + 1;

    const end = Math.min(
        data.totalElements,
        (data.page + 1) * data.size
    );

    return (
        `${formatInteger(start)}–${formatInteger(end)} / ` +
        `${formatInteger(data.totalElements)}`
    );
}

export function openModal(target) {
    const modal = resolveElement(target);

    if (!modal) {
        return null;
    }

    if (!openedModals.has(modal)) {
        modalPreviousFocus.set(
            modal,
            document.activeElement
        );

        openedModals.add(modal);
    }

    if (originalBodyOverflow === null) {
        originalBodyOverflow = document.body.style.overflow;
    }

    document.body.style.overflow = "hidden";

    showElement(modal);

    modal.setAttribute("aria-hidden", "false");

    const focusTarget = modal.querySelector(
        '[autofocus], [data-modal-focus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    );

    if (focusTarget) {
        focusTarget.focus();
    } else {
        modal.setAttribute("tabindex", "-1");
        modal.focus();
    }

    return modal;
}

export function closeModal(target) {
    const modal = resolveElement(target);

    if (!modal) {
        return null;
    }

    hideElement(modal);

    modal.setAttribute("aria-hidden", "true");
    openedModals.delete(modal);

    if (openedModals.size === 0) {
        document.body.style.overflow =
            originalBodyOverflow ?? "";

        originalBodyOverflow = null;
    }

    const previousFocus = modalPreviousFocus.get(modal);

    if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
    ) {
        previousFocus.focus();
    }

    modalPreviousFocus.delete(modal);

    return modal;
}

export function setupModal(
    target,
    options = {}
) {
    const modal = resolveElement(target);

    if (!modal) {
        return () => {};
    }

    const {
        closeButtons = [],
        closeOnBackdrop = true,
        closeOnEscape = true
    } = options;

    const buttonListeners = [];

    for (const selector of closeButtons) {
        const button = resolveElement(selector);

        if (!button) {
            continue;
        }

        const handler = () => {
            closeModal(modal);
        };

        button.addEventListener("click", handler);

        buttonListeners.push({
            button,
            handler
        });
    }

    const backdropHandler = event => {
        if (
            closeOnBackdrop &&
            event.target === modal
        ) {
            closeModal(modal);
        }
    };

    const escapeHandler = event => {
        if (
            event.key !== "Escape" ||
            !closeOnEscape ||
            !openedModals.has(modal)
        ) {
            return;
        }

        const activeModal = [...openedModals].at(-1);

        if (activeModal !== modal) {
            return;
        }

        closeModal(modal);
    };

    modal.addEventListener(
        "click",
        backdropHandler
    );

    document.addEventListener(
        "keydown",
        escapeHandler
    );

    return () => {
        modal.removeEventListener(
            "click",
            backdropHandler
        );

        document.removeEventListener(
            "keydown",
            escapeHandler
        );

        for (const entry of buttonListeners) {
            entry.button.removeEventListener(
                "click",
                entry.handler
            );
        }

        if (openedModals.has(modal)) {
            closeModal(modal);
        }
    };
}

export function isModalOpen(target) {
    const modal = resolveElement(target);

    return modal !== null &&
        openedModals.has(modal);
}

export function getFormValues(formTarget) {
    const form = resolveElement(formTarget);

    if (!(form instanceof HTMLFormElement)) {
        return {};
    }

    const result = {};

    for (const element of form.elements) {
        if (
            !element.name ||
            element.disabled
        ) {
            continue;
        }

        if (
            element instanceof HTMLInputElement &&
            element.type === "checkbox"
        ) {
            result[element.name] = element.checked;
            continue;
        }

        if (
            element instanceof HTMLInputElement &&
            element.type === "radio"
        ) {
            if (element.checked) {
                result[element.name] = element.value;
            }

            continue;
        }

        if ("value" in element) {
            result[element.name] = element.value;
        }
    }

    return result;
}

export function setFormError(
    fieldTarget,
    errorTarget,
    message
) {
    const field = resolveElement(fieldTarget);
    const error = resolveElement(errorTarget);

    if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("is-invalid");
    }

    if (error) {
        error.textContent = String(message ?? "");
        showElement(error);
    }
}

export function clearFormError(
    fieldTarget,
    errorTarget
) {
    const field = resolveElement(fieldTarget);
    const error = resolveElement(errorTarget);

    if (field) {
        field.removeAttribute("aria-invalid");
        field.classList.remove("is-invalid");
    }

    if (error) {
        error.textContent = "";
        hideElement(error);
    }
}

export function clearFormErrors(formTarget) {
    const form = resolveElement(formTarget);

    if (!form) {
        return;
    }

    qsa(
        '[aria-invalid="true"], .is-invalid',
        form
    ).forEach(field => {
        field.removeAttribute("aria-invalid");
        field.classList.remove("is-invalid");
    });

    qsa(".form-error", form).forEach(error => {
        error.textContent = "";
        hideElement(error);
    });
}

export function isValidEmail(value) {
    const email = String(value ?? "").trim();

    if (
        !email ||
        email.length > 254 ||
        /\s/.test(email)
    ) {
        return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getPasswordStrength(value) {
    const password = String(value ?? "");

    const requirements = {
        minLength: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };

    const fulfilled = Object.values(
        requirements
    ).filter(Boolean).length;

    let level = "empty";
    let label = "Құпиясөз енгізілмеген";

    if (password) {
        if (fulfilled <= 2) {
            level = "weak";
            label = "Әлсіз";
        } else if (fulfilled <= 4) {
            level = "medium";
            label = "Орташа";
        } else {
            level = "strong";
            label = "Күшті";
        }
    }

    return {
        level,
        label,
        score: password ? fulfilled : 0,
        percentage: password ? fulfilled * 20 : 0,
        requirements
    };
}

export async function copyToClipboard(value) {
    const text = String(value ?? "");

    if (!navigator.clipboard?.writeText) {
        throw new Error(
            "Бұл браузерде Clipboard API қолжетімсіз."
        );
    }

    await navigator.clipboard.writeText(text);

    return true;
}

export function scrollToElement(
    target,
    options = {}
) {
    const element = resolveElement(target);

    if (!element) {
        return;
    }

    const {
        behavior = "smooth",
        block = "start"
    } = options;

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    element.scrollIntoView({
        behavior: reduceMotion
            ? "auto"
            : behavior,
        block
    });
}

export const utils = {
    toNumber,
    toInteger,
    parsePositiveId,
    clamp,

    formatNumber,
    formatInteger,
    formatCurrency,
    formatPrice,
    formatMoney,
    formatPercentage,
    calculatePercentage,
    calculateDiscount,
    formatDiscount,

    parseDate,
    formatDate,
    formatShortDate,
    formatDateTime,
    formatTime,
    formatRelativeDate,

    escapeHtml,
    escapeHTML,
    escapeAttribute,
    normalizeText,
    truncateText,
    capitalize,
    getInitials,

    normalizeStatus,
    formatStatus,
    getStatusVariant,
    getStatusBadgeClass,
    renderStatusBadge,

    getSafeImageUrl,
    setImage,

    resolveElement,
    byId,
    qs,
    qsa,
    showElement,
    hideElement,
    toggleElement,
    isVisible,
    setText,
    setValue,
    setDisabled,
    clearElement,
    createElement,
    setButtonLoading,

    debounce,
    throttle,
    sleep,

    getQueryParam,
    getQueryParams,
    updateQueryParams,

    getPaginationData,
    getPaginationItems,
    renderPagination,
    formatPaginationSummary,

    openModal,
    closeModal,
    setupModal,
    isModalOpen,

    getFormValues,
    setFormError,
    clearFormError,
    clearFormErrors,
    isValidEmail,
    getPasswordStrength,

    copyToClipboard,
    scrollToElement
};

export default utils;
