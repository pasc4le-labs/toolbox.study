---
name: implement
description: Reads PLAN.md from the project root and executes it task by task. Commits after each task using Conventional Commits 2.0 with a body description. Runs full test suite at the end to verify everything works.
version: 1.0.0
category: execution
---

# Implement

<goal>
Read the `PLAN.md` at the project root, execute every task in order, commit after each task with a Conventional Commits 2.0 message that includes a body description, then run the full test suite to verify the implementation is correct.
</goal>

---

## 1 — Read the Plan

Read `PLAN.md` from the project root. Parse it into a structured list of phases and tasks. Each task has:

- **What**: description of the work
- **Files**: files to create or modify
- **Implementation notes**: step-by-step instructions
- **Unit tests**: test cases to write
- **E2E tests**: E2E scenarios (if applicable)
- **Commit**: the conventional commit message

If `PLAN.md` does not exist at the project root, stop and tell the user to create one first (e.g., using the `plan` skill).

Verify you are on the correct branch as specified in the plan's `**Branch**` field. If not, check it out:

```bash
git checkout <branch-from-plan>
```

---

## 2 — Execute Tasks in Order

Process every phase and task **strictly in order**. Do not skip tasks. Do not reorder. For each task:

### 2a. Implement

Follow the task's **Implementation notes** precisely. Create or modify the exact files listed under **Files**. Use verified import paths, function names, and config keys from the plan — do not guess.

If the implementation notes are insufficient or ambiguous, halt and ask the user rather than improvising.

### 2b. Write unit tests

Every task that specifies `**Unit tests**` must have those tests written before committing. Place tests following the project's existing conventions (check `AGENTS.md` and existing test files for patterns). Run the unit tests for the changed area:

```bash
pnpm test -- <path-pattern>
```

If tests fail, fix the implementation or the tests before proceeding.

### 2c. Lint and typecheck

After writing unit tests, run lint and typecheck before committing:

```bash
pnpm lint
pnpm typecheck
```

`pnpm typecheck` runs `tsc --noEmit` to catch type errors. Both must pass with zero errors before committing. Fix any issues before proceeding.

### 2d. Write E2E tests

If the task specifies `**E2E tests**`, write Playwright test scenarios in the `e2e/` directory following existing E2E conventions. Each scenario must specify steps and assertions as described in the plan.

### 2e. Commit

After implementing and testing a task, commit **immediately** using Conventional Commits 2.0. The commit message **must** have both a subject line and a body.

Format:

```
<type>(<scope>): <short description>

<body: a concise but complete description of what was done and why>
```

Rules:
- **Subject line**: `type(scope): description`, lowercase, no period, under 72 characters.
- **Body**: mandatory. Explain what changed and why. Wrap at 72 characters. Separate from subject with a blank line.
- **Valid types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `ai`.
- **Scope**: use the scope from the task's `**Commit**` line, or derive from the module/feature area.
- **Do not push** after each commit. Only commit locally.

Example:

```
feat(card): add FSRS scheduling to review queue

Implement FSRS algorithm for scheduling card reviews. Each card now
tracks stability and difficulty, and the next review date is computed
from these parameters. Add unit tests for grade-to-params mapping
and interval calculation.
```

To create a commit with a body, use:

```bash
git add -A
git commit -m "feat(card): add FSRS scheduling to review queue" -m "Implement FSRS algorithm for scheduling card reviews. Each card now
tracks stability and difficulty, and the next review date is computed
from these parameters. Add unit tests for grade-to-params mapping
and interval calculation."
```

### 2f. Testing gates

After completing all tasks in a phase, run the full suite:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All checks must pass before moving to the next phase. If anything fails, fix it before proceeding.

---

## 3 — E2E Phase

If the plan includes a dedicated E2E testing phase, execute it after all implementation phases are complete. Run:

```bash
pnpm test:e2e
```

If the project supports headed E2E for debugging:

```bash
pnpm test:e2e:headed
```

All E2E tests must pass.

---

## 4 — Final Verification

After all phases are complete:

### 4a. Check completeness

Review every task in `PLAN.md` and verify each one has been implemented:

- Every file listed under `**Files**` exists and has the expected changes.
- Every `**Unit tests**` case has a corresponding test.
- Every `**E2E tests**` scenario has a corresponding E2E test.
- No task was skipped or left incomplete.

### 4b. Run the full test suite

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

If anything fails, fix it and commit the fix with a descriptive conventional commit message (including body).

### 4c. Build the project

```bash
pnpm build
```

The project must build without errors. If the build fails, fix the errors and commit the fix with a descriptive conventional commit message (including body). Re-run lint, typecheck, unit tests, and E2E tests after the fix to ensure nothing regressed. Repeat until the build succeeds cleanly.

### 4d. Review the commit log

```bash
git log --oneline <base-branch>..HEAD
```

Verify that:
- Every task from the plan has a corresponding commit.
- No commit is missing a body description.
- All commit messages follow Conventional Commits 2.0 format.

### 4e. Summarize

Report to the user:
- Number of tasks completed.
- Number of commits made.
- Any deviations from the plan (tasks skipped, extra tasks added, etc.).
- Final test results (pass/fail counts).
- The branch name ready for review.

---

## 5 — Quality Rules

1. **Follow the plan.** Do not skip, reorder, or merge tasks. If a task cannot be completed as written, stop and ask the user.
2. **Commit after every task.** No exceptions. Each commit must have a subject line and a body.
3. **Conventional Commits 2.0 only.** Every commit message must follow `type(scope): description` with a body. No free-form messages. No commit without a body.
4. **Run tests when specified.** If a task says write unit tests, write them and run them before committing.
5. **Do not push.** Commits stay local. The user decides when to push.
6. **No guessing.** If the plan's instructions are unclear, halt and ask. Do not improvise API calls, import paths, or configurations.
7. **Fix failures immediately.** If lint, typecheck, or tests fail at a testing gate, fix the issue and commit the fix before moving on.