import { GitHubClient } from "@gitmarks/core";
import { loadSettings, SettingsCorruptError } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import { saveBookmark, type SaveResult } from "./lib/save-flow.js";

const root = document.getElementById("root");
if (root == null) throw new Error("#root not found");

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  // When opened as a real extension popup, currentWindow refers to the browser
  // window the user was in (not the popup's own floating window), so this gives
  // the tab the user was viewing.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab != null && tab.url != null && !tab.url.startsWith("chrome-extension://")) {
    return tab;
  }
  // Fallback for cases where the popup is opened as a tab (e.g., in tests):
  // return the most recently accessed regular tab.
  const allTabs = await chrome.tabs.query({});
  const regularTabs = allTabs
    .filter(t => t.url != null && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("about:"))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return regularTabs[0] ?? null;
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
        chrome.runtime.openOptionsPage();
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
      chrome.runtime.openOptionsPage();
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
    <p id="status"></p>
  `;

  const errStored = await chrome.storage.local.get("gitmarks:lastError");
  const lastErr = errStored["gitmarks:lastError"] as { message: string; source: string; kind?: string } | undefined;
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
  const status = document.getElementById("status")!;

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    status.className = "";
    status.textContent = "";
    let result: SaveResult;
    try {
      const machineId = await getMachineId();
      const client = new GitHubClient({
        owner: settings.owner,
        repo: settings.repo,
        token: settings.token,
        branch: settings.branch,
      });
      result = await saveBookmark(
        client,
        { url: tab.url!, title: tab.title ?? tab.url! },
        machineId,
        new Date().toISOString(),
      );
    } catch (err) {
      result = {
        ok: false,
        kind: "unknown",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    if (result.ok) {
      status.className = "ok";
      status.textContent = "✓ saved";
    } else {
      status.className = "err";
      status.textContent = result.message;
      saveBtn.disabled = false;
      saveBtn.textContent = "Try again";
    }
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
