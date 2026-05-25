/**
 * Boot script for the box-selection page. Same random EMBER frame
 * fetching as the labeling page (it reuses {@link loadVideoModel} /
 * {@link refreshTotalFrames} from `video.ts`), but the interaction is
 * draw-a-rectangle rather than place-keypoints, and the export is a
 * simple JSON document rather than a `.slp` training file.
 *
 * The frame-loading + canvas-drawing glue is intentionally a small
 * duplicate of `main.ts` rather than a shared helper: extracting the
 * common path would require threading the labeler integration through
 * the helper as well, and the box page's interaction model is
 * different enough (single mutable rectangle, no per-node palette)
 * that keeping the two boot scripts independent is simpler.
 */
import "./styles.css";
import { loadVideoModel, refreshTotalFrames, VIDEO_URL, type VideoModel } from "./video.js";
import { pickRandomFrame, type VideoMeta } from "./payload.js";
import { buildBoxPayload, normaliseBox, clampBox, type Box } from "./box-payload.js";
import { submitBoxPayload } from "./box-api.js";

// ---- Diagnostics ----
// Mirror main.ts so failures on the deployed preview surface in the
// loading overlay instead of silently hanging.
function showFatal(label: string, err: unknown): void {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[pozu:box] ${label}:`, err);
    const overlay = document.getElementById("initialLoading");
    if (overlay) {
        overlay.textContent = `❌ ${label}: ${msg}. See the browser console for details; click 🚫 No Subject Present to retry.`;
        overlay.style.display = "flex";
    }
    for (const id of ["newFrameBtn", "resetBtn", "downloadBtn"]) {
        const btn = document.getElementById(id) as HTMLButtonElement | null;
        if (btn) btn.disabled = false;
    }
}
window.addEventListener("error", (e) => showFatal("Uncaught error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) =>
    showFatal("Unhandled promise rejection", e.reason)
);

function setStage(message: string): void {
    console.info(`[pozu:box] ${message}`);
    const overlay = document.getElementById("initialLoading");
    if (overlay) overlay.textContent = message;
}

console.info("[pozu:box] box.ts module evaluating");

// ---- DOM ----
const canvas = document.getElementById("frameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const canvasContainer = document.getElementById("canvasContainer") as HTMLElement;
const boxOverlay = document.getElementById("boxOverlay") as HTMLElement;
const initialLoading = document.getElementById("initialLoading") as HTMLElement;
const frameInfo = document.getElementById("frameInfo") as HTMLElement;
const statusMsg = document.getElementById("statusMsg") as HTMLElement;
const newFrameBtn = document.getElementById("newFrameBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const errorModal = document.getElementById("errorModal") as HTMLDialogElement | null;
const errorModalMessage = document.getElementById("errorModalMessage") as HTMLElement | null;

setStage("Booting pozu box mode… (loading sleap-io.js bundle)");

// ---- App state ----
let videoModel: VideoModel | null = null;
let frameIndex = 0;
/**
 * Pixel-space box, or `null` until the user has drawn one. Updated
 * live on mousemove while dragging and committed on mouseup.
 */
let box: Box | null = null;
let dragStart: { pixelX: number; pixelY: number } | null = null;

const getVideoMeta = (): VideoMeta | null => videoModel?.meta ?? null;

function setControlsEnabled(enabled: boolean) {
    newFrameBtn.disabled = !enabled;
    // Reset/download are only meaningful once a box exists; they are
    // re-evaluated by `updateBoxUI` whenever the box state changes.
    resetBtn.disabled = !enabled || box == null;
    downloadBtn.disabled = !enabled || box == null;
}

function showStatus(type: "info" | "success" | "error", message: string) {
    statusMsg.className = type;
    statusMsg.textContent = message;
    statusMsg.style.display = "block";
    if (type !== "error") {
        setTimeout(() => {
            if (statusMsg.textContent === message) {
                statusMsg.style.display = "none";
            }
        }, 5000);
    }
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
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / meta.width;
    const sy = rect.height / meta.height;
    boxOverlay.style.display = "block";
    boxOverlay.style.left = `${box.x * sx}px`;
    boxOverlay.style.top = `${box.y * sy}px`;
    boxOverlay.style.width = `${box.width * sx}px`;
    boxOverlay.style.height = `${box.height * sy}px`;
}

function updateBoxUI() {
    renderBoxOverlay();
    downloadBtn.classList.toggle("ready", box != null);
    resetBtn.disabled = box == null;
    downloadBtn.disabled = box == null;
}

function showIssueModal(message: string) {
    if (!errorModal || !errorModalMessage) {
        window.alert(
            `We're sorry — ${message}. Please submit an issue at https://github.com/CodyCBakerPhD/pozu/issues`
        );
        return;
    }
    errorModalMessage.textContent = message;
    if (!errorModal.open) {
        errorModal.showModal();
    }
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
    // Only the primary button starts a drag; ignore right-click / middle-click.
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
    // Drop zero-area boxes (a stray click without a drag) so the
    // download button doesn't enable on accident.
    if (box && (box.width < 1 || box.height < 1)) {
        box = null;
    } else if (box) {
        box = clampBox(box, getVideoMeta());
    }
    updateBoxUI();
}
document.addEventListener("mouseup", commitDrag);
// Releasing outside the viewport also ends the drag.
window.addEventListener("blur", commitDrag);

// ---- Frame loading (mirrors main.ts) ----
async function showFrame(idx: number) {
    if (!videoModel) return;
    setControlsEnabled(false);
    frameInfo.textContent = `Decoding frame ${idx}…`;

    const bitmap = await videoModel.video.getFrame(idx);
    if (bitmap == null) {
        showStatus("error", `Backend returned no data for frame ${idx}.`);
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

    const maxDisplayWidth = 720;
    const scale = Math.min(maxDisplayWidth / w, 1);
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;

    frameIndex = idx;
    box = null;
    dragStart = null;
    canvasContainer.style.display = "inline-block";
    initialLoading.style.display = "none";

    frameInfo.textContent =
        `Frame ${idx} / ${meta.totalFrames}  ` + `(${w}×${h} @ ${meta.fps.toFixed(2)} fps)`;
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
        console.warn(`Backend reports ${total} frame(s); falling back to frame 0.`);
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

// ---- Buttons ----
newFrameBtn.addEventListener("click", () => {
    loadRandomFrame().catch((err: Error) => {
        console.error(err);
        const msg = err?.message ?? String(err);
        showStatus("error", `Failed to load frame: ${msg}`);
        initialLoading.textContent = `❌ ${msg}. Click 🚫 No Subject Present to retry.`;
        initialLoading.style.display = "flex";
        newFrameBtn.disabled = false;
        resetBtn.disabled = false;
        downloadBtn.disabled = false;
    });
});

resetBtn.addEventListener("click", () => {
    box = null;
    updateBoxUI();
});

downloadBtn.addEventListener("click", async () => {
    if (!box) {
        showStatus("error", "No box drawn yet.");
        return;
    }
    const meta = getVideoMeta();
    if (!meta) {
        showStatus("error", "Video metadata unavailable. Load a frame and try again.");
        return;
    }

    const payload = buildBoxPayload({
        videoUrl: VIDEO_URL,
        frameIndex,
        videoMeta: meta,
        box,
    });

    setControlsEnabled(false);
    try {
        await submitBoxPayload(payload);
    } catch (err) {
        console.error("Box JSON submission failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showIssueModal(
            `Something went wrong while submitting this annotation (${msg}). Please submit an issue at the GitHub issues link below.`
        );
        setControlsEnabled(true);
        return;
    }

    statusMsg.style.display = "none";
    try {
        await loadRandomFrame();
    } catch (err) {
        console.error("Loading next random frame failed after submit:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showIssueModal(
            `Your annotation was submitted, but loading a new frame failed (${msg}). Please submit an issue at the GitHub issues link below.`
        );
        setControlsEnabled(true);
    }
});

// Re-render the overlay when the viewport resizes so the rectangle
// stays glued to the frame.
window.addEventListener("resize", () => {
    if (box) renderBoxOverlay();
});

// ---- Boot ----
updateBoxUI();
(async () => {
    try {
        await ensureVideoModel();
        await loadRandomFrame();
    } catch (err) {
        console.error(err);
        const msg = (err as Error).message;
        initialLoading.textContent = `❌ Failed to load video via sleap-io.js: ${msg}. Click 🚫 No Subject Present to retry.`;
        showStatus("error", msg);
        newFrameBtn.disabled = false;
        resetBtn.disabled = false;
        downloadBtn.disabled = false;
    }
})();
