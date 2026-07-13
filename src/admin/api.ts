import { authHeader, BACKEND_BASE, clearToken, notifyAuthChange } from "../auth.js";

export const ADMIN_API_BASE = `${BACKEND_BASE}/api/v1/admin`;

export interface Me {
    sub: string;
    login: string;
    name?: string;
    avatar_url?: string;
    roles: string[];
    permissions: string[];
}

export interface User {
    github_id: string;
    login: string;
    name?: string;
    avatar_url?: string;
    first_seen: string;
    last_seen: string;
    login_count: number;
    roles: string[];
}

export interface UsersResponse {
    users: User[];
    total: number;
    limit: number;
    offset: number;
}

export interface Role {
    name: string;
    permissions: string[];
}

export interface RolesResponse {
    roles: Role[];
}

export interface FetchUsersParams {
    limit?: number;
    offset?: number;
    sort?: string;
}

/** Raised when the admin API responds 401 — the caller should render "not authorized". */
export class UnauthorizedError extends Error {
    constructor() {
        super("Your session has expired — please sign in with GitHub again.");
        this.name = "UnauthorizedError";
    }
}

async function adminFetch(
    path: string,
    init: RequestInit = {},
    fetchImpl: typeof fetch = fetch
): Promise<Response> {
    const response = await fetchImpl(`${ADMIN_API_BASE}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            ...authHeader(),
            ...init.headers,
        },
    });

    if (response.status === 401) {
        clearToken();
        notifyAuthChange();
        throw new UnauthorizedError();
    }

    if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
            detail
                ? `Admin API request failed (${response.status} ${response.statusText}): ${detail}`
                : `Admin API request failed (${response.status} ${response.statusText}).`
        );
    }

    return response;
}

export async function fetchMe(fetchImpl: typeof fetch = fetch): Promise<Me> {
    const response = await adminFetch("/me", {}, fetchImpl);
    return (await response.json()) as Me;
}

export async function fetchUsers(
    params: FetchUsersParams = {},
    fetchImpl: typeof fetch = fetch
): Promise<UsersResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.sort !== undefined) query.set("sort", params.sort);
    const qs = query.toString();

    const response = await adminFetch(`/users${qs ? `?${qs}` : ""}`, {}, fetchImpl);
    return (await response.json()) as UsersResponse;
}

export async function fetchRoles(fetchImpl: typeof fetch = fetch): Promise<RolesResponse> {
    const response = await adminFetch("/roles", {}, fetchImpl);
    return (await response.json()) as RolesResponse;
}

export async function setUserRoles(
    githubId: string,
    roles: string[],
    fetchImpl: typeof fetch = fetch
): Promise<User> {
    const response = await adminFetch(
        `/users/${encodeURIComponent(githubId)}/roles`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles }),
        },
        fetchImpl
    );
    return (await response.json()) as User;
}
