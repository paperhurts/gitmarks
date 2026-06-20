import browser from "webextension-polyfill";
import { GitHubClient } from "@gitmarks/core";
import { loadSettings, SettingsCorruptError } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import {
  saveBookmark,
  saveAllTabs,
  type SaveResult,
  type SaveAllTabsResult,
} from "./lib/save-flow.js";
import { applySaveResult, applySaveAllResult } from "./lib/save-result-view.js";
import type { LastErrorRecord } from "./lib/background-core.js";

const root = document.getElementById("root");
if (root == null) throw new Error("#root not found");

async function getActiveTab(): Promise<browser.Tabs.Tab | null> {
  // When opened as a real extension popup, currentWindow refers to the
  // browser window the user was in (not the popup's own floating window),
  // so this returns the tab they were viewing. activeTab grants access to
  // title + url for that one tab on user-gesture popup open; no broader
  // tabs permission is required.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab != null && tab.url != null && !tab.url.startsWith("chrome-extension://")) {
    return tab;
  }
  return null;
}

async function render(): Promise<void> {
  let settings;
  try {
    settings = await loadSettings();
  } catch (err) {
    if (err instanceof SettingsCorruptError) {
      root!.innerHTML = `<p class="err">Settings are corrupted — please reconfigure gitmarks.</p>
        <button id="setup">Open settings</button>`;
      document.getElementById("setup")?.addEventListener("click", () => {
        browser.runtime.openOptionsPage();
        window.close();
      });
      return;
    }
    throw err;
  }
  if (settings == null) {
    root!.innerHTML = `
      <p class="title">Welcome to gitmarks.</p>
      <button id="setup">Set up gitmarks</button>
    `;
    document.getElementById("setup")!.addEventListener("click", () => {
      browser.runtime.openOptionsPage();
      window.close();
    });
    return;
  }

  const tab = await getActiveTab();
  if (tab == null || tab.url == null) {
    root!.innerHTML = `<p id="status" class="err">No active tab.</p>`;
    return;
  }

  root!.innerHTML = `
    <p class="title" title="${escapeAttr(tab.title ?? tab.url)}">${escapeText(tab.title ?? tab.url)}</p>
    <button id="save">Save this page</button>
    <button id="save-all" class="secondary">Save all tabs</button>
    <p id="status"></p>
  `;

  const errStored = await browser.storage.local.get("gitmarks:lastError");
  const lastErr = errStored["gitmarks:lastError"] as LastErrorRecord | undefined;
  if (lastErr != null) {
    const banner = document.createElement("p");
    banner.className = "err";
    banner.style.fontSize = "0.8rem";
    banner.style.marginTop = "0.5rem";
    const label = lastErr.kind === "auth" ? "Background sync auth failed" : `Background ${lastErr.source} failed`;
    banner.textContent = `${label}: ${lastErr.message}`;
    root!.appendChild(banner);
  }

  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const saveAllBtn = document.getElementById("save-all") as HTMLButtonElement;
  const status = document.getElementById("status")!;

  const makeClient = () =>
    new GitHubClient({
      owner: settings.owner,
      repo: settings.repo,
      token: settings.token,
      branch: settings.branch,
    });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    status.className = "";
    status.textContent = "";
    let result: SaveResult;
    try {
      const machineId = await getMachineId();
      result = await saveBookmark(
        makeClient(),
        { url: tab.url!, title: tab.title ?? tab.url! },
        machineId,
        new Date().toISOString(),
        { stripTrackingParams: settings.stripTrackingParams },
      );
    } catch (err) {
      result = {
        ok: false,
        kind: "unknown",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    applySaveResult(saveBtn, status, result);
  });

  saveAllBtn.addEventListener("click", async () => {
    // Reading every tab's url/title needs the "tabs" permission, which is
    // *optional* (kept out of the install prompt). Request it on this user
    // gesture the first time. Requesting from a popup can close the popup when
    // the prompt appears; if so the grant still sticks, and the next click sees
    // it already granted and proceeds.
    if (!(await browser.permissions.contains({ permissions: ["tabs"] }))) {
      const granted = await browser.permissions.request({ permissions: ["tabs"] });
      if (!granted) {
        status.className = "err";
        status.textContent = "Allow tab access to save all tabs.";
        return;
      }
    }
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = "saving all…";
    status.className = "";
    status.textContent = "";
    let result: SaveAllTabsResult;
    try {
      const machineId = await getMachineId();
      // currentWindow only — cross-window is out of scope.
      const tabs = await browser.tabs.query({ currentWindow: true });
      // Only real web pages. isSafeBookmarkUrl (the XSS guard) also allows
      // chrome:/about:/extension schemes, but those aren't useful bookmarks —
      // so restrict the batch to http(s) here. saveAllTabs still applies the
      // safety guard as defense in depth.
      const pages = tabs
        .filter(
          (t): t is browser.Tabs.Tab & { url: string } =>
            t.url != null && /^https?:\/\//i.test(t.url),
        )
        .map((t) => ({ url: t.url, title: t.title ?? t.url }));
      const nowIso = new Date().toISOString();
      result = await saveAllTabs(makeClient(), pages, machineId, nowIso, {
        stripTrackingParams: settings.stripTrackingParams,
        folder: `Session ${nowIso.slice(0, 10)}`,
      });
    } catch (err) {
      result = {
        ok: false,
        kind: "unknown",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    applySaveAllResult(saveAllBtn, status, result);
  });
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

render().catch((err) => {
  console.error("[gitmarks] popup render failed", err);
  if (root != null) {
    root.innerHTML = `<p class="err">Something went wrong opening gitmarks. Please reload the extension.</p>`;
  }
});
