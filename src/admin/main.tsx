import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { captureTokenFromHash } from "../auth.js";
import { PermissionsProvider } from "./permissions.js";
import { App } from "./App.js";
import { UsersPage } from "./pages/UsersPage.js";
import { RolesPage } from "./pages/RolesPage.js";
import "../styles.css";
import "./admin.css";

captureTokenFromHash();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
    <StrictMode>
        <BrowserRouter>
            <PermissionsProvider>
                <Routes>
                    <Route path="/admin" element={<App />}>
                        <Route index element={<Navigate to="users" replace />} />
                        <Route path="users" element={<UsersPage />} />
                        <Route path="roles" element={<RolesPage />} />
                    </Route>
                </Routes>
            </PermissionsProvider>
        </BrowserRouter>
    </StrictMode>
);
