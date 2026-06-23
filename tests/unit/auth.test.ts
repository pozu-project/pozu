import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    authHeader,
    captureTokenFromHash,
    clearToken,
    getToken,
    getUser,
    isSignedIn,
} from "../../src/auth.ts";

/** Build an unsigned (display-only) JWT with the given payload claims. */
function makeToken(payload: Record<string, unknown>): string {
    const enc = (obj: unknown) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
});

afterEach(() => {
    localStorage.clear();
    window.location.hash = "";
});

describe("captureTokenFromHash", () => {
    it("lifts the token out of the URL fragment and scrubs it", () => {
        const token = makeToken({ sub: "1", exp: nowSeconds() + 3600 });
        window.location.hash = `#token=${token}`;

        captureTokenFromHash();

        expect(getToken()).toBe(token);
        expect(window.location.hash).toBe("");
    });

    it("ignores a fragment with no token", () => {
        window.location.hash = "#focus";

        captureTokenFromHash();

        expect(getToken()).toBeNull();
        expect(window.location.hash).toBe("#focus");
    });
});

describe("getToken", () => {
    it("returns a valid, unexpired token", () => {
        const token = makeToken({ sub: "1", exp: nowSeconds() + 3600 });
        localStorage.setItem("pozu.auth.token", token);

        expect(getToken()).toBe(token);
        expect(isSignedIn()).toBe(true);
    });

    it("drops and reports an expired token", () => {
        const token = makeToken({ sub: "1", exp: nowSeconds() - 1 });
        localStorage.setItem("pozu.auth.token", token);

        expect(getToken()).toBeNull();
        expect(isSignedIn()).toBe(false);
        expect(localStorage.getItem("pozu.auth.token")).toBeNull();
    });
});

describe("getUser", () => {
    it("exposes the identity claims for display", () => {
        const token = makeToken({
            sub: "42",
            login: "octocat",
            name: "The Octocat",
            avatar_url: "https://example.com/a.png",
            exp: nowSeconds() + 3600,
        });
        localStorage.setItem("pozu.auth.token", token);

        expect(getUser()).toMatchObject({
            sub: "42",
            login: "octocat",
            name: "The Octocat",
            avatar_url: "https://example.com/a.png",
        });
    });
});

describe("authHeader", () => {
    it("attaches a bearer header when signed in", () => {
        const token = makeToken({ sub: "1", exp: nowSeconds() + 3600 });
        localStorage.setItem("pozu.auth.token", token);

        expect(authHeader()).toEqual({ Authorization: `Bearer ${token}` });
    });

    it("returns an empty object when signed out", () => {
        expect(authHeader()).toEqual({});
        clearToken();
        expect(authHeader()).toEqual({});
    });
});
