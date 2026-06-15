# OpenCode Issue Automation

When a user opens a GitHub issue, this workflow automatically plans, implements, and opens a pull request using three chained OpenCode agents.

## How it works

```
Issue opened ──► Planner (PLAN.md) ──► Implementer (code) ──► Finalizer (commit + PR)
```

1. **Planner** — Reads the issue, loads the `plan` skill, researches the codebase, writes `PLAN.md`, creates a `bob/<short-desc>` branch, commits, and pushes.
2. **Implementer** — Reads `PLAN.md`, loads the `implement` skill, executes every task, commits after each one (no push).
3. **Finalizer** — Commits any remaining files, pushes the branch, opens a PR against `dev` (or `main`/`master`).

After the planner pushes, the branch is linked to the issue via `gh issue develop` so the issue shows the linked development branch.

## Prerequisites

- The OpenCode GitHub App must be installed on the repository: [github.com/apps/opencode-agent](https://github.com/apps/opencode-agent)
- The `plan` and `implement` skills must exist at `.agents/skills/plan/SKILL.md` and `.agents/skills/implement/SKILL.md` respectively
- A Go or Zen API key (or both) for model access

## GitHub configuration

### Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|--------|-------------|
| `OPENCODE_ZEN_API_KEY` | OpenCode Zen API key (pay-per-use models) |
| `OPENCODE_GO_API_KEY` | OpenCode Go API key ($5–10/month subscription models) |
| `GIT_USER_NAME` | Git author name for commits made by the workflow |
| `GIT_USER_EMAIL` | Git author email for commits made by the workflow |

You need at least one of `OPENCODE_ZEN_API_KEY` or `OPENCODE_GO_API_KEY`. Set both if you want models from both providers available.

### Variables

Go to **Settings → Secrets and variables → Actions** and add (under the **Variables** tab):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALLOWED_USERS` | Yes | — | Comma-separated GitHub usernames allowed to trigger the workflow (e.g. `alice,bob,charlie`) |
| `PLANNER_MODEL` | No | `opencode/claude-sonnet-4-5` | Model for the planning agent |
| `WORKER_MODEL` | No | `opencode/claude-sonnet-4-5` | Model for the implementation agent |
| `COMMIT_MODEL` | No | `opencode/claude-sonnet-4-5` | Model for the commit/PR agent |

### Model format

Models use the `provider/model-id` format:

- **Zen models**: `opencode/gpt-5.5`, `opencode/claude-sonnet-4-5`, `opencode/gemini-3.5-flash`, etc.
- **Go models**: `opencode-go/deepseek-v4-pro`, `opencode-go/kimi-k2.7`, `opencode-go/qwen3.7-plus`, etc.

Full model lists: [Zen models](https://opencode.ai/zen/v1/models), [Go models](https://opencode.ai/zen/go/v1/models)

## Access control

The workflow only runs when the issue author is listed in the `ALLOWED_USERS` variable. This is checked with:

```yaml
if: contains(vars.ALLOWED_USERS, github.event.issue.user.login)
```

Any user not in the list will have their issue ignored by the workflow. Add usernames without spaces (e.g. `alice,bob,charlie`).

## Branch naming

The planner creates a branch named `bob/<short-kebab-desc>`, where `<short-kebab-desc>` is derived from the issue title. For example, issue "Add dark mode support" would produce `bob/dark-mode`.

The base branch is selected in this order of preference:

1. `dev` — if it exists on the remote
2. `main` — if `dev` doesn't exist
3. `master` — fallback

## Skills

### plan (`.agents/skills/plan/SKILL.md`)

Researches the issue, explores the codebase, verifies APIs through MCPs, and writes a `PLAN.md` organized into phases and tasks. Each task includes files to modify, implementation notes, test cases, and a conventional commit message.

### implement (`.agents/skills/implement/SKILL.md`)

Reads `PLAN.md` and executes every task in order. Commits after each task with a Conventional Commits 2.0 message (subject + body). Runs lint, typecheck, and tests at phase boundaries.

## Triggering

The workflow fires automatically on:

```yaml
on:
  issues:
    types: [opened]
```

No manual command or `/opencode` mention is needed. Opening an issue is enough as long as the author is in `ALLOWED_USERS`.

## Choosing cost-effective models

Planning is research-heavy (lots of reading, searching, reasoning) while implementation is action-heavy (editing files, running commands). A common pattern:

- **Planner**: A strong reasoning model like `opencode/claude-sonnet-4-5` or `opencode/gpt-5.4`
- **Worker**: A coding-focused model like `opencode/gpt-5.3-codex` or `opencode-go/deepseek-v4-pro`
- **Commit/PR**: A cheap, fast model like `opencode/claude-haiku-4-5` or `opencode-go/deepseek-v4-flash`

## Example configuration

For a solo developer using Zen:

| Variable | Value |
|----------|-------|
| `ALLOWED_USERS` | `myusername` |
| `PLANNER_MODEL` | `opencode/claude-sonnet-4-5` |
| `WORKER_MODEL` | `opencode/gpt-5.3-codex` |
| `COMMIT_MODEL` | `opencode/claude-haiku-4-5` |

For a team using Go (budget-friendly):

| Variable | Value |
|----------|-------|
| `ALLOWED_USERS` | `alice,bob,charlie` |
| `PLANNER_MODEL` | `opencode-go/qwen3.7-max` |
| `WORKER_MODEL` | `opencode-go/deepseek-v4-pro` |
| `COMMIT_MODEL` | `opencode-go/deepseek-v4-flash` |

## Troubleshooting

**Workflow doesn't trigger on new issues**
- Check that the issue author is listed in `ALLOWED_USERS`
- Verify the OpenCode GitHub App is installed on the repo

**Workflow starts but fails on the planner step**
- Check that `OPENCODE_ZEN_API_KEY` or `OPENCODE_GO_API_KEY` is set correctly
- Ensure the model ID in `PLANNER_MODEL` is valid (check [Zen models](https://opencode.ai/zen/v1/models) or [Go models](https://opencode.ai/zen/go/v1/models))

**Branch not created or not pushed**
- Make sure `contents: write` permission is present in the workflow
- Verify `GITHUB_TOKEN` has repo access

**PR not created by the finalizer**
- Check that `pull-requests: write` permission is set
- Ensure the feature branch was pushed before the finalizer runs

**Commit author shows as a generic name**
- Set `GIT_USER_NAME` and `GIT_USER_EMAIL` secrets to the desired identity