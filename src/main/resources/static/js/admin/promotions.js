
import api, { getErrorMessage } from "../core/api.js";
import { formatCurrency, formatInteger } from "../core/utils.js";
import { showSuccess, showError, showInfo } from "../components/toast.js";

const $ = id => document.getElementById(id);

const API_PAGE_SIZE = 100;
const MAX_API_PAGES = 100;
const DEFAULT_PAGE_SIZE = 10;

const PAGE_SIZES = new Set([
    10,
    20,
    50
]);

const DISCOUNT_TYPES = new Set([
    "PERCENTAGE",
    "FIXED"
]);

const STATUS_FILTERS = new Set([
    "ALL",
    "ACTIVE",
    "INACTIVE"
]);

const SORT_MODES = new Set([
    "id-desc",
    "id-asc",
    "code-asc",
    "code-desc",
    "value-desc",
    "value-asc"
]);

const IDS = Object.freeze({
    content: "admin-promotions-content",
    refresh: "admin-promotions-refresh-button",
    retry: "admin-promotions-retry-button",
    loading: "admin-promotions-loading",
    error: "admin-promotions-error",
    errorMessage: "admin-promotions-error-message",
    total: "admin-promotions-total",
    active: "admin-promotions-active",
    inactive: "admin-promotions-inactive",
    percentage: "admin-promotions-percentage",
    results: "admin-promotions-results-count",
    tableWrapper: "admin-promotions-table-container",
    tbody: "admin-promotions-table-body",
    footer: "admin-promotions-table-footer",
    pagination: "admin-promotions-pagination",
    paginationInfo: "admin-promotions-pagination-info",
    empty: "admin-promotions-empty",
    filterEmpty: "admin-promotions-filter-empty",
    search: "admin-promotions-search",
    searchForm: "admin-promotions-search-form",
    statusTabs: "admin-promotions-status-tabs",
    filters: "admin-promotions-filters",
    filterToggle: "admin-promotions-filter-toggle",
    filterForm: "admin-promotions-filter-form",
    statusFilter: "admin-promotions-status-filter",
    typeFilter: "admin-promotions-type-filter",
    sort: "admin-promotions-sort",
    size: "admin-promotions-page-size",
    clearSearch: "admin-promotions-clear-search",
    formModal: "admin-promotion-form-modal",
    form: "admin-promotion-form",
    formTitle: "admin-promotion-form-modal-title",
    formDescription: "admin-promotion-form-modal-description",
    formEyebrow: "admin-promotion-form-eyebrow",
    formError: "admin-promotion-form-error",
    formId: "admin-promotion-id",
    code: "admin-promotion-code",
    codeError: "admin-promotion-code-error",
    type: "admin-promotion-discount-type",
    typeError: "admin-promotion-type-error",
    value: "admin-promotion-value",
    valueError: "admin-promotion-value-error",
    valueUnit: "admin-promotion-value-unit",
    valueHint: "admin-promotion-value-hint",
    activeToggle: "admin-promotion-active",
    previewCode: "admin-promotion-preview-code",
    previewDescription: "admin-promotion-preview-description",
    previewStatus: "admin-promotion-preview-status",
    formSave: "admin-promotion-save-button",
    formSaveText: "admin-promotion-save-text",
    formCancel: "admin-promotion-form-cancel",
    formClose: "admin-promotion-form-modal-close",
    statusModal: "admin-promotion-status-modal",
    statusHeading: "admin-promotion-status-heading",
    statusDescription: "admin-promotion-status-modal-description",
    statusCode: "admin-promotion-status-code",
    statusId: "admin-promotion-status-id",
    statusCurrent: "admin-promotion-status-current",
    statusNext: "admin-promotion-status-next",
    statusError: "admin-promotion-status-error",
    statusConfirm: "admin-promotion-status-confirm",
    statusConfirmText: "admin-promotion-status-confirm-text",
    statusCancel: "admin-promotion-status-cancel",
    statusClose: "admin-promotion-status-close",
    deleteModal: "admin-promotion-delete-modal",
    deleteCode: "admin-promotion-delete-code",
    deleteId: "admin-promotion-delete-id",
    deleteType: "admin-promotion-delete-type",
    deleteValue: "admin-promotion-delete-value",
    deleteError: "admin-promotion-delete-error",
    deleteConfirm: "admin-promotion-delete-confirm",
    deleteConfirmText: "admin-promotion-delete-confirm-text",
    deleteCancel: "admin-promotion-delete-cancel",
    deleteClose: "admin-promotion-delete-close"
});

const CREATE_BUTTON_IDS = Object.freeze([
    "admin-add-promotion-button",
    "admin-promotion-banner-create",
    "admin-promotions-section-create",
    "admin-promotions-empty-create",
    "admin-promotion-quick-create"
]);

const ENDPOINT_DEFAULTS = Object.freeze({
    list: "/api/promotions",
    create: "/api/promotions",
    update: "/api/promotions/{id}",
    status: "/api/promotions/{id}/status",
    delete: "/api/promotions/{id}"
});

const ENDPOINT_ATTRIBUTES = Object.freeze({
    list: "promotionsEndpoint",
    create: "promotionCreateEndpoint",
    update: "promotionUpdateEndpoint",
    status: "promotionStatusEndpoint",
    delete: "promotionDeleteEndpoint"
});

let initialized = false;
let active = false;
let loading = false;
let mutating = false;
let requestVersion = 0;
let listeners = null;
let searchTimer = null;
let promotions = [];
let editingId = null;
let pendingStatus = null;
let pendingDelete = null;
let activeModal = null;
let modalReturnFocus = null;
let initialBodyOverflow = "";

let state = initialState();

function initialState() {
    return {
        keyword: "",
        status: "ALL",
        type: "ALL",
        sort: "id-desc",
        pageSize: DEFAULT_PAGE_SIZE,
        page: 0
    };
}

function element(tagName, className = "", label = null) {
    const created = document.createElement(tagName);

    if (className) {
        created.className = className;
    }

    if (label !== null && label !== undefined) {
        created.textContent = String(label);
    }

    return created;
}

function setText(id, value) {
    const target = $(id);

    if (target) {
        target.textContent = String(value ?? "—");
    }
}

function setVisible(id, visible) {
    const target = $(id);

    if (!target) {
        return;
    }

    target.hidden = !visible;
    target.classList.toggle("hidden", !visible);
}

function setButtonBusy(id, busy, label = null) {
    const button = $(id);

    if (!(button instanceof HTMLButtonElement)) {
        return;
    }

    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));

    if (label !== null) {
        const textId = id === IDS.formSave
            ? IDS.formSaveText
            : id === IDS.statusConfirm
                ? IDS.statusConfirmText
                : id === IDS.deleteConfirm
                    ? IDS.deleteConfirmText
                    : null;

        if (textId) {
            setText(textId, label);
        }
    }
}

function validId(value) {
    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}

function numeric(value) {
    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function normalizePromotion(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const id = validId(raw.id ?? raw.promotionId);

    if (id === null) {
        return null;
    }

    const status = String(raw.status ?? "")
        .trim()
        .toUpperCase();

    const active = typeof raw.active === "boolean"
        ? raw.active
        : typeof raw.isActive === "boolean"
            ? raw.isActive
            : status === "ACTIVE"
                ? true
                : status === "INACTIVE"
                    ? false
                    : null;

    return {
        id,
        code: String(raw.code ?? "").trim(),
        discountType: String(
            raw.discountType ?? raw.type ?? ""
        )
            .trim()
            .toUpperCase(),
        value: numeric(
            raw.value ?? raw.discountValue
        ),
        active
    };
}

function extractList(response) {
    if (Array.isArray(response)) {
        return response;
    }

    const candidates = [
        response?.content,
        response?.promotions,
        response?.data?.content,
        response?.data?.promotions,
        response?.data
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        "Сервер промокодтарды күтілген тізім форматында қайтармады."
    );
}

function getPaginationMetadata(response) {
    if (Array.isArray(response)) {
        return null;
    }

    const body = response?.data?.content
        ? response.data
        : response;

    if (
        body?.totalPages === undefined ||
        body?.totalPages === null
    ) {
        return null;
    }

    const totalPages = Number(body.totalPages);

    if (
        !Number.isSafeInteger(totalPages) ||
        totalPages < 0
    ) {
        throw new Error(
            "Сервер қайтарған pagination деректері дұрыс емес."
        );
    }

    return { totalPages };
}

function apiPath(kind, id = null) {
    const defaultPath = ENDPOINT_DEFAULTS[kind];
    const attribute = ENDPOINT_ATTRIBUTES[kind];

    if (!defaultPath || !attribute) {
        throw new Error(
            "Белгісіз API операциясы."
        );
    }

    const needsId = [
        "update",
        "delete",
        "status"
    ].includes(kind);

    if (needsId && validId(id) === null) {
        throw new Error(
            "Промокод идентификаторы дұрыс емес."
        );
    }

    const template =
        document.body.dataset[attribute] ||
        defaultPath;

    if (
        needsId &&
        !template.includes("{id}") &&
        !template.includes(":id")
    ) {
        throw new Error(
            "API endpoint ішінде промокод ID орны көрсетілмеген."
        );
    }

    const resolved = template
        .replaceAll("{id}", String(id ?? ""))
        .replaceAll(":id", String(id ?? ""));

    const url = new URL(
        resolved,
        window.location.origin
    );

    if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith("/api/") ||
        url.hash !== ""
    ) {
        throw new Error(
            "API endpoint адресі жарамсыз."
        );
    }

    return `${url.pathname}${url.search}`;
}

function withPage(path, page) {
    const url = new URL(
        path,
        window.location.origin
    );

    url.searchParams.set(
        "page",
        String(page)
    );

    url.searchParams.set(
        "size",
        String(API_PAGE_SIZE)
    );

    return `${url.pathname}${url.search}`;
}

async function fetchAllPromotions(version) {
    const endpoint = apiPath("list");
    const collected = [];

    for (
        let page = 0;
        page < MAX_API_PAGES;
        page++
    ) {
        const result = await api.get(
            withPage(endpoint, page)
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return null;
        }

        const current = extractList(result);

        collected.push(...current);

        const pagination =
            getPaginationMetadata(result);

        if (
            !pagination ||
            page + 1 >= pagination.totalPages
        ) {
            return collected;
        }
    }

    throw new Error(
        "100 беттен артық промокод бар. Backend-та серверлік pagination қажет."
    );
}

function clearCounters() {
    for (const id of [
        IDS.total,
        IDS.active,
        IDS.inactive,
        IDS.percentage
    ]) {
        setText(id, "—");
    }
}

function showListError(error) {
    clearCounters();

    const message = typeof error === "string"
        ? error
        : getErrorMessage(error);

    setText(
        IDS.errorMessage,
        message
    );

    setText(
        IDS.results,
        "Промокодтарды жүктеу мүмкін болмады."
    );

    setVisible(IDS.error, true);
    setVisible(IDS.loading, false);
    setVisible(IDS.tableWrapper, false);
    setVisible(IDS.footer, false);
    setVisible(IDS.empty, false);
    setVisible(IDS.filterEmpty, false);

    $(IDS.tbody)?.replaceChildren();
    $(IDS.pagination)?.replaceChildren();

    if (!$(IDS.error)) {
        showError(message);
    }
}

function setLoading(value) {
    loading = value;

    setVisible(
        IDS.loading,
        value
    );

    setButtonBusy(
        IDS.refresh,
        value
    );

    setButtonBusy(
        IDS.retry,
        value
    );

    if (value) {
        setVisible(IDS.error, false);
        setVisible(IDS.empty, false);
        setVisible(IDS.filterEmpty, false);
        setVisible(IDS.tableWrapper, false);
        setVisible(IDS.footer, false);
    }
}

async function loadPromotions() {
    if (!active) {
        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const response =
            await fetchAllPromotions(version);

        if (
            !active ||
            version !== requestVersion ||
            response === null
        ) {
            return;
        }

        const unique = new Map();

        for (const record of response) {
            const promotion =
                normalizePromotion(record);

            if (promotion) {
                unique.set(
                    promotion.id,
                    promotion
                );
            }
        }

        promotions = [
            ...unique.values()
        ];

        render();
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        promotions = [];

        showListError(error);
    } finally {
        if (
            active &&
            version === requestVersion
        ) {
            setLoading(false);
        }
    }
}

function getPromotion(id) {
    return promotions.find(
        item => item.id === validId(id)
    ) ?? null;
}

function formatDiscount(item) {
    if (item.value === null) {
        return "—";
    }

    return item.discountType === "PERCENTAGE"
        ? `${item.value}%`
        : item.discountType === "FIXED"
            ? formatCurrency(item.value)
            : "—";
}

function statusLabel(item) {
    return item.active === true
        ? "ACTIVE"
        : item.active === false
            ? "INACTIVE"
            : "UNKNOWN";
}

function statusBadge(item) {
    const status = statusLabel(item);

    const variant = status === "ACTIVE"
        ? "success"
        : status === "INACTIVE"
            ? "warning"
            : "neutral";

    return element(
        "span",
        `badge badge-${variant}`,
        status
    );
}

function actionButton(
    item,
    action,
    label,
    variant = "btn btn-outline btn-sm"
) {
    const button = element(
        "button",
        variant,
        label
    );

    button.type = "button";

    button.dataset.promotionAction =
        action;

    button.dataset.promotionId =
        String(item.id);

    button.setAttribute(
        "aria-label",
        `${label}: ${item.code}`
    );

    if (
        action === "status" &&
        item.active === null
    ) {
        button.disabled = true;

        button.title =
            "Сервер промокод белсенділігін қайтармады.";
    }

    return button;
}

function promotionRow(item) {
    const row = document.createElement("tr");

    row.dataset.promotionId =
        String(item.id);

    const codeCell = element("td");

    const codeButton = element(
        "button",
        "admin-promotion-code-button",
        item.code || "—"
    );

    codeButton.type = "button";
    codeButton.dataset.promotionAction = "edit";
    codeButton.dataset.promotionId = String(item.id);
    codeButton.title = "Промокодты өңдеу";

    codeCell.appendChild(codeButton);

    const typeCell = element("td");

    typeCell.appendChild(
        element(
            "span",
            `badge ${
                item.discountType === "PERCENTAGE"
                    ? "badge-primary"
                    : "badge-success"
            }`,
            item.discountType || "—"
        )
    );

    const valueCell = element(
        "td",
        "admin-promotion-table-value",
        formatDiscount(item)
    );

    const statusCell = element("td");

    statusCell.appendChild(
        statusBadge(item)
    );

    const idCell = element(
        "td",
        "admin-promotion-table-id",
        `#${item.id}`
    );

    const actionsCell = element("td");

    const actions = element(
        "div",
        "admin-table-actions admin-promotions-table-actions"
    );

    actions.append(
        actionButton(
            item,
            "edit",
            "Edit"
        ),
        actionButton(
            item,
            "status",
            item.active === true
                ? "Deactivate"
                : "Activate"
        ),
        actionButton(
            item,
            "delete",
            "Delete",
            "btn btn-danger-outline btn-sm"
        )
    );

    actionsCell.appendChild(actions);

    row.append(
        codeCell,
        typeCell,
        valueCell,
        statusCell,
        idCell,
        actionsCell
    );

    return row;
}

function matchesFilters(item) {
    if (
        state.status !== "ALL" &&
        statusLabel(item) !== state.status
    ) {
        return false;
    }

    if (
        state.type !== "ALL" &&
        item.discountType !== state.type
    ) {
        return false;
    }

    const term = state.keyword
        .trim()
        .toLocaleLowerCase();

    if (!term) {
        return true;
    }

    const searchable = [
        item.code,
        item.id,
        item.discountType,
        statusLabel(item)
    ]
        .join(" ")
        .toLocaleLowerCase();

    return searchable.includes(term);
}

function sortPromotions(items) {
    return items.sort(
        (first, second) => {
            switch (state.sort) {
                case "id-asc":
                    return first.id - second.id;

                case "code-asc":
                    return (
                        first.code.localeCompare(
                            second.code
                        ) ||
                        second.id - first.id
                    );

                case "code-desc":
                    return (
                        second.code.localeCompare(
                            first.code
                        ) ||
                        second.id - first.id
                    );

                case "value-asc":
                    return (
                        (first.value ?? -Infinity) -
                        (second.value ?? -Infinity) ||
                        second.id - first.id
                    );

                case "value-desc":
                    return (
                        (second.value ?? -Infinity) -
                        (first.value ?? -Infinity) ||
                        second.id - first.id
                    );

                default:
                    return second.id - first.id;
            }
        }
    );
}

function filteredPromotions() {
    return sortPromotions(
        promotions.filter(matchesFilters)
    );
}

function renderStats() {
    setText(
        IDS.total,
        formatInteger(promotions.length)
    );

    setText(
        IDS.active,
        formatInteger(
            promotions.filter(
                promotion =>
                    promotion.active === true
            ).length
        )
    );

    setText(
        IDS.inactive,
        formatInteger(
            promotions.filter(
                promotion =>
                    promotion.active === false
            ).length
        )
    );

    setText(
        IDS.percentage,
        formatInteger(
            promotions.filter(
                promotion =>
                    promotion.discountType === "PERCENTAGE"
            ).length
        )
    );
}

function paginationButton(
    textValue,
    page,
    disabled = false,
    current = false
) {
    const button = element(
        "button",
        "pagination-button",
        textValue
    );

    button.type = "button";
    button.dataset.page = String(page);

    button.disabled =
        disabled || current;

    button.classList.toggle(
        "is-active",
        current
    );

    if (current) {
        button.setAttribute(
            "aria-current",
            "page"
        );
    }

    return button;
}

function paginationEllipsis() {
    return element(
        "span",
        "pagination-ellipsis",
        "…"
    );
}

function renderPagination(totalPages) {
    const holder = $(IDS.pagination);

    if (!holder) {
        return;
    }

    holder.replaceChildren();

    if (totalPages <= 1) {
        return;
    }

    const fragment =
        document.createDocumentFragment();

    fragment.appendChild(
        paginationButton(
            "Previous",
            state.page - 1,
            state.page === 0
        )
    );

    const first = Math.max(
        0,
        state.page - 2
    );

    const last = Math.min(
        totalPages - 1,
        state.page + 2
    );

    if (first > 0) {
        fragment.appendChild(
            paginationButton(
                "1",
                0
            )
        );

        if (first > 1) {
            fragment.appendChild(
                paginationEllipsis()
            );
        }
    }

    for (
        let page = first;
        page <= last;
        page++
    ) {
        fragment.appendChild(
            paginationButton(
                String(page + 1),
                page,
                false,
                page === state.page
            )
        );
    }

    if (last < totalPages - 1) {
        if (last < totalPages - 2) {
            fragment.appendChild(
                paginationEllipsis()
            );
        }

        fragment.appendChild(
            paginationButton(
                String(totalPages),
                totalPages - 1
            )
        );
    }

    fragment.appendChild(
        paginationButton(
            "Next",
            state.page + 1,
            state.page >= totalPages - 1
        )
    );

    holder.appendChild(fragment);
}

function syncStatusTabs() {
    const container = $(IDS.statusTabs);

    if (!container) {
        return;
    }

    for (
        const button of container.querySelectorAll(
            "[data-status]"
        )
    ) {
        const selected =
            button.dataset.status === state.status;

        button.classList.toggle(
            "is-active",
            selected
        );

        button.setAttribute(
            "aria-pressed",
            String(selected)
        );
    }
}

function syncFilterControls() {
    const values = {
        [IDS.search]: state.keyword,
        [IDS.statusFilter]: state.status,
        [IDS.typeFilter]: state.type,
        [IDS.sort]: state.sort,
        [IDS.size]: String(state.pageSize)
    };

    for (
        const [id, value] of Object.entries(values)
    ) {
        const input = $(id);

        if (
            input &&
            input.value !== value
        ) {
            input.value = value;
        }
    }

    syncStatusTabs();
}

function render() {
    if (!active) {
        return;
    }

    const filtered = filteredPromotions();

    const totalPages = Math.ceil(
        filtered.length / state.pageSize
    );

    state.page = Math.min(
        state.page,
        Math.max(0, totalPages - 1)
    );

    const startIndex =
        state.page * state.pageSize;

    const visibleItems = filtered.slice(
        startIndex,
        startIndex + state.pageSize
    );

    renderStats();

    setText(
        IDS.results,
        `${formatInteger(filtered.length)} промокод табылды`
    );

    setText(
        IDS.paginationInfo,
        visibleItems.length > 0
            ? `${
                startIndex + 1
            }–${
                startIndex + visibleItems.length
            } / ${filtered.length}`
            : "0 / 0"
    );

    setVisible(
        IDS.error,
        false
    );

    setVisible(
        IDS.empty,
        promotions.length === 0
    );

    setVisible(
        IDS.filterEmpty,
        promotions.length > 0 &&
        filtered.length === 0
    );

    setVisible(
        IDS.tableWrapper,
        visibleItems.length > 0
    );

    setVisible(
        IDS.footer,
        visibleItems.length > 0
    );

    const tableBody = $(IDS.tbody);

    if (tableBody) {
        const fragment =
            document.createDocumentFragment();

        for (const item of visibleItems) {
            fragment.appendChild(
                promotionRow(item)
            );
        }

        tableBody.replaceChildren(
            fragment
        );
    }

    renderPagination(totalPages);
    syncFilterControls();
}

function setStatusFilter(status) {
    state.status = STATUS_FILTERS.has(status)
        ? status
        : "ALL";

    state.page = 0;

    render();
}

function applyFilters() {
    const status =
        $(IDS.statusFilter)?.value ?? "ALL";

    const type =
        $(IDS.typeFilter)?.value ?? "ALL";

    const sort =
        $(IDS.sort)?.value ?? "id-desc";

    const size = Number(
        $(IDS.size)?.value
    );

    state.status = STATUS_FILTERS.has(status)
        ? status
        : "ALL";

    state.type = DISCOUNT_TYPES.has(type)
        ? type
        : "ALL";

    state.sort = SORT_MODES.has(sort)
        ? sort
        : "id-desc";

    state.pageSize = PAGE_SIZES.has(size)
        ? size
        : DEFAULT_PAGE_SIZE;

    state.keyword = String(
        $(IDS.search)?.value ?? ""
    ).trim();

    state.page = 0;

    render();
}

function resetFilters() {
    window.clearTimeout(searchTimer);

    searchTimer = null;
    state = initialState();

    render();
}

function changePage(page) {
    if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page === state.page
    ) {
        return;
    }

    const total = Math.ceil(
        filteredPromotions().length /
        state.pageSize
    );

    if (page >= total) {
        return;
    }

    state.page = page;

    render();

    $(IDS.tableWrapper)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function currentModal() {
    return activeModal
        ? $(activeModal)
        : null;
}

function focusableElements(modal) {
    return [
        ...modal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ].filter(
        item =>
            !item.hidden &&
            item.getClientRects().length > 0
    );
}

function showModal(id, focusId = null) {
    if (mutating) {
        return;
    }

    const modal = $(id);

    if (!modal) {
        showError(
            "Қажетті терезе HTML-де табылмады."
        );

        return;
    }

    if (
        activeModal &&
        activeModal !== id
    ) {
        hideModal(
            activeModal,
            false
        );
    }

    if (!activeModal) {
        modalReturnFocus =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        initialBodyOverflow =
            document.body.style.overflow;
    }

    activeModal = id;

    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "modal-open"
    );

    document.body.style.overflow =
        "hidden";

    const preferred = focusId
        ? $(focusId)
        : null;

    const focusTarget =
        preferred ??
        focusableElements(modal)[0] ??
        modal;

    focusTarget.focus({
        preventScroll: true
    });
}

function hideModal(
    id = activeModal,
    restoreFocus = true
) {
    const modal = id
        ? $(id)
        : null;

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "is-open"
    );

    modal.classList.add(
        "hidden"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    modal.hidden = true;

    if (activeModal === id) {
        activeModal = null;

        document.body.classList.remove(
            "modal-open"
        );

        document.body.style.overflow =
            initialBodyOverflow;

        if (
            restoreFocus &&
            modalReturnFocus?.isConnected
        ) {
            modalReturnFocus.focus({
                preventScroll: true
            });
        }

        modalReturnFocus = null;
    }
}

function setModalError(id, error) {
    const message = typeof error === "string"
        ? error
        : getErrorMessage(error);

    setText(id, message);
    setVisible(id, true);
}

function hideAllModalErrors() {
    for (const id of [
        IDS.formError,
        IDS.statusError,
        IDS.deleteError
    ]) {
        setVisible(id, false);
        setText(id, "");
    }
}

function clearValidationErrors() {
    hideAllModalErrors();

    for (
        const [fieldId, errorId] of [
            [IDS.code, IDS.codeError],
            [IDS.type, IDS.typeError],
            [IDS.value, IDS.valueError]
        ]
    ) {
        $(fieldId)?.removeAttribute(
            "aria-invalid"
        );

        $(fieldId)?.classList.remove(
            "is-invalid"
        );

        setVisible(errorId, false);
        setText(errorId, "");
    }
}

function validationError(
    fieldId,
    errorId,
    message
) {
    const field = $(fieldId);

    field?.setAttribute(
        "aria-invalid",
        "true"
    );

    field?.classList.add(
        "is-invalid"
    );

    setText(
        errorId,
        message
    );

    setVisible(
        errorId,
        true
    );

    field?.focus();

    return false;
}

function updatePreview() {
    const code = String(
        $(IDS.code)?.value ?? ""
    )
        .trim()
        .toUpperCase();

    const type =
        $(IDS.type)?.value ?? "PERCENTAGE";

    const rawValue =
        $(IDS.value)?.value ?? "";

    const value = numeric(rawValue);

    const checked =
        $(IDS.activeToggle)?.checked === true;

    setText(
        IDS.previewCode,
        code || "YOURCODE"
    );

    setText(
        IDS.previewStatus,
        checked ? "ACTIVE" : "INACTIVE"
    );

    const badge =
        $(IDS.previewStatus);

    badge?.classList.toggle(
        "badge-success",
        checked
    );

    badge?.classList.toggle(
        "badge-warning",
        !checked
    );

    const valueInput =
        $(IDS.value);

    if (
        valueInput instanceof HTMLInputElement
    ) {
        if (type === "PERCENTAGE") {
            valueInput.max = "100";
        } else {
            valueInput.removeAttribute(
                "max"
            );
        }
    }

    setText(
        IDS.valueUnit,
        type === "FIXED" ? "₸" : "%"
    );

    setText(
        IDS.valueHint,
        type === "FIXED"
            ? "Бекітілген жеңілдік мөлшерін теңгемен енгіз."
            : "Пайыздық жеңілдік 0-ден үлкен және 100-ден аспауы керек."
    );

    const description =
        value !== null && value > 0
            ? type === "FIXED"
                ? `${formatCurrency(value)} жеңілдік`
                : `${value}% жеңілдік`
            : "Жеңілдік мөлшерін енгіз";

    setText(
        IDS.previewDescription,
        description
    );
}

function populateForm(item) {
    const form = $(IDS.form);

    if (
        !(form instanceof HTMLFormElement)
    ) {
        showError(
            "Промокод формасы HTML-де табылмады."
        );

        return false;
    }

    form.reset();

    clearValidationErrors();

    const idInput =
        $(IDS.formId);

    const codeInput =
        $(IDS.code);

    const typeInput =
        $(IDS.type);

    const valueInput =
        $(IDS.value);

    const activeInput =
        $(IDS.activeToggle);

    if (
        !(codeInput instanceof HTMLInputElement) ||
        !(typeInput instanceof HTMLSelectElement) ||
        !(valueInput instanceof HTMLInputElement) ||
        !(activeInput instanceof HTMLInputElement)
    ) {
        showError(
            "Промокод формасындағы өрістер толық емес."
        );

        return false;
    }

    if (idInput) {
        idInput.value = item
            ? String(item.id)
            : "";
    }

    codeInput.value =
        item?.code ?? "";

    typeInput.value =
        DISCOUNT_TYPES.has(
            item?.discountType
        )
            ? item.discountType
            : "PERCENTAGE";

    valueInput.value =
        item?.value !== null &&
        item?.value !== undefined
            ? String(item.value)
            : "";

    activeInput.checked = item
        ? item.active !== false
        : true;

    editingId =
        item?.id ?? null;

    setText(
        IDS.formTitle,
        item
            ? "Edit Promotion"
            : "Create Promotion"
    );

    setText(
        IDS.formEyebrow,
        item
            ? "EDIT CAMPAIGN"
            : "PROMOTION EDITOR"
    );

    setText(
        IDS.formDescription,
        item
            ? "Промокодтың параметрлерін өзгертіп, сақта."
            : "Жаңа промокодтың атауын, жеңілдік түрін, мөлшерін және белсенділігін орнат."
    );

    setText(
        IDS.formSaveText,
        item
            ? "Save Changes"
            : "Save Promotion"
    );

    updatePreview();

    return true;
}

function openForm(item = null) {
    if (!active || mutating) {
        return;
    }

    if (
        item &&
        !getPromotion(item.id)
    ) {
        showError(
            "Промокод тізімнен табылмады."
        );

        return;
    }

    if (!populateForm(item)) {
        return;
    }

    showModal(
        IDS.formModal,
        IDS.code
    );
}

function readPayload() {
    return {
        code: String(
            $(IDS.code)?.value ?? ""
        )
            .trim()
            .toUpperCase(),

        discountType: String(
            $(IDS.type)?.value ?? ""
        )
            .trim()
            .toUpperCase(),

        value: numeric(
            $(IDS.value)?.value
        ),

        active:
            $(IDS.activeToggle)?.checked === true
    };
}

function validatePayload(payload) {
    clearValidationErrors();

    if (
        !/^[A-Z0-9_-]{3,50}$/.test(
            payload.code
        )
    ) {
        return validationError(
            IDS.code,
            IDS.codeError,
            "Код 3–50 таңбадан тұруы керек. Әріп, сан, _ және - қолдануға болады."
        );
    }

    const duplicate = promotions.some(
        item =>
            item.id !== editingId &&
            item.code.toUpperCase() ===
                payload.code
    );

    if (duplicate) {
        return validationError(
            IDS.code,
            IDS.codeError,
            "Мұндай промокод бұрыннан бар."
        );
    }

    if (
        !DISCOUNT_TYPES.has(
            payload.discountType
        )
    ) {
        return validationError(
            IDS.type,
            IDS.typeError,
            "Жеңілдік түрін таңда."
        );
    }

    if (
        payload.value === null ||
        payload.value <= 0
    ) {
        return validationError(
            IDS.value,
            IDS.valueError,
            "Жеңілдік нөлден үлкен сан болуы керек."
        );
    }

    if (
        payload.discountType === "PERCENTAGE" &&
        payload.value > 100
    ) {
        return validationError(
            IDS.value,
            IDS.valueError,
            "Пайыздық жеңілдік 100%-дан аспауы керек."
        );
    }

    const priceInput = $(IDS.value);

    if (
        priceInput instanceof HTMLInputElement &&
        !priceInput.checkValidity()
    ) {
        return validationError(
            IDS.value,
            IDS.valueError,
            "Жеңілдік мөлшерін дұрыс енгіз."
        );
    }

    return true;
}

async function savePromotion(event) {
    event.preventDefault();

    if (
        !active ||
        mutating ||
        loading
    ) {
        return;
    }

    const payload = readPayload();

    if (!validatePayload(payload)) {
        return;
    }

    const wasEditing =
        editingId !== null;

    const targetId =
        editingId;

    mutating = true;

    setButtonBusy(
        IDS.formSave,
        true,
        "Saving..."
    );

    setVisible(
        IDS.formError,
        false
    );

    try {
        const path = apiPath(
            wasEditing
                ? "update"
                : "create",
            targetId
        );

        if (wasEditing) {
            await api.put(
                path,
                payload
            );
        } else {
            await api.post(
                path,
                payload
            );
        }

        if (!active) {
            return;
        }

        hideModal(
            IDS.formModal
        );

        editingId = null;
        state.page = 0;

        showSuccess(
            wasEditing
                ? "Промокод сәтті жаңартылды."
                : "Промокод сәтті қосылды."
        );

        await loadPromotions();
    } catch (error) {
        if (active) {
            setModalError(
                IDS.formError,
                error
            );
        }
    } finally {
        mutating = false;

        setButtonBusy(
            IDS.formSave,
            false
        );

        setText(
            IDS.formSaveText,
            editingId === null
                ? "Save Promotion"
                : "Save Changes"
        );
    }
}

function openStatusModal(id) {
    if (
        !active ||
        mutating
    ) {
        return;
    }

    const item =
        getPromotion(id);

    if (!item) {
        showError(
            "Промокод табылмады."
        );

        return;
    }

    if (item.active === null) {
        showInfo(
            "Сервер промокодтың ағымдағы статусын қайтармады."
        );

        return;
    }

    pendingStatus = {
        id: item.id,
        from: item.active,
        to: !item.active
    };

    setText(
        IDS.statusHeading,
        pendingStatus.to
            ? "Промокодты белсендіру"
            : "Промокодты өшіру"
    );

    setText(
        IDS.statusDescription,
        pendingStatus.to
            ? "Промокодты белсендіруге растау бер."
            : "Промокодты белсенді емес күйге ауыстыруды раста."
    );

    setText(
        IDS.statusCode,
        item.code
    );

    setText(
        IDS.statusId,
        `Promotion ID: ${item.id}`
    );

    setText(
        IDS.statusCurrent,
        item.active
            ? "ACTIVE"
            : "INACTIVE"
    );

    setText(
        IDS.statusNext,
        pendingStatus.to
            ? "ACTIVE"
            : "INACTIVE"
    );

    setText(
        IDS.statusConfirmText,
        pendingStatus.to
            ? "Activate"
            : "Deactivate"
    );

    setVisible(
        IDS.statusError,
        false
    );

    showModal(
        IDS.statusModal,
        IDS.statusConfirm
    );
}

async function confirmStatus() {
    if (
        !active ||
        mutating ||
        !pendingStatus
    ) {
        return;
    }

    const selection = {
        ...pendingStatus
    };

    mutating = true;

    setButtonBusy(
        IDS.statusConfirm,
        true,
        "Updating..."
    );

    setVisible(
        IDS.statusError,
        false
    );

    try {
        await api.patch(
            apiPath(
                "status",
                selection.id
            ),
            {
                active: selection.to
            }
        );

        if (!active) {
            return;
        }

        hideModal(
            IDS.statusModal
        );

        pendingStatus = null;

        showSuccess(
            selection.to
                ? "Промокод белсендірілді."
                : "Промокод өшірілді."
        );

        await loadPromotions();
    } catch (error) {
        if (active) {
            setModalError(
                IDS.statusError,
                error
            );
        }
    } finally {
        mutating = false;

        setButtonBusy(
            IDS.statusConfirm,
            false
        );

        setText(
            IDS.statusConfirmText,
            pendingStatus?.to
                ? "Activate"
                : "Deactivate"
        );
    }
}

function openDeleteModal(id) {
    if (
        !active ||
        mutating
    ) {
        return;
    }

    const item =
        getPromotion(id);

    if (!item) {
        showError(
            "Промокод табылмады."
        );

        return;
    }

    pendingDelete = item.id;

    setText(
        IDS.deleteCode,
        item.code
    );

    setText(
        IDS.deleteId,
        `Promotion ID: ${item.id}`
    );

    setText(
        IDS.deleteType,
        item.discountType
    );

    setText(
        IDS.deleteValue,
        formatDiscount(item)
    );

    setVisible(
        IDS.deleteError,
        false
    );

    showModal(
        IDS.deleteModal,
        IDS.deleteConfirm
    );
}

async function confirmDelete() {
    if (
        !active ||
        mutating ||
        pendingDelete === null
    ) {
        return;
    }

    const targetId =
        pendingDelete;

    mutating = true;

    setButtonBusy(
        IDS.deleteConfirm,
        true,
        "Deleting..."
    );

    setVisible(
        IDS.deleteError,
        false
    );

    try {
        await api.delete(
            apiPath(
                "delete",
                targetId
            )
        );

        if (!active) {
            return;
        }

        hideModal(
            IDS.deleteModal
        );

        pendingDelete = null;

        showSuccess(
            "Промокод сәтті жойылды."
        );

        await loadPromotions();
    } catch (error) {
        if (active) {
            setModalError(
                IDS.deleteError,
                error
            );
        }
    } finally {
        mutating = false;

        setButtonBusy(
            IDS.deleteConfirm,
            false
        );

        setText(
            IDS.deleteConfirmText,
            "Иә, жою"
        );
    }
}

function handleTableAction(event) {
    if (
        !(event.target instanceof Element) ||
        mutating
    ) {
        return;
    }

    const button = event.target.closest(
        "[data-promotion-action]"
    );

    if (
        !(button instanceof HTMLButtonElement)
    ) {
        return;
    }

    const id = validId(
        button.dataset.promotionId
    );

    if (id === null) {
        return;
    }

    switch (
        button.dataset.promotionAction
    ) {
        case "edit":
            openForm(
                getPromotion(id)
            );
            break;

        case "status":
            openStatusModal(id);
            break;

        case "delete":
            openDeleteModal(id);
            break;
    }
}

function handleModalKeydown(event) {
    const modal =
        currentModal();

    if (!modal) {
        return;
    }

    if (event.key === "Escape") {
        if (!mutating) {
            event.preventDefault();
            closeCurrentModal();
        }

        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    const focusable =
        focusableElements(modal);

    if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
    }

    const first =
        focusable[0];

    const last =
        focusable[focusable.length - 1];

    if (
        event.shiftKey &&
        document.activeElement === first
    ) {
        event.preventDefault();
        last.focus();
    } else if (
        !event.shiftKey &&
        document.activeElement === last
    ) {
        event.preventDefault();
        first.focus();
    }
}

function closeCurrentModal() {
    if (
        mutating ||
        !activeModal
    ) {
        return;
    }

    const closing =
        activeModal;

    hideModal(closing);

    if (
        closing === IDS.formModal
    ) {
        editingId = null;
    } else if (
        closing === IDS.statusModal
    ) {
        pendingStatus = null;
    } else if (
        closing === IDS.deleteModal
    ) {
        pendingDelete = null;
    }
}

function on(
    target,
    eventName,
    handler
) {
    target?.addEventListener(
        eventName,
        handler,
        {
            signal: listeners.signal
        }
    );
}

function setupCreateActions() {
    for (
        const id of CREATE_BUTTON_IDS
    ) {
        on(
            $(id),
            "click",
            event => {
                event.preventDefault();

                openForm();
            }
        );
    }
}

function setupRefreshActions() {
    for (
        const id of [
            IDS.refresh,
            IDS.retry
        ]
    ) {
        on(
            $(id),
            "click",
            event => {
                event.preventDefault();

                loadPromotions();
            }
        );
    }
}

function setupSearch() {
    on(
        $(IDS.search),
        "input",
        event => {
            window.clearTimeout(
                searchTimer
            );

            const term = String(
                event.target.value
            ).trim();

            searchTimer = window.setTimeout(
                () => {
                    if (!active) {
                        return;
                    }

                    state.keyword = term;
                    state.page = 0;

                    render();
                },
                300
            );
        }
    );

    on(
        $(IDS.searchForm),
        "submit",
        event => {
            event.preventDefault();

            window.clearTimeout(
                searchTimer
            );

            state.keyword = String(
                $(IDS.search)?.value ?? ""
            ).trim();

            state.page = 0;

            render();
        }
    );

    on(
        $(IDS.clearSearch),
        "click",
        event => {
            event.preventDefault();

            resetFilters();
        }
    );
}

function setupFilters() {
    on(
        $(IDS.statusTabs),
        "click",
        event => {
            if (
                !(event.target instanceof Element)
            ) {
                return;
            }

            const button = event.target.closest(
                "[data-status]"
            );

            if (
                !(button instanceof HTMLButtonElement)
            ) {
                return;
            }

            setStatusFilter(
                button.dataset.status
            );
        }
    );

    on(
        $(IDS.filterForm),
        "submit",
        event => {
            event.preventDefault();

            applyFilters();
        }
    );

    on(
        $(IDS.filterForm),
        "reset",
        event => {
            event.preventDefault();

            resetFilters();
        }
    );

    on(
        $(IDS.filterToggle),
        "click",
        event => {
            event.preventDefault();

            const panel =
                $(IDS.filters);

            if (!panel) {
                return;
            }

            const expanded =
                panel.hidden ||
                panel.classList.contains(
                    "hidden"
                );

            setVisible(
                IDS.filters,
                expanded
            );

            $(IDS.filterToggle)?.setAttribute(
                "aria-expanded",
                String(expanded)
            );
        }
    );
}

function setupDirectory() {
    on(
        $(IDS.tbody),
        "click",
        handleTableAction
    );

    on(
        $(IDS.pagination),
        "click",
        event => {
            if (
                !(event.target instanceof Element)
            ) {
                return;
            }

            const button = event.target.closest(
                "[data-page]"
            );

            if (
                !(button instanceof HTMLButtonElement) ||
                button.disabled
            ) {
                return;
            }

            const page = Number(
                button.dataset.page
            );

            changePage(page);
        }
    );
}

function setupForm() {
    on(
        $(IDS.form),
        "submit",
        savePromotion
    );

    on(
        $(IDS.code),
        "input",
        () => {
            $(IDS.code)?.removeAttribute(
                "aria-invalid"
            );

            setVisible(
                IDS.codeError,
                false
            );

            updatePreview();
        }
    );

    on(
        $(IDS.type),
        "change",
        () => {
            $(IDS.type)?.removeAttribute(
                "aria-invalid"
            );

            setVisible(
                IDS.typeError,
                false
            );

            updatePreview();
        }
    );

    on(
        $(IDS.value),
        "input",
        () => {
            $(IDS.value)?.removeAttribute(
                "aria-invalid"
            );

            setVisible(
                IDS.valueError,
                false
            );

            updatePreview();
        }
    );

    on(
        $(IDS.activeToggle),
        "change",
        updatePreview
    );

    on(
        $(IDS.formClose),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.formCancel),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.statusClose),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.statusCancel),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.statusConfirm),
        "click",
        confirmStatus
    );

    on(
        $(IDS.deleteClose),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.deleteCancel),
        "click",
        closeCurrentModal
    );

    on(
        $(IDS.deleteConfirm),
        "click",
        confirmDelete
    );
}

function setupModalBehavior() {
    for (
        const id of [
            IDS.formModal,
            IDS.statusModal,
            IDS.deleteModal
        ]
    ) {
        on(
            $(id),
            "click",
            event => {
                if (
                    event.target ===
                    event.currentTarget
                ) {
                    closeCurrentModal();
                }
            }
        );
    }

    on(
        document,
        "keydown",
        handleModalKeydown
    );
}

function setupEvents() {
    setupCreateActions();
    setupRefreshActions();
    setupSearch();
    setupFilters();
    setupDirectory();
    setupForm();
    setupModalBehavior();
}

function checkRequiredMarkup() {
    const required = [
        IDS.content,
        IDS.tbody,
        IDS.formModal,
        IDS.form,
        IDS.code,
        IDS.type,
        IDS.value,
        IDS.activeToggle,
        IDS.formSave,
        IDS.statusModal,
        IDS.statusConfirm,
        IDS.deleteModal,
        IDS.deleteConfirm
    ];

    const missing = required.filter(
        id => !$(id)
    );

    if (
        missing.length === 0
    ) {
        return true;
    }

    showError(
        `Promotions HTML элементтері табылмады: ${missing.join(", ")}`
    );

    return false;
}

export async function initAdminPromotions() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    listeners =
        new AbortController();

    if (!checkRequiredMarkup()) {
        return;
    }

    setupEvents();
    syncFilterControls();
    updatePreview();

    await loadPromotions();
}

export function destroyAdminPromotions() {
    active = false;
    initialized = false;
    loading = false;
    mutating = false;

    requestVersion++;

    window.clearTimeout(
        searchTimer
    );

    searchTimer = null;

    listeners?.abort();
    listeners = null;

    if (activeModal) {
        hideModal(
            activeModal,
            false
        );
    }

    promotions = [];
    editingId = null;
    pendingStatus = null;
    pendingDelete = null;
    activeModal = null;
    modalReturnFocus = null;

    state = initialState();
}

export const adminPromotions = {
    init: initAdminPromotions,
    destroy: destroyAdminPromotions,
    reload: loadPromotions,
    openForm,
    closeForm: closeCurrentModal,
    applyFilters,
    resetFilters,

    getPromotions() {
        return promotions.map(
            promotion => ({
                ...promotion
            })
        );
    },

    getState() {
        return {
            ...state
        };
    }
};

export default adminPromotions;
