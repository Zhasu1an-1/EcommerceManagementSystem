
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
        "#catalog-product-grid",
        "#catalog-products-grid",
        "#products-grid",
        ".catalog-product-grid",
        ".catalog-products-grid"
    ],
    search: [
        "#catalog-keyword",
        "#catalog-search",
        "#catalog-search-input",
        "#product-search",
        'input[name="keyword"]'
    ],
    searchForm: [
        "#catalog-filter-form",
        "#catalog-search-form",
        ".catalog-search-form"
    ],
    category: [
        "#catalog-category",
        "#catalog-category-select",
        'select[name="categoryId"]'
    ],
    categoryList: [
        "#catalog-category-options",
        "#catalog-categories",
        "#catalog-category-list",
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
        "#catalog-empty-state",
        "#catalog-empty"
    ],
    error: [
        "#catalog-error-state",
        "#catalog-error"
    ],
    pagination: [
        "#catalog-pagination",
        ".catalog-pagination"
    ],
    sidebar: [
        "#catalog-sidebar",
        "#catalog-filter-sidebar",
        ".catalog-sidebar",
        ".catalog-filter-sidebar",
        ".catalog-filters-sidebar"
    ],
    filterToggle: [
        "#open-catalog-filters",
        "#catalog-filter-toggle",
        "#catalog-mobile-filters-button",
        ".catalog-filter-toggle",
        ".catalog-mobile-filters-button"
    ],
    filterClose: [
        "#close-catalog-filters",
        "#catalog-filter-close",
        "[data-catalog-filter-close]"
    ],
    filterApply: [
        "#apply-catalog-filters",
        "#catalog-apply-filters",
        "#apply-filters",
        "[data-catalog-apply]"
    ],
    filterReset: [
        "#reset-catalog-filters",
        "#catalog-reset-filters",
        "#catalog-clear-filters",
        "#reset-filters",
        "[data-catalog-reset]"
    ],
    filterOverlay: [
        "#catalog-filter-overlay",
        ".catalog-filter-overlay"
    ],
    categoryChips: [
        "#catalog-category-chips",
        ".catalog-category-chips"
    ],
    activeFilters: [
        "#catalog-active-filters"
    ],
    emptyReset: [
        "#catalog-empty-reset"
    ],
    retryButton: [
        "#catalog-retry-button"
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

let categories = [];

function createDefaultState() {
    return {
        keyword: "",
        categoryId: null,
        minPrice: null,
        maxPrice: null,
        inStock: false,
        sort: DEFAULT_SORT,
        page: 0,
        size: DEFAULT_PAGE_SIZE
    };
}

let state = createDefaultState();

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

function toPositiveNumber(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : null;
}

function toCategoryId(value) {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === "" ||
        String(value).toLowerCase() === "all"
    ) {
        return null;
    }

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

    const result = {
        keyword: String(
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

    if (
        result.minPrice !== null &&
        result.maxPrice !== null &&
        result.minPrice > result.maxPrice
    ) {
        result.minPrice = null;
        result.maxPrice = null;
    }

    return result;
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

function extractItems(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.products)) {
        return response.products;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    if (Array.isArray(response?.data?.products)) {
        return response.data.products;
    }

    if (Array.isArray(response?.data?.items)) {
        return response.data.items;
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

function normalizeCategory(category) {
    if (
        !category ||
        typeof category !== "object"
    ) {
        return null;
    }

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

    return {
        id,
        name
    };
}

function syncInputs() {
    const elements = getElements();

    if (elements.search) {
        elements.search.value = state.keyword;
    }

    if (elements.minPrice) {
        elements.minPrice.value = state.minPrice ?? "";
    }

    if (elements.maxPrice) {
        elements.maxPrice.value = state.maxPrice ?? "";
    }

    if (elements.inStock) {
        if (elements.inStock.type === "checkbox") {
            elements.inStock.checked = state.inStock;
        } else {
            elements.inStock.value = String(state.inStock);
        }
    }

    if (elements.sort instanceof HTMLSelectElement) {
        const option = Array.from(elements.sort.options)
            .find(item =>
                normalizeSort(item.value) === state.sort
            );

        if (option) {
            elements.sort.value = option.value;
        }
    }

    if (elements.category instanceof HTMLSelectElement) {
        elements.category.value = String(
            state.categoryId ?? ""
        );
    }

    const radios = document.querySelectorAll(
        'input[name="categoryId"][type="radio"], input[name="category"][type="radio"]'
    );

    for (const radio of radios) {
        const id = toCategoryId(radio.value);

        radio.checked =
            id === state.categoryId;
    }

    syncCategoryChips();
    renderActiveFilters();
}

function createCategoryOption(category) {
    const label = document.createElement("label");
    label.className =
        "catalog-filter-option catalog-category-option";

    const left = document.createElement("span");
    left.className = "catalog-filter-option-left";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "categoryId";
    radio.value = String(category.id);
    radio.id = `catalog-category-${category.id}`;
    radio.checked = state.categoryId === category.id;

    const text = document.createElement("span");
    text.textContent = category.name;

    left.append(radio, text);
    label.appendChild(left);

    return label;
}

function renderCategoryOptions() {
    const elements = getElements();

    if (elements.category instanceof HTMLSelectElement) {
        const fragment = document.createDocumentFragment();

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "Барлық категориялар";

        fragment.appendChild(allOption);

        for (const category of categories) {
            const option = document.createElement("option");
            option.value = String(category.id);
            option.textContent = category.name;

            fragment.appendChild(option);
        }

        elements.category.replaceChildren(fragment);
        elements.category.value = String(state.categoryId ?? "");

        return;
    }

    const container = elements.categoryList;

    if (!container || container instanceof HTMLSelectElement) {
        return;
    }

    const fragment = document.createDocumentFragment();

    const allLabel = document.createElement("label");
    allLabel.className =
        "catalog-filter-option catalog-category-option";

    const left = document.createElement("span");
    left.className = "catalog-filter-option-left";

    const allRadio = document.createElement("input");
    allRadio.type = "radio";
    allRadio.name = "categoryId";
    allRadio.id = "catalog-category-all";
    allRadio.value = "";
    allRadio.checked = state.categoryId === null;

    const allText = document.createElement("span");
    allText.textContent = "Барлық категориялар";

    left.append(allRadio, allText);
    allLabel.appendChild(left);

    fragment.appendChild(allLabel);

    for (const category of categories) {
        fragment.appendChild(
            createCategoryOption(category)
        );
    }

    container.replaceChildren(fragment);
}

function renderCategoryChips() {
    const container = getElements().categoryChips;

    if (!container || categories.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();

    const items = [
        {
            id: null,
            name: "Барлығы"
        },
        ...categories
    ];

    for (const item of items) {
        const link = document.createElement("a");

        link.className = "catalog-category-chip";
        link.textContent = item.name;

        const url = new URL(
            window.location.href
        );

        if (item.id === null) {
            url.searchParams.delete("categoryId");
        } else {
            url.searchParams.set(
                "categoryId",
                String(item.id)
            );
        }

        url.searchParams.delete("page");

        link.href = `${url.pathname}${url.search}`;

        link.dataset.categoryId =
            item.id === null ? "" : String(item.id);

        link.classList.toggle(
            "is-active",
            state.categoryId === item.id
        );

        fragment.appendChild(link);
    }

    container.replaceChildren(fragment);
}

function syncCategoryChips() {
    const container = getElements().categoryChips;

    if (!container) {
        return;
    }

    const chips = container.querySelectorAll(
        ".catalog-category-chip"
    );

    for (const chip of chips) {
        const id = toCategoryId(
            chip.dataset.categoryId ??
            new URL(chip.href, window.location.origin)
                .searchParams.get("categoryId")
        );

        const selected = id === state.categoryId;

        chip.classList.toggle(
            "is-active",
            selected
        );

        if (selected) {
            chip.setAttribute("aria-current", "true");
        } else {
            chip.removeAttribute("aria-current");
        }
    }
}

function createFilterChip(label, onRemove) {
    const chip = document.createElement("span");
    chip.className = "catalog-filter-chip";

    const text = document.createElement("span");
    text.textContent = label;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "×";
    button.setAttribute(
        "aria-label",
        `${label} сүзгісін алып тастау`
    );

    button.addEventListener(
        "click",
        onRemove
    );

    chip.append(text, button);

    return chip;
}

function updateFilter(key, value) {
    state[key] = value;
    state.page = 0;

    syncInputs();
    writeStateToUrl();

    loadProducts();
}

function renderActiveFilters() {
    const container = getElements().activeFilters;

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    if (state.keyword) {
        fragment.appendChild(
            createFilterChip(
                `Іздеу: ${state.keyword}`,
                () => updateFilter("keyword", "")
            )
        );
    }

    if (state.categoryId !== null) {
        const category = categories.find(
            item => item.id === state.categoryId
        );

        fragment.appendChild(
            createFilterChip(
                category?.name ?? `Категория #${state.categoryId}`,
                () => updateFilter("categoryId", null)
            )
        );
    }

    if (state.minPrice !== null) {
        fragment.appendChild(
            createFilterChip(
                `Бастап: ${state.minPrice} ₸`,
                () => updateFilter("minPrice", null)
            )
        );
    }

    if (state.maxPrice !== null) {
        fragment.appendChild(
            createFilterChip(
                `Дейін: ${state.maxPrice} ₸`,
                () => updateFilter("maxPrice", null)
            )
        );
    }

    if (state.inStock) {
        fragment.appendChild(
            createFilterChip(
                "Қоймада бар",
                () => updateFilter("inStock", false)
            )
        );
    }

    container.replaceChildren(fragment);

    if (fragment.childNodes.length > 0) {
        showElement(container);
    } else if (container.childElementCount > 0) {
        showElement(container);
    } else {
        hideElement(container);
    }
}

function createLoadingSkeletons(container) {
    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 6; index++) {
        const skeleton = document.createElement("div");

        skeleton.className =
            "product-card skeleton catalog-product-skeleton";

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
        "p, .empty-state-text, .empty-state-description"
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
    wrapper.className = "empty-state catalog-empty-state";
    wrapper.style.gridColumn = "1 / -1";

    const heading = document.createElement("h3");
    heading.className = "empty-state-title";
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.className = "empty-state-text";
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
        "Іздеу шарттарын өзгертіп немесе сүзгілерді тазалап көр."
    )) {
        renderInlineState(
            "Тауарлар табылмады",
            "Іздеу шарттарын өзгертіп немесе сүзгілерді тазалап көр."
        );
    } else {
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
    } else {
        elements.grid?.replaceChildren();
    }

    elements.pagination?.replaceChildren();
}

function getPageResponse(response, productCount) {
    const source = response?.data?.content
        ? response.data
        : response;

    if (
        source &&
        typeof source === "object" &&
        !Array.isArray(source)
    ) {
        return {
            ...source,
            number:
                source.number ??
                source.page?.number ??
                state.page,
            size:
                source.size ??
                source.page?.size ??
                state.size,
            totalElements:
                source.totalElements ??
                source.page?.totalElements ??
                productCount,
            totalPages:
                source.totalPages ??
                source.page?.totalPages ??
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

function scrollToProducts() {
    const target = document.querySelector(
        ".catalog-toolbar, #catalog-products, .catalog-main"
    );

    target?.scrollIntoView({
        behavior: window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches
            ? "auto"
            : "smooth",
        block: "start"
    });
}

async function loadProducts(options = {}) {
    const {
        scrollToTop = false
    } = options;

    const version = ++requestVersion;
    const elements = getElements();

    if (!elements.grid || !active) {
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

        const products = extractItems(response);

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
            scrollToProducts();
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

async function loadCategories() {
    try {
        const response = await api.categories.list();

        if (!active) {
            return;
        }

        categories = extractItems(response)
            .map(normalizeCategory)
            .filter(Boolean);

        renderCategoryOptions();
        renderCategoryChips();
        syncInputs();
    } catch (error) {
        if (!active) {
            return;
        }

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
        return false;
    }

    const selected = document.querySelector(
        'input[name="categoryId"]:checked, input[name="category"]:checked'
    );

    state.keyword = String(
        elements.search?.value ?? ""
    ).trim();

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
    } else if (selected) {
        state.categoryId = toCategoryId(
            selected.value
        );
    }

    state.page = 0;

    syncCategoryChips();
    renderActiveFilters();
    writeStateToUrl();
    loadProducts();

    return true;
}

function resetFilters() {
    searchDebounce?.cancel();
    priceDebounce?.cancel();

    state = createDefaultState();

    syncInputs();
    writeStateToUrl();
    loadProducts();
    closeMobileFilters();
}

function setupSearch() {
    const elements = getElements();
    const signal = eventController.signal;

    searchDebounce = debounce(
        () => {
            applyFilters();
        },
        450
    );

    elements.search?.addEventListener(
        "input",
        searchDebounce,
        { signal }
    );
}

function setupFilters() {
    const elements = getElements();
    const signal = eventController.signal;

    priceDebounce = debounce(
        () => {
            applyFilters();
        },
        550
    );

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
        () => applyFilters(),
        { signal }
    );

    elements.category?.addEventListener(
        "change",
        () => applyFilters(),
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

    elements.searchForm?.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            searchDebounce?.cancel();
            priceDebounce?.cancel();

            if (applyFilters()) {
                closeMobileFilters();
            }
        },
        { signal }
    );

    elements.searchForm?.addEventListener(
        "reset",
        event => {
            event.preventDefault();
            resetFilters();
        },
        { signal }
    );

    if (
        elements.filterApply &&
        !elements.searchForm?.contains(elements.filterApply)
    ) {
        elements.filterApply.addEventListener(
            "click",
            event => {
                event.preventDefault();

                searchDebounce?.cancel();
                priceDebounce?.cancel();

                if (applyFilters()) {
                    closeMobileFilters();
                }
            },
            { signal }
        );
    }

    if (
        elements.filterReset &&
        !elements.searchForm?.contains(elements.filterReset)
    ) {
        elements.filterReset.addEventListener(
            "click",
            event => {
                event.preventDefault();
                resetFilters();
            },
            { signal }
        );
    }

    elements.emptyReset?.addEventListener(
        "click",
        resetFilters,
        { signal }
    );

    elements.retryButton?.addEventListener(
        "click",
        () => loadProducts(),
        { signal }
    );

    elements.categoryChips?.addEventListener(
        "click",
        event => {
            const chip = event.target.closest(
                ".catalog-category-chip"
            );

            if (
                !chip ||
                !elements.categoryChips.contains(chip)
            ) {
                return;
            }

            event.preventDefault();

            const url = new URL(
                chip.href,
                window.location.origin
            );

            state.categoryId = toCategoryId(
                url.searchParams.get("categoryId")
            );

            state.page = 0;

            syncInputs();
            writeStateToUrl();
            loadProducts();
        },
        { signal }
    );
}

function setupSorting() {
    const element = getElements().sort;

    element?.addEventListener(
        "change",
        () => {
            state.sort = normalizeSort(
                element.value
            );

            state.page = 0;

            writeStateToUrl();
            loadProducts();
        },
        {
            signal: eventController.signal
        }
    );
}

function openMobileFilters() {
    const elements = getElements();

    if (!elements.sidebar) {
        return;
    }

    elements.sidebar.classList.remove("is-collapsed");
    elements.sidebar.classList.add("is-open");

    elements.filterOverlay?.classList.add("is-visible");

    if (elements.filterOverlay) {
        showElement(elements.filterOverlay);
    }

    elements.filterToggle?.setAttribute(
        "aria-expanded",
        "true"
    );

    document.body.classList.add(
        "catalog-filters-open"
    );
}

function closeMobileFilters() {
    const elements = getElements();

    elements.sidebar?.classList.remove("is-open");
    elements.filterOverlay?.classList.remove("is-visible");

    if (elements.filterOverlay) {
        hideElement(elements.filterOverlay);
    }

    if (window.innerWidth <= 992) {
        elements.sidebar?.classList.add("is-collapsed");
    } else {
        elements.sidebar?.classList.remove("is-collapsed");
    }

    elements.filterToggle?.setAttribute(
        "aria-expanded",
        "false"
    );

    document.body.classList.remove(
        "catalog-filters-open"
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
        event => {
            event.preventDefault();
            closeMobileFilters();
        },
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
            searchDebounce?.cancel();
            priceDebounce?.cancel();

            state = readStateFromUrl();

            syncInputs();
            loadProducts();
        },
        {
            signal: eventController.signal
        }
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

    requestVersion++;

    searchDebounce?.cancel();
    priceDebounce?.cancel();

    eventController?.abort();

    document.body.classList.remove(
        "catalog-filters-open"
    );

    eventController = null;
    searchDebounce = null;
    priceDebounce = null;

    categories = [];
}

export const catalog = {
    init: initCatalog,
    destroy: destroyCatalog,
    reload: loadProducts,
    resetFilters,
    applyFilters,

    getState() {
        return { ...state };
    },

    getCategories() {
        return [...categories];
    }
};

export default catalog;
