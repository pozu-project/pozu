import { useCallback, useEffect, useState } from "react";
import { RequirePermission } from "../components/RequirePermission.js";
import { useHasPermission } from "../permissions.js";
import { fetchRoles, fetchUsers, type Role, type User } from "../api.js";
import { RoleEditor } from "./RoleEditor.js";

const PAGE_SIZE = 20;

type SortKey = "login" | "first_seen" | "last_seen" | "login_count";

function UsersTable(): React.JSX.Element {
    const canManageRoles = useHasPermission("roles:write");

    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [sort, setSort] = useState<SortKey>("login");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);
    const [editing, setEditing] = useState<User | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchUsers({ limit: PAGE_SIZE, offset, sort })
            .then((res) => {
                setUsers(res.users);
                setTotal(res.total);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, [offset, sort]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!canManageRoles) return;
        fetchRoles()
            .then((res) => setRoles(res.roles))
            .catch(() => setRoles([]));
    }, [canManageRoles]);

    if (loading) return <p>Loading users&hellip;</p>;
    if (error)
        return (
            <p className="admin-error" role="alert">
                {error}
            </p>
        );

    return (
        <div className="admin-users-page">
            <h1>Users</h1>
            <table className="admin-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>
                            <button type="button" onClick={() => setSort("login")}>
                                Login
                            </button>
                        </th>
                        <th>Name</th>
                        <th>
                            <button type="button" onClick={() => setSort("first_seen")}>
                                First seen
                            </button>
                        </th>
                        <th>
                            <button type="button" onClick={() => setSort("last_seen")}>
                                Last seen
                            </button>
                        </th>
                        <th>
                            <button type="button" onClick={() => setSort("login_count")}>
                                Login count
                            </button>
                        </th>
                        <th>Roles</th>
                        {canManageRoles && <th></th>}
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.github_id}>
                            <td>
                                {user.avatar_url && (
                                    <img className="admin-avatar" src={user.avatar_url} alt="" />
                                )}
                            </td>
                            <td>{user.login}</td>
                            <td>{user.name ?? ""}</td>
                            <td>{user.first_seen}</td>
                            <td>{user.last_seen}</td>
                            <td>{user.login_count}</td>
                            <td>{user.roles.join(", ")}</td>
                            {canManageRoles && (
                                <td>
                                    <button type="button" onClick={() => setEditing(user)}>
                                        Manage roles
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="admin-pagination">
                <button
                    type="button"
                    onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    disabled={offset === 0}
                >
                    Previous
                </button>
                <span>
                    {Math.min(offset + 1, total)}&ndash;{Math.min(offset + PAGE_SIZE, total)} of{" "}
                    {total}
                </span>
                <button
                    type="button"
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total}
                >
                    Next
                </button>
            </div>

            {editing && (
                <RoleEditor
                    user={editing}
                    availableRoles={roles.map((r) => r.name)}
                    onClose={() => setEditing(null)}
                    onSaved={(updated) => {
                        setUsers((prev) =>
                            prev.map((u) => (u.github_id === updated.github_id ? updated : u))
                        );
                        setEditing(null);
                    }}
                />
            )}
        </div>
    );
}

export function UsersPage(): React.JSX.Element {
    return (
        <RequirePermission perm="users:read">
            <UsersTable />
        </RequirePermission>
    );
}
