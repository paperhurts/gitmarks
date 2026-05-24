import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "esnext",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "src/popup.html"),
        options: resolve(__dirname, "src/options.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
