# Workspace Script Pipeline

Use this reference when auditing ControlWorkspace scripts, choosing validation commands, syncing repeated control-plan surfaces, or deciding whether a workflow should become a script.

## Boundaries

- Workspace scripts are governance tools. They may read workspace docs, inspect child repository git status, validate links, sync repeated workspace-control text, import Design handoff ledgers, and maintain archive docs.
- Workspace scripts must not implement product features, write into child source repositories, edit real test projects, require secrets, depend on network access by default, or hide a total-control decision behind automation.
- Write-capable scripts must default to dry-run or explicit check mode, require an explicit write/apply flag, and keep writes inside workspace-owned docs unless the current control plan explicitly authorizes more.
- Script-readable Markdown anchors are summarized in `scripts/README.md`; when creating a new current plan, start from `templates/workspace-control-plan-template.md`.
- Keep user-facing docs scarce: the goal / stage confirmation document and the current control plan with window task packages are the main reading surface. Generated indexes, inboxes, status mirrors, archive summaries, and script format notes should stay script-owned and concise.

## Default Command Set

- Aggregated command surface:
  `node scripts/workspace-control.mjs status`
  `node scripts/workspace-control.mjs verify --dispatch`
  `node scripts/workspace-control.mjs sync --write --verify --dispatch`
  `node scripts/workspace-control.mjs scripts --tests`
  `node scripts/workspace-control.mjs vad status --json`
  `node scripts/workspace-control.mjs vad controller --json`
  `node scripts/workspace-control.mjs vad preflight --json`
  `node scripts/workspace-control.mjs vad audit --automation-id <automationId> --json`
- General pre-acceptance:
  `node scripts/verify-control-center.mjs`
- Dispatch plans with TODO and task packages:
  `node scripts/verify-control-center.mjs --require-todo --require-task-packages`
- Current-plan repeated surface sync:
  `node scripts/sync-current-plan.mjs --check`
  `node scripts/sync-current-plan.mjs --write`
- Design formal handoff intake:
  `node scripts/import-design-handoffs.mjs --write`
  `node scripts/import-design-handoffs.mjs --id <DESIGN-KEY> --json`
- Runtime residue inspection:
  `node scripts/check-runtime-residue.mjs`
  `node scripts/verify-control-center.mjs --with-runtime`
- Script maintenance:
  `node scripts/check-script-docs.mjs`
  `node scripts/verify-control-center.mjs --with-script-tests`
- Full fixture pipeline:
  `node scripts/run-workspace-pipeline-e2e.mjs`

## Script Selection

| Need | Primary script | Notes |
| --- | --- | --- |
| Choose a common control-center workflow without memorizing script flags | `workspace-control.mjs` | Aggregates existing scripts only; it does not replace total-control decisions or bypass write/apply gates. Use `--print` before unfamiliar flows. |
| Know child repo branches, dirty state, and commits | `collect-repo-status.mjs` | Read-only; useful before acceptance or cross-repo planning. |
| Ensure workspace git tracks only workspace files | `check-workspace-boundary.mjs` | Read-only guard against accidentally tracking child repos or local noise. |
| Validate workspace docs and links | `verify-workspace-docs.mjs` | Use `--all-workspace` through `verify-control-center`. |
| Validate current docs stay under `docs/workspace/current/` | `check-workspace-current-layout.mjs` | Read-only layout guard. |
| Validate send list and prompt hard rules | `check-dispatch-coverage.mjs` | Mechanical guard only; total control still decides producer / consumer order. |
| Validate decision preflight before doc/state changes | `check-decision-preflight.mjs` | Fails when the current plan lacks trigger, demand / test-result interpretation, checked evidence, verify / replan / confirm decision, allowed updates, and forbidden conclusions. |
| Validate test-start boundary judgment | `check-test-boundary.mjs` | Fails when `TestWindow` is send-eligible for verification without self-test exclusion, real-scenario dependency, test question, boundary, inference limit, and stop-condition fields. Explicit non-test thread-registry or Visible Automation Dispatch smoke rows are allowed only when the current plan says no test handoff / no real-project validation and local-only runtime evidence. |
| Validate TODO scheduling sections | `check-todo-board.mjs --require` | Use when TODO / Backlog affects dispatch or wave order. |
| Validate task-package completeness | `check-task-packages.mjs --require` | Use when bundling mainline work with TODOs. |
| Sync current plan into repeated status/index surfaces | `sync-current-plan.mjs --check` / `--write` | Does not decide readiness, TODOs, Design status, or window acceptance. |
| Import formal Design handoff board into workspace inbox | `import-design-handoffs.mjs --write` | Creates intake evidence, not a global TODO or execution plan. |
| Archive completed control docs and shrink historical indexes | `archive-workspace-docs.mjs`, `compact-workspace-index.mjs`, `archive-global-todo-board.mjs`, `generate-archive-topic-summaries.mjs` | Dry-run first; apply only after current status no longer points at the archived item. |
| Prove the governance scripts work as a chain | `run-workspace-pipeline-e2e.mjs` | Uses a temporary fixture workspace and runs write/apply modes without touching product repositories. |
| Keep script catalog and tests from drifting | `check-script-docs.mjs` | Runs inside `verify-control-center`; add tests to `--with-script-tests`. |
| Manage Visible Automation Dispatch local mode / registry / queue / claim / finish / acceptance state | `visible-dispatch.mjs`, `workspace-control.mjs vad ...` | Runtime files stay under ignored `.workspace-local/visible-dispatch/`; the scripts print payloads and audit local automation compliance but never call Codex automation APIs, accept evidence, select TODOs, or write product repositories. Read [visible-automation-dispatch.md](visible-automation-dispatch.md) for the full operating map. |

## When To Extract A New Script

Create or extend a workspace script when a workflow is repeated, mechanical, evidence-producing, and bounded by existing total-control decisions. Prefer a script over hand editing when it can prevent stale indexes, missed coverage rows, broken links, or copy/paste drift.

Do not create a script when the work requires product design judgment, producer / consumer sequencing, acceptance of a window backfill, TODO priority decisions, or a real-project test action. In those cases, document the decision first, then automate only the mechanical follow-up if it repeats.

## Maintenance Checklist

When adding or renaming a script:

1. Update `scripts/README.md`.
2. Add a focused `*.test.mjs` if the script transforms docs, enforces safety, or protects a known workflow.
3. Add the test file to `verify-control-center.mjs --with-script-tests`.
4. Run `node scripts/check-script-docs.mjs`.
5. Run `node scripts/verify-control-center.mjs --with-script-tests` when the change is more than README text.

When adding or changing a document format:

1. Update the script-readable format notes in `scripts/README.md` only when the script contract changes.
2. Update the relevant template in `templates/`.
3. Run `node scripts/run-workspace-pipeline-e2e.mjs` to prove the format still supports write/apply automation.
4. Run `node scripts/verify-control-center.mjs --require-todo --require-task-packages --with-script-tests` when the current plan is affected.
