import type { ReactNode } from "react";
import { useHasPermission } from "../permissions.js";

export function NoAccessPanel({ perm }: { perm: string }): React.JSX.Element {
    return (
        <div className="admin-no-access" role="alert">
            <p>You don&rsquo;t have access to this page.</p>
            <p className="admin-no-access-detail">Requires the &ldquo;{perm}&rdquo; permission.</p>
        </div>
    );
}

/** Renders `children` only when the current user holds `perm`, else a compact fallback panel. */
export function RequirePermission({
    perm,
    children,
}: {
    perm: string;
    children: ReactNode;
}): React.JSX.Element {
    const allowed = useHasPermission(perm);
    if (!allowed) return <NoAccessPanel perm={perm} />;
    return <>{children}</>;
}
