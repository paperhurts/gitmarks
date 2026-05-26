import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubError,
  GitHubNotFoundError,
} from "./errors.js";
import { decodeBase64Utf8, encodeBase64Utf8 } from "./base64.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GitHubClientOptions {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

interface ContentsReadBody {
  content: string;
  sha: string;
  encoding: string;
}

export interface ReadResult<T> {
  data: T;
  sha: string;
  etag: string;
}

export class GitHubClient {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly branch: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: GitHubClientOptions) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.token = opts.token;
    this.branch = opts.branch ?? "main";
    this.fetchImpl =
      opts.fetch ??
      ((input, init) => {
        if (typeof globalThis.fetch !== "function") {
          throw new Error(
            "fetch is not available in this environment; pass opts.fetch",
          );
        }
        return globalThis.fetch(input, init);
      });
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      ...extra,
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private contentsUrl(path: string): string {
    const enc = path.split("/").map(encodeURIComponent).join("/");
    const o = encodeURIComponent(this.owner);
    const r = encodeURIComponent(this.repo);
    return `${this.baseUrl}/repos/${o}/${r}/contents/${enc}?ref=${encodeURIComponent(this.branch)}`;
  }

  private throwForStatus(res: Response, path: string): void {
    if (res.status === 401) throw new GitHubAuthError();
    if (res.status === 404) throw new GitHubNotFoundError(path);
    if (!res.ok) {
      throw new GitHubError(`GitHub ${res.status} on ${path}`, res.status);
    }
  }

  async read<T>(path: string): Promise<ReadResult<T>> {
    const res = await this.fetchImpl(this.contentsUrl(path), {
      method: "GET",
      headers: this.headers(),
    });
    this.throwForStatus(res, path);
    return this.parseRead<T>(res);
  }

  async readIfChanged<T>(
    path: string,
    etag: string,
  ): Promise<ReadResult<T> | null> {
    const res = await this.fetchImpl(this.contentsUrl(path), {
      method: "GET",
      headers: this.headers({ "If-None-Match": etag }),
    });
    if (res.status === 304) return null;
    this.throwForStatus(res, path);
    return this.parseRead<T>(res);
  }

  private async parseRead<T>(res: Response): Promise<ReadResult<T>> {
    const body = (await res.json()) as ContentsReadBody;
    if (typeof body.content !== "string" || body.encoding !== "base64") {
      throw new GitHubError(
        `unexpected GitHub contents payload (encoding=${body.encoding})`,
        res.status,
      );
    }
    const decoded = decodeBase64Utf8(body.content);
    const data = JSON.parse(decoded) as T;
    return {
      data,
      sha: body.sha,
      etag: res.headers.get("etag") ?? "",
    };
  }

  async write<T>(
    path: string,
    data: T,
    message: string,
    opts: { prevSha?: string } = {},
  ): Promise<{ sha: string; etag: string }> {
    const content = encodeBase64Utf8(JSON.stringify(data, null, 2));
    const body: Record<string, unknown> = {
      message,
      content,
      branch: this.branch,
    };
    if (opts.prevSha) body.sha = opts.prevSha;

    const res = await this.fetchImpl(this.contentsUrl(path), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (res.status === 409 || res.status === 422) {
      throw new GitHubConflictError(path, res.status);
    }
    if (res.status === 401) throw new GitHubAuthError();
    if (!res.ok) {
      throw new GitHubError(`GitHub ${res.status} on PUT ${path}`, res.status);
    }

    const respBody = (await res.json()) as { content: { sha: string } };
    return {
      sha: respBody.content.sha,
      etag: res.headers.get("etag") ?? "",
    };
  }

  /**
   * Read → mutate → write with optimistic concurrency.
   *
   * The `mutate` function MUST be pure: it receives the latest server-side
   * data and returns the next value. On a 409 (someone else wrote first),
   * the client re-reads and calls `mutate` again against the fresh data —
   * which is only safe if `mutate` does not close over stale state.
   */
  async update<T>(
    path: string,
    mutate: (current: T) => T,
    message: string,
    opts: { maxAttempts?: number; baseDelayMs?: number } = {},
  ): Promise<ReadResult<T>> {
    const maxAttempts = opts.maxAttempts ?? 3;
    const baseDelayMs = opts.baseDelayMs ?? 200;
    let lastConflict: GitHubConflictError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const current = await this.read<T>(path);
      const next = mutate(current.data);
      try {
        const written = await this.write<T>(path, next, message, {
          prevSha: current.sha,
        });
        return { data: next, sha: written.sha, etag: written.etag };
      } catch (err) {
        if (!(err instanceof GitHubConflictError)) throw err;
        lastConflict = err;
        if (attempt < maxAttempts - 1) {
          await sleep(baseDelayMs * 2 ** attempt);
        }
      }
    }
    throw lastConflict ?? new GitHubConflictError(path);
  }
}
