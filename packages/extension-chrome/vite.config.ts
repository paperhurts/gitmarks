import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
