import { afterEach, describe, expect, it, vi } from "vitest";
import { LABEL_ANNOTATION_API_URL, submitLabelPayload } from "../../src/label-api.ts";
import type { BackendPayload } from "../../src/payload.ts";

const payload: BackendPayload = {
    video_url: "https://example.com/video.mp4",
    frame_index: 42,
    total_frames: 1000,
    fps: 30,
    frame_width: 1280,
    frame_height: 720,
    timestamp: "2024-01-02T03:04:05.000Z",
    labels: [],
};

describe("submitLabelPayload", () => {
    afterEach(() => {
        localStorage.clear();
    });

    it("posts JSON to the labels annotation endpoint", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

        await submitLabelPayload(payload, fetchMock as unknown as typeof fetch);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(LABEL_ANNOTATION_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
        });
    });

    it("attaches a bearer header when a token is stored", async () => {
        localStorage.setItem("pozu.auth.token", "header.eyJleHAiOjk5OTk5OTk5OTl9.sig");
        const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

        await submitLabelPayload(payload, fetchMock as unknown as typeof fetch);

        expect(fetchMock).toHaveBeenCalledWith(
            LABEL_ANNOTATION_API_URL,
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer header.eyJleHAiOjk5OTk5OTk5OTl9.sig",
                }),
            })
        );
    });

    it("clears the token and throws on 401", async () => {
        localStorage.setItem("pozu.auth.token", "header.eyJleHAiOjk5OTk5OTk5OTl9.sig");
        const fetchMock = vi.fn(
            async () => new Response("", { status: 401, statusText: "Unauthorized" })
        );

        await expect(
            submitLabelPayload(payload, fetchMock as unknown as typeof fetch)
        ).rejects.toThrow("Your session has expired");
        expect(localStorage.getItem("pozu.auth.token")).toBeNull();
    });

    it("throws with response detail when the server rejects the payload", async () => {
        const fetchMock = vi.fn(
            async () => new Response("bad payload", { status: 400, statusText: "Bad Request" })
        );

        await expect(
            submitLabelPayload(payload, fetchMock as unknown as typeof fetch)
        ).rejects.toThrow("Server rejected submission (400 Bad Request): bad payload");
    });
});
