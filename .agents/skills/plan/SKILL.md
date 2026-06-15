---
name: plan
description: Takes an issue and splits its execution into phases (task collections) so that they can be executed by a junior developer. Researches the subject using brave-search, context7, gh-grep, and deepwiki MCPs. Creates a bob/<short-desc> feature branch from dev (or main/master), writes PLAN.md, commits with 'ai(plan): <brief>', and pushes to origin.
version: 1.0.0
category: planning
---

# Plan

<goal>
Take a user issue (feature request, bug, refactor, etc.), research the subject thoroughly using available MCPs, then produce an exhaustive `PLAN.md` split into phases and tasks that a junior developer can execute end-to-end without guessing APIs, skipping tests, or making architectural mistakes. The plan is committed on a `bob/<short-desc>` branch pushed to origin.
</goal>

<philosophy>
Research first, plan second, never assume. Every library reference, import path, API signature, and config snippet in the plan must trace back to verified documentation or real code examples found during research. A junior developer with only this plan and the codebase should be able to complete every task without live internet access for unknown APIs.
</philosophy>

---

## 1 — Understand the Issue

Read the issue description carefully. Extract:

- **Goal**: What needs to be built/fixed/refactored?
- **Scope**: Which parts of the codebase are affected?
- **Constraints**: Any technical or product constraints mentioned?
- **Acceptance criteria**: How do we know it's done?

If the issue is ambiguous, ask the user for clarification before proceeding.

---

## 2 — Branch Setup

Set up the feature branch before starting research.

### 2a. Determine base branch

```bash
git checkout dev 2>/dev/null || git checkout main 2>/dev/null || git checkout master 2>/dev/null
```

Prefer `dev` if it exists, otherwise `main`, otherwise `master`.

### 2b. Pull latest

```bash
git pull origin <base-branch>
```

### 2c. Create feature branch

Choose a short, kebab-case description derived from the issue. Example: for "Add dark mode support" → `bob/dark-mode`.

```bash
git checkout -b bob/<short-kebab-desc>
```

All subsequent work happens on this branch.

---

## 3 — Research Phase

Before writing a single line of the plan, gather verified knowledge using all available research tools. Run these in parallel where possible.

### 3a. Codebase exploration

Search the existing codebase first. Understand the current architecture, patterns, conventions, and dependencies.

- Read `AGENTS.md`, `README.md`, `package.json`, and any existing docs.
- Search for existing implementations of similar features.
- Identify the directory structure, naming conventions, and import patterns.
- Note existing test patterns and frameworks.

### 3b. brave-search

Find: official docs URLs, getting-started guides, migration notes, best-practice posts, changelog entries, verify library existence/maintenance status.

Record: library name, version, key APIs, and the exact doc URLs referenced in the plan.

### 3c. context7

Find: precise API signatures, type definitions, configuration schemas, version-specific behavior (breaking changes, deprecated APIs), authored code examples.

Record: library ID, query, and the exact API signatures referenced in the plan.

### 3d. gh-grep

Find: authentic usage patterns, integration examples (auth, testing, deployment configs), boilerplate and scaffolding from real open-source projects.

Record: repo, path, and a summary of each pattern worth including.

### 3e. deepwiki

Find: repository-level architecture overviews, design decisions, topic-based deep-dives, answers to specific technical questions about a library or framework's internals.

Record: key architectural insights, design patterns, and any constraints or gotchas discovered.

### 3f. Research Output

After all research is done, produce a concise but complete **research summary**. This is *not* the plan — it is the verified knowledge base the plan draws from. Include:

| Area | What to capture |
|------|----------------|
| Libraries & versions | Exact package names, minimum versions, why chosen |
| API surface | Function signatures, type defs, config keys — copy-paste ready |
| Code patterns | Snippets from gh-grep and codebase, annotated |
| Architecture | Insights from DeepWiki and codebase exploration |
| Gotchas | Breaking changes, common mistakes, version-specific notes |
| Doc URLs | Direct links for each verified fact |

---

## 4 — Plan Structure

Write `PLAN.md` to the project root. The plan **must** follow this structure. Replace bracketed placeholders with real, researched content.

```markdown
# <Issue Title>

> One-line summary of the goal.

**Branch**: `bob/<short-kebab-desc>` (from `<base-branch>`)

## Conventions

- **Conventional Commits only** — every commit message follows [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `ai`. No exceptions.
- **One task = one commit.** Tasks are small enough that a single commit captures the full change.

## Research Summary

<condensed version of §3f — library choices, key APIs, architecture notes, gotchas>

---

## Phase 1 — <Descriptive Phase Name>

### Task 1.1: <Task title>
**What**: <detailed description — enough for a junior dev>
**Files**: <exact files to create or modify>
**API reference**: <link or pasted verified signature>
**Implementation notes**:
- <step-by-step instructions>
- <exact import paths, function names, config keys from research>
- <edge cases or gotchas>
**Unit tests**: <specific unit test cases to cover>
- Test case A: ...
- Test case B: ...
**E2E tests**: <specific E2E test scenarios, or "none" if not applicable>
- Scenario A: ...
- Scenario B: ...
**Commit**: `<type>: <short description>`

### Task 1.2: ...

---

## Phase 2 — <Descriptive Phase Name>

### Task 2.1: ...
...

---

## Phase N — <Descriptive Phase Name>

...

---

## Unit Testing

Every task that adds or changes behavior **must** include unit tests. Use the project's existing test framework (e.g., Vitest, Jest). Unit tests cover logic, edge cases, and integration points at the function/module level.

---

## E2E Testing

The plan **must** include a dedicated E2E testing phase (the last or second-to-last phase). For web apps, use Playwright. E2E tests cover critical user flows end-to-end — the user should be able to walk through the entire feature from the UI without hitting a bug.

Each E2E test scenario must specify:
- **What**: the user flow being tested
- **Steps**: exact actions the test performs
- **Assertions**: what the test verifies at each step

This phase is mandatory. Even if the feature is small, write at least one smoke-test E2E scenario.

---

## Testing Gate

After each phase, run the full test suite:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All tests must pass before moving to the next phase. After the E2E phase, also run:

```bash
pnpm test:e2e
```

---

## 5 — Plan Quality Rules

These rules prevent an agent (or junior dev) from hallucinating or drifting.

1. **No bare names.** Every library, function, class, or config key must have been verified during research. If you didn't find it, don't put it in the plan — research it first.
2. **Paste, don't paraphrase.** When an API signature matters, paste the exact signature from Context7 or official docs. Do not reconstruct from memory.
3. **Imports are contracts.** Every `import` statement must list the exact package name and export. Example: `import { serve } from "@hono/node-server"` — verified, not guessed.
4. **Config is explicit.** Every config key and value must come from docs or real examples. No "configure as needed" hand-waving.
5. **Tests are mandatory.** Every task that adds or changes behavior **must** include a `**Unit tests**` subsection with specific test cases and an `**E2E tests**` subsection (write "none" only if truly inapplicable). The plan **must** include a dedicated E2E testing phase (Playwright for web apps) covering critical user flows.
6. **Commit after every task.** Each task ends with a `**Commit**` line. The implementing agent commits (NOT PUSHES) after completing every task.
7. **Conventional commits only.** Every commit message across the entire plan MUST follow Conventional Commits. Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `ai`.
8. **One task = one commit.** Tasks should be small enough that a single commit captures the full change. If a task feels too large, split it.
9. **Offline-readiness.** A junior developer with access only to this plan and the codebase should be able to complete every task without requiring live internet access for unknown APIs.

---

## 6 — Commit and Push

Once `PLAN.md` is written and passes the quality checklist (§7):

```bash
git add PLAN.md
git commit -m "ai(plan): <brief-kebab-desc>"
git push -u origin bob/<short-kebab-desc>
```

The commit type is `ai` with scope `plan`. Examples:

- `ai(plan): dark-mode`
- `ai(plan): card-import-export`
- `ai(plan): fsrs-scheduling-fix`

---

## 7 — Execution Checklist

After the plan is written and before committing, verify:

- [ ] Base branch is `dev` (or `main`/`master` fallback), pulled to latest.
- [ ] Feature branch follows `bob/<short-kebab-desc>` naming.
- [ ] Research phase completed with real tool output (not assumed knowledge).
- [ ] Every library reference traces to a Brave/Context7/gh-grep/DeepWiki source.
- [ ] Every task has a `**Unit tests**` subsection and an `**E2E tests**` subsection (except pure scaffolding where unit tests may be omitted but must be explicitly justified).
- [ ] The plan includes a dedicated E2E testing phase with concrete scenarios.
- [ ] Every task ends with a `**Commit**` line.
- [ ] Testing gates exist between phases.
- [ ] `PLAN.md` is at the project root.
- [ ] Committed with `ai(plan): <brief>` message.
- [ ] Pushed to origin with `git push -u origin bob/<short-kebab-desc>`.

---

## 8 — Using This Plan (for the implementing agent)

When an agent picks up this `PLAN.md` to implement:

1. Read the **Research Summary** section first — it contains the verified context.
2. Start from Phase 1, Task 1.1 and proceed in order.
3. After completing each task, commit immediately. Do not push.
4. If a task's API reference is insufficient, halt and research rather than guessing.
5. Run tests after each task that specifies them. Do not skip.
6. At each testing gate, run the full test suite before moving to the next phase.
7. When all phases are done, push the feature branch for code review.