import { useEffect, useState } from "react";
import { fetchRoles, setUserRoles, type AdminUser, type Role } from "../api.js";

/**
 * Minimal role-assignment editor for one user: a checkbox per known role,
 * saved as the complete replacement set via `PUT …/users/{id}/roles`.
 */
export function RoleEditor({
    user,
    onClose,
    onSaved,
}: {
    user: AdminUser;
    onClose: () => void;
    /** Receives the updated user echoed back by the backend. */
    onSaved: (updated: AdminUser) => void;
}) {
    const [allRoles, setAllRoles] = useState<Role[] | null>(null);
    const [selected, setSelected] = useState<string[]>(user.roles);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRoles()
            .then((response) => {
                if (!cancelled) setAllRoles(response.roles);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const toggle = (name: string) => {
        setSelected((current) =>
            current.includes(name) ? current.filter((role) => role !== name) : [...current, name]
        );
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const updated = await setUserRoles(user.github_id, selected);
            onSaved(updated);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            setSaving(false);
        }
    };

    return (
        <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
            <div
                className="admin-panel admin-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Manage roles for ${user.login}`}
                onClick={(event) => event.stopPropagation()}
            >
                <h2>Roles for @{user.login}</h2>
                {allRoles === null && !error && <p className="admin-muted">Loading roles…</p>}
                {allRoles?.map((role) => (
                    <label className="admin-checkbox" key={role.name}>
                        <input
                            type="checkbox"
                            checked={selected.includes(role.name)}
                            onChange={() => toggle(role.name)}
                        />
                        {role.name}
                    </label>
                ))}
                {error && (
                    <p className="admin-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="admin-modal-actions">
                    <button className="admin-button" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        className="admin-button admin-button-primary"
                        onClick={save}
                        disabled={saving || allRoles === null}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
