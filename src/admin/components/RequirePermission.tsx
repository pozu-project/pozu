import type { ReactNode } from "react";
import { hasPermission, usePermissions } from "../permissions.js";

/**
 * Renders its children only when the backend-confirmed permissions include
 * `perm`; otherwise a compact "no access" panel. Every permission-gated
 * page (and any gated fragment within one) wraps itself in this.
 */
export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
    const state = usePermissions();

    if (state.loading) {
        return <p className="admin-muted">Checking access…</p>;
    }

    if (!hasPermission(state, perm)) {
        return (
            <div className="admin-panel admin-no-access" role="note">
                <h2>You don't have access</h2>
                <p>
                    This page requires the <code>{perm}</code> permission. Ask a pozu administrator
                    if you believe you should have it.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
