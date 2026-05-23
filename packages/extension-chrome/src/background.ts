import { GitHubClient } from "@gitmarks/core";
import { loadSettings } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import { saveBookmark, type PageInfo, type SaveResult } from "./lib/save-flow.js";

interface SaveCurrentPageMessage {
  type: "save-current-page";
  page: PageInfo;
}

type IncomingMessage = SaveCurrentPageMessage;

chrome.runtime.onMessage.addListener(
  (msg: IncomingMessage, _sender, sendResponse) => {
    if (msg?.type !== "save-current-page") return false;
    void handleSavePage(msg.page).then(sendResponse);
    return true; // keep the message channel open for async sendResponse
  },
);

async function handleSavePage(page: PageInfo): Promise<SaveResult> {
  const settings = await loadSettings();
  if (settings == null) {
    return {
      ok: false,
      kind: "auth",
      message: "gitmarks is not configured. Open Options to set up.",
    };
  }
  const machineId = await getMachineId();
  const client = new GitHubClient({
    owner: settings.owner,
    repo: settings.repo,
    token: settings.token,
    branch: settings.branch,
  });
  return saveBookmark(client, settings, page, machineId, new Date().toISOString());
}
