import { Outlet } from "react-router-dom";
import { getClaims, LOGIN_URL } from "../auth.js";
import { Nav } from "./components/Nav.js";
import { PermissionsProvider, usePermissions } from "./permissions.js";

/**
 * Sidebar + routed-page layout, rendered only once a token exists. The
 * authoritative `/me` fetch decides what actually shows: pages while it
 * loads/succeeds, a "not authorized" panel on 401, or a retry hint on
 * network failure.
 */
function Shell() {
    const { error } = usePermissions();

    if (error === "unauthorized") {
        return (
            <div className="admin-panel admin-no-access" role="note">
                <h2>Not authorized</h2>
                <p>
                    You are signed in, but the server did not grant you admin access. Ask a pozu
                    administrator if you believe you should have it.
                </p>
            </div>
        );
    }

    if (error === "error") {
        return (
            <div className="admin-panel" role="alert">
                <h2>Could not load your permissions</h2>
                <p>The admin API could not be reached. Reload the page to try again.</p>
            </div>
        );
    }

    return (
        <div className="admin-layout">
            <Nav />
            <main className="admin-content">
                <Outlet />
            </main>
        </div>
    );
}

/**
 * Top-level guard: with no (or an expired/garbled) token there is nothing
 * to authorize against, so short-circuit to a sign-in prompt that hands
 * off to the backend's OAuth flow. The redirect returns to the main site
 * with `#token=<jwt>`, which `captureTokenFromHash()` picks up.
 */
export function App() {
    if (getClaims() === null) {
        return (
            <div className="admin-panel admin-signin">
                <h1>Pozu Admin</h1>
                <p>Sign in with GitHub to manage users and roles.</p>
                <a className="admin-button" href={LOGIN_URL}>
                    Sign in with GitHub
                </a>
            </div>
        );
    }

    return (
        <PermissionsProvider>
            <Shell />
        </PermissionsProvider>
    );
}
