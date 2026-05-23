import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "gitmarks",
  version: "0.0.1",
  description: "Save bookmarks to your own GitHub repo.",
  permissions: ["storage", "activeTab"],
  host_permissions: ["https://api.github.com/*"],
  action: {
    default_popup: "src/popup.html",
    default_title: "gitmarks",
  },
  options_page: "src/options.html",
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
