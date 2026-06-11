import type { StorybookConfig } from "@storybook/html-vite";

const config: StorybookConfig = {
    stories: ["../../stories/**/*.stories.@(js|ts)"],
    staticDirs: ["../../public"],
    addons: [],
    framework: {
        name: "@storybook/html-vite",
        options: {},
    },
};

export default config;
