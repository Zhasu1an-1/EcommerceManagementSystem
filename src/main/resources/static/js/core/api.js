
const API_BASE_URL = "/api";
const DEFAULT_TIMEOUT = 20000;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfData = null;
let csrfPromise = null;
let csrfGeneration = 0;

export class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);

        this.name = "ApiError";
        this.status = options.status ?? 0;
        this.statusText = options.statusText ?? "";
        this.url = options.url ?? "";
        this.data = options.data ?? null;
        this.isNetworkError = options.isNetworkError ?? false;
        this.isTimeout = options.isTimeout ?? false;
        this.isUnauthorized = this.status === 401;
        this.isForbidden = this.status === 403;
    }
}

function createUrl(path, params = {}) {
    if (typeof path !== "string" || !path.trim()) {
        throw new TypeError("API path бос болмауы керек.");
    }

    let normalizedPath = path.trim();

    if (!normalizedPath.startsWith("/")) {
        normalizedPath = `${API_BASE_URL}/${normalizedPath}`;
    }

    const url = new URL(normalizedPath, window.location.origin);

    if (url.origin !== window.location.origin) {
        throw new TypeError("API сұранысы тек осы серверге жіберілуі керек.");
    }

    if (
        url.pathname !== API_BASE_URL &&
        !url.pathname.startsWith(`${API_BASE_URL}/`)
    ) {
        throw new TypeError("API path /api/ мекенжайынан басталуы керек.");
    }

    const searchParams = params instanceof URLSearchParams
        ? params
        : new URLSearchParams();

    if (params instanceof URLSearchParams) {
        for (const [key, value] of searchParams.entries()) {
            url.searchParams.append(key, value);
        }

        return url;
    }

    if (params == null) {
        return url;
    }

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== undefined && item !== null && item !== "") {
                    url.searchParams.append(key, String(item));
                }
            }

            continue;
        }

        url.searchParams.set(key, String(value));
    }

    return url;
}

export function buildApiUrl(path, params = {}) {
    return createUrl(path, params).toString();
}

async function readResponse(response) {
    if (
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304
    ) {
        return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!text.trim()) {
        return null;
    }

    if (
        contentType.includes("application/json") ||
        contentType.includes("+json")
    ) {
        try {
            return JSON.parse(text);
        } catch {
            throw new ApiError(
                "Серверден жарамсыз JSON жауабы келді.",
                {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url
                }
            );
        }
    }

    return text;
}

function extractErrorMessage(data, status) {
    if (data && typeof data === "object") {
        const candidates = [
            data.message,
            data.detail,
            data.errorDescription,
            data.error
        ];

        for (const candidate of candidates) {
            if (
                typeof candidate === "string" &&
                candidate.trim() &&
                !/^(unauthorized|forbidden|internal server error)$/i.test(
                    candidate.trim()
                )
            ) {
                return candidate.trim();
            }
        }

        if (Array.isArray(data.errors) && data.errors.length > 0) {
            const first = data.errors[0];

            if (typeof first === "string") {
                return first;
            }

            if (first && typeof first.message === "string") {
                return first.message;
            }

            if (first && typeof first.defaultMessage === "string") {
                return first.defaultMessage;
            }
        }
    }

    if (status === 400) {
        return "Сұраныста қате бар. Енгізілген мәліметтерді тексер.";
    }

    if (status === 401) {
        return "Бұл әрекетті орындау үшін аккаунтыңа кіру қажет.";
    }

    if (status === 403) {
        return "Бұл әрекетке рұқсатың жоқ немесе қауіпсіздік токені жарамсыз.";
    }

    if (status === 404) {
        return "Сұралған мәлімет табылмады.";
    }

    if (status === 405) {
        return "Бұл API көрсетілген HTTP әдісін қолдамайды.";
    }

    if (status === 409) {
        return "Бұл әрекет деректердің қазіргі күйіне қайшы келеді.";
    }

    if (status === 422) {
        return "Енгізілген мәліметтер сервер тексерісінен өтпеді.";
    }

    if (status === 429) {
        return "Сұраныстар тым көп. Біраздан кейін қайта байқап көр.";
    }

    if (status >= 500) {
        return "Серверде қате пайда болды. Кейінірек қайта байқап көр.";
    }

    return "Сұранысты орындау мүмкін болмады.";
}

function createHttpError(response, data) {
    return new ApiError(
        extractErrorMessage(data, response.status),
        {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            data
        }
    );
}

export function clearCsrfToken() {
    csrfGeneration += 1;
    csrfData = null;
    csrfPromise = null;
}

export async function getCsrfToken(forceRefresh = false) {
    if (forceRefresh) {
        clearCsrfToken();
    }

    if (csrfData) {
        return csrfData;
    }

    if (csrfPromise) {
        return csrfPromise;
    }

    const generation = csrfGeneration;

    const request = (async () => {
        let response;

        try {
            response = await fetch(`${API_BASE_URL}/auth/csrf`, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            });
        } catch {
            throw new ApiError(
                "Қауіпсіздік токенін алу мүмкін болмады. Сервермен байланысты тексер.",
                {
                    isNetworkError: true
                }
            );
        }

        const data = await readResponse(response);

        if (!response.ok) {
            throw createHttpError(response, data);
        }

        if (
            !data ||
            typeof data !== "object" ||
            typeof data.token !== "string" ||
            !data.token.trim()
        ) {
            throw new ApiError(
                "Сервер CSRF токенін дұрыс қайтармады.",
                {
                    status: response.status,
                    url: response.url,
                    data
                }
            );
        }

        const result = {
            token: data.token,
            headerName:
                typeof data.headerName === "string" &&
                data.headerName.trim()
                    ? data.headerName
                    : "X-CSRF-TOKEN",
            parameterName:
                typeof data.parameterName === "string"
                    ? data.parameterName
                    : "_csrf"
        };

        if (csrfGeneration === generation) {
            csrfData = result;
        }

        return result;
    })();

    csrfPromise = request;

    try {
        return await request;
    } finally {
        if (csrfPromise === request) {
            csrfPromise = null;
        }
    }
}

export async function apiRequest(path, options = {}) {
    const {
        method = "GET",
        params = {},
        body,
        headers = {},
        signal,
        timeout = DEFAULT_TIMEOUT,
        ...otherOptions
    } = options;

    const normalizedMethod = String(method).toUpperCase();
    const url = createUrl(path, params);
    const requestHeaders = new Headers(headers);
    const needsCsrf = !SAFE_METHODS.has(normalizedMethod);

    if (!requestHeaders.has("Accept")) {
        requestHeaders.set("Accept", "application/json");
    }

    const controller = new AbortController();

    let timeoutId = null;
    let timedOut = false;

    const abortRequest = () => {
        controller.abort();
    };

    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener("abort", abortRequest, {
                once: true
            });
        }
    }

    if (Number.isFinite(timeout) && timeout > 0) {
        timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);
    }

    try {
        if (controller.signal.aborted) {
            throw new DOMException(
                "Сұраныс тоқтатылды.",
                "AbortError"
            );
        }

        if (needsCsrf) {
            const csrf = await getCsrfToken();

            if (controller.signal.aborted) {
                throw new DOMException(
                    "Сұраныс тоқтатылды.",
                    "AbortError"
                );
            }

            requestHeaders.set(csrf.headerName, csrf.token);
        }

        const requestOptions = {
            ...otherOptions,
            method: normalizedMethod,
            headers: requestHeaders,
            credentials: "include",
            signal: controller.signal
        };

        if (
            body !== undefined &&
            body !== null &&
            normalizedMethod !== "GET" &&
            normalizedMethod !== "HEAD"
        ) {
            if (body instanceof FormData) {
                requestOptions.body = body;
                requestHeaders.delete("Content-Type");
            } else if (body instanceof URLSearchParams) {
                requestOptions.body = body;
                requestHeaders.set(
                    "Content-Type",
                    "application/x-www-form-urlencoded;charset=UTF-8"
                );
            } else if (body instanceof Blob) {
                requestOptions.body = body;
            } else {
                requestOptions.body = JSON.stringify(body);

                if (!requestHeaders.has("Content-Type")) {
                    requestHeaders.set(
                        "Content-Type",
                        "application/json"
                    );
                }
            }
        }

        const response = await fetch(url.toString(), requestOptions);
        const data = await readResponse(response);

        if (response.status === 403 && needsCsrf) {
            clearCsrfToken();
        }

        if (!response.ok) {
            throw createHttpError(response, data);
        }

        const responseContentType =
            response.headers.get("content-type") ?? "";

        if (responseContentType.includes("text/html")) {
            throw new ApiError(
                "API JSON орнына HTML бетін қайтарды. Авторизация мен сервер баптауларын тексер.",
                {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    data
                }
            );
        }

        return data;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        if (error.name === "AbortError") {
            if (timedOut) {
                throw new ApiError(
                    "Сервер уақытында жауап бермеді. Қайта байқап көр.",
                    {
                        url: url.toString(),
                        isTimeout: true
                    }
                );
            }

            throw error;
        }

        if (error instanceof TypeError) {
            throw new ApiError(
                "Сервермен байланысу мүмкін болмады. Интернетті және Spring Boot серверін тексер.",
                {
                    url: url.toString(),
                    isNetworkError: true
                }
            );
        }

        throw error;
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        if (signal) {
            signal.removeEventListener("abort", abortRequest);
        }
    }
}

export function isApiError(error) {
    return error instanceof ApiError;
}

export function getErrorMessage(error) {
    if (error instanceof ApiError) {
        return error.message;
    }

    if (error && typeof error.message === "string") {
        return error.message;
    }

    return "Белгісіз қате пайда болды.";
}

export function isAuthenticationError(error) {
    return error instanceof ApiError && error.status === 401;
}

export function isPermissionError(error) {
    return error instanceof ApiError && error.status === 403;
}

const http = {
    get(path, params = {}, options = {}) {
        return apiRequest(path, {
            ...options,
            method: "GET",
            params
        });
    },

    post(path, body = {}, options = {}) {
        return apiRequest(path, {
            ...options,
            method: "POST",
            body
        });
    },

    put(path, body = {}, options = {}) {
        return apiRequest(path, {
            ...options,
            method: "PUT",
            body
        });
    },

    patch(path, body = {}, options = {}) {
        return apiRequest(path, {
            ...options,
            method: "PATCH",
            body
        });
    },

    delete(path, options = {}) {
        return apiRequest(path, {
            ...options,
            method: "DELETE"
        });
    }
};

export const api = {
    request: apiRequest,
    get: http.get,
    post: http.post,
    put: http.put,
    patch: http.patch,
    delete: http.delete,

    auth: {
        csrf(forceRefresh = false) {
            return getCsrfToken(forceRefresh);
        },

        me() {
            return http.get("/api/auth/me");
        },

        async login(credentials) {
            const result = await http.post(
                "/api/auth/login",
                credentials
            );

            clearCsrfToken();

            return result;
        },

        async register(userData) {
            const result = await http.post(
                "/api/auth/register",
                userData
            );

            clearCsrfToken();

            return result;
        },

        async logout() {
            const result = await http.post(
                "/api/auth/logout"
            );

            clearCsrfToken();

            return result;
        }
    },

    products: {
        list(params = {}) {
            return http.get("/api/products", params);
        },

        getById(productId) {
            return http.get(
                `/api/products/${encodeURIComponent(productId)}`
            );
        }
    },

    categories: {
        list() {
            return http.get("/api/categories");
        }
    },

    cart: {
        get() {
            return http.get("/api/cart");
        },

        addItem(productId, quantity = 1) {
            return http.post("/api/cart/items", {
                productId,
                quantity
            });
        },

        updateItem(itemId, quantity) {
            return http.put(
                `/api/cart/items/${encodeURIComponent(itemId)}`,
                {
                    quantity
                }
            );
        },

        removeItem(itemId) {
            return http.delete(
                `/api/cart/items/${encodeURIComponent(itemId)}`
            );
        },

        clear() {
            return http.delete("/api/cart");
        }
    },

    orders: {
        checkout(checkoutData) {
            return http.post(
                "/api/orders/checkout",
                checkoutData
            );
        },

        mine(params = {}) {
            return http.get("/api/orders/my", params);
        },

        getById(orderId) {
            return http.get(
                `/api/orders/${encodeURIComponent(orderId)}`
            );
        },

        cancel(orderId) {
            return http.put(
                `/api/orders/${encodeURIComponent(orderId)}/cancel`
            );
        }
    },

    payments: {
        create(orderId, method) {
            return http.post("/api/payments", {
                orderId,
                method
            });
        },

        getByOrder(orderId) {
            return http.get(
                `/api/payments/order/${encodeURIComponent(orderId)}`
            );
        }
    },

    promotions: {
        active() {
            return http.get("/api/promotions/active");
        }
    },

    notifications: {
        mine() {
            return http.get("/api/notifications");
        }
    }
};

export default api;
