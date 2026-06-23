import type { BoxPayload } from "./box-payload.js";
import { authHeader, clearToken, AuthError } from "./auth.js";

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

    // A rejected token is an auth problem, not a payload problem: drop it
    // so the UI falls back to a signed-out state and prompts re-login.
    if (response.status === 401) {
        clearToken();
        throw new AuthError();
    }

    const detail = (await response.text()).trim();
    throw new Error(
        detail
            ? `Server rejected submission (${response.status} ${response.statusText}): ${detail}`
            : `Server rejected submission (${response.status} ${response.statusText}).`
    );
}
