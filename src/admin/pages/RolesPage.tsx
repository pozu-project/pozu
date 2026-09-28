import { useEffect, useState } from "react";
import { fetchRoles, type Role } from "../api.js";
import { RequirePermission } from "../components/RequirePermission.js";

function RolesList() {
    const [roles, setRoles] = useState<Role[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRoles()
            .then((response) => {
                if (!cancelled) setRoles(response.roles);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (error) {
        return (
            <p className="admin-error" role="alert">
                {error}
            </p>
        );
    }
    if (roles === null) return <p className="admin-muted">Loading roles…</p>;

    return (
        <table className="admin-table">
            <thead>
                <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Permissions</th>
                </tr>
            </thead>
            <tbody>
                {roles.map((role) => (
                    <tr key={role.name}>
                        <th scope="row">
                            {role.name}
                            {role.description && (
                                <div className="admin-muted">{role.description}</div>
                            )}
                        </th>
                        <td>
                            {role.permissions.map((perm) => (
                                <code className="admin-perm" key={perm}>
                                    {perm}
                                </code>
                            ))}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function RolesPage() {
    return (
        <RequirePermission perm="roles:read">
            <h1>Roles</h1>
            <p className="admin-muted">
                Roles and the permissions they grant. Assign them per user from the Users page.
            </p>
            <RolesList />
        </RequirePermission>
    );
}
