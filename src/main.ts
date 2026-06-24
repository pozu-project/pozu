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
import { initAuthControl, isSignedIn, onAuthChange } from "./auth.js";

// ---- Version badge ----
(document.getElementById("versionBadge") as HTMLElement).textContent = `v${__APP_VERSION__}`;

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
    setControlsEnabled(true);
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
const statusMsg = document.getElementById("statusMsg") as HTMLElement;
const newFrameBtn = document.getElementById("newFrameBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const demoControls = document.getElementById("demoControls") as HTMLElement;
const demoPrevBtn = document.getElementById("demoPrevBtn") as HTMLButtonElement;
const demoNextBtn = document.getElementById("demoNextBtn") as HTMLButtonElement;
const demoCounter = document.getElementById("demoCounter") as HTMLElement;
const labelView = document.getElementById("labelView") as HTMLElement;
const comingSoonView = document.getElementById("comingSoonView") as HTMLElement;
const comingSoonModeName = document.getElementById("comingSoonModeName") as HTMLElement;
const binaryDemo = document.getElementById("binaryDemo") as HTMLElement;
const sidebar = document.querySelector(".sidebar") as HTMLElement | null;
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

// ---- Demo mode state ----
const DEMO_FRAME_COUNT = 10;
let demoMode = false;
let demoFrameIndices: number[] = [];
let demoPosition = 0;

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

// Re-fit the frame to the window so it keeps filling the row on resize.
window.addEventListener("resize", () => {
    if (canvasContainer.style.display === "none") return;
    fitCanvasToViewport();
    zoom.reset();
});

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

function updateDemoNav() {
    demoPrevBtn.disabled = demoPosition === 0;
    demoNextBtn.disabled = demoPosition === DEMO_FRAME_COUNT - 1;
    demoCounter.textContent = `${demoPosition + 1} / ${DEMO_FRAME_COUNT}`;
}

function enterDemoMode() {
    demoMode = true;
    newFrameBtn.hidden = true;
    downloadBtn.hidden = true;
    demoControls.hidden = false;
    demoCounter.textContent = `1 / ${DEMO_FRAME_COUNT}`;
    demoPrevBtn.disabled = true;
    demoNextBtn.disabled = true;
}

function exitDemoMode() {
    demoMode = false;
    newFrameBtn.hidden = false;
    downloadBtn.hidden = false;
    demoControls.hidden = true;
    loadRandomFrame();
}

async function initDemoFrames() {
    if (!videoModel) return;
    const total = await refreshTotalFrames(videoModel);
    demoFrameIndices = [];
    let prev = -1;
    for (let i = 0; i < DEMO_FRAME_COUNT; i++) {
        const idx = pickRandomFrame(total, prev);
        demoFrameIndices.push(idx);
        prev = idx;
    }
    demoPosition = 0;
    await showFrame(demoFrameIndices[0]);
    updateDemoNav();
}

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

// ---- Frame sizing ----
// Keep in sync with `.view-shell` / `.top-nav-inner` max-width in styles.css.
const SHELL_MAX_WIDTH = 2288;
// Fixed horizontal chrome on the label row: shell padding (40), container
// padding (32), the zoom rail (40), and the two gaps (12 + 20). Whatever's left
// is shared between the frame and the sidebar.
const ROW_CHROME = 144;
// Vertical space outside the frame: the top nav, shell padding, and the
// controls below the frame. Keeps the frame from overflowing the window height.
const FRAME_RESERVED_HEIGHT = 220;
const MIN_FRAME_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 150;
// The EMBER frames are only 960×540, so filling a wide window means upscaling.
// Cap it so the frame doesn't get unusably soft on very large monitors.
const MAX_FRAME_SCALE = 2;

const clampW = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Lay out the frame and the skeleton node selector on one row. The frame fills
// the available viewport box (width and height, upscaling when there's room);
// when the window is too narrow to hold both at full size, the frame and the
// sidebar shrink together — the sidebar tracks the frame and never wraps below.
function fitCanvasToViewport(): void {
    if (!videoModel) return;
    const { width: w, height: h } = videoModel.meta;
    if (!w || !h) return;
    const availH = Math.max(240, window.innerHeight - FRAME_RESERVED_HEIGHT);
    // Width shared between the frame and the sidebar.
    const usable = Math.max(
        MIN_FRAME_WIDTH,
        Math.min(window.innerWidth, SHELL_MAX_WIDTH) - ROW_CHROME
    );
    // The frame's preferred width when only height / max upscale constrain it.
    const frameCap = Math.min(w * MAX_FRAME_SCALE, (availH / h) * w);

    let sidebarW = SIDEBAR_MAX_WIDTH;
    let frameW = frameCap;
    if (frameCap + SIDEBAR_MAX_WIDTH > usable) {
        // Not enough room for both at full size: shrink them together, keeping
        // the frame-to-sidebar ratio so the sidebar scales with the frame.
        sidebarW = clampW(
            (usable * SIDEBAR_MAX_WIDTH) / (frameCap + SIDEBAR_MAX_WIDTH),
            SIDEBAR_MIN_WIDTH,
            SIDEBAR_MAX_WIDTH
        );
        frameW = clampW(usable - sidebarW, MIN_FRAME_WIDTH, frameCap);
    }

    const scale = frameW / w;
    displayScale = scale;
    canvas.style.width = `${frameW}px`;
    canvas.style.height = `${h * scale}px`;
    if (sidebar) sidebar.style.width = `${sidebarW}px`;
}

async function showFrame(idx: number, bitmapPromise?: Promise<ImageBitmap | null>) {
    if (!videoModel) return;
    setControlsEnabled(false);

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

    fitCanvasToViewport();

    frameIndex = idx;
    labeler.clearAll();
    canvasContainer.style.display = "inline-block";
    initialLoading.style.display = "none";
    zoom.reset();
    zoomSlider.disabled = false;

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
demoPrevBtn.addEventListener("click", () => {
    if (demoPosition <= 0) return;
    demoPosition--;
    demoPrevBtn.disabled = true;
    demoNextBtn.disabled = true;
    showFrame(demoFrameIndices[demoPosition]).then(updateDemoNav);
});

demoNextBtn.addEventListener("click", () => {
    if (demoPosition >= DEMO_FRAME_COUNT - 1) return;
    demoPosition++;
    demoPrevBtn.disabled = true;
    demoNextBtn.disabled = true;
    showFrame(demoFrameIndices[demoPosition]).then(updateDemoNav);
});

newFrameBtn.addEventListener("click", () => {
    loadRandomFrame().catch((err: Error) => {
        console.error(err);
        const msg = err?.message ?? String(err);
        showStatus("error", `Failed to load frame: ${msg}`);
        initialLoading.textContent = `❌ ${msg}. Click 🚫 No Subject Present to retry.`;
        initialLoading.style.display = "flex";
        setControlsEnabled(true);
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
onAuthChange(() => {
    if (isSignedIn() && demoMode) exitDemoMode();
});
initAuthControl();

// ---- Boot ----
(async () => {
    if (isSignedIn()) {
        newFrameBtn.hidden = false;
        downloadBtn.hidden = false;
    }
    try {
        await ensureVideoModel();
        if (isSignedIn()) {
            await loadRandomFrame();
        } else {
            enterDemoMode();
            await initDemoFrames();
        }
    } catch (err) {
        console.error(err);
        const msg = (err as Error).message;
        initialLoading.textContent = `❌ Failed to load video: ${msg}. Click 🚫 No Subject Present to retry.`;
        showStatus("error", msg);
        setControlsEnabled(true);
    }
})();
