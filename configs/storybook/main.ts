import type { StorybookConfig } from "@storybook/html-vite";

const config: StorybookConfig = {
    stories: ["../../stories/**/*.stories.@(js|ts)"],
    staticDirs: ["../../src"],
    addons: [],
    framework: {
        name: "@storybook/html-vite",
        options: {},
    },
};

export default config;
