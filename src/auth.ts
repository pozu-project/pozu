/**
 * Minimal client-side session handling for GitHub OAuth.
 *
 * The backend (pozu-backend) owns the entire OAuth dance: the "Sign in"
 * control just navigates to its `/auth/github/login` endpoint, which
 * redirects to GitHub, exchanges the authorization code server-side
 * (the client secret never touches the browser), mints a short-lived
 * (1h) HS256 JWT, and bounces back to this site with the token in the
 * URL fragment — `…/pozu/#token=<jwt>`.
 *
 * This module captures that token on return, persists it, exposes it
 * for `Authorization: Bearer` use by the annotation APIs, and renders
 * the nav sign-in / signed-in control shared by both pages. The JWT is
 * never verified here (only the backend holds the signing key); the
 * decoded payload is used purely to display who is signed in and to
 * drop tokens that have already expired.
 */

const BACKEND_BASE = "https://pozu-codycbakerphd.pythonanywhere.com";

/** Backend endpoint that kicks off the GitHub OAuth flow. */
export const LOGIN_URL = `${BACKEND_BASE}/auth/github/login`;

const STORAGE_KEY = "pozu.auth.token";

export interface AuthUser {
    /** GitHub numeric user id (JWT `sub`). */
    sub: string;
    login?: string;
    name?: string;
    avatar_url?: string;
    /** Expiry as a Unix timestamp in seconds (JWT `exp`). */
    exp?: number;
}

/** Thrown when the backend rejects the JWT (expired or invalid). */
export class AuthError extends Error {
    constructor(message = "Your session has expired — please sign in with GitHub again.") {
        super(message);
        this.name = "AuthError";
    }
}

/**
 * Decode a JWT payload for display only — the signature is NOT verified
 * (that is the backend's job). Returns null for anything that isn't a
 * well-formed three-part JWT with a JSON payload.
 */
function decodeJwt(token: string): AuthUser | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        return JSON.parse(atob(padded)) as AuthUser;
    } catch {
        return null;
    }
}

function isExpired(user: AuthUser | null): boolean {
    if (!user?.exp) return false;
    return Date.now() >= user.exp * 1000;
}

/**
 * If the page was loaded via the backend's post-auth redirect, lift the
 * token out of the URL fragment, persist it, and scrub it from the
 * address bar / history so the JWT isn't left in shareable links.
 */
export function captureTokenFromHash(): void {
    const hash = window.location.hash;
    if (hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get("token");
    if (!token) return;

    localStorage.setItem(STORAGE_KEY, token);

    params.delete("token");
    const rest = params.toString();
    const newHash = rest ? `#${rest}` : "";
    history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
}

/** The current, non-expired bearer token, or null. Expired tokens are dropped. */
export function getToken(): string | null {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return null;
    if (isExpired(decodeJwt(token))) {
        clearToken();
        return null;
    }
    return token;
}

/** Decoded identity claims for the signed-in user, or null. */
export function getUser(): AuthUser | null {
    const token = getToken();
    return token ? decodeJwt(token) : null;
}

export function isSignedIn(): boolean {
    return getToken() !== null;
}

export function clearToken(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/** Navigate to the backend to begin the GitHub OAuth flow. */
export function signIn(): void {
    window.location.assign(LOGIN_URL);
}

/**
 * Spread into a `fetch` headers object to attach the bearer token when
 * one is present. Returns an empty object when signed out, so callers
 * can use it unconditionally.
 */
export function authHeader(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Reflect the current auth state into the shared nav control. The single
 * button morphs in place: a plain "Sign in" call-to-action when signed
 * out (opens the method picker), or the user's avatar + name (click to
 * sign out) when signed in.
 */
export function renderAuthControl(): void {
    const btn = document.getElementById("authBtn");
    const avatar = document.getElementById("authAvatar") as HTMLImageElement | null;
    const label = document.getElementById("authLabel");
    const user = getUser();

    if (user) {
        const name = user.name || user.login || "Signed in";
        if (label) label.textContent = name;
        if (avatar) {
            if (user.avatar_url) {
                avatar.src = user.avatar_url;
                avatar.hidden = false;
            } else {
                avatar.hidden = true;
            }
        }
        btn?.setAttribute("title", "Sign out");
        btn?.setAttribute("aria-label", `Signed in as ${name} — click to sign out`);
    } else {
        if (label) label.textContent = "Sign in";
        if (avatar) avatar.hidden = true;
        btn?.setAttribute("title", "Sign in");
        btn?.setAttribute("aria-label", "Sign in");
    }
}

/**
 * One-shot boot for the nav auth control: capture any returning token,
 * wire the nav button (open the sign-in method picker when signed out,
 * sign out when signed in) and the picker's provider buttons, and render
 * the current state. Safe to call on pages that lack the control.
 */
export function initAuthControl(): void {
    captureTokenFromHash();
    const modal = document.getElementById("signInModal") as HTMLDialogElement | null;

    document.getElementById("authBtn")?.addEventListener("click", () => {
        if (isSignedIn()) {
            clearToken();
            renderAuthControl();
        } else if (typeof modal?.showModal === "function") {
            modal.showModal();
        } else {
            // No <dialog> support / no modal on the page: go straight to
            // the only available method.
            signIn();
        }
    });

    document.getElementById("signInGitHubBtn")?.addEventListener("click", () => {
        modal?.close();
        signIn();
    });

    renderAuthControl();
}
