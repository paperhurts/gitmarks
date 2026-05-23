# Gitmarks Core Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@gitmarks/core`, a shared TypeScript library consumed by every browser extension and the web UI. It owns: JSON schemas for `bookmarks.json` and `tags.json`, a typed GitHub Contents API client with ETag conditional reads and SHA-based optimistic concurrency (409 → refetch → replay → retry), plus pure helpers for mutating the bookmark file (add / update / soft delete / GC tombstones / URL normalize / ULID).

**Architecture:** Single ESM TypeScript package built with `tsc` to `dist/`. Schemas are Zod (gives us runtime validation and inferred types in one). The GitHub client is dependency-injectable (`fetch` impl passed via constructor) so tests can stub the network without `msw`. Bookmark mutations are pure functions on the file object — that's what lets `update()` safely replay a mutation after a 409 against fresh data.

**Tech Stack:** TypeScript 5.x (strict, ESM), Zod 3.x (schemas), `ulid` 2.x (IDs), Vitest 2.x (tests), pnpm workspaces. Target: Node ≥20 and modern browsers (uses `fetch`, `TextEncoder`/`TextDecoder`, `atob`/`btoa`).

**Spec reference:** `spec.md` — especially §Data model, §How clients talk to GitHub, §Conflict scenarios.

---

## File Structure

The package lives at `packages/core/`. The repo root also gets the monorepo bootstrap (workspaces, shared tsconfig, gitignore).

```
gitmarks/
├── .gitignore                            # node_modules, dist, .DS_Store, etc.
├── .npmrc                                # auto-install-peers=true
├── package.json                          # monorepo root, pnpm workspaces, dev scripts
├── pnpm-workspace.yaml                   # globs packages/*
├── tsconfig.base.json                    # shared compiler options (strict, ES2022, ESM)
└── packages/
    └── core/
        ├── package.json                  # @gitmarks/core, exports, scripts
        ├── tsconfig.json                 # extends base, points to src/, emits dist/
        ├── vitest.config.ts              # vitest config (node env, globals off)
        ├── README.md                     # API surface, written in Task 11
        └── src/
            ├── index.ts                  # barrel: curated public exports
            ├── schema/
            │   ├── bookmarks.ts          # bookmarkSchema, bookmarksFileSchema, types
            │   └── tags.ts               # tagSchema, tagsFileSchema, types
            ├── url.ts                    # normalizeUrl()
            ├── ulid.ts                   # newUlid() — re-export wrapper
            ├── mutate.ts                 # pure file mutations: add, update, softDelete, gcTombstones
            └── github/
                ├── errors.ts             # GitHubError + GitHubAuthError + GitHubConflictError + GitHubNotFoundError
                ├── base64.ts             # encodeBase64Utf8, decodeBase64Utf8 (browser-safe)
                └── client.ts             # GitHubClient: read, readIfChanged, write, update
```

**Why this split:** schemas, URL normalization, ULID, and mutations are pure and independent — each gets its own file for focus. The GitHub client is the only complex unit, so it's a folder with its own helpers (errors, base64). The barrel `index.ts` is the only file consumers should import.

**Test files:** colocate at `packages/core/test/` mirroring `src/`. One test file per source file.

---

## Library and convention choices (locked in upfront)

- **Module system:** ESM throughout. `"type": "module"` in every `package.json`.
- **Imports use `.js` suffix** in source files (so emitted code matches): `import { ... } from "./schema/bookmarks.js"`. TypeScript resolves these to `.ts` during compilation. This is the standard ESM-TS pattern.
- **No default exports.** Named exports only.
- **Errors are classes,** not strings or objects. Each subclasses `GitHubError`.
- **Mutations are pure.** All `mutate.ts` helpers take an input file object and return a new one. Never mutate the input. This is load-bearing for the conflict-retry replay logic.
- **`GitHubClient.update()` takes a pure `(current) => next` function** for the same reason. Closures over stale data would defeat the replay.

---

## Tasks

### Task 0: Bootstrap monorepo + core package

**Files:**
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts` (placeholder, becomes the real barrel in Task 11)
- Create: `packages/core/test/smoke.test.ts`

- [ ] **Step 1: Create `.gitignore` at the repo root**

```gitignore
node_modules/
dist/
.DS_Store
*.log
.vscode/
.idea/
coverage/
.turbo/
```

- [ ] **Step 2: Create `.npmrc` at the repo root**

```
auto-install-peers=true
```

- [ ] **Step 3: Create `package.json` at the repo root**

```json
{
  "name": "gitmarks",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:watch": "pnpm -r --parallel test:watch",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r exec rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: Create `packages/core/package.json`**

```json
{
  "name": "@gitmarks/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ulid": "^2.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 7: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 8: Create `packages/core/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 9: Create `packages/core/src/index.ts` (placeholder)**

```typescript
// Curated public API for @gitmarks/core.
// Real exports are added in subsequent tasks; this file becomes the barrel in Task 11.
export const __packageName = "@gitmarks/core";
```

- [ ] **Step 10: Create `packages/core/test/smoke.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { __packageName } from "../src/index.js";

describe("@gitmarks/core smoke", () => {
  it("exports the package marker", () => {
    expect(__packageName).toBe("@gitmarks/core");
  });
});
```

- [ ] **Step 11: Install dependencies**

Run: `pnpm install`
Expected: pnpm creates `node_modules/` and `pnpm-lock.yaml` without errors.

- [ ] **Step 12: Verify the toolchain works**

Run: `pnpm test`
Expected: vitest runs `smoke.test.ts`, 1 test passes.

Run: `pnpm typecheck`
Expected: tsc completes with exit 0 and no output.

Run: `pnpm build`
Expected: tsc emits `packages/core/dist/index.js` and `index.d.ts`.

- [ ] **Step 13: Commit**

```bash
git add .gitignore .npmrc package.json pnpm-workspace.yaml tsconfig.base.json packages/
git commit -m "chore: bootstrap monorepo with @gitmarks/core skeleton"
```

---

### Task 1: Bookmarks and tags schemas + inferred types

**Files:**
- Create: `packages/core/src/schema/bookmarks.ts`
- Create: `packages/core/src/schema/tags.ts`
- Create: `packages/core/test/schema.test.ts`

**Spec reference:** `spec.md` §"Data model".

- [ ] **Step 1: Write the failing schema tests**

Create `packages/core/test/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  bookmarkSchema,
  bookmarksFileSchema,
} from "../src/schema/bookmarks.js";
import { tagSchema, tagsFileSchema } from "../src/schema/tags.js";

const validBookmark = {
  id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
  url: "https://example.com/article",
  title: "Article title",
  folder: "Research/AI",
  tags: ["claudepi", "to-read"],
  added_at: "2026-05-23T14:32:11Z",
  updated_at: "2026-05-23T14:32:11Z",
  added_from: "chrome@minerva",
  deleted_at: null,
  notes: null,
};

describe("bookmarkSchema", () => {
  it("accepts a valid bookmark", () => {
    expect(() => bookmarkSchema.parse(validBookmark)).not.toThrow();
  });

  it("rejects a bookmark with a non-ULID id", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, id: "not-a-ulid" }),
    ).toThrow();
  });

  it("rejects a bookmark with a malformed URL", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, url: "not a url" }),
    ).toThrow();
  });

  it("rejects a bookmark with a non-ISO updated_at", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, updated_at: "yesterday" }),
    ).toThrow();
  });

  it("accepts a soft-deleted bookmark", () => {
    expect(() =>
      bookmarkSchema.parse({
        ...validBookmark,
        deleted_at: "2026-06-01T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("allows an empty folder (root)", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, folder: "" }),
    ).not.toThrow();
  });
});

describe("bookmarksFileSchema", () => {
  it("accepts an empty bookmarks file", () => {
    expect(() =>
      bookmarksFileSchema.parse({
        version: 1,
        updated_at: "2026-05-23T14:32:11Z",
        bookmarks: [],
      }),
    ).not.toThrow();
  });

  it("rejects version other than 1", () => {
    expect(() =>
      bookmarksFileSchema.parse({
        version: 2,
        updated_at: "2026-05-23T14:32:11Z",
        bookmarks: [],
      }),
    ).toThrow();
  });
});

describe("tagsFileSchema", () => {
  it("accepts a file with valid tags", () => {
    const file = {
      version: 1,
      tags: {
        claudepi: { color: "#FF00FF", description: "ClaudePi research" },
        "to-read": { color: "#00FFFF", description: null },
      },
    };
    expect(() => tagsFileSchema.parse(file)).not.toThrow();
  });

  it("rejects a tag with a malformed color", () => {
    expect(() =>
      tagSchema.parse({ color: "fuchsia", description: null }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test`
Expected: tests fail because `src/schema/bookmarks.ts` and `src/schema/tags.ts` don't exist.

- [ ] **Step 3: Implement `packages/core/src/schema/bookmarks.ts`**

```typescript
import { z } from "zod";

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const bookmarkSchema = z.object({
  id: z.string().regex(ULID_REGEX, "id must be a ULID"),
  url: z.string().url(),
  title: z.string(),
  folder: z.string(),
  tags: z.array(z.string()),
  added_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  added_from: z.string().regex(/^[^@]+@[^@]+$/, "must be <browser>@<machine>"),
  deleted_at: z.string().datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
});

export const bookmarksFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().datetime({ offset: true }),
  bookmarks: z.array(bookmarkSchema),
});

export type Bookmark = z.infer<typeof bookmarkSchema>;
export type BookmarksFile = z.infer<typeof bookmarksFileSchema>;
```

- [ ] **Step 4: Implement `packages/core/src/schema/tags.ts`**

```typescript
import { z } from "zod";

export const tagSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color must be #RRGGBB"),
  description: z.string().nullable(),
});

export const tagsFileSchema = z.object({
  version: z.literal(1),
  tags: z.record(z.string(), tagSchema),
});

export type Tag = z.infer<typeof tagSchema>;
export type TagsFile = z.infer<typeof tagsFileSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test`
Expected: all schema tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema packages/core/test/schema.test.ts
git commit -m "feat(core): add Zod schemas for bookmarks.json and tags.json"
```

---

### Task 2: URL normalization

**Files:**
- Create: `packages/core/src/url.ts`
- Create: `packages/core/test/url.test.ts`

**Spec reference:** `spec.md` §Data model "Field rules" — "`url` — normalized: trailing slashes stripped, fragments dropped unless `#!` (hashbang routes)."

**Note on scope:** v1 only does what the spec mandates. Tracking-param stripping (`utm_*`) is an open question in the spec and is deliberately *not* in this task. Don't add it.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/url.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../src/url.js";

describe("normalizeUrl", () => {
  it("preserves a clean URL unchanged (modulo WHATWG normalization)", () => {
    expect(normalizeUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("strips a trailing slash from a non-root path", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  it("collapses multiple trailing slashes", () => {
    expect(normalizeUrl("https://example.com/path///")).toBe(
      "https://example.com/path",
    );
  });

  it("keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("drops a non-hashbang fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe(
      "https://example.com/page",
    );
  });

  it("keeps a hashbang fragment", () => {
    expect(normalizeUrl("https://example.com/#!route")).toBe(
      "https://example.com/#!route",
    );
  });

  it("keeps AngularJS-style hashbang routes", () => {
    expect(normalizeUrl("https://example.com/#!/route/sub")).toBe(
      "https://example.com/#!/route/sub",
    );
  });

  it("preserves the query string", () => {
    expect(normalizeUrl("https://example.com/path/?q=hi&p=2")).toBe(
      "https://example.com/path?q=hi&p=2",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("throws on an invalid URL", () => {
    expect(() => normalizeUrl("not a url")).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/url.test.ts`
Expected: fails because `src/url.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/url.ts`**

```typescript
export function normalizeUrl(input: string): string {
  const u = new URL(input);

  if (u.hash && !u.hash.startsWith("#!")) {
    u.hash = "";
  }

  if (u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  return u.toString();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/url.test.ts`
Expected: all URL tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/url.ts packages/core/test/url.test.ts
git commit -m "feat(core): add URL normalization (strip trailing slashes, drop non-hashbang fragments)"
```

---

### Task 3: ULID helper

**Files:**
- Create: `packages/core/src/ulid.ts`
- Create: `packages/core/test/ulid.test.ts`

**Why a wrapper:** consumers should import IDs from `@gitmarks/core`, not from `ulid` directly. If we ever swap implementations (custom monotonic, KSUID, etc.) it's a one-file change.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/ulid.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { newUlid } from "../src/ulid.js";

describe("newUlid", () => {
  it("returns a 26-character Crockford base32 string", () => {
    const id = newUlid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("produces unique values", () => {
    const a = newUlid();
    const b = newUlid();
    expect(a).not.toBe(b);
  });

  it("sorts lexicographically by creation time", async () => {
    const a = newUlid();
    await new Promise((r) => setTimeout(r, 2));
    const b = newUlid();
    expect([b, a].sort()).toEqual([a, b]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/ulid.test.ts`
Expected: fails because `src/ulid.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/ulid.ts`**

```typescript
import { ulid } from "ulid";

export function newUlid(): string {
  return ulid();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/ulid.test.ts`
Expected: all 3 ULID tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ulid.ts packages/core/test/ulid.test.ts
git commit -m "feat(core): add newUlid wrapper around ulid package"
```

---

### Task 4: GitHub error types

**Files:**
- Create: `packages/core/src/github/errors.ts`
- Create: `packages/core/test/github-errors.test.ts`

These are the four kinds of failure the client surfaces. Consumers `instanceof`-check to decide how to react (e.g., conflict → retry, auth → red status indicator).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/github-errors.test.ts`:

```typescript
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

  it("GitHubNotFoundError carries the path and status 404", () => {
    const e = new GitHubNotFoundError("tags.json");
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.status).toBe(404);
    expect(e.path).toBe("tags.json");
    expect(e.name).toBe("GitHubNotFoundError");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/github-errors.test.ts`
Expected: fails because `src/github/errors.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/github/errors.ts`**

```typescript
export class GitHubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(message = "GitHub authentication failed") {
    super(message, 401);
    this.name = "GitHubAuthError";
  }
}

export class GitHubConflictError extends GitHubError {
  readonly path: string;

  constructor(path: string) {
    super(`conflict writing ${path}`, 409);
    this.name = "GitHubConflictError";
    this.path = path;
  }
}

export class GitHubNotFoundError extends GitHubError {
  readonly path: string;

  constructor(path: string) {
    super(`not found: ${path}`, 404);
    this.name = "GitHubNotFoundError";
    this.path = path;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/github-errors.test.ts`
Expected: all 4 error tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/errors.ts packages/core/test/github-errors.test.ts
git commit -m "feat(core): add typed GitHub error classes"
```

---

### Task 5: UTF-8 safe base64

**Files:**
- Create: `packages/core/src/github/base64.ts`
- Create: `packages/core/test/base64.test.ts`

**Why this exists:** the GitHub Contents API ships file content as base64. The browser globals `atob` / `btoa` only handle Latin-1 — they corrupt multi-byte UTF-8 characters (think emojis in bookmark titles). We need a wrapper that goes through `TextEncoder` / `TextDecoder`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/base64.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  encodeBase64Utf8,
  decodeBase64Utf8,
} from "../src/github/base64.js";

describe("base64 UTF-8 helpers", () => {
  it("round-trips plain ASCII", () => {
    const s = "hello world";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("round-trips UTF-8 (accented chars)", () => {
    const s = "café résumé piñata";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("round-trips emoji and CJK", () => {
    const s = "📚 ブックマーク 🇯🇵";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("ignores embedded newlines on decode (GitHub wraps base64 at 60 cols)", () => {
    const raw = encodeBase64Utf8("hello");
    const wrapped = raw.slice(0, 4) + "\n" + raw.slice(4);
    expect(decodeBase64Utf8(wrapped)).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/base64.test.ts`
Expected: fails because `src/github/base64.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/github/base64.ts`**

```typescript
export function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function decodeBase64Utf8(input: string): string {
  const binary = atob(input.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/base64.test.ts`
Expected: all 4 base64 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/base64.ts packages/core/test/base64.test.ts
git commit -m "feat(core): add UTF-8 safe base64 helpers"
```

---

### Task 6: GitHubClient.read() and readIfChanged()

**Files:**
- Create: `packages/core/src/github/client.ts`
- Create: `packages/core/test/github-client-read.test.ts`

**Spec reference:** `spec.md` §"How clients talk to GitHub", §"Rate limiting & GitHub quotas" (conditional requests).

**Design:** the client takes a `fetch` impl in its constructor. Tests pass a `vi.fn()` returning `Response` objects. No `msw`, no network — pure dependency injection.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/github-client-read.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/github-client-read.test.ts`
Expected: fails because `src/github/client.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/github/client.ts`**

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/github-client-read.test.ts`
Expected: all 6 read tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/client.ts packages/core/test/github-client-read.test.ts
git commit -m "feat(core): add GitHubClient.read and readIfChanged with ETag support"
```

---

### Task 7: GitHubClient.write()

**Files:**
- Modify: `packages/core/src/github/client.ts`
- Create: `packages/core/test/github-client-write.test.ts`

`write` handles both create (no `prevSha`) and update (with `prevSha`). On 409 or 422 (GitHub returns both for SHA conflicts depending on the case), throw `GitHubConflictError` so the caller can decide whether to refetch and retry.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/github-client-write.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/github-client-write.test.ts`
Expected: fails because `write()` doesn't exist on `GitHubClient` yet.

- [ ] **Step 3: Add the `GitHubConflictError` import and `write()` method to `packages/core/src/github/client.ts`**

Add `GitHubConflictError` to the existing import from `./errors.js`:

```typescript
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubError,
  GitHubNotFoundError,
} from "./errors.js";
import { decodeBase64Utf8, encodeBase64Utf8 } from "./base64.js";
```

Add this method to the `GitHubClient` class (place it after `parseRead`):

```typescript
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
      throw new GitHubConflictError(path);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/github-client-write.test.ts`
Expected: all 5 write tests pass.

Run: `pnpm --filter @gitmarks/core test` (full suite)
Expected: nothing regressed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/client.ts packages/core/test/github-client-write.test.ts
git commit -m "feat(core): add GitHubClient.write with conflict detection"
```

---

### Task 8: GitHubClient.update() with 409 retry + replay

**Files:**
- Modify: `packages/core/src/github/client.ts`
- Create: `packages/core/test/github-client-update.test.ts`

**Spec reference:** `spec.md` §"Write sequence (single change)" — "On 409: GET again, replay the mutation against fresh content, PUT again. Exponential backoff up to 3 retries."

**Critical invariant:** `mutate` must be a pure function of `(current) => next`. The caller cannot close over `current` from before — the whole point is that on conflict we hand them the *latest* `current` and ask them to recompute. The plan documents this in the JSDoc.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/github-client-update.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/github-client-update.test.ts`
Expected: fails because `update()` doesn't exist.

- [ ] **Step 3: Add `update()` to `packages/core/src/github/client.ts`**

Append this method to the `GitHubClient` class (after `write`):

```typescript
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
```

Then add this helper near the top of the file (above the class):

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/github-client-update.test.ts`
Expected: all 4 update tests pass.

Run: `pnpm --filter @gitmarks/core test`
Expected: full suite still green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/client.ts packages/core/test/github-client-update.test.ts
git commit -m "feat(core): add GitHubClient.update with 409 replay and exponential backoff"
```

---

### Task 9: Bookmark mutation helpers

**Files:**
- Create: `packages/core/src/mutate.ts`
- Create: `packages/core/test/mutate.test.ts`

**Spec reference:** `spec.md` §"Data model", §"Conflict scenarios" (tombstones), §"Field rules" ("`deleted_at` — soft delete tombstone. GC'd from the JSON after 30 days").

All four helpers return a *new* `BookmarksFile` object. They must not mutate inputs — this is what makes them safe to use as the `mutate` argument to `GitHubClient.update()`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/mutate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { BookmarksFile, Bookmark } from "../src/schema/bookmarks.js";
import {
  addBookmark,
  updateBookmark,
  softDeleteBookmark,
  gcTombstones,
} from "../src/mutate.js";

function mkBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...overrides,
  };
}

function mkFile(bookmarks: Bookmark[] = []): BookmarksFile {
  return {
    version: 1,
    updated_at: "2026-05-01T00:00:00Z",
    bookmarks,
  };
}

describe("addBookmark", () => {
  it("appends to bookmarks and bumps file updated_at", () => {
    const file = mkFile();
    const bm = mkBookmark();
    const out = addBookmark(file, bm, "2026-05-23T00:00:00Z");

    expect(out.bookmarks).toEqual([bm]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
    expect(out).not.toBe(file);
    expect(file.bookmarks).toEqual([]);
  });
});

describe("updateBookmark", () => {
  it("applies a partial patch and sets updated_at", () => {
    const bm = mkBookmark({ title: "old" });
    const file = mkFile([bm]);
    const out = updateBookmark(
      file,
      bm.id,
      { title: "new", tags: ["x"] },
      "2026-05-23T01:00:00Z",
    );

    expect(out.bookmarks[0]!.title).toBe("new");
    expect(out.bookmarks[0]!.tags).toEqual(["x"]);
    expect(out.bookmarks[0]!.updated_at).toBe("2026-05-23T01:00:00Z");
    expect(out.updated_at).toBe("2026-05-23T01:00:00Z");
    expect(file.bookmarks[0]!.title).toBe("old");
  });

  it("throws if the bookmark id is not found", () => {
    expect(() =>
      updateBookmark(mkFile(), "01HXYZ8K7M9P3RQ2V5W6Z8B0C1", { title: "x" }, "now"),
    ).toThrow(/not found/);
  });
});

describe("softDeleteBookmark", () => {
  it("sets deleted_at and updated_at", () => {
    const bm = mkBookmark();
    const file = mkFile([bm]);
    const out = softDeleteBookmark(file, bm.id, "2026-05-23T02:00:00Z");

    expect(out.bookmarks[0]!.deleted_at).toBe("2026-05-23T02:00:00Z");
    expect(out.bookmarks[0]!.updated_at).toBe("2026-05-23T02:00:00Z");
    expect(file.bookmarks[0]!.deleted_at).toBeNull();
  });
});

describe("gcTombstones", () => {
  it("removes bookmarks soft-deleted longer than the threshold", () => {
    const old = mkBookmark({
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
      deleted_at: "2026-01-01T00:00:00Z",
    });
    const recent = mkBookmark({
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C2",
      deleted_at: "2026-05-20T00:00:00Z",
    });
    const live = mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C3" });
    const file = mkFile([old, recent, live]);

    const out = gcTombstones(file, 30, "2026-05-23T00:00:00Z");

    expect(out.bookmarks.map((b) => b.id)).toEqual([recent.id, live.id]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
  });

  it("does not modify the file if nothing is past the threshold", () => {
    const live = mkBookmark();
    const file = mkFile([live]);
    const out = gcTombstones(file, 30, "2026-05-23T00:00:00Z");
    expect(out.bookmarks).toEqual([live]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gitmarks/core test test/mutate.test.ts`
Expected: fails because `src/mutate.ts` does not exist.

- [ ] **Step 3: Implement `packages/core/src/mutate.ts`**

```typescript
import type { Bookmark, BookmarksFile } from "./schema/bookmarks.js";

export function addBookmark(
  file: BookmarksFile,
  bookmark: Bookmark,
  nowIso: string,
): BookmarksFile {
  return {
    ...file,
    updated_at: nowIso,
    bookmarks: [...file.bookmarks, bookmark],
  };
}

export function updateBookmark(
  file: BookmarksFile,
  id: string,
  patch: Partial<Omit<Bookmark, "id">>,
  nowIso: string,
): BookmarksFile {
  const idx = file.bookmarks.findIndex((b) => b.id === id);
  if (idx === -1) {
    throw new Error(`bookmark not found: ${id}`);
  }
  const next = [...file.bookmarks];
  const existing = next[idx]!;
  next[idx] = { ...existing, ...patch, updated_at: nowIso };
  return { ...file, updated_at: nowIso, bookmarks: next };
}

export function softDeleteBookmark(
  file: BookmarksFile,
  id: string,
  nowIso: string,
): BookmarksFile {
  return updateBookmark(file, id, { deleted_at: nowIso }, nowIso);
}

export function gcTombstones(
  file: BookmarksFile,
  olderThanDays: number,
  nowIso: string,
): BookmarksFile {
  const cutoffMs = new Date(nowIso).getTime() - olderThanDays * 86_400_000;
  const kept = file.bookmarks.filter((b) => {
    if (b.deleted_at == null) return true;
    return new Date(b.deleted_at).getTime() > cutoffMs;
  });
  if (kept.length === file.bookmarks.length) {
    return { ...file, updated_at: nowIso };
  }
  return { ...file, updated_at: nowIso, bookmarks: kept };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gitmarks/core test test/mutate.test.ts`
Expected: all mutation tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mutate.ts packages/core/test/mutate.test.ts
git commit -m "feat(core): add pure mutation helpers (add, update, softDelete, gcTombstones)"
```

---

### Task 10: Example fixtures + roundtrip validation test

**Files:**
- Create: `examples/example-bookmarks-repo/bookmarks.json`
- Create: `examples/example-bookmarks-repo/tags.json`
- Create: `packages/core/test/fixtures-roundtrip.test.ts`

**Why:** the spec calls for "an example repo with 10 hand-written bookmarks to test against." This is the file you'd `cp` into a fresh GitHub repo to seed a test setup. The roundtrip test validates the fixtures against the schema and verifies a sample mutation cycle.

- [ ] **Step 1: Create `examples/example-bookmarks-repo/bookmarks.json`**

```json
{
  "version": 1,
  "updated_at": "2026-05-23T14:32:11Z",
  "bookmarks": [
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
      "url": "https://news.ycombinator.com/",
      "title": "Hacker News",
      "folder": "",
      "tags": ["daily"],
      "added_at": "2026-05-01T08:00:00Z",
      "updated_at": "2026-05-01T08:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C2",
      "url": "https://lobste.rs/",
      "title": "Lobsters",
      "folder": "",
      "tags": ["daily"],
      "added_at": "2026-05-01T08:01:00Z",
      "updated_at": "2026-05-01T08:01:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C3",
      "url": "https://arxiv.org/abs/2310.00001",
      "title": "Example arXiv paper",
      "folder": "Research/AI",
      "tags": ["to-read", "claudepi"],
      "added_at": "2026-05-02T09:00:00Z",
      "updated_at": "2026-05-02T09:00:00Z",
      "added_from": "firefox@minerva",
      "deleted_at": null,
      "notes": "Skim section 3 first"
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C4",
      "url": "https://github.com/anthropics/anthropic-sdk-typescript",
      "title": "Anthropic SDK (TypeScript)",
      "folder": "Dev/SDKs",
      "tags": ["reference"],
      "added_at": "2026-05-03T10:00:00Z",
      "updated_at": "2026-05-03T10:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C5",
      "url": "https://docs.github.com/en/rest/repos/contents",
      "title": "GitHub Contents API",
      "folder": "Dev/Docs",
      "tags": ["reference"],
      "added_at": "2026-05-04T11:00:00Z",
      "updated_at": "2026-05-04T11:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C6",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/bookmarks",
      "title": "chrome.bookmarks API",
      "folder": "Dev/Docs",
      "tags": ["reference"],
      "added_at": "2026-05-05T12:00:00Z",
      "updated_at": "2026-05-05T12:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C7",
      "url": "https://en.wikipedia.org/wiki/ULID",
      "title": "ULID — Wikipedia",
      "folder": "Reading",
      "tags": [],
      "added_at": "2026-05-06T13:00:00Z",
      "updated_at": "2026-05-06T13:00:00Z",
      "added_from": "firefox@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C8",
      "url": "https://tailwindcss.com/docs",
      "title": "Tailwind CSS Docs",
      "folder": "Dev/Docs",
      "tags": ["reference"],
      "added_at": "2026-05-07T14:00:00Z",
      "updated_at": "2026-05-07T14:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C9",
      "url": "https://vitest.dev/guide/",
      "title": "Vitest Guide",
      "folder": "Dev/Docs",
      "tags": ["reference"],
      "added_at": "2026-05-08T15:00:00Z",
      "updated_at": "2026-05-08T15:00:00Z",
      "added_from": "brave@minerva",
      "deleted_at": null,
      "notes": null
    },
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      "url": "https://example.com/deleted-article",
      "title": "Tombstoned bookmark",
      "folder": "",
      "tags": [],
      "added_at": "2026-04-01T00:00:00Z",
      "updated_at": "2026-05-10T00:00:00Z",
      "added_from": "chrome@minerva",
      "deleted_at": "2026-05-10T00:00:00Z",
      "notes": null
    }
  ]
}
```

- [ ] **Step 2: Create `examples/example-bookmarks-repo/tags.json`**

```json
{
  "version": 1,
  "tags": {
    "daily": { "color": "#00FFFF", "description": "Open every morning" },
    "to-read": { "color": "#FFFF00", "description": "Queue" },
    "reference": { "color": "#00FF88", "description": "Docs and references" },
    "claudepi": { "color": "#FF00FF", "description": "ClaudePi research" }
  }
}
```

- [ ] **Step 3: Write the failing roundtrip test**

Create `packages/core/test/fixtures-roundtrip.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { bookmarksFileSchema } from "../src/schema/bookmarks.js";
import { tagsFileSchema } from "../src/schema/tags.js";
import {
  addBookmark,
  gcTombstones,
  softDeleteBookmark,
} from "../src/mutate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../../../examples/example-bookmarks-repo");

async function loadJson<T>(name: string): Promise<T> {
  const raw = await readFile(resolve(fixturesRoot, name), "utf8");
  return JSON.parse(raw) as T;
}

describe("example fixtures", () => {
  it("bookmarks.json matches the schema", async () => {
    const data = await loadJson("bookmarks.json");
    expect(() => bookmarksFileSchema.parse(data)).not.toThrow();
  });

  it("tags.json matches the schema", async () => {
    const data = await loadJson("tags.json");
    expect(() => tagsFileSchema.parse(data)).not.toThrow();
  });

  it("supports a full add → delete → gc cycle", async () => {
    const initial = bookmarksFileSchema.parse(
      await loadJson("bookmarks.json"),
    );

    const added = addBookmark(
      initial,
      {
        id: "01HZZZ0000000000000000000A",
        url: "https://example.com/added",
        title: "Added",
        folder: "",
        tags: [],
        added_at: "2026-05-23T00:00:00Z",
        updated_at: "2026-05-23T00:00:00Z",
        added_from: "chrome@test",
        deleted_at: null,
        notes: null,
      },
      "2026-05-23T00:00:00Z",
    );
    expect(added.bookmarks.length).toBe(initial.bookmarks.length + 1);

    const deleted = softDeleteBookmark(
      added,
      "01HZZZ0000000000000000000A",
      "2026-05-23T00:01:00Z",
    );
    expect(
      deleted.bookmarks.find((b) => b.id === "01HZZZ0000000000000000000A")
        ?.deleted_at,
    ).toBe("2026-05-23T00:01:00Z");

    const gced = gcTombstones(deleted, 30, "2026-07-01T00:00:00Z");
    expect(
      gced.bookmarks.some((b) => b.id === "01HZZZ0000000000000000000A"),
    ).toBe(false);
    expect(
      gced.bookmarks.some((b) => b.id === "01HXYZ8K7M9P3RQ2V5W6Z8B0CA"),
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gitmarks/core test test/fixtures-roundtrip.test.ts`
Expected: all 3 fixture tests pass.

- [ ] **Step 5: Commit**

```bash
git add examples packages/core/test/fixtures-roundtrip.test.ts
git commit -m "feat(core): add example bookmarks/tags fixtures and roundtrip test"
```

---

### Task 11: Public API surface + package README

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/README.md`

The barrel decides what's public. Anything not exported here is internal — consumers (extensions, web UI) must use the barrel.

- [ ] **Step 1: Replace `packages/core/src/index.ts` with the real barrel**

```typescript
// Schemas + inferred types
export {
  bookmarkSchema,
  bookmarksFileSchema,
  type Bookmark,
  type BookmarksFile,
} from "./schema/bookmarks.js";
export {
  tagSchema,
  tagsFileSchema,
  type Tag,
  type TagsFile,
} from "./schema/tags.js";

// Primitives
export { newUlid } from "./ulid.js";
export { normalizeUrl } from "./url.js";

// Pure mutations
export {
  addBookmark,
  updateBookmark,
  softDeleteBookmark,
  gcTombstones,
} from "./mutate.js";

// GitHub client
export {
  GitHubClient,
  type GitHubClientOptions,
  type ReadResult,
} from "./github/client.js";
export {
  GitHubError,
  GitHubAuthError,
  GitHubConflictError,
  GitHubNotFoundError,
} from "./github/errors.js";
```

- [ ] **Step 2: Delete the placeholder smoke test (no longer represents anything meaningful)**

```bash
git rm packages/core/test/smoke.test.ts
```

- [ ] **Step 3: Create `packages/core/README.md`**

```markdown
# @gitmarks/core

Shared library for the gitmarks browser extensions and web UI. Owns the
JSON schemas, the GitHub Contents API client, and pure helpers for mutating
the bookmark file.

This package does not know about `chrome.bookmarks`, React, or the DOM.
All browser-specific code lives in `packages/extension-*` and `packages/web`.

## Schemas

`bookmarksFileSchema` and `tagsFileSchema` are Zod schemas. Their inferred
types are exported as `BookmarksFile` and `TagsFile`.

```ts
import { bookmarksFileSchema, type BookmarksFile } from "@gitmarks/core";

const data: BookmarksFile = bookmarksFileSchema.parse(jsonFromGitHub);
```

## GitHub client

```ts
import { GitHubClient, type BookmarksFile } from "@gitmarks/core";

const client = new GitHubClient({
  owner: "alice",
  repo: "bookmarks",
  token: pat,
});

// Read with ETag for cheap polling
const first = await client.read<BookmarksFile>("bookmarks.json");
const maybe = await client.readIfChanged<BookmarksFile>(
  "bookmarks.json",
  first.etag,
);
// `maybe` is null if the file hasn't changed.

// Optimistic-concurrent update
const result = await client.update<BookmarksFile>(
  "bookmarks.json",
  (current) => addBookmark(current, newBookmark, new Date().toISOString()),
  "add bookmark from chrome@minerva",
);
```

`update()` reads the file, calls `mutate` on the latest data, and writes.
On a 409 it re-reads and replays `mutate` against the fresh data — so
`mutate` MUST be a pure function. Do not close over state from before
the call. Up to 3 attempts with exponential backoff (200ms / 400ms / 800ms).

## Errors

All client errors subclass `GitHubError`:

- `GitHubAuthError` (401) — PAT expired or wrong scope.
- `GitHubConflictError` (409/422) — SHA precondition failed. `update()`
  retries internally; if you use `write()` directly, it's your job.
- `GitHubNotFoundError` (404) — file or repo missing.

## Mutations

All four are pure functions of `BookmarksFile → BookmarksFile`. They take
`nowIso` explicitly so the caller controls timestamps (and so tests are
deterministic).

- `addBookmark(file, bookmark, nowIso)`
- `updateBookmark(file, id, patch, nowIso)`
- `softDeleteBookmark(file, id, nowIso)` — sets `deleted_at`
- `gcTombstones(file, olderThanDays, nowIso)` — drops bookmarks whose
  `deleted_at` is older than the threshold. Git history retains them.

## URL normalization

```ts
import { normalizeUrl } from "@gitmarks/core";
normalizeUrl("https://example.com/path/#section");
// → "https://example.com/path"
```

Strips trailing slashes from the path; drops fragments unless they start
with `#!` (hashbang routes are preserved).
```

- [ ] **Step 4: Run the full test suite + typecheck + build**

Run: `pnpm --filter @gitmarks/core test`
Expected: all tests pass.

Run: `pnpm --filter @gitmarks/core typecheck`
Expected: tsc exits 0 with no errors.

Run: `pnpm --filter @gitmarks/core build`
Expected: `packages/core/dist/index.js` + `dist/index.d.ts` are emitted, including all the public exports.

- [ ] **Step 5: Verify the public API by reading the emitted `.d.ts`**

Run: `cat packages/core/dist/index.d.ts`
Expected: the file lists `bookmarkSchema`, `bookmarksFileSchema`, `Bookmark`, `BookmarksFile`, `tagSchema`, `tagsFileSchema`, `Tag`, `TagsFile`, `newUlid`, `normalizeUrl`, `addBookmark`, `updateBookmark`, `softDeleteBookmark`, `gcTombstones`, `GitHubClient`, `GitHubClientOptions`, `ReadResult`, `GitHubError`, `GitHubAuthError`, `GitHubConflictError`, `GitHubNotFoundError`. Nothing else.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/README.md
git commit -m "feat(core): publish public API surface and README"
```

---

## Self-review summary

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Data model — `bookmarks.json` shape, field rules | Task 1 (schemas), Task 10 (fixtures) |
| Data model — `tags.json` shape | Task 1 (schemas), Task 10 (fixtures) |
| ULIDs, client-side generated | Task 3 |
| URL normalization rules | Task 2 |
| GitHub Contents API read | Task 6 |
| `If-None-Match` conditional reads | Task 6 |
| GitHub Contents API write with SHA | Task 7 |
| 409 → refetch → replay → exponential backoff (3 retries) | Task 8 |
| Soft delete / tombstone | Task 9 (`softDeleteBookmark`) |
| Tombstone GC after 30 days | Task 9 (`gcTombstones`) |
| Repo layout — `packages/core` | Task 0 |
| pnpm workspaces | Task 0 |

**Out of scope for this plan (covered by future plans):**

- `chrome.bookmarks.*` listeners, reconciliation, ID mapping (Chrome extension plan)
- PAT setup UI, repo validation/creation (extension plan)
- 5-min `chrome.alarms` poll loop (extension plan)
- Initial reconciliation algorithm (extension plan)
- Tracking-param stripping toggle (spec open question — punted, not added)

**Placeholder scan:** none.

**Type/name consistency:** `BookmarksFile`, `Bookmark`, `Tag`, `TagsFile`, `GitHubClient`, `GitHubError`, `addBookmark`, `updateBookmark`, `softDeleteBookmark`, `gcTombstones`, `normalizeUrl`, `newUlid`, `encodeBase64Utf8`, `decodeBase64Utf8` — all used identically in every task and in the final barrel.
