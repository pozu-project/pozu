/**
 * Shared dev-mode utility. Imported by each page's boot script.
 *
 * When `?dev-mode` is present in the URL:
 *   - Adds `dev-mode` class to <body> for visual theming.
 *   - Rewrites all relative nav/brand links to carry `?dev-mode` so the
 *     param is preserved when navigating between pages.
 *   - Turns the Dev Mode nav button into a toggle-off link (removes the param).
 *
 * When `?dev-mode` is absent:
 *   - The Dev Mode button already points to `./box.html?dev-mode` in the HTML,
 *     so nothing extra is needed.
 */

export const DEV_MODE = new URLSearchParams(window.location.search).has("dev-mode");

/** Append `?dev-mode` (or `&dev-mode`) to a relative href, preserving any hash. */
function addDevMode(href: string): string {
    const hashIdx = href.indexOf("#");
    const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
    const base = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    return base + (base.includes("?") ? "&dev-mode" : "?dev-mode") + hash;
}

export function initDevMode(): void {
    const devModeLink = document.querySelector<HTMLAnchorElement>(".top-nav-devmode-link");

    if (!DEV_MODE) return;

    // Visual indicator
    document.body.classList.add("dev-mode");

    // Rewrite relative links inside the nav and the brand so the param is
    // carried through page-to-page navigation.
    const selectors = ["nav a[href]", "a.top-nav-brand[href]"];
    for (const sel of selectors) {
        for (const a of document.querySelectorAll<HTMLAnchorElement>(sel)) {
            const href = a.getAttribute("href")!;
            // Skip external links, anchors-only, and links that already carry the param.
            if (!href.startsWith("./") || href.includes("dev-mode")) continue;
            a.setAttribute("href", addDevMode(href));
        }
    }

    // Dev Mode button: mark active and point to the current page without the param (toggle off).
    if (devModeLink) {
        devModeLink.classList.add("active");
        const params = new URLSearchParams(window.location.search);
        params.delete("dev-mode");
        const query = params.toString();
        const file = window.location.pathname.split("/").pop() ?? "";
        devModeLink.href = file + (query ? `?${query}` : "");
    }
}
