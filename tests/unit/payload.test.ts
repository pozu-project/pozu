import { describe, it, expect } from "vitest";
import { saveSlpToBytes } from "@talmolab/sleap-io.js";
import { buildLabelsObject, buildPayload, pickRandomFrame } from "../../src/payload.ts";
import { buildSkeleton } from "../../src/skeleton.ts";
import { LABEL_DEFINITIONS } from "../../src/skeleton.ts";

const VIDEO_URL = "https://example.com/video.mp4";

describe("buildPayload", () => {
    it("emits a row per label definition in canonical order", () => {
        const payload = buildPayload({
            videoUrl: VIDEO_URL,
            frameIndex: 7,
            videoMeta: { fps: 30, totalFrames: 100, width: 640, height: 480 },
            placed: new Map(),
            now: () => "2024-01-02T03:04:05.000Z",
        });
        expect(payload.labels.map((l) => l.id)).toEqual(LABEL_DEFINITIONS.map((d) => d.id));
        expect(payload.labels.every((l) => l.placed === false)).toBe(true);
        expect(payload.labels.every((l) => l.pixel_x === null && l.pixel_y === null)).toBe(true);
    });

    it("includes pixel coords for placed points", () => {
        const placed = new Map([["nose", { pixelX: 123, pixelY: 45 }]]);
        const payload = buildPayload({
            videoUrl: VIDEO_URL,
            frameIndex: 0,
            videoMeta: { fps: 30, totalFrames: 100, width: 640, height: 480 },
            placed,
            now: () => "2024-01-02T03:04:05.000Z",
        });
        const nose = payload.labels.find((l) => l.id === "nose")!;
        expect(nose).toMatchObject({ placed: true, pixel_x: 123, pixel_y: 45 });
    });

    it("falls back to zeros when videoMeta is null", () => {
        const payload = buildPayload({
            videoUrl: VIDEO_URL,
            frameIndex: 0,
            videoMeta: null,
            placed: new Map(),
            now: () => "2024-01-02T03:04:05.000Z",
        });
        expect(payload).toMatchObject({
            total_frames: 0,
            fps: 0,
            frame_width: 0,
            frame_height: 0,
            timestamp: "2024-01-02T03:04:05.000Z",
        });
    });
});

describe("pickRandomFrame", () => {
    it("returns 0 when total is 0 or 1", () => {
        expect(pickRandomFrame(0, 0)).toBe(0);
        expect(pickRandomFrame(1, 0)).toBe(0);
    });

    it("returns an index in [0, total) for a deterministic RNG", () => {
        const rng = () => 0.42;
        expect(pickRandomFrame(100, 0, rng)).toBe(42);
    });

    it("avoids re-picking the previous frame when possible", () => {
        // First two calls of rng() return previous (5), third returns 0.7.
        let i = 0;
        const seq = [0.05, 0.05, 0.7];
        const rng = () => seq[i++ % seq.length];
        const result = pickRandomFrame(100, 5, rng);
        expect(result).toBe(70);
    });
});

describe("buildLabelsObject", () => {
    it("produces Labels that can be exported to .slp bytes", async () => {
        const labels = buildLabelsObject({
            videoUrl: VIDEO_URL,
            frameIndex: 12,
            videoMeta: { fps: 30, totalFrames: 100, width: 640, height: 480 },
            placed: new Map([["nose", { pixelX: 123, pixelY: 45 }]]),
            skeleton: buildSkeleton(),
        });

        const bytes = await saveSlpToBytes(labels);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.byteLength).toBeGreaterThan(0);
    });
});
