
import {
    register,
    getCurrentUser,
    getRedirectAfterLogin,
    isAdmin,
    getAuthErrorMessage
} from "../core/auth.js";

import {
    isValidEmail,
    getPasswordStrength,
    setButtonLoading,
    showElement,
    hideElement
} from "../core/utils.js";

import {
    showSuccess,
    showError
} from "../components/toast.js";

const SELECTORS = {
    form: [
        "#register-form",
        "#auth-register-form",
        "[data-register-form]"
    ],
    name: [
        "#register-name",
        "#register-full-name",
        "#full-name",
        'input[name="name"]'
    ],
    email: [
        "#register-email",
        'input[name="email"]'
    ],
    password: [
        "#register-password",
        'input[name="password"]'
    ],
    confirmPassword: [
        "#register-confirm-password",
        "#confirm-password",
        'input[name="confirmPassword"]',
        'input[name="passwordConfirmation"]'
    ],
    terms: [
        "#register-terms",
        "#accept-terms",
        'input[name="acceptTerms"]',
        'input[name="terms"]'
    ],
    submit: [
        "#register-submit",
        "#register-submit-button",
        "#register-button",
        'button[type="submit"]'
    ],
    error: [
        "#register-error",
        "#register-form-error",
        "[data-register-error]"
    ],
    nameError: [
        "#register-name-error",
        "[data-register-name-error]"
    ],
    emailError: [
        "#register-email-error",
        "[data-register-email-error]"
    ],
    passwordError: [
        "#register-password-error",
        "[data-register-password-error]"
    ],
    confirmError: [
        "#register-confirm-password-error",
        "[data-register-confirm-error]"
    ],
    termsError: [
        "#register-terms-error",
        "[data-register-terms-error]"
    ],
    strengthBar: [
        "#password-strength-bar",
        "#register-password-strength-bar",
        "[data-password-strength-bar]"
    ],
    strengthText: [
        "#password-strength-text",
        "#register-password-strength-text",
        "[data-password-strength-text]"
    ],
    strengthContainer: [
        "#password-strength",
        "#register-password-strength",
        "[data-password-strength]"
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
        name: findElement(SELECTORS.name, root),
        email: findElement(SELECTORS.email, root),
        password: findElement(SELECTORS.password, root),
        confirmPassword: findElement(
            SELECTORS.confirmPassword,
            root
        ),
        terms: findElement(SELECTORS.terms, root),
        submit: findElement(SELECTORS.submit, root),
        error: findElement(SELECTORS.error),
        nameError: findElement(SELECTORS.nameError),
        emailError: findElement(SELECTORS.emailError),
        passwordError: findElement(SELECTORS.passwordError),
        confirmError: findElement(SELECTORS.confirmError),
        termsError: findElement(SELECTORS.termsError),
        strengthBar: findElement(SELECTORS.strengthBar),
        strengthText: findElement(SELECTORS.strengthText),
        strengthContainer: findElement(
            SELECTORS.strengthContainer
        )
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

    let container = document.getElementById(
        "register-dynamic-error"
    );

    if (!container) {
        container = document.createElement("div");

        container.id = "register-dynamic-error";
        container.className =
            "alert alert-danger auth-form-error";

        container.setAttribute("role", "alert");
        container.hidden = true;

        elements.form.prepend(container);
    }

    return container;
}

function displayError(message) {
    const container = getErrorContainer();

    if (!container) {
        showError(message);
        return;
    }

    const text = container.querySelector(
        "[data-error-message], .alert-message, p"
    );

    if (text) {
        text.textContent = message;
    } else {
        container.textContent = message;
    }

    showElement(container);
}

function clearGeneralError() {
    const container = getErrorContainer();

    if (container) {
        hideElement(container);
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

    const fields = [
        [elements.name, elements.nameError],
        [elements.email, elements.emailError],
        [elements.password, elements.passwordError],
        [elements.confirmPassword, elements.confirmError],
        [elements.terms, elements.termsError]
    ];

    for (const [field, error] of fields) {
        clearFieldError(field, error);
    }
}

function getRegistrationData() {
    const elements = getElements();

    return {
        name: String(elements.name?.value ?? "").trim(),
        email: String(elements.email?.value ?? "").trim(),
        password: String(elements.password?.value ?? ""),
        confirmPassword: String(
            elements.confirmPassword?.value ?? ""
        ),
        acceptedTerms: elements.terms
            ? elements.terms.checked
            : true
    };
}

function validateRegistration(data) {
    const elements = getElements();

    clearErrors();

    if (!data.name) {
        setFieldError(
            elements.name,
            elements.nameError,
            "Атыңды енгіз."
        );

        elements.name?.focus();
        return false;
    }

    if (data.name.length < 2) {
        setFieldError(
            elements.name,
            elements.nameError,
            "Атың кемінде 2 таңбадан тұруы керек."
        );

        elements.name?.focus();
        return false;
    }

    if (!data.email) {
        setFieldError(
            elements.email,
            elements.emailError,
            "Email мекенжайын енгіз."
        );

        elements.email?.focus();
        return false;
    }

    if (!isValidEmail(data.email)) {
        setFieldError(
            elements.email,
            elements.emailError,
            "Жарамды email мекенжайын енгіз."
        );

        elements.email?.focus();
        return false;
    }

    if (!data.password) {
        setFieldError(
            elements.password,
            elements.passwordError,
            "Құпиясөзді енгіз."
        );

        elements.password?.focus();
        return false;
    }

    if (data.password.length < 8) {
        setFieldError(
            elements.password,
            elements.passwordError,
            "Құпиясөз кемінде 8 таңбадан тұруы керек."
        );

        elements.password?.focus();
        return false;
    }

    if (
        elements.confirmPassword &&
        !data.confirmPassword
    ) {
        setFieldError(
            elements.confirmPassword,
            elements.confirmError,
            "Құпиясөзді қайта енгіз."
        );

        elements.confirmPassword.focus();
        return false;
    }

    if (
        elements.confirmPassword &&
        data.password !== data.confirmPassword
    ) {
        setFieldError(
            elements.confirmPassword,
            elements.confirmError,
            "Құпиясөздер сәйкес келмейді."
        );

        elements.confirmPassword.focus();
        return false;
    }

    if (!data.acceptedTerms) {
        setFieldError(
            elements.terms,
            elements.termsError,
            "Тіркелу үшін шарттармен келісу қажет."
        );

        elements.terms?.focus();
        return false;
    }

    return true;
}

function updatePasswordStrength() {
    const elements = getElements();
    const password = elements.password?.value ?? "";

    const strength = getPasswordStrength(password);

    if (elements.strengthBar) {
        elements.strengthBar.style.width =
            `${strength.percentage}%`;

        elements.strengthBar.dataset.strength =
            strength.level;

        elements.strengthBar.classList.remove(
            "is-weak",
            "is-medium",
            "is-strong",
            "is-empty"
        );

        elements.strengthBar.classList.add(
            `is-${strength.level}`
        );

        elements.strengthBar.setAttribute(
            "aria-valuenow",
            String(strength.percentage)
        );
    }

    if (elements.strengthText) {
        elements.strengthText.textContent =
            strength.label;

        elements.strengthText.dataset.strength =
            strength.level;
    }

    if (elements.strengthContainer) {
        elements.strengthContainer.dataset.strength =
            strength.level;
    }

    const requirements = document.querySelectorAll(
        "[data-password-requirement]"
    );

    for (const element of requirements) {
        const requirement = element.dataset.passwordRequirement;

        const fulfilled = Boolean(
            strength.requirements[requirement]
        );

        element.classList.toggle(
            "is-valid",
            fulfilled
        );

        element.classList.toggle(
            "is-complete",
            fulfilled
        );

        element.setAttribute(
            "data-fulfilled",
            String(fulfilled)
        );
    }
}

function setupPasswordToggles() {
    const elements = getElements();

    const buttons = document.querySelectorAll(
        "#register-password-toggle, " +
        "#register-confirm-password-toggle, " +
        "[data-toggle-password]"
    );

    for (const button of buttons) {
        let input = null;

        const target = button.dataset.target ??
            button.dataset.passwordTarget;

        if (target) {
            const id = target.replace(/^#/, "");

            input = document.getElementById(id);
        }

        if (!input) {
            const wrapper = button.closest(
                ".password-input-wrapper, " +
                ".auth-password-field, " +
                ".form-group"
            );

            input = wrapper?.querySelector(
                'input[type="password"], input[data-password-input]'
            );
        }

        if (!input) {
            if (
                button.id === "register-confirm-password-toggle"
            ) {
                input = elements.confirmPassword;
            } else {
                input = elements.password;
            }
        }

        if (!input) {
            continue;
        }

        if (button instanceof HTMLButtonElement) {
            button.type = "button";
        }

        button.setAttribute(
            "aria-pressed",
            "false"
        );

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();

                const showPassword =
                    input.type === "password";

                input.type = showPassword
                    ? "text"
                    : "password";

                button.classList.toggle(
                    "is-active",
                    showPassword
                );

                button.setAttribute(
                    "aria-pressed",
                    String(showPassword)
                );

                button.setAttribute(
                    "aria-label",
                    showPassword
                        ? "Құпиясөзді жасыру"
                        : "Құпиясөзді көрсету"
                );
            },
            {
                signal: eventController.signal
            }
        );
    }
}

function setupFieldListeners() {
    const elements = getElements();
    const signal = eventController.signal;

    const fields = [
        [elements.name, elements.nameError],
        [elements.email, elements.emailError],
        [elements.password, elements.passwordError],
        [elements.confirmPassword, elements.confirmError],
        [elements.terms, elements.termsError]
    ];

    for (const [field, errorElement] of fields) {
        if (!field) {
            continue;
        }

        const eventName =
            field.type === "checkbox"
                ? "change"
                : "input";

        field.addEventListener(
            eventName,
            () => {
                clearFieldError(
                    field,
                    errorElement
                );

                clearGeneralError();

                if (field === elements.password) {
                    updatePasswordStrength();
                }
            },
            { signal }
        );
    }

    updatePasswordStrength();
}

function getRedirectDestination(user) {
    const fallback = isAdmin(user)
        ? "/admin/dashboard.html"
        : "/pages/account.html";

    const destination = getRedirectAfterLogin(
        fallback
    );

    if (
        !isAdmin(user) &&
        destination.startsWith("/admin/")
    ) {
        return "/pages/account.html";
    }

    return destination;
}

async function handleRegisterSubmit(event) {
    event.preventDefault();

    if (submitting) {
        return;
    }

    const data = getRegistrationData();

    if (!validateRegistration(data)) {
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
            "Creating Account..."
        );
    }

    try {
        const result = await register({
            name: data.name,
            email: data.email,
            password: data.password
        });

        if (elements.password) {
            elements.password.value = "";
        }

        if (elements.confirmPassword) {
            elements.confirmPassword.value = "";
        }

        showSuccess(
            "Аккаунтың сәтті тіркелді!"
        );

        if (result.authenticated && result.user) {
            window.location.replace(
                getRedirectDestination(result.user)
            );

            return;
        }

        const loginUrl = new URL(
            "/pages/login.html",
            window.location.origin
        );

        loginUrl.searchParams.set(
            "registered",
            "true"
        );

        window.location.replace(
            `${loginUrl.pathname}${loginUrl.search}`
        );
    } catch (error) {
        displayError(
            getAuthErrorMessage(error)
        );
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

function setupForm() {
    const elements = getElements();

    if (!elements.form) {
        console.error("Register form not found.");
        return;
    }

    elements.form.addEventListener(
        "submit",
        handleRegisterSubmit,
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

    setupFieldListeners();
    setupPasswordToggles();
}

async function checkExistingSession() {
    try {
        const user = await getCurrentUser();

        if (initialized && user) {
            window.location.replace(
                getRedirectDestination(user)
            );
        }
    } catch (error) {
        console.warn(
            "Registration session check failed:",
            error
        );
    }
}

export async function initRegister() {
    if (initialized) {
        return;
    }

    initialized = true;
    eventController = new AbortController();

    setupForm();

    await checkExistingSession();
}

export function destroyRegister() {
    initialized = false;
    submitting = false;

    eventController?.abort();
    eventController = null;
}

export const registerPage = {
    init: initRegister,
    destroy: destroyRegister
};

export default registerPage;
