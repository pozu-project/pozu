/**
 * Skeleton definition for pozu: node IDs must match the
 * REQUIRED_LABEL_IDS set enforced by `backend.py` (and the original
 * pozoo schema).
 *
 * This module is pure data and is the canonical source-of-truth
 * for the labeling UI and the JSON payload.
 */
export interface LabelDefinition {
    id: string;
    name: string;
    color: string;
}

export const LABEL_DEFINITIONS: readonly LabelDefinition[] = [
    { id: "left_front_paw", name: "Left Front Paw", color: "#ff4444" },
    { id: "right_front_paw", name: "Right Front Paw", color: "#44ff44" },
    { id: "left_hind_paw", name: "Left Hind Paw", color: "#4488ff" },
    { id: "right_hind_paw", name: "Right Hind Paw", color: "#ffff44" },
    { id: "nose", name: "Nose", color: "#ff44ff" },
    { id: "tail_base", name: "Tail Base", color: "#44ffff" },
];

/** Edges drawn between nodes — purely for visualization / model fidelity. */
export const EDGE_DEFINITIONS: ReadonlyArray<readonly [string, string]> = [
    ["nose", "tail_base"],
    ["nose", "left_front_paw"],
    ["nose", "right_front_paw"],
    ["tail_base", "left_hind_paw"],
    ["tail_base", "right_hind_paw"],
];

