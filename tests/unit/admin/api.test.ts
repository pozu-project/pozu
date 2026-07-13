import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ADMIN_API_BASE,
    fetchMe,
    fetchRoles,
    fetchUsers,
    setUserRoles,
    UnauthorizedError,
} from "../../../src/admin/api.ts";

/** Build an unsigned (display-only) JWT with the given payload claims. */
function makeToken(payload: Record<string, unknown>): string {
    const enc = (obj: unknown) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

const token = makeToken({ sub: "1", exp: Math.floor(Date.now() / 1000) + 3600 });

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

beforeEach(() => {
    localStorage.setItem("pozu.auth.token", token);
});

afterEach(() => {
    localStorage.clear();
});

describe("fetchMe", () => {
    it("GETs /me with the bearer token and parses the response", async () => {
        const me = { login: "octocat", roles: ["admin"], permissions: ["users:read"] };
        const fetchMock = vi.fn(async () => jsonResponse(me));

        const result = await fetchMe(fetchMock as unknown as typeof fetch);

        expect(result).toEqual(me);
        expect(fetchMock).toHaveBeenCalledWith(`${ADMIN_API_BASE}/me`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        });
    });

    it("throws UnauthorizedError on 401", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 401 }));

        await expect(fetchMe(fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(
            UnauthorizedError
        );
    });
});

describe("fetchUsers", () => {
    it("encodes limit/offset/sort as query parameters", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ users: [], total: 0 }));

        await fetchUsers(
            { limit: 10, offset: 20, sort: "-last_seen" },
            fetchMock as unknown as typeof fetch
        );

        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/users?limit=10&offset=20&sort=-last_seen`,
            expect.objectContaining({ method: "GET" })
        );
    });

    it("omits the sort parameter when not given", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ users: [], total: 0 }));

        await fetchUsers({ limit: 25, offset: 0 }, fetchMock as unknown as typeof fetch);

        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/users?limit=25&offset=0`,
            expect.objectContaining({ method: "GET" })
        );
    });

    it("surfaces server rejections with their detail", async () => {
        const fetchMock = vi.fn(
            async () => new Response("nope", { status: 500, statusText: "Server Error" })
        );

        await expect(
            fetchUsers({ limit: 25, offset: 0 }, fetchMock as unknown as typeof fetch)
        ).rejects.toThrow("Admin API request failed (500 Server Error): nope");
    });
});

describe("fetchRoles", () => {
    it("GETs /roles and parses the response", async () => {
        const roles = { roles: [{ name: "admin", permissions: ["users:read"] }] };
        const fetchMock = vi.fn(async () => jsonResponse(roles));

        const result = await fetchRoles(fetchMock as unknown as typeof fetch);

        expect(result).toEqual(roles);
        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/roles`,
            expect.objectContaining({ method: "GET" })
        );
    });
});

describe("setUserRoles", () => {
    it("PUTs the replacement role set as JSON", async () => {
        const updated = { github_id: 42, login: "octocat", roles: ["curator"] };
        const fetchMock = vi.fn(async () => jsonResponse(updated));

        const result = await setUserRoles(42, ["curator"], fetchMock as unknown as typeof fetch);

        expect(result).toEqual(updated);
        expect(fetchMock).toHaveBeenCalledWith(`${ADMIN_API_BASE}/users/42/roles`, {
            method: "PUT",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ roles: ["curator"] }),
        });
    });

    it("throws UnauthorizedError on 401", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 401 }));

        await expect(
            setUserRoles(42, [], fetchMock as unknown as typeof fetch)
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });
});
