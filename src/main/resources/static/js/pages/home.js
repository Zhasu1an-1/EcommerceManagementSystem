
import api, {
    getErrorMessage
} from "../core/api.js";

import {
    renderProductCards
} from "../components/product-card.js";

import {
    normalizeText,
    parsePositiveId
} from "../core/utils.js";

const FEATURED_LIMIT = 8;
const NEW_ARRIVALS_LIMIT = 8;
const CATEGORY_LIMIT = 8;

const SELECTORS = {
    categories: [
        "#home-categories",
        "#home-categories-grid",
        "#categories-grid",
        "#category-grid",
        "[data-home-categories]"
    ],
    featured: [
        "#featured-products",
        "#featured-products-grid",
        "#home-featured-products-grid",
        "#featured-products-list",
        "[data-featured-products]"
    ],
    arrivals: [
        "#new-arrivals-products",
        "#new-arrivals-grid",
        "#new-products-grid",
        "#home-new-products-grid",
        "[data-new-arrivals]"
    ]
};

let initialized = false;
let active = false;
let requestGeneration = 0;
let eventController = null;

let categories = [];
let featuredProducts = [];
let newArrivals = [];

let selectedFeaturedCategory = "all";

function findElement(selectors) {
    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function getContainers() {
    return {
        categories: findElement(SELECTORS.categories),
        featured: findElement(SELECTORS.featured),
        arrivals: findElement(SELECTORS.arrivals)
    };
}

function extractItems(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    return [];
}

function normalizeCategory(category) {
    if (
        !category ||
        typeof category !== "object"
    ) {
        return null;
    }

    const id = parsePositiveId(
        category.id ?? category.categoryId
    );

    const name = normalizeText(
        category.name ?? category.categoryName
    );

    if (id === null || !name) {
        return null;
    }

    return {
        id,
        name
    };
}

function normalizeProduct(product) {
    if (
        !product ||
        typeof product !== "object"
    ) {
        return null;
    }

    const id = parsePositiveId(product.id);

    if (id === null) {
        return null;
    }

    return product;
}

function isCurrentRequest(generation) {
    return active &&
        generation === requestGeneration;
}

function finishLoading(container) {
    container?.removeAttribute("aria-busy");
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

function createLoadingCards(container, count = 4) {
    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index++) {
        const card = createElement(
            "div",
            "product-card skeleton home-product-skeleton"
        );

        card.style.minHeight = "320px";
        card.setAttribute("aria-hidden", "true");

        fragment.appendChild(card);
    }

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "true");
}

function createCategoryLoading(container) {
    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 3; index++) {
        const card = createElement(
            "div",
            "category-card skeleton home-category-skeleton"
        );

        card.style.minHeight = "145px";
        card.setAttribute("aria-hidden", "true");

        fragment.appendChild(card);
    }

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "true");
}

function renderMessage(
    container,
    title,
    description,
    retry = null
) {
    if (!container) {
        return;
    }

    const wrapper = createElement(
        "div",
        "empty-state home-empty-state"
    );

    wrapper.style.gridColumn = "1 / -1";

    const heading = createElement(
        "h3",
        "empty-state-title",
        title
    );

    const paragraph = createElement(
        "p",
        "empty-state-text",
        description
    );

    wrapper.append(heading, paragraph);

    if (typeof retry === "function") {
        const button = createElement(
            "button",
            "btn btn-outline",
            "Қайта жүктеу"
        );

        button.type = "button";

        button.addEventListener("click", retry);

        wrapper.appendChild(button);
    }

    container.replaceChildren(wrapper);

    finishLoading(container);
}

function createCategoryCard(category) {
    const link = createElement(
        "a",
        "category-card home-category-card"
    );

    link.href =
        `/pages/catalog.html?categoryId=${encodeURIComponent(category.id)}`;

    link.setAttribute(
        "aria-label",
        `${category.name} категориясын ашу`
    );

    const content = createElement(
        "div",
        "category-card-content"
    );

    const title = createElement(
        "h3",
        "category-card-title",
        category.name
    );

    const arrow = createElement(
        "span",
        "category-card-arrow",
        "→"
    );

    arrow.setAttribute("aria-hidden", "true");

    content.appendChild(title);

    link.append(content, arrow);

    return link;
}

function renderCategories(container) {
    if (!container) {
        return;
    }

    if (categories.length === 0) {
        renderMessage(
            container,
            "Категориялар табылмады",
            "Қазір қолжетімді категориялар жоқ."
        );

        return;
    }

    const fragment = document.createDocumentFragment();

    for (const category of categories.slice(0, CATEGORY_LIMIT)) {
        fragment.appendChild(
            createCategoryCard(category)
        );
    }

    container.replaceChildren(fragment);

    finishLoading(container);
}

function productMatchesCategory(product, category) {
    if (category === "all") {
        return true;
    }

    const productCategoryId = parsePositiveId(
        product.categoryId ??
        product.category?.id
    );

    const selectedCategoryId = parsePositiveId(category);

    if (selectedCategoryId !== null) {
        return productCategoryId === selectedCategoryId;
    }

    const categoryName = normalizeText(
        product.categoryName ??
        product.category?.name ??
        ""
    ).toLowerCase();

    return categoryName === category.toLowerCase();
}

function renderProducts(container, items, emptyTitle) {
    if (!container) {
        return;
    }

    if (items.length === 0) {
        renderMessage(
            container,
            emptyTitle,
            "Осы бөлімге сәйкес тауарлар әзірге жоқ."
        );

        return;
    }

    try {
        renderProductCards(
            container,
            items,
            {
                showCategory: true,
                showStock: true,
                showStockBadge: true,
                showAddButton: true,
                showDetailsLink: false
            }
        );

        finishLoading(container);
    } catch (error) {
        console.error(
            "Home product rendering failed:",
            error
        );

        renderMessage(
            container,
            "Тауарларды көрсету мүмкін болмады",
            getErrorMessage(error)
        );
    }
}

function renderFeaturedProducts() {
    const container = getContainers().featured;

    const filtered = featuredProducts
        .filter(product =>
            productMatchesCategory(
                product,
                selectedFeaturedCategory
            )
        )
        .slice(0, FEATURED_LIMIT);

    renderProducts(
        container,
        filtered,
        "Бұл категорияда тауарлар табылмады"
    );
}

function renderNewArrivals() {
    renderProducts(
        getContainers().arrivals,
        newArrivals.slice(0, NEW_ARRIVALS_LIMIT),
        "Жаңа тауарлар әзірге жоқ"
    );
}

function syncFeaturedTabs() {
    const tabs = document.querySelectorAll(
        "#featured-tabs [data-category]"
    );

    for (const tab of tabs) {
        const selected =
            tab.dataset.category === selectedFeaturedCategory;

        tab.classList.toggle("is-active", selected);

        tab.setAttribute(
            "aria-pressed",
            String(selected)
        );
    }
}

function setupFeaturedTabs() {
    const container = document.getElementById(
        "featured-tabs"
    );

    if (!container) {
        return;
    }

    container.addEventListener(
        "click",
        event => {
            const button = event.target.closest(
                "[data-category]"
            );

            if (!button || !container.contains(button)) {
                return;
            }

            selectedFeaturedCategory =
                button.dataset.category ?? "all";

            syncFeaturedTabs();

            renderFeaturedProducts();
        },
        {
            signal: eventController.signal
        }
    );
}

async function loadCategories(generation) {
    const container = getContainers().categories;

    if (!container) {
        return;
    }

    createCategoryLoading(container);

    try {
        const response = await api.categories.list();

        if (!isCurrentRequest(generation)) {
            return;
        }

        categories = extractItems(response)
            .map(normalizeCategory)
            .filter(Boolean);

        renderCategories(container);
    } catch (error) {
        if (!isCurrentRequest(generation)) {
            return;
        }

        console.error(
            "Home categories loading failed:",
            error
        );

        renderMessage(
            container,
            "Категориялар жүктелмеді",
            getErrorMessage(error),
            () => loadCategories(requestGeneration)
        );
    }
}

async function loadFeaturedProducts(generation) {
    const container = getContainers().featured;

    if (!container) {
        return;
    }

    createLoadingCards(container, 4);

    try {
        const response = await api.products.list({
            page: 0,
            size: FEATURED_LIMIT,
            inStock: true
        });

        if (!isCurrentRequest(generation)) {
            return;
        }

        featuredProducts = extractItems(response)
            .map(normalizeProduct)
            .filter(Boolean);

        renderFeaturedProducts();
    } catch (error) {
        if (!isCurrentRequest(generation)) {
            return;
        }

        console.error(
            "Featured products loading failed:",
            error
        );

        renderMessage(
            container,
            "Тауарлар жүктелмеді",
            getErrorMessage(error),
            () => loadFeaturedProducts(requestGeneration)
        );
    }
}

async function loadNewArrivals(generation) {
    const container = getContainers().arrivals;

    if (!container) {
        return;
    }

    createLoadingCards(container, 4);

    try {
        const response = await api.products.list({
            page: 0,
            size: NEW_ARRIVALS_LIMIT,
            sort: "id,desc"
        });

        if (!isCurrentRequest(generation)) {
            return;
        }

        newArrivals = extractItems(response)
            .map(normalizeProduct)
            .filter(Boolean);

        renderNewArrivals();
    } catch (error) {
        if (!isCurrentRequest(generation)) {
            return;
        }

        console.error(
            "New arrivals loading failed:",
            error
        );

        renderMessage(
            container,
            "Жаңа тауарлар жүктелмеді",
            getErrorMessage(error),
            () => loadNewArrivals(requestGeneration)
        );
    }
}

function setupHeroSearch() {
    const forms = document.querySelectorAll(
        "#hero-search-form, #home-search-form, [data-home-search-form]"
    );

    for (const form of forms) {
        if (!(form instanceof HTMLFormElement)) {
            continue;
        }

        form.addEventListener(
            "submit",
            event => {
                event.preventDefault();

                const input = form.querySelector(
                    'input[type="search"], input[name="keyword"], input[name="q"]'
                );

                const keyword = input?.value.trim() ?? "";

                const url = new URL(
                    "/pages/catalog.html",
                    window.location.origin
                );

                if (keyword) {
                    url.searchParams.set(
                        "keyword",
                        keyword
                    );
                }

                window.location.assign(
                    `${url.pathname}${url.search}`
                );
            },
            {
                signal: eventController.signal
            }
        );
    }
}

function setupHomeNavigation() {
    const links = document.querySelectorAll(
        "[data-home-scroll]"
    );

    for (const link of links) {
        link.addEventListener(
            "click",
            event => {
                const selector = link.dataset.homeScroll;

                if (
                    !selector ||
                    !selector.startsWith("#")
                ) {
                    return;
                }

                const target = document.getElementById(
                    selector.substring(1)
                );

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)"
                    ).matches
                        ? "auto"
                        : "smooth",
                    block: "start"
                });
            },
            {
                signal: eventController.signal
            }
        );
    }
}

export async function initHome() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    const generation = ++requestGeneration;

    eventController = new AbortController();

    selectedFeaturedCategory = "all";

    setupHeroSearch();
    setupHomeNavigation();
    setupFeaturedTabs();

    syncFeaturedTabs();

    const requests = [];

    const containers = getContainers();

    if (containers.categories) {
        requests.push(
            loadCategories(generation)
        );
    }

    if (containers.featured) {
        requests.push(
            loadFeaturedProducts(generation)
        );
    }

    if (containers.arrivals) {
        requests.push(
            loadNewArrivals(generation)
        );
    }

    await Promise.allSettled(requests);
}

export function destroyHome() {
    active = false;
    initialized = false;

    requestGeneration += 1;

    eventController?.abort();
    eventController = null;

    categories = [];
    featuredProducts = [];
    newArrivals = [];

    selectedFeaturedCategory = "all";
}

export const home = {
    init: initHome,
    destroy: destroyHome,

    reload: async function () {
        if (!active) {
            return;
        }

        const generation = ++requestGeneration;

        await Promise.allSettled([
            loadCategories(generation),
            loadFeaturedProducts(generation),
            loadNewArrivals(generation)
        ]);
    },

    getCategories() {
        return [...categories];
    },

    getFeaturedProducts() {
        return [...featuredProducts];
    },

    getNewArrivals() {
        return [...newArrivals];
    }
};

export default home;
