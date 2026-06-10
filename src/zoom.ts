/**
 * Pan + zoom controller for the video-frame canvas.
 *
 * The frame, the label dots, and the box overlay all live inside a
 * single `content` element (the `.canvas-container`). Zooming is done by
 * applying a CSS `transform: translate(...) scale(...)` to that element,
 * so every child scales together and stays pixel-aligned with the frame
 * — no per-overlay math is needed. The pixel <-> display mapping in
 * `labeler.ts` / `box.ts` reads `getBoundingClientRect()`, which already
 * reflects the transform, so click placement keeps working while zoomed.
 *
 * A fixed-size `viewport` element (with `overflow: hidden`) wraps the
 * content so that, once zoomed in, the overflowing frame is clipped and
 * can be panned around rather than spilling over the rest of the page.
 *
 * Interactions:
 *  - Mouse wheel over the frame zooms toward the cursor.
 *  - `+` / `-` / reset buttons (wired by the caller) and the `+`, `-`,
 *    `0` keys zoom toward the frame centre.
 *  - Middle-mouse drag, or hold <kbd>Space</kbd> and drag, pans.
 */

export interface ZoomController {
    /** Zoom in one step toward the frame centre. */
    zoomIn(): void;
    /** Zoom out one step toward the frame centre. */
    zoomOut(): void;
    /** Reset to 1:1 with no pan. */
    reset(): void;
    /** Current scale factor (1 = fit). */
    getScale(): number;
    /** Detach all listeners. */
    destroy(): void;
}

export interface ZoomOptions {
    /** Clipping element; sizes to the content at scale 1. */
    viewport: HTMLElement;
    /** Transformed element holding the canvas and overlays. */
    content: HTMLElement;
    /** Minimum scale (default 1 = fit). */
    min?: number;
    /** Maximum scale (default 8). */
    max?: number;
    /** Multiplicative step for buttons / keys / wheel (default 1.2). */
    step?: number;
    /** Called after every transform change with the new scale. */
    onChange?: (scale: number) => void;
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

export function createZoomController(opts: ZoomOptions): ZoomController {
    const min = opts.min ?? 1;
    const max = opts.max ?? 8;
    const step = opts.step ?? 1.2;

    let scale = 1;
    let tx = 0;
    let ty = 0;

    let spaceDown = false;
    let pan: { startX: number; startY: number; baseTx: number; baseTy: number } | null = null;
    // True once a pan has actually moved, so we can swallow the trailing
    // `click` (which would otherwise place a label / start a box).
    let panMoved = false;

    /** Untransformed content size, taken from the viewport box. */
    function size(): { w: number; h: number } {
        const r = opts.viewport.getBoundingClientRect();
        return { w: r.width, h: r.height };
    }

    /** Keep the scaled content covering the viewport (no empty gaps). */
    function clampPan(): void {
        const { w, h } = size();
        tx = clamp(tx, w - w * scale, 0);
        ty = clamp(ty, h - h * scale, 0);
    }

    function apply(): void {
        clampPan();
        opts.content.style.transformOrigin = "0 0";
        opts.content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        opts.onChange?.(scale);
    }

    /** Zoom to `next`, keeping the content point under (cx, cy) fixed. */
    function zoomTo(next: number, cx: number, cy: number): void {
        next = clamp(next, min, max);
        if (next === scale) return;
        const localX = (cx - tx) / scale;
        const localY = (cy - ty) / scale;
        scale = next;
        tx = cx - localX * scale;
        ty = cy - localY * scale;
        apply();
    }

    function zoomCentered(next: number): void {
        const { w, h } = size();
        zoomTo(next, w / 2, h / 2);
    }

    // ---- Wheel ----
    function onWheel(e: WheelEvent): void {
        e.preventDefault();
        const r = opts.viewport.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const factor = e.deltaY < 0 ? step : 1 / step;
        zoomTo(scale * factor, cx, cy);
    }

    // ---- Pan (middle-mouse, or Space + drag) ----
    function onPanStart(e: MouseEvent): void {
        const wantsPan = e.button === 1 || (e.button === 0 && spaceDown);
        if (!wantsPan) return;
        // Capture phase + stopPropagation keeps the page's own mousedown
        // handlers (place label / draw box) from firing for a pan.
        e.preventDefault();
        e.stopPropagation();
        pan = { startX: e.clientX, startY: e.clientY, baseTx: tx, baseTy: ty };
        panMoved = false;
        opts.viewport.classList.add("panning");
    }

    function onPanMove(e: MouseEvent): void {
        if (!pan) return;
        const dx = e.clientX - pan.startX;
        const dy = e.clientY - pan.startY;
        if (!panMoved && Math.hypot(dx, dy) > 2) panMoved = true;
        tx = pan.baseTx + dx;
        ty = pan.baseTy + dy;
        apply();
    }

    function onPanEnd(): void {
        if (!pan) return;
        pan = null;
        opts.viewport.classList.remove("panning");
    }

    function onClickCapture(e: MouseEvent): void {
        // Swallow the click that ends a Space+drag pan so it doesn't get
        // treated as a placement.
        if (panMoved) {
            panMoved = false;
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // ---- Keyboard ----
    function isTypingTarget(t: EventTarget | null): boolean {
        const el = t as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName;
        return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.code === "Space") {
            spaceDown = true;
            opts.viewport.classList.add("pan-ready");
            return;
        }
        if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
        if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoomCentered(scale * step);
        } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            zoomCentered(scale / step);
        } else if (e.key === "0") {
            e.preventDefault();
            reset();
        }
    }

    function onKeyUp(e: KeyboardEvent): void {
        if (e.code === "Space") {
            spaceDown = false;
            opts.viewport.classList.remove("pan-ready");
        }
    }

    function reset(): void {
        scale = 1;
        tx = 0;
        ty = 0;
        apply();
    }

    opts.viewport.addEventListener("wheel", onWheel, { passive: false });
    opts.viewport.addEventListener("mousedown", onPanStart, true);
    opts.viewport.addEventListener("click", onClickCapture, true);
    document.addEventListener("mousemove", onPanMove);
    document.addEventListener("mouseup", onPanEnd);
    window.addEventListener("blur", onPanEnd);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    apply();

    return {
        zoomIn: () => zoomCentered(scale * step),
        zoomOut: () => zoomCentered(scale / step),
        reset,
        getScale: () => scale,
        destroy() {
            opts.viewport.removeEventListener("wheel", onWheel);
            opts.viewport.removeEventListener("mousedown", onPanStart, true);
            opts.viewport.removeEventListener("click", onClickCapture, true);
            document.removeEventListener("mousemove", onPanMove);
            document.removeEventListener("mouseup", onPanEnd);
            window.removeEventListener("blur", onPanEnd);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        },
    };
}
