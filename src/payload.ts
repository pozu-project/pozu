/**
 * Pure builders for the JSON payload sent to `backend.py`.
 * Kept side-effect-free so they can be exercised by unit tests under `tests/unit/`.
 */
import { LABEL_DEFINITIONS } from "./skeleton.js";

/** Per-node placement coordinates in original-video pixel space. */
export interface PlacedPoint {
    pixelX: number;
    pixelY: number;
}

export interface VideoMeta {
    fps: number;
    totalFrames: number;
    width: number;
    height: number;
}

export interface BackendPayloadLabel {
    id: string;
    name: string;
    placed: boolean;
    pixel_x: number | null;
    pixel_y: number | null;
}

export interface BackendPayload {
    video_url: string;
    frame_index: number;
    total_frames: number;
    fps: number;
    frame_width: number;
    frame_height: number;
    timestamp: string;
    labels: BackendPayloadLabel[];
}

export interface BuildPayloadOptions {
    videoUrl: string;
    frameIndex: number;
    videoMeta: VideoMeta | null;
    placed: ReadonlyMap<string, PlacedPoint>;
    /** Defaults to `new Date().toISOString()`. Injected for deterministic tests. */
    now?: () => string;
}

/**
 * Build the backend payload — shape matches the Flask receiver in
 * `backend.py`, which itself mirrors the original pozoo schema.
 */
export function buildPayload(opts: BuildPayloadOptions): BackendPayload {
    const labels: BackendPayloadLabel[] = LABEL_DEFINITIONS.map((def) => {
        const entry = opts.placed.get(def.id);
        return {
            id: def.id,
            name: def.name,
            placed: !!entry,
            pixel_x: entry ? entry.pixelX : null,
            pixel_y: entry ? entry.pixelY : null,
        };
    });
    const now = opts.now ?? (() => new Date().toISOString());
    return {
        video_url: opts.videoUrl,
        frame_index: opts.frameIndex,
        total_frames: opts.videoMeta?.totalFrames ?? 0,
        fps: opts.videoMeta?.fps ?? 0,
        frame_width: opts.videoMeta?.width ?? 0,
        frame_height: opts.videoMeta?.height ?? 0,
        timestamp: now(),
        labels,
    };
}

/**
 * Pick a random frame index in `[0, total)` that is not equal to
 * `previous` when possible. Pure function: pass `rng` (defaults to
 * `Math.random`) so tests can pin the result.
 */
export function pickRandomFrame(
    total: number,
    previous: number,
    rng: () => number = Math.random
): number {
    if (!Number.isFinite(total) || total <= 0) return 0;
    if (total === 1) return 0;
    let idx = Math.floor(rng() * total);
    for (let tries = 0; tries < 10 && idx === previous; tries++) {
        idx = Math.floor(rng() * total);
    }
    return idx;
}
