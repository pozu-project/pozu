/**
 * Boot script for the focus-mode labeling page. Wires together the DOM,
 * the labeler module, and the HTML5 `<video>`-backed video loader.
 * Focus mode labels one keypoint at a time and auto-submits on placement.
 */
import "./styles.css";
import { createLabeler } from "./labeler.js";
import { createZoomController } from "./zoom.js";
import { loadVideoModel, refreshTotalFrames, VIDEO_URL, type VideoModel } from "./video.js";
import { buildPayload, pickRandomFrame, type VideoMeta } from "./payload.js";
import { submitLabelPayload } from "./label-api.js";
import { submitFrameReport } from "./report-api.js";
import { submitNoSubjectPayload } from "./no-subject-api.js";
import { LABEL_DEFINITIONS } from "./skeleton.js";
import { initAuthControl, isSignedIn, onAuthChange } from "./auth.js";
import { DEV_MODE, initDevMode, updateDevModeJson, updateDevModeFlagJson } from "./dev-mode.js";

// ---- Version badge ----
(document.getElementById("versionBadge") as HTMLElement).textContent = `v${__APP_VERSION__}`;

initDevMode();

// ---- Diagnostics ----
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

console.info("[pozu] focus.ts module evaluating");

// ---- DOM ----
const canvas = document.getElementById("frameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const canvasContainer = document.getElementById("canvasContainer") as HTMLElement;
const canvasViewport = document.getElementById("canvasViewport") as HTMLElement;
const zoomSlider = document.getElementById("zoomSlider") as HTMLInputElement;
const zoomResetBtn = document.getElementById("zoomResetBtn") as HTMLButtonElement;
const zoomLevel = document.getElementById("zoomLevel") as HTMLElement;
const panToggleBtn = document.getElementById("panToggleBtn") as HTMLButtonElement;
const boxZoomToggleBtn = document.getElementById("boxZoomToggleBtn") as HTMLButtonElement;
const initialLoading = document.getElementById("initialLoading") as HTMLElement;
const statusMsg = document.getElementById("statusMsg") as HTMLElement;
const reportFrameBtn = document.getElementById("reportFrameBtn") as HTMLButtonElement;
const reportFrameModal = document.getElementById("reportFrameModal") as HTMLDialogElement;
const reportFrameDetails = document.getElementById("reportFrameDetails") as HTMLTextAreaElement;
const reportFrameCancelBtn = document.getElementById("reportFrameCancelBtn") as HTMLButtonElement;
const reportFrameSubmitBtn = document.getElementById("reportFrameSubmitBtn") as HTMLButtonElement;
const newFrameBtn = document.getElementById("newFrameBtn") as HTMLButtonElement;
const demoControls = document.getElementById("demoControls") as HTMLElement;
const demoPrevBtn = document.getElementById("demoPrevBtn") as HTMLButtonElement;
const demoNextBtn = document.getElementById("demoNextBtn") as HTMLButtonElement;
const demoCounter = document.getElementById("demoCounter") as HTMLElement;
const sidebar = document.querySelector(".sidebar") as HTMLElement | null;
const focusKeypointSelect = document.getElementById("focusKeypointSelect") as HTMLSelectElement;
const focusCountEl = document.getElementById("focusCount") as HTMLElement;

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
    let prev = prefetchQueue.length > 0 ? prefetchQueue[prefetchQueue.length - 1].idx : frameIndex;
    while (prefetchQueue.length < PREFETCH_DEPTH) {
        const idx = pickRandomFrame(total, prev);
        prev = idx;
        const promise = model.video.getFrame(idx).catch((err) => {
            console.warn(`[pozu] prefetch of frame ${idx} failed:`, err);
            return null;
        });
        prefetchQueue.push({ idx, promise });
    }
}

// ---- Focus mode state ----
let focusNodeId = LABEL_DEFINITIONS[0].id;
let focusCount = 0;
let focusSubmitInProgress = false;
let prevPlacedSize = 0;

const getVideoMeta = (): VideoMeta | null => videoModel?.meta ?? null;

const labeler = createLabeler({
    canvas,
    canvasContainer,
    labelPalette: null,
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

window.addEventListener("resize", () => {
    if (canvasContainer.style.display === "none") {
        reserveFrameSpace();
        return;
    }
    fitCanvasToViewport();
    zoom.reset();
});

labeler.onChange(() => {
    const size = labeler.placed.size;
    const added = size > prevPlacedSize;
    prevPlacedSize = size;
    if (DEV_MODE) {
        const meta = getVideoMeta();
        updateDevModeJson(
            meta
                ? buildPayload({ videoUrl: VIDEO_URL, frameIndex, videoMeta: meta, placed: labeler.placed })
                : null
        );
    }
    if (!DEV_MODE && added && labeler.placed.has(focusNodeId) && !focusSubmitInProgress) {
        focusSubmitInProgress = true;
        doFocusSubmit().finally(() => {
            focusSubmitInProgress = false;
        });
    }
});

function updateDemoNav() {
    demoPrevBtn.disabled = demoPosition === 0;
    demoNextBtn.disabled = demoPosition === DEMO_FRAME_COUNT - 1;
    demoCounter.textContent = `${demoPosition + 1} / ${DEMO_FRAME_COUNT}`;
}

function enterDemoMode() {
    demoMode = true;
    reportFrameBtn.hidden = true;
    newFrameBtn.hidden = true;
    demoControls.hidden = false;
    demoCounter.textContent = `1 / ${DEMO_FRAME_COUNT}`;
    demoPrevBtn.disabled = true;
    demoNextBtn.disabled = true;
}

function exitDemoMode() {
    demoMode = false;
    reportFrameBtn.hidden = false;
    newFrameBtn.hidden = false;
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
    if (!DEV_MODE) newFrameBtn.disabled = !enabled;
    if (!DEV_MODE) reportFrameBtn.disabled = !enabled;
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
const SHELL_MAX_WIDTH = 2288;
const ROW_CHROME = 144;
const FRAME_RESERVED_HEIGHT = 220;
const MIN_FRAME_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 150;
const MAX_FRAME_SCALE = 2;
const DEFAULT_FRAME_WIDTH = 960;
const DEFAULT_FRAME_HEIGHT = 540;
const CANVAS_BORDER = 2;

const clampW = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function computeFrameBox(
    w: number,
    h: number
): { frameW: number; frameH: number; sidebarW: number } {
    const availH = Math.max(240, window.innerHeight - FRAME_RESERVED_HEIGHT);
    const usable = Math.max(
        MIN_FRAME_WIDTH,
        Math.min(window.innerWidth, SHELL_MAX_WIDTH) - ROW_CHROME
    );
    const frameCap = Math.min(w * MAX_FRAME_SCALE, (availH / h) * w);

    let sidebarW = SIDEBAR_MAX_WIDTH;
    let frameW = frameCap;
    if (frameCap + SIDEBAR_MAX_WIDTH > usable) {
        sidebarW = clampW(
            (usable * SIDEBAR_MAX_WIDTH) / (frameCap + SIDEBAR_MAX_WIDTH),
            SIDEBAR_MIN_WIDTH,
            SIDEBAR_MAX_WIDTH
        );
        frameW = clampW(usable - sidebarW, MIN_FRAME_WIDTH, frameCap);
    }

    return { frameW, frameH: (frameW / w) * h, sidebarW };
}

function fitCanvasToViewport(): void {
    if (!videoModel) return;
    const { width: w, height: h } = videoModel.meta;
    if (!w || !h) return;
    const { frameW, frameH, sidebarW } = computeFrameBox(w, h);
    displayScale = frameW / w;
    canvas.style.width = `${frameW}px`;
    canvas.style.height = `${frameH}px`;
    if (sidebar) sidebar.style.width = `${sidebarW}px`;
}

function reserveFrameSpace(): void {
    if (canvasContainer.style.display !== "none") return;
    const { frameW, frameH, sidebarW } = computeFrameBox(DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT);
    initialLoading.style.width = `${frameW + CANVAS_BORDER * 2}px`;
    initialLoading.style.height = `${frameH + CANVAS_BORDER * 2}px`;
    if (sidebar) sidebar.style.width = `${sidebarW}px`;
}

reserveFrameSpace();

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
    boxZoomToggleBtn.disabled = false;

    if (DEV_MODE) {
        updateDevModeFlagJson(
            { video_url: VIDEO_URL, frame_index: frameIndex },
            {
                video_url: VIDEO_URL,
                frame_index: frameIndex,
                timestamp: null,
                reason: null,
                details: null,
            }
        );
    }

    setControlsEnabled(true);

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

reportFrameBtn.addEventListener("click", () => {
    const radios = reportFrameModal.querySelectorAll<HTMLInputElement>("input[name='reportReason']");
    radios.forEach((r) => { r.checked = false; });
    reportFrameDetails.hidden = true;
    reportFrameDetails.value = "";
    reportFrameSubmitBtn.disabled = true;
    reportFrameModal.showModal();
});

reportFrameModal.querySelectorAll<HTMLInputElement>("input[name='reportReason']").forEach((radio) => {
    radio.addEventListener("change", () => {
        const isOther = radio.value === "other" && radio.checked;
        reportFrameDetails.hidden = !isOther;
        reportFrameSubmitBtn.disabled = false;
    });
});

reportFrameCancelBtn.addEventListener("click", () => {
    reportFrameModal.close();
});

reportFrameSubmitBtn.addEventListener("click", async () => {
    const selectedRadio = reportFrameModal.querySelector<HTMLInputElement>("input[name='reportReason']:checked");
    if (!selectedRadio) return;
    const reason = selectedRadio.value;
    const details = reportFrameDetails.value.trim();
    if (reason === "other" && !details) {
        reportFrameDetails.focus();
        return;
    }

    reportFrameSubmitBtn.disabled = true;
    try {
        await submitFrameReport({
            video_url: VIDEO_URL,
            frame_index: frameIndex,
            timestamp: new Date().toISOString(),
            reason,
            details: details || undefined,
        });
        reportFrameModal.close();
        showStatus("success", "Frame reported — thank you.");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus("error", `Failed to submit report: ${msg}`);
        reportFrameModal.close();
    } finally {
        reportFrameSubmitBtn.disabled = false;
    }
});

newFrameBtn.addEventListener("click", () => {
    submitNoSubjectPayload({ video_url: VIDEO_URL, frame_index: frameIndex }).catch((err: Error) => {
        console.error("[pozu] no-subject submission failed:", err);
        showStatus("error", `Failed to record no-subject: ${err.message}`);
    });
    loadRandomFrame().catch((err: Error) => {
        console.error(err);
        const msg = err?.message ?? String(err);
        showStatus("error", `Failed to load frame: ${msg}`);
        initialLoading.textContent = `❌ ${msg}. Click 🚫 No Subject Present to retry.`;
        initialLoading.style.display = "flex";
        setControlsEnabled(true);
    });
});

buildFocusPicker();
onAuthChange(() => {
    if (isSignedIn() && demoMode) exitDemoMode();
});
initAuthControl();

// ---- Boot ----
(async () => {
    if (isSignedIn()) {
        reportFrameBtn.hidden = false;
        newFrameBtn.hidden = false;
        if (DEV_MODE) {
            reportFrameBtn.disabled = true;
            newFrameBtn.disabled = true;
        }
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
