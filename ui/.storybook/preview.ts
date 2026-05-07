import type { Preview } from "@storybook/react";
import "../apps/pipeline-console/styles/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "canvas",
      values: [
        { name: "canvas", value: "#F7F8FA" },
        { name: "panel", value: "#FFFFFF" },
      ],
    },
  },
};

export default preview;
