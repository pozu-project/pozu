import { authHeader, clearToken, notifyAuthChange } from "./auth.js";

export const FRAME_REPORT_API_URL =
    "https://pozu-codycbakerphd.pythonanywhere.com/api/v1/reports";

export interface FrameReportPayload {
    video_url: string;
    frame_index: number;
    timestamp?: string;
    reason: string;
    details?: string;
}

export async function submitFrameReport(
    payload: FrameReportPayload,
    fetchImpl: typeof fetch = fetch
): Promise<void> {
    const response = await fetchImpl(FRAME_REPORT_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...authHeader(),
        },
        body: JSON.stringify(payload),
    });

    if (response.ok) return;

    if (response.status === 401) {
        clearToken();
        notifyAuthChange();
        throw new Error("Your session has expired — please sign in with GitHub again.");
    }

    const detail = (await response.text()).trim();
    throw new Error(
        detail
            ? `Server rejected report (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected report (${response.status} ${response.statusText}).`
    );
}
