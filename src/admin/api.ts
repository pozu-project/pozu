/**
 * Typed client for the pozu-backend admin API, mirroring the fetch /
 * header / base-URL conventions of `box-api.ts` and `label-api.ts`.
 * Every call replays the OAuth JWT as `Authorization: Bearer <token>`;
 * authorization decisions are always the backend's.
 */

import { authHeader } from "../auth.js";

export const ADMIN_API_BASE = "https://pozu-codycbakerphd.pythonanywhere.com/api/v1/admin";

/** Authoritative identity + permissions, from `GET /api/v1/admin/me`. */
export interface AdminMe {
    login: string;
    roles: string[];
    permissions: string[];
}

export interface AdminUser {
    /** GitHub numeric user id. */
    github_id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    /** ISO-8601 timestamps. */
    first_seen: string;
    last_seen: string;
    login_count: number;
    roles: string[];
}

export interface UsersResponse {
    users: AdminUser[];
    /** Total row count across all pages, for pagination controls. */
    total: number;
}

export interface Role {
    name: string;
    description?: string;
    permissions: string[];
}

export interface RolesResponse {
    roles: Role[];
}

export interface FetchUsersParams {
    limit: number;
    offset: number;
    /** Column name, prefixed with `-` for descending (e.g. `-last_seen`). */
    sort?: string;
}

/**
 * The backend rejected the token (expired, revoked, or the user simply
 * has no admin standing). Surfaced as a distinct type so pages can render
 * a "not authorized" panel instead of a generic failure.
 */
export class UnauthorizedError extends Error {
    constructor() {
        super("Not authorized");
        this.name = "UnauthorizedError";
    }
}

/** Shared GET/PUT plumbing: bearer auth, JSON, and centralized 401 handling. */
async function request<T>(path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
    const response = await fetchImpl(`${ADMIN_API_BASE}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            ...authHeader(),
            ...(init.headers ?? {}),
        },
    });

    if (response.status === 401) throw new UnauthorizedError();

    if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
            detail
                ? `Admin API request failed (${response.status} ${response.statusText}): ${detail}`
                : `Admin API request failed (${response.status} ${response.statusText}).`
        );
    }

    return (await response.json()) as T;
}

export async function fetchMe(fetchImpl: typeof fetch = fetch): Promise<AdminMe> {
    return request<AdminMe>("/me", { method: "GET" }, fetchImpl);
}

export async function fetchUsers(
    { limit, offset, sort }: FetchUsersParams,
    fetchImpl: typeof fetch = fetch
): Promise<UsersResponse> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (sort) params.set("sort", sort);
    return request<UsersResponse>(`/users?${params.toString()}`, { method: "GET" }, fetchImpl);
}

export async function fetchRoles(fetchImpl: typeof fetch = fetch): Promise<RolesResponse> {
    return request<RolesResponse>("/roles", { method: "GET" }, fetchImpl);
}

export async function setUserRoles(
    githubId: number,
    roles: string[],
    fetchImpl: typeof fetch = fetch
): Promise<AdminUser> {
    return request<AdminUser>(
        `/users/${githubId}/roles`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles }),
        },
        fetchImpl
    );
}
