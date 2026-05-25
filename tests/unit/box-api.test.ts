import { describe, expect, it, vi } from "vitest";
import { BOX_ANNOTATION_API_URL, submitBoxPayload } from "../../src/box-api.ts";

const payload = {
    video_url: "https://example.com/video.mp4",
    frame_index: 7,
    total_frames: 100,
    fps: 30,
    frame_width: 640,
    frame_height: 480,
    timestamp: "2024-01-02T03:04:05.000Z",
    box: { x: 10, y: 20, width: 100, height: 50 },
};

describe("submitBoxPayload", () => {
    it("posts JSON to the bbox annotation endpoint", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

        await submitBoxPayload(payload, fetchMock as unknown as typeof fetch);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(BOX_ANNOTATION_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
        });
    });

    it("throws with response detail when the server rejects the payload", async () => {
        const fetchMock = vi.fn(
            async () => new Response("bad payload", { status: 400, statusText: "Bad Request" })
        );

        await expect(
            submitBoxPayload(payload, fetchMock as unknown as typeof fetch)
        ).rejects.toThrow("Server rejected submission (400 Bad Request): bad payload");
    });
});
