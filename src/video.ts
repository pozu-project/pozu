/**
 * Thin wrapper around `@talmolab/sleap-io.js`'s `loadVideo` that:
 *
 *  - Forces the Mp4Box backend. The EMBER S3 URL has no `.mp4`
 *    extension, so the auto-selection would fall back to the HTML5
 *    `<video>` backend, which never populates `shape` or implements
 *    `getFrameTimes()` — making it impossible to compute a random
 *    frame index.
 *  - Re-derives `totalFrames` lazily, because the Mp4Box backend
 *    populates `samples` / `shape` only after the moov box is parsed,
 *    which can race the initial `loadVideo` return.
 */
import { loadVideo, type Video } from "@talmolab/sleap-io.js";
import type { VideoMeta } from "./payload.js";

export interface VideoModel {
    video: Video;
    meta: VideoMeta;
}

/** The same EMBER-hosted clip used by the original `pozoo` project. */
export const VIDEO_URL =
    "https://ember-open-data.s3.amazonaws.com/blobs/59e/7d8/" +
    "59e7d85b-6827-4e62-977a-bab97c54df82";

/**
 * Wrap a promise so that it rejects after `ms` if it hasn't settled.
 * The underlying operation isn't cancelled — sleap-io.js's mp4box
 * backend has no abort hook — but we surface a real error to the boot
 * path so the UI can recover instead of hanging on the loading
 * overlay forever.
 */
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

/** Hard ceiling on how long boot will wait for sleap-io.js to open the EMBER clip. */
const LOAD_TIMEOUT_MS = 45_000;

export async function loadVideoModel(url: string = VIDEO_URL): Promise<VideoModel> {
    const video = await withTimeout(
        loadVideo(url, { backend: "mp4box" }),
        LOAD_TIMEOUT_MS,
        "loadVideo"
    );
    const times =
        (await withTimeout(
            Promise.resolve(video.getFrameTimes()),
            LOAD_TIMEOUT_MS,
            "getFrameTimes"
        )) ?? null;
    const shape = video.shape;
    const totalFrames = times?.length ?? shape?.[0] ?? 0;
    let fps = video.fps;
    if (fps == null || !Number.isFinite(fps)) {
        if (times && times.length > 1) {
            fps = (times.length - 1) / (times[times.length - 1] - times[0]);
        } else {
            fps = 30;
        }
    }
    return {
        video,
        meta: {
            fps,
            totalFrames,
            width: shape?.[2] ?? 0,
            height: shape?.[1] ?? 0,
        },
    };
}

/**
 * Ask the backend for the latest known frame count, updating `meta`
 * in-place if a fresh value is available. Returns the resolved count
 * (which may still be `0` if the backend hasn't decoded the moov box
 * yet).
 */
export async function refreshTotalFrames(model: VideoModel): Promise<number> {
    let total = model.meta.totalFrames | 0;
    if (total < 2) {
        const times = (await model.video.getFrameTimes()) ?? null;
        const shape = model.video.shape;
        total = times?.length ?? shape?.[0] ?? 0;
        if (total) {
            model.meta.totalFrames = total;
            if (shape) {
                model.meta.width = model.meta.width || shape[2] || 0;
                model.meta.height = model.meta.height || shape[1] || 0;
            }
        }
    }
    return total;
}
