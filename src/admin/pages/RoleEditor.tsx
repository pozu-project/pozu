import { useState } from "react";
import { setUserRoles, type User } from "../api.js";

export function RoleEditor({
    user,
    availableRoles,
    onClose,
    onSaved,
}: {
    user: User;
    availableRoles: string[];
    onClose: () => void;
    onSaved: (updated: User) => void;
}): React.JSX.Element {
    const [selected, setSelected] = useState<Set<string>>(new Set(user.roles));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function toggle(role: string): void {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(role)) next.delete(role);
            else next.add(role);
            return next;
        });
    }

    async function save(): Promise<void> {
        setSaving(true);
        setError(null);
        try {
            const updated = await setUserRoles(user.github_id, Array.from(selected));
            onSaved(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="admin-role-editor"
            role="dialog"
            aria-label={`Manage roles for ${user.login}`}
        >
            <h3>Manage roles &mdash; {user.login}</h3>
            <ul className="admin-role-editor-list">
                {availableRoles.map((role) => (
                    <li key={role}>
                        <label>
                            <input
                                type="checkbox"
                                checked={selected.has(role)}
                                onChange={() => toggle(role)}
                            />
                            {role}
                        </label>
                    </li>
                ))}
            </ul>
            {error && (
                <p className="admin-error" role="alert">
                    {error}
                </p>
            )}
            <div className="admin-role-editor-actions">
                <button type="button" onClick={() => void save()} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={onClose} disabled={saving}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
