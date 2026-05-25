import { describe, expect, it, vi } from "vitest";
import { LABEL_ANNOTATION_API_URL, submitLabelPayload } from "../../src/label-api.ts";

const labelsFileContent = "AQIDBA==";
const videoUrl = "https://example.com/video.mp4";

describe("submitLabelPayload", () => {
    it("posts JSON to the labels annotation endpoint", async () => {
        const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

        await submitLabelPayload(videoUrl, labelsFileContent, fetchMock as unknown as typeof fetch);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(LABEL_ANNOTATION_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                video_url: videoUrl,
                labels_file_content: labelsFileContent,
            }),
        });
    });

    it("throws with response detail when the server rejects the payload", async () => {
        const fetchMock = vi.fn(
            async () => new Response("bad payload", { status: 400, statusText: "Bad Request" })
        );

        await expect(
            submitLabelPayload(videoUrl, labelsFileContent, fetchMock as unknown as typeof fetch)
        ).rejects.toThrow("Server rejected submission (400 Bad Request): bad payload");
    });
});
