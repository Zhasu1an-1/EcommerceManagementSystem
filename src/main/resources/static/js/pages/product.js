
import api, {
    getErrorMessage
} from "../core/api.js";

import {
    addProductToCart,
    renderProductCards
} from "../components/product-card.js";

import {
    formatCurrency,
    getSafeImageUrl,
    parsePositiveId,
    normalizeText,
    setButtonLoading,
    showElement,
    hideElement,
    toInteger,
    copyToClipboard
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const RELATED_PRODUCTS_LIMIT = 4;

const SELECTORS = {
    loading: [
        "#product-loading",
        "#product-details-loading"
    ],
    content: [
        "#product-content",
        "#product-details",
        "#product-details-content",
        ".product-details-layout"
    ],
    error: [
        "#product-error",
        "#product-error-state"
    ],
    title: [
        "#product-name",
        "#product-title",
        "[data-product-name]",
        ".product-info-title",
        ".product-details-title"
    ],
    category: [
        "#product-category",
        "#product-category-name",
        "[data-product-category]",
        ".product-category-label"
    ],
    price: [
        "#product-price",
        "[data-product-price]",
        ".product-details-price",
        ".product-info-price"
    ],
    description: [
        "#product-description",
        "[data-product-description]",
        ".product-description-text"
    ],
    stock: [
        "#product-stock",
        "#product-stock-status",
        "[data-product-stock]",
        ".product-stock-status"
    ],
    stockCount: [
        "#product-stock-count",
        "[data-product-stock-count]"
    ],
    mainImage: [
        "#product-main-image",
        "#product-image",
        "[data-product-main-image]",
        ".product-gallery-main img",
        ".product-main-image img"
    ],
    imageContainer: [
        "#product-gallery-main",
        "#product-image-container",
        ".product-gallery-main",
        ".product-main-image"
    ],
    thumbnails: [
        "#product-thumbnails",
        "#product-gallery-thumbnails",
        "[data-product-thumbnails]",
        ".product-gallery-thumbnails"
    ],
    quantity: [
        "#product-quantity",
        "#quantity-input",
        "[data-product-quantity]",
        ".product-quantity-input"
    ],
    quantityMinus: [
        "#product-quantity-minus",
        "#quantity-minus",
        "[data-quantity-minus]"
    ],
    quantityPlus: [
        "#product-quantity-plus",
        "#quantity-plus",
        "[data-quantity-plus]"
    ],
    addButton: [
        "#product-add-to-cart",
        "#add-to-cart-button",
        "[data-product-add-to-cart]",
        ".product-add-to-cart-btn"
    ],
    subtotal: [
        "#product-subtotal",
        "[data-product-subtotal]"
    ],
    breadcrumb: [
        "#product-breadcrumb-name",
        "[data-product-breadcrumb-name]"
    ],
    breadcrumbCategory: [
        "#product-breadcrumb-category",
        "[data-product-breadcrumb-category]"
    ],
    related: [
        "#related-products-grid",
        "#product-related-grid",
        "[data-related-products]",
        ".related-products-grid"
    ],
    relatedSection: [
        "#related-products-section",
        ".related-products-section"
    ],
    shareButton: [
        "#product-share-button",
        "[data-product-share]"
    ]
};

const IMAGE_PLACEHOLDER = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m3 17 5-5 4 4 3-3 6 6"/>
    </svg>
`;

let initialized = false;
let active = false;
let requestVersion = 0;
let eventController = null;
let currentProduct = null;
let currentQuantity = 1;
let addingToCart = false;

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

function setText(element, value) {
    if (element) {
        element.textContent = String(value ?? "");
    }
}

function getProductId() {
    const params = new URLSearchParams(
        window.location.search
    );

    return parsePositiveId(
        params.get("id") ??
        params.get("productId") ??
        document.body.dataset.productId
    );
}

function normalizeProduct(data) {
    const product = data?.data?.id
        ? data.data
        : data;

    if (
        !product ||
        typeof product !== "object"
    ) {
        return null;
    }

    const id = parsePositiveId(product.id);
    const price = Number(product.price);
    const stock = Number(product.stock);

    if (
        id === null ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        return null;
    }

    return {
        ...product,
        id,
        name: normalizeText(product.name) || "Product",
        description: String(product.description ?? "").trim(),
        price,
        stock: Number.isFinite(stock)
            ? Math.max(0, Math.trunc(stock))
            : 0,
        imageUrl: getSafeImageUrl(product.imageUrl),
        categoryName: normalizeText(
            product.categoryName
        ) || "Other",
        categoryId: parsePositiveId(product.categoryId)
    };
}

function setLoading(loading) {
    const elements = getElements();

    if (loading) {
        showElement(elements.loading);
        hideElement(elements.content);
        hideElement(elements.error);
    } else {
        hideElement(elements.loading);
    }
}

function showProductError(message) {
    const elements = getElements();

    hideElement(elements.loading);
    hideElement(elements.content);

    if (elements.error) {
        const messageElement = elements.error.querySelector(
            "[data-error-message], .error-message, p"
        );

        setText(
            messageElement,
            message
        );

        showElement(elements.error);
        return;
    }

    const container = document.querySelector(
        ".product-page, .product-details-section, main"
    );

    if (!container) {
        showError(message);
        return;
    }

    let errorBox = document.getElementById(
        "product-dynamic-error"
    );

    if (!errorBox) {
        errorBox = document.createElement("div");
        errorBox.id = "product-dynamic-error";
        errorBox.className = "empty-state product-error-state";

        container.prepend(errorBox);
    }

    const heading = document.createElement("h2");
    const description = document.createElement("p");
    const link = document.createElement("a");

    heading.textContent = "Тауарды жүктеу мүмкін болмады";
    description.textContent = message;

    link.href = "/pages/catalog.html";
    link.className = "btn btn-primary";
    link.textContent = "Каталогқа оралу";

    errorBox.replaceChildren(
        heading,
        description,
        link
    );

    showElement(errorBox);
}

function renderMainImage(product) {
    const elements = getElements();

    let image = elements.mainImage;

    if (image && !(image instanceof HTMLImageElement)) {
        image = image.querySelector("img");
    }

    if (!image && elements.imageContainer) {
        image = document.createElement("img");

        image.className = "product-main-image";
        elements.imageContainer.appendChild(image);
    }

    if (!image) {
        return;
    }

    image.alt = product.name;
    image.decoding = "async";

    if (!product.imageUrl) {
        showImageFallback(image);
        return;
    }

    image.onerror = () => {
        showImageFallback(image);
    };

    image.src = product.imageUrl;
}

function showImageFallback(image) {
    if (!image?.parentElement) {
        return;
    }

    const fallback = document.createElement("div");

    fallback.className = "product-image-placeholder";
    fallback.setAttribute("role", "img");
    fallback.setAttribute(
        "aria-label",
        "Тауар суреті қолжетімсіз"
    );

    fallback.innerHTML = IMAGE_PLACEHOLDER;

    const label = document.createElement("span");

    label.textContent = "NEXORA";

    fallback.appendChild(label);

    image.replaceWith(fallback);
}

function renderThumbnails(product) {
    const container = getElements().thumbnails;

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!product.imageUrl) {
        return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.className =
        "product-thumbnail is-active active";

    button.setAttribute(
        "aria-label",
        `${product.name} суретін көрсету`
    );

    button.setAttribute("aria-pressed", "true");

    const image = document.createElement("img");

    image.src = product.imageUrl;
    image.alt = product.name;
    image.loading = "lazy";

    button.appendChild(image);

    button.addEventListener(
        "click",
        () => {
            const mainImage = getElements().mainImage;

            if (mainImage instanceof HTMLImageElement) {
                mainImage.src = product.imageUrl;
            }

            button.classList.add("is-active", "active");
            button.setAttribute("aria-pressed", "true");
        },
        {
            signal: eventController.signal
        }
    );

    container.appendChild(button);
}

function renderCategory(product) {
    const elements = getElements();

    setText(
        elements.category,
        product.categoryName
    );

    setText(
        elements.breadcrumbCategory,
        product.categoryName
    );

    if (product.categoryId !== null) {
        const url = new URL(
            "/pages/catalog.html",
            window.location.origin
        );

        url.searchParams.set(
            "categoryId",
            product.categoryId
        );

        for (const element of [
            elements.category,
            elements.breadcrumbCategory
        ]) {
            if (element instanceof HTMLAnchorElement) {
                element.href =
                    `${url.pathname}${url.search}`;
            }
        }
    }
}

function renderStock(product) {
    const elements = getElements();

    const stock = product.stock;

    let label;
    let status;

    if (stock === 0) {
        label = "Out of Stock";
        status = "out-of-stock";
    } else if (stock <= 5) {
        label = `Only ${stock} left in stock`;
        status = "low-stock";
    } else {
        label = "In Stock";
        status = "in-stock";
    }

    if (elements.stock) {
        setText(elements.stock, label);

        elements.stock.classList.remove(
            "is-in-stock",
            "is-low-stock",
            "is-out-of-stock"
        );

        elements.stock.classList.add(
            `is-${status}`
        );
    }

    setText(
        elements.stockCount,
        stock
    );

    if (elements.addButton) {
        elements.addButton.disabled =
            stock === 0;

        if (stock === 0) {
            setText(
                elements.addButton,
                "Out of Stock"
            );
        }
    }

    if (elements.quantity) {
        elements.quantity.min = "1";
        elements.quantity.max = String(
            Math.max(1, stock)
        );

        elements.quantity.disabled = stock === 0;
    }

    if (elements.quantityMinus) {
        elements.quantityMinus.disabled =
            stock === 0;
    }

    if (elements.quantityPlus) {
        elements.quantityPlus.disabled =
            stock === 0;
    }
}

function updateQuantity(value) {
    if (!currentProduct) {
        return;
    }

    const stock = currentProduct.stock;

    if (stock === 0) {
        currentQuantity = 1;
    } else {
        currentQuantity = Math.min(
            stock,
            Math.max(1, toInteger(value, 1))
        );
    }

    const elements = getElements();

    if (elements.quantity) {
        if ("value" in elements.quantity) {
            elements.quantity.value = String(
                currentQuantity
            );
        } else {
            setText(
                elements.quantity,
                currentQuantity
            );
        }
    }

    if (elements.quantityMinus) {
        elements.quantityMinus.disabled =
            stock === 0 ||
            currentQuantity <= 1;
    }

    if (elements.quantityPlus) {
        elements.quantityPlus.disabled =
            stock === 0 ||
            currentQuantity >= stock;
    }

    if (elements.subtotal) {
        setText(
            elements.subtotal,
            formatCurrency(
                currentProduct.price * currentQuantity
            )
        );
    }
}

function renderProduct(product) {
    currentProduct = product;
    currentQuantity = 1;

    const elements = getElements();

    setText(
        elements.title,
        product.name
    );

    setText(
        elements.price,
        formatCurrency(product.price)
    );

    setText(
        elements.description,
        product.description ||
        "Бұл тауарға сипаттама әлі қосылмаған."
    );

    setText(
        elements.breadcrumb,
        product.name
    );

    renderCategory(product);
    renderStock(product);
    renderMainImage(product);
    renderThumbnails(product);
    updateQuantity(1);

    document.title = `${product.name} | NEXORA`;

    hideElement(elements.error);
    hideElement(elements.loading);
    showElement(elements.content);
}

async function handleAddToCart() {
    if (
        !currentProduct ||
        addingToCart
    ) {
        return;
    }

    if (currentProduct.stock <= 0) {
        showError(
            "Бұл тауар қазір қоймада жоқ."
        );
        return;
    }

    const button = getElements().addButton;

    addingToCart = true;

    if (button instanceof HTMLButtonElement) {
        setButtonLoading(
            button,
            true,
            "Adding..."
        );
    }

    try {
        const result = await addProductToCart(
            currentProduct,
            {
                quantity: currentQuantity
            }
        );

        if (result !== null) {
            showSuccess(
                `${currentProduct.name} себетке қосылды!`
            );
        }
    } catch (error) {
        showError(
            getErrorMessage(error)
        );
    } finally {
        addingToCart = false;

        if (button instanceof HTMLButtonElement) {
            setButtonLoading(
                button,
                false
            );

            button.disabled =
                currentProduct?.stock <= 0;
        }
    }
}

async function handleShare() {
    if (!currentProduct) {
        return;
    }

    const shareData = {
        title: currentProduct.name,
        text: currentProduct.description,
        url: window.location.href
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return;
        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }
        }
    }

    try {
        await copyToClipboard(
            window.location.href
        );

        showSuccess(
            "Тауар сілтемесі көшірілді."
        );
    } catch {
        showError(
            "Сілтемені көшіру мүмкін болмады."
        );
    }
}

function setupQuantityControls() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.quantityMinus?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            updateQuantity(
                currentQuantity - 1
            );
        },
        { signal }
    );

    elements.quantityPlus?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            updateQuantity(
                currentQuantity + 1
            );
        },
        { signal }
    );

    elements.quantity?.addEventListener(
        "input",
        event => {
            const input = event.target;
            const value = Number(input.value);

            if (
                Number.isSafeInteger(value) &&
                value >= 1 &&
                value <= (currentProduct?.stock ?? 0)
            ) {
                currentQuantity = value;

                const subtotal = getElements().subtotal;

                setText(
                    subtotal,
                    formatCurrency(
                        currentProduct.price * currentQuantity
                    )
                );
            }
        },
        { signal }
    );

    elements.quantity?.addEventListener(
        "change",
        event => {
            updateQuantity(
                event.target.value
            );
        },
        { signal }
    );

    elements.quantity?.addEventListener(
        "blur",
        event => {
            updateQuantity(
                event.target.value
            );
        },
        { signal }
    );
}

function setupActions() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.addButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            handleAddToCart();
        },
        { signal }
    );

    elements.shareButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            handleShare();
        },
        { signal }
    );

    const cartForm = document.querySelector(
        "#product-cart-form, #product-purchase-form"
    );

    cartForm?.addEventListener(
        "submit",
        event => {
            event.preventDefault();
            handleAddToCart();
        },
        { signal }
    );
}

function extractProducts(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.data?.content)) {
        return response.data.content;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    return [];
}

async function loadRelatedProducts(product, version) {
    const elements = getElements();

    if (!elements.related) {
        return;
    }

    if (product.categoryId === null) {
        hideElement(elements.relatedSection);
        return;
    }

    try {
        const response = await api.products.list({
            categoryId: product.categoryId,
            page: 0,
            size: RELATED_PRODUCTS_LIMIT + 1,
            sort: "id,desc"
        });

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const products = extractProducts(response)
            .filter(item => {
                return Number(item.id) !== product.id;
            })
            .slice(0, RELATED_PRODUCTS_LIMIT);

        if (products.length === 0) {
            elements.related.replaceChildren();
            hideElement(elements.relatedSection);
            return;
        }

        renderProductCards(
            elements.related,
            products,
            {
                showCategory: true,
                showStock: true,
                showStockBadge: true,
                showAddButton: true
            }
        );

        showElement(elements.relatedSection);
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        console.error(
            "Related products loading failed:",
            error
        );

        elements.related.replaceChildren();
        hideElement(elements.relatedSection);
    }
}

async function loadProduct() {
    const productId = getProductId();

    if (productId === null) {
        showProductError(
            "Тауардың ID нөмірі көрсетілмеген."
        );
        return;
    }

    const version = ++requestVersion;

    setLoading(true);

    try {
        const response = await api.products.getById(
            productId
        );

        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        const product = normalizeProduct(response);

        if (!product) {
            showProductError(
                "Серверден тауар туралы дұрыс мәлімет алынбады."
            );
            return;
        }

        renderProduct(product);

        await loadRelatedProducts(
            product,
            version
        );
    } catch (error) {
        if (
            !active ||
            version !== requestVersion
        ) {
            return;
        }

        showProductError(
            getErrorMessage(error)
        );
    }
}

export async function initProduct() {
    if (initialized) {
        return;
    }

    initialized = true;
    active = true;

    eventController = new AbortController();

    setupQuantityControls();
    setupActions();

    await loadProduct();
}

export function destroyProduct() {
    active = false;
    initialized = false;
    requestVersion += 1;

    eventController?.abort();
    eventController = null;

    currentProduct = null;
    currentQuantity = 1;
    addingToCart = false;
}

export const product = {
    init: initProduct,
    destroy: destroyProduct,
    reload: loadProduct,
    getCurrentProduct() {
        return currentProduct;
    },
    getQuantity() {
        return currentQuantity;
    },
    setQuantity: updateQuantity,
    addToCart: handleAddToCart
};

export default product;
