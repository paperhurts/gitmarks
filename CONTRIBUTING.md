# Contributing to gitmarks

## Workflow

Every change goes through a feature branch + PR. **No direct commits to `main`.**

1. **File or pick an issue.** Don't start work without one — the issue is where scope and acceptance criteria get discussed. Use the labels (`bug`, `extension-chrome`, `core`, `test`, `perf`, `security`, `docs`, `ux`, `enhancement`) so they're filterable.

2. **Branch.** Naming: `<type>/<short-description>`. Types follow the same vocabulary as conventional commits:
   - `feat/` — new functionality
   - `fix/` — bug fix
   - `refactor/` — non-functional internal changes
   - `docs/` — documentation only
   - `test/` — tests only
   - `chore/` — build, deps, tooling

3. **Commit.** Conventional commits: `feat(extension-chrome): add foo`, `fix(core): handle bar`. Scopes match the package name (`core`, `extension-chrome`). One logical change per commit; the per-task history is part of how this repo is reviewed.

4. **Open a PR.** Reference the issue with `Closes #N` (or `Fixes #N` for bugs) in the body. The CI workflow runs automatically — typecheck + unit tests + build.

5. **CI must be green before merge.** No exceptions. If the workflow fails, fix it on the branch and push again.

6. **Merge with a merge commit** (not squash). The per-task commits preserve the plan-driven history. Squashing throws it away.

## Plan-driven changes

For features larger than ~3 commits, follow the plan-driven workflow:

1. Read `spec.md` for the relevant section.
2. Write a plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. Decompose into ~10 task-sized commits with explicit acceptance criteria and TDD-style steps.
3. Execute task-by-task on a feature branch. Each task should leave the build green.
4. Final review on the cumulative branch before merging to main.

See existing plans in `docs/superpowers/plans/` for the template — `2026-05-23-gitmarks-core.md` is the most complete example.

## Local development

```bash
pnpm install
pnpm test           # unit tests across packages
pnpm typecheck
pnpm build

# Single package
pnpm --filter @gitmarks/core test
pnpm --filter @gitmarks/extension-chrome test
pnpm --filter @gitmarks/extension-chrome e2e    # Playwright + real Chromium (local only — not on CI yet)
```

## Code expectations

- **TypeScript ESM throughout.** Imports use the `.js` suffix even for `.ts` sources (so emitted output is valid).
- **Strict mode is non-negotiable.** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` are all on.
- **Pure-functional core.** `@gitmarks/core` has zero `chrome.*` access; the extension's `src/lib/` modules split cleanly into "touches chrome.*" and "pure logic, unit-testable".
- **Tests are the design contract.** When a fix or feature changes behavior, the regression test is part of the same PR.
- **No comments restating what the code does.** Only WHY comments where the rationale is genuinely non-obvious. See existing module comments for the style.

## Security

- Never commit secrets. The codebase deliberately has no real tokens — `ghp_fake_token` / `ghp_test_1234` in test fixtures only.
- The PAT model lives in `chrome.storage.local` / `localStorage`; if you add a new way to handle credentials, audit it in the PR description.
- `host_permissions` in the manifest should never widen without an issue documenting why.

## Filing issues

A good issue has:
- **Where:** file + symbol + line range
- **What:** what the current code does, what the desired behavior is
- **Why:** the failure mode or motivation — what breaks today
- **Tracked from:** the review / PR / discussion that surfaced it (if any)

The existing issues (#1 through #10) are written to that template — use them as references.
