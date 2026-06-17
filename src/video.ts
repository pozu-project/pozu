/**
 * HTML5 `<video>`-backed video model.
 *
 * Earlier revisions tried to use `@talmolab/sleap-io.js`'s `loadVideo`:
 *
 *  - The default backend selection falls back to the HTML5 `<video>`
 *    backend when the URL has no `.mp4` extension (as is the case for
 *    the EMBER S3 blob), and that backend doesn't populate `shape` or
 *    implement `getFrameTimes()`.
 *  - Forcing `backend: "mp4box"` makes `loadVideo` succeed but
 *    `getFrameTimes()` then sits on `await this.ready`, which only
 *    resolves once mp4box has parsed the moov atom. For files where
 *    moov is at the end (as for the EMBER clip), mp4box must walk the
 *    whole file via successive chunk reads — for a video this large,
 *    that exceeds any sensible boot timeout and the user sees the
 *    loading overlay hang forever.
 *
 * The original [`pozoo`](https://github.com/CodyCBakerPhD/pozoo)
 * proof-of-concept uses a plain HTML5 `<video>` element with
 * `currentTime` seeking + `drawImage`, and that's been verified to work
 * against the same EMBER URL. We do the same here. The sleap-io.js
 * data model (`Skeleton`, `Labels`, `Instance`) is still used by
 * `src/payload.ts` for export — only the video decoding step is now
 * driven directly by the browser.
 */
import type { VideoMeta } from "./payload.js";

/** The same EMBER-hosted clip used by the original `pozoo` project. */
export const VIDEO_URL =
    "https://ember-open-data.s3.amazonaws.com/blobs/b28/71c/" +
    "b2871cfe-b785-41cf-9a72-4a94a625fd26";

/** Default FPS assumed for frame-index ↔ time conversion (mirrors `pozoo`). */
export const DEFAULT_FPS = 30;

/** Hard ceiling on how long boot will wait for the `<video>` to be ready. */
const LOAD_TIMEOUT_MS = 45_000;
/** Hard ceiling on how long a single `currentTime` seek may take. */
const SEEK_TIMEOUT_MS = 30_000;

/**
 * Minimal `Video`-like facade exposed to the rest of the app. We only
 * need frame extraction; everything else (skeleton, instance, labels)
 * lives in `payload.ts`.
 */
export interface VideoBackend {
    /** Seek + paint frame `idx` to an offscreen canvas, return a bitmap. */
    getFrame(idx: number): Promise<ImageBitmap | null>;
    /** [N, H, W, C] when known, otherwise `undefined`. */
    readonly shape?: [number, number, number, number];
    readonly fps: number;
}

export interface VideoModel {
    video: VideoBackend;
    meta: VideoMeta;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
            ms
        );
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    }) as Promise<T>;
}

/**
 * Wait for a hidden `<video>` element to download enough of the file
 * that `videoWidth` / `videoHeight` / `duration` are populated.
 */
function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onError = () => {
            const err = video.error;
            const code = err?.code;
            const msg = err?.message;
            reject(
                new Error(
                    `Video element error (code=${code ?? "?"}${msg ? `, "${msg}"` : ""}). ` +
                        `Check that the URL is reachable and CORS allows GET from this origin.`
                )
            );
        };
        const check = () => {
            if (
                video.readyState >= 2 /* HAVE_CURRENT_DATA */ &&
                video.videoWidth > 0 &&
                video.videoHeight > 0 &&
                Number.isFinite(video.duration) &&
                video.duration > 0
            ) {
                cleanup();
                resolve();
            }
        };
        const cleanup = () => {
            video.removeEventListener("loadedmetadata", check);
            video.removeEventListener("loadeddata", check);
            video.removeEventListener("canplay", check);
            video.removeEventListener("error", onError);
        };
        video.addEventListener("loadedmetadata", check);
        video.addEventListener("loadeddata", check);
        video.addEventListener("canplay", check);
        video.addEventListener("error", onError);
        check();
    });
}

/** Seek a `<video>` element and resolve once the seek completes. */
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (Math.abs(video.currentTime - time) < 1e-6) {
            resolve();
            return;
        }
        const onSeeked = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("Video seek failed"));
        };
        const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
        };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        try {
            video.currentTime = time;
        } catch (err) {
            cleanup();
            reject(err as Error);
        }
    });
}

class HtmlVideoBackend implements VideoBackend {
    readonly shape: [number, number, number, number];
    readonly fps: number;
    private readonly _video: HTMLVideoElement;
    private readonly _canvas: HTMLCanvasElement;
    private readonly _ctx: CanvasRenderingContext2D;
    private _seekChain: Promise<void> = Promise.resolve();

    constructor(video: HTMLVideoElement, fps: number) {
        this._video = video;
        this.fps = fps;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const total = Math.max(1, Math.floor(video.duration * fps));
        this.shape = [total, h, w, 3];
        this._canvas = document.createElement("canvas");
        this._canvas.width = w;
        this._canvas.height = h;
        const ctx = this._canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) throw new Error("Failed to get 2D canvas context for frame extraction.");
        this._ctx = ctx;
    }

    async getFrame(idx: number): Promise<ImageBitmap | null> {
        const total = this.shape[0];
        if (idx < 0 || idx >= total) return null;
        // Serialise seeks so concurrent getFrame() calls don't race the
        // single underlying `<video>` element.
        const next = this._seekChain.then(async () => {
            const targetTime = Math.min(
                idx / this.fps,
                Math.max(0, this._video.duration - 1 / (2 * this.fps))
            );
            await withTimeout(seekVideo(this._video, targetTime), SEEK_TIMEOUT_MS, "video seek");
            this._ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
        });
        this._seekChain = next.catch(() => {
            /* swallow so a failed seek doesn't poison subsequent calls */
        });
        await next;
        return await createImageBitmap(this._canvas);
    }
}

export async function loadVideoModel(url: string = VIDEO_URL): Promise<VideoModel> {
    console.info(`[pozu] loadVideoModel: opening ${url} via HTML5 <video>`);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.display = "none";
    // Some servers don't return a useful Content-Type, so the
    // `<source>` `type` hint helps the browser pick the MP4 demuxer.
    const source = document.createElement("source");
    source.src = url;
    source.type = "video/mp4";
    video.appendChild(source);
    document.body.appendChild(video);

    try {
        await withTimeout(waitForVideoReady(video), LOAD_TIMEOUT_MS, "video metadata");
    } catch (err) {
        video.remove();
        throw err;
    }

    const fps = DEFAULT_FPS;
    const backend = new HtmlVideoBackend(video, fps);
    console.info(
        `[pozu] HTML5 video ready: shape=${JSON.stringify(backend.shape)} ` +
            `duration=${video.duration.toFixed(2)}s fps=${fps} (assumed)`
    );
    return {
        video: backend,
        meta: {
            fps,
            totalFrames: backend.shape[0],
            width: backend.shape[2],
            height: backend.shape[1],
        },
    };
}

/**
 * Total-frame count is known up-front for the HTML5 backend, so this
 * is a no-op refresh that just returns the cached value.
 */
export async function refreshTotalFrames(model: VideoModel): Promise<number> {
    return model.meta.totalFrames | 0;
}
