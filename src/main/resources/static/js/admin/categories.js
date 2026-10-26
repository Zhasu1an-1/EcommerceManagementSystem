
import api, {
    getErrorMessage
} from "../core/api.js";

import {
    formatInteger,
    debounce,
    showElement,
    hideElement,
    openModal,
    closeModal,
    setupModal,
    setButtonLoading
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const SELECTORS = {
    tableBody: [
        "#admin-categories-table-body",
        "#categories-table-body",
        "#categories-tbody",
        "[data-categories-table-body]"
    ],
    grid: [
        "#admin-categories-grid",
        "#categories-grid",
        "[data-categories-grid]"
    ],
    search: [
        "#admin-categories-search",
        "#categories-search",
        'input[name="categorySearch"]'
    ],
    sort: [
        "#admin-categories-sort",
        "#categories-sort",
        'select[name="categorySort"]'
    ],
    totalCount: [
        "#admin-total-categories",
        "#categories-total-count",
        "[data-total-categories]"
    ],
    resultsCount: [
        "#admin-categories-count",
        "#categories-count",
        "[data-categories-count]"
    ],
    loading: [
        "#admin-categories-loading",
        "#categories-loading",
        "[data-categories-loading]"
    ],
    empty: [
        "#admin-categories-empty",
        "#categories-empty",
        "[data-categories-empty]"
    ],
    error: [
        "#admin-categories-error",
        "#categories-error",
        "[data-categories-error]"
    ],
    refresh: [
        "#admin-categories-refresh",
        "#categories-refresh",
        "[data-categories-refresh]"
    ],
    addButton: [
        "#admin-add-category",
        "#add-category-button",
        "[data-add-category]"
    ],
    modal: [
        "#category-modal",
        "#admin-category-modal",
        "[data-category-modal]"
    ],
    form: [
        "#category-form",
        "#admin-category-form",
        "[data-category-form]"
    ],
    modalTitle: [
        "#category-modal-title",
        "#category-form-title",
        "[data-category-modal-title]"
    ],
    name: [
        "#category-name",
        "#admin-category-name",
        'input[name="name"]'
    ],
    description: [
        "#category-description",
        'textarea[name="description"]',
        'input[name="description"]'
    ],
    submit: [
        "#category-form-submit",
        "#save-category-button",
        "[data-category-save]"
    ],
    cancel: [
        "#category-form-cancel",
        "[data-category-cancel]"
    ],
    formError: [
        "#category-form-error",
        "[data-category-form-error]"
    ]
};

let initialized = false;
let active = false;
let loading = false;
let submitting = false;
let requestVersion = 0;

let eventController = null;
let modalCleanup = null;
let searchDebounce = null;

let categories = [];
let editingCategoryId = null;

let state = {
    keyword: "",
    sort: "name-asc"
};

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
    const elements = {};

    for (const [name, selectors] of Object.entries(SELECTORS)) {
        elements[name] = findElement(selectors);
    }

    return elements;
}

function getFormElement(selectors) {
    const form = getElements().form;

    return (
        form ? findElement(selectors, form) : null
    ) ?? findElement(selectors);
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

function setText(element, value) {
    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function parseId(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}

function normalizeCategory(category) {
    if (
        !category ||
        typeof category !== "object"
    ) {
        return null;
    }

    const id = parseId(
        category.id ?? category.categoryId
    );

    if (id === null) {
        return null;
    }

    const count = Number(
        category.productCount ??
        category.productsCount
    );

    return {
        id,
        name: String(
            category.name ?? "Unnamed Category"
        ).trim(),
        description: String(
            category.description ?? ""
        ).trim(),
        productCount: Number.isFinite(count) && count >= 0
            ? Math.trunc(count)
            : null
    };
}

function extractCategories(response) {
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

    if (Array.isArray(response?.categories)) {
        return response.categories;
    }

    return [];
}

function setLoading(value) {
    loading = value;

    const elements = getElements();

    if (value) {
        showElement(elements.loading);
        hideElement(elements.error);
    } else {
        hideElement(elements.loading);
    }

    if (elements.refresh) {
        elements.refresh.disabled = value;
    }

    const container =
        elements.tableBody ?? elements.grid;

    container?.setAttribute(
        "aria-busy",
        String(value)
    );
}

function getFilteredCategories() {
    const keyword = state.keyword.toLowerCase();

    const filtered = categories.filter(category => {
        if (!keyword) {
            return true;
        }

        return [
            category.name,
            category.description,
            String(category.id)
        ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
    });

    return filtered.sort((first, second) => {
        switch (state.sort) {
            case "name-desc":
                return second.name.localeCompare(
                    first.name
                );

            case "id-asc":
                return first.id - second.id;

            case "id-desc":
                return second.id - first.id;

            case "products-desc":
                return (
                    (second.productCount ?? -1) -
                    (first.productCount ?? -1)
                );

            default:
                return first.name.localeCompare(
                    second.name
                );
        }
    });
}

function createCategoryActions(category) {
    const actions = createElement(
        "div",
        "admin-table-actions category-actions"
    );

    const editButton = createElement(
        "button",
        "btn btn-outline btn-sm",
        "Edit"
    );

    editButton.type = "button";
    editButton.dataset.editCategoryId =
        String(category.id);

    const deleteButton = createElement(
        "button",
        "btn btn-danger-outline btn-sm",
        "Delete"
    );

    deleteButton.type = "button";
    deleteButton.dataset.deleteCategoryId =
        String(category.id);

    actions.append(
        editButton,
        deleteButton
    );

    return actions;
}

function createCategoryTableRow(category) {
    const row = document.createElement("tr");

    row.dataset.categoryId = String(category.id);

    const nameCell = document.createElement("td");

    const information = createElement(
        "div",
        "admin-category-info"
    );

    const icon = createElement(
        "span",
        "admin-category-icon",
        category.name.charAt(0).toUpperCase() || "C"
    );

    const details = createElement(
        "div",
        "admin-category-details"
    );

    const name = createElement(
        "strong",
        "admin-category-name",
        category.name
    );

    const identifier = createElement(
        "span",
        "admin-category-id",
        `#${category.id}`
    );

    details.append(name, identifier);
    information.append(icon, details);
    nameCell.appendChild(information);

    const descriptionCell = createElement(
        "td",
        "admin-category-description",
        category.description || "—"
    );

    const countCell = document.createElement("td");

    if (category.productCount !== null) {
        const link = createElement(
            "a",
            "admin-category-products-link",
            formatInteger(category.productCount)
        );

        link.href =
            `/admin/products.html?categoryId=${encodeURIComponent(category.id)}`;

        countCell.appendChild(link);
    } else {
        countCell.textContent = "—";
    }

    const actionsCell = document.createElement("td");

    actionsCell.appendChild(
        createCategoryActions(category)
    );

    row.append(
        nameCell,
        descriptionCell,
        countCell,
        actionsCell
    );

    return row;
}

function createCategoryCard(category) {
    const card = createElement(
        "article",
        "admin-category-card"
    );

    card.dataset.categoryId = String(category.id);

    const header = createElement(
        "div",
        "admin-category-card-header"
    );

    const icon = createElement(
        "span",
        "admin-category-icon",
        category.name.charAt(0).toUpperCase() || "C"
    );

    const name = createElement(
        "h3",
        "admin-category-card-title",
        category.name
    );

    header.append(icon, name);

    const description = createElement(
        "p",
        "admin-category-card-description",
        category.description ||
        "No description available."
    );

    const footer = createElement(
        "div",
        "admin-category-card-footer"
    );

    const productCount = createElement(
        "span",
        "admin-category-products",
        category.productCount !== null
            ? `${formatInteger(category.productCount)} products`
            : "Product count unavailable"
    );

    footer.appendChild(productCount);
    footer.appendChild(
        createCategoryActions(category)
    );

    card.append(
        header,
        description,
        footer
    );

    return card;
}

function showEmptyState() {
    const elements = getElements();

    elements.tableBody?.replaceChildren();
    elements.grid?.replaceChildren();

    if (elements.empty) {
        showElement(elements.empty);
        return;
    }

    if (elements.tableBody) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.className = "admin-table-empty";

        cell.textContent = state.keyword
            ? "Іздеу нәтижесінде категориялар табылмады."
            : "Әзірге категориялар жоқ.";

        row.appendChild(cell);
        elements.tableBody.appendChild(row);

        return;
    }

    if (elements.grid) {
        const message = createElement(
            "p",
            "empty-state",
            state.keyword
                ? "Категориялар табылмады."
                : "Әзірге категориялар жоқ."
        );

        elements.grid.appendChild(message);
    }
}

function renderCategories() {
    const elements = getElements();
    const filtered = getFilteredCategories();

    setText(
        elements.totalCount,
        formatInteger(categories.length)
    );

    setText(
        elements.resultsCount,
        `${formatInteger(filtered.length)} categories`
    );

    if (filtered.length === 0) {
        showEmptyState();
        return;
    }

    hideElement(elements.empty);

    const container =
        elements.tableBody ?? elements.grid;

    if (!container) {
        return;
    }

    const isTable =
        container instanceof HTMLTableSectionElement;

    const fragment = document.createDocumentFragment();

    for (const category of filtered) {
        fragment.appendChild(
            isTable
                ? createCategoryTableRow(category)
                : createCategoryCard(category)
        );
    }

    container.replaceChildren(fragment);
}

function showCategoriesError(error) {
    const elements = getElements();
    const message = getErrorMessage(error);

    const container =
        elements.tableBody ?? elements.grid;

    container?.replaceChildren();

    if (elements.error) {
        const description = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(
            description ?? elements.error,
            message
        );

        showElement(elements.error);
    }

    showError(message);
}

async function loadCategories() {
    if (!active) {
        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const response = await api.categories.list();

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        categories = extractCategories(response)
            .map(normalizeCategory)
            .filter(Boolean);

        renderCategories();
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        showCategoriesError(error);
    } finally {
        if (
            active &&
            version === requestVersion
        ) {
            setLoading(false);
        }
    }
}

function getCategoryById(id) {
    return categories.find(
        category => category.id === id
    ) ?? null;
}

function clearFormErrors() {
    const elements = getElements();

    hideElement(elements.formError);

    for (const field of [
        getFormElement(SELECTORS.name),
        getFormElement(SELECTORS.description)
    ]) {
        field?.removeAttribute("aria-invalid");
        field?.classList.remove("is-invalid");
    }
}

function showFormError(message, field = null) {
    const element = getElements().formError;

    if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("is-invalid");
        field.focus();
    }

    if (element) {
        setText(element, message);
        showElement(element);
    } else {
        showError(message);
    }
}

function resetCategoryForm() {
    const elements = getElements();

    elements.form?.reset();

    editingCategoryId = null;

    clearFormErrors();
}

function openCategoryForm(category = null) {
    const elements = getElements();

    if (!elements.modal || !elements.form) {
        showInfo(
            "Категория формасы табылмады."
        );
        return;
    }

    resetCategoryForm();

    if (category) {
        editingCategoryId = category.id;
    }

    const nameInput = getFormElement(
        SELECTORS.name
    );

    const descriptionInput = getFormElement(
        SELECTORS.description
    );

    if (nameInput) {
        nameInput.value = category?.name ?? "";
    }

    if (descriptionInput) {
        descriptionInput.value =
            category?.description ?? "";
    }

    setText(
        elements.modalTitle,
        category ? "Edit Category" : "Add Category"
    );

    if (elements.submit) {
        setText(
            elements.submit,
            category ? "Save Changes" : "Create Category"
        );
    }

    openModal(elements.modal);

    nameInput?.focus();
}

function closeCategoryForm() {
    const modal = getElements().modal;

    if (modal) {
        closeModal(modal);
    }

    resetCategoryForm();
}

function getFormData() {
    const nameInput = getFormElement(
        SELECTORS.name
    );

    const descriptionInput = getFormElement(
        SELECTORS.description
    );

    return {
        name: String(
            nameInput?.value ?? ""
        ).trim(),
        description: String(
            descriptionInput?.value ?? ""
        ).trim()
    };
}

function validateCategory(data) {
    clearFormErrors();

    const nameInput = getFormElement(
        SELECTORS.name
    );

    if (!data.name) {
        showFormError(
            "Категория атауын енгіз.",
            nameInput
        );
        return false;
    }

    if (data.name.length > 255) {
        showFormError(
            "Категория атауы 255 таңбадан аспауы керек.",
            nameInput
        );
        return false;
    }

    const duplicate = categories.some(category => {
        return (
            category.id !== editingCategoryId &&
            category.name.toLowerCase() ===
                data.name.toLowerCase()
        );
    });

    if (duplicate) {
        showFormError(
            "Мұндай категория бұрыннан бар.",
            nameInput
        );
        return false;
    }

    return true;
}

function resolveEndpoint(action, id = null) {
    const elements = getElements();

    const attributeName = {
        create: "createEndpoint",
        update: "updateEndpoint",
        delete: "deleteEndpoint"
    }[action];

    if (!attributeName) {
        return null;
    }

    const endpoint =
        elements.form?.dataset[attributeName] ??
        elements.modal?.dataset[attributeName] ??
        document.body.dataset[attributeName];

    if (!endpoint) {
        return null;
    }

    const path = endpoint
        .replaceAll("{id}", String(id ?? ""))
        .replaceAll(":id", String(id ?? ""));

    try {
        const url = new URL(
            path,
            window.location.origin
        );

        if (
            url.origin !== window.location.origin ||
            !url.pathname.startsWith("/api/")
        ) {
            return null;
        }

        return `${url.pathname}${url.search}`;
    } catch {
        return null;
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();

    if (submitting) {
        return;
    }

    const data = getFormData();

    if (!validateCategory(data)) {
        return;
    }

    const editing = editingCategoryId !== null;

    const endpoint = resolveEndpoint(
        editing ? "update" : "create",
        editingCategoryId
    );

    if (!endpoint) {
        showInfo(
            "Категорияны сақтау үшін Spring Boot-та нақты admin create/update endpoint қажет."
        );
        return;
    }

    submitting = true;

    const button = getElements().submit;

    if (button instanceof HTMLButtonElement) {
        setButtonLoading(
            button,
            true,
            "Saving..."
        );
    }

    try {
        if (editing) {
            await api.put(endpoint, data);
        } else {
            await api.post(endpoint, data);
        }

        closeCategoryForm();

        showSuccess(
            editing
                ? "Категория сәтті жаңартылды!"
                : "Категория сәтті қосылды!"
        );

        await loadCategories();
    } catch (error) {
        showFormError(
            getErrorMessage(error)
        );
    } finally {
        submitting = false;

        if (button instanceof HTMLButtonElement) {
            setButtonLoading(button, false);
        }
    }
}

async function deleteCategory(categoryId) {
    const category = getCategoryById(categoryId);

    if (!category) {
        return;
    }

    const endpoint = resolveEndpoint(
        "delete",
        category.id
    );

    if (!endpoint) {
        showInfo(
            "Категорияны жою үшін Spring Boot-та admin DELETE endpoint қажет."
        );
        return;
    }

    const confirmed = window.confirm(
        `"${category.name}" категориясын жоюды растайсың ба?`
    );

    if (!confirmed) {
        return;
    }

    try {
        await api.delete(endpoint);

        showSuccess(
            `"${category.name}" категориясы жойылды.`
        );

        await loadCategories();
    } catch (error) {
        showError(
            getErrorMessage(error)
        );
    }
}

function setupCategoryModal() {
    const elements = getElements();
    const signal = eventController.signal;

    if (!elements.modal || !elements.form) {
        return;
    }

    modalCleanup = setupModal(
        elements.modal,
        {
            closeButtons: [
                "#category-modal-close",
                "#admin-category-modal-close",
                "#category-form-cancel",
                "[data-category-modal-close]"
            ]
        }
    );

    elements.form.addEventListener(
        "submit",
        handleFormSubmit,
        { signal }
    );

    if (
        elements.submit &&
        !elements.form.contains(elements.submit)
    ) {
        elements.submit.addEventListener(
            "click",
            event => {
                event.preventDefault();
                elements.form.requestSubmit();
            },
            { signal }
        );
    }

    elements.cancel?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            closeCategoryForm();
        },
        { signal }
    );

    getFormElement(SELECTORS.name)?.addEventListener(
        "input",
        clearFormErrors,
        { signal }
    );
}

function setupCategoryActions() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.addButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            openCategoryForm();
        },
        { signal }
    );

    const container =
        elements.tableBody ?? elements.grid;

    container?.addEventListener(
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const editButton = event.target.closest(
                "[data-edit-category-id]"
            );

            if (editButton) {
                event.preventDefault();

                const categoryId = parseId(
                    editButton.dataset.editCategoryId
                );

                const category = getCategoryById(
                    categoryId
                );

                if (category) {
                    openCategoryForm(category);
                }

                return;
            }

            const deleteButton = event.target.closest(
                "[data-delete-category-id]"
            );

            if (deleteButton) {
                event.preventDefault();

                const categoryId = parseId(
                    deleteButton.dataset.deleteCategoryId
                );

                if (categoryId !== null) {
                    deleteCategory(categoryId);
                }
            }
        },
        { signal }
    );

    elements.refresh?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            loadCategories();
        },
        { signal }
    );
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    searchDebounce = debounce(
        () => {
            state.keyword = String(
                elements.search?.value ?? ""
            ).trim();

            renderCategories();
        },
        300
    );

    elements.search?.addEventListener(
        "input",
        searchDebounce,
        { signal }
    );

    elements.sort?.addEventListener(
        "change",
        () => {
            state.sort =
                elements.sort.value || "name-asc";

            renderCategories();
        },
        { signal }
    );
}

export async function initAdminCategories() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupFilters();
    setupCategoryModal();
    setupCategoryActions();

    await loadCategories();
}

export function destroyAdminCategories() {
    initialized = false;
    active = false;
    loading = false;
    submitting = false;

    requestVersion++;

    searchDebounce?.cancel();
    eventController?.abort();
    modalCleanup?.();

    searchDebounce = null;
    eventController = null;
    modalCleanup = null;

    categories = [];
    editingCategoryId = null;

    state = {
        keyword: "",
        sort: "name-asc"
    };
}

export const adminCategories = {
    init: initAdminCategories,
    destroy: destroyAdminCategories,
    reload: loadCategories,
    openForm: openCategoryForm,
    closeForm: closeCategoryForm,
    getCategories() {
        return [...categories];
    }
};

export default adminCategories;
