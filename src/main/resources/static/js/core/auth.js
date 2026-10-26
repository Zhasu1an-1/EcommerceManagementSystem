
import api, {
    ApiError,
    getErrorMessage,
    isAuthenticationError,
    isPermissionError
} from "./api.js";

const LOGIN_PAGE = "/pages/login.html";
const DEFAULT_AFTER_LOGIN = "/pages/account.html";
const DEFAULT_AFTER_LOGOUT = "/";

const AUTH_CHANGE_EVENT = "nexora:auth-change";

let currentUser = null;
let authenticationChecked = false;
let pendingAuthRequest = null;
let authVersion = 0;

const authListeners = new Set();

function isObject(value) {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function normalizeRole(value) {
    if (typeof value === "string") {
        const role = value.trim().toUpperCase();

        if (!role) {
            return null;
        }

        return role.startsWith("ROLE_")
            ? role.substring(5)
            : role;
    }

    if (isObject(value)) {
        return normalizeRole(
            value.authority ??
            value.name ??
            value.role ??
            null
        );
    }

    return null;
}

function extractRoles(...sources) {
    const roles = new Set();

    function addRole(value) {
        if (Array.isArray(value)) {
            for (const item of value) {
                addRole(item);
            }

            return;
        }

        const role = normalizeRole(value);

        if (role) {
            roles.add(role);
        }
    }

    for (const source of sources) {
        if (!isObject(source)) {
            continue;
        }

        addRole(source.role);
        addRole(source.roles);
        addRole(source.authorities);
    }

    return [...roles];
}

export function normalizeUser(payload) {
    if (!isObject(payload)) {
        return null;
    }

    if (
        payload.authenticated === false ||
        payload.isAuthenticated === false ||
        payload.loggedIn === false
    ) {
        return null;
    }

    let user = payload;

    if (isObject(payload.user)) {
        user = payload.user;
    } else if (isObject(payload.data)) {
        user = isObject(payload.data.user)
            ? payload.data.user
            : payload.data;
    }

    if (
        user.authenticated === false ||
        user.isAuthenticated === false ||
        user.loggedIn === false
    ) {
        return null;
    }

    if (
        user.username === "anonymousUser" ||
        user.principal === "anonymousUser"
    ) {
        return null;
    }

    const id = user.id ?? user.userId ?? null;

    const email =
        typeof user.email === "string"
            ? user.email.trim()
            : null;

    const name =
        user.name ??
        user.fullName ??
        user.username ??
        email ??
        null;

    const roles = extractRoles(user, payload);
    const role = roles[0] ?? null;

    const hasIdentity =
        id !== null ||
        Boolean(email) ||
        Boolean(name) ||
        roles.length > 0;

    if (!hasIdentity) {
        return null;
    }

    return {
        ...user,
        id,
        name: String(name ?? "Пайдаланушы"),
        email,
        role,
        roles
    };
}

function getAuthSnapshot() {
    return {
        user: currentUser,
        authenticated: currentUser !== null,
        checked: authenticationChecked,
        role: currentUser?.role ?? null,
        roles: currentUser?.roles ?? []
    };
}

function notifyAuthChange() {
    const snapshot = getAuthSnapshot();

    for (const listener of authListeners) {
        try {
            listener(snapshot);
        } catch (error) {
            console.error(
                "Authentication listener error:",
                error
            );
        }
    }

    window.dispatchEvent(
        new CustomEvent(AUTH_CHANGE_EVENT, {
            detail: snapshot
        })
    );
}

function updateAuthState(user) {
    currentUser = user;
    authenticationChecked = true;

    notifyAuthChange();

    return currentUser;
}

function invalidateAuthState() {
    authVersion += 1;
    currentUser = null;
    authenticationChecked = false;
    pendingAuthRequest = null;
}

export function clearAuthState() {
    invalidateAuthState();
    updateAuthState(null);
}

export function getCachedUser() {
    return currentUser;
}

export function isAuthChecked() {
    return authenticationChecked;
}

export function isAuthenticated() {
    return currentUser !== null;
}

export function getUserRoles(user = currentUser) {
    if (!user) {
        return [];
    }

    return extractRoles(user);
}

export function hasRole(role, user = currentUser) {
    if (!user) {
        return false;
    }

    const expectedRole = normalizeRole(role);

    if (!expectedRole) {
        return false;
    }

    return getUserRoles(user).includes(expectedRole);
}

export function isAdmin(user = currentUser) {
    return hasRole("ADMIN", user);
}

export function isCustomer(user = currentUser) {
    return hasRole("CUSTOMER", user);
}

export function getUserDisplayName(user = currentUser) {
    if (!user) {
        return "Қонақ";
    }

    const name = String(
        user.name ??
        user.fullName ??
        user.username ??
        user.email ??
        "Пайдаланушы"
    ).trim();

    return name || "Пайдаланушы";
}

export function getUserInitials(user = currentUser) {
    const name = getUserDisplayName(user);

    const words = name
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "U";
    }

    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }

    return (
        words[0].charAt(0) +
        words[words.length - 1].charAt(0)
    ).toUpperCase();
}

export function getAuthState() {
    return getAuthSnapshot();
}

export function onAuthChange(listener, options = {}) {
    if (typeof listener !== "function") {
        throw new TypeError(
            "Authentication listener функция болуы керек."
        );
    }

    authListeners.add(listener);

    if (options.immediate === true) {
        listener(getAuthSnapshot());
    }

    return () => {
        authListeners.delete(listener);
    };
}

export async function getCurrentUser(forceRefresh = false) {
    if (forceRefresh) {
        authVersion += 1;
        authenticationChecked = false;
        pendingAuthRequest = null;
    }

    if (authenticationChecked) {
        return currentUser;
    }

    if (pendingAuthRequest) {
        return pendingAuthRequest;
    }

    const requestVersion = authVersion;

    const request = api.auth.me()
        .then(response => {
            const user = normalizeUser(response);

            if (requestVersion === authVersion) {
                updateAuthState(user);
            }

            return requestVersion === authVersion
                ? currentUser
                : null;
        })
        .catch(error => {
            if (isAuthenticationError(error)) {
                if (requestVersion === authVersion) {
                    updateAuthState(null);
                }

                return null;
            }

            throw error;
        })
        .finally(() => {
            if (pendingAuthRequest === request) {
                pendingAuthRequest = null;
            }
        });

    pendingAuthRequest = request;

    return request;
}

export function refreshAuth() {
    return getCurrentUser(true);
}

export async function login(credentials) {
    if (!isObject(credentials)) {
        throw new TypeError(
            "Login мәліметтері дұрыс берілмеген."
        );
    }

    const email = String(
        credentials.email ?? ""
    ).trim();

    const password = String(
        credentials.password ?? ""
    );

    if (!email || !password) {
        throw new Error(
            "Email мен құпиясөзді енгіз."
        );
    }

    const result = await api.auth.login({
        ...credentials,
        email,
        password
    });

    invalidateAuthState();

    const user = await getCurrentUser(true);

    if (!user) {
        throw new ApiError(
            "Жүйеге кіру нәтижесін растау мүмкін болмады. Сессияны тексер.",
            {
                status: 401
            }
        );
    }

    return {
        result,
        user
    };
}

export async function register(userData) {
    if (!isObject(userData)) {
        throw new TypeError(
            "Тіркелу мәліметтері дұрыс берілмеген."
        );
    }

    const data = {
        ...userData,
        name: String(userData.name ?? "").trim(),
        email: String(userData.email ?? "").trim()
    };

    if (!data.name || !data.email || !data.password) {
        throw new Error(
            "Атыңды, email және құпиясөзді толтыр."
        );
    }

    const result = await api.auth.register(data);

    invalidateAuthState();

    const user = await getCurrentUser(true);

    return {
        result,
        user,
        authenticated: user !== null
    };
}

export async function logout(options = {}) {
    const {
        redirect = false,
        redirectTo = DEFAULT_AFTER_LOGOUT
    } = options;

    const result = await api.auth.logout();

    clearAuthState();

    if (redirect) {
        window.location.assign(
            getSafeRedirect(
                redirectTo,
                DEFAULT_AFTER_LOGOUT
            )
        );
    }

    return result;
}

export function getSafeRedirect(
    destination,
    fallback = DEFAULT_AFTER_LOGIN
) {
    if (
        typeof destination !== "string" ||
        !destination.trim()
    ) {
        return fallback;
    }

    const value = destination.trim();

    if (
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.includes("\\") ||
        /[\r\n]/.test(value)
    ) {
        return fallback;
    }

    try {
        const url = new URL(
            value,
            window.location.origin
        );

        if (url.origin !== window.location.origin) {
            return fallback;
        }

        if (url.pathname === LOGIN_PAGE) {
            return fallback;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

export function getCurrentPageUrl() {
    return (
        window.location.pathname +
        window.location.search +
        window.location.hash
    );
}

export function getLoginUrl(
    redirectTo = getCurrentPageUrl()
) {
    const safeDestination = getSafeRedirect(
        redirectTo,
        DEFAULT_AFTER_LOGIN
    );

    return (
        `${LOGIN_PAGE}?redirect=` +
        encodeURIComponent(safeDestination)
    );
}

export function redirectToLogin(
    redirectTo = getCurrentPageUrl()
) {
    const url = getLoginUrl(redirectTo);

    window.location.assign(url);
}

export function getRedirectAfterLogin(
    fallback = DEFAULT_AFTER_LOGIN
) {
    const params = new URLSearchParams(
        window.location.search
    );

    const destination =
        params.get("redirect") ??
        params.get("returnTo") ??
        params.get("next");

    return getSafeRedirect(
        destination,
        fallback
    );
}

export function redirectAfterLogin(
    fallback = DEFAULT_AFTER_LOGIN
) {
    const destination = getRedirectAfterLogin(
        fallback
    );

    window.location.assign(destination);
}

export async function requireAuth(options = {}) {
    const {
        redirect = false,
        redirectTo = getCurrentPageUrl()
    } = options;

    const user = await getCurrentUser();

    if (user) {
        return user;
    }

    if (redirect) {
        redirectToLogin(redirectTo);
    }

    return null;
}

export async function requireRole(
    role,
    options = {}
) {
    const {
        redirect = false,
        redirectTo = getCurrentPageUrl(),
        forbiddenRedirect = "/"
    } = options;

    const user = await getCurrentUser();

    if (!user) {
        if (redirect) {
            redirectToLogin(redirectTo);
        }

        return null;
    }

    if (!hasRole(role, user)) {
        if (redirect) {
            window.location.assign(
                getSafeRedirect(
                    forbiddenRedirect,
                    "/"
                )
            );
        }

        return null;
    }

    return user;
}

export function requireAdmin(options = {}) {
    return requireRole("ADMIN", options);
}

export function requireCustomer(options = {}) {
    return requireRole("CUSTOMER", options);
}

export async function checkAuthentication() {
    try {
        const user = await getCurrentUser();

        return {
            authenticated: user !== null,
            user,
            isAdmin: isAdmin(user),
            isCustomer: isCustomer(user),
            error: null
        };
    } catch (error) {
        return {
            authenticated: false,
            user: null,
            isAdmin: false,
            isCustomer: false,
            error
        };
    }
}

export async function checkAdminAccess() {
    const user = await getCurrentUser();

    if (!user) {
        return {
            allowed: false,
            reason: "UNAUTHENTICATED",
            user: null
        };
    }

    if (!isAdmin(user)) {
        return {
            allowed: false,
            reason: "FORBIDDEN",
            user
        };
    }

    return {
        allowed: true,
        reason: null,
        user
    };
}

export function getAuthErrorMessage(error) {
    if (isAuthenticationError(error)) {
        return "Email немесе құпиясөз қате, не сессияның мерзімі аяқталған.";
    }

    if (isPermissionError(error)) {
        return "Бұл әрекетті орындауға рұқсатың жоқ.";
    }

    return getErrorMessage(error);
}

export function handleAuthError(error, options = {}) {
    const {
        redirectOnUnauthorized = false,
        redirectTo = getCurrentPageUrl()
    } = options;

    if (isAuthenticationError(error)) {
        clearAuthState();

        if (redirectOnUnauthorized) {
            redirectToLogin(redirectTo);
        }

        return true;
    }

    return false;
}

export const auth = {
    getCurrentUser,
    getCachedUser,
    getAuthState,
    refreshAuth,
    clearAuthState,
    checkAuthentication,
    checkAdminAccess,

    isAuthenticated,
    isAuthChecked,
    isAdmin,
    isCustomer,
    hasRole,
    getUserRoles,
    getUserDisplayName,
    getUserInitials,
    normalizeUser,

    login,
    register,
    logout,

    requireAuth,
    requireRole,
    requireAdmin,
    requireCustomer,

    getSafeRedirect,
    getCurrentPageUrl,
    getLoginUrl,
    getRedirectAfterLogin,
    redirectToLogin,
    redirectAfterLogin,

    onAuthChange,
    getAuthErrorMessage,
    handleAuthError
};

export default auth;
