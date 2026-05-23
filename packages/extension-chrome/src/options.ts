import {
  GitHubClient,
  GitHubAuthError,
  GitHubError,
  GitHubNotFoundError,
} from "@gitmarks/core";
import { loadSettings, saveSettings, SettingsCorruptError, type Settings } from "./lib/settings.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el == null) throw new Error(`#${id} not found`);
  return el as T;
};

const tokenInput = $<HTMLInputElement>("token");
const ownerInput = $<HTMLInputElement>("owner");
const repoInput = $<HTMLInputElement>("repo");
const branchInput = $<HTMLInputElement>("branch");
const validateBtn = $<HTMLButtonElement>("validate");
const saveBtn = $<HTMLButtonElement>("save");
const status = $<HTMLParagraphElement>("status");

function readForm(): Settings {
  return {
    token: tokenInput.value.trim(),
    owner: ownerInput.value.trim(),
    repo: repoInput.value.trim(),
    branch: branchInput.value.trim() || "main",
  };
}

function setStatus(msg: string, kind: "ok" | "err" | "neutral"): void {
  status.textContent = msg;
  status.className = kind === "neutral" ? "" : kind;
}

async function loadIntoForm(): Promise<void> {
  let s;
  try {
    s = await loadSettings();
  } catch (err) {
    if (err instanceof SettingsCorruptError) {
      // Clear all form fields so the user can re-enter valid settings.
      tokenInput.value = "";
      ownerInput.value = "";
      repoInput.value = "";
      branchInput.value = "";
      setStatus("Stored settings are corrupted — please reconfigure.", "err");
      return;
    }
    throw err;
  }
  if (s == null) return;
  tokenInput.value = s.token;
  ownerInput.value = s.owner;
  repoInput.value = s.repo;
  branchInput.value = s.branch;
}

validateBtn.addEventListener("click", async () => {
  setStatus("validating…", "neutral");
  let s: Settings;
  try {
    s = readForm();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "err");
    return;
  }
  const client = new GitHubClient(s);
  try {
    await client.read("bookmarks.json");
    setStatus("✓ valid PAT, repo exists, bookmarks.json found", "ok");
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      setStatus(
        "✓ valid PAT, repo exists (bookmarks.json not yet created — will be on first save)",
        "ok",
      );
      return;
    }
    console.error("[gitmarks] validate failed", err);
    if (err instanceof GitHubAuthError) {
      setStatus(
        "PAT rejected — check the token is valid and has 'Contents: Read and write' scope on this repo.",
        "err",
      );
      return;
    }
    if (err instanceof GitHubError && err.status >= 500) {
      setStatus(
        `GitHub is having issues (${err.status}). Try again in a minute.`,
        "err",
      );
      return;
    }
    if (err instanceof Error && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"))) {
      setStatus("Network error — check your connection and try again.", "err");
      return;
    }
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    await saveSettings(readForm());
    setStatus("✓ saved", "ok");
  } catch (err) {
    console.error("[gitmarks] save settings failed", err);
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

void loadIntoForm();
