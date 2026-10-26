
import api, { getErrorMessage } from "../core/api.js";
import { showSuccess, showError } from "../components/toast.js";

const ID = {
    loading: "admin-product-form-loading",
    pageError: "admin-product-form-error",
    pageErrorText: "admin-product-form-error-message",
    retry: "admin-product-form-retry-button",
    content: "admin-product-form-content",
    form: "admin-product-form",
    breadcrumb: "admin-product-breadcrumb-mode",
    eyebrow: "admin-product-form-eyebrow",
    title: "admin-product-form-title",
    subtitle: "admin-product-form-subtitle",
    productId: "admin-product-id",
    name: "admin-product-name",
    description: "admin-product-description",
    descriptionCount: "admin-product-description-count",
    category: "admin-product-category",
    categoryEmpty: "admin-product-category-empty",
    price: "admin-product-price",
    stock: "admin-product-stock",
    imageUrl: "admin-product-image-url",
    submitError: "admin-product-submit-error",
    submitSuccess: "admin-product-submit-success",
    save: "admin-product-save-button",
    saveText: "admin-product-save-text",
    cancel: "admin-product-cancel-button",
    reset: "admin-product-reset-button",
    back: "admin-product-form-back-link",
    previewName: "admin-product-card-name",
    previewDescription: "admin-product-card-description",
    previewCategory: "admin-product-card-category",
    previewPrice: "admin-product-card-price",
    previewStock: "admin-product-card-stock-badge",
    stockTitle: "admin-product-stock-preview-label",
    stockDescription: "admin-product-stock-preview-description",
    stockBadge: "admin-product-stock-preview-badge",
    imagePreview: "admin-product-image-preview-img",
    imagePlaceholder: "admin-product-image-placeholder",
    imageStatus: "admin-product-image-status",
    cardImage: "admin-product-card-image",
    cardFallback: "admin-product-card-image-fallback",
    checkName: "admin-product-check-name",
    checkDescription: "admin-product-check-description",
    checkCategory: "admin-product-check-category",
    checkPrice: "admin-product-check-price",
    checkStock: "admin-product-check-stock",
    progressLabel: "admin-product-form-progress-label",
    progress: "admin-product-form-progress",
    progressFill: "admin-product-form-progress-fill",
    discardModal: "admin-product-discard-modal",
    discardClose: "admin-product-discard-close",
    discardCancel: "admin-product-discard-cancel",
    discardConfirm: "admin-product-discard-confirm"
};

const EMPTY = {
    name: "",
    description: "",
    categoryId: "",
    price: "",
    stock: "",
    imageUrl: ""
};

const FIELD_ERRORS = {
    name: "admin-product-name-error",
    description: "admin-product-description-error",
    categoryId: "admin-product-category-error",
    price: "admin-product-price-error",
    stock: "admin-product-stock-error",
    imageUrl: "admin-product-image-error"
};

const FIELD_IDS = {
    name: ID.name,
    description: ID.description,
    categoryId: ID.category,
    price: ID.price,
    stock: ID.stock,
    imageUrl: ID.imageUrl
};

const $ = id => document.getElementById(id);

const formatMoney = new Intl.NumberFormat("kk-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2
});

let initialized = false;
let alive = false;
let busy = false;
let loading = false;
let version = 0;
let controller = null;
let productId = null;
let originalProduct = null;
let categories = [];
let initialSnapshot = "";
let ready = false;
let discardAction = null;
let discardFocus = null;
let oldOverflow = "";
let allowLeaving = false;

function setText(id, value) {
    const node = $(id);

    if (node) {
        node.textContent = String(value ?? "");
    }
}

function visible(id, show) {
    const node = $(id);

    if (!node) {
        return;
    }

    node.hidden = !show;
    node.classList.toggle("hidden", !show);
}

function positiveId(value) {
    const text = String(value ?? "").trim();

    if (!/^[1-9]\d*$/.test(text)) {
        return null;
    }

    const id = Number(text);

    return Number.isSafeInteger(id) ? id : null;
}

function getMode() {
    return productId === null ? "create" : "edit";
}

function readIdFromUrl() {
    const params = new URLSearchParams(location.search);
    const input = params.get("id") ?? params.get("productId");

    if (input === null || input === "") {
        return null;
    }

    const id = positiveId(input);

    if (id === null) {
        throw new Error("URL ішіндегі тауар ID дұрыс емес.");
    }

    return id;
}

function readForm() {
    return {
        name: $(ID.name)?.value.trim() ?? "",
        description: $(ID.description)?.value.trim() ?? "",
        categoryId: $(ID.category)?.value ?? "",
        price: $(ID.price)?.value.trim() ?? "",
        stock: $(ID.stock)?.value.trim() ?? "",
        imageUrl: $(ID.imageUrl)?.value.trim() ?? ""
    };
}

function snapshot(data) {
    return JSON.stringify({
        name: data.name,
        description: data.description,
        categoryId: String(data.categoryId),
        price: data.price,
        stock: data.stock,
        imageUrl: data.imageUrl
    });
}

function isDirty() {
    return ready && snapshot(readForm()) !== initialSnapshot;
}

function validImageUrl(input) {
    if (!input) {
        return true;
    }

    try {
        const url = new URL(input);

        return ["https:", "http:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function conditions(data) {
    const price = Number(data.price);
    const stock = Number(data.stock);

    return {
        name:
            data.name.length >= 2 &&
            data.name.length <= 255,

        description:
            data.description.length >= 10 &&
            data.description.length <= 5000,

        category: categories.some(
            item => String(item.id) === data.categoryId
        ),

        price:
            data.price !== "" &&
            Number.isFinite(price) &&
            price > 0,

        stock:
            data.stock !== "" &&
            Number.isSafeInteger(stock) &&
            stock >= 0
    };
}

function setCheck(id, checked) {
    const item = $(id);

    if (!item) {
        return;
    }

    item.classList.toggle("is-complete", checked);
    item.classList.toggle("is-checked", checked);
    item.dataset.completed = String(checked);

    item.setAttribute(
        "aria-label",
        checked ? "Орындалды" : "Толтырылмаған"
    );

    const icon = item.querySelector(
        ".admin-editor-check-icon"
    );

    if (icon instanceof HTMLElement) {
        icon.style.backgroundColor = checked ? "#e5f7ef" : "";
        icon.style.color = checked ? "#169565" : "";
        icon.style.borderColor = checked ? "#c4e8d4" : "";
    }
}

function setSavingState() {
    const submit = $(ID.save);
    const data = readForm();
    const checks = conditions(data);

    const completed = Object.values(checks)
        .filter(Boolean)
        .length;

    setCheck(ID.checkName, checks.name);
    setCheck(ID.checkDescription, checks.description);
    setCheck(ID.checkCategory, checks.category);
    setCheck(ID.checkPrice, checks.price);
    setCheck(ID.checkStock, checks.stock);

    setText(
        ID.progressLabel,
        `${completed} / 5`
    );

    setText(
        ID.descriptionCount,
        `${$(ID.description)?.value.length ?? 0} / 5000`
    );

    const progress = $(ID.progress);
    const fill = $(ID.progressFill);

    if (progress) {
        progress.setAttribute(
            "aria-valuenow",
            String(completed)
        );
    }

    if (fill) {
        fill.style.width = `${completed * 20}%`;
    }

    const canSave =
        completed === 5 &&
        validImageUrl(data.imageUrl) &&
        ready &&
        !loading &&
        !busy;

    if (submit instanceof HTMLButtonElement) {
        submit.disabled = !canSave;

        submit.setAttribute(
            "aria-busy",
            String(busy)
        );
    }

    setText(
        ID.saveText,
        busy
            ? "Saving..."
            : getMode() === "edit"
                ? "Save Changes"
                : "Create Product"
    );
}

function stockStatus(data) {
    if (data.stock === "") {
        return {
            label: "STOCK NOT SET",
            title: "Stock Status",
            description: "Қоймадағы тауар санын енгіз.",
            tone: "neutral"
        };
    }

    const number = Number(data.stock);

    if (!Number.isSafeInteger(number) || number < 0) {
        return {
            label: "INVALID STOCK",
            title: "Invalid Stock",
            description: "Теріс емес бүтін сан енгіз.",
            tone: "warning"
        };
    }

    if (number === 0) {
        return {
            label: "OUT OF STOCK",
            title: "Out of Stock",
            description: "Бұл тауар қазір сатылымға қолжетімсіз.",
            tone: "warning"
        };
    }

    return {
        label: `IN STOCK (${number})`,
        title: "In Stock",
        description: `Қоймада ${number} дана тауар бар.`,
        tone: "success"
    };
}

function showImage(imageId, fallbackId, src) {
    const image = $(imageId);

    if (!(image instanceof HTMLImageElement)) {
        return;
    }

    if (!src) {
        image.removeAttribute("src");
        image.hidden = true;

        visible(fallbackId, true);
        return;
    }

    image.hidden = true;
    visible(fallbackId, true);

    image.onload = () => {
        if (
            !alive ||
            $(ID.imageUrl)?.value.trim() !== src
        ) {
            return;
        }

        image.hidden = false;
        visible(fallbackId, false);

        setText(
            ID.imageStatus,
            "Сурет жүктелді."
        );
    };

    image.onerror = () => {
        image.hidden = true;
        visible(fallbackId, true);

        setText(
            ID.imageStatus,
            "Сурет ашылмады. Сілтемені тексер."
        );
    };

    if (image.getAttribute("src") !== src) {
        image.src = src;
    } else if (
        image.complete &&
        image.naturalWidth > 0
    ) {
        image.onload();
    }
}

function renderPreview() {
    const data = readForm();

    const category = categories.find(
        item => String(item.id) === data.categoryId
    );

    setText(
        ID.previewName,
        data.name || "Your product name"
    );

    setText(
        ID.previewDescription,
        data.description ||
        "Тауар сипаттамасы енгізілгеннен кейін осы жерде көрсетіледі."
    );

    setText(
        ID.previewCategory,
        category?.name ?? "Select Category"
    );

    const validPrice =
        data.price !== "" &&
        Number.isFinite(Number(data.price)) &&
        Number(data.price) > 0;

    setText(
        ID.previewPrice,
        validPrice
            ? formatMoney.format(Number(data.price))
            : "—"
    );

    const status = stockStatus(data);

    setText(ID.previewStock, status.label);
    setText(ID.stockTitle, status.title);
    setText(ID.stockDescription, status.description);
    setText(ID.stockBadge, status.label);

    for (const id of [
        ID.stockBadge,
        ID.previewStock
    ]) {
        const node = $(id);

        if (!node) {
            continue;
        }

        for (const tone of [
            "success",
            "warning",
            "neutral"
        ]) {
            node.classList.toggle(
                `badge-${tone}`,
                tone === status.tone
            );
        }
    }

    if (!data.imageUrl) {
        setText(
            ID.imageStatus,
            "Сілтеме енгізілгеннен кейін сурет көрсетіледі."
        );
    } else if (!validImageUrl(data.imageUrl)) {
        setText(
            ID.imageStatus,
            "HTTP немесе HTTPS сурет сілтемесін енгіз."
        );
    } else {
        setText(
            ID.imageStatus,
            "Сурет тексерілуде..."
        );
    }

    const imageUrl = validImageUrl(data.imageUrl)
        ? data.imageUrl
        : "";

    showImage(
        ID.imagePreview,
        ID.imagePlaceholder,
        imageUrl
    );

    showImage(
        ID.cardImage,
        ID.cardFallback,
        imageUrl
    );

    setSavingState();
}

function clearFieldError(field) {
    $(FIELD_IDS[field])?.classList.remove(
        "is-invalid"
    );

    $(FIELD_IDS[field])?.removeAttribute(
        "aria-invalid"
    );

    visible(FIELD_ERRORS[field], false);
    setText(FIELD_ERRORS[field], "");
}

function clearErrors() {
    visible(ID.submitError, false);
    visible(ID.submitSuccess, false);

    for (const key of Object.keys(FIELD_ERRORS)) {
        clearFieldError(key);
    }
}

function fieldError(field, message) {
    const node = $(FIELD_IDS[field]);

    if (node) {
        node.classList.add("is-invalid");

        node.setAttribute(
            "aria-invalid",
            "true"
        );

        node.focus();
    }

    setText(FIELD_ERRORS[field], message);
    visible(FIELD_ERRORS[field], true);

    showSubmitError(message);
}

function showSubmitError(message) {
    setText(ID.submitError, message);
    visible(ID.submitError, true);

    if (!$(ID.submitError)) {
        showError(message);
    }
}

function validate(data) {
    const checks = conditions(data);

    if (!checks.name) {
        fieldError(
            "name",
            "Тауар атауы 2–255 таңба болуы керек."
        );
        return false;
    }

    if (!checks.description) {
        fieldError(
            "description",
            "Сипаттама 10–5000 таңба болуы керек."
        );
        return false;
    }

    if (!checks.category) {
        fieldError(
            "categoryId",
            "Тізімнен категорияны таңда."
        );
        return false;
    }

    if (!checks.price) {
        fieldError(
            "price",
            "Тауар бағасы нөлден үлкен сан болуы керек."
        );
        return false;
    }

    if (!checks.stock) {
        fieldError(
            "stock",
            "Қойма саны 0 немесе одан үлкен бүтін сан болуы керек."
        );
        return false;
    }

    if (!validImageUrl(data.imageUrl)) {
        fieldError(
            "imageUrl",
            "HTTP немесе HTTPS сілтемесін енгіз."
        );
        return false;
    }

    return true;
}

function applyValues(product) {
    for (const [name, id] of Object.entries(FIELD_IDS)) {
        const node = $(id);

        if (node) {
            node.value = product[name] ?? "";
        }
    }

    if ($(ID.productId)) {
        $(ID.productId).value =
            productId === null
                ? ""
                : String(productId);
    }

    clearErrors();
    renderPreview();
}

function extractCategories(response) {
    const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.content)
            ? response.content
            : Array.isArray(response?.data)
                ? response.data
                : response?.data?.content;

    if (!Array.isArray(rows)) {
        throw new Error(
            "Categories API массив қайтармады."
        );
    }

    return rows
        .map(item => ({
            id: positiveId(item?.id),
            name: String(item?.name ?? "").trim()
        }))
        .filter(item =>
            item.id !== null &&
            item.name !== ""
        );
}

function fillCategories(list) {
    const select = $(ID.category);

    if (!(select instanceof HTMLSelectElement)) {
        throw new Error(
            "Category select табылмады."
        );
    }

    const previous = select.value;
    const fragment = document.createDocumentFragment();

    const placeholder = document.createElement("option");

    placeholder.value = "";
    placeholder.textContent = "Select Category";

    fragment.append(placeholder);

    for (const item of list) {
        const option = document.createElement("option");

        option.value = String(item.id);
        option.textContent = item.name;

        fragment.append(option);
    }

    select.replaceChildren(fragment);
    select.disabled = list.length === 0;

    select.value = list.some(
        item => String(item.id) === previous
    )
        ? previous
        : "";

    visible(
        ID.categoryEmpty,
        list.length === 0
    );
}

function normalizeProduct(result) {
    const product =
        result?.data?.product ??
        result?.data ??
        result?.product ??
        result;

    if (
        !product ||
        typeof product !== "object"
    ) {
        throw new Error(
            "Тауар мәліметтері дұрыс алынбады."
        );
    }

    const id = positiveId(
        product.id ?? product.productId
    );

    if (id === null) {
        throw new Error(
            "Сервер тауар ID қайтармады."
        );
    }

    return {
        id,
        name: String(product.name ?? ""),
        description: String(product.description ?? ""),
        categoryId: String(
            positiveId(
                product.categoryId ??
                product.category?.id
            ) ?? ""
        ),
        price: String(product.price ?? ""),
        stock: String(product.stock ?? ""),
        imageUrl: String(product.imageUrl ?? "")
    };
}

function updatePageTitle() {
    const editing = getMode() === "edit";

    setText(
        ID.breadcrumb,
        editing ? "Edit Product" : "Add Product"
    );

    setText(
        ID.eyebrow,
        editing
            ? "UPDATE YOUR PRODUCT"
            : "CREATE SOMETHING NEW"
    );

    const title = $(ID.title);

    if (title) {
        title.innerHTML = editing
            ? 'Edit <span class="gradient-text">Product.</span>'
            : 'Add <span class="gradient-text">Product.</span>';
    }

    setText(
        ID.subtitle,
        editing
            ? "Тауар мәліметтерін өзгертіп, сақта."
            : "Жаңа тауардың мәліметтерін толтыр. Барлық ақпарат NEXORA каталогында көрсетіледі."
    );

    document.title = `${
        editing ? "Edit Product" : "Add Product"
    } | NEXORA Admin`;

    setSavingState();
}

function showPageError(error) {
    const message = getErrorMessage(error);

    setText(ID.pageErrorText, message);

    visible(ID.pageError, true);
    visible(ID.content, false);

    if (!$(ID.pageError)) {
        showError(message);
    }
}

async function load() {
    if (!alive) {
        return;
    }

    const current = ++version;

    loading = true;
    ready = false;

    visible(ID.loading, true);
    visible(ID.pageError, false);
    visible(ID.content, false);

    setSavingState();

    try {
        const categoriesResult = await api.get(
            "/api/categories"
        );

        if (
            !alive ||
            current !== version
        ) {
            return;
        }

        categories = extractCategories(
            categoriesResult
        );

        fillCategories(categories);

        if (!categories.length) {
            throw new Error(
                "Категориялар жоқ. Алдымен Categories бөлімінде категория қос."
            );
        }

        let product = {
            ...EMPTY
        };

        if (productId !== null) {
            const response = await api.get(
                `/api/products/${productId}`
            );

            if (
                !alive ||
                current !== version
            ) {
                return;
            }

            product = normalizeProduct(response);
        }

        originalProduct = productId === null
            ? null
            : { ...product };

        applyValues(product);

        initialSnapshot = snapshot(
            readForm()
        );

        ready = true;

        visible(ID.content, true);

        clearErrors();
    } catch (error) {
        if (
            alive &&
            current === version
        ) {
            showPageError(error);
        }
    } finally {
        if (
            alive &&
            current === version
        ) {
            loading = false;

            visible(ID.loading, false);

            setSavingState();
        }
    }
}

function buildPayload(data) {
    return {
        name: data.name,
        description: data.description,
        categoryId: Number(data.categoryId),
        price: Number(data.price),
        stock: Number(data.stock),
        imageUrl: data.imageUrl || null
    };
}

async function submit(event) {
    event.preventDefault();

    if (
        !alive ||
        !ready ||
        loading ||
        busy
    ) {
        return;
    }

    const data = readForm();

    clearErrors();

    if (!validate(data)) {
        return;
    }

    const editing = productId !== null;

    busy = true;
    setSavingState();

    try {
        if (editing) {
            await api.put(
                `/api/products/${productId}`,
                buildPayload(data)
            );
        } else {
            await api.post(
                "/api/products",
                buildPayload(data)
            );
        }

        if (!alive) {
            return;
        }

        setText(
            ID.submitSuccess,
            editing
                ? "Тауар жаңартылды."
                : "Тауар қосылды."
        );

        visible(ID.submitSuccess, true);

        showSuccess(
            editing
                ? "Тауар сәтті жаңартылды!"
                : "Тауар сәтті қосылды!"
        );

        allowLeaving = true;

        location.assign(
            "/admin/products.html"
        );
    } catch (error) {
        if (alive) {
            showSubmitError(
                getErrorMessage(error)
            );
        }
    } finally {
        busy = false;

        if (alive) {
            setSavingState();
        }
    }
}

function resetForm() {
    if (
        busy ||
        loading
    ) {
        return;
    }

    applyValues(
        originalProduct ?? EMPTY
    );

    setSavingState();
}

function openDiscard(action) {
    if (busy) {
        return;
    }

    discardAction = action;

    const modal = $(ID.discardModal);

    if (!modal) {
        return action();
    }

    discardFocus = document.activeElement;
    oldOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    visible(ID.discardModal, true);

    modal.classList.add("is-open");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    $(ID.discardCancel)?.focus();
}

function closeDiscard() {
    const modal = $(ID.discardModal);

    if (modal) {
        modal.classList.remove("is-open");

        modal.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    visible(ID.discardModal, false);

    document.body.style.overflow = oldOverflow;

    discardAction = null;

    if (
        discardFocus instanceof HTMLElement &&
        discardFocus.isConnected
    ) {
        discardFocus.focus();
    }

    discardFocus = null;
}

function tryLeave(action) {
    if (isDirty()) {
        openDiscard(action);
    } else {
        action();
    }
}

function bindEvents() {
    const signal = controller.signal;
    const form = $(ID.form);

    form.noValidate = true;

    form.addEventListener(
        "submit",
        submit,
        { signal }
    );

    const handleChange = event => {
        const changed = Object.entries(
            FIELD_IDS
        ).find(
            ([, id]) => $(id) === event.target
        )?.[0];

        if (!changed) {
            return;
        }

        clearFieldError(changed);
        visible(ID.submitError, false);

        renderPreview();
    };

    form.addEventListener(
        "input",
        handleChange,
        { signal }
    );

    form.addEventListener(
        "change",
        handleChange,
        { signal }
    );

    $(ID.retry)?.addEventListener(
        "click",
        () => load(),
        { signal }
    );

    $(ID.reset)?.addEventListener(
        "click",
        resetForm,
        { signal }
    );

    $(ID.cancel)?.addEventListener(
        "click",
        () => tryLeave(
            () => location.assign(
                "/admin/products.html"
            )
        ),
        { signal }
    );

    $(ID.back)?.addEventListener(
        "click",
        event => {
            if (!isDirty()) {
                return;
            }

            event.preventDefault();

            openDiscard(
                () => location.assign(
                    "/admin/products.html"
                )
            );
        },
        { signal }
    );

    for (const id of [
        ID.discardCancel,
        ID.discardClose
    ]) {
        $(id)?.addEventListener(
            "click",
            closeDiscard,
            { signal }
        );
    }

    $(ID.discardConfirm)?.addEventListener(
        "click",
        () => {
            const action = discardAction;

            closeDiscard();

            if (action) {
                allowLeaving = true;
                action();
            }
        },
        { signal }
    );

    $(ID.discardModal)?.addEventListener(
        "click",
        event => {
            if (
                event.target === event.currentTarget
            ) {
                closeDiscard();
            }
        },
        { signal }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                discardAction !== null
            ) {
                closeDiscard();
            }
        },
        { signal }
    );

    window.addEventListener(
        "beforeunload",
        event => {
            if (
                !allowLeaving &&
                isDirty()
            ) {
                event.preventDefault();
                event.returnValue = "";
            }
        },
        { signal }
    );
}

function checkMarkup() {
    const required = [
        ID.form,
        ID.content,
        ID.name,
        ID.description,
        ID.category,
        ID.price,
        ID.stock,
        ID.save
    ];

    const missing = required.filter(
        id => !$(id)
    );

    if (missing.length) {
        throw new Error(
            `Product Form HTML ID-лері табылмады: ${missing.join(", ")}`
        );
    }
}

export async function initAdminProductForm() {
    if (initialized) {
        return;
    }

    initialized = true;
    alive = true;

    controller = new AbortController();

    try {
        productId = readIdFromUrl();

        checkMarkup();
        updatePageTitle();
        bindEvents();

        await load();
    } catch (error) {
        showPageError(error);
    }
}

export function destroyAdminProductForm() {
    alive = false;
    initialized = false;
    busy = false;
    loading = false;
    ready = false;

    version++;

    controller?.abort();
    controller = null;

    if (discardAction) {
        closeDiscard();
    }

    productId = null;
    originalProduct = null;
    categories = [];
    initialSnapshot = "";
    allowLeaving = false;
}

export const adminProductForm = {
    init: initAdminProductForm,
    destroy: destroyAdminProductForm,
    reload: load,
    reset: resetForm,
    getMode,
    getFormData: readForm,

    getCategories: () =>
        categories.map(item => ({
            ...item
        })),

    getOriginalProduct: () =>
        originalProduct
            ? { ...originalProduct }
            : null
};

export default adminProductForm;
