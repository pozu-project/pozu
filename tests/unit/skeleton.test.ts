import { describe, it, expect } from "vitest";
import { LABEL_DEFINITIONS } from "../../src/skeleton.ts";

describe("LABEL_DEFINITIONS", () => {
    it("exposes the six required pozoo labels", () => {
        const ids = new Set(LABEL_DEFINITIONS.map((d) => d.id));
        for (const required of [
            "left_front_paw",
            "right_front_paw",
            "left_hind_paw",
            "right_hind_paw",
            "nose",
            "tail_base",
        ]) {
            expect(ids.has(required)).toBe(true);
        }
    });
});
