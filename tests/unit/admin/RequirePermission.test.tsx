import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RequirePermission } from "../../../src/admin/components/RequirePermission.tsx";
import { PermissionsProvider } from "../../../src/admin/permissions.tsx";
import * as api from "../../../src/admin/api.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function renderWithPermissions(perm: string, granted: string[]) {
    vi.spyOn(api, "fetchMe").mockResolvedValue({
        sub: "1",
        login: "octocat",
        roles: [],
        permissions: granted,
    });

    return render(
        <PermissionsProvider>
            <RequirePermission perm={perm}>
                <p>secret content</p>
            </RequirePermission>
        </PermissionsProvider>
    );
}

describe("RequirePermission", () => {
    it("renders children when the permission is present", async () => {
        renderWithPermissions("users:read", ["users:read"]);

        expect(await screen.findByText("secret content")).toBeInTheDocument();
    });

    it("renders the fallback when the permission is absent", async () => {
        renderWithPermissions("users:read", ["roles:read"]);

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent("You don’t have access");
        });
        expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    });
});
