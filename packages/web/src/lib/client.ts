import { GitHubAuthError, GitHubClient, GitHubNotFoundError } from "@gitmarks/core";
import type { Settings } from "./settings.js";

export type ValidateResult =
  | { status: "ok-with-files" }
  | { status: "ok-no-files" }
  | { status: "auth-failed" }
  | { status: "repo-not-found" }
  | { status: "network-error"; message: string };

export function makeClient(settings: Settings, fetchImpl?: typeof fetch): GitHubClient {
  return new GitHubClient({
    token: settings.token,
    owner: settings.owner,
    repo: settings.repo,
    branch: settings.branch,
    ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
  });
}

export async function validateConnection(
  settings: Settings,
  fetchImpl?: typeof fetch,
): Promise<ValidateResult> {
  const client = makeClient(settings, fetchImpl);
  try {
    await client.read("bookmarks.json");
    try {
      await client.read("tags.json");
    } catch (err) {
      // tags.json missing is fine — bookmarks.json already validated auth + repo.
      // Other errors (auth flip, network) should still surface via the outer catch.
      if (!(err instanceof GitHubNotFoundError)) throw err;
    }
    return { status: "ok-with-files" };
  } catch (err) {
    if (err instanceof GitHubAuthError) return { status: "auth-failed" };
    if (err instanceof GitHubNotFoundError) {
      return repoExists(settings, fetchImpl);
    }
    if (err instanceof TypeError) return { status: "network-error", message: err.message };
    throw err;
  }
}

async function repoExists(
  settings: Settings,
  fetchImpl?: typeof fetch,
): Promise<ValidateResult> {
  const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
  const fn = fetchImpl ?? globalThis.fetch;
  try {
    const res = await fn(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${settings.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 401) return { status: "auth-failed" };
    if (res.status === 404) return { status: "repo-not-found" };
    if (res.ok) return { status: "ok-no-files" };
    return { status: "network-error", message: `GitHub ${res.status}` };
  } catch (err) {
    return {
      status: "network-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
