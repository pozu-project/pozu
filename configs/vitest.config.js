import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: resolve(__dirname, ".."),
    plugins: [react()],
    test: {
        environment: "jsdom",
        globals: true,
        include: ["tests/unit/**/*.test.{js,ts,tsx}"],
        setupFiles: ["tests/unit/setup.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            include: ["src/**/*.{js,ts,tsx}"],
            exclude: ["src/main.ts", "src/labeler.ts", "src/admin/main.tsx"],
        },
    },
});
