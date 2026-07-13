import { Outlet } from "react-router-dom";
import { getClaims, LOGIN_URL } from "../auth.js";
import { usePermissions } from "./permissions.js";
import { Nav } from "./components/Nav.js";

function LoginPrompt(): React.JSX.Element {
    return (
        <div className="admin-gate">
            <p>Sign in with GitHub to access the admin console.</p>
            <a className="admin-gate-link" href={LOGIN_URL}>
                Sign in with GitHub
            </a>
        </div>
    );
}

function NotAuthorized(): React.JSX.Element {
    return (
        <div className="admin-gate" role="alert">
            <p>You&rsquo;re not authorized to access the admin console.</p>
        </div>
    );
}

/** Top-level guard: no token → login prompt; `/me` 401 → not authorized. */
export function App(): React.JSX.Element {
    const { loading, unauthorized, error } = usePermissions();

    if (!getClaims()) return <LoginPrompt />;
    if (loading) return <div className="admin-gate">Loading&hellip;</div>;
    if (unauthorized) return <NotAuthorized />;
    if (error) return <div className="admin-gate">Failed to load admin console: {error}</div>;

    return (
        <div className="admin-shell">
            <Nav />
            <main className="admin-content">
                <Outlet />
            </main>
        </div>
    );
}
