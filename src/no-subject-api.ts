import { authHeader, clearToken, notifyAuthChange } from "./auth.js";

export const NO_SUBJECT_API_URL =
    "https://pozu-codycbakerphd.pythonanywhere.com/api/v1/annotations/no-subject";

export interface NoSubjectPayload {
    video_url: string;
    frame_index: number;
}

export async function submitNoSubjectPayload(
    payload: NoSubjectPayload,
    fetchImpl: typeof fetch = fetch
): Promise<void> {
    const response = await fetchImpl(NO_SUBJECT_API_URL, {
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
            ? `Server rejected no-subject annotation (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected no-subject annotation (${response.status} ${response.statusText}).`
    );
}
