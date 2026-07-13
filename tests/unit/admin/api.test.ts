import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ADMIN_API_BASE,
    fetchMe,
    fetchRoles,
    fetchUsers,
    setUserRoles,
    UnauthorizedError,
} from "../../../src/admin/api.ts";

const TOKEN = "header.eyJleHAiOjk5OTk5OTk5OTl9.sig";

function withToken<T>(fn: () => T): T {
    localStorage.setItem("pozu.auth.token", TOKEN);
    try {
        return fn();
    } finally {
        localStorage.removeItem("pozu.auth.token");
    }
}

describe("fetchMe", () => {
    afterEach(() => localStorage.clear());

    it("sends the bearer token and returns the parsed response", async () => {
        const me = {
            sub: "1",
            login: "octocat",
            roles: ["admin"],
            permissions: ["users:read"],
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(me), { status: 200 }));

        const result = await withToken(() => fetchMe(fetchMock as unknown as typeof fetch));

        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/me`,
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
            })
        );
        expect(result).toEqual(me);
    });

    it("throws UnauthorizedError and clears the token on 401", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 401 }));

        await withToken(() =>
            expect(fetchMe(fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(
                UnauthorizedError
            )
        );
        expect(localStorage.getItem("pozu.auth.token")).toBeNull();
    });
});

describe("fetchUsers", () => {
    afterEach(() => localStorage.clear());

    it("encodes limit/offset/sort as query params", async () => {
        const body = { users: [], total: 0, limit: 20, offset: 0 };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

        await withToken(() =>
            fetchUsers(
                { limit: 20, offset: 40, sort: "login" },
                fetchMock as unknown as typeof fetch
            )
        );

        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/users?limit=20&offset=40&sort=login`,
            expect.anything()
        );
    });

    it("parses the users response", async () => {
        const body = {
            users: [
                {
                    github_id: "1",
                    login: "octocat",
                    first_seen: "x",
                    last_seen: "y",
                    login_count: 3,
                    roles: [],
                },
            ],
            total: 1,
            limit: 20,
            offset: 0,
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

        const result = await withToken(() => fetchUsers({}, fetchMock as unknown as typeof fetch));

        expect(result).toEqual(body);
    });
});

describe("fetchRoles", () => {
    afterEach(() => localStorage.clear());

    it("returns the roles list", async () => {
        const body = { roles: [{ name: "admin", permissions: ["users:read"] }] };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

        const result = await withToken(() => fetchRoles(fetchMock as unknown as typeof fetch));

        expect(fetchMock).toHaveBeenCalledWith(`${ADMIN_API_BASE}/roles`, expect.anything());
        expect(result).toEqual(body);
    });
});

describe("setUserRoles", () => {
    afterEach(() => localStorage.clear());

    it("PUTs the new roles and returns the updated user", async () => {
        const updated = {
            github_id: "1",
            login: "octocat",
            first_seen: "x",
            last_seen: "y",
            login_count: 3,
            roles: ["admin"],
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(updated), { status: 200 }));

        const result = await withToken(() =>
            setUserRoles("1", ["admin"], fetchMock as unknown as typeof fetch)
        );

        expect(fetchMock).toHaveBeenCalledWith(
            `${ADMIN_API_BASE}/users/1/roles`,
            expect.objectContaining({
                method: "PUT",
                headers: expect.objectContaining({ "Content-Type": "application/json" }),
                body: JSON.stringify({ roles: ["admin"] }),
            })
        );
        expect(result).toEqual(updated);
    });
});
