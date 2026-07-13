import { useEffect, useState } from "react";
import { RequirePermission } from "../components/RequirePermission.js";
import { fetchRoles, type Role } from "../api.js";

function RolesList(): React.JSX.Element {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchRoles()
            .then((res) => setRoles(res.roles))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <p>Loading roles&hellip;</p>;
    if (error)
        return (
            <p className="admin-error" role="alert">
                {error}
            </p>
        );

    return (
        <div className="admin-roles-page">
            <h1>Roles</h1>
            <ul className="admin-roles-list">
                {roles.map((role) => (
                    <li key={role.name}>
                        <h2>{role.name}</h2>
                        <p>{role.permissions.join(", ")}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function RolesPage(): React.JSX.Element {
    return (
        <RequirePermission perm="roles:read">
            <RolesList />
        </RequirePermission>
    );
}
