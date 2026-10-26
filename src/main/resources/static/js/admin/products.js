
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const IDS = Object.freeze({
    content: "admin-products-content",
    refresh: "admin-products-refresh-button",
    retry: "admin-products-retry-button",
    addButton: "admin-add-product-button",

    total: "admin-products-total",
    inStock: "admin-products-in-stock",
    lowStock: "admin-products-low-stock",
    outOfStock: "admin-products-out-of-stock",

    searchForm: "admin-products-search-form",
    search: "admin-products-search",

    filterToggle: "admin-products-filter-toggle",
    filters: "admin-products-filters",
    filterForm: "admin-products-filter-form",
    category: "admin-products-category-filter",
    stock: "admin-products-stock-filter",
    sort: "admin-products-sort",
    pageSize: "admin-products-page-size",
    reset: "admin-products-reset-filters",

    resultsCount: "admin-products-results-count",
    loading: "admin-products-loading",
    error: "admin-products-error",
    errorMessage: "admin-products-error-message",
    empty: "admin-products-empty",
    filterEmpty: "admin-products-filter-empty",
    clearSearch: "admin-products-clear-search",

    tableContainer: "admin-products-table-container",
    tableBody: "admin-products-table-body",
    tableFooter: "admin-products-table-footer",
    paginationInfo: "admin-products-pagination-info",
    pagination: "admin-products-pagination",

    deleteModal: "admin-product-delete-modal",
    deleteName: "admin-product-delete-name",
    deleteId: "admin-product-delete-id",
    deleteError: "admin-product-delete-error",
    deleteClose: "admin-product-delete-close",
    deleteCancel: "admin-product-delete-cancel",
    deleteConfirm: "admin-product-delete-confirm",
    deleteConfirmText: "admin-product-delete-confirm-text"
});

const API = Object.freeze({
    products: "/api/products",
    categories: "/api/categories"
});

const SORT_OPTIONS = new Set([
    "id,desc",
    "id,asc",
    "name,asc",
    "name,desc",
    "price,asc",
    "price,desc",
    "stock,asc",
    "stock,desc"
]);

const STOCK_OPTIONS = new Set([
    "ALL",
    "IN_STOCK",
    "LOW_STOCK",
    "OUT_OF_STOCK"
]);

const PAGE_SIZES = new Set([
    10,
    20,
    50
]);

const API_PAGE_SIZE = 50;
const MAX_API_PAGES = 200;
const LOW_STOCK_LIMIT = 5;

const integerFormatter = new Intl.NumberFormat("kk-KZ");

const currencyFormatter = new Intl.NumberFormat("kk-KZ", {
    style: "currency",
    currency: "KZT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});

const $ = id => document.getElementById(id);

let initialized = false;
let active = false;
let loading = false;
let deleting = false;

let requestVersion = 0;
let eventController = null;
let searchTimer = null;

let products = [];
let categories = [];

let pendingDelete = null;
let deleteReturnFocus = null;
let previousBodyOverflow = "";

let state = createInitialState();

function createInitialState() {
    return {
        keyword: "",
        categoryId: null,
        stockStatus: "ALL",
        sort: "id,desc",
        page: 0,
        size: 10
    };
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = String(value ?? "—");
    }
}

function setVisible(id, visible) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.hidden = !visible;
    element.classList.toggle("hidden", !visible);
}

function createElement(tag, className = "", value = null) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (value !== null && value !== undefined) {
        element.textContent = String(value);
    }

    return element;
}

function parseId(value) {
    const text = String(value ?? "").trim();

    if (!/^[1-9]\d*$/.test(text)) {
        return null;
    }

    const number = Number(text);

    return Number.isSafeInteger(number)
        ? number
        : null;
}

function parsePage(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number >= 0
        ? number
        : 0;
}

function formatInteger(value) {
    return integerFormatter.format(value);
}

function formatCurrency(value) {
    if (
        value === null ||
        !Number.isFinite(value)
    ) {
        return "—";
    }

    return currencyFormatter.format(value);
}

function getSafeImageUrl(value) {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(
            String(value).trim(),
            window.location.origin
        );

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

function normalizeProduct(raw) {
    if (
        !raw ||
        typeof raw !== "object"
    ) {
        return null;
    }

    const id = parseId(
        raw.id ?? raw.productId
    );

    if (id === null) {
        return null;
    }

    const price = Number(raw.price);
    const stock = Number(raw.stock);

    return {
        id,
        name: String(
            raw.name ?? "Unnamed Product"
        ).trim(),
        description: String(
            raw.description ?? ""
        ),
        categoryId: parseId(
            raw.categoryId ?? raw.category?.id
        ),
        categoryName: String(
            raw.categoryName ??
            raw.category?.name ??
            ""
        ).trim(),
        price: Number.isFinite(price)
            ? price
            : null,
        stock:
            raw.stock !== null &&
            raw.stock !== undefined &&
            Number.isSafeInteger(stock) &&
            stock >= 0
                ? stock
                : null,
        imageUrl: getSafeImageUrl(raw.imageUrl)
    };
}

function extractPage(response) {
    const source =
        response?.data?.content !== undefined
            ? response.data
            : response?.data?.products !== undefined
                ? response.data
                : response;

    if (Array.isArray(source)) {
        return {
            content: source,
            totalPages: null
        };
    }

    const content = Array.isArray(source?.content)
        ? source.content
        : Array.isArray(source?.products)
            ? source.products
            : null;

    if (!content) {
        throw new Error(
            "Products API тауарлар тізімін күтілген форматта қайтармады."
        );
    }

    const rawPages = source.totalPages;

    if (
        rawPages === undefined ||
        rawPages === null
    ) {
        return {
            content,
            totalPages: null
        };
    }

    const totalPages = Number(rawPages);

    if (
        !Number.isSafeInteger(totalPages) ||
        totalPages < 0
    ) {
        throw new Error(
            "Products API pagination деректері дұрыс емес."
        );
    }

    return {
        content,
        totalPages
    };
}

function extractCategories(response) {
    const source =
        Array.isArray(response)
            ? response
            : Array.isArray(response?.content)
                ? response.content
                : Array.isArray(response?.data)
                    ? response.data
                    : Array.isArray(response?.data?.content)
                        ? response.data.content
                        : null;

    if (!source) {
        throw new Error(
            "Categories API дұрыс тізім қайтармады."
        );
    }

    const unique = new Map();

    for (const raw of source) {
        const id = parseId(raw?.id);
        const name = String(
            raw?.name ?? ""
        ).trim();

        if (id !== null && name) {
            unique.set(id, {
                id,
                name
            });
        }
    }

    return [...unique.values()].sort(
        (a, b) => a.name.localeCompare(b.name)
    );
}

async function fetchAllProducts(version) {
    const result = [];

    for (
        let page = 0;
        page < MAX_API_PAGES;
        page++
    ) {
        const params = new URLSearchParams({
            page: String(page),
            size: String(API_PAGE_SIZE)
        });

        const response = await api.get(
            `${API.products}?${params.toString()}`
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return null;
        }

        const pageData = extractPage(response);

        result.push(...pageData.content);

        if (
            pageData.totalPages === null ||
            page + 1 >= pageData.totalPages
        ) {
            return result;
        }
    }

    throw new Error(
        "Тауарлар саны қолданыстағы клиенттік pagination шегінен асып кетті."
    );
}

function getCategoryName(product) {
    if (product.categoryName) {
        return product.categoryName;
    }

    const category = categories.find(
        item => item.id === product.categoryId
    );

    return category?.name ?? "Uncategorized";
}

function getStockDetails(product) {
    const stock = product.stock;

    if (stock === null) {
        return {
            label: "Unknown",
            variant: "neutral",
            type: "UNKNOWN"
        };
    }

    if (stock === 0) {
        return {
            label: "Out of Stock",
            variant: "danger",
            type: "OUT_OF_STOCK"
        };
    }

    if (stock <= LOW_STOCK_LIMIT) {
        return {
            label: "Low Stock",
            variant: "warning",
            type: "LOW_STOCK"
        };
    }

    return {
        label: "In Stock",
        variant: "success",
        type: "IN_STOCK"
    };
}

function getStatistics() {
    const stats = {
        total: products.length,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0
    };

    for (const product of products) {
        if (product.stock === null) {
            continue;
        }

        if (product.stock === 0) {
            stats.outOfStock++;
        } else {
            stats.inStock++;

            if (product.stock <= LOW_STOCK_LIMIT) {
                stats.lowStock++;
            }
        }
    }

    return stats;
}

function renderStatistics() {
    const stats = getStatistics();

    setText(
        IDS.total,
        formatInteger(stats.total)
    );

    setText(
        IDS.inStock,
        formatInteger(stats.inStock)
    );

    setText(
        IDS.lowStock,
        formatInteger(stats.lowStock)
    );

    setText(
        IDS.outOfStock,
        formatInteger(stats.outOfStock)
    );
}

function resetStatistics() {
    for (const id of [
        IDS.total,
        IDS.inStock,
        IDS.lowStock,
        IDS.outOfStock
    ]) {
        setText(id, "—");
    }
}

function matchesFilters(product) {
    if (state.keyword) {
        const keyword = state.keyword.toLocaleLowerCase();

        const name = product.name.toLocaleLowerCase();

        if (!name.includes(keyword)) {
            return false;
        }
    }

    if (
        state.categoryId !== null &&
        product.categoryId !== state.categoryId
    ) {
        return false;
    }

    if (state.stockStatus === "IN_STOCK") {
        return product.stock !== null &&
            product.stock > 0;
    }

    if (state.stockStatus === "LOW_STOCK") {
        return product.stock !== null &&
            product.stock > 0 &&
            product.stock <= LOW_STOCK_LIMIT;
    }

    if (state.stockStatus === "OUT_OF_STOCK") {
        return product.stock === 0;
    }

    return true;
}

function compareNumbers(a, b, direction) {
    const first = a ?? -Infinity;
    const second = b ?? -Infinity;

    return direction === "asc"
        ? first - second
        : second - first;
}

function compareProducts(first, second) {
    const [field, direction] = state.sort.split(",");

    let result = 0;

    switch (field) {
        case "name":
            result = first.name.localeCompare(
                second.name,
                undefined,
                { sensitivity: "base" }
            );

            if (direction === "desc") {
                result *= -1;
            }

            break;

        case "price":
            result = compareNumbers(
                first.price,
                second.price,
                direction
            );
            break;

        case "stock":
            result = compareNumbers(
                first.stock,
                second.stock,
                direction
            );
            break;

        default:
            result = compareNumbers(
                first.id,
                second.id,
                direction
            );
    }

    return result || second.id - first.id;
}

function filteredProducts() {
    return products
        .filter(matchesFilters)
        .sort(compareProducts);
}

function createProductImage(product) {
    const container = createElement(
        "div",
        "admin-product-image"
    );

    if (!product.imageUrl) {
        container.textContent = "N";
        return container;
    }

    const image = document.createElement("img");

    image.alt = product.name;
    image.loading = "lazy";

    image.onerror = () => {
        container.replaceChildren();
        container.textContent = "N";
    };

    image.src = product.imageUrl;

    container.appendChild(image);

    return container;
}

function createProductRow(product) {
    const row = document.createElement("tr");

    row.dataset.productId = String(product.id);

    const productCell = document.createElement("td");

    const information = createElement(
        "div",
        "admin-product-cell"
    );

    const image = createProductImage(product);

    const details = createElement(
        "div",
        "admin-product-details"
    );

    const name = createElement(
        "a",
        "admin-product-name",
        product.name
    );

    name.href =
        `/admin/product-form.html?id=${encodeURIComponent(product.id)}`;

    const identifier = createElement(
        "span",
        "admin-product-id",
        `#${product.id}`
    );

    details.append(name, identifier);
    information.append(image, details);
    productCell.appendChild(information);

    const categoryCell = createElement(
        "td",
        "admin-product-category",
        getCategoryName(product)
    );

    const priceCell = createElement(
        "td",
        "admin-product-price",
        formatCurrency(product.price)
    );

    const stockCell = createElement(
        "td",
        "admin-product-stock",
        product.stock === null
            ? "—"
            : formatInteger(product.stock)
    );

    const statusCell = document.createElement("td");

    const status = getStockDetails(product);

    const badge = createElement(
        "span",
        `badge badge-${status.variant}`,
        status.label
    );

    statusCell.appendChild(badge);

    const actionsCell = document.createElement("td");

    const actions = createElement(
        "div",
        "admin-table-actions"
    );

    const editButton = createElement(
        "a",
        "btn btn-outline btn-sm",
        "Edit"
    );

    editButton.href =
        `/admin/product-form.html?id=${encodeURIComponent(product.id)}`;

    editButton.setAttribute(
        "aria-label",
        `${product.name} тауарын өңдеу`
    );

    const deleteButton = createElement(
        "button",
        "btn btn-danger-outline btn-sm",
        "Delete"
    );

    deleteButton.type = "button";

    deleteButton.dataset.deleteProductId =
        String(product.id);

    deleteButton.setAttribute(
        "aria-label",
        `${product.name} тауарын жою`
    );

    actions.append(
        editButton,
        deleteButton
    );

    actionsCell.appendChild(actions);

    row.append(
        productCell,
        categoryCell,
        priceCell,
        stockCell,
        statusCell,
        actionsCell
    );

    return row;
}

function renderCategoryOptions() {
    const select = $(IDS.category);

    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

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

    select.replaceChildren(fragment);
}

function syncControls() {
    const values = {
        [IDS.search]: state.keyword,
        [IDS.category]: String(state.categoryId ?? ""),
        [IDS.stock]: state.stockStatus,
        [IDS.sort]: state.sort,
        [IDS.pageSize]: String(state.size)
    };

    for (const [id, value] of Object.entries(values)) {
        const element = $(id);

        if (
            element &&
            element.value !== value
        ) {
            element.value = value;
        }
    }
}

function readStateFromUrl() {
    const params = new URLSearchParams(
        window.location.search
    );

    const requestedSort = params.get("sort") ?? "id,desc";

    const requestedStock = params.get("stock") ?? "ALL";

    const requestedSize = Number(
        params.get("size") ?? 10
    );

    return {
        keyword: String(
            params.get("keyword") ?? ""
        ).trim(),

        categoryId: parseId(
            params.get("categoryId")
        ),

        stockStatus: STOCK_OPTIONS.has(requestedStock)
            ? requestedStock
            : "ALL",

        sort: SORT_OPTIONS.has(requestedSort)
            ? requestedSort
            : "id,desc",

        page: parsePage(
            params.get("page") ?? 0
        ),

        size: PAGE_SIZES.has(requestedSize)
            ? requestedSize
            : 10
    };
}

function updateUrl() {
    const url = new URL(
        window.location.href
    );

    const values = {
        keyword: state.keyword || null,
        categoryId: state.categoryId,
        stock: state.stockStatus === "ALL"
            ? null
            : state.stockStatus,
        sort: state.sort === "id,desc"
            ? null
            : state.sort,
        size: state.size === 10
            ? null
            : state.size,
        page: state.page === 0
            ? null
            : state.page
    };

    for (const [name, value] of Object.entries(values)) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            url.searchParams.delete(name);
        } else {
            url.searchParams.set(
                name,
                String(value)
            );
        }
    }

    window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
    );
}

function createPaginationButton(
    label,
    page,
    disabled = false,
    current = false
) {
    const button = createElement(
        "button",
        "pagination-button",
        label
    );

    button.type = "button";

    button.dataset.page = String(page);

    button.disabled = disabled || current;

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

function renderPagination(totalPages) {
    const container = $(IDS.pagination);

    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    if (totalPages <= 1) {
        container.replaceChildren();
        return;
    }

    fragment.appendChild(
        createPaginationButton(
            "Previous",
            state.page - 1,
            state.page === 0
        )
    );

    const start = Math.max(
        0,
        state.page - 2
    );

    const end = Math.min(
        totalPages - 1,
        state.page + 2
    );

    if (start > 0) {
        fragment.appendChild(
            createPaginationButton("1", 0)
        );

        if (start > 1) {
            fragment.appendChild(
                createElement(
                    "span",
                    "pagination-ellipsis",
                    "…"
                )
            );
        }
    }

    for (let page = start; page <= end; page++) {
        fragment.appendChild(
            createPaginationButton(
                String(page + 1),
                page,
                false,
                page === state.page
            )
        );
    }

    if (end < totalPages - 1) {
        if (end < totalPages - 2) {
            fragment.appendChild(
                createElement(
                    "span",
                    "pagination-ellipsis",
                    "…"
                )
            );
        }

        fragment.appendChild(
            createPaginationButton(
                String(totalPages),
                totalPages - 1
            )
        );
    }

    fragment.appendChild(
        createPaginationButton(
            "Next",
            state.page + 1,
            state.page >= totalPages - 1
        )
    );

    container.replaceChildren(fragment);
}

function renderProducts() {
    const filtered = filteredProducts();

    const totalPages = Math.ceil(
        filtered.length / state.size
    );

    state.page = Math.min(
        state.page,
        Math.max(0, totalPages - 1)
    );

    const startIndex = state.page * state.size;

    const pageProducts = filtered.slice(
        startIndex,
        startIndex + state.size
    );

    renderStatistics();

    setText(
        IDS.resultsCount,
        `${formatInteger(filtered.length)} тауар табылды`
    );

    const hasProducts = products.length > 0;
    const hasResults = pageProducts.length > 0;

    setVisible(
        IDS.empty,
        !hasProducts
    );

    setVisible(
        IDS.filterEmpty,
        hasProducts && filtered.length === 0
    );

    setVisible(
        IDS.tableContainer,
        hasResults
    );

    setVisible(
        IDS.tableFooter,
        hasResults
    );

    setVisible(
        IDS.error,
        false
    );

    const fragment = document.createDocumentFragment();

    for (const product of pageProducts) {
        fragment.appendChild(
            createProductRow(product)
        );
    }

    $(IDS.tableBody)?.replaceChildren(fragment);

    setText(
        IDS.paginationInfo,
        hasResults
            ? `${startIndex + 1}–${startIndex + pageProducts.length} / ${filtered.length}`
            : "0 / 0"
    );

    renderPagination(totalPages);
    syncControls();
    updateUrl();
}

function clearTable() {
    $(IDS.tableBody)?.replaceChildren();
    $(IDS.pagination)?.replaceChildren();

    setVisible(IDS.tableContainer, false);
    setVisible(IDS.tableFooter, false);
}

function setLoading(value) {
    loading = value;

    setVisible(
        IDS.loading,
        value
    );

    if (value) {
        setVisible(IDS.error, false);
        setVisible(IDS.empty, false);
        setVisible(IDS.filterEmpty, false);

        clearTable();
    }

    const refresh = $(IDS.refresh);
    const retry = $(IDS.retry);

    if (refresh instanceof HTMLButtonElement) {
        refresh.disabled = value;
    }

    if (retry instanceof HTMLButtonElement) {
        retry.disabled = value;
    }
}

function showLoadError(error) {
    const message = getErrorMessage(error);

    products = [];

    resetStatistics();
    clearTable();

    setText(
        IDS.resultsCount,
        "Тауарларды жүктеу мүмкін болмады"
    );

    setText(
        IDS.errorMessage,
        message
    );

    setVisible(IDS.error, true);
    setVisible(IDS.empty, false);
    setVisible(IDS.filterEmpty, false);

    if (!$(IDS.error)) {
        showError(message);
    }
}

async function loadProducts() {
    if (!active) {
        return;
    }

    const currentVersion = ++requestVersion;

    setLoading(true);

    try {
        const categoryPromise = api.get(
            API.categories
        ).catch(error => {
            console.error(
                "Categories loading failed:",
                error
            );

            return null;
        });

        const [rawProducts, categoryResponse] = await Promise.all([
            fetchAllProducts(currentVersion),
            categoryPromise
        ]);

        if (
            !active ||
            currentVersion !== requestVersion ||
            rawProducts === null
        ) {
            return;
        }

        if (categoryResponse !== null) {
            try {
                categories = extractCategories(
                    categoryResponse
                );
            } catch (error) {
                console.error(
                    "Invalid categories response:",
                    error
                );

                categories = [];
            }
        }

        const unique = new Map();

        for (const raw of rawProducts) {
            const product = normalizeProduct(raw);

            if (product) {
                unique.set(
                    product.id,
                    product
                );
            }
        }

        products = [...unique.values()];

        renderCategoryOptions();

        setLoading(false);
        renderProducts();
    } catch (error) {
        if (
            !active ||
            currentVersion !== requestVersion
        ) {
            return;
        }

        setLoading(false);
        showLoadError(error);
    }
}

function applyFilters() {
    const keyword = String(
        $(IDS.search)?.value ?? ""
    ).trim();

    const categoryId = parseId(
        $(IDS.category)?.value
    );

    const requestedStock = String(
        $(IDS.stock)?.value ?? "ALL"
    );

    const requestedSort = String(
        $(IDS.sort)?.value ?? "id,desc"
    );

    const requestedSize = Number(
        $(IDS.pageSize)?.value ?? 10
    );

    state.keyword = keyword;

    state.categoryId = categoryId;

    state.stockStatus = STOCK_OPTIONS.has(requestedStock)
        ? requestedStock
        : "ALL";

    state.sort = SORT_OPTIONS.has(requestedSort)
        ? requestedSort
        : "id,desc";

    state.size = PAGE_SIZES.has(requestedSize)
        ? requestedSize
        : 10;

    state.page = 0;

    renderProducts();
}

function resetFilters() {
    window.clearTimeout(searchTimer);

    searchTimer = null;
    state = createInitialState();

    syncControls();
    renderProducts();
}

function changePage(page) {
    if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page === state.page
    ) {
        return;
    }

    const totalPages = Math.ceil(
        filteredProducts().length / state.size
    );

    if (page >= totalPages) {
        return;
    }

    state.page = page;

    renderProducts();

    $(IDS.tableContainer)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function setDeleteButtonBusy(value) {
    const button = $(IDS.deleteConfirm);

    if (!(button instanceof HTMLButtonElement)) {
        return;
    }

    button.disabled = value;

    button.setAttribute(
        "aria-busy",
        String(value)
    );

    setText(
        IDS.deleteConfirmText,
        value ? "Жойылуда..." : "Иә, жою"
    );
}

function openDeleteModal(productId) {
    if (deleting || loading) {
        return;
    }

    const product = products.find(
        item => item.id === productId
    );

    if (!product) {
        showError(
            "Таңдалған тауар табылмады."
        );

        return;
    }

    const modal = $(IDS.deleteModal);

    if (!modal) {
        showError(
            "Жоюды растау терезесі HTML-де табылмады."
        );

        return;
    }

    pendingDelete = product;

    setText(
        IDS.deleteName,
        product.name
    );

    setText(
        IDS.deleteId,
        `Product ID: #${product.id}`
    );

    setText(
        IDS.deleteError,
        ""
    );

    setVisible(
        IDS.deleteError,
        false
    );

    deleteReturnFocus =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    previousBodyOverflow =
        document.body.style.overflow;

    document.body.style.overflow = "hidden";

    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    $(IDS.deleteCancel)?.focus();
}

function closeDeleteModal() {
    if (deleting) {
        return;
    }

    const modal = $(IDS.deleteModal);

    if (modal) {
        modal.classList.remove("is-open");
        modal.classList.add("hidden");
        modal.hidden = true;

        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    document.body.style.overflow =
        previousBodyOverflow;

    pendingDelete = null;

    if (
        deleteReturnFocus instanceof HTMLElement &&
        deleteReturnFocus.isConnected
    ) {
        deleteReturnFocus.focus();
    }

    deleteReturnFocus = null;
}

async function confirmDelete() {
    if (
        deleting ||
        !pendingDelete ||
        !active
    ) {
        return;
    }

    const productId = pendingDelete.id;

    deleting = true;
    setDeleteButtonBusy(true);

    setVisible(
        IDS.deleteError,
        false
    );

    try {
        await api.delete(
            `${API.products}/${productId}`
        );

        if (!active) {
            return;
        }

        deleting = false;

        closeDeleteModal();

        showSuccess(
            "Тауар сәтті жойылды."
        );

        await loadProducts();
    } catch (error) {
        if (active) {
            setText(
                IDS.deleteError,
                getErrorMessage(error)
            );

            setVisible(
                IDS.deleteError,
                true
            );
        }
    } finally {
        deleting = false;
        setDeleteButtonBusy(false);
    }
}

function setupSearch() {
    const input = $(IDS.search);

    on(
        input,
        "input",
        () => {
            window.clearTimeout(searchTimer);

            searchTimer = window.setTimeout(
                () => {
                    if (!active) {
                        return;
                    }

                    state.keyword = String(
                        input?.value ?? ""
                    ).trim();

                    state.page = 0;
                    renderProducts();
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

            window.clearTimeout(searchTimer);

            applyFilters();
        }
    );
}

function setupFilters() {
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

    for (const id of [
        IDS.category,
        IDS.stock,
        IDS.sort,
        IDS.pageSize
    ]) {
        on(
            $(id),
            "change",
            applyFilters
        );
    }

    on(
        $(IDS.reset),
        "click",
        event => {
            event.preventDefault();
            resetFilters();
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

    on(
        $(IDS.filterToggle),
        "click",
        event => {
            event.preventDefault();

            const panel = $(IDS.filters);

            if (!panel) {
                return;
            }

            const shouldShow =
                panel.hidden ||
                panel.classList.contains("hidden");

            setVisible(
                IDS.filters,
                shouldShow
            );

            $(IDS.filterToggle)?.setAttribute(
                "aria-expanded",
                String(shouldShow)
            );
        }
    );
}

function setupPagination() {
    on(
        $(IDS.pagination),
        "click",
        event => {
            if (!(event.target instanceof Element)) {
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

            changePage(
                Number(button.dataset.page)
            );
        }
    );
}

function setupDelete() {
    on(
        $(IDS.tableBody),
        "click",
        event => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const button = event.target.closest(
                "[data-delete-product-id]"
            );

            if (
                !(button instanceof HTMLButtonElement) ||
                button.disabled
            ) {
                return;
            }

            const productId = parseId(
                button.dataset.deleteProductId
            );

            if (productId !== null) {
                openDeleteModal(productId);
            }
        }
    );

    on(
        $(IDS.deleteClose),
        "click",
        closeDeleteModal
    );

    on(
        $(IDS.deleteCancel),
        "click",
        closeDeleteModal
    );

    on(
        $(IDS.deleteConfirm),
        "click",
        confirmDelete
    );

    on(
        $(IDS.deleteModal),
        "click",
        event => {
            if (
                event.target === event.currentTarget
            ) {
                closeDeleteModal();
            }
        }
    );

    on(
        document,
        "keydown",
        event => {
            const modal = $(IDS.deleteModal);

            if (
                event.key === "Escape" &&
                modal &&
                !modal.hidden &&
                !deleting
            ) {
                event.preventDefault();
                closeDeleteModal();
            }
        }
    );
}

function setupRefresh() {
    for (const id of [
        IDS.refresh,
        IDS.retry
    ]) {
        on(
            $(id),
            "click",
            event => {
                event.preventDefault();
                loadProducts();
            }
        );
    }
}

function setupHistory() {
    on(
        window,
        "popstate",
        () => {
            state = readStateFromUrl();

            syncControls();
            renderProducts();
        }
    );
}

function on(target, eventName, callback) {
    target?.addEventListener(
        eventName,
        callback,
        {
            signal: eventController.signal
        }
    );
}

function validateMarkup() {
    const requiredIds = [
        IDS.content,
        IDS.loading,
        IDS.tableContainer,
        IDS.tableBody,
        IDS.resultsCount,
        IDS.deleteModal,
        IDS.deleteConfirm
    ];

    const missing = requiredIds.filter(
        id => !$(id)
    );

    if (missing.length > 0) {
        throw new Error(
            `Products HTML элементтері табылмады: ${missing.join(", ")}`
        );
    }
}

export async function initAdminProducts() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    try {
        validateMarkup();

        state = readStateFromUrl();

        syncControls();

        setupSearch();
        setupFilters();
        setupPagination();
        setupDelete();
        setupRefresh();
        setupHistory();

        await loadProducts();
    } catch (error) {
        setLoading(false);
        showLoadError(error);
    }
}

export function destroyAdminProducts() {
    active = false;
    initialized = false;
    loading = false;
    deleting = false;

    requestVersion++;

    window.clearTimeout(searchTimer);
    searchTimer = null;

    eventController?.abort();
    eventController = null;

    const modal = $(IDS.deleteModal);

    if (modal) {
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.classList.add("hidden");
    }

    document.body.style.overflow =
        previousBodyOverflow;

    pendingDelete = null;
    deleteReturnFocus = null;

    products = [];
    categories = [];
    state = createInitialState();
}

export const adminProducts = {
    init: initAdminProducts,
    destroy: destroyAdminProducts,
    reload: loadProducts,
    applyFilters,
    resetFilters,

    getProducts() {
        return products.map(
            product => ({
                ...product
            })
        );
    },

    getCategories() {
        return categories.map(
            category => ({
                ...category
            })
        );
    },

    getState() {
        return {
            ...state
        };
    }
};

export default adminProducts;
