# Web UI v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-side Web UI (list + client-side search + tag management) as a static SPA that talks directly to the GitHub Contents API using `@gitmarks/core`.

**Architecture:** New package `packages/web` — Vite + React 18 + TypeScript + Tailwind 3 SPA. Hash routing so it deploys cleanly on GitHub Pages or Cloudflare Pages. Settings (PAT + owner + repo + branch) stored in `localStorage`. Data flows: `useGitmarksData` hook owns both files + ETags, hands them to `ListPage` and `TagsPage`. Tag writes go through `client.update()` on `tags.json` only — bookmark references are intentionally decoupled (spec §"`tags.json`").

**Tech Stack:** Vite 5, React 18, TypeScript 5.4, Tailwind 3, react-router-dom 6, @gitmarks/core (workspace), Vitest 2 + jsdom + @testing-library/react.

**Scope (in):** Read bookmarks + tags. Client-side search (title / url / tags / notes substring). Tag management (rename, recolor, create, delete) — writes to `tags.json` only. Setup flow (PAT entry + validate). Manual "sync from GitHub" refresh button. Tombstones hidden from list.

**Scope (out, deferred to v2 / #25):** Bulk operations, trash view + restore, Netscape HTML export, bookmark creation, bookmark editing, conflict resolution UI.

**Branch:** `feat/web-ui-v1`

---

## File Structure

```
packages/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── README.md
└── src/
    ├── main.tsx                     # React entry → mounts <App/>
    ├── App.tsx                      # RouterProvider + global providers
    ├── index.css                    # Tailwind directives + base body styles
    ├── lib/
    │   ├── settings.ts              # localStorage Settings (Zod-validated)
    │   ├── client.ts                # GitHubClient factory + validateConnection
    │   ├── data.ts                  # searchBookmarks, visibleBookmarks (pure)
    │   └── tag-mutations.ts         # renameTag, setTagColor, addTag, deleteTag (pure)
    ├── hooks/
    │   └── useGitmarksData.ts       # loads both files w/ ETag; exposes refresh + writeTags
    ├── components/
    │   ├── Layout.tsx               # chrome: nav + sync button + status pill
    │   ├── SetupForm.tsx            # PAT/owner/repo/branch + Validate + Save
    │   ├── BookmarkList.tsx
    │   ├── BookmarkRow.tsx
    │   ├── TagChip.tsx              # consistent styling, looks up color from TagsFile
    │   ├── SearchBar.tsx
    │   ├── TagFilter.tsx            # left-rail tag selector
    │   └── TagManager.tsx           # editable tag table
    └── routes/
        ├── SetupPage.tsx
        ├── ListPage.tsx
        └── TagsPage.tsx
└── test/
    ├── setup.ts                     # @testing-library/jest-dom + localStorage reset
    ├── lib.settings.test.ts
    ├── lib.client.test.ts
    ├── lib.data.test.ts
    ├── lib.tag-mutations.test.ts
    ├── hooks.useGitmarksData.test.ts
    ├── components.SetupForm.test.tsx
    ├── components.BookmarkList.test.tsx
    ├── components.TagFilter.test.tsx
    └── components.TagManager.test.tsx
```

**Other files modified:**
- `pnpm-workspace.yaml` — already covers `packages/*`, no change
- `README.md` — add web package row + roadmap status
- `CLAUDE.md` — add web package to module map + roadmap update
- `.github/workflows/test.yml` — verify the new package gets typechecked + tested + built (no change expected since the workflow runs `pnpm typecheck`, `pnpm test`, `pnpm build` workspace-wide — but verify in Task 13)

---

## Task 1: Scaffold `packages/web` with Vite + React + Tailwind

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/vitest.config.ts`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/index.css`
- Create: `packages/web/test/setup.ts`
- Create: `packages/web/test/smoke.test.tsx`
- Create: `packages/web/.gitignore`

- [ ] **Step 1: Create the package manifest**

Write `packages/web/package.json`:

```json
{
  "name": "@gitmarks/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@gitmarks/core": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Write `packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
    "rootDir": ".",
    "outDir": "./dist-types",
    "noEmit": true
  },
  "include": ["src", "test", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts"]
}
```

- [ ] **Step 3: Create the Vite config**

Write `packages/web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" so the build works whether deployed at root or under a subpath
// (GitHub Pages serves under <user>.github.io/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```

- [ ] **Step 4: Create the Vitest config**

Write `packages/web/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 5: Create the Tailwind config**

Write `packages/web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

// Aesthetic per spec: cyan/magenta on dark.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",
        mist: "#16161e",
        fog: "#23232e",
        cyan: { DEFAULT: "#22d3ee", soft: "#67e8f9" },
        magenta: { DEFAULT: "#e879f9", soft: "#f0abfc" },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create the PostCSS config**

Write `packages/web/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create the HTML entry**

Write `packages/web/index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>gitmarks</title>
  </head>
  <body class="bg-ink text-cyan-soft font-mono antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create the React entry**

Write `packages/web/src/main.tsx`:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

const rootEl = document.getElementById("root");
if (rootEl == null) throw new Error("missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create the App placeholder**

Write `packages/web/src/App.tsx`:

```typescript
export function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-magenta text-3xl">gitmarks</h1>
    </main>
  );
}
```

- [ ] **Step 10: Create the global stylesheet**

Write `packages/web/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}
```

- [ ] **Step 11: Create the test setup file**

Write `packages/web/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 12: Write the smoke test**

Write `packages/web/test/smoke.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../src/App.js";

describe("App", () => {
  it("renders the gitmarks heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /gitmarks/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 13: Create the package .gitignore**

Write `packages/web/.gitignore`:

```
dist/
dist-types/
node_modules/
```

- [ ] **Step 14: Install + run typecheck, test, build**

Run from repo root. The first command installs deps for the new package; the second ensures `@gitmarks/core`'s `dist/` exists (typecheck and build pull `.d.ts` from there).

```bash
pnpm install
pnpm --filter @gitmarks/core build
pnpm --filter @gitmarks/web typecheck
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web build
```

Expected: all four pass. The smoke test should be 1/1 passing. The build emits `packages/web/dist/index.html`.

- [ ] **Step 15: Commit**

```bash
git checkout -b feat/web-ui-v1
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Vite + React + Tailwind package shell"
```

---

## Task 2: Settings storage with Zod validation

**Files:**
- Create: `packages/web/src/lib/settings.ts`
- Create: `packages/web/test/lib.settings.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/lib.settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, clearSettings, type Settings } from "../src/lib/settings.js";

const valid: Settings = {
  token: "ghp_fake_token",
  owner: "paperhurts",
  repo: "bookmarks",
  branch: "main",
};

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is stored", () => {
    expect(loadSettings()).toBeNull();
  });

  it("round-trips a valid settings object", () => {
    saveSettings(valid);
    expect(loadSettings()).toEqual(valid);
  });

  it("returns null and discards garbage", () => {
    localStorage.setItem("gitmarks:web:settings", "{not json");
    expect(loadSettings()).toBeNull();
  });

  it("returns null on schema mismatch", () => {
    localStorage.setItem("gitmarks:web:settings", JSON.stringify({ token: 1 }));
    expect(loadSettings()).toBeNull();
  });

  it("clearSettings removes the entry", () => {
    saveSettings(valid);
    clearSettings();
    expect(loadSettings()).toBeNull();
  });

  it("rejects empty token / owner / repo at save time", () => {
    expect(() => saveSettings({ ...valid, token: "" })).toThrow();
    expect(() => saveSettings({ ...valid, owner: "" })).toThrow();
    expect(() => saveSettings({ ...valid, repo: "" })).toThrow();
  });

  it("accepts custom branch and defaults are not applied silently", () => {
    saveSettings({ ...valid, branch: "develop" });
    expect(loadSettings()?.branch).toBe("develop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test
```

Expected: FAIL — `Cannot find module ../src/lib/settings.js`.

- [ ] **Step 3: Write the implementation**

Write `packages/web/src/lib/settings.ts`:

```typescript
import { z } from "zod";

const STORAGE_KEY = "gitmarks:web:settings";

export const settingsSchema = z.object({
  token: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export function loadSettings(): Settings | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = settingsSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function saveSettings(settings: Settings): void {
  const validated = settingsSchema.parse(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS (7/7 settings tests + 1/1 smoke test = 8 passing).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/settings.ts packages/web/test/lib.settings.test.ts
git commit -m "feat(web): add localStorage Settings with Zod validation"
```

---

## Task 3: GitHub client factory + validateConnection

**Files:**
- Create: `packages/web/src/lib/client.ts`
- Create: `packages/web/test/lib.client.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/lib.client.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { makeClient, validateConnection } from "../src/lib/client.js";
import type { Settings } from "../src/lib/settings.js";

const baseSettings: Settings = {
  token: "ghp_fake",
  owner: "paperhurts",
  repo: "bookmarks",
  branch: "main",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", etag: '"abc"', ...(init.headers ?? {}) },
  });
}

function contentsResponse(payload: unknown): Response {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return jsonResponse({ content, sha: "deadbeef", encoding: "base64" });
}

describe("makeClient", () => {
  it("builds a GitHubClient with the given settings and a custom fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(contentsResponse({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] }));
    const client = makeClient(baseSettings, fetchImpl);
    const result = await client.read("bookmarks.json");
    expect(result.data).toEqual({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("validateConnection", () => {
  it("returns ok-with-files when both files are present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(contentsResponse({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] }))
      .mockResolvedValueOnce(contentsResponse({ version: 1, tags: {} }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "ok-with-files" });
  });

  it("returns ok-no-files when bookmarks.json is 404 but repo exists", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: "bookmarks" })); // repo lookup
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "ok-no-files" });
  });

  it("returns auth-failed on 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, { status: 401 }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "auth-failed" });
  });

  it("returns repo-not-found when both bookmarks.json and repo lookup 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, { status: 404 }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "repo-not-found" });
  });

  it("returns network-error on a non-HTTP fetch failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Network down"));
    const result = await validateConnection(baseSettings, fetchImpl);
    expect(result.status).toBe("network-error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/lib.client.test.ts
```

Expected: FAIL — `Cannot find module ../src/lib/client.js`.

- [ ] **Step 3: Write the implementation**

Write `packages/web/src/lib/client.ts`:

```typescript
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
    } catch {
      // tags.json missing is fine for v1; treat as ok-with-files since bookmarks loaded.
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS (all previous + 5 new = 13 passing).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/client.ts packages/web/test/lib.client.test.ts
git commit -m "feat(web): add GitHubClient factory + validateConnection"
```

---

## Task 4: Router skeleton + redirect-when-unconfigured

**Files:**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/routes/SetupPage.tsx` (placeholder)
- Create: `packages/web/src/routes/ListPage.tsx` (placeholder)
- Create: `packages/web/src/routes/TagsPage.tsx` (placeholder)
- Create: `packages/web/test/App.routing.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/App.routing.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";
import { saveSettings } from "../src/lib/settings.js";

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("redirects to /setup when no settings are stored", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /set up gitmarks/i })).toBeInTheDocument();
  });

  it("renders the list page when settings are present", () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    render(<App />);
    expect(screen.getByTestId("list-page")).toBeInTheDocument();
  });

  it("navigates to /tags via the nav link", async () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    window.location.hash = "#/tags";
    render(<App />);
    expect(screen.getByTestId("tags-page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/App.routing.test.tsx
```

Expected: FAIL — `unable to find role 'heading' with name /set up gitmarks/i`.

- [ ] **Step 3: Create the placeholder routes**

Write `packages/web/src/routes/SetupPage.tsx`:

```typescript
export function SetupPage() {
  return (
    <section data-testid="setup-page">
      <h1 className="text-magenta text-2xl">Set up gitmarks</h1>
    </section>
  );
}
```

Write `packages/web/src/routes/ListPage.tsx`:

```typescript
export function ListPage() {
  return (
    <section data-testid="list-page">
      <h1 className="text-cyan text-2xl">Bookmarks</h1>
    </section>
  );
}
```

Write `packages/web/src/routes/TagsPage.tsx`:

```typescript
export function TagsPage() {
  return (
    <section data-testid="tags-page">
      <h1 className="text-cyan text-2xl">Tags</h1>
    </section>
  );
}
```

- [ ] **Step 4: Rewrite App.tsx with the router**

Overwrite `packages/web/src/App.tsx`:

```typescript
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { useMemo } from "react";
import { loadSettings } from "./lib/settings.js";
import { SetupPage } from "./routes/SetupPage.js";
import { ListPage } from "./routes/ListPage.js";
import { TagsPage } from "./routes/TagsPage.js";

function RequireSettings() {
  const settings = loadSettings();
  if (settings == null) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

export function App() {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/setup", element: <SetupPage /> },
        {
          element: <RequireSettings />,
          children: [
            { path: "/", element: <ListPage /> },
            { path: "/tags", element: <TagsPage /> },
          ],
        },
      ]),
    [],
  );
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — smoke test now checks `gitmarks` heading on Setup page (which contains "Set up gitmarks" — `getByRole("heading", { name: /gitmarks/i })` still matches). All previous + 3 new = ~16 passing.

If smoke test fails because two headings now match, narrow it. Update `packages/web/test/smoke.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../src/App.js";

describe("App smoke", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body.firstChild).not.toBeNull();
  });
});
```

Re-run: `pnpm --filter @gitmarks/web test`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/routes packages/web/test/App.routing.test.tsx packages/web/test/smoke.test.tsx
git commit -m "feat(web): wire hash router with setup gate"
```

---

## Task 5: Setup page form

**Files:**
- Create: `packages/web/src/components/SetupForm.tsx`
- Modify: `packages/web/src/routes/SetupPage.tsx`
- Create: `packages/web/test/components.SetupForm.test.tsx`

- [ ] **Step 1: Write the failing component test**

Write `packages/web/test/components.SetupForm.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SetupForm } from "../src/components/SetupForm.js";
import { loadSettings } from "../src/lib/settings.js";

function renderForm(validate: (s: any) => Promise<{ status: string; message?: string }>) {
  return render(
    <MemoryRouter>
      <SetupForm validate={validate} />
    </MemoryRouter>,
  );
}

describe("SetupForm", () => {
  beforeEach(() => localStorage.clear());

  it("disables Save until Validate succeeds", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "ok-with-files" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "ghp_fake");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /validate/i }));
    expect(await screen.findByText(/valid PAT/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("shows auth-failed error when validate returns auth-failed", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "auth-failed" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "bad");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");
    await user.click(screen.getByRole("button", { name: /validate/i }));

    expect(await screen.findByText(/invalid token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("persists settings to localStorage on Save", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "ok-with-files" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "ghp_fake");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");
    await user.click(screen.getByRole("button", { name: /validate/i }));
    await screen.findByText(/valid PAT/i);
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(loadSettings()).toEqual({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/components.SetupForm.test.tsx
```

Expected: FAIL — `Cannot find module ../src/components/SetupForm.js`.

- [ ] **Step 3: Write the SetupForm**

Write `packages/web/src/components/SetupForm.tsx`:

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveSettings, type Settings } from "../lib/settings.js";
import { validateConnection, type ValidateResult } from "../lib/client.js";

type ValidateFn = (settings: Settings) => Promise<ValidateResult>;

interface Props {
  validate?: ValidateFn;
}

const labelClass = "block text-sm text-cyan-soft mb-1";
const inputClass =
  "w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none";
const buttonClass =
  "px-4 py-2 rounded bg-cyan text-ink font-semibold hover:bg-cyan-soft disabled:opacity-40 disabled:cursor-not-allowed";

export function SetupForm({ validate = validateConnection }: Props) {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const navigate = useNavigate();

  const settings: Settings = { token, owner, repo, branch };
  const formComplete = token.length > 0 && owner.length > 0 && repo.length > 0 && branch.length > 0;

  async function onValidate() {
    setValidating(true);
    setValidated(false);
    setStatus(null);
    const result = await validate(settings);
    setValidating(false);
    if (result.status === "ok-with-files") {
      setStatus({ kind: "ok", message: "✓ valid PAT, repo + bookmarks.json found" });
      setValidated(true);
    } else if (result.status === "ok-no-files") {
      setStatus({ kind: "ok", message: "✓ valid PAT, repo exists (bookmarks.json will be created on first save)" });
      setValidated(true);
    } else if (result.status === "auth-failed") {
      setStatus({ kind: "err", message: "Invalid token — check PAT permissions" });
    } else if (result.status === "repo-not-found") {
      setStatus({ kind: "err", message: "Repo not found — check owner/repo/branch" });
    } else {
      setStatus({ kind: "err", message: `Network error: ${result.message}` });
    }
  }

  function onSave() {
    saveSettings(settings);
    navigate("/");
  }

  return (
    <form
      className="max-w-md mx-auto p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (validated) onSave();
      }}
    >
      <h1 className="text-magenta text-2xl mb-4">Set up gitmarks</h1>

      <label>
        <span className={labelClass}>GitHub fine-grained PAT</span>
        <input
          aria-label="token"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={token}
          onChange={(e) => { setToken(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Owner</span>
        <input
          aria-label="owner"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={owner}
          onChange={(e) => { setOwner(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Repo</span>
        <input
          aria-label="repo"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={repo}
          onChange={(e) => { setRepo(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Branch</span>
        <input
          aria-label="branch"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          className={`${buttonClass} bg-fog text-cyan-soft`}
          disabled={!formComplete || validating}
          onClick={onValidate}
        >
          {validating ? "Validating…" : "Validate"}
        </button>
        <button
          type="submit"
          className={buttonClass}
          disabled={!validated}
        >
          Save
        </button>
      </div>

      {status && (
        <p className={status.kind === "ok" ? "text-cyan" : "text-magenta"}>
          {status.message}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Wire it into the SetupPage**

Overwrite `packages/web/src/routes/SetupPage.tsx`:

```typescript
import { SetupForm } from "../components/SetupForm.js";

export function SetupPage() {
  return (
    <main data-testid="setup-page" className="min-h-screen">
      <SetupForm />
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — all previous + 3 new = ~19 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/SetupForm.tsx packages/web/src/routes/SetupPage.tsx packages/web/test/components.SetupForm.test.tsx
git commit -m "feat(web): setup form with PAT entry, validate, and persist"
```

---

## Task 6: Layout chrome + navigation

**Files:**
- Create: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/test/components.Layout.test.tsx`

- [ ] **Step 1: Write the failing component test**

Write `packages/web/test/components.Layout.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../src/components/Layout.js";

function rendered(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Layout
        status={{ kind: "ok", message: "synced 12s ago" }}
        onRefresh={() => {}}
        refreshing={false}
      >
        <div data-testid="outlet">content</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders the children", () => {
    rendered();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("renders nav links for List and Tags", () => {
    rendered();
    expect(screen.getByRole("link", { name: /list/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /tags/i })).toHaveAttribute("href", "/tags");
  });

  it("shows the status pill", () => {
    rendered();
    expect(screen.getByText(/synced 12s ago/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/components.Layout.test.tsx
```

Expected: FAIL — `Cannot find module ../src/components/Layout.js`.

- [ ] **Step 3: Write the Layout**

Write `packages/web/src/components/Layout.tsx`:

```typescript
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type LayoutStatus =
  | { kind: "ok"; message: string }
  | { kind: "warn"; message: string }
  | { kind: "err"; message: string }
  | { kind: "loading"; message: string };

interface Props {
  children: ReactNode;
  status: LayoutStatus;
  onRefresh: () => void;
  refreshing: boolean;
}

const navLinkBase = "px-3 py-1 rounded";
const navLinkActive = "bg-fog text-cyan";
const navLinkInactive = "text-cyan-soft hover:text-cyan";

export function Layout({ children, status, onRefresh, refreshing }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-fog px-4 py-3 flex items-center gap-4">
        <span className="text-magenta font-bold text-lg">gitmarks</span>
        <nav className="flex gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            List
          </NavLink>
          <NavLink
            to="/tags"
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
            }
          >
            Tags
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <StatusPill status={status} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan disabled:opacity-40"
          >
            {refreshing ? "Syncing…" : "Sync from GitHub"}
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function StatusPill({ status }: { status: LayoutStatus }) {
  const color =
    status.kind === "ok"
      ? "text-cyan"
      : status.kind === "warn"
        ? "text-yellow-300"
        : status.kind === "err"
          ? "text-magenta"
          : "text-cyan-soft";
  return <span className={color}>{status.message}</span>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test test/components.Layout.test.tsx
```

Expected: PASS — 3 new tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Layout.tsx packages/web/test/components.Layout.test.tsx
git commit -m "feat(web): layout chrome with nav and status pill"
```

---

## Task 7: Data hook (`useGitmarksData`)

**Files:**
- Create: `packages/web/src/hooks/useGitmarksData.ts`
- Create: `packages/web/test/hooks.useGitmarksData.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/hooks.useGitmarksData.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { useGitmarksData } from "../src/hooks/useGitmarksData.js";
import type { GitHubClient } from "@gitmarks/core";

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [],
};
const tagsFile: TagsFile = { version: 1, tags: {} };

function fakeClient(over: Partial<GitHubClient> = {}): GitHubClient {
  const base: any = {
    read: vi.fn().mockImplementation(async (path: string) => {
      if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b1", etag: '"b"' };
      if (path === "tags.json") return { data: tagsFile, sha: "t1", etag: '"t"' };
      throw new Error("unexpected path");
    }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  };
  return Object.assign(base, over) as GitHubClient;
}

describe("useGitmarksData", () => {
  it("loads both files on mount", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookmarksFile).toEqual(bookmarksFile);
    expect(result.current.tagsFile).toEqual(tagsFile);
    expect(result.current.error).toBeNull();
  });

  it("refresh() uses readIfChanged with the stored etag and skips on 304", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect((client.readIfChanged as any)).toHaveBeenCalledWith("bookmarks.json", '"b"');
    expect((client.readIfChanged as any)).toHaveBeenCalledWith("tags.json", '"t"');
  });

  it("refresh() applies a fresh result when ETag changes", async () => {
    const updated: BookmarksFile = { ...bookmarksFile, updated_at: "2026-05-24T00:00:00Z" };
    const client = fakeClient({
      readIfChanged: vi.fn().mockImplementation(async (path: string) => {
        if (path === "bookmarks.json") return { data: updated, sha: "b2", etag: '"b2"' };
        return null;
      }),
    } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.bookmarksFile).toEqual(updated);
  });

  it("writeTags() calls client.update on tags.json with the mutator", async () => {
    const update = vi.fn().mockResolvedValue({ data: tagsFile, sha: "t2", etag: '"t2"' });
    const client = fakeClient({ update } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const mutator = (f: TagsFile) => f;
    await act(async () => {
      await result.current.writeTags(mutator, "test commit");
    });

    expect(update).toHaveBeenCalledWith("tags.json", mutator, "test commit");
  });

  it("sets error when initial read throws", async () => {
    const client = fakeClient({
      read: vi.fn().mockRejectedValue(new Error("boom")),
    } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom/);
    expect(result.current.bookmarksFile).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/hooks.useGitmarksData.test.ts
```

Expected: FAIL — `Cannot find module ../src/hooks/useGitmarksData.js`.

- [ ] **Step 3: Write the hook**

Write `packages/web/src/hooks/useGitmarksData.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";

interface Loaded<T> {
  data: T;
  etag: string;
  sha: string;
}

export interface UseGitmarksData {
  bookmarksFile: BookmarksFile | null;
  tagsFile: TagsFile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  writeTags: (
    mutate: (f: TagsFile) => TagsFile,
    message: string,
  ) => Promise<void>;
}

export function useGitmarksData(client: GitHubClient): UseGitmarksData {
  const [bookmarks, setBookmarks] = useState<Loaded<BookmarksFile> | null>(null);
  const [tags, setTags] = useState<Loaded<TagsFile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, t] = await Promise.all([
        client.read<BookmarksFile>("bookmarks.json"),
        client.read<TagsFile>("tags.json").catch(() => null),
      ]);
      if (!mounted.current) return;
      setBookmarks({ data: b.data, etag: b.etag, sha: b.sha });
      if (t != null) setTags({ data: t.data, etag: t.etag, sha: t.sha });
      else setTags({ data: { version: 1, tags: {} }, etag: "", sha: "" });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [client]);

  const refresh = useCallback(async () => {
    if (bookmarks == null) return loadInitial();
    setError(null);
    try {
      const [b, t] = await Promise.all([
        client.readIfChanged<BookmarksFile>("bookmarks.json", bookmarks.etag),
        tags != null && tags.etag.length > 0
          ? client.readIfChanged<TagsFile>("tags.json", tags.etag)
          : client.read<TagsFile>("tags.json").catch(() => null),
      ]);
      if (!mounted.current) return;
      if (b != null) setBookmarks({ data: b.data, etag: b.etag, sha: b.sha });
      if (t != null) setTags({ data: t.data, etag: t.etag, sha: t.sha });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bookmarks, tags, client, loadInitial]);

  const writeTags = useCallback(
    async (mutate: (f: TagsFile) => TagsFile, message: string) => {
      const result = await client.update<TagsFile>("tags.json", mutate, message);
      if (!mounted.current) return;
      setTags({ data: result.data, etag: result.etag, sha: result.sha });
    },
    [client],
  );

  useEffect(() => {
    mounted.current = true;
    void loadInitial();
    return () => {
      mounted.current = false;
    };
  }, [loadInitial]);

  return {
    bookmarksFile: bookmarks?.data ?? null,
    tagsFile: tags?.data ?? null,
    loading,
    error,
    refresh,
    writeTags,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — 5 new tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useGitmarksData.ts packages/web/test/hooks.useGitmarksData.test.ts
git commit -m "feat(web): useGitmarksData hook with ETag conditional refresh"
```

---

## Task 8: Search + filter helpers (pure)

**Files:**
- Create: `packages/web/src/lib/data.ts`
- Create: `packages/web/test/lib.data.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `packages/web/test/lib.data.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import { searchBookmarks, visibleBookmarks, allUsedTags } from "../src/lib/data.js";

function mk(over: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/article",
    title: "Article",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", title: "Hacker News", url: "https://news.ycombinator.com/", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", title: "Lobsters", url: "https://lobste.rs/", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", title: "Tailwind Docs", url: "https://tailwindcss.com/docs", tags: ["reference"], notes: "color tokens here" }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CD", title: "Tombstone", url: "https://gone.example.com/", deleted_at: "2026-05-10T00:00:00Z" }),
  ],
};

describe("visibleBookmarks", () => {
  it("filters out tombstoned bookmarks", () => {
    expect(visibleBookmarks(file)).toHaveLength(3);
    expect(visibleBookmarks(file).map((b) => b.id)).not.toContain("01HXYZ8K7M9P3RQ2V5W6Z8B0CD");
  });
});

describe("searchBookmarks", () => {
  it("returns all visible bookmarks for an empty query", () => {
    expect(searchBookmarks(visibleBookmarks(file), "")).toHaveLength(3);
  });

  it("matches title case-insensitively", () => {
    expect(searchBookmarks(visibleBookmarks(file), "tailwind")).toHaveLength(1);
    expect(searchBookmarks(visibleBookmarks(file), "TAILWIND")).toHaveLength(1);
  });

  it("matches URL substring", () => {
    expect(searchBookmarks(visibleBookmarks(file), "lobste.rs")).toHaveLength(1);
  });

  it("matches tags", () => {
    expect(searchBookmarks(visibleBookmarks(file), "daily")).toHaveLength(2);
  });

  it("matches notes", () => {
    expect(searchBookmarks(visibleBookmarks(file), "color tokens")).toHaveLength(1);
  });

  it("returns empty array for no matches", () => {
    expect(searchBookmarks(visibleBookmarks(file), "unrelated-xyz")).toHaveLength(0);
  });

  it("trims whitespace from the query", () => {
    expect(searchBookmarks(visibleBookmarks(file), "   tailwind   ")).toHaveLength(1);
  });
});

describe("allUsedTags", () => {
  it("returns the set of tag names referenced by visible bookmarks", () => {
    expect(allUsedTags(visibleBookmarks(file))).toEqual(new Set(["daily", "reference"]));
  });

  it("returns an empty set when no bookmarks have tags", () => {
    expect(allUsedTags([])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/lib.data.test.ts
```

Expected: FAIL — `Cannot find module ../src/lib/data.js`.

- [ ] **Step 3: Write the implementation**

Write `packages/web/src/lib/data.ts`:

```typescript
import type { Bookmark, BookmarksFile } from "@gitmarks/core";

export function visibleBookmarks(file: BookmarksFile): Bookmark[] {
  return file.bookmarks.filter((b) => b.deleted_at == null);
}

export function searchBookmarks(bookmarks: Bookmark[], query: string): Bookmark[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return bookmarks;
  return bookmarks.filter((b) => {
    if (b.title.toLowerCase().includes(q)) return true;
    if (b.url.toLowerCase().includes(q)) return true;
    if (b.notes != null && b.notes.toLowerCase().includes(q)) return true;
    return b.tags.some((t) => t.toLowerCase().includes(q));
  });
}

export function allUsedTags(bookmarks: Bookmark[]): Set<string> {
  const out = new Set<string>();
  for (const b of bookmarks) for (const t of b.tags) out.add(t);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — 9 new tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/data.ts packages/web/test/lib.data.test.ts
git commit -m "feat(web): pure search + visibility helpers"
```

---

## Task 9: List page rendering

**Files:**
- Create: `packages/web/src/components/TagChip.tsx`
- Create: `packages/web/src/components/BookmarkRow.tsx`
- Create: `packages/web/src/components/BookmarkList.tsx`
- Modify: `packages/web/src/routes/ListPage.tsx`
- Create: `packages/web/test/components.BookmarkList.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/components.BookmarkList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkList } from "../src/components/BookmarkList.js";

const bookmarks: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      folder: "",
      tags: ["daily"],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://gone.example.com/",
      title: "Deleted",
      folder: "",
      tags: [],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-10T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-10T00:00:00Z",
      notes: null,
    },
  ],
};

const tags: TagsFile = {
  version: 1,
  tags: { daily: { color: "#00FFFF", description: null } },
};

describe("BookmarkList", () => {
  it("renders one row per non-deleted bookmark", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("renders the URL as an external link", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    const link = screen.getByRole("link", { name: /hacker news/i });
    expect(link).toHaveAttribute("href", "https://news.ycombinator.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a tag chip per tag", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.getByText("daily")).toBeInTheDocument();
  });

  it("renders an empty state when there are no visible bookmarks", () => {
    const empty: BookmarksFile = { version: 1, updated_at: "now", bookmarks: [] };
    render(<BookmarkList bookmarksFile={empty} tagsFile={tags} />);
    expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/components.BookmarkList.test.tsx
```

Expected: FAIL — `Cannot find module ../src/components/BookmarkList.js`.

- [ ] **Step 3: Write the TagChip**

Write `packages/web/src/components/TagChip.tsx`:

```typescript
import type { TagsFile } from "@gitmarks/core";

interface Props {
  name: string;
  tagsFile: TagsFile;
}

const DEFAULT_COLOR = "#475569";

export function TagChip({ name, tagsFile }: Props) {
  const tag = tagsFile.tags[name];
  const color = tag?.color ?? DEFAULT_COLOR;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs"
      style={{ backgroundColor: `${color}30`, color, border: `1px solid ${color}80` }}
    >
      {name}
    </span>
  );
}
```

- [ ] **Step 4: Write the BookmarkRow**

Write `packages/web/src/components/BookmarkRow.tsx`:

```typescript
import type { Bookmark, TagsFile } from "@gitmarks/core";
import { TagChip } from "./TagChip.js";

interface Props {
  bookmark: Bookmark;
  tagsFile: TagsFile;
}

export function BookmarkRow({ bookmark, tagsFile }: Props) {
  const folder = bookmark.folder.length > 0 ? bookmark.folder : "(root)";
  return (
    <li className="border-b border-fog px-4 py-3 hover:bg-mist transition-colors">
      <div className="flex items-baseline gap-3">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan hover:text-magenta truncate flex-1"
        >
          {bookmark.title}
        </a>
        <span className="text-xs text-cyan-soft/60">{folder}</span>
      </div>
      <div className="text-xs text-cyan-soft/40 truncate mt-1">{bookmark.url}</div>
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {bookmark.tags.map((t) => (
            <TagChip key={t} name={t} tagsFile={tagsFile} />
          ))}
        </div>
      )}
      {bookmark.notes != null && (
        <p className="text-xs text-cyan-soft/70 italic mt-1">{bookmark.notes}</p>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Write the BookmarkList**

Write `packages/web/src/components/BookmarkList.tsx`:

```typescript
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkRow } from "./BookmarkRow.js";
import { visibleBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
}

export function BookmarkList({ bookmarksFile, tagsFile }: Props) {
  const items = visibleBookmarks(bookmarksFile);
  if (items.length === 0) {
    return (
      <p className="p-6 text-cyan-soft/60">
        No bookmarks yet. Save one from a browser extension to see it here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-fog">
      {items.map((b) => (
        <BookmarkRow key={b.id} bookmark={b} tagsFile={tagsFile} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test test/components.BookmarkList.test.tsx
```

Expected: PASS — 4 new tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/TagChip.tsx packages/web/src/components/BookmarkRow.tsx packages/web/src/components/BookmarkList.tsx packages/web/test/components.BookmarkList.test.tsx
git commit -m "feat(web): bookmark list rendering with tag chips"
```

---

## Task 10: Search bar + tag filter wiring (ListPage integration)

**Files:**
- Create: `packages/web/src/components/SearchBar.tsx`
- Create: `packages/web/src/components/TagFilter.tsx`
- Modify: `packages/web/src/routes/ListPage.tsx`
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/test/ListPage.integration.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/ListPage.integration.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";
import { ListPage } from "../src/routes/ListPage.js";

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", url: "https://news.ycombinator.com/", title: "Hacker News", folder: "", tags: ["daily"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", url: "https://lobste.rs/", title: "Lobsters", folder: "", tags: ["daily"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", url: "https://tailwindcss.com/docs", title: "Tailwind", folder: "", tags: ["reference"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
  ],
};

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: null },
    reference: { color: "#00FF88", description: null },
  },
};

function fakeClient(): GitHubClient {
  return {
    read: vi.fn().mockImplementation(async (path: string) => {
      if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b", etag: '"b"' };
      if (path === "tags.json") return { data: tagsFile, sha: "t", etag: '"t"' };
      throw new Error("unexpected");
    }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  } as any;
}

describe("ListPage integration", () => {
  it("filters the list when the user types in the search box", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Hacker News")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search/i), "tailwind");
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
    expect(screen.queryByText("Hacker News")).not.toBeInTheDocument();
  });

  it("filters the list when a tag chip is clicked in the sidebar", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByRole("button", { name: /^daily$/i }));
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("Lobsters")).toBeInTheDocument();
    expect(screen.queryByText("Tailwind")).not.toBeInTheDocument();
  });

  it("clears the tag filter when the same chip is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    const chip = screen.getByRole("button", { name: /^daily$/i });
    await user.click(chip);
    await user.click(chip);
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/ListPage.integration.test.tsx
```

Expected: FAIL — ListPage does not accept `client` prop and SearchBar/TagFilter do not exist.

- [ ] **Step 3: Write the SearchBar**

Write `packages/web/src/components/SearchBar.tsx`:

```typescript
interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="sr-only">search</span>
      <input
        aria-label="search"
        type="search"
        placeholder="Search title, url, tag, notes…"
        className="w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
```

- [ ] **Step 4: Write the TagFilter**

Write `packages/web/src/components/TagFilter.tsx`:

```typescript
import type { TagsFile } from "@gitmarks/core";

interface Props {
  used: Set<string>;
  tagsFile: TagsFile;
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const DEFAULT_COLOR = "#475569";

export function TagFilter({ used, tagsFile, selected, onSelect }: Props) {
  const names = [...used].sort();
  if (names.length === 0) {
    return <p className="text-cyan-soft/50 text-sm">no tags in use</p>;
  }
  return (
    <ul className="space-y-1">
      {names.map((name) => {
        const color = tagsFile.tags[name]?.color ?? DEFAULT_COLOR;
        const isSelected = selected === name;
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onSelect(isSelected ? null : name)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                isSelected ? "bg-fog" : "hover:bg-mist"
              }`}
              style={{ color }}
            >
              {name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Rewrite the ListPage with full wiring**

Overwrite `packages/web/src/routes/ListPage.tsx`:

```typescript
import { useMemo, useState } from "react";
import type { GitHubClient } from "@gitmarks/core";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { BookmarkList } from "../components/BookmarkList.js";
import { SearchBar } from "../components/SearchBar.js";
import { TagFilter } from "../components/TagFilter.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { allUsedTags, searchBookmarks, visibleBookmarks } from "../lib/data.js";

interface Props {
  client: GitHubClient;
}

export function ListPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh } = useGitmarksData(client);
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(
    () => (bookmarksFile != null ? visibleBookmarks(bookmarksFile) : []),
    [bookmarksFile],
  );
  const tagFiltered = useMemo(
    () => (selectedTag == null ? visible : visible.filter((b) => b.tags.includes(selectedTag))),
    [visible, selectedTag],
  );
  const searched = useMemo(
    () => searchBookmarks(tagFiltered, query),
    [tagFiltered, query],
  );
  const used = useMemo(() => allUsedTags(visible), [visible]);

  const status: LayoutStatus = loading
    ? { kind: "loading", message: "loading…" }
    : error != null
      ? { kind: "err", message: error }
      : { kind: "ok", message: `${visible.length} bookmarks` };

  const filteredFile = bookmarksFile != null
    ? { ...bookmarksFile, bookmarks: searched }
    : null;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} refreshing={refreshing}>
      <div data-testid="list-page" className="grid grid-cols-[12rem_1fr] gap-4 p-4">
        <aside className="border-r border-fog pr-4">
          <h2 className="text-magenta text-sm uppercase mb-2">Tags</h2>
          {tagsFile != null && (
            <TagFilter
              used={used}
              tagsFile={tagsFile}
              selected={selectedTag}
              onSelect={setSelectedTag}
            />
          )}
        </aside>
        <section>
          <SearchBar value={query} onChange={setQuery} />
          {filteredFile != null && tagsFile != null && (
            <div className="mt-4">
              <BookmarkList bookmarksFile={filteredFile} tagsFile={tagsFile} />
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 6: Update App.tsx to pass the client**

Overwrite `packages/web/src/App.tsx`:

```typescript
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useOutletContext,
} from "react-router-dom";
import { useMemo } from "react";
import { loadSettings, type Settings } from "./lib/settings.js";
import { makeClient } from "./lib/client.js";
import type { GitHubClient } from "@gitmarks/core";
import { SetupPage } from "./routes/SetupPage.js";
import { ListPage } from "./routes/ListPage.js";
import { TagsPage } from "./routes/TagsPage.js";

interface AppContext {
  settings: Settings;
  client: GitHubClient;
}

function RequireSettings() {
  const settings = loadSettings();
  if (settings == null) return <Navigate to="/setup" replace />;
  const client = makeClient(settings);
  const ctx: AppContext = { settings, client };
  return <Outlet context={ctx} />;
}

export function useAppContext(): AppContext {
  return useOutletContext<AppContext>();
}

function ListPageWithContext() {
  const { client } = useAppContext();
  return <ListPage client={client} />;
}

function TagsPageWithContext() {
  const { client } = useAppContext();
  return <TagsPage client={client} />;
}

export function App() {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/setup", element: <SetupPage /> },
        {
          element: <RequireSettings />,
          children: [
            { path: "/", element: <ListPageWithContext /> },
            { path: "/tags", element: <TagsPageWithContext /> },
          ],
        },
      ]),
    [],
  );
  return <RouterProvider router={router} />;
}
```

Note: `TagsPage` will need a `client` prop too — placeholder still works as-is until Task 12 rewrites it. Update the placeholder to accept the prop (silently). Overwrite `packages/web/src/routes/TagsPage.tsx`:

```typescript
import type { GitHubClient } from "@gitmarks/core";

interface Props {
  client: GitHubClient;
}

export function TagsPage(_props: Props) {
  return (
    <section data-testid="tags-page">
      <h1 className="text-cyan text-2xl">Tags</h1>
    </section>
  );
}
```

- [ ] **Step 7: Update App.routing.test.tsx to match the new shape**

The App now constructs a real `GitHubClient` per request, so the routing test must mock `globalThis.fetch` with shape-correct payloads for `bookmarks.json` AND `tags.json` (the TagsPage iterates `tagsFile.tags`, which crashes if the response is bookmarks-shaped). Replace the entire file:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";
import { saveSettings } from "../src/lib/settings.js";

const validSettings = {
  token: "ghp_fake",
  owner: "paperhurts",
  repo: "bookmarks",
  branch: "main",
};

function encodeContents(payload: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function makeFetchMock() {
  return vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
    if (href.includes("/contents/bookmarks.json")) {
      return new Response(
        JSON.stringify({
          content: encodeContents({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] }),
          sha: "b",
          encoding: "base64",
        }),
        { status: 200, headers: { etag: '"b"' } },
      );
    }
    if (href.includes("/contents/tags.json")) {
      return new Response(
        JSON.stringify({
          content: encodeContents({ version: 1, tags: {} }),
          sha: "t",
          encoding: "base64",
        }),
        { status: 200, headers: { etag: '"t"' } },
      );
    }
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  });
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    vi.stubGlobal("fetch", makeFetchMock());
  });

  it("redirects to /setup when no settings are stored", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: /set up gitmarks/i })).toBeInTheDocument();
  });

  it("renders the list page when settings are present", async () => {
    saveSettings(validSettings);
    render(<App />);
    expect(await screen.findByTestId("list-page")).toBeInTheDocument();
  });

  it("renders the tags page at /tags", async () => {
    saveSettings(validSettings);
    window.location.hash = "#/tags";
    render(<App />);
    expect(await screen.findByTestId("tags-page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run all tests to verify they pass**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — all previous + 3 new integration tests + updated routing tests.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/SearchBar.tsx packages/web/src/components/TagFilter.tsx packages/web/src/routes/ListPage.tsx packages/web/src/routes/TagsPage.tsx packages/web/src/App.tsx packages/web/test/ListPage.integration.test.tsx packages/web/test/App.routing.test.tsx
git commit -m "feat(web): list page with live search and tag filter sidebar"
```

---

## Task 11: Tag mutation helpers (pure)

**Files:**
- Create: `packages/web/src/lib/tag-mutations.ts`
- Create: `packages/web/test/lib.tag-mutations.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `packages/web/test/lib.tag-mutations.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { TagsFile } from "@gitmarks/core";
import { addTag, deleteTag, renameTag, setTagColor } from "../src/lib/tag-mutations.js";

const file: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: "open every morning" },
    "to-read": { color: "#FFFF00", description: null },
  },
};

describe("addTag", () => {
  it("adds a new tag", () => {
    const next = addTag(file, "reference", "#00FF88", "docs and refs");
    expect(next.tags["reference"]).toEqual({ color: "#00FF88", description: "docs and refs" });
  });

  it("does not mutate the input", () => {
    addTag(file, "reference", "#00FF88", null);
    expect(file.tags["reference"]).toBeUndefined();
  });

  it("throws when adding a tag that already exists", () => {
    expect(() => addTag(file, "daily", "#FF0000", null)).toThrow(/already exists/);
  });

  it("rejects invalid color format", () => {
    expect(() => addTag(file, "x", "red", null)).toThrow(/color/i);
  });

  it("rejects empty name", () => {
    expect(() => addTag(file, "", "#FFFFFF", null)).toThrow(/name/i);
  });
});

describe("setTagColor", () => {
  it("updates the color of an existing tag", () => {
    const next = setTagColor(file, "daily", "#123456");
    expect(next.tags["daily"]?.color).toBe("#123456");
    expect(next.tags["daily"]?.description).toBe("open every morning");
  });

  it("throws when the tag doesn't exist", () => {
    expect(() => setTagColor(file, "missing", "#FFFFFF")).toThrow(/not found/);
  });

  it("rejects invalid color format", () => {
    expect(() => setTagColor(file, "daily", "purple")).toThrow(/color/i);
  });
});

describe("renameTag", () => {
  it("renames a tag entry", () => {
    const next = renameTag(file, "to-read", "queue");
    expect(next.tags["queue"]).toEqual(file.tags["to-read"]);
    expect(next.tags["to-read"]).toBeUndefined();
  });

  it("does not mutate the input", () => {
    renameTag(file, "to-read", "queue");
    expect(file.tags["to-read"]).toBeDefined();
  });

  it("throws when source doesn't exist", () => {
    expect(() => renameTag(file, "missing", "x")).toThrow(/not found/);
  });

  it("throws when destination already exists", () => {
    expect(() => renameTag(file, "daily", "to-read")).toThrow(/already exists/);
  });

  it("no-ops when old and new names are identical", () => {
    expect(renameTag(file, "daily", "daily")).toEqual(file);
  });
});

describe("deleteTag", () => {
  it("removes a tag entry", () => {
    const next = deleteTag(file, "daily");
    expect(next.tags["daily"]).toBeUndefined();
    expect(next.tags["to-read"]).toBeDefined();
  });

  it("throws when the tag doesn't exist", () => {
    expect(() => deleteTag(file, "missing")).toThrow(/not found/);
  });

  it("does not mutate the input", () => {
    deleteTag(file, "daily");
    expect(file.tags["daily"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/lib.tag-mutations.test.ts
```

Expected: FAIL — `Cannot find module ../src/lib/tag-mutations.js`.

- [ ] **Step 3: Write the implementation**

Write `packages/web/src/lib/tag-mutations.ts`:

```typescript
import type { TagsFile } from "@gitmarks/core";

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function assertColor(color: string): void {
  if (!COLOR_RE.test(color)) {
    throw new Error(`invalid color (expected #RRGGBB, got "${color}")`);
  }
}

function assertName(name: string): void {
  if (name.length === 0) throw new Error("tag name must not be empty");
}

export function addTag(
  file: TagsFile,
  name: string,
  color: string,
  description: string | null,
): TagsFile {
  assertName(name);
  assertColor(color);
  if (file.tags[name] !== undefined) {
    throw new Error(`tag "${name}" already exists`);
  }
  return { ...file, tags: { ...file.tags, [name]: { color, description } } };
}

export function setTagColor(file: TagsFile, name: string, color: string): TagsFile {
  assertColor(color);
  const existing = file.tags[name];
  if (existing === undefined) throw new Error(`tag "${name}" not found`);
  return {
    ...file,
    tags: { ...file.tags, [name]: { ...existing, color } },
  };
}

export function renameTag(file: TagsFile, oldName: string, newName: string): TagsFile {
  if (oldName === newName) return file;
  assertName(newName);
  const existing = file.tags[oldName];
  if (existing === undefined) throw new Error(`tag "${oldName}" not found`);
  if (file.tags[newName] !== undefined) {
    throw new Error(`tag "${newName}" already exists`);
  }
  const next = { ...file.tags };
  delete next[oldName];
  next[newName] = existing;
  return { ...file, tags: next };
}

export function deleteTag(file: TagsFile, name: string): TagsFile {
  if (file.tags[name] === undefined) throw new Error(`tag "${name}" not found`);
  const next = { ...file.tags };
  delete next[name];
  return { ...file, tags: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — 16 new tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/tag-mutations.ts packages/web/test/lib.tag-mutations.test.ts
git commit -m "feat(web): pure tag mutation helpers"
```

---

## Task 12: Tag manager UI (writes to tags.json)

**Files:**
- Create: `packages/web/src/components/TagManager.tsx`
- Modify: `packages/web/src/routes/TagsPage.tsx`
- Create: `packages/web/test/components.TagManager.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `packages/web/test/components.TagManager.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagsFile } from "@gitmarks/core";
import { TagManager } from "../src/components/TagManager.js";

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: "open every morning" },
    "to-read": { color: "#FFFF00", description: null },
  },
};

describe("TagManager", () => {
  it("lists existing tags", () => {
    render(<TagManager tagsFile={tagsFile} onMutate={vi.fn()} />);
    expect(screen.getByDisplayValue("daily")).toBeInTheDocument();
    expect(screen.getByDisplayValue("to-read")).toBeInTheDocument();
  });

  it("calls onMutate with a renaming mutator when the name input is committed", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const input = screen.getByDisplayValue("daily");
    await user.clear(input);
    await user.type(input, "morning");
    await user.tab();
    expect(onMutate).toHaveBeenCalledOnce();
    const mutator = onMutate.mock.calls[0]![0];
    const next = mutator(tagsFile);
    expect(next.tags["morning"]).toBeDefined();
    expect(next.tags["daily"]).toBeUndefined();
  });

  it("calls onMutate with a color mutator when the color input changes", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const colorInput = screen.getByLabelText(/color for daily/i) as HTMLInputElement;
    await user.click(colorInput);
    // jsdom doesn't fire change for color inputs reliably; use fireEvent via library
    colorInput.value = "#123456";
    colorInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onMutate).toHaveBeenCalled();
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["daily"]?.color).toBe("#123456");
  });

  it("calls onMutate with a delete mutator when the delete button is clicked", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    await user.click(screen.getByRole("button", { name: /delete daily/i }));
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["daily"]).toBeUndefined();
  });

  it("adds a new tag through the new-tag row", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    await user.type(screen.getByLabelText(/new tag name/i), "reference");
    await user.click(screen.getByRole("button", { name: /add tag/i }));
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["reference"]).toEqual({ color: "#22d3ee", description: null });
  });

  it("surfaces a validation error inline without calling onMutate", async () => {
    const onMutate = vi.fn();
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const input = screen.getByDisplayValue("daily");
    await user.clear(input);
    await user.type(input, "to-read");
    await user.tab();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(onMutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @gitmarks/web test test/components.TagManager.test.tsx
```

Expected: FAIL — `Cannot find module ../src/components/TagManager.js`.

- [ ] **Step 3: Write the TagManager**

Write `packages/web/src/components/TagManager.tsx`:

```typescript
import { useState } from "react";
import type { TagsFile } from "@gitmarks/core";
import { addTag, deleteTag, renameTag, setTagColor } from "../lib/tag-mutations.js";

type Mutator = (file: TagsFile) => TagsFile;

interface Props {
  tagsFile: TagsFile;
  onMutate: (mutator: Mutator) => Promise<void>;
}

export function TagManager({ tagsFile, onMutate }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function safeMutate(mutator: Mutator): Promise<void> {
    setError(null);
    try {
      mutator(tagsFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    await onMutate(mutator);
  }

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-magenta text-2xl mb-4">Tags</h1>
      <p className="text-cyan-soft/60 text-xs mb-2">
        Renaming a tag updates tags.json only; existing bookmarks still reference the old name.
      </p>
      {error && <p className="text-magenta">{error}</p>}

      <ul className="space-y-2">
        {Object.entries(tagsFile.tags).map(([name, tag]) => (
          <TagRow
            key={name}
            name={name}
            color={tag.color}
            onRename={(next) => safeMutate((f) => renameTag(f, name, next))}
            onColor={(next) => safeMutate((f) => setTagColor(f, name, next))}
            onDelete={() => safeMutate((f) => deleteTag(f, name))}
          />
        ))}
      </ul>

      <div className="flex gap-2 pt-4 border-t border-fog">
        <label className="flex-1">
          <span className="sr-only">new tag name</span>
          <input
            aria-label="new tag name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
            placeholder="new tag name"
          />
        </label>
        <button
          type="button"
          className="px-4 py-2 rounded bg-cyan text-ink font-semibold hover:bg-cyan-soft disabled:opacity-40"
          disabled={newName.length === 0}
          onClick={async () => {
            await safeMutate((f) => addTag(f, newName, "#22d3ee", null));
            setNewName("");
          }}
        >
          Add tag
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  name: string;
  color: string;
  onRename: (next: string) => Promise<void>;
  onColor: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function TagRow({ name, color, onRename, onColor, onDelete }: RowProps) {
  const [draft, setDraft] = useState(name);
  return (
    <li className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`color for ${name}`}
        value={color}
        onChange={(e) => { void onColor(e.target.value); }}
        className="w-8 h-8 bg-transparent border border-fog rounded cursor-pointer"
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== name) void onRename(draft); }}
        className="flex-1 px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
      />
      <button
        type="button"
        aria-label={`delete ${name}`}
        onClick={() => { void onDelete(); }}
        className="px-3 py-2 rounded border border-fog text-magenta hover:border-magenta"
      >
        Delete
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Wire the TagManager into the TagsPage**

Overwrite `packages/web/src/routes/TagsPage.tsx`:

```typescript
import { useState } from "react";
import type { GitHubClient, TagsFile } from "@gitmarks/core";
import { TagManager } from "../components/TagManager.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";

interface Props {
  client: GitHubClient;
}

export function TagsPage({ client }: Props) {
  const { tagsFile, loading, error, refresh, writeTags } = useGitmarksData(client);
  const [refreshing, setRefreshing] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const status: LayoutStatus = loading
    ? { kind: "loading", message: "loading…" }
    : writeError != null
      ? { kind: "err", message: writeError }
      : error != null
        ? { kind: "err", message: error }
        : tagsFile != null
          ? { kind: "ok", message: `${Object.keys(tagsFile.tags).length} tags` }
          : { kind: "loading", message: "loading…" };

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function onMutate(mutator: (f: TagsFile) => TagsFile) {
    setWriteError(null);
    try {
      await writeTags(mutator, "web: update tags");
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} refreshing={refreshing}>
      <div data-testid="tags-page">
        {tagsFile != null && <TagManager tagsFile={tagsFile} onMutate={onMutate} />}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @gitmarks/web test
```

Expected: PASS — 6 new TagManager tests + previous = all green.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/TagManager.tsx packages/web/src/routes/TagsPage.tsx packages/web/test/components.TagManager.test.tsx
git commit -m "feat(web): tag manager UI writing to tags.json"
```

---

## Task 13: Docs, root README + CLAUDE.md updates, CI verification

**Files:**
- Create: `packages/web/README.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Verify: `.github/workflows/test.yml`

- [ ] **Step 1: Write the package README**

Write `packages/web/README.md`:

```markdown
# @gitmarks/web

Static SPA for browsing and tagging your gitmarks. Vite + React + Tailwind.
Reads `bookmarks.json` and `tags.json` directly from GitHub via the Contents
API; no server.

## Develop

```bash
pnpm --filter @gitmarks/web dev
```

The dev server runs at `http://localhost:5173/`. Hash routes:

- `#/setup` — PAT + owner + repo + branch entry, with a Validate step
- `#/` — list page (search + tag filter sidebar)
- `#/tags` — tag manager (rename, recolor, add, delete)

On first load with no settings stored, the router redirects to `#/setup`.

## Build

```bash
pnpm --filter @gitmarks/web build
```

The output lands in `packages/web/dist/`. `base: "./"` is set so the build
works under any path — drop the folder onto GitHub Pages or Cloudflare Pages.

## Manual smoke test

After running `pnpm --filter @gitmarks/web dev`:

- [ ] Open `http://localhost:5173/` — the app redirects to `#/setup`.
- [ ] Enter a valid fine-grained PAT (Contents: read/write on your bookmarks
      repo), owner, repo, branch. Click **Validate** → green confirmation.
- [ ] Click **Save** → the app redirects to the list view.
- [ ] If the repo has bookmarks, they render with tag chips and folder labels.
- [ ] Type in the search box — the list filters live.
- [ ] Click a tag in the sidebar — only bookmarks with that tag remain.
      Click the same tag again to clear the filter.
- [ ] Click **Sync from GitHub** — the status pill briefly says "Syncing…"
      then returns to the bookmark count. If you edit `bookmarks.json`
      directly on github.com first, the new entry appears after the sync.
- [ ] Open `#/tags`. Rename a tag, change its color, add a new tag, delete
      a tag. Each action commits to `tags.json` immediately. Refresh the
      page and confirm the changes persisted.

## Scope (v1)

Read-side only. Bookmark creation, editing, bulk operations, trash view, and
Netscape HTML export are tracked separately as [#25 Web UI v2](https://github.com/paperhurts/gitmarks/issues/25).

## Architecture

```
src/
  main.tsx                # React entry
  App.tsx                 # RouterProvider; settings gate via <RequireSettings/>
  index.css               # Tailwind directives
  lib/
    settings.ts           # localStorage wrapper with Zod validation
    client.ts             # GitHubClient factory + validateConnection
    data.ts               # pure helpers: visibleBookmarks, searchBookmarks, allUsedTags
    tag-mutations.ts      # pure helpers: addTag/renameTag/setTagColor/deleteTag
  hooks/
    useGitmarksData.ts    # loads both files with ETag; refresh + writeTags
  components/
    Layout.tsx, SetupForm.tsx, BookmarkList.tsx, BookmarkRow.tsx,
    TagChip.tsx, SearchBar.tsx, TagFilter.tsx, TagManager.tsx
  routes/
    SetupPage.tsx, ListPage.tsx, TagsPage.tsx
```

The page-level components own data + state; the dumb components (BookmarkRow,
TagChip, SearchBar, TagFilter, TagManager) take props and emit callbacks.
Writes go through `client.update()` from `@gitmarks/core`, which transparently
handles 409 retry-replay.

## Deploying to GitHub Pages

```bash
pnpm --filter @gitmarks/web build
# copy packages/web/dist/ into the gh-pages branch of any repo, or use the
# `gh-pages` npm package to push.
```

Because `base: "./"` is set, the build works at any path.
```

- [ ] **Step 2: Update the root README**

Read `README.md`. Append a row to the Packages table and update the roadmap.

In the `## Packages` table, append a new row directly after the existing `@gitmarks/extension-firefox` row. Use the Edit tool with a precise `old_string` that includes the closing `|` of the firefox row plus the trailing newline. New row:

```markdown
| `@gitmarks/web` | Static SPA — list, search, tag management. Vite + React + Tailwind. Talks directly to GitHub via `@gitmarks/core`. Deploys to GitHub Pages or Cloudflare Pages. |
```

In the `## Roadmap` section, change:

```
- ⬜ Web UI v1: list + search + tag management ([#24](https://github.com/paperhurts/gitmarks/issues/24))
```

to:

```
- ✅ Web UI v1: list + search + tag management ([#24](https://github.com/paperhurts/gitmarks/issues/24))
```

Also update the `## Architecture` ASCII diagram by removing the `(planned)` tag from `Web UI`:

```
[Chrome ext] [Firefox ext] [Safari ext (planned)]    [Web UI]
```

Use the Edit tool for each of these — exact strings, no replace_all.

- [ ] **Step 3: Update CLAUDE.md**

Read `CLAUDE.md`. Find the package list section and add the web package. Find the roadmap and check off Web UI v1. Use Edit tool to make each change as a precise string replacement. Example structure (adapt to actual current content):

- Add `@gitmarks/web` to the package map with: "Static SPA — list, search, tag management. Vite + React + Tailwind."
- Change `⬜ Web UI v1` → `✅ Web UI v1`.

- [ ] **Step 4: Verify CI picks up the new package**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four succeed. The CI workflow (`.github/workflows/test.yml`) runs these same commands at the root, so no workflow change is required. The web package's `vite build` runs `tsc --noEmit && vite build` per its `build` script.

If any fails, fix on the branch before continuing.

- [ ] **Step 5: Commit docs + verify final state**

```bash
git add packages/web/README.md README.md CLAUDE.md
git commit -m "docs(web): add package README and update root docs"
```

Then verify the full local pipeline one more time:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: green.

---

## Final Verification

- [ ] **Run the full test suite from repo root**

```bash
pnpm test
```

Expected: all packages green. Web should contribute ~40 new unit + component tests.

- [ ] **Run a fresh dev server and walk the manual smoke test in `packages/web/README.md`**

```bash
pnpm --filter @gitmarks/web dev
```

Open `http://localhost:5173/` in a browser. Walk the smoke-test checklist using the real `paperhurts/gitmarks-bookmarks` repo (or whichever repo the user uses) with a fine-grained PAT.

If anything is broken in the live UI but tests pass, that's a wiring gap — file as a follow-up issue and document, since unit tests miss real-world data shapes.

- [ ] **Open the PR**

When all tasks are complete, follow `superpowers:finishing-a-development-branch`. The recommended choice is Option 2 (push + PR).

```bash
git push -u origin feat/web-ui-v1
gh pr create --title "feat(web): web UI v1 — list, search, tag management" --body "$(cat <<'EOF'
## Summary
- New `@gitmarks/web` package: Vite + React + Tailwind SPA
- List + client-side search + tag filter sidebar
- Setup flow with PAT validation, settings persisted in localStorage
- Tag manager (rename, recolor, add, delete) writing to `tags.json` only

Closes #24.

## Test plan
- [x] Unit + component suite green via Vitest + @testing-library/react
- [ ] Manual smoke test (see `packages/web/README.md`)
- [ ] Build succeeds with `pnpm --filter @gitmarks/web build` and serves from `dist/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

CI will run on push. Wait for green, then merge with a merge commit (per `CONTRIBUTING.md`).

---

## Spec Cross-Reference

| Spec requirement | Task |
|---|---|
| Static SPA, Cloudflare/GH Pages | Task 1 (base: "./" + hash routing) |
| React + Vite + Tailwind, cyan/magenta on dark | Task 1 |
| Same PAT model as extension, paste once, localStorage | Task 2 |
| Talks to GitHub Contents API directly | Task 3 + Task 7 (via `@gitmarks/core`) |
| Same conflict logic as extension | Task 12 (`client.update()` retries) |
| List + search (client-side, in memory) | Task 8 (helpers), Task 9 (UI), Task 10 (search bar) |
| Tag management | Task 11 (helpers), Task 12 (UI) |
| Manual "sync from GitHub" | Task 6 (button), Task 7 (refresh), Task 10 (wiring) |
| Bulk operations | Out of scope (#25) |
| Trash view | Out of scope (#25) |
| Export to Netscape HTML | Out of scope (#25) |
| No bookmark creation in web UI v1 | Honored — no creation surface anywhere |
| Tombstones hidden | Task 8 (`visibleBookmarks` filter) |
| Renaming a tag doesn't churn bookmarks | Task 11 (`renameTag` operates on `TagsFile` only) |

## Notes for the implementer

- Every task ends with a passing test run and a commit. Do not skip the commit step — the per-task history is reviewed (per `CONTRIBUTING.md`).
- The strict TypeScript settings in `tsconfig.base.json` are non-negotiable: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Patterns to remember:
  - Index access on `Record<K, V>` returns `V | undefined` — always check for `undefined` before using.
  - Optional props need conditional spread, not `prop: maybeUndefined`. Example in Task 3: `...(fetchImpl !== undefined ? { fetch: fetchImpl } : {})`.
  - All relative imports use the `.js` suffix (e.g. `import { X } from "./lib/foo.js"`) even though the source is `.ts`.
- Component tests use `@testing-library/react` + `userEvent` from `@testing-library/user-event`. Use `findBy*` for anything that depends on async state from `useGitmarksData`.
- When a task asks you to overwrite a file you wrote in an earlier task, use the Write tool — the test will catch any regression.
- If you hit an `exactOptionalPropertyTypes` error around the GitHubClient's `fetch` option, use the conditional-spread pattern from Task 3.
