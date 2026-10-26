
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const IDS = {
    refresh: "admin-categories-refresh-button",
    retry: "admin-categories-retry-button",
    add: "admin-add-category-button",
    bannerAdd: "admin-category-banner-add",
    quickAdd: "admin-category-quick-add",
    emptyAdd: "admin-categories-empty-add",

    total: "admin-categories-total",
    products: "admin-categories-products-count",
    used: "admin-categories-used-count",
    unused: "admin-categories-empty-count",

    searchForm: "admin-categories-search-form",
    search: "admin-categories-search",
    sort: "admin-categories-sort",
    reset: "admin-categories-clear-filters",
    resetSearch: "admin-categories-reset-search",

    loading: "admin-categories-loading",
    error: "admin-categories-error",
    errorMessage: "admin-categories-error-message",
    empty: "admin-categories-empty",
    filterEmpty: "admin-categories-filter-empty",
    resultsCount: "admin-categories-results-count",

    tableContainer: "admin-categories-table-container",
    tableBody: "admin-categories-table-body",
    tableFooter: "admin-categories-table-footer",
    paginationInfo: "admin-categories-pagination-info",
    pagination: "admin-categories-pagination",

    formModal: "admin-category-form-modal",
    form: "admin-category-form",
    formTitle: "admin-category-form-modal-title",
    formEyebrow: "admin-category-form-eyebrow",
    formClose: "admin-category-form-modal-close",
    formCancel: "admin-category-form-cancel",
    formError: "admin-category-form-error",
    name: "admin-category-name",
    nameError: "admin-category-name-error",
    description: "admin-category-description",
    descriptionHint: "admin-category-description-hint",
    descriptionCount: "admin-category-description-count",
    previewName: "admin-category-preview-name",
    previewDescription: "admin-category-preview-description",
    save: "admin-category-save-button",
    saveText: "admin-category-save-text",

    deleteModal: "admin-category-delete-modal",
    deleteClose: "admin-category-delete-close",
    deleteCancel: "admin-category-delete-cancel",
    deleteConfirm: "admin-category-delete-confirm",
    deleteConfirmText: "admin-category-delete-confirm-text",
    deleteName: "admin-category-delete-name",
    deleteId: "admin-category-delete-id",
    deleteCount: "admin-category-delete-products-count",
    deleteError: "admin-category-delete-error"
};

const CATEGORY_API = "/api/categories";
const PRODUCT_API = "/api/products";
const PAGE_SIZE = 10;
const PRODUCT_PAGE_SIZE = 50;
const MAX_PRODUCT_PAGES = 200;

const SORT_OPTIONS = new Set([
    "id-desc",
    "id-asc",
    "name-asc",
    "name-desc",
    "products-desc",
    "products-asc"
]);

const $ = id => document.getElementById(id);

const numberFormatter = new Intl.NumberFormat("kk-KZ");

let initialized = false;
let active = false;
let loading = false;
let saving = false;
let deleting = false;
let version = 0;
let events = null;
let searchTimer = null;

let categories = [];
let productCounts = null;
let totalProductCount = null;

let editingId = null;
let deletingId = null;
let modalReturnFocus = null;
let previousOverflow = "";

let state = {
    keyword: "",
    sort: "id-desc",
    page: 0
};

function text(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function visible(id, show) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.hidden = !show;
    element.classList.toggle("hidden", !show);
}

function node(tag, className = "", value = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (value !== null && value !== undefined) {
        element.textContent = String(value);
    }

    return element;
}

function count(value) {
    return value === null || value === undefined
        ? "—"
        : numberFormatter.format(value);
}

function idOf(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}

function extractArray(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    return null;
}

function normalizeCategory(raw) {
    const id = idOf(raw?.id);

    if (id === null) {
        return null;
    }

    const rawCount = raw.productCount ?? raw.productsCount;
    const parsedCount = Number(rawCount);

    return {
        id,
        name: String(raw.name ?? "").trim(),
        description: String(raw.description ?? "").trim(),
        reportedCount:
            rawCount !== null &&
            rawCount !== undefined &&
            Number.isSafeInteger(parsedCount) &&
            parsedCount >= 0
                ? parsedCount
                : null
    };
}

function categoryProductCount(category) {
    if (productCounts !== null) {
        return productCounts.get(category.id) ?? 0;
    }

    return category.reportedCount;
}

function getCategory(categoryId) {
    return categories.find(
        category => category.id === categoryId
    ) ?? null;
}

function getFiltered() {
    const keyword = state.keyword.toLocaleLowerCase();

    return categories
        .filter(category =>
            !keyword ||
            category.name.toLocaleLowerCase().includes(keyword) ||
            category.description.toLocaleLowerCase().includes(keyword) ||
            String(category.id).includes(keyword)
        )
        .sort((a, b) => {
            switch (state.sort) {
                case "id-asc":
                    return a.id - b.id;

                case "name-asc":
                    return a.name.localeCompare(b.name);

                case "name-desc":
                    return b.name.localeCompare(a.name);

                case "products-desc":
                    return (
                        (categoryProductCount(b) ?? -1) -
                        (categoryProductCount(a) ?? -1)
                    ) || b.id - a.id;

                case "products-asc":
                    return (
                        (categoryProductCount(a) ?? Infinity) -
                        (categoryProductCount(b) ?? Infinity)
                    ) || a.id - b.id;

                default:
                    return b.id - a.id;
            }
        });
}

function makeCategoryRow(category) {
    const row = document.createElement("tr");

    row.dataset.categoryId = String(category.id);

    const nameCell = document.createElement("td");
    const info = node("div", "admin-category-info");

    const icon = node(
        "span",
        "admin-category-icon",
        category.name.charAt(0).toUpperCase() || "C"
    );

    const details = node("div", "admin-category-details");

    details.append(
        node("strong", "admin-category-name", category.name)
    );

    info.append(icon, details);
    nameCell.appendChild(info);

    const descriptionCell = node(
        "td",
        "admin-category-description",
        category.description || "—"
    );

    const productsCell = document.createElement("td");
    const productCount = categoryProductCount(category);

    if (productCount !== null) {
        const link = node(
            "a",
            "admin-category-products-link",
            count(productCount)
        );

        link.href =
            `/admin/products.html?categoryId=${encodeURIComponent(category.id)}`;

        productsCell.appendChild(link);
    } else {
        productsCell.textContent = "—";
    }

    const idCell = node(
        "td",
        "admin-category-id",
        `#${category.id}`
    );

    const actionsCell = document.createElement("td");
    const actions = node("div", "admin-table-actions");

    const edit = node(
        "button",
        "btn btn-outline btn-sm",
        "Edit"
    );

    edit.type = "button";
    edit.dataset.editCategoryId = String(category.id);

    const remove = node(
        "button",
        "btn btn-danger-outline btn-sm",
        "Delete"
    );

    remove.type = "button";
    remove.dataset.deleteCategoryId = String(category.id);

    actions.append(edit, remove);
    actionsCell.appendChild(actions);

    row.append(
        nameCell,
        descriptionCell,
        productsCell,
        idCell,
        actionsCell
    );

    return row;
}

function paginationButton(label, page, disabled = false, current = false) {
    const button = node(
        "button",
        "pagination-button",
        label
    );

    button.type = "button";
    button.dataset.page = String(page);
    button.disabled = disabled || current;
    button.classList.toggle("is-active", current);

    if (current) {
        button.setAttribute("aria-current", "page");
    }

    return button;
}

function renderPagination(totalPages) {
    const container = $(IDS.pagination);

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    if (totalPages > 1) {
        fragment.appendChild(
            paginationButton("Previous", state.page - 1, state.page === 0)
        );

        for (let page = 0; page < totalPages; page++) {
            fragment.appendChild(
                paginationButton(
                    String(page + 1),
                    page,
                    false,
                    page === state.page
                )
            );
        }

        fragment.appendChild(
            paginationButton(
                "Next",
                state.page + 1,
                state.page === totalPages - 1
            )
        );
    }

    container.replaceChildren(fragment);
}

function renderStatistics() {
    text(IDS.total, count(categories.length));
    text(IDS.products, count(totalProductCount));

    const counts = categories.map(categoryProductCount);

    if (counts.some(value => value === null)) {
        text(IDS.used, "—");
        text(IDS.unused, "—");
        return;
    }

    const used = counts.filter(value => value > 0).length;

    text(IDS.used, count(used));
    text(IDS.unused, count(categories.length - used));
}

function render() {
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    state.page = Math.min(
        state.page,
        Math.max(0, totalPages - 1)
    );

    const start = state.page * PAGE_SIZE;
    const displayed = filtered.slice(start, start + PAGE_SIZE);

    renderStatistics();

    text(
        IDS.resultsCount,
        `${count(filtered.length)} категория табылды`
    );

    visible(IDS.empty, categories.length === 0);
    visible(
        IDS.filterEmpty,
        categories.length > 0 && filtered.length === 0
    );

    visible(IDS.tableContainer, displayed.length > 0);
    visible(IDS.tableFooter, displayed.length > 0);
    visible(IDS.error, false);

    const fragment = document.createDocumentFragment();

    for (const category of displayed) {
        fragment.appendChild(makeCategoryRow(category));
    }

    $(IDS.tableBody)?.replaceChildren(fragment);

    text(
        IDS.paginationInfo,
        displayed.length
            ? `${start + 1}–${start + displayed.length} / ${filtered.length}`
            : "0 / 0"
    );

    renderPagination(totalPages);
}

function setLoading(value) {
    loading = value;
    visible(IDS.loading, value);

    for (const id of [IDS.refresh, IDS.retry]) {
        const button = $(id);

        if (button instanceof HTMLButtonElement) {
            button.disabled = value;
        }
    }

    if (value) {
        visible(IDS.error, false);
    }
}

async function fetchProducts(currentVersion) {
    const products = [];
    let finished = false;

    for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
        const query = new URLSearchParams({
            page: String(page),
            size: String(PRODUCT_PAGE_SIZE)
        });

        const response = await api.get(
            `${PRODUCT_API}?${query.toString()}`
        );

        if (
            !active ||
            currentVersion !== version
        ) {
            return null;
        }

        const items = extractArray(response);

        if (!items) {
            throw new Error("Products API дұрыс тізім қайтармады.");
        }

        products.push(...items);

        const source = response?.data?.content
            ? response.data
            : response;

        if (Array.isArray(source)) {
            finished = true;
            break;
        }

        const pages = Number(source?.totalPages);

        if (
            Number.isSafeInteger(pages) &&
            pages >= 0
        ) {
            if (page + 1 >= pages) {
                finished = true;
                break;
            }
        } else if (items.length < PRODUCT_PAGE_SIZE) {
            finished = true;
            break;
        }
    }

    if (!finished) {
        throw new Error("Тауарлар тізімін толық алу мүмкін болмады.");
    }

    const unique = new Map();

    for (const product of products) {
        const id = idOf(product.id);

        if (id !== null) {
            unique.set(id, product);
        }
    }

    return [...unique.values()];
}

async function loadCategories() {
    if (!active) {
        return;
    }

    const currentVersion = ++version;

    setLoading(true);

    try {
        const response = await api.get(CATEGORY_API);
        const items = extractArray(response);

        if (!items) {
            throw new Error("Categories API дұрыс тізім қайтармады.");
        }

        const productRequest = await Promise.allSettled([
            fetchProducts(currentVersion)
        ]);

        if (
            !active ||
            currentVersion !== version
        ) {
            return;
        }

        categories = items
            .map(normalizeCategory)
            .filter(Boolean);

        productCounts = null;
        totalProductCount = null;

        const productResult = productRequest[0];

        if (
            productResult.status === "fulfilled" &&
            productResult.value !== null
        ) {
            const products = productResult.value;
            productCounts = new Map();
            totalProductCount = 0;

            for (const product of products) {
                const categoryId = idOf(
                    product.categoryId ?? product.category?.id
                );

                if (categoryId === null) {
                    continue;
                }

                totalProductCount++;

                productCounts.set(
                    categoryId,
                    (productCounts.get(categoryId) ?? 0) + 1
                );
            }
        } else if (productResult.status === "rejected") {
            console.error(
                "Category product statistics failed:",
                productResult.reason
            );
        }

        setLoading(false);
        render();
    } catch (error) {
        if (
            !active ||
            currentVersion !== version
        ) {
            return;
        }

        categories = [];
        productCounts = null;
        totalProductCount = null;

        setLoading(false);

        text(IDS.errorMessage, getErrorMessage(error));
        text(IDS.resultsCount, "Категориялар жүктелмеді");

        for (const id of [
            IDS.total,
            IDS.products,
            IDS.used,
            IDS.unused
        ]) {
            text(id, "—");
        }

        $(IDS.tableBody)?.replaceChildren();

        visible(IDS.tableContainer, false);
        visible(IDS.tableFooter, false);
        visible(IDS.empty, false);
        visible(IDS.filterEmpty, false);
        visible(IDS.error, true);
    }
}

function setModalOpen(id, open) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.hidden = !open;
    modal.classList.toggle("hidden", !open);
    modal.classList.toggle("is-open", open);

    modal.setAttribute("aria-hidden", String(!open));

    if (open) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    } else {
        document.body.style.overflow = previousOverflow;
    }
}

function clearFormError() {
    visible(IDS.formError, false);
    visible(IDS.nameError, false);

    const name = $(IDS.name);

    name?.removeAttribute("aria-invalid");
    name?.classList.remove("is-invalid");
}

function showFormError(message) {
    text(IDS.formError, message);
    visible(IDS.formError, true);
}

function updatePreview() {
    const name = String($(IDS.name)?.value ?? "").trim();
    const description = String(
        $(IDS.description)?.value ?? ""
    ).trim();

    text(
        IDS.previewName,
        name || "Your Category"
    );

    text(
        IDS.previewDescription,
        description || "Категория сипаттамасы осы жерде көрсетіледі."
    );

    text(
        IDS.descriptionCount,
        `${$(IDS.description)?.value.length ?? 0} / 1000`
    );
}

function openCategoryForm(category = null) {
    if (saving || deleting) {
        return;
    }

    const modal = $(IDS.formModal);

    if (!modal) {
        showError("Категория формасы табылмады.");
        return;
    }

    modalReturnFocus = document.activeElement;

    editingId = category?.id ?? null;

    $(IDS.form)?.reset();

    if ($(IDS.name)) {
        $(IDS.name).value = category?.name ?? "";
    }

    if ($(IDS.description)) {
        $(IDS.description).value = category?.description ?? "";
    }

    text(
        IDS.formTitle,
        category ? "Edit Category" : "Add Category"
    );

    text(
        IDS.formEyebrow,
        category ? "EDIT CATEGORY" : "NEW CATEGORY"
    );

    text(
        IDS.saveText,
        category ? "Save Changes" : "Save Category"
    );

    text(
        IDS.descriptionHint,
        "Сипаттама қазіргі backend-пен расталмағандықтан сақталмайды."
    );

    clearFormError();
    updatePreview();

    setModalOpen(IDS.formModal, true);

    $(IDS.name)?.focus();
}

function closeCategoryForm() {
    if (saving) {
        return;
    }

    setModalOpen(IDS.formModal, false);

    editingId = null;

    if (modalReturnFocus?.isConnected) {
        modalReturnFocus.focus();
    }
}

function validateCategoryName(name) {
    clearFormError();

    const input = $(IDS.name);

    if (name.length < 2 || name.length > 255) {
        showFormError(
            "Категория атауы 2–255 таңба аралығында болуы керек."
        );

        input?.focus();
        return false;
    }

    const duplicate = categories.some(category =>
        category.id !== editingId &&
        category.name.toLocaleLowerCase() ===
        name.toLocaleLowerCase()
    );

    if (duplicate) {
        showFormError("Мұндай категория бұрыннан бар.");
        input?.focus();
        return false;
    }

    return true;
}

async function saveCategory(event) {
    event.preventDefault();

    if (saving) {
        return;
    }

    const name = String($(IDS.name)?.value ?? "").trim();

    if (!validateCategoryName(name)) {
        return;
    }

    const editing = editingId !== null;
    const id = editingId;

    saving = true;

    const button = $(IDS.save);

    if (button) {
        button.disabled = true;
    }

    text(IDS.saveText, "Saving...");

    try {
        if (editing) {
            await api.put(
                `${CATEGORY_API}/${id}`,
                { name }
            );
        } else {
            await api.post(
                CATEGORY_API,
                { name }
            );
        }

        saving = false;
        closeCategoryForm();

        showSuccess(
            editing
                ? "Категория сәтті өзгертілді."
                : "Категория сәтті қосылды."
        );

        await loadCategories();
    } catch (error) {
        showFormError(getErrorMessage(error));
    } finally {
        saving = false;

        if (button) {
            button.disabled = false;
        }

        text(
            IDS.saveText,
            editingId !== null
                ? "Save Changes"
                : "Save Category"
        );
    }
}

function openDeleteModal(categoryId) {
    if (saving || deleting) {
        return;
    }

    const category = getCategory(categoryId);

    if (!category) {
        showError("Категория табылмады.");
        return;
    }

    deletingId = category.id;
    modalReturnFocus = document.activeElement;

    text(IDS.deleteName, category.name);
    text(IDS.deleteId, `Category ID: #${category.id}`);
    text(
        IDS.deleteCount,
        count(categoryProductCount(category))
    );

    visible(IDS.deleteError, false);

    setModalOpen(IDS.deleteModal, true);

    $(IDS.deleteCancel)?.focus();
}

function closeDeleteModal() {
    if (deleting) {
        return;
    }

    setModalOpen(IDS.deleteModal, false);

    deletingId = null;

    if (modalReturnFocus?.isConnected) {
        modalReturnFocus.focus();
    }
}

async function confirmDelete() {
    if (deleting || deletingId === null) {
        return;
    }

    const category = getCategory(deletingId);

    if (!category) {
        return;
    }

    const linkedProducts = categoryProductCount(category);

    if (linkedProducts === null) {
        text(
            IDS.deleteError,
            "Тауарлар саны анықталмаған. Алдымен Refresh басып қайта тексер."
        );

        visible(IDS.deleteError, true);
        return;
    }

    if (linkedProducts > 0) {
        text(
            IDS.deleteError,
            "Бұл категорияға тауарлар тіркелген. Алдымен оларды басқа категорияға ауыстыр."
        );

        visible(IDS.deleteError, true);
        return;
    }

    deleting = true;

    const button = $(IDS.deleteConfirm);

    if (button) {
        button.disabled = true;
    }

    text(IDS.deleteConfirmText, "Жойылуда...");

    try {
        await api.delete(
            `${CATEGORY_API}/${category.id}`
        );

        deleting = false;
        closeDeleteModal();

        showSuccess(
            `"${category.name}" категориясы жойылды.`
        );

        await loadCategories();
    } catch (error) {
        text(IDS.deleteError, getErrorMessage(error));
        visible(IDS.deleteError, true);
    } finally {
        deleting = false;

        if (button) {
            button.disabled = false;
        }

        text(IDS.deleteConfirmText, "Иә, жою");
    }
}

function applyFilters() {
    state.keyword = String(
        $(IDS.search)?.value ?? ""
    ).trim();

    const sort = String(
        $(IDS.sort)?.value ?? "id-desc"
    );

    state.sort = SORT_OPTIONS.has(sort)
        ? sort
        : "id-desc";

    state.page = 0;
    render();
}

function resetFilters() {
    clearTimeout(searchTimer);
    searchTimer = null;

    state.keyword = "";
    state.sort = "id-desc";
    state.page = 0;

    if ($(IDS.search)) {
        $(IDS.search).value = "";
    }

    if ($(IDS.sort)) {
        $(IDS.sort).value = "id-desc";
    }

    render();
}

function on(element, eventName, handler) {
    element?.addEventListener(
        eventName,
        handler,
        { signal: events.signal }
    );
}

function setupEvents() {
    for (const id of [
        IDS.add,
        IDS.bannerAdd,
        IDS.quickAdd,
        IDS.emptyAdd
    ]) {
        on($(id), "click", event => {
            event.preventDefault();
            openCategoryForm();
        });
    }

    for (const id of [IDS.refresh, IDS.retry]) {
        on($(id), "click", event => {
            event.preventDefault();
            loadCategories();
        });
    }

    on($(IDS.search), "input", () => {
        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            if (active) {
                applyFilters();
            }
        }, 300);
    });

    on($(IDS.searchForm), "submit", event => {
        event.preventDefault();
        clearTimeout(searchTimer);
        applyFilters();
    });

    on($(IDS.sort), "change", applyFilters);

    for (const id of [
        IDS.reset,
        IDS.resetSearch
    ]) {
        on($(id), "click", event => {
            event.preventDefault();
            resetFilters();
        });
    }

    on($(IDS.pagination), "click", event => {
        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) {
            return;
        }

        const page = Number(button.dataset.page);

        if (!Number.isSafeInteger(page) || page < 0) {
            return;
        }

        state.page = page;
        render();
    });

    on($(IDS.tableBody), "click", event => {
        const edit = event.target.closest(
            "[data-edit-category-id]"
        );

        if (edit) {
            const category = getCategory(
                idOf(edit.dataset.editCategoryId)
            );

            if (category) {
                openCategoryForm(category);
            }

            return;
        }

        const remove = event.target.closest(
            "[data-delete-category-id]"
        );

        if (remove) {
            openDeleteModal(
                idOf(remove.dataset.deleteCategoryId)
            );
        }
    });

    on($(IDS.name), "input", () => {
        clearFormError();
        updatePreview();
    });

    on($(IDS.description), "input", updatePreview);

    on($(IDS.form), "submit", saveCategory);

    for (const id of [
        IDS.formClose,
        IDS.formCancel
    ]) {
        on($(id), "click", closeCategoryForm);
    }

    for (const id of [
        IDS.deleteClose,
        IDS.deleteCancel
    ]) {
        on($(id), "click", closeDeleteModal);
    }

    on($(IDS.deleteConfirm), "click", confirmDelete);

    for (const id of [
        IDS.formModal,
        IDS.deleteModal
    ]) {
        on($(id), "click", event => {
            if (event.target !== event.currentTarget) {
                return;
            }

            if (id === IDS.formModal) {
                closeCategoryForm();
            } else {
                closeDeleteModal();
            }
        });
    }

    on(document, "keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        if (!$(IDS.deleteModal)?.hidden) {
            closeDeleteModal();
        } else if (!$(IDS.formModal)?.hidden) {
            closeCategoryForm();
        }
    });
}

export async function initAdminCategories() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    events = new AbortController();

    const initialSort = $(IDS.sort)?.value;

    state.sort = SORT_OPTIONS.has(initialSort)
        ? initialSort
        : "id-desc";

    setupEvents();

    await loadCategories();
}

export function destroyAdminCategories() {
    active = false;
    initialized = false;
    loading = false;
    saving = false;
    deleting = false;

    version++;

    clearTimeout(searchTimer);
    searchTimer = null;

    events?.abort();
    events = null;

    for (const id of [
        IDS.formModal,
        IDS.deleteModal
    ]) {
        const modal = $(id);

        if (modal) {
            modal.hidden = true;
            modal.classList.remove("is-open");
            modal.classList.add("hidden");
        }
    }

    document.body.style.overflow = previousOverflow;

    categories = [];
    productCounts = null;
    totalProductCount = null;

    editingId = null;
    deletingId = null;
    modalReturnFocus = null;

    state = {
        keyword: "",
        sort: "id-desc",
        page: 0
    };
}

export const adminCategories = {
    init: initAdminCategories,
    destroy: destroyAdminCategories,
    reload: loadCategories,
    openForm: openCategoryForm,

    getCategories() {
        return categories.map(category => ({
            ...category,
            productCount: categoryProductCount(category)
        }));
    }
};

export default adminCategories;
