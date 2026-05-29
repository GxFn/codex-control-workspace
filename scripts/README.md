# Workspace Scripts

This directory stores ControlWorkspace-owned scripts for coordination,
verification, documentation maintenance, and cross-repository guardrails.

Scripts in this directory should:

- operate from the workspace root unless documented otherwise;
- avoid secrets, tokens, local absolute paths, and network access by default;
- avoid writing into child source repositories unless the user has confirmed
  an install-scope `AGENTS.md` write, or a current control plan explicitly
  assigns that work;
- report clear pass/fail evidence that can be pasted into workspace docs;
- when used by automation, finish with an explicit agent-facing completion
  cue. JSON output should expose `scriptComplete: true` and `agentNext`; text
  output should end with a concise `Agent next:` line. The cue is not a
  verdict, only the next control action for Codex to consider.

Node CLI exit policy:

- Prefer setting `process.exitCode` and letting the event loop drain instead
  of calling `process.exit()` after printing important stdout / stderr.
- Reserve direct `process.exit()` for explicit worker processes after cleanup.
- `check-script-docs.mjs` enforces this policy. Normal CLI scripts must use
  `process.exitCode` and controlled returns so Codex can continue after output
  has flushed.
- Long-running background helpers must avoid holding the short-lived CLI open:
  spawn them with ignored stdio, detach only when they intentionally outlive
  the command, call `unref()`, and provide a local stop marker or equivalent
  shutdown path.

Human-facing document policy:

- Users should normally read only the goal / stage confirmation document and
  the current workspace control plan with its window task packages.
- Repeated status surfaces, generated inboxes, format anchors, archive maps,
  and script verification notes should stay script-owned and short.

Script-readable document format:

- New current plans should start from
  `templates/workspace-control-plan-template.md` so `workspace-sync`, dispatch,
  TODO, task-package, prompt, test handoff, and backfill anchors are present
  before scripts run.
- Current plans that drive `sync-current-plan.mjs` may include:

```md
<!-- workspace-sync
{
  "status": "<current status>",
  "indexPlanDescription": "<index current-plan row summary>",
  "indexStatusDescription": "<index current-status row summary>",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "<current index summary>",
  "currentStatusSummary": "<first summary bullet after the current-plan link>",
  "indexRows": [],
  "currentIndexRows": []
}
-->
```

- `workspace-sync` is mechanical metadata only. It must not decide readiness,
  TODO priority, Design acceptance, window acceptance, or product scope.
- Keep `workspace-sync` after `## 回填区`, near the end of the current plan.
  `sync-current-plan.mjs` fails closed if this script metadata is placed above
  human-facing plan content.
- `currentStatusSummary` is optional; when present, `sync-current-plan.mjs`
  uses it to keep the concise status page from retaining stale mainline text.
- Keep these section names stable when scripts need to read or sync them:
  `目标判断`, `总控决策记录`, `任务包`, `TODO / Backlog`, `空闲窗口调度`,
  `窗口分派`, `可复制分派提示词` / `可复制提示词`, `测试交接`, and `回填区`.
- Current plans must include `总控决策记录` before mechanical sync or
  acceptance checks. This section records what demand / evidence triggered the
  doc update, whether the evidence answered the right question, what should be
  verified or replanned first, and which conclusions are allowed or forbidden.
- Window dispatch tables should keep the narrow form:
  `| 窗口 / 状态 | 任务 |`.
- TODO / idle scheduling tables should keep explicit ID, status, owner,
  effect on dispatch / retest, send decision, and next-step fields.
- Design handoff inboxes, test exchange docs, current indexes, archive maps,
  and compact summaries are script or evidence surfaces; keep them concise and
  link back to the human-facing current plan instead of duplicating it.

Current scripts:

- `workspace-control.mjs`: command-style aggregator for common control-center
  workflows. It maps friendly subcommands such as `status`, `verify`,
  `sync`, `dispatch`, `design`, `runtime`, `install`, `scripts`, `loop`, and
  `pipeline`
  onto the existing workspace scripts without replacing their dry-run / write
  gates. Use `--print` to inspect the exact commands before running them.
- `codex-automation-loop.mjs`: new CodexAutomationClosedLoop contract
  surface. It creates explicit controller dispatch packets, turns a packet
  into a delivery envelope, records target result envelopes, reviews whether a
  dispatch group is ready for total-control evidence pull, stores local thread
  registrations under `.workspace-local/codex-automation-loop/`, and writes an
  explicit stop marker. It does not parse current plans, decide sendable
  windows, claim target work, create Codex automations, or accept evidence.
  Total control owns planning and review, delivery adapters consume envelopes,
  and target windows return result envelopes.
- `control-workspace-install.mjs`: sibling-directory installation helper for
  GitHub-distributed control workspaces. It discovers repositories next to the
  control repo, writes user-confirmed `workspace.config.json` repository scope,
  unpacks the source control `AGENTS.md` into the parent workspace root,
  prints child-window prompts for scope confirmation, and dry-runs or writes a
  managed child-window access-card block into each configured child `AGENTS.md`. `DesignWindow`
  and `TestWindow` may be configured as external sibling directories, or kept
  internal with workspace-owned templates when the user has no separate design
  / test directory. `sync-templates` creates the full required Design/Test
  support surfaces for either mode: Design operating policy, original-plan /
  requirement-design / signal / handoff templates, handoff board, Test
  operation policy, test handoff template, and external alignment notes where
  applicable. `write-agents` refreshes the managed child access-card block with
  the parent `AGENTS.md`, active workspace index/status, current plan directory,
  window ledger, and automation execution boundary; it intentionally avoids
  repeating each repository's own stop card. By default
  it writes only `managedAgents` repositories, while `--include-unmanaged`
  can explicitly include Design/Test windows and still skips the protected real
  project unless `--include-real-project` is passed. It defaults to dry-run and
  refuses to write outside the configured parent workspace. Use `discover`, `status`, `configure`,
  `sync-root-agents`, `prompts`, `write-agents`, and `sync-templates`.
  Runtime scripts read `.workspace-local/workspace.config.json` first when it
  exists, then tracked `workspace.config.json`, unless `--config` or
  `CODEX_CONTROL_WORKSPACE_CONFIG` is provided. Use the ignored local config for
  one installation's concrete window names without committing project-specific
  scope to the generic repository.
- `collect-repo-status.mjs`: summarizes branch, HEAD, dirty state,
  upstream, ahead / behind counts, untracked files, and latest commit for each
  workspace child repository.
- `check-workspace-boundary.mjs`: verifies that child source repositories and
  local noise files are not tracked by the workspace Git repository.
- `verify-workspace-docs.mjs`: checks the workspace index, current control
  plan, required sections, Markdown links, and completed document references.
- `check-workspace-current-layout.mjs`: verifies that short-term workspace docs
  live under `.workspace-active/workspace/current/`, that the current index target points
  there, and that active docs/scripts/templates do not reference the old
  root-level short-term paths.
- `check-dispatch-coverage.mjs`: verifies that the current control plan covers
  every expected window, that the declared copyable prompt send list matches
  task statuses (`待启动`, `执行中`, or `已投递`), and that sendable prompts
  require reading `AGENTS.md` plus an explicit window / repository positioning
  statement. It also fails overlong copyable prompts so task details stay in
  task packages and window rules. Nonstandard extra windows are allowed when
  they are not send-eligible.
- `check-decision-preflight.mjs`: verifies that the current control plan
  records `总控决策记录` before document/state changes are treated as valid.
  It requires the trigger, demand / test-result interpretation, checked
  evidence, whether verification / replanning / user confirmation should happen
  first, allowed updates, and forbidden conclusions.
- `check-test-boundary.mjs`: verifies that `TestWindow` cannot be made
  send-eligible for verification without an active test card that records why
  total control cannot self-test, the real scenario dependency, the exact
  question under test, object / window / thread / project boundaries, success /
  failure inference limits, and stop / no-start conditions. Explicit non-test
  thread-registry or Codex Automation Closed Loop smoke rows are allowed only
  when the current plan says no test handoff, no real-project validation, and
  local-only runtime evidence.
- `check-todo-board.mjs`: verifies that plans using the TODO submode contain a
  `TODO / Backlog` section and idle-window scheduling coverage. Use
  `--require` when TODO items affect dispatch, parallel scheduling, or the next
  wave order.
- `check-task-packages.mjs`: verifies that plans using package-based dispatch
  contain a task-package section with stage goal, mainline actions, merged
  TODOs, exclusions, blockers / dependencies, verification, and backfill
  fields, plus the `AGENTS.md` reading and explicit positioning precondition.
  Use `--require` when TODOs and mainline work are bundled for a wave.
- `check-runtime-residue.mjs`: read-only check for BaseWindow daemon, Dashboard
  dev server, and Codex MCP process residue. It does not start, stop, or kill
  anything; use `--strict` only when a clean runtime surface is required.
- `check-script-docs.mjs`: verifies that every workspace `scripts/*.mjs` file
  is represented in this README, that test scripts appear in the workspace
  script-test instructions, that normal CLI scripts do not call direct
  `process.exit()`, and that `verify-control-center.mjs` with
  `--with-script-tests` runs all `*.test.mjs` files. Use `--root <workspace>`
  for fixture / CI execution and `--json` for machine output.
- `verify-control-center.mjs`: one-command control-center verification that
  runs boundary, repo status, workspace docs, script docs, current-plan sync
  check, decision preflight, dispatch coverage, test boundary, and
  `git diff --check`. Add `--require-todo` when TODO scheduling must be
  present, `--require-task-packages` when package-based dispatch must be
  present, `--with-runtime` for a read-only runtime residue report,
  `--strict-runtime` to fail when BaseWindow daemon / Dashboard dev residue is
  present, or `--with-script-tests` to run workspace script unit tests.
- `sync-current-plan.mjs`: dry-run by default; reads the current plan, plus an
  optional `<!-- workspace-sync { ... } -->` JSON block, and synchronizes the
  mechanical current-control surfaces: the first current-plan/current-status
  rows and window coverage table in `.workspace-active/workspace/index.md`, the active plan
  row in `.workspace-active/workspace/current/index.md`, and the status summary /
  window-dispatch / copyable-prompt sections in
  `.workspace-active/workspace/current/workspace-current-status.md`.
  It also supports controlled `indexRows` and `currentIndexRows` in the
  sync block for extra rows that the total-control plan has already decided.
  Use `--write` to apply, `--check` to fail when generated surfaces are stale,
  `--root <workspace>` for fixture / CI execution, and `--json` for machine
  output. Writes are restricted to workspace docs, use atomic file replacement,
  and validate workspace-relative row targets. This script does not create
  TODOs, alter Design handoff status, decide window readiness, accept window
  backfills, or edit product repositories.
- `archive-workspace-docs.mjs`: dry-run by default; moves completed workspace
  control documents into `../workspace-ledger/workspace/archive/YYYY-MM/<topic>/`, rewrites
  relative links inside moved documents, rewrites index links, removes archived
  rows from the current index table, and adds / updates a topic entry in
  `../workspace-ledger/workspace/workspace-record-map.md` only when `--apply` is provided. Use
  `--keep-index-rows` only when a
  historical row must remain visible. The script protects active first-row
  plans, but completed first-row plans can be archived once a new current or
  idle status entry is ready.
- `compact-workspace-index.mjs`: dry-run by default; compacts historical rows
  from `.workspace-active/workspace/index.md` into a topic manifest under
  `../workspace-ledger/workspace/archive/YYYY-MM/<topic>/index.md`, and updates
  `../workspace-ledger/workspace/workspace-record-map.md`. Use this after moving old documents, or
  when old execution rows still clutter the current index.
- `archive-global-todo-board.mjs`: dry-run by default; moves completed global
  TODO rows and old sync records from `.workspace-active/workspace/current/global-todo-board.md` to
  `../workspace-ledger/workspace/archive/YYYY-MM/global-todo/`, keeping the active board small.
- `generate-archive-topic-summaries.mjs`: dry-run by default; creates or
  refreshes `index.md` summary files for the archive root, month folders, and
  every `../workspace-ledger/workspace/archive/YYYY-MM/<topic>/` folder, preserving historical
  body files as evidence snapshots while giving each archive folder a readable
  map.
- `import-design-handoffs.mjs`: reads the configured Design handoff board
  (`.workspace-active/workspace/current/design-handoff-board.md` internally, or an
  external `DesignWindow/docs/current/workspace-handoff-board.md`), validates ready
  handoff rows, and with `--write` refreshes
  `.workspace-active/workspace/current/design-handoff-inbox.md`. It does not update global
  TODOs, current plans, or dispatch windows; the control window still decides
  whether and when to accept each Design handoff. Use `--id <Design Key>` to
  focus validation on one Design entry and verify its linked docs expose the
  same `Design Key` metadata.
- `run-workspace-pipeline-e2e.mjs`: creates a temporary fixture workspace and
  runs the complete governance-script chain from Design handoff intake through
  current-plan sync, dispatch / TODO / task-package verification, simulated
  test completion, archive apply, TODO archive, archive summary generation, and
  post-archive verification. It never writes product repositories. Use `--keep`
  to retain the fixture on success and `--json` for machine output.

Suggested pre-acceptance sequence:

```bash
node scripts/workspace-control.mjs verify
node scripts/verify-control-center.mjs
```

Dispatch plan with TODO and task packages:

```bash
node scripts/workspace-control.mjs verify --dispatch
node scripts/verify-control-center.mjs --require-todo --require-task-packages
```

Sync current plan metadata into repeated entry documents:

```bash
node scripts/workspace-control.mjs sync --write --verify --dispatch
node scripts/sync-current-plan.mjs --check
node scripts/sync-current-plan.mjs --write
node scripts/verify-control-center.mjs --require-todo --require-task-packages
```

Workspace script tests:

```bash
node scripts/check-script-docs.mjs
node --test scripts/codex-automation-loop.test.mjs scripts/collect-repo-status.test.mjs scripts/check-decision-preflight.test.mjs scripts/check-dispatch-coverage.test.mjs scripts/check-script-docs.test.mjs scripts/check-test-boundary.test.mjs scripts/control-workspace-install.test.mjs scripts/sync-current-plan.test.mjs scripts/workspace-control.test.mjs
node scripts/workspace-control.mjs scripts --tests
node scripts/verify-control-center.mjs --with-script-tests
```

Sibling install / adoption flow:

```bash
node scripts/control-workspace-install.mjs discover --json
node scripts/control-workspace-install.mjs status --json
node scripts/workspace-control.mjs status --json
node scripts/control-workspace-install.mjs configure --repo BaseWindow=../BaseWindow --repo PluginWindow=../PluginWindow --internal-design --internal-test --write
node scripts/control-workspace-install.mjs sync-templates --all --write
node scripts/control-workspace-install.mjs prompts
node scripts/control-workspace-install.mjs write-agents --all --write
node scripts/control-workspace-install.mjs write-agents --all --include-unmanaged --write
node scripts/workspace-control.mjs install status --json
```

TODO scheduling plan check:

```bash
node scripts/check-todo-board.mjs --require
```

Task package dispatch check:

```bash
node scripts/check-task-packages.mjs --require
```

Runtime residue check:

```bash
node scripts/workspace-control.mjs runtime
node scripts/check-runtime-residue.mjs
node scripts/verify-control-center.mjs --with-runtime
```

Codex Automation Closed Loop contracts:

```bash
node scripts/workspace-control.mjs loop status --json
node scripts/workspace-control.mjs loop register-thread --window <window> --thread-id <realThreadId> --write --json
node scripts/workspace-control.mjs loop create-dispatch --target-window <window> --task-id <taskId> --control-plan <plan> --objective "<objective>" --prompt-file <promptFile> --write --json
node scripts/workspace-control.mjs loop build-delivery --packet-file <packetFile> --require-thread --write --json
node scripts/workspace-control.mjs loop submit-result --target-window <window> --task-id <taskId> --status completed --evidence-ref <ref> --write --json
node scripts/workspace-control.mjs loop review-results --group <group> --json
node scripts/workspace-control.mjs loop stop-loop --reason "manual stop" --write --json
```

Design handoff inbox refresh:

```bash
node scripts/workspace-control.mjs design --write
node scripts/import-design-handoffs.mjs --write
node scripts/import-design-handoffs.mjs --id ARTIFACT-DRAWER-2026-05-25 --json
```

Full governance pipeline fixture:

```bash
node scripts/workspace-control.mjs pipeline
node scripts/run-workspace-pipeline-e2e.mjs
node scripts/run-workspace-pipeline-e2e.mjs --keep --json
```

Archive dry-run example:

```bash
node scripts/archive-workspace-docs.mjs --topic interface-boundary --file .workspace-active/workspace/current/example-completed-plan.md
```

Workspace archive cleanup sequence:

```bash
node scripts/archive-workspace-docs.mjs --topic example-topic --file .workspace-active/workspace/current/example-completed-plan.md --apply
node scripts/compact-workspace-index.mjs --topic example-topic --match 'example-topic|EXAMPLE' --apply
node scripts/archive-global-todo-board.mjs --apply
node scripts/generate-archive-topic-summaries.mjs --apply
```

Index-only pruning example:

```bash
node scripts/archive-workspace-docs.mjs --prune-index-only --apply
```

Real-project test scripts, when an external `TestWindow` exists, live under
that repository's `scripts/` directory so the control workspace root
`scripts/` directory stays focused on governance. If `TestWindow` is internal,
keep only handoff templates and evidence links in `.workspace-active/workspace/current/test-exchange.md`.
