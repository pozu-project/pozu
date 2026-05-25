import { test, expect } from "@playwright/test";

test.describe("Pozu labeling page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
    });

    test("renders top nav title and page credit", async ({ page }) => {
        await expect(page.locator(".top-nav-brand")).toContainText("Pozu");
        await expect(page.locator(".top-nav-brand")).not.toContainText("🦓");
        await expect(page.locator(".page-credit")).toContainText("sleap-io.js");
    });

    test("shows the three primary controls", async ({ page }) => {
        for (const id of ["#newFrameBtn", "#resetBtn", "#downloadBtn"]) {
            await expect(page.locator(id)).toBeVisible();
        }
        await expect(page.locator("#downloadBtn")).toContainText("Download .slp");
    });

    test("shows top nav modes and coming soon placeholder for non-label modes", async ({
        page,
    }) => {
        for (const mode of ["binary", "track", "label"]) {
            await expect(page.locator(`[data-view-mode="${mode}"]`)).toBeVisible();
        }
        // `box` is its own page, so it's a link rather than a data-view-mode button.
        await expect(page.locator('a.top-nav-link[href*="box.html"]')).toBeVisible();

        await page.locator('[data-view-mode="binary"]').click();
        await expect(page.locator("#comingSoonView")).toBeVisible();
        await expect(page.locator("#comingSoonModeName")).toContainText("Binary");
        await expect(page.locator("#comingSoonView")).toContainText("Coming soon…");

        await page.locator('[data-view-mode="label"]').click();
        await expect(page.locator("#labelView")).toBeVisible();
        await expect(page.locator("#comingSoonView")).toBeHidden();
    });

    test("Box nav link points to the standalone box page", async ({ page }) => {
        const boxLink = page.locator('a.top-nav-link[href*="box.html"]');
        await expect(boxLink).toBeVisible();
        await expect(boxLink).toHaveText("Box");
        await boxLink.click();
        await expect(page).toHaveURL(/box\.html$/);
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

test.describe("Pozu box-selection page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/box.html");
    });

    test("renders the box page chrome with Box active in the nav", async ({ page }) => {
        await expect(page.locator(".top-nav-brand")).toContainText("Pozu");
        const boxLink = page.locator('a.top-nav-link[href*="box.html"]');
        await expect(boxLink).toHaveClass(/active/);
    });

    test("shows box controls with updated bottom actions", async ({ page }) => {
        await expect(page.locator("#newFrameBtn")).toContainText("No Subject Present");
        await expect(page.locator("#resetBtn")).toContainText("Reset Box");
        await expect(page.locator("#downloadBtn")).toContainText("Submit");
    });

    test("Reset and Submit start disabled and box/json panels are absent", async ({ page }) => {
        await expect(page.locator("#resetBtn")).toBeDisabled();
        await expect(page.locator("#downloadBtn")).toBeDisabled();
        await expect(page.locator("#jsonOutput")).toHaveCount(0);
        await expect(page.locator("#boxCoords")).toHaveCount(0);
    });

    test("includes an error modal with GitHub issues link", async ({ page }) => {
        await expect(page.locator("#errorModal")).toHaveCount(1);
        const issuesLink = page.locator(
            '#errorModal a[href="https://github.com/CodyCBakerPhD/pozu/issues"]'
        );
        await expect(issuesLink).toHaveAttribute(
            "href",
            "https://github.com/CodyCBakerPhD/pozu/issues"
        );
    });

    test("submit button ready highlight is green", async ({ page }) => {
        const borderColor = await page.locator("#downloadBtn").evaluate((el) => {
            el.classList.add("ready");
            return window.getComputedStyle(el).borderTopColor;
        });
        expect(borderColor).toBe("rgb(34, 197, 94)");
    });

    test("Label link in the nav points back to the labeling page", async ({ page }) => {
        const labelLink = page.locator('a.top-nav-link[href$="index.html"]', { hasText: "Label" });
        await expect(labelLink).toBeVisible();
        await labelLink.click();
        await expect(page).toHaveURL(/\/(index\.html)?$/);
    });
});
