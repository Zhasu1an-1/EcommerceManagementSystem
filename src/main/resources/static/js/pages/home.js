
import api from "../core/api.js";

import {
    renderProductCards
} from "../components/product-card.js";

import {
    getErrorMessage
} from "../core/api.js";

import {
    formatInteger,
    normalizeText,
    parsePositiveId
} from "../core/utils.js";

const FEATURED_LIMIT = 8;
const NEW_ARRIVALS_LIMIT = 8;
const CATEGORY_LIMIT = 8;

const SELECTORS = {
    categories: [
        "#home-categories-grid",
        "#categories-grid",
        "#category-grid",
        "#home-categories",
        "[data-home-categories]",
        ".home-categories-grid",
        ".categories-grid"
    ],
    featured: [
        "#featured-products-grid",
        "#home-featured-products-grid",
        "#featured-products-list",
        "[data-featured-products]",
        ".featured-products-grid",
        ".home-featured-grid"
    ],
    arrivals: [
        "#new-arrivals-grid",
        "#new-products-grid",
        "#home-new-products-grid",
        "#latest-products-grid",
        "[data-new-arrivals]",
        ".new-arrivals-grid",
        ".new-products-grid"
    ]
};

const CATEGORY_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
`;

const ARROW_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path d="M5 12h14"/>
        <path d="m13 6 6 6-6 6"/>
    </svg>
`;

let initialized = false;
let active = false;
let requestGeneration = 0;
let eventController = null;

function findElement(selectors) {
    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function getHomeContainers() {
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

    if (!response || typeof response !== "object") {
        return [];
    }

    if (Array.isArray(response.content)) {
        return response.content;
    }

    if (Array.isArray(response.items)) {
        return response.items;
    }

    if (Array.isArray(response.data)) {
        return response.data;
    }

    if (Array.isArray(response.data?.content)) {
        return response.data.content;
    }

    return [];
}

function createIcon(markup, className) {
    const wrapper = document.createElement("span");

    wrapper.className = className;
    wrapper.innerHTML = markup;
    wrapper.setAttribute("aria-hidden", "true");

    return wrapper;
}

function createLoadingCards(container, count = 4) {
    if (!container) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index++) {
        const card = document.createElement("div");

        card.className =
            "product-card skeleton home-product-skeleton";

        card.setAttribute("aria-hidden", "true");

        card.style.minHeight = "320px";

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

    for (let index = 0; index < 4; index++) {
        const card = document.createElement("div");

        card.className =
            "category-card skeleton home-category-skeleton";

        card.style.minHeight = "145px";
        card.setAttribute("aria-hidden", "true");

        fragment.appendChild(card);
    }

    container.replaceChildren(fragment);
    container.setAttribute("aria-busy", "true");
}

function finishLoading(container) {
    container?.removeAttribute("aria-busy");
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

    const wrapper = document.createElement("div");
    const heading = document.createElement("h3");
    const paragraph = document.createElement("p");

    wrapper.className = "empty-state home-empty-state";
    wrapper.style.gridColumn = "1 / -1";

    heading.className = "empty-state-title";
    heading.textContent = title;

    paragraph.className = "empty-state-description";
    paragraph.textContent = description;

    wrapper.append(heading, paragraph);

    if (typeof retry === "function") {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "btn btn-outline";
        button.textContent = "Қайта жүктеу";

        button.addEventListener("click", retry);

        wrapper.appendChild(button);
    }

    container.replaceChildren(wrapper);
    finishLoading(container);
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

    const count = Number(
        category.productCount ??
        category.productsCount ??
        NaN
    );

    return {
        id,
        name,
        count: Number.isFinite(count) && count >= 0
            ? Math.trunc(count)
            : null
    };
}

function createCategoryCard(category) {
    const link = document.createElement("a");

    link.className = "category-card home-category-card";

    const url = new URL(
        "/pages/catalog.html",
        window.location.origin
    );

    url.searchParams.set(
        "categoryId",
        String(category.id)
    );

    link.href = `${url.pathname}${url.search}`;
    link.setAttribute(
        "aria-label",
        `${category.name} категориясын ашу`
    );

    const icon = createIcon(
        CATEGORY_ICON,
        "category-card-icon"
    );

    const content = document.createElement("div");

    content.className = "category-card-content";

    const title = document.createElement("h3");

    title.className = "category-card-title";
    title.textContent = category.name;

    content.appendChild(title);

    if (category.count !== null) {
        const count = document.createElement("span");

        count.className = "category-card-count";
        count.textContent =
            `${formatInteger(category.count)} products`;

        content.appendChild(count);
    }

    const arrow = createIcon(
        ARROW_ICON,
        "category-card-arrow"
    );

    link.append(icon, content, arrow);

    return link;
}

function renderCategories(container, categories) {
    const normalized = categories
        .map(normalizeCategory)
        .filter(Boolean)
        .slice(0, CATEGORY_LIMIT);

    if (normalized.length === 0) {
        renderMessage(
            container,
            "Категориялар табылмады",
            "Қазір қолжетімді категориялар жоқ."
        );

        return;
    }

    const fragment = document.createDocumentFragment();

    for (const category of normalized) {
        fragment.appendChild(
            createCategoryCard(category)
        );
    }

    container.replaceChildren(fragment);
    finishLoading(container);

    const countElement = document.querySelector(
        "#home-categories-count, [data-home-category-count]"
    );

    if (countElement) {
        countElement.textContent = formatInteger(
            categories.length
        );
    }
}

function renderProducts(container, products, limit) {
    if (!container) {
        return;
    }

    const items = products.slice(0, limit);

    if (items.length === 0) {
        renderMessage(
            container,
            "Тауарлар әзірге жоқ",
            "Жаңа тауарлар қосылған кезде осы жерден көре аласың."
        );

        return;
    }

    const cards = renderProductCards(
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

    if (cards.length === 0) {
        renderMessage(
            container,
            "Тауарларды көрсету мүмкін болмады",
            "Тауар мәліметтері толық емес."
        );
    }
}

async function loadCategories(
    container,
    generation
) {
    createCategoryLoading(container);

    try {
        const response = await api.categories.list();

        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderCategories(
            container,
            extractItems(response)
        );
    } catch (error) {
        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderMessage(
            container,
            "Категориялар жүктелмеді",
            getErrorMessage(error),
            () => loadCategories(
                container,
                requestGeneration
            )
        );
    }
}

async function loadFeaturedProducts(
    container,
    generation
) {
    createLoadingCards(
        container,
        FEATURED_LIMIT
    );

    try {
        const response = await api.products.list({
            page: 0,
            size: FEATURED_LIMIT,
            inStock: true
        });

        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderProducts(
            container,
            extractItems(response),
            FEATURED_LIMIT
        );
    } catch (error) {
        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderMessage(
            container,
            "Тауарлар жүктелмеді",
            getErrorMessage(error),
            () => loadFeaturedProducts(
                container,
                requestGeneration
            )
        );
    }
}

async function loadNewArrivals(
    container,
    generation
) {
    createLoadingCards(
        container,
        NEW_ARRIVALS_LIMIT
    );

    try {
        const response = await api.products.list({
            page: 0,
            size: NEW_ARRIVALS_LIMIT,
            sort: "id,desc"
        });

        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderProducts(
            container,
            extractItems(response),
            NEW_ARRIVALS_LIMIT
        );
    } catch (error) {
        if (
            !active ||
            generation !== requestGeneration
        ) {
            return;
        }

        renderMessage(
            container,
            "Жаңа тауарлар жүктелмеді",
            getErrorMessage(error),
            () => loadNewArrivals(
                container,
                requestGeneration
            )
        );
    }
}

function setupHeroSearch() {
    const forms = document.querySelectorAll(
        "#hero-search-form, #home-search-form, [data-home-search-form]"
    );

    if (forms.length === 0) {
        return;
    }

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

    setupHeroSearch();
    setupHomeNavigation();

    const containers = getHomeContainers();
    const requests = [];

    if (containers.categories) {
        requests.push(
            loadCategories(
                containers.categories,
                generation
            )
        );
    }

    if (containers.featured) {
        requests.push(
            loadFeaturedProducts(
                containers.featured,
                generation
            )
        );
    }

    if (containers.arrivals) {
        requests.push(
            loadNewArrivals(
                containers.arrivals,
                generation
            )
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
}

export const home = {
    init: initHome,
    destroy: destroyHome
};

export default home;
