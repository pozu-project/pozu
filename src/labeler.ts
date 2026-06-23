/**
 * Labeling-UI wiring: builds the label palette, manages click-to-place
 * and drag-to-adjust on the canvas, and exposes the placed-points map
 * so the rest of the app can build payloads from it.
 *
 * All DOM lookups happen up-front; the page is expected to already
 * include the elements declared in `src/index.html`.
 */
import { LABEL_DEFINITIONS } from "./skeleton.js";
import type { PlacedPoint, VideoMeta } from "./payload.js";

interface PlacedEntry extends PlacedPoint {
    displayX: number;
    displayY: number;
    element: HTMLDivElement;
}

export interface Labeler {
    /** Current pixel-space placements, keyed by node id. */
    readonly placed: ReadonlyMap<string, PlacedPoint>;
    /** Remove every dot and reset the palette. */
    clearAll(): void;
    /** Update the underlying video meta (canvas size, scale). */
    setVideoMeta(meta: VideoMeta): void;
    /** Subscribe to any change in `placed`. */
    onChange(cb: () => void): void;
}

export interface LabelerOptions {
    canvas: HTMLCanvasElement;
    canvasContainer: HTMLElement;
    labelPalette: HTMLElement;
    getDisplayScale: () => number;
    getVideoMeta: () => VideoMeta | null;
}

export function createLabeler(opts: LabelerOptions): Labeler {
    const placed = new Map<string, PlacedEntry>();
    const listeners: Array<() => void> = [];
    const notify = () => listeners.forEach((cb) => cb());

    let activeLabel: string = LABEL_DEFINITIONS[0].id;
    let dragging: { id: string; startX: number; startY: number } | null = null;
    let justDragged = false;

    // ---- Palette ----
    function initPalette() {
        for (const def of LABEL_DEFINITIONS) {
            const item = document.createElement("div");
            item.className = "label-item";
            item.dataset.labelId = def.id;
            item.innerHTML = `
                <div class="color-swatch" style="background:${def.color}"></div>
                <span>${def.name}</span>
                <span class="coords" id="coords-${def.id}">○</span>
            `;
            item.addEventListener("click", () => selectLabel(def.id));
            opts.labelPalette.appendChild(item);
        }
        selectLabel(LABEL_DEFINITIONS[0].id);
    }

    function selectLabel(id: string) {
        activeLabel = id;
        document.querySelectorAll(".label-item").forEach((el) => {
            (el as HTMLElement).classList.toggle(
                "active",
                (el as HTMLElement).dataset.labelId === id
            );
        });
    }

    function setLabelPlaced(id: string, isPlaced: boolean) {
        const item = document.querySelector<HTMLElement>(`.label-item[data-label-id="${id}"]`);
        if (!item) return;
        item.classList.toggle("placed", isPlaced);
        const coords = document.getElementById(`coords-${id}`);
        if (coords) {
            coords.textContent = isPlaced ? "✓" : "○";
        }
    }

    // ---- Pixel <-> display mapping ----
    // Display (dot) coordinates live in the canvas-container's *local*,
    // untransformed space, so they are derived from the pixel position via
    // `clientWidth` (which ignores any zoom transform) rather than from the
    // raw on-screen offset. This keeps dots glued to the frame while the
    // container is scaled by the zoom controller.
    function pixelToDisplay(pixelX: number, pixelY: number, meta: VideoMeta) {
        return {
            displayX: pixelX * (opts.canvas.clientWidth / meta.width),
            displayY: pixelY * (opts.canvas.clientHeight / meta.height),
        };
    }

    function clientToPixel(e: MouseEvent) {
        const meta = opts.getVideoMeta();
        if (!meta) return null;
        // `getBoundingClientRect()` reflects the zoom transform, so the
        // pixel mapping stays correct at any zoom level / pan offset.
        const rect = opts.canvas.getBoundingClientRect();
        const scaleX = meta.width / rect.width;
        const scaleY = meta.height / rect.height;
        const pixelX = Math.max(
            0,
            Math.min(meta.width - 1, Math.round((e.clientX - rect.left) * scaleX))
        );
        const pixelY = Math.max(
            0,
            Math.min(meta.height - 1, Math.round((e.clientY - rect.top) * scaleY))
        );
        const { displayX, displayY } = pixelToDisplay(pixelX, pixelY, meta);
        return { pixelX, pixelY, displayX, displayY };
    }

    function placeLabel(
        id: string,
        pixelX: number,
        pixelY: number,
        displayX: number,
        displayY: number
    ) {
        const def = LABEL_DEFINITIONS.find((d) => d.id === id);
        if (!def) return;

        const prev = placed.get(id);
        if (prev?.element) prev.element.remove();

        const dot = document.createElement("div");
        dot.className = "label-dot";
        dot.style.background = def.color;
        dot.style.left = `${displayX}px`;
        dot.style.top = `${displayY}px`;
        dot.dataset.labelId = id;
        dot.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            dragging = { id, startX: ev.clientX, startY: ev.clientY };
        });

        opts.canvasContainer.appendChild(dot);
        placed.set(id, { pixelX, pixelY, displayX, displayY, element: dot });
        setLabelPlaced(id, true);
    }

    function autoAdvance() {
        const idx = LABEL_DEFINITIONS.findIndex((d) => d.id === activeLabel);
        for (let i = 1; i <= LABEL_DEFINITIONS.length; i++) {
            const nextIdx = (idx + i) % LABEL_DEFINITIONS.length;
            const nextId = LABEL_DEFINITIONS[nextIdx].id;
            if (!placed.has(nextId)) {
                selectLabel(nextId);
                return;
            }
        }
    }

    // ---- Wire up DOM events ----
    opts.canvasContainer.addEventListener("click", (e) => {
        if (justDragged) {
            justDragged = false;
            return;
        }
        const p = clientToPixel(e);
        if (!p) return;
        placeLabel(activeLabel, p.pixelX, p.pixelY, p.displayX, p.displayY);
        autoAdvance();
        notify();
    });

    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const moved = Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY);
        if (moved < 3) return;
        const p = clientToPixel(e);
        if (!p) return;
        const entry = placed.get(dragging.id);
        if (!entry) return;
        entry.pixelX = p.pixelX;
        entry.pixelY = p.pixelY;
        entry.displayX = p.displayX;
        entry.displayY = p.displayY;
        entry.element.style.left = `${p.displayX}px`;
        entry.element.style.top = `${p.displayY}px`;
        setLabelPlaced(dragging.id, true);
        justDragged = true;
    });

    document.addEventListener("mouseup", () => {
        if (dragging) {
            dragging = null;
            notify();
        }
    });

    initPalette();

    return {
        get placed() {
            return placed;
        },
        clearAll() {
            for (const entry of placed.values()) entry.element?.remove();
            placed.clear();
            for (const def of LABEL_DEFINITIONS) setLabelPlaced(def.id, false);
            selectLabel(LABEL_DEFINITIONS[0].id);
            notify();
        },
        setVideoMeta(_meta: VideoMeta) {
            // The labeler reads meta lazily via `getVideoMeta`; this hook
            // exists so callers don't need to know that detail.
        },
        onChange(cb: () => void) {
            listeners.push(cb);
        },
    };
}
