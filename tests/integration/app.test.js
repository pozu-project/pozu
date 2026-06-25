import { test, expect } from "@chromatic-com/playwright";

const EMBER_VIDEO_URL = "https://ember-open-data.s3.amazonaws.com/blobs/";

// Fake JWT: header.{"exp":9999999999}.sig — makes isSignedIn() return true
// without hitting the real backend OAuth flow.
const FAKE_TOKEN = "header.eyJleHAiOjk5OTk5OTk5OTl9.sig";

test.describe("Pozu labeling page", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript((token) => {
            localStorage.setItem("pozu.auth.token", token);
        }, FAKE_TOKEN);
        await page.route(`${EMBER_VIDEO_URL}**`, (route) => route.abort());
        await page.goto("/", { waitUntil: "domcontentloaded" });
    });

    test("pins the version badge to the static test version", async ({ page }) => {
        await expect(page.locator("#versionBadge")).toHaveText("vx.y.z");
    });

    test("renders top nav title", async ({ page }) => {
        await expect(page.locator(".top-nav-brand")).toContainText("Pozu");
        await expect(page.locator(".top-nav-brand .top-nav-logo")).toHaveAttribute(
            "src",
            /\/assets\/pozu-logo\.svg$/
        );
        await expect(page.locator(".top-nav-brand")).not.toContainText("🦓");
    });

    test("shows three top-level nav section titles", async ({ page }) => {
        const titles = page.locator(".nav-section-title");
        await expect(titles).toHaveCount(3);
        await expect(titles.nth(0)).toHaveText("Label");
        await expect(titles.nth(1)).toHaveText("Train");
        await expect(titles.nth(2)).toHaveText("Curate");
    });

    test("serves the nav logo asset", async ({ page }) => {
        const response = await page.request.get("/assets/pozu-logo.svg");
        expect(response.ok()).toBe(true);
        expect(response.headers()["content-type"]).toContain("image/svg+xml");
    });

    test("shows CON branding badge", async ({ page }) => {
        const conLink = page.locator(".con-badge");
        await expect(conLink).toBeVisible();
        await expect(conLink).toHaveAttribute("href", "https://centerforopenneuroscience.org");
        await expect(page.locator(".con-badge .con-badge-logo")).toHaveAttribute(
            "src",
            /\/assets\/con-logo\.png$/
        );
    });

    test("serves the CON logo asset", async ({ page }) => {
        const response = await page.request.get("/assets/con-logo.png");
        expect(response.ok()).toBe(true);
        expect(response.headers()["content-type"]).toContain("image/png");
    });

    test("shows the three primary controls", async ({ page }) => {
        for (const id of ["#newFrameBtn", "#resetBtn", "#downloadBtn"]) {
            await expect(page.locator(id)).toBeVisible();
        }
        await expect(page.locator("#newFrameBtn")).toContainText("No Subject Present");
        await expect(page.locator("#downloadBtn")).toContainText("Submit");
    });

    test("shows top nav modes and coming soon placeholder for non-label modes", async ({
        page,
    }) => {
        for (const mode of ["binary", "track", "label"]) {
            await expect(page.locator(`[data-view-mode="${mode}"]`)).toBeVisible();
        }
        // `box` is its own page, so it's a link rather than a data-view-mode button.
        await expect(page.locator('a.top-nav-link[href*="box.html"]')).toBeVisible();

        // Binary and track are permanently disabled (curate features not yet available).
        await expect(page.locator('[data-view-mode="binary"]')).toBeDisabled();
        await expect(page.locator('[data-view-mode="track"]')).toBeDisabled();

        // Label mode is the default active view.
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
        await expect(page.locator(".label-item .coords")).toHaveCount(6);
        await expect(page.locator(".label-item .coords").first()).toHaveText("○");
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

    test("reset labels returns active selection to the top label", async ({ page }) => {
        await page.locator('.label-item[data-label-id="tail_base"]').click();
        await expect(page.locator('.label-item[data-label-id="tail_base"]')).toHaveClass(/active/);

        await page.evaluate(() => {
            const resetBtn = document.getElementById("resetBtn");
            if (resetBtn instanceof HTMLButtonElement) resetBtn.disabled = false;
        });
        await page.locator("#resetBtn").click();

        await expect(page.locator('.label-item[data-label-id="left_front_paw"]')).toHaveClass(
            /active/
        );
        await expect(page.locator('.label-item[data-label-id="tail_base"]')).not.toHaveClass(
            /active/
        );
    });

    test("hides JSON preview and keeps reset at top with remaining actions below frame", async ({
        page,
    }) => {
        await expect(page.locator("#jsonOutput")).toHaveCount(0);
        await expect(page.locator(".output-section")).toHaveCount(0);
        await expect(page.locator("#labelSidebarContent #resetBtn")).toBeVisible();
        await expect(page.locator(".bottom-actions #newFrameBtn")).toBeVisible();
        await expect(page.locator(".bottom-actions #downloadBtn")).toBeVisible();
        await expect(page.locator(".controls #resetBtn")).toHaveCount(0);
    });
});

test.describe("Pozu box-selection page", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript((token) => {
            localStorage.setItem("pozu.auth.token", token);
        }, FAKE_TOKEN);
        await page.route(`${EMBER_VIDEO_URL}**`, (route) => route.abort());
        await page.goto("/box.html", { waitUntil: "domcontentloaded" });
    });

    test("renders the box page chrome with Box active in the nav", async ({ page }) => {
        await expect(page.locator(".top-nav-brand")).toContainText("Pozu");
        await expect(page.locator(".top-nav-brand .top-nav-logo")).toHaveAttribute(
            "src",
            /\/assets\/pozu-logo\.svg$/
        );
        const boxLink = page.locator('a.top-nav-link[href*="box.html"]');
        await expect(boxLink).toHaveClass(/active/);
    });

    test("nav links keep button-like styling on box page", async ({ page }) => {
        const textDecoration = await page
            .locator('a.top-nav-link[href*="#binary"]')
            .evaluate((el) => {
                return window.getComputedStyle(el).textDecorationLine;
            });
        expect(textDecoration).toBe("none");
    });

    test("nav label typography matches between index and box pages", async ({ page }) => {
        await page.goto("/");
        const indexNavStyle = await page.locator('[data-view-mode="binary"]').evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
                fontSize: computed.fontSize,
                fontFamily: computed.fontFamily,
                lineHeight: computed.lineHeight,
            };
        });

        await page.goto("/box.html");
        const boxNavStyle = await page.locator('a.top-nav-link[href*="#binary"]').evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
                fontSize: computed.fontSize,
                fontFamily: computed.fontFamily,
                lineHeight: computed.lineHeight,
            };
        });

        expect(boxNavStyle).toEqual(indexNavStyle);
    });

    test("shows box controls with updated bottom actions", async ({ page }) => {
        await expect(page.locator("#newFrameBtn")).toContainText("No Subject Present");
        await expect(page.locator(".bottom-actions #resetBtn")).toContainText("Reset Box");
        await expect(page.locator("#downloadBtn")).toContainText("Submit");
    });

    test("Reset and Submit start disabled and box/json panels are absent", async ({ page }) => {
        await expect(page.locator(".bottom-actions #resetBtn")).toBeDisabled();
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

    test("Full Skeleton link in the nav points back to the labeling page", async ({ page }) => {
        const labelLink = page.locator('a.top-nav-link[href$="index.html"]', {
            hasText: "Full Skeleton",
        });
        await expect(labelLink).toBeVisible();
        await labelLink.click();
        await expect(page).toHaveURL(/\/(index\.html)?$/);
    });
});
