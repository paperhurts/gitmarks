import { describe, it, expect, vi } from "vitest";
import { GitHubClient } from "../src/github/client.js";
import { GitHubConflictError } from "../src/github/errors.js";
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
} from "../src/github/base64.js";

function readBody(data: unknown, sha: string): Response {
  return new Response(
    JSON.stringify({
      content: encodeBase64Utf8(JSON.stringify(data)),
      sha,
      encoding: "base64",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", etag: `"${sha}"` },
    },
  );
}

function writeOk(sha: string): Response {
  return new Response(JSON.stringify({ content: { sha } }), {
    status: 200,
    headers: { "content-type": "application/json", etag: `"${sha}"` },
  });
}

function conflict(): Response {
  return new Response(null, {
    status: 409,
    headers: { "content-type": "application/json" },
  });
}

function mkClient(fetchImpl: typeof fetch) {
  return new GitHubClient({
    owner: "alice",
    repo: "marks",
    token: "t",
    fetch: fetchImpl,
  });
}

describe("GitHubClient.update", () => {
  it("does read + write once when there is no conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(readBody({ n: 1 }, "sha1"))
      .mockResolvedValueOnce(writeOk("sha2"));
    const client = mkClient(fetchMock);

    const mutate = vi.fn((curr: { n: number }) => ({ n: curr.n + 1 }));
    const result = await client.update("bookmarks.json", mutate, "bump");

    expect(result.data).toEqual({ n: 2 });
    expect(result.sha).toBe("sha2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalledTimes(1);

    const putBody = JSON.parse(
      fetchMock.mock.calls[1]![1]!.body as string,
    );
    expect(JSON.parse(decodeBase64Utf8(putBody.content))).toEqual({ n: 2 });
    expect(putBody.sha).toBe("sha1");
  });

  it("re-fetches and replays the mutation after a single 409", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(readBody({ n: 1 }, "sha1"))
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(readBody({ n: 5 }, "sha9"))
      .mockResolvedValueOnce(writeOk("sha10"));
    const client = mkClient(fetchMock);

    const mutate = vi.fn((curr: { n: number }) => ({ n: curr.n + 1 }));
    const result = await client.update("bookmarks.json", mutate, "bump", {
      baseDelayMs: 0,
    });

    expect(result.data).toEqual({ n: 6 });
    expect(result.sha).toBe("sha10");
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0]).toEqual({ n: 5 });

    const finalPut = JSON.parse(
      fetchMock.mock.calls[3]![1]!.body as string,
    );
    expect(finalPut.sha).toBe("sha9");
  });

  it("throws GitHubConflictError after maxAttempts conflicts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(readBody({ n: 0 }, "s1"))
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(readBody({ n: 1 }, "s2"))
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(readBody({ n: 2 }, "s3"))
      .mockResolvedValueOnce(conflict());
    const client = mkClient(fetchMock);

    await expect(
      client.update<{ n: number }>(
        "bookmarks.json",
        (c) => ({ n: c.n + 1 }),
        "bump",
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toBeInstanceOf(GitHubConflictError);

    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("does not retry on non-conflict errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(readBody({ n: 0 }, "s1"))
      .mockResolvedValueOnce(
        new Response(null, { status: 500 }),
      );
    const client = mkClient(fetchMock);

    await expect(
      client.update<{ n: number }>(
        "bookmarks.json",
        (c) => ({ n: c.n + 1 }),
        "bump",
        { baseDelayMs: 0 },
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
