import {
  GitHubAuthError,
  GitHubError,
  GitHubNotFoundError,
} from "./errors.js";
import { decodeBase64Utf8 } from "./base64.js";

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
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
  }

  private contentsUrl(path: string): string {
    const enc = path.split("/").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${enc}?ref=${this.branch}`;
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
    const decoded = decodeBase64Utf8(body.content);
    const data = JSON.parse(decoded) as T;
    return {
      data,
      sha: body.sha,
      etag: res.headers.get("etag") ?? "",
    };
  }
}
