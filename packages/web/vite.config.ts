import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Inject a strict Content-Security-Policy <meta> tag only at production build
// time. Doing this in index.html directly would break Vite's HMR WebSocket
// (ws://localhost:*) which is not in `connect-src`. `frame-ancestors` is
// deliberately omitted: <meta> can't enforce it per CSP3 — that defense must
// come from an HTTP header at the hosting layer (GitHub Pages / Cloudflare).
function injectProdCsp(): Plugin {
  const csp =
    "default-src 'self'; " +
    "connect-src https://api.github.com; " +
    "img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; " +
    "base-uri 'self'; " +
    "form-action 'none'; " +
    "object-src 'none';";
  return {
    name: "gitmarks:inject-prod-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), injectProdCsp()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
