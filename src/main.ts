/**
 * Boot script for the labeling page. Wires together the DOM, the
 * labeler module, and the sleap-io.js-backed video loader.
 */
import "./styles.css";
import { createLabeler } from "./labeler.js";
import { loadVideoModel, refreshTotalFrames, VIDEO_URL, type VideoModel } from "./video.js";
import { buildPayload, pickRandomFrame, type VideoMeta } from "./payload.js";
import { submitLabelPayload } from "./label-api.js";
import { LABEL_DEFINITIONS } from "./skeleton.js";

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
setStage("Booting pozu… (loading sleap-io.js bundle)");

// ---- App state ----
let videoModel: VideoModel | null = null;
let frameIndex = 0;
let displayScale = 1;

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
    displayScale = scale;
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;

    frameIndex = idx;
    labeler.clearAll();
    canvasContainer.style.display = "inline-block";
    initialLoading.style.display = "none";

    frameInfo.textContent =
        `Frame ${idx} / ${meta.totalFrames}  ` + `(${w}×${h} @ ${meta.fps.toFixed(2)} fps)`;
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

// ---- Boot ----
(async () => {
    try {
        await ensureVideoModel();
        await loadRandomFrame();
    } catch (err) {
        console.error(err);
        const msg = (err as Error).message;
        initialLoading.textContent = `❌ Failed to load video via sleap-io.js: ${msg}. Click 🚫 No Subject Present to retry.`;
        showStatus("error", msg);
        // Re-enable controls so the user can retry instead of being
        // permanently stuck on the loading overlay.
        newFrameBtn.disabled = false;
        resetBtn.disabled = false;
        downloadBtn.disabled = false;
    }
})();
