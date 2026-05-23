import { describe, it, expect, vi } from "vitest";
import { GitHubClient } from "../src/github/client.js";
import {
  GitHubAuthError,
  GitHubConflictError,
} from "../src/github/errors.js";
import { decodeBase64Utf8 } from "../src/github/base64.js";

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

describe("GitHubClient.write", () => {
  it("PUTs base64-encoded JSON with prevSha (update)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        { content: { sha: "newsha" } },
        { etag: '"e3"' },
      ),
    );
    const client = mkClient(fetchMock);

    const result = await client.write(
      "bookmarks.json",
      { v: 1, items: [] },
      "msg",
      { prevSha: "oldsha" },
    );
    expect(result).toEqual({ sha: "newsha", etag: '"e3"' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/contents/bookmarks.json");
    expect(init?.method).toBe("PUT");
    const sentBody = JSON.parse(init!.body as string);
    expect(sentBody.message).toBe("msg");
    expect(sentBody.sha).toBe("oldsha");
    expect(sentBody.branch).toBe("main");
    expect(JSON.parse(decodeBase64Utf8(sentBody.content))).toEqual({
      v: 1,
      items: [],
    });
  });

  it("PUTs without sha when prevSha is omitted (create)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(201, { content: { sha: "firstsha" } }),
    );
    const client = mkClient(fetchMock);

    await client.write("bookmarks.json", { v: 1 }, "create");
    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse(init!.body as string);
    expect(sentBody).not.toHaveProperty("sha");
  });

  it("throws GitHubConflictError on 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(409, {}));
    const client = mkClient(fetchMock);
    await expect(
      client.write("bookmarks.json", {}, "msg", { prevSha: "old" }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
  });

  it("throws GitHubConflictError on 422 (GitHub returns this for SHA mismatch sometimes)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(422, {}));
    const client = mkClient(fetchMock);
    await expect(
      client.write("bookmarks.json", {}, "msg", { prevSha: "old" }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
  });

  it("throws GitHubAuthError on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(401, {}));
    const client = mkClient(fetchMock);
    await expect(
      client.write("bookmarks.json", {}, "msg"),
    ).rejects.toBeInstanceOf(GitHubAuthError);
  });
});
