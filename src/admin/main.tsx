import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { captureTokenFromHash } from "../auth.js";
import { App } from "./App.js";
import { RolesPage } from "./pages/RolesPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import "./admin.css";

// Must run before the router touches the hash: the backend's post-OAuth
// redirect lands with `#token=<jwt>`, which this lifts into storage and
// scrubs from the URL.
captureTokenFromHash();

// Hash-based routing because the site deploys to static hosting (GitHub
// Pages) with no rewrite rules: `admin.html#/admin/users` survives a
// reload, `admin/users` as a real path would 404.
const router = createHashRouter([
    {
        element: <App />,
        children: [
            { path: "/", element: <Navigate to="/admin/users" replace /> },
            { path: "/admin", element: <Navigate to="/admin/users" replace /> },
            { path: "/admin/users", element: <UsersPage /> },
            { path: "/admin/roles", element: <RolesPage /> },
            { path: "*", element: <Navigate to="/admin/users" replace /> },
        ],
    },
]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>
);
