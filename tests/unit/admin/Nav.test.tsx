import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../../../src/admin/components/Nav.tsx";
import { PermissionsProvider } from "../../../src/admin/permissions.tsx";
import * as api from "../../../src/admin/api.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function renderNav(permissions: string[]) {
    vi.spyOn(api, "fetchMe").mockResolvedValue({
        sub: "1",
        login: "octocat",
        roles: [],
        permissions,
    });

    return render(
        <MemoryRouter>
            <PermissionsProvider>
                <Nav />
            </PermissionsProvider>
        </MemoryRouter>
    );
}

describe("Nav", () => {
    it("shows only links the user has permission for", async () => {
        renderNav(["users:read"]);

        await waitFor(() => {
            expect(screen.getByText("Users")).toBeInTheDocument();
        });
        expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    });

    it("shows all links when the user has every permission", async () => {
        renderNav(["users:read", "roles:read"]);

        await waitFor(() => {
            expect(screen.getByText("Users")).toBeInTheDocument();
            expect(screen.getByText("Roles")).toBeInTheDocument();
        });
    });

    it("shows no links while permissions are still loading", () => {
        vi.spyOn(api, "fetchMe").mockReturnValue(new Promise(() => {}));

        render(
            <MemoryRouter>
                <PermissionsProvider>
                    <Nav />
                </PermissionsProvider>
            </MemoryRouter>
        );

        expect(screen.queryByText("Users")).not.toBeInTheDocument();
        expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    });
});
