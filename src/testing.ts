/**
 * Boot script for the testing/demo page. Mirrors the box-selection page
 * (random EMBER frame, draw-a-rectangle interaction, zoom/pan tools) but
 * with the "No Subject Present" and "Submit" buttons permanently disabled
 * so no data is submitted and no frame skipping occurs.
 */
import "./styles.css";
import { loadVideoModel, refreshTotalFrames, type VideoModel } from "./video.js";
import { createZoomController } from "./zoom.js";
import { pickRandomFrame, type VideoMeta } from "./payload.js";
import { normaliseBox, clampBox, type Box } from "./box-payload.js";
import { initAuthControl } from "./auth.js";

// ---- Version badge ----
(document.getElementById("versionBadge") as HTMLElement).textContent = `v${__APP_VERSION__}`;

// ---- Diagnostics ----
function showFatal(label: string, err: unknown): void {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[pozu:testing] ${label}:`, err);
    const overlay = document.getElementById("initialLoading");
    if (overlay) {
        overlay.textContent = `❌ ${label}: ${msg}. See the browser console for details.`;
        overlay.style.display = "flex";
    }
    setControlsEnabled(true);
}
window.addEventListener("error", (e) => showFatal("Uncaught error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) =>
    showFatal("Unhandled promise rejection", e.reason)
);

function setStage(message: string): void {
    console.info(`[pozu:testing] ${message}`);
    const overlay = document.getElementById("initialLoading");
    if (overlay) overlay.textContent = message;
}

console.info("[pozu:testing] testing.ts module evaluating");

// ---- DOM ----
const canvas = document.getElementById("frameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const canvasContainer = document.getElementById("canvasContainer") as HTMLElement;
const canvasViewport = document.getElementById("canvasViewport") as HTMLElement;
const boxOverlay = document.getElementById("boxOverlay") as HTMLElement;
const zoomSlider = document.getElementById("zoomSlider") as HTMLInputElement;
const zoomResetBtn = document.getElementById("zoomResetBtn") as HTMLButtonElement;
const zoomLevel = document.getElementById("zoomLevel") as HTMLElement;
const panToggleBtn = document.getElementById("panToggleBtn") as HTMLButtonElement;
const boxZoomToggleBtn = document.getElementById("boxZoomToggleBtn") as HTMLButtonElement;
const initialLoading = document.getElementById("initialLoading") as HTMLElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;

setStage("Booting pozu testing mode… (loading video)");

// ---- App state ----
let videoModel: VideoModel | null = null;
let frameIndex = 0;
let box: Box | null = null;
let dragStart: { pixelX: number; pixelY: number } | null = null;

const getVideoMeta = (): VideoMeta | null => videoModel?.meta ?? null;

// ---- Zoom / pan ----
const zoom = createZoomController({
    viewport: canvasViewport,
    content: canvasContainer,
    onChange: (scale) => {
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
        zoomSlider.value = String(scale);
        const zoomed = scale > 1;
        zoomResetBtn.disabled = !zoomed;
        panToggleBtn.disabled = !zoomed;
        if (!zoomed && panToggleBtn.classList.contains("active")) setPanMode(false);
    },
});

function setPanMode(on: boolean) {
    zoom.setPanMode(on);
    panToggleBtn.classList.toggle("active", on);
    panToggleBtn.setAttribute("aria-pressed", String(on));
    if (on) setBoxZoomMode(false);
}

function setBoxZoomMode(on: boolean) {
    zoom.setBoxZoomMode(on);
    boxZoomToggleBtn.classList.toggle("active", on);
    boxZoomToggleBtn.setAttribute("aria-pressed", String(on));
    if (on) setPanMode(false);
}

zoomSlider.addEventListener("input", () => zoom.setScale(parseFloat(zoomSlider.value)));
zoomResetBtn.addEventListener("click", () => zoom.reset());
panToggleBtn.addEventListener("click", () =>
    setPanMode(!panToggleBtn.classList.contains("active"))
);
boxZoomToggleBtn.addEventListener("click", () =>
    setBoxZoomMode(!boxZoomToggleBtn.classList.contains("active"))
);

// newFrameBtn and downloadBtn are permanently disabled on this page.
function setControlsEnabled(enabled: boolean) {
    resetBtn.disabled = !enabled || box == null;
}

/** Repaint the rectangle overlay in display (CSS) coordinates. */
function renderBoxOverlay() {
    if (!box) {
        boxOverlay.style.display = "none";
        return;
    }
    const meta = getVideoMeta();
    if (!meta) {
        boxOverlay.style.display = "none";
        return;
    }
    const sx = canvas.clientWidth / meta.width;
    const sy = canvas.clientHeight / meta.height;
    boxOverlay.style.display = "block";
    boxOverlay.style.left = `${box.x * sx}px`;
    boxOverlay.style.top = `${box.y * sy}px`;
    boxOverlay.style.width = `${box.width * sx}px`;
    boxOverlay.style.height = `${box.height * sy}px`;
}

function updateBoxUI() {
    renderBoxOverlay();
    resetBtn.disabled = box == null;
    // downloadBtn stays permanently disabled
}

function clientToPixel(e: MouseEvent): { pixelX: number; pixelY: number } | null {
    const meta = getVideoMeta();
    if (!meta) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = meta.width / rect.width;
    const scaleY = meta.height / rect.height;
    const pixelX = Math.max(0, Math.min(meta.width, (e.clientX - rect.left) * scaleX));
    const pixelY = Math.max(0, Math.min(meta.height, (e.clientY - rect.top) * scaleY));
    return { pixelX, pixelY };
}

// ---- Drag-to-draw ----
canvasContainer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const p = clientToPixel(e);
    if (!p) return;
    e.preventDefault();
    dragStart = { pixelX: p.pixelX, pixelY: p.pixelY };
    box = { x: p.pixelX, y: p.pixelY, width: 0, height: 0 };
    updateBoxUI();
});

document.addEventListener("mousemove", (e) => {
    if (!dragStart) return;
    const p = clientToPixel(e);
    if (!p) return;
    box = normaliseBox({ x: dragStart.pixelX, y: dragStart.pixelY }, { x: p.pixelX, y: p.pixelY });
    updateBoxUI();
});

function commitDrag() {
    if (!dragStart) return;
    dragStart = null;
    if (box && (box.width < 1 || box.height < 1)) {
        box = null;
    } else if (box) {
        box = clampBox(box, getVideoMeta());
    }
    updateBoxUI();
}
document.addEventListener("mouseup", commitDrag);
window.addEventListener("blur", commitDrag);

// ---- Frame sizing ----
const SHELL_MAX_WIDTH = 2288;
const FRAME_RESERVED_WIDTH = 100;
const FRAME_RESERVED_HEIGHT = 260;
const MIN_FRAME_WIDTH = 360;
const MAX_FRAME_SCALE = 2;
const DEFAULT_FRAME_WIDTH = 960;
const DEFAULT_FRAME_HEIGHT = 540;
const CANVAS_BORDER = 2;

function computeFrameWidth(w: number, h: number): number {
    const availW = Math.max(
        MIN_FRAME_WIDTH,
        Math.min(window.innerWidth, SHELL_MAX_WIDTH) - 40 - FRAME_RESERVED_WIDTH
    );
    const availH = Math.max(240, window.innerHeight - FRAME_RESERVED_HEIGHT);
    const scale = Math.min(availW / w, availH / h, MAX_FRAME_SCALE);
    return w * scale;
}

function fitCanvasToViewport(): void {
    if (!videoModel) return;
    const { width: w, height: h } = videoModel.meta;
    if (!w || !h) return;
    const frameW = computeFrameWidth(w, h);
    canvas.style.width = `${frameW}px`;
    canvas.style.height = `${(frameW / w) * h}px`;
}

function reserveFrameSpace(): void {
    if (canvasContainer.style.display !== "none") return;
    const frameW = computeFrameWidth(DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT);
    const frameH = (frameW / DEFAULT_FRAME_WIDTH) * DEFAULT_FRAME_HEIGHT;
    initialLoading.style.width = `${frameW + CANVAS_BORDER * 2}px`;
    initialLoading.style.height = `${frameH + CANVAS_BORDER * 2}px`;
}

reserveFrameSpace();

// ---- Frame loading ----
async function showFrame(idx: number) {
    if (!videoModel) return;
    setControlsEnabled(false);

    const bitmap = await videoModel.video.getFrame(idx);
    if (bitmap == null) {
        initialLoading.style.display = "none";
        setControlsEnabled(true);
        return;
    }

    const meta = videoModel.meta;
    const w = (bitmap as ImageData | ImageBitmap).width ?? meta.width;
    const h = (bitmap as ImageData | ImageBitmap).height ?? meta.height;
    canvas.width = w;
    canvas.height = h;
    meta.width = w;
    meta.height = h;

    ctx.clearRect(0, 0, w, h);
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) {
        ctx.drawImage(bitmap, 0, 0, w, h);
    } else if (bitmap instanceof ImageData) {
        ctx.putImageData(bitmap, 0, 0);
    }

    fitCanvasToViewport();

    frameIndex = idx;
    box = null;
    dragStart = null;
    canvasContainer.style.display = "inline-block";
    initialLoading.style.display = "none";
    zoom.reset();
    zoomSlider.disabled = false;
    boxZoomToggleBtn.disabled = false;

    updateBoxUI();
    setControlsEnabled(true);
}

async function loadRandomFrame() {
    if (!videoModel) {
        await ensureVideoModel();
        if (!videoModel) return;
    }
    const total = await refreshTotalFrames(videoModel);
    if (total < 2) {
        await showFrame(0);
        return;
    }
    await showFrame(pickRandomFrame(total, frameIndex));
}

async function ensureVideoModel() {
    setStage("Loading frame from archive…");
    videoModel = await loadVideoModel();
    setStage(
        `Video opened: ${videoModel.meta.totalFrames} frames, ` +
            `${videoModel.meta.width}×${videoModel.meta.height} @ ${videoModel.meta.fps.toFixed(2)} fps`
    );
}

// ---- Reset button ----
resetBtn.addEventListener("click", () => {
    box = null;
    updateBoxUI();
});

window.addEventListener("resize", () => {
    if (canvasContainer.style.display === "none") {
        reserveFrameSpace();
        return;
    }
    fitCanvasToViewport();
    zoom.reset();
    if (box) renderBoxOverlay();
});

// ---- Boot ----
initAuthControl();
updateBoxUI();
(async () => {
    try {
        await ensureVideoModel();
        await loadRandomFrame();
    } catch (err) {
        console.error(err);
        const msg = (err as Error).message;
        initialLoading.textContent = `❌ Failed to load video: ${msg}. Please refresh to retry.`;
        setControlsEnabled(true);
    }
})();
