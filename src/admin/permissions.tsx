import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, UnauthorizedError, type Me } from "./api.js";

export interface PermissionsState {
    login: string | null;
    roles: string[];
    permissions: string[];
    loading: boolean;
    /** Set when `/me` failed with something other than 401 (network error, 5xx, ...). */
    error: string | null;
    /** Set when `/me` responded 401 — the caller has no valid session. */
    unauthorized: boolean;
}

const PermissionsContext = createContext<PermissionsState | null>(null);

/**
 * Loads `/api/v1/admin/me` once on mount and exposes the authoritative
 * permission set for the signed-in user. JWT claims are stale UI hints
 * only; this is the source of truth every gated page relies on.
 */
export function PermissionsProvider({ children }: { children: ReactNode }): React.JSX.Element {
    const [state, setState] = useState<PermissionsState>({
        login: null,
        roles: [],
        permissions: [],
        loading: true,
        error: null,
        unauthorized: false,
    });

    useEffect(() => {
        let cancelled = false;

        fetchMe()
            .then((me: Me) => {
                if (cancelled) return;
                setState({
                    login: me.login,
                    roles: me.roles ?? [],
                    permissions: me.permissions ?? [],
                    loading: false,
                    error: null,
                    unauthorized: false,
                });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                if (err instanceof UnauthorizedError) {
                    setState({
                        login: null,
                        roles: [],
                        permissions: [],
                        loading: false,
                        error: null,
                        unauthorized: true,
                    });
                    return;
                }
                setState({
                    login: null,
                    roles: [],
                    permissions: [],
                    loading: false,
                    error: err instanceof Error ? err.message : String(err),
                    unauthorized: false,
                });
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return <PermissionsContext.Provider value={state}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsState {
    const ctx = useContext(PermissionsContext);
    if (!ctx) throw new Error("usePermissions must be used within a PermissionsProvider");
    return ctx;
}

export function useHasPermission(perm: string): boolean {
    const { permissions } = usePermissions();
    return useMemo(() => permissions.includes(perm), [permissions, perm]);
}
