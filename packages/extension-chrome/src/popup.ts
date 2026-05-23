import { loadSettings } from "./lib/settings.js";
import type { SaveResult } from "./lib/save-flow.js";

const root = document.getElementById("root");
if (root == null) throw new Error("#root not found");

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function render(): Promise<void> {
  const settings = await loadSettings();
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

  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const status = document.getElementById("status")!;

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    status.className = "";
    status.textContent = "";
    const result: SaveResult = await chrome.runtime.sendMessage({
      type: "save-current-page",
      page: { url: tab.url!, title: tab.title ?? tab.url! },
    });
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

void render();
