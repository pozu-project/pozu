import { useEffect, useState } from "react";
import { fetchUsers, type AdminUser, type UsersResponse } from "../api.js";
import { RequirePermission } from "../components/RequirePermission.js";
import { hasPermission, usePermissions } from "../permissions.js";
import { RoleEditor } from "./RoleEditor.js";

const PAGE_SIZE = 25;

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
    { key: "avatar", label: "", sortable: false },
    { key: "login", label: "Login", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "first_seen", label: "First seen", sortable: true },
    { key: "last_seen", label: "Last seen", sortable: true },
    { key: "login_count", label: "Logins", sortable: true },
    { key: "roles", label: "Roles", sortable: false },
];

function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function UsersTable() {
    const permissions = usePermissions();
    const canWriteRoles = hasPermission(permissions, "roles:write");

    const [offset, setOffset] = useState(0);
    const [sortColumn, setSortColumn] = useState("last_seen");
    const [descending, setDescending] = useState(true);
    const [data, setData] = useState<UsersResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<AdminUser | null>(null);

    const sort = descending ? `-${sortColumn}` : sortColumn;

    useEffect(() => {
        let cancelled = false;
        setError(null);
        fetchUsers({ limit: PAGE_SIZE, offset, sort })
            .then((response) => {
                if (!cancelled) setData(response);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, [offset, sort]);

    const sortBy = (key: string) => {
        setOffset(0);
        if (key === sortColumn) {
            setDescending((current) => !current);
        } else {
            setSortColumn(key);
            setDescending(false);
        }
    };

    const onRolesSaved = (updated: AdminUser) => {
        setEditing(null);
        setData((current) =>
            current
                ? {
                      ...current,
                      users: current.users.map((user) =>
                          user.github_id === updated.github_id ? updated : user
                      ),
                  }
                : current
        );
    };

    if (error) {
        return (
            <p className="admin-error" role="alert">
                {error}
            </p>
        );
    }
    if (data === null) return <p className="admin-muted">Loading users…</p>;

    const lastPageOffset = Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1) * PAGE_SIZE;

    return (
        <>
            <table className="admin-table">
                <thead>
                    <tr>
                        {COLUMNS.map((column) =>
                            column.sortable ? (
                                <th
                                    scope="col"
                                    key={column.key}
                                    aria-sort={
                                        column.key === sortColumn
                                            ? descending
                                                ? "descending"
                                                : "ascending"
                                            : undefined
                                    }
                                >
                                    <button
                                        className="admin-sort-button"
                                        onClick={() => sortBy(column.key)}
                                    >
                                        {column.label}
                                        {column.key === sortColumn && (descending ? " ↓" : " ↑")}
                                    </button>
                                </th>
                            ) : (
                                <th scope="col" key={column.key}>
                                    {column.label}
                                </th>
                            )
                        )}
                        {canWriteRoles && <th scope="col"></th>}
                    </tr>
                </thead>
                <tbody>
                    {data.users.map((user) => (
                        <tr key={user.github_id}>
                            <td>
                                {user.avatar_url && (
                                    <img className="admin-avatar" src={user.avatar_url} alt="" />
                                )}
                            </td>
                            <th scope="row">{user.login}</th>
                            <td>{user.name ?? "—"}</td>
                            <td>{formatDate(user.first_seen)}</td>
                            <td>{formatDate(user.last_seen)}</td>
                            <td>{user.login_count}</td>
                            <td>
                                {user.roles.map((role) => (
                                    <code className="admin-perm" key={role}>
                                        {role}
                                    </code>
                                ))}
                            </td>
                            {canWriteRoles && (
                                <td>
                                    <button
                                        className="admin-button"
                                        onClick={() => setEditing(user)}
                                    >
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
                    className="admin-button"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                    Previous
                </button>
                <span className="admin-muted">
                    {data.total === 0
                        ? "No users"
                        : `${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total}`}
                </span>
                <button
                    className="admin-button"
                    disabled={offset >= lastPageOffset}
                    onClick={() => setOffset(Math.min(lastPageOffset, offset + PAGE_SIZE))}
                >
                    Next
                </button>
            </div>
            {editing && (
                <RoleEditor
                    user={editing}
                    onClose={() => setEditing(null)}
                    onSaved={onRolesSaved}
                />
            )}
        </>
    );
}

export function UsersPage() {
    return (
        <RequirePermission perm="users:read">
            <h1>Users</h1>
            <p className="admin-muted">Everyone who has signed in to pozu, with their roles.</p>
            <UsersTable />
        </RequirePermission>
    );
}
