import type { BackendPayload } from "./payload.js";
import { authHeader, clearToken, notifyAuthChange } from "./auth.js";

export const LABEL_ANNOTATION_API_URL =
    "https://pozu-codycbakerphd.pythonanywhere.com/api/v1/annotations/labels";

export async function submitLabelPayload(
    payload: BackendPayload,
    fetchImpl: typeof fetch = fetch
): Promise<void> {
    const response = await fetchImpl(LABEL_ANNOTATION_API_URL, {
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

    console.error("[pozu] label submission payload:", JSON.stringify(payload, null, 2));

    const detail = (await response.text()).trim();
    throw new Error(
        detail
            ? `Server rejected submission (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected submission (${response.status} ${response.statusText}).`
    );
}
