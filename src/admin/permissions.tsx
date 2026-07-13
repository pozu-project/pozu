/**
 * Authoritative permission state for the admin SPA.
 *
 * The JWT's `roles` / `permissions` claims are minted at sign-in and go
 * stale the moment an admin edits a role, so they are never used for
 * gating. Instead the provider fetches `GET /api/v1/admin/me` once on
 * mount and every gate (`usePermissions`, `<RequirePermission>`, the nav)
 * reads from that single load. A 401 collapses to "no access".
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchMe, UnauthorizedError } from "./api.js";

export interface PermissionsState {
    /** GitHub login confirmed by the backend, or null before load / on failure. */
    login: string | null;
    roles: string[];
    permissions: string[];
    loading: boolean;
    /** "unauthorized" for a 401, "error" for anything else, null when healthy. */
    error: "unauthorized" | "error" | null;
}

const INITIAL_STATE: PermissionsState = {
    login: null,
    roles: [],
    permissions: [],
    loading: true,
    error: null,
};

const PermissionsContext = createContext<PermissionsState>(INITIAL_STATE);

export function PermissionsProvider({
    children,
    fetchMeImpl = fetchMe,
}: {
    children: ReactNode;
    /** Injectable for tests, mirroring the `fetchImpl` pattern of the API modules. */
    fetchMeImpl?: typeof fetchMe;
}) {
    const [state, setState] = useState<PermissionsState>(INITIAL_STATE);

    useEffect(() => {
        let cancelled = false;
        fetchMeImpl()
            .then((me) => {
                if (cancelled) return;
                setState({
                    login: me.login,
                    roles: me.roles,
                    permissions: me.permissions,
                    loading: false,
                    error: null,
                });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setState({
                    ...INITIAL_STATE,
                    loading: false,
                    error: err instanceof UnauthorizedError ? "unauthorized" : "error",
                });
            });
        return () => {
            cancelled = true;
        };
    }, [fetchMeImpl]);

    return <PermissionsContext.Provider value={state}>{children}</PermissionsContext.Provider>;
}

/** The backend-confirmed permission state loaded by `PermissionsProvider`. */
export function usePermissions(): PermissionsState {
    return useContext(PermissionsContext);
}

/** True once loading has finished and the backend granted `perm`. */
export function hasPermission(state: PermissionsState, perm: string): boolean {
    return !state.loading && state.error === null && state.permissions.includes(perm);
}
