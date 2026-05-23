import { describe, it, expect } from "vitest";
import {
  GitHubError,
  GitHubAuthError,
  GitHubConflictError,
  GitHubNotFoundError,
} from "../src/github/errors.js";

describe("GitHub errors", () => {
  it("GitHubError is a subclass of Error", () => {
    const e = new GitHubError("boom", 500);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.status).toBe(500);
    expect(e.message).toBe("boom");
    expect(e.name).toBe("GitHubError");
  });

  it("GitHubAuthError carries status 401", () => {
    const e = new GitHubAuthError();
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.status).toBe(401);
    expect(e.name).toBe("GitHubAuthError");
  });

  it("GitHubConflictError carries the path and status 409", () => {
    const e = new GitHubConflictError("bookmarks.json");
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.status).toBe(409);
    expect(e.path).toBe("bookmarks.json");
    expect(e.name).toBe("GitHubConflictError");
  });

  it("GitHubConflictError accepts a status override (e.g. 422)", () => {
    const e = new GitHubConflictError("bookmarks.json", 422);
    expect(e.status).toBe(422);
    expect(e.path).toBe("bookmarks.json");
  });

  it("GitHubNotFoundError carries the path and status 404", () => {
    const e = new GitHubNotFoundError("tags.json");
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.status).toBe(404);
    expect(e.path).toBe("tags.json");
    expect(e.name).toBe("GitHubNotFoundError");
  });
});
