import { NavLink } from "react-router-dom";
import { hasPermission, usePermissions } from "../permissions.js";

/**
 * Every admin page registers here with the permission that gates it; the
 * sidebar only renders links the signed-in user can actually open.
 */
const NAV_ITEMS: { to: string; label: string; perm: string }[] = [
    { to: "/admin/users", label: "Users", perm: "users:read" },
    { to: "/admin/roles", label: "Roles", perm: "roles:read" },
];

export function Nav() {
    const state = usePermissions();
    const visible = NAV_ITEMS.filter((item) => hasPermission(state, item.perm));

    return (
        <nav className="admin-sidebar" aria-label="Admin">
            <div className="admin-sidebar-title">Pozu Admin</div>
            {state.login && <div className="admin-sidebar-user">@{state.login}</div>}
            <ul className="admin-sidebar-links">
                {visible.map((item) => (
                    <li key={item.to}>
                        <NavLink
                            to={item.to}
                            className={({ isActive }) =>
                                isActive ? "admin-nav-link admin-nav-link-active" : "admin-nav-link"
                            }
                        >
                            {item.label}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
