import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Nav } from "../../../src/admin/components/Nav.tsx";
import { PermissionsProvider } from "../../../src/admin/permissions.tsx";
import type { fetchMe } from "../../../src/admin/api.ts";

const grants =
    (permissions: string[]): typeof fetchMe =>
    async () => ({ login: "octocat", roles: ["tester"], permissions });

function renderNav(permissions: string[]) {
    return render(
        <MemoryRouter initialEntries={["/admin/users"]}>
            <PermissionsProvider fetchMeImpl={grants(permissions)}>
                <Nav />
            </PermissionsProvider>
        </MemoryRouter>
    );
}

describe("Nav", () => {
    it("shows a link for every page the user can access", async () => {
        renderNav(["users:read", "roles:read"]);

        expect(await screen.findByRole("link", { name: "Users" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Roles" })).toBeDefined();
    });

    it("hides links to pages the user lacks permission for", async () => {
        renderNav(["users:read"]);

        expect(await screen.findByRole("link", { name: "Users" })).toBeDefined();
        expect(screen.queryByRole("link", { name: "Roles" })).toBeNull();
    });

    it("shows no page links while permissions are loading or denied", () => {
        renderNav([]);

        expect(screen.queryByRole("link")).toBeNull();
    });
});
