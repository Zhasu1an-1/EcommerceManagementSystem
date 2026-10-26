
import {
    login,
    getCurrentUser,
    getRedirectAfterLogin,
    isAdmin,
    getAuthErrorMessage
} from "../core/auth.js";

import {
    isValidEmail,
    setButtonLoading,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError,
    showInfo
} from "../components/toast.js";

const SELECTORS = {
    form: [
        "#login-form",
        "#auth-login-form",
        "[data-login-form]"
    ],
    email: [
        "#login-email",
        "#email",
        'input[name="email"]'
    ],
    password: [
        "#login-password",
        "#password",
        'input[name="password"]'
    ],
    submit: [
        "#login-submit",
        "#login-submit-button",
        "#login-button",
        'button[type="submit"]'
    ],
    error: [
        "#login-error",
        "#login-form-error",
        "[data-login-error]"
    ],
    emailError: [
        "#login-email-error",
        "[data-login-email-error]"
    ],
    passwordError: [
        "#login-password-error",
        "[data-login-password-error]"
    ],
    passwordToggle: [
        "#login-password-toggle",
        "#toggle-login-password",
        "[data-toggle-password]"
    ],
    rememberMe: [
        "#login-remember",
        "#remember-me",
        'input[name="rememberMe"]'
    ],
    content: [
        "#login-content",
        ".auth-form-panel",
        ".auth-form-container"
    ],
    loading: [
        "#login-loading",
        "[data-login-loading]"
    ]
};

let initialized = false;
let submitting = false;
let eventController = null;

function findElement(selectors, root = document) {
    for (const selector of selectors) {
        const element = root.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

function getElements() {
    const form = findElement(SELECTORS.form);
    const root = form ?? document;

    return {
        form,
        email: findElement(SELECTORS.email, root),
        password: findElement(SELECTORS.password, root),
        submit: findElement(SELECTORS.submit, root),
        error: findElement(SELECTORS.error),
        emailError: findElement(SELECTORS.emailError),
        passwordError: findElement(SELECTORS.passwordError),
        passwordToggle: findElement(
            SELECTORS.passwordToggle
        ),
        rememberMe: findElement(
            SELECTORS.rememberMe,
            root
        ),
        content: findElement(SELECTORS.content),
        loading: findElement(SELECTORS.loading)
    };
}

function getErrorContainer() {
    const elements = getElements();

    if (elements.error) {
        return elements.error;
    }

    if (!elements.form) {
        return null;
    }

    const error = document.createElement("div");

    error.id = "login-dynamic-error";
    error.className = "alert alert-danger auth-form-error";
    error.setAttribute("role", "alert");
    error.hidden = true;

    elements.form.prepend(error);

    return error;
}

function displayError(message) {
    const container = getErrorContainer();

    if (container) {
        const messageElement = container.querySelector(
            "[data-error-message], .alert-message, p"
        );

        if (messageElement) {
            messageElement.textContent = message;
        } else {
            container.textContent = message;
        }

        showElement(container);
        return;
    }

    showError(message);
}

function clearGeneralError() {
    const error = getErrorContainer();

    if (error) {
        hideElement(error);
    }
}

function setFieldError(field, errorElement, message) {
    if (field) {
        field.setAttribute("aria-invalid", "true");
        field.classList.add("is-invalid");
    }

    if (errorElement) {
        errorElement.textContent = message;
        showElement(errorElement);
    } else {
        displayError(message);
    }
}

function clearFieldError(field, errorElement) {
    if (field) {
        field.removeAttribute("aria-invalid");
        field.classList.remove("is-invalid");
    }

    if (errorElement) {
        errorElement.textContent = "";
        hideElement(errorElement);
    }
}

function clearErrors() {
    const elements = getElements();

    clearGeneralError();

    clearFieldError(
        elements.email,
        elements.emailError
    );

    clearFieldError(
        elements.password,
        elements.passwordError
    );
}

function getCredentials() {
    const elements = getElements();

    return {
        email: String(
            elements.email?.value ?? ""
        ).trim(),
        password: String(
            elements.password?.value ?? ""
        )
    };
}

function validateCredentials(credentials) {
    const elements = getElements();

    clearErrors();

    if (!credentials.email) {
        setFieldError(
            elements.email,
            elements.emailError,
            "Email мекенжайын енгіз."
        );

        elements.email?.focus();

        return false;
    }

    if (!isValidEmail(credentials.email)) {
        setFieldError(
            elements.email,
            elements.emailError,
            "Жарамды email мекенжайын енгіз."
        );

        elements.email?.focus();

        return false;
    }

    if (!credentials.password) {
        setFieldError(
            elements.password,
            elements.passwordError,
            "Құпиясөзді енгіз."
        );

        elements.password?.focus();

        return false;
    }

    return true;
}

function getDestination(user) {
    const defaultDestination = isAdmin(user)
        ? "/admin/dashboard.html"
        : "/pages/account.html";

    const destination = getRedirectAfterLogin(
        defaultDestination
    );

    if (
        !isAdmin(user) &&
        (
            destination === "/admin" ||
            destination.startsWith("/admin/")
        )
    ) {
        return "/pages/account.html";
    }

    return destination;
}

function redirectAuthenticatedUser(user) {
    window.location.replace(
        getDestination(user)
    );
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    if (submitting) {
        return;
    }

    const credentials = getCredentials();

    if (!validateCredentials(credentials)) {
        return;
    }

    const elements = getElements();

    submitting = true;

    if (
        elements.submit instanceof HTMLButtonElement
    ) {
        setButtonLoading(
            elements.submit,
            true,
            "Signing In..."
        );
    }

    try {
        const result = await login(credentials);

        if (!result.user) {
            throw new Error(
                "Жүйеге кіру сәтті болғанын растау мүмкін болмады."
            );
        }

        elements.password.value = "";

        showSuccess(
            "Жүйеге сәтті кірдің!"
        );

        redirectAuthenticatedUser(
            result.user
        );
    } catch (error) {
        const message = getAuthErrorMessage(error);

        displayError(message);
    } finally {
        submitting = false;

        if (
            elements.submit instanceof HTMLButtonElement
        ) {
            setButtonLoading(
                elements.submit,
                false
            );
        }
    }
}

function setupPasswordToggle() {
    const elements = getElements();

    const button = elements.passwordToggle;
    const password = elements.password;

    if (!button || !password) {
        return;
    }

    if (button instanceof HTMLButtonElement) {
        button.type = "button";
    }

    button.setAttribute(
        "aria-label",
        "Құпиясөзді көрсету"
    );

    button.setAttribute(
        "aria-pressed",
        "false"
    );

    button.addEventListener(
        "click",
        event => {
            event.preventDefault();

            const isHidden =
                password.type === "password";

            password.type = isHidden
                ? "text"
                : "password";

            button.classList.toggle(
                "is-active",
                isHidden
            );

            button.setAttribute(
                "aria-pressed",
                String(isHidden)
            );

            button.setAttribute(
                "aria-label",
                isHidden
                    ? "Құпиясөзді жасыру"
                    : "Құпиясөзді көрсету"
            );

            password.focus({
                preventScroll: true
            });
        },
        {
            signal: eventController.signal
        }
    );
}

function setupFieldListeners() {
    const elements = getElements();
    const signal = eventController.signal;

    elements.email?.addEventListener(
        "input",
        () => {
            clearFieldError(
                elements.email,
                elements.emailError
            );

            clearGeneralError();
        },
        { signal }
    );

    elements.password?.addEventListener(
        "input",
        () => {
            clearFieldError(
                elements.password,
                elements.passwordError
            );

            clearGeneralError();
        },
        { signal }
    );
}

function setupForm() {
    const elements = getElements();

    if (!elements.form) {
        console.error(
            "Login form not found."
        );

        return;
    }

    elements.form.addEventListener(
        "submit",
        handleLoginSubmit,
        {
            signal: eventController.signal
        }
    );

    if (
        elements.submit &&
        !elements.form.contains(elements.submit)
    ) {
        elements.submit.addEventListener(
            "click",
            event => {
                event.preventDefault();
                elements.form.requestSubmit();
            },
            {
                signal: eventController.signal
            }
        );
    }

    setupPasswordToggle();
    setupFieldListeners();
}

function handleQueryMessages() {
    const params = new URLSearchParams(
        window.location.search
    );

    if (params.get("registered") === "true") {
        showSuccess(
            "Тіркелу сәтті аяқталды. Енді аккаунтыңа кір."
        );
    }

    if (params.get("logout") === "true") {
        showInfo(
            "Аккаунттан шықтың."
        );
    }

    if (params.get("sessionExpired") === "true") {
        displayError(
            "Сессия мерзімі аяқталды. Қайта кір."
        );
    }
}

async function checkExistingSession() {
    try {
        const user = await getCurrentUser();

        if (!initialized) {
            return;
        }

        if (user) {
            redirectAuthenticatedUser(user);
        }
    } catch (error) {
        console.warn(
            "Existing session check failed:",
            error
        );
    }
}

export async function initLogin() {
    if (initialized) {
        return;
    }

    initialized = true;
    eventController = new AbortController();

    setupForm();
    handleQueryMessages();

    await checkExistingSession();
}

export function destroyLogin() {
    initialized = false;
    submitting = false;

    eventController?.abort();
    eventController = null;
}

export const loginPage = {
    init: initLogin,
    destroy: destroyLogin
};

export default loginPage;
