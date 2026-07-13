import { NavLink } from "react-router-dom";
import { usePermissions } from "../permissions.js";

export interface NavLinkDef {
    to: string;
    label: string;
    perm: string;
}

export const NAV_LINKS: NavLinkDef[] = [
    { to: "/admin/users", label: "Users", perm: "users:read" },
    { to: "/admin/roles", label: "Roles", perm: "roles:read" },
];

/** Sidebar nav that only shows links the signed-in user can actually reach. */
export function Nav(): React.JSX.Element {
    const { permissions } = usePermissions();
    const visible = NAV_LINKS.filter((link) => permissions.includes(link.perm));

    return (
        <nav className="admin-nav" aria-label="Admin sections">
            <ul>
                {visible.map((link) => (
                    <li key={link.to}>
                        <NavLink
                            to={link.to}
                            className={({ isActive }) => (isActive ? "active" : "")}
                        >
                            {link.label}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
