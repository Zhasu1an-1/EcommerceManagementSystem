
import api, {
    getErrorMessage
} from "../core/api.js";

import {
    renderProductCards
} from "../components/product-card.js";

import {
    debounce,
    renderPagination,
    getPaginationData,
    formatPaginationSummary,
    updateQueryParams,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showError
} from "../components/toast.js";

const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_SORT = "id,desc";

const SELECTORS = {
    grid: [
        "#catalog-products-grid",
        "#catalog-product-grid",
        "#products-grid",
        ".catalog-products-grid",
        ".catalog-product-grid"
    ],
    search: [
        "#catalog-search",
        "#catalog-search-input",
        "#catalog-keyword",
        "#product-search",
        'input[name="keyword"]'
    ],
    searchForm: [
        "#catalog-search-form",
        "#catalog-filter-form",
        ".catalog-search-form"
    ],
    category: [
        "#catalog-category",
        "#catalog-category-select",
        'select[name="categoryId"]'
    ],
    categoryList: [
        "#catalog-categories",
        "#catalog-category-list",
        "#catalog-category-options",
        "#category-filters",
        "[data-catalog-categories]"
    ],
    minPrice: [
        "#catalog-min-price",
        "#min-price",
        'input[name="minPrice"]'
    ],
    maxPrice: [
        "#catalog-max-price",
        "#max-price",
        'input[name="maxPrice"]'
    ],
    inStock: [
        "#catalog-in-stock",
        "#in-stock-only",
        'input[name="inStock"]'
    ],
    sort: [
        "#catalog-sort",
        "#catalog-sort-select",
        'select[name="sort"]'
    ],
    resultCount: [
        "#catalog-results-count",
        "#catalog-result-count",
        "[data-catalog-results-count]"
    ],
    gridLoading: [
        "#catalog-loading",
        "#catalog-products-loading"
    ],
    empty: [
        "#catalog-empty",
        "#catalog-empty-state"
    ],
    error: [
        "#catalog-error",
        "#catalog-error-state"
    ],
    pagination: [
        "#catalog-pagination",
        ".catalog-pagination"
    ],
    sidebar: [
        "#catalog-sidebar",
        "#catalog-filter-sidebar",
        ".catalog-filter-sidebar",
        ".catalog-filters-sidebar",
        ".catalog-sidebar"
    ],
    filterToggle: [
        "#catalog-filter-toggle",
        "#catalog-mobile-filters-button",
        ".catalog-mobile-filters-button",
        ".catalog-filter-toggle"
    ],
    filterClose: [
        "#catalog-filter-close",
        "[data-catalog-filter-close]"
    ],
    filterApply: [
        "#catalog-apply-filters",
        "#apply-filters",
        "[data-catalog-apply]"
    ],
    filterReset: [
        "#catalog-reset-filters",
        "#catalog-clear-filters",
        "#reset-filters",
        "[data-catalog-reset]"
    ],
    filterOverlay: [
        "#catalog-filter-overlay",
        ".catalog-filter-overlay"
    ]
};

const SORT_VALUES = {
    newest: "id,desc",
    latest: "id,desc",
    "new-arrivals": "id,desc",
    "id-desc": "id,desc",
    "id,desc": "id,desc",
    oldest: "id,asc",
    "id-asc": "id,asc",
    "id,asc": "id,asc",
    "price-asc": "price,asc",
    "price-low": "price,asc",
    "price-low-high": "price,asc",
    "price_asc": "price,asc",
    "price,asc": "price,asc",
    "price-desc": "price,desc",
    "price-high": "price,desc",
    "price-high-low": "price,desc",
    "price_desc": "price,desc",
    "price,desc": "price,desc",
    "name-asc": "name,asc",
    "name-az": "name,asc",
    "name_asc": "name,asc",
    "name,asc": "name,asc",
    "name-desc": "name,desc",
    "name-za": "name,desc",
    "name_desc": "name,desc",
    "name,desc": "name,desc"
};

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let searchDebounce = null;
let priceDebounce = null;
let categoryListGenerated = false;

let state = {
    keyword: "",
    categoryId: null,
    minPrice: null,
    maxPrice: null,
    inStock: false,
    sort: DEFAULT_SORT,
    page: 0,
    size: DEFAULT_PAGE_SIZE
};

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
    const result = {};

    for (const [name, selectors] of Object.entries(SELECTORS)) {
        result[name] = findElement(selectors);
    }

    return result;
}

function toPositiveNumber(value) {
    if (
        value === "" ||
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : null;
}

function toCategoryId(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}

function normalizeSort(value) {
    const key = String(value ?? "")
        .trim()
        .toLowerCase();

    return SORT_VALUES[key] ?? DEFAULT_SORT;
}

function readStateFromUrl() {
    const params = new URLSearchParams(
        window.location.search
    );

    const page = Number(params.get("page"));
    const size = Number(params.get("size"));

    return {
        keyword: (
            params.get("keyword") ??
            params.get("q") ??
            ""
        ).trim(),
        categoryId: toCategoryId(
            params.get("categoryId")
        ),
        minPrice: toPositiveNumber(
            params.get("minPrice")
        ),
        maxPrice: toPositiveNumber(
            params.get("maxPrice")
        ),
        inStock: params.get("inStock") === "true",
        sort: normalizeSort(
            params.get("sort") ?? DEFAULT_SORT
        ),
        page: Number.isSafeInteger(page) && page >= 0
            ? page
            : 0,
        size: Number.isSafeInteger(size) && size > 0
            ? Math.min(size, 100)
            : DEFAULT_PAGE_SIZE
    };
}

function writeStateToUrl() {
    updateQueryParams({
        keyword: state.keyword || null,
        categoryId: state.categoryId,
        minPrice: state.minPrice,
        maxPrice: state.maxPrice,
        inStock: state.inStock ? "true" : null,
        sort: state.sort === DEFAULT_SORT
            ? null
            : state.sort,
        page: state.page > 0
            ? state.page
            : null,
        size: state.size !== DEFAULT_PAGE_SIZE
            ? state.size
            : null,
        q: null
    });
}

function syncInputs() {
    const elements = getElements();

    if (elements.search) {
        elements.search.value = state.keyword;
    }

    if (elements.minPrice) {
        elements.minPrice.value =
            state.minPrice ?? "";
    }

    if (elements.maxPrice) {
        elements.maxPrice.value =
            state.maxPrice ?? "";
    }

    if (elements.inStock) {
        if (elements.inStock.type === "checkbox") {
            elements.inStock.checked = state.inStock;
        } else {
            elements.inStock.value = String(state.inStock);
        }
    }

    if (elements.sort) {
        const matchingOption = Array.from(
            elements.sort.options
        ).find(option => {
            return normalizeSort(option.value) === state.sort;
        });

        if (matchingOption) {
            elements.sort.value = matchingOption.value;
        }
    }

    if (elements.category) {
        elements.category.value = String(
            state.categoryId ?? ""
        );
    }

    const radios = document.querySelectorAll(
        'input[name="categoryId"][type="radio"], input[name="category"][type="radio"]'
    );

    for (const radio of radios) {
        radio.checked =
            toCategoryId(radio.value) === state.categoryId ||
            (
                state.categoryId === null &&
                (radio.value === "" || radio.value === "all")
            );
    }
}

function extractProducts(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.products)) {
        return response.products;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    if (Array.isArray(response?.data?.products)) {
        return response.data.products;
    }

    return [];
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

    return [];
}

function getRequestParams() {
    const params = {
        page: state.page,
        size: state.size,
        sort: state.sort
    };

    if (state.keyword) {
        params.keyword = state.keyword;
    }

    if (state.categoryId !== null) {
        params.categoryId = state.categoryId;
    }

    if (state.minPrice !== null) {
        params.minPrice = state.minPrice;
    }

    if (state.maxPrice !== null) {
        params.maxPrice = state.maxPrice;
    }

    if (state.inStock) {
        params.inStock = true;
    }

    return params;
}

function createLoadingSkeletons(container) {
    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 6; index++) {
        const skeleton = document.createElement("div");

        skeleton.className =
            "skeleton catalog-product-skeleton";

        skeleton.style.minHeight = "340px";
        skeleton.setAttribute("aria-hidden", "true");

        fragment.appendChild(skeleton);
    }

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "true");
}

function setLoading(loading) {
    const elements = getElements();

    if (loading) {
        hideElement(elements.empty);
        hideElement(elements.error);
        showElement(elements.gridLoading);

        createLoadingSkeletons(elements.grid);
    } else {
        hideElement(elements.gridLoading);
        elements.grid?.removeAttribute("aria-busy");
    }
}

function setMessage(target, title, description) {
    if (!target) {
        return false;
    }

    const heading = target.querySelector(
        "h2, h3, .empty-state-title"
    );

    const paragraph = target.querySelector(
        "p, .empty-state-description"
    );

    if (heading) {
        heading.textContent = title;
    }

    if (paragraph) {
        paragraph.textContent = description;
    }

    showElement(target);

    return true;
}

function renderInlineState(title, description, retry = false) {
    const grid = getElements().grid;

    if (!grid) {
        return;
    }

    const wrapper = document.createElement("div");
    const heading = document.createElement("h3");
    const paragraph = document.createElement("p");

    wrapper.className = "empty-state catalog-empty-state";
    wrapper.style.gridColumn = "1 / -1";

    heading.textContent = title;
    paragraph.textContent = description;

    wrapper.append(heading, paragraph);

    if (retry) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "btn btn-outline";
        button.textContent = "Қайта жүктеу";

        button.addEventListener(
            "click",
            () => loadProducts()
        );

        wrapper.appendChild(button);
    }

    grid.replaceChildren(wrapper);
}

function setResultCount(pageData) {
    const element = getElements().resultCount;

    if (!element) {
        return;
    }

    const pagination = getPaginationData(pageData);

    element.textContent =
        pagination.totalElements > 0
            ? `${formatPaginationSummary(pageData)} тауар`
            : "0 тауар";
}

function showEmptyState() {
    const elements = getElements();

    if (!setMessage(
        elements.empty,
        "Тауарлар табылмады",
        "Іздеу шарттарын өзгертіп немесе фильтрлерді тазалап көр."
    )) {
        renderInlineState(
            "Тауарлар табылмады",
            "Іздеу шарттарын өзгертіп немесе фильтрлерді тазалап көр."
        );
    }

    if (elements.empty) {
        elements.grid?.replaceChildren();
    }

    elements.pagination?.replaceChildren();
}

function showErrorState(error) {
    const message = getErrorMessage(error);
    const elements = getElements();

    if (!setMessage(
        elements.error,
        "Каталог жүктелмеді",
        message
    )) {
        renderInlineState(
            "Каталог жүктелмеді",
            message,
            true
        );
    }

    elements.pagination?.replaceChildren();

    if (elements.error) {
        elements.grid?.replaceChildren();
    }
}

function getPageResponse(response, productCount) {
    if (
        response &&
        typeof response === "object" &&
        !Array.isArray(response)
    ) {
        const pageData = response.data?.content
            ? response.data
            : response;

        return {
            ...pageData,
            number: pageData.number ??
                pageData.page?.number ??
                state.page,
            size: pageData.size ??
                pageData.page?.size ??
                state.size,
            totalElements: pageData.totalElements ??
                pageData.page?.totalElements ??
                productCount,
            totalPages: pageData.totalPages ??
                pageData.page?.totalPages ??
                Math.ceil(productCount / state.size)
        };
    }

    return {
        number: 0,
        size: state.size,
        totalElements: productCount,
        totalPages: Math.ceil(productCount / state.size)
    };
}

async function loadProducts(options = {}) {
    const {
        scrollToTop = false
    } = options;

    const version = ++requestVersion;
    const elements = getElements();

    if (!elements.grid) {
        return;
    }

    setLoading(true);

    try {
        const response = await api.products.list(
            getRequestParams()
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const products = extractProducts(response);
        const pageData = getPageResponse(
            response,
            products.length
        );

        setLoading(false);

        setResultCount(pageData);

        if (products.length === 0) {
            showEmptyState();
            return;
        }

        hideElement(elements.empty);
        hideElement(elements.error);

        renderProductCards(
            elements.grid,
            products,
            {
                showCategory: true,
                showStock: true,
                showStockBadge: true,
                showAddButton: true,
                showDetailsLink: false
            }
        );

        renderPagination(
            elements.pagination,
            pageData,
            page => {
                if (page === state.page) {
                    return;
                }

                state.page = page;

                writeStateToUrl();

                loadProducts({
                    scrollToTop: true
                });
            }
        );

        if (scrollToTop) {
            const target = document.querySelector(
                ".catalog-toolbar, .catalog-results-toolbar, .catalog-main"
            );

            target?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        setLoading(false);
        showErrorState(error);

        console.error(
            "Catalog products loading failed:",
            error
        );
    }
}

function createCategoryOption(category, index) {
    const id = toCategoryId(
        category.id ?? category.categoryId
    );

    const name = String(
        category.name ??
        category.categoryName ??
        ""
    ).trim();

    if (id === null || !name) {
        return null;
    }

    const label = document.createElement("label");

    label.className =
        "catalog-filter-option catalog-category-option";

    const radio = document.createElement("input");

    radio.type = "radio";
    radio.name = "categoryId";
    radio.value = String(id);
    radio.id = `catalog-category-${id}`;
    radio.checked = state.categoryId === id;

    const text = document.createElement("span");

    text.textContent = name;

    label.append(radio, text);

    return label;
}

function renderCategoryOptions(categories) {
    const elements = getElements();

    if (
        elements.category instanceof HTMLSelectElement
    ) {
        const select = elements.category;
        const fragment = document.createDocumentFragment();

        const allOption = document.createElement("option");

        allOption.value = "";
        allOption.textContent = "Барлық категориялар";

        fragment.appendChild(allOption);

        for (const category of categories) {
            const id = toCategoryId(
                category.id ?? category.categoryId
            );

            const name = String(
                category.name ??
                category.categoryName ??
                ""
            ).trim();

            if (id === null || !name) {
                continue;
            }

            const option = document.createElement("option");

            option.value = String(id);
            option.textContent = name;

            fragment.appendChild(option);
        }

        select.replaceChildren(fragment);
        select.value = String(state.categoryId ?? "");

        return;
    }

    const container = elements.categoryList;

    if (!container) {
        return;
    }

    if (container instanceof HTMLSelectElement) {
        return;
    }

    const fragment = document.createDocumentFragment();
    const allLabel = document.createElement("label");
    const allRadio = document.createElement("input");
    const allText = document.createElement("span");

    allLabel.className =
        "catalog-filter-option catalog-category-option";

    allRadio.type = "radio";
    allRadio.name = "categoryId";
    allRadio.value = "";
    allRadio.id = "catalog-category-all";
    allRadio.checked = state.categoryId === null;

    allText.textContent = "Барлық категориялар";

    allLabel.append(allRadio, allText);
    fragment.appendChild(allLabel);

    for (let index = 0; index < categories.length; index++) {
        const option = createCategoryOption(
            categories[index],
            index
        );

        if (option) {
            fragment.appendChild(option);
        }
    }

    container.replaceChildren(fragment);
    categoryListGenerated = true;
}

async function loadCategories() {
    try {
        const response = await api.categories.list();

        if (!active) {
            return;
        }

        const categories = extractCategories(response);

        renderCategoryOptions(categories);
        syncInputs();
    } catch (error) {
        console.error(
            "Catalog categories loading failed:",
            error
        );
    }
}

function applyFilters() {
    const elements = getElements();

    const minPrice = toPositiveNumber(
        elements.minPrice?.value
    );

    const maxPrice = toPositiveNumber(
        elements.maxPrice?.value
    );

    if (
        minPrice !== null &&
        maxPrice !== null &&
        minPrice > maxPrice
    ) {
        showError(
            "Ең төменгі баға ең жоғарғы бағадан үлкен болмауы керек."
        );

        return;
    }

    state.keyword = elements.search?.value.trim() ?? "";
    state.minPrice = minPrice;
    state.maxPrice = maxPrice;

    if (elements.inStock) {
        state.inStock =
            elements.inStock.type === "checkbox"
                ? elements.inStock.checked
                : elements.inStock.value === "true";
    }

    if (elements.category instanceof HTMLSelectElement) {
        state.categoryId = toCategoryId(
            elements.category.value
        );
    } else {
        const selected = document.querySelector(
            'input[name="categoryId"]:checked, input[name="category"]:checked'
        );

        if (selected) {
            state.categoryId = toCategoryId(
                selected.value
            );
        }
    }

    state.page = 0;

    writeStateToUrl();
    loadProducts();
}

function resetFilters() {
    state = {
        keyword: "",
        categoryId: null,
        minPrice: null,
        maxPrice: null,
        inStock: false,
        sort: DEFAULT_SORT,
        page: 0,
        size: DEFAULT_PAGE_SIZE
    };

    syncInputs();
    writeStateToUrl();
    loadProducts();
}

function setupSearch() {
    const elements = getElements();

    searchDebounce = debounce(() => {
        applyFilters();
    }, 450);

    if (elements.search) {
        elements.search.addEventListener(
            "input",
            searchDebounce,
            { signal: eventController.signal }
        );
    }

    if (elements.searchForm) {
        elements.searchForm.addEventListener(
            "submit",
            event => {
                event.preventDefault();

                searchDebounce.cancel();
                applyFilters();
            },
            { signal: eventController.signal }
        );
    }
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    priceDebounce = debounce(() => {
        applyFilters();
    }, 550);

    for (const input of [
        elements.minPrice,
        elements.maxPrice
    ]) {
        input?.addEventListener(
            "input",
            priceDebounce,
            { signal }
        );
    }

    elements.inStock?.addEventListener(
        "change",
        applyFilters,
        { signal }
    );

    elements.category?.addEventListener(
        "change",
        applyFilters,
        { signal }
    );

    elements.categoryList?.addEventListener(
        "change",
        event => {
            if (
                event.target.matches(
                    'input[type="radio"], input[type="checkbox"], select'
                )
            ) {
                applyFilters();
            }
        },
        { signal }
    );

    elements.filterApply?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            searchDebounce?.cancel();
            priceDebounce?.cancel();

            applyFilters();
            closeMobileFilters();
        },
        { signal }
    );

    elements.filterReset?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            searchDebounce?.cancel();
            priceDebounce?.cancel();

            resetFilters();
        },
        { signal }
    );
}

function setupSorting() {
    const sortSelect = getElements().sort;

    sortSelect?.addEventListener(
        "change",
        () => {
            state.sort = normalizeSort(
                sortSelect.value
            );

            state.page = 0;

            writeStateToUrl();
            loadProducts();
        },
        { signal: eventController.signal }
    );
}

function openMobileFilters() {
    const elements = getElements();

    if (!elements.sidebar) {
        return;
    }

    elements.sidebar.classList.remove(
        "is-collapsed"
    );

    elements.sidebar.classList.add("is-open");

    elements.filterOverlay?.classList.add(
        "is-visible"
    );

    if (elements.filterOverlay) {
        showElement(elements.filterOverlay);
    }

    elements.filterToggle?.setAttribute(
        "aria-expanded",
        "true"
    );
}

function closeMobileFilters() {
    const elements = getElements();

    elements.sidebar?.classList.remove(
        "is-open"
    );

    elements.filterOverlay?.classList.remove(
        "is-visible"
    );

    if (elements.filterOverlay) {
        hideElement(elements.filterOverlay);
    }

    if (window.innerWidth <= 992) {
        elements.sidebar?.classList.add(
            "is-collapsed"
        );
    } else {
        elements.sidebar?.classList.remove(
            "is-collapsed"
        );
    }

    elements.filterToggle?.setAttribute(
        "aria-expanded",
        "false"
    );
}

function setupMobileFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.filterToggle?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            if (
                elements.sidebar?.classList.contains(
                    "is-open"
                )
            ) {
                closeMobileFilters();
            } else {
                openMobileFilters();
            }
        },
        { signal }
    );

    elements.filterClose?.addEventListener(
        "click",
        closeMobileFilters,
        { signal }
    );

    elements.filterOverlay?.addEventListener(
        "click",
        closeMobileFilters,
        { signal }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                closeMobileFilters();
            }
        },
        { signal }
    );

    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 992) {
                closeMobileFilters();
            }
        },
        { signal }
    );

    closeMobileFilters();
}

function setupHistoryNavigation() {
    window.addEventListener(
        "popstate",
        () => {
            state = readStateFromUrl();

            syncInputs();
            loadProducts();
        },
        { signal: eventController.signal }
    );
}

export async function initCatalog() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    state = readStateFromUrl();

    eventController = new AbortController();

    syncInputs();
    setupSearch();
    setupFilters();
    setupSorting();
    setupMobileFilters();
    setupHistoryNavigation();

    await Promise.allSettled([
        loadCategories(),
        loadProducts()
    ]);
}

export function destroyCatalog() {
    active = false;
    initialized = false;

    requestVersion += 1;

    searchDebounce?.cancel();
    priceDebounce?.cancel();

    eventController?.abort();

    eventController = null;
    searchDebounce = null;
    priceDebounce = null;
    categoryListGenerated = false;
}

export const catalog = {
    init: initCatalog,
    destroy: destroyCatalog,
    reload: loadProducts,
    resetFilters,
    applyFilters,
    getState() {
        return { ...state };
    }
};

export default catalog;
