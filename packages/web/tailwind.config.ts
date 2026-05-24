import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",
        mist: "#16161e",
        fog: "#23232e",
        cyan: { DEFAULT: "#22d3ee", soft: "#67e8f9" },
        magenta: { DEFAULT: "#e879f9", soft: "#f0abfc" },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
