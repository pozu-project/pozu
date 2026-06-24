import type { BoxPayload } from "./box-payload.js";
import { authHeader, clearToken, notifyAuthChange } from "./auth.js";

export const BOX_ANNOTATION_API_URL =
    "https://pozu-codycbakerphd.pythonanywhere.com/api/v1/annotations/bbox";

export async function submitBoxPayload(
    payload: BoxPayload,
    fetchImpl: typeof fetch = fetch
): Promise<void> {
    const response = await fetchImpl(BOX_ANNOTATION_API_URL, {
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
            ? `Server rejected submission (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected submission (${response.status} ${response.statusText}).`
    );
}
