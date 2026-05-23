import { GitHubClient, GitHubNotFoundError } from "@gitmarks/core";
import { loadSettings, saveSettings, type Settings } from "./lib/settings.js";

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
  const s = await loadSettings();
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
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    await saveSettings(readForm());
    setStatus("✓ saved", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

void loadIntoForm();
