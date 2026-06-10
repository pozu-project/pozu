import type { BackendPayload } from "./payload.js";

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
        },
        body: JSON.stringify(payload),
    });

    if (response.ok) return;

    console.error("[pozu] label submission payload:", JSON.stringify(payload, null, 2));

    const detail = (await response.text()).trim();
    throw new Error(
        detail
            ? `Server rejected submission (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected submission (${response.status} ${response.statusText}).`
    );
}
