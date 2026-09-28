import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequirePermission } from "../../../src/admin/components/RequirePermission.tsx";
import { PermissionsProvider } from "../../../src/admin/permissions.tsx";
import { UnauthorizedError, type fetchMe } from "../../../src/admin/api.ts";

/** Stub for the provider's `/me` load, mirroring the API's fetchImpl injection. */
const grants =
    (permissions: string[]): typeof fetchMe =>
    async () => ({ login: "octocat", roles: ["tester"], permissions });

describe("RequirePermission", () => {
    it("renders children when the permission is present", async () => {
        render(
            <PermissionsProvider fetchMeImpl={grants(["users:read"])}>
                <RequirePermission perm="users:read">
                    <p>secret user table</p>
                </RequirePermission>
            </PermissionsProvider>
        );

        expect(await screen.findByText("secret user table")).toBeDefined();
        expect(screen.queryByText(/don't have access/i)).toBeNull();
    });

    it("renders the no-access panel when the permission is absent", async () => {
        render(
            <PermissionsProvider fetchMeImpl={grants(["roles:read"])}>
                <RequirePermission perm="users:read">
                    <p>secret user table</p>
                </RequirePermission>
            </PermissionsProvider>
        );

        expect(await screen.findByText(/don't have access/i)).toBeDefined();
        expect(screen.queryByText("secret user table")).toBeNull();
    });

    it("renders the no-access panel when /me is unauthorized", async () => {
        const rejected: typeof fetchMe = async () => {
            throw new UnauthorizedError();
        };
        render(
            <PermissionsProvider fetchMeImpl={rejected}>
                <RequirePermission perm="users:read">
                    <p>secret user table</p>
                </RequirePermission>
            </PermissionsProvider>
        );

        expect(await screen.findByText(/don't have access/i)).toBeDefined();
        expect(screen.queryByText("secret user table")).toBeNull();
    });
});
