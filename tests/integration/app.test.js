import { test, expect } from "@playwright/test";

test.describe("Pose Zoo labeling page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
    });

    test("renders the header and subtitle", async ({ page }) => {
        await expect(page.locator("h1")).toContainText("Pose Zoo");
        await expect(page.locator(".subtitle")).toContainText("sleap-io.js");
    });

    test("shows the three primary controls", async ({ page }) => {
        for (const id of ["#newFrameBtn", "#resetBtn", "#downloadBtn"]) {
            await expect(page.locator(id)).toBeVisible();
        }
    });

    test("renders one palette entry per label definition", async ({ page }) => {
        await expect(page.locator(".label-item")).toHaveCount(6);
        await expect(page.locator('.label-item[data-label-id="nose"]')).toBeVisible();
        await expect(page.locator('.label-item[data-label-id="tail_base"]')).toBeVisible();
    });

    test("selecting a label highlights it as active", async ({ page }) => {
        // First item starts active by default.
        await expect(page.locator('.label-item[data-label-id="left_front_paw"]')).toHaveClass(
            /active/
        );
        await page.locator('.label-item[data-label-id="nose"]').click();
        await expect(page.locator('.label-item[data-label-id="nose"]')).toHaveClass(/active/);
        await expect(page.locator('.label-item[data-label-id="left_front_paw"]')).not.toHaveClass(
            /active/
        );
    });

    test("JSON preview reflects the canonical six-label schema", async ({ page }) => {
        const text = await page.locator("#jsonOutput").textContent();
        expect(text).toBeTruthy();
        const json = JSON.parse(text);
        expect(json.labels.map((l) => l.id)).toEqual([
            "left_front_paw",
            "right_front_paw",
            "left_hind_paw",
            "right_hind_paw",
            "nose",
            "tail_base",
        ]);
    });
});
