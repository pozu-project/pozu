/**
 * Boot script for the labeling page. Wires together the DOM, the
 * labeler module, and the HTML5 `<video>`-backed video loader.
 */
import "./styles.css";
import { createLabeler } from "./labeler.js";
import { createZoomController } from "./zoom.js";
import { loadVideoModel, refreshTotalFrames, VIDEO_URL, type VideoModel } from "./video.js";
import { buildPayload, pickRandomFrame, type VideoMeta } from "./payload.js";
import { submitLabelPayload } from "./label-api.js";
import { LABEL_DEFINITIONS } from "./skeleton.js";
import { initAuthControl, renderAuthControl, isSignedIn, AuthError } from "./auth.js";

// ---- Diagnostics ----
// Surface module-evaluation / async errors directly into the loading
// overlay so failures on the deployed preview don't silently hang.
function showFatal(label: string, err: unknown): void {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[pozu] ${label}:`, err);
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
    console.info(`[pozu] ${message}`);
    const overlay = document.getElementById("initialLoading");
    if (overlay) overlay.textContent = message;
}

console.info("[pozu] main.ts module evaluating");

// ---- DOM ----
const canvas = document.getElementById("frameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const canvasContainer = document.getElementById("canvasContainer") as HTMLElement;
const canvasViewport = document.getElementById("canvasViewport") as HTMLElement;
const zoomSlider = document.getElementById("zoomSlider") as HTMLInputElement;
const zoomResetBtn = document.getElementById("zoomResetBtn") as HTMLButtonElement;
const zoomLevel = document.getElementById("zoomLevel") as HTMLElement;
const panToggleBtn = document.getElementById("panToggleBtn") as HTMLButtonElement;
const initialLoading = document.getElementById("initialLoading") as HTMLElement;
const labelPalette = document.getElementById("labelPalette") as HTMLElement;
const frameInfo = document.getElementById("frameInfo") as HTMLElement;
const statusMsg = document.getElementById("statusMsg") as HTMLElement;
const newFrameBtn = document.getElementById("newFrameBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const labelView = document.getElementById("labelView") as HTMLElement;
const comingSoonView = document.getElementById("comingSoonView") as HTMLElement;
const comingSoonModeName = document.getElementById("comingSoonModeName") as HTMLElement;
const binaryDemo = document.getElementById("binaryDemo") as HTMLElement;
const labelInstructions = document.getElementById("labelInstructions") as HTMLElement;
const focusInstructions = document.getElementById("focusInstructions") as HTMLElement;
const labelSidebarContent = document.getElementById("labelSidebarContent") as HTMLElement;
const focusSidebarContent = document.getElementById("focusSidebarContent") as HTMLElement;
const focusKeypointSelect = document.getElementById("focusKeypointSelect") as HTMLSelectElement;
const focusCountEl = document.getElementById("focusCount") as HTMLElement;
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-view-mode]"));

type ViewMode = "binary" | "track" | "label" | "focus";
const VIEW_MODE_NAMES: Record<ViewMode, string> = {
    binary: "Binary",
    track: "Track",
    label: "Label",
    focus: "Focus",
};

// Mark the overlay so we can verify the bundle actually loaded.
setStage("Booting pozu… (loading video)");

// ---- App state ----
let videoModel: VideoModel | null = null;
let frameIndex = 0;
let displayScale = 1;

// ---- Next-frame prefetch ----
// The expensive step between labelings is the HTML5 `<video>` seek inside
// `getFrame`. Frames are picked at random so the *exact* next index isn't
// known ahead of time, but we can pre-pick several and decode them in the
// background while the user labels the current frame. `loadRandomFrame`
// consumes from the front of the queue; each consumed slot is replaced so
// the queue stays topped up. Seeks against the single `<video>` element
// are serialised by the backend, so the queued decodes run back-to-back
// asynchronously without racing each other. The first frame of a session
// still pays full price; subsequent ones are (usually) instant.
//
// Memory cost is bounded: at ~1280×720 RGBA a decoded bitmap is ~3.7 MB,
// so a full queue is well under 50 MB.
const PREFETCH_DEPTH = 10;

interface PrefetchedFrame {
    idx: number;
    promise: Promise<ImageBitmap | null>;
}
const prefetchQueue: PrefetchedFrame[] = [];

function topUpPrefetch() {
    const model = videoModel;
    if (!model) return;
    const total = model.meta.totalFrames;
    if (total < 2) return;
    // Pick relative to the last already-queued (or current) frame so we
    // don't enqueue the same index back-to-back.
    let prev = prefetchQueue.length > 0 ? prefetchQueue[prefetchQueue.length - 1].idx : frameIndex;
    while (prefetchQueue.length < PREFETCH_DEPTH) {
        const idx = pickRandomFrame(total, prev);
        prev = idx;
        // Swallow failures so a bad background seek doesn't surface as an
        // unhandled rejection; consumers skip null bitmaps and fall back to
        // a fresh decode.
        const promise = model.video.getFrame(idx).catch((err) => {
            console.warn(`[pozu] prefetch of frame ${idx} failed:`, err);
            return null;
        });
        prefetchQueue.push({ idx, promise });
    }
}

// ---- Focus mode state ----
let focusModeActive = false;
let focusNodeId = LABEL_DEFINITIONS[0].id;
let focusCount = 0;
let focusSubmitInProgress = false;
let prevPlacedSize = 0;

const getVideoMeta = (): VideoMeta | null => videoModel?.meta ?? null;

const labeler = createLabeler({
    canvas,
    canvasContainer,
    labelPalette,
    getDisplayScale: () => displayScale,
    getVideoMeta,
});

// ---- Zoom / pan ----
const zoom = createZoomController({
    viewport: canvasViewport,
    content: canvasContainer,
    onChange: (scale) => {
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
        zoomSlider.value = String(scale);
        // Pan / reset only do something while zoomed in.
        const zoomed = scale > 1;
        zoomResetBtn.disabled = !zoomed;
        panToggleBtn.disabled = !zoomed;
        // Leaving zoom turns the pan tool back off. Guarded on the active
        // class so the initial onChange (before `zoom` is assigned) is a
        // no-op rather than touching the controller.
        if (!zoomed && panToggleBtn.classList.contains("active")) setPanMode(false);
    },
});

function setPanMode(on: boolean) {
    zoom.setPanMode(on);
    panToggleBtn.classList.toggle("active", on);
    panToggleBtn.setAttribute("aria-pressed", String(on));
}

zoomSlider.addEventListener("input", () => zoom.setScale(parseFloat(zoomSlider.value)));
zoomResetBtn.addEventListener("click", () => zoom.reset());
panToggleBtn.addEventListener("click", () =>
    setPanMode(!panToggleBtn.classList.contains("active"))
);

function updateSubmitReadyState() {
    downloadBtn.classList.toggle("ready", labeler.placed.size === LABEL_DEFINITIONS.length);
}

labeler.onChange(() => {
    const size = labeler.placed.size;
    const added = size > prevPlacedSize;
    prevPlacedSize = size;
    updateSubmitReadyState();
    if (focusModeActive && added && labeler.placed.has(focusNodeId) && !focusSubmitInProgress) {
        focusSubmitInProgress = true;
        doFocusSubmit().finally(() => {
            focusSubmitInProgress = false;
        });
    }
});
updateSubmitReadyState();

function setControlsEnabled(enabled: boolean) {
    newFrameBtn.disabled = !enabled;
    resetBtn.disabled = !enabled;
    downloadBtn.disabled = !enabled;
}

function setViewMode(mode: ViewMode) {
    for (const button of modeButtons) {
        button.classList.toggle("active", button.dataset.viewMode === mode);
    }

    if (mode === "label" || mode === "focus") {
        labelView.hidden = false;
        comingSoonView.hidden = true;
        focusModeActive = mode === "focus";
        labelInstructions.hidden = mode === "focus";
        focusInstructions.hidden = mode !== "focus";
        labelSidebarContent.hidden = mode === "focus";
        focusSidebarContent.hidden = mode !== "focus";
        resetBtn.hidden = mode === "focus";
        downloadBtn.hidden = mode === "focus";
        return;
    }

    focusModeActive = false;
    labelView.hidden = true;
    comingSoonView.hidden = false;
    comingSoonModeName.textContent = VIEW_MODE_NAMES[mode];
    binaryDemo.hidden = mode !== "binary";
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

async function showFrame(idx: number, bitmapPromise?: Promise<ImageBitmap | null>) {
    if (!videoModel) return;
    setControlsEnabled(false);
    frameInfo.textContent = `Decoding frame ${idx}…`;

    const bitmap = await (bitmapPromise ?? videoModel.video.getFrame(idx));
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
    displayScale = scale;
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;

    frameIndex = idx;
    labeler.clearAll();
    canvasContainer.style.display = "inline-block";
    initialLoading.style.display = "none";
    zoom.reset();
    zoomSlider.disabled = false;

    frameInfo.textContent =
        `Frame ${idx} / ${meta.totalFrames}  ` + `(${w}×${h} @ ${meta.fps.toFixed(2)} fps)`;
    setControlsEnabled(true);

    // Current frame is painted; the `<video>` is now free to seek ahead.
    // Refill the background-decode queue.
    topUpPrefetch();
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

    // Resolve the next frame, preferring background-decoded ones from the
    // front of the queue. A single seek can fail or time out — deep seeks
    // into the remote MP4 are flaky — so skip null bitmaps and ultimately
    // fall back to freshly-picked frames instead of dead-ending on "no
    // data" for one unlucky index.
    let idx = -1;
    let bitmap: ImageBitmap | null = null;
    while (bitmap == null && prefetchQueue.length > 0) {
        const head = prefetchQueue.shift()!;
        idx = head.idx;
        bitmap = await head.promise;
    }
    for (let tries = 0; bitmap == null && tries < 4; tries++) {
        idx = pickRandomFrame(total, frameIndex);
        try {
            bitmap = await videoModel.video.getFrame(idx);
        } catch (err) {
            console.warn(`[pozu] decode of frame ${idx} failed; retrying:`, err);
        }
    }
    await showFrame(idx, Promise.resolve(bitmap));
}

async function ensureVideoModel() {
    setStage("Loading frame…");
    videoModel = await loadVideoModel();
    setStage(
        `Video opened: ${videoModel.meta.totalFrames} frames, ` +
            `${videoModel.meta.width}×${videoModel.meta.height} @ ${videoModel.meta.fps.toFixed(2)} fps`
    );
}

// ---- Focus mode ----
function buildFocusPicker() {
    for (const def of LABEL_DEFINITIONS) {
        const option = document.createElement("option");
        option.value = def.id;
        option.textContent = def.name;
        focusKeypointSelect.appendChild(option);
    }
    focusKeypointSelect.addEventListener("change", () => {
        focusNodeId = focusKeypointSelect.value;
    });
    focusNodeId = LABEL_DEFINITIONS[0].id;
    focusKeypointSelect.value = focusNodeId;
}

async function doFocusSubmit() {
    const meta = getVideoMeta();
    if (!meta) return;

    if (!isSignedIn()) {
        showStatus("error", "Please sign in with GitHub (top-right) to submit.");
        return;
    }

    const payload = buildPayload({
        videoUrl: VIDEO_URL,
        frameIndex,
        videoMeta: meta,
        placed: labeler.placed,
    });

    setControlsEnabled(false);
    try {
        await submitLabelPayload(payload);
    } catch (err) {
        console.error("Focus submit failed:", err);
        if (err instanceof AuthError) {
            renderAuthControl();
            showStatus("error", err.message);
            setControlsEnabled(true);
            return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        showStatus("error", `Failed to submit: ${msg}`);
        setControlsEnabled(true);
        return;
    }

    focusCount += 1;
    focusCountEl.textContent = `Frames labeled: ${focusCount}`;
    statusMsg.style.display = "none";

    try {
        await loadRandomFrame();
    } catch (err) {
        console.error("Loading next frame failed after focus submit:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showStatus("error", `Labeled submitted, but failed to load next frame: ${msg}`);
        setControlsEnabled(true);
    }
}

// ---- Buttons ----
newFrameBtn.addEventListener("click", () => {
    loadRandomFrame().catch((err: Error) => {
        console.error(err);
        const msg = err?.message ?? String(err);
        showStatus("error", `Failed to load frame: ${msg}`);
        initialLoading.textContent = `❌ ${msg}. Click 🚫 No Subject Present to retry.`;
        initialLoading.style.display = "flex";
        // Keep the controls enabled so the user can retry.
        newFrameBtn.disabled = false;
        resetBtn.disabled = false;
        downloadBtn.disabled = false;
    });
});

resetBtn.addEventListener("click", () => {
    labeler.clearAll();
});

downloadBtn.addEventListener("click", async () => {
    if (labeler.placed.size === 0) {
        showStatus("error", "No labels placed yet.");
        return;
    }

    if (!isSignedIn()) {
        showStatus("error", "Please sign in with GitHub (top-right) to submit.");
        return;
    }

    const meta = getVideoMeta();
    if (!meta) {
        showStatus("error", "Video metadata unavailable. Load a frame and try again.");
        return;
    }

    const payload = buildPayload({
        videoUrl: VIDEO_URL,
        frameIndex,
        videoMeta: meta,
        placed: labeler.placed,
    });

    setControlsEnabled(false);
    try {
        await submitLabelPayload(payload);
    } catch (err) {
        console.error("Label JSON submission failed:", err);
        if (err instanceof AuthError) {
            renderAuthControl();
            showStatus("error", err.message);
            setControlsEnabled(true);
            return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        showStatus("error", `Failed to submit labels: ${msg}`);
        setControlsEnabled(true);
        return;
    }

    statusMsg.style.display = "none";
    try {
        await loadRandomFrame();
    } catch (err) {
        console.error("Loading next random frame failed after submit:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showStatus("error", `Labels were submitted, but loading a new frame failed: ${msg}`);
        setControlsEnabled(true);
    }
});

for (const button of modeButtons) {
    button.addEventListener("click", () => {
        const mode = button.dataset.viewMode as ViewMode | undefined;
        if (!mode) return;
        setViewMode(mode);
    });
}

// Cross-page nav links (e.g. from box.html) can preselect a mode via
// `./index.html#binary`. Only honour known modes — unknown hashes fall
// back to the default "label" view.
const initialHash = window.location.hash.replace(/^#/, "") as ViewMode;
if (initialHash && initialHash in VIEW_MODE_NAMES) {
    setViewMode(initialHash);
}

buildFocusPicker();
initAuthControl();

// ---- Boot ----
(async () => {
    try {
        await ensureVideoModel();
        await loadRandomFrame();
    } catch (err) {
        console.error(err);
        const msg = (err as Error).message;
        initialLoading.textContent = `❌ Failed to load video: ${msg}. Click 🚫 No Subject Present to retry.`;
        showStatus("error", msg);
        // Re-enable controls so the user can retry instead of being
        // permanently stuck on the loading overlay.
        newFrameBtn.disabled = false;
        resetBtn.disabled = false;
        downloadBtn.disabled = false;
    }
})();
