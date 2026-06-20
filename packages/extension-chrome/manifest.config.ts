import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "gitmarks",
  version: "1.0.0",
  description: "Save bookmarks to your own GitHub repo. No server, no account — your data is a file in a repo you control.",
  homepage_url: "https://github.com/paperhurts/gitmarks",
  permissions: ["storage", "activeTab", "bookmarks", "alarms"],
  // "tabs" is requested on demand (only when the user clicks "Save all tabs"),
  // so the install prompt doesn't warn about reading browsing history.
  optional_permissions: ["tabs"],
  host_permissions: ["https://api.github.com/*"],
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup.html",
    default_title: "gitmarks",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  },
  options_page: "src/options.html",
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https://api.github.com",
  },
});
