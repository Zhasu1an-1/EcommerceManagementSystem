
import api from "../core/api.js";

import {
    getCurrentUser,
    redirectToLogin
} from "../core/auth.js";

import {
    formatCurrency,
    getSafeImageUrl,
    normalizeText,
    parsePositiveId,
    resolveElement,
    setButtonLoading,
    toNumber
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "./toast.js";

const LOW_STOCK_THRESHOLD = 5;

const PRODUCT_IMAGE_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m3 17 5-5 4 4 3-3 6 6"/>
    </svg>
`;

const CART_ICON = `
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <circle cx="9" cy="21" r="1"/>
        <circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>
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
        <path d="M5 12h14m-6-6 6 6-6 6"/>
    </svg>
`;

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

function createIcon(markup, className = "") {
    const element = createElement("span", className);

    element.innerHTML = markup;
    element.setAttribute("aria-hidden", "true");

    return element;
}

function normalizeProduct(product) {
    if (
        !product ||
        typeof product !== "object" ||
        Array.isArray(product)
    ) {
        return null;
    }

    const id = parsePositiveId(product.id);

    if (id === null) {
        return null;
    }

    const stock = Math.max(
        0,
        Math.trunc(toNumber(product.stock, 0))
    );

    const price = toNumber(product.price, NaN);

    return {
        id,
        name: normalizeText(product.name) || "Unnamed Product",
        description: normalizeText(product.description),
        price,
        stock,
        imageUrl: getSafeImageUrl(product.imageUrl),
        categoryId: product.categoryId ?? null,
        categoryName: normalizeText(
            product.categoryName
        ) || "Other"
    };
}

function getStockInfo(stock) {
    if (stock <= 0) {
        return {
            label: "Out of Stock",
            className: "is-out-of-stock",
            available: false
        };
    }

    if (stock <= LOW_STOCK_THRESHOLD) {
        return {
            label: `Only ${stock} left`,
            className: "is-low-stock",
            available: true
        };
    }

    return {
        label: "In Stock",
        className: "is-in-stock",
        available: true
    };
}

function getProductUrl(productId) {
    return (
        "/pages/product.html?id=" +
        encodeURIComponent(productId)
    );
}

function createImagePlaceholder() {
    const placeholder = createElement(
        "div",
        "product-card-image-placeholder"
    );

    placeholder.appendChild(
        createIcon(
            PRODUCT_IMAGE_ICON,
            "product-card-placeholder-icon"
        )
    );

    placeholder.appendChild(
        createElement(
            "span",
            "product-card-placeholder-text",
            "NEXORA"
        )
    );

    return placeholder;
}

function createProductImage(product) {
    const image = document.createElement("img");

    image.className = "product-card-image";
    image.alt = product.name;
    image.loading = "lazy";
    image.decoding = "async";

    const fallback = createImagePlaceholder();

    image.addEventListener(
        "error",
        () => {
            image.replaceWith(fallback);
        },
        { once: true }
    );

    image.src = product.imageUrl;

    return image;
}

function createProductMedia(product, options) {
    const media = createElement(
        "div",
        "product-media product-card-media"
    );

    const imageLink = createElement(
        "a",
        "product-card-image-link"
    );

    imageLink.href = getProductUrl(product.id);
    imageLink.setAttribute(
        "aria-label",
        `${product.name} тауарын қарау`
    );

    if (product.imageUrl) {
        imageLink.appendChild(
            createProductImage(product)
        );
    } else {
        imageLink.appendChild(
            createImagePlaceholder()
        );
    }

    media.appendChild(imageLink);

    if (options.showStockBadge !== false) {
        const stock = getStockInfo(product.stock);

        if (
            !stock.available ||
            stock.className === "is-low-stock"
        ) {
            const badge = createElement(
                "span",
                [
                    "product-card-badge",
                    "product-stock-badge",
                    stock.className
                ].join(" "),
                stock.label
            );

            media.appendChild(badge);
        }
    }

    return media;
}

function createProductCategory(product) {
    const category = createElement(
        "span",
        "product-card-category",
        product.categoryName
    );

    return category;
}

function createProductTitle(product) {
    const heading = createElement(
        "h3",
        "product-card-title"
    );

    const link = createElement(
        "a",
        "product-card-title-link",
        product.name
    );

    link.href = getProductUrl(product.id);

    heading.appendChild(link);

    return heading;
}

function createProductDescription(product) {
    const description = createElement(
        "p",
        "product-card-description",
        product.description
    );

    return description;
}

function createProductStock(product) {
    const stock = getStockInfo(product.stock);

    const element = createElement(
        "span",
        [
            "product-card-stock",
            "stock-status-badge",
            stock.className
        ].join(" "),
        stock.label
    );

    return element;
}

function createProductPrice(product) {
    const priceWrapper = createElement(
        "div",
        "product-card-price-wrapper"
    );

    const price = createElement(
        "strong",
        "product-card-price",
        formatCurrency(product.price)
    );

    priceWrapper.appendChild(price);

    return priceWrapper;
}

export async function addProductToCart(
    product,
    options = {}
) {
    const normalizedProduct = normalizeProduct(product);

    if (!normalizedProduct) {
        throw new Error(
            "Тауар туралы мәлімет дұрыс емес."
        );
    }

    if (normalizedProduct.stock <= 0) {
        throw new Error(
            "Бұл тауар қазір қоймада жоқ."
        );
    }

    const quantity = Number(options.quantity ?? 1);

    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > normalizedProduct.stock
    ) {
        throw new Error(
            "Тауар саны қоймадағы мөлшерден аспауы керек."
        );
    }

    const user = await getCurrentUser();

    if (!user) {
        redirectToLogin(
            window.location.pathname +
            window.location.search
        );

        return null;
    }

    const result = await api.cart.addItem(
        normalizedProduct.id,
        quantity
    );

    window.dispatchEvent(
        new CustomEvent("nexora:cart-updated", {
            detail: {
                productId: normalizedProduct.id,
                quantity,
                cart: result
            }
        })
    );

    return result;
}

async function handleAddToCart(
    product,
    button,
    options = {}
) {
    if (button.disabled) {
        return;
    }

    setButtonLoading(
        button,
        true,
        "Adding..."
    );

    try {
        let result;

        if (typeof options.onAddToCart === "function") {
            result = await options.onAddToCart(
                product,
                1
            );
        } else {
            result = await addProductToCart(
                product,
                {
                    quantity: 1
                }
            );
        }

        if (result === null) {
            return;
        }

        showSuccess(
            `${product.name} себетке қосылды!`
        );
    } catch (error) {
        showError(
            error?.message ??
            "Тауарды себетке қосу мүмкін болмады."
        );
    } finally {
        setButtonLoading(
            button,
            false
        );
    }
}

function createAddToCartButton(product, options) {
    const stock = getStockInfo(product.stock);

    const button = createElement(
        "button",
        "btn btn-primary product-card-add-button"
    );

    button.type = "button";

    if (stock.available) {
        button.appendChild(
            createIcon(
                CART_ICON,
                "product-card-add-icon"
            )
        );

        button.appendChild(
            createElement(
                "span",
                "product-card-add-label",
                options.addButtonText || "Add to Cart"
            )
        );

        button.setAttribute(
            "aria-label",
            `${product.name} тауарын себетке қосу`
        );

        button.addEventListener(
            "click",
            () => {
                handleAddToCart(
                    product,
                    button,
                    options
                );
            }
        );
    } else {
        button.disabled = true;
        button.classList.add("is-disabled");

        button.textContent = "Out of Stock";

        button.setAttribute(
            "aria-label",
            `${product.name} қоймада жоқ`
        );
    }

    return button;
}

function createDetailsLink(product) {
    const link = createElement(
        "a",
        "product-card-details-link"
    );

    link.href = getProductUrl(product.id);

    link.appendChild(
        createElement(
            "span",
            "",
            "View Details"
        )
    );

    link.appendChild(
        createIcon(ARROW_ICON)
    );

    link.setAttribute(
        "aria-label",
        `${product.name} туралы толық ақпарат`
    );

    return link;
}

export function createProductCard(
    rawProduct,
    options = {}
) {
    const product = normalizeProduct(rawProduct);

    if (!product) {
        return null;
    }

    const settings = {
        showCategory: true,
        showDescription: false,
        showStock: true,
        showStockBadge: true,
        showAddButton: true,
        showDetailsLink: false,
        compact: false,
        featured: false,
        ...options
    };

    const card = createElement(
        "article",
        "product-card"
    );

    card.dataset.productId = String(product.id);

    if (settings.compact) {
        card.classList.add("product-card-compact");
    }

    if (settings.featured) {
        card.classList.add("product-card-featured");
    }

    if (settings.className) {
        const classes = String(settings.className)
            .split(/\s+/)
            .filter(Boolean);

        card.classList.add(...classes);
    }

    card.appendChild(
        createProductMedia(product, settings)
    );

    const content = createElement(
        "div",
        "product-card-content"
    );

    if (settings.showCategory) {
        content.appendChild(
            createProductCategory(product)
        );
    }

    content.appendChild(
        createProductTitle(product)
    );

    if (
        settings.showDescription &&
        product.description
    ) {
        content.appendChild(
            createProductDescription(product)
        );
    }

    if (settings.showStock) {
        content.appendChild(
            createProductStock(product)
        );
    }

    const bottom = createElement(
        "div",
        "product-card-bottom"
    );

    bottom.appendChild(
        createProductPrice(product)
    );

    content.appendChild(bottom);

    if (
        settings.showAddButton ||
        settings.showDetailsLink
    ) {
        const actions = createElement(
            "div",
            "product-card-actions"
        );

        if (settings.showAddButton) {
            actions.appendChild(
                createAddToCartButton(
                    product,
                    settings
                )
            );
        }

        if (settings.showDetailsLink) {
            actions.appendChild(
                createDetailsLink(product)
            );
        }

        content.appendChild(actions);
    }

    card.appendChild(content);

    return card;
}

export function renderProductCards(
    target,
    products = [],
    options = {}
) {
    const container = resolveElement(target);

    if (!container) {
        return [];
    }

    container.replaceChildren();

    if (!Array.isArray(products)) {
        return [];
    }

    const fragment = document.createDocumentFragment();
    const cards = [];

    for (const product of products) {
        const card = createProductCard(
            product,
            options
        );

        if (!card) {
            continue;
        }

        fragment.appendChild(card);
        cards.push(card);
    }

    container.appendChild(fragment);

    return cards;
}

export function appendProductCards(
    target,
    products = [],
    options = {}
) {
    const container = resolveElement(target);

    if (!container || !Array.isArray(products)) {
        return [];
    }

    const fragment = document.createDocumentFragment();
    const cards = [];

    for (const product of products) {
        const card = createProductCard(
            product,
            options
        );

        if (!card) {
            continue;
        }

        fragment.appendChild(card);
        cards.push(card);
    }

    container.appendChild(fragment);

    return cards;
}

export function renderProductCard(
    product,
    options = {}
) {
    return createProductCard(
        product,
        options
    );
}

export function getProductStockStatus(stock) {
    return getStockInfo(
        Math.max(
            0,
            Math.trunc(toNumber(stock, 0))
        )
    );
}

export const productCard = {
    create: createProductCard,
    render: renderProductCard,
    renderMany: renderProductCards,
    appendMany: appendProductCards,
    addToCart: addProductToCart,
    getStockStatus: getProductStockStatus
};

export default productCard;
