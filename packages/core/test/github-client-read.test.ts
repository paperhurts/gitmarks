import { describe, it, expect, vi } from "vitest";
import { GitHubClient } from "../src/github/client.js";
import {
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubError,
} from "../src/github/errors.js";
import { encodeBase64Utf8 } from "../src/github/base64.js";

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mkClient(fetchImpl: typeof fetch) {
  return new GitHubClient({
    owner: "alice",
    repo: "marks",
    token: "test-token",
    fetch: fetchImpl,
  });
}

describe("GitHubClient.read", () => {
  it("GETs the contents URL with auth headers and parses base64 JSON", async () => {
    const data = { version: 1, hello: "🌍" };
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        {
          content: encodeBase64Utf8(JSON.stringify(data)),
          sha: "abc123",
          encoding: "base64",
        },
        { etag: '"e1"' },
      ),
    );
    const client = mkClient(fetchMock);

    const result = await client.read<typeof data>("bookmarks.json");

    expect(result.data).toEqual(data);
    expect(result.sha).toBe("abc123");
    expect(result.etag).toBe('"e1"');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.github.com/repos/alice/marks/contents/bookmarks.json?ref=main",
    );
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("throws GitHubAuthError on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(401, {}));
    const client = mkClient(fetchMock);
    await expect(client.read("bookmarks.json")).rejects.toBeInstanceOf(
      GitHubAuthError,
    );
  });

  it("throws GitHubNotFoundError on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404, {}));
    const client = mkClient(fetchMock);
    await expect(client.read("bookmarks.json")).rejects.toBeInstanceOf(
      GitHubNotFoundError,
    );
  });

  it("throws a generic GitHubError on other failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(500, {}));
    const client = mkClient(fetchMock);
    await expect(client.read("bookmarks.json")).rejects.toBeInstanceOf(
      GitHubError,
    );
  });

  it("defaults etag to empty string when the response omits it", async () => {
    const data = { hi: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(200, {
        content: encodeBase64Utf8(JSON.stringify(data)),
        sha: "s3",
        encoding: "base64",
      }),
    );
    const client = mkClient(fetchMock);
    const result = await client.read<typeof data>("bookmarks.json");
    expect(result.etag).toBe("");
  });
});

describe("GitHubClient.readIfChanged", () => {
  it("returns null on 304 Not Modified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse(304, null));
    const client = mkClient(fetchMock);

    const result = await client.readIfChanged("bookmarks.json", '"e1"');
    expect(result).toBeNull();

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"e1"');
  });

  it("returns parsed data on 200", async () => {
    const data = { hi: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        {
          content: encodeBase64Utf8(JSON.stringify(data)),
          sha: "s2",
          encoding: "base64",
        },
        { etag: '"e2"' },
      ),
    );
    const client = mkClient(fetchMock);

    const result = await client.readIfChanged<typeof data>(
      "bookmarks.json",
      '"e1"',
    );
    expect(result).toEqual({ data, sha: "s2", etag: '"e2"' });
  });
});
