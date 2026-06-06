<div align="center">

# Codex Control Workspace

A local-first total-control workspace for multi-repository Codex work, with one
machine state root, one developer-readable progress surface, and an unattended
direct-thread loop that still requires controller judgment.

[中文](README.zh-CN.md)

</div>

---

- [Why](#why) · [Install Shape](#install-shape) · [Getting Started](#getting-started) · [Control Pipeline](#control-pipeline) · [Unattended Automation](#unattended-automation) · [Daily Use](#daily-use) · [Repository Layout](#repository-layout) · [Design Philosophy](#design-philosophy)

## Why

One Codex window is good at one codebase. Real product work is rarely that tidy.

A demand may need a plugin entrypoint, a local daemon, a shared core package, a
dashboard, a design window, and a real-project test window. If each window works
from its own memory, the plan drifts: one window builds a thin interface,
another waits for evidence that never arrives, a test window validates the wrong
question, and the controller spends its time rewriting status documents instead
of closing the real loop.

Codex Control Workspace gives that work a total-control surface:

```text
User goal
   ↓
State-root demand
   ↓
Task packages → sibling Codex windows
   ↓
Target result evidence
   ↓
Controller review decision
   ↓
Next package, rework, blocked, complete, or stop
```

The current implementation is intentionally small. There is no hosted service,
database, or hidden scheduler. The reusable repository contains `AGENTS.md`,
templates, skills, and Node scripts. Project runtime state lives outside Git in
`.workspace-active/`; local machine state such as real thread ids lives in
`.workspace-local/`; long-term project memory lives in the sibling
`workspace-ledger/`.

The important trick is separation of responsibility. Machine state is JSON.
Human-readable progress is a projection. Direct-thread automation moves packets
between Codex windows, but it does not accept work. The controller must still
pull raw evidence, decide whether the result is acceptable, and choose the next
eligible step.

## Install Shape

Do not put your product repositories inside this repository. Clone the control
workspace next to the repositories it will manage:

```text
MyWorkspace/
  AGENTS.md                  # unpacked total-control entrypoint
  codex-control-workspace/   # this reusable repository
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
  workspace-ledger/          # project-specific long-term records
```

The tracked `workspace.config.json` is a reusable default. A local installation
may override it with `.workspace-local/workspace.config.json`; that file is not
committed. `.workspace-active/` and `.workspace-local/` are installation/runtime
surfaces, not source-controlled product state. Templates in this repository are
the supported way to create those local surfaces.

## Getting Started

Use Codex as the installer. Ask it to inspect the parent folder, propose
repository roles, and wait for confirmation before writing anything:

```text
You are installing codex-control-workspace.
Read README.md, README.zh-CN.md, AGENTS.md, workspace.config.json, and scripts/README.md.
Run node scripts/control-workspace-install.mjs discover --json.
List sibling repositories, proposed window names, existing AGENTS.md status, and role suggestions.
Wait for my confirmation before running configure, sync-root-agents, sync-templates, or write-agents.
```

Common orientation commands:

```sh
cd MyWorkspace/codex-control-workspace
node scripts/control-workspace-install.mjs discover --json
node scripts/control-workspace-install.mjs status --json
```

After the scope is confirmed, configure sibling windows:

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --repo DesignWindow=../DesignRepo \
  --repo TestWindow=../TestRepo \
  --write

node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
node scripts/control-workspace-install.mjs prompts
node scripts/control-workspace-install.mjs write-agents --all --write
```

If you do not have separate design or test repositories, use internal support
surfaces:

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --internal-design \
  --internal-test \
  --write
```

`write-agents` updates only managed `codex-control-workspace:scope` blocks in
configured sibling repositories. It does not replace a child repository's own
rules.

## Control Pipeline

### Total-Control Gate

The parent `AGENTS.md` is the always-loaded control contract. It is generated
from this repository's `AGENTS.md` and tells the controller how to think before
dispatching, testing, accepting, archiving, or automating work.

The strongest rules stay there because they constrain the controller itself:
do not replace judgment with script output, do not accept weak evidence, do not
turn thin wiring into a completed feature, do not broaden scope when the
smallest code loop is still broken, and do not send work to another window
before the boundary is clear.

### State Root

New demands are represented by one controller state root created with
`controller-state.mjs init`. The root contains machine-owned files such as:

```text
demand.json
controller-state.json
controller-events.jsonl
intake/*.json
test-cards/*.json
task-packages/*.json
target-results/*.json
transition-candidates/*.json
developer-progress.md
```

`controller-state.json` is the process authority. `developer-progress.md` is the
developer-readable surface: goal, completion definition, stage plan, task
packages, append-only backfill summaries, decisions, and a generated `Unified
Status` block. Scripts may regenerate only that fixed block; everything else is
readable context or timestamped append-only history.

### Design And Test Intake

Design and Test are not separate state machines. They attach structured
evidence to the active state root:

```sh
node scripts/controller-state.mjs init \
  --demand-key <key> \
  --title "<title>" \
  --goal "<goal>" \
  --completion-definition "<done>" \
  --stage-plan "<stage plan>" \
  --write --json

node scripts/control-intake.mjs design-handoff \
  --state-root <stateRoot> \
  --design-key <DESIGN-KEY> \
  --write --json

node scripts/control-intake.mjs test-card \
  --state-root <stateRoot> \
  --test-id <testId> \
  --target-window <TestWindow> \
  --question "<question>" \
  --object-boundary "<boundary>" \
  --controller-self-check "<already checked>" \
  --real-scenario-condition "<why real scenario is needed>" \
  --success-means "<success conclusion>" \
  --failure-means "<failure conclusion>" \
  --cannot-conclude "<what this test cannot prove>" \
  --stop-condition "<when to stop>" \
  --write --json
```

`control-intake.mjs` validates and writes machine intake. It does not accept a
Design handoff, accept a test result, mutate controller state, or create
dispatches.

### Task Package And Review

The normal route is package, dispatch, result, reduce, decide:

```sh
node scripts/controller-state.mjs add-task-package \
  --state-root <stateRoot> \
  --task-package-id <packageId> \
  --summary "<summary>" \
  --target-window <window> \
  --target-task-id <taskId> \
  --target-summary "<target task>" \
  --write --json

node scripts/codex-automation-loop.mjs prepare-dispatch-from-state \
  --state-root <stateRoot> \
  --task-package-id <packageId> \
  --target-task-id <taskId> \
  --group <groupId> \
  --controller-window <controllerWindow> \
  --human-context-ref <stateRoot>/developer-progress.md \
  --require-thread \
  --write --json

node scripts/controller-state.mjs import-target-result \
  --state-root <stateRoot> \
  --target-window <window> \
  --target-task-id <taskId> \
  --status completed \
  --evidence-ref <ref> \
  --verification "<verification summary>" \
  --write --json

node scripts/codex-automation-loop.mjs review-pack \
  --state-root <stateRoot> \
  --json

node scripts/controller-state.mjs reduce-results \
  --state-root <stateRoot> \
  --write --json

node scripts/controller-state.mjs decide-review \
  --state-root <stateRoot> \
  --candidate-id <candidateId> \
  --decision accept \
  --reason "<controller evidence verdict>" \
  --evidence-ref <ref> \
  --write --json
```

`prepare-dispatch-from-state` fails closed when the demand is completed,
archived, paused, blocked, waiting for controller review, or when the target task
is already accepted, completed, or blocked. Importing a result is not
acceptance; `reduce-results` and `decide-review` are explicit controller steps.

## Unattended Automation

Codex Automation Closed Loop is the transport and callback contract for
unattended work. It is direct-thread only:

1. Register real Codex thread ids in `.workspace-local/`.
2. Build dispatch packets from a state-root task package.
3. Build delivery envelopes.
4. Send the prompt with the host thread tool.
5. Record a delivery run with send/readback evidence.
6. Target windows return result envelopes.
7. Total control reviews raw evidence and decides the next transition.

Useful commands:

```sh
node scripts/codex-automation-loop.mjs register-thread \
  --window <window> \
  --thread-id <realThreadId> \
  --role target \
  --write --json

node scripts/codex-automation-loop.mjs record-delivery-run \
  --delivery-file <deliveryEnvelope> \
  --status sent \
  --host-method send_message_to_thread \
  --host-mode new-turn \
  --readback-ok true \
  --evidence "<readback summary>" \
  --write --json

node scripts/codex-automation-loop.mjs review-results \
  --group <groupId> \
  --json

node scripts/codex-automation-loop.mjs build-controller-return \
  --group <groupId> \
  --trigger-target <window> \
  --trigger-task-id <taskId> \
  --controller-window <controllerWindow> \
  --require-thread \
  --write --json

node scripts/codex-automation-loop.mjs stop-loop \
  --automation-run-id <runId> \
  --reason "<reason>" \
  --write --json
```

The script layer never sends host thread messages by itself and never accepts
evidence. A delivery adapter or controller window must perform the actual host
send and record the readback. Callback behavior is controlled by
`DispatchGroup.controllerWindow` and `return-policy`: `group-ready` creates one
barrier callback after all expected targets return; `per-target` lets each
completed target wake total control with a group snapshot that still lists
completed, blocked, and missing targets.

Unattended mode is continuous only inside a confirmed demand: review result
envelopes, pull raw evidence, accept or reject, create the next eligible task
package, and dispatch again. Stop conditions are final completion, a hard gate,
user stop, no eligible TODO, evidence that needs human judgment, or a current
state that forbids dispatch.

On macOS, keep-live / keep-awake is automation support, not task logic and not
delivery proof. If unattended mode depends on it, start/stop failures must be
reported as automation readiness risk.

## Daily Use

Start with the active control surface:

```sh
node scripts/workspace-control.mjs status
node scripts/workspace-control.mjs loop status --json
node scripts/workspace-control.mjs verify --script-tests
```

Use `workspace-control.mjs --print <command>` to inspect the underlying script
calls. The full script catalog is in [scripts/README.md](scripts/README.md).

For ordinary manual dispatch, the controller prompt should be short: read the
parent `AGENTS.md`, read the state root and `developer-progress.md`, read the
target repository `AGENTS.md`, declare window identity, do only the assigned
target task, and backfill evidence.

Turning on unattended automation does not make every conversation automatic. It
only authorizes the current demand's target fan-out, result review, and
next-package decisions inside the confirmed goal, completion definition, and
repository boundary. Manual developer input always outranks the next automated
hop.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Source total-control instructions, unpacked to the parent workspace root. |
| `workspace.config.json` | Generic window names, repository paths, role labels, and script defaults. |
| `.workspace-active/` | Ignored project runtime: current indexes, controller state roots, progress docs, TODO projections, intake, and test cards. |
| `.workspace-local/` | Ignored local runtime: real thread ids, automation loop state, keep-live state, and local config overrides. |
| `../workspace-ledger/` | Project-specific long-term records outside the reusable repository. |
| `scripts/` | Installation, validation, ledger, state-machine, intake, automation, and control helper scripts. |
| `skills/` | Operational manuals for total control, target windows, testing, ledgers, and automation. |
| `templates/` | Minimal skeletons for state roots, developer progress docs, Design/Test support, and confirmations. |

## Design Philosophy

1. **One state machine** — `controller-state.json` is the process authority; Markdown is projection or evidence.
2. **One developer-readable progress surface** — developers read the goal, stage plan, task packages, backfills, and decisions in one place.
3. **Machine data stays machine data** — repeated status, thread ids, envelopes, task packages, test cards, and intake records are JSON / JSONL.
4. **Automation is transport, not judgment** — direct-thread delivery and callbacks move work; total control accepts or rejects it.
5. **Design and Test attach to the demand** — handoffs and real-scenario test boundaries become state-root intake, not parallel plans.
6. **Sibling repositories stay independent** — product code, tests, and commits stay in their own repositories.
7. **Clean templates over clever branches** — the default route should be easy to read, easy to verify, and hard to misuse.

Codex Control Workspace is not a replacement for judgment. It is the scaffolding
that keeps judgment present when the work spreads across many Codex windows.
