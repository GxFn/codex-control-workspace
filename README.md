<div align="center">

# Codex Control Workspace

A local-first command center that keeps multi-repository Codex work moving through visible, human-priority automation.

[中文](README.zh-CN.md)

</div>

---

- [Why](#why) · [Install Shape](#install-shape) · [Getting Started](#getting-started) · [How It Works](#how-it-works) · [Codex Automation Closed Loop](#codex-automation-closed-loop) · [Daily Use](#daily-use) · [Repository Layout](#repository-layout) · [Design Philosophy](#design-philosophy)

## Why

One Codex window is good at one codebase. Real product work is rarely that tidy.

A feature may need a plugin entrypoint, a local daemon, a shared core package, a dashboard, a design window, and a real-project test window. If each window works from its own memory, the plan drifts: one window implements a thin interface, another waits for evidence that never arrives, a test window validates the wrong thing, and the controller keeps rewriting status documents instead of closing the real loop.

Codex Control Workspace gives that work a **total-control surface**:

```text
User goal
   ↓
Total-control plan
   ↓
Task packages → sibling Codex windows
   ↓
Evidence backfill → total-control acceptance
   ↓
Next wave, dispatch again, archive, or stop
```

It is intentionally simple. No hosted service, no database, no hidden scheduler. The workflow is made of `AGENTS.md`, Markdown ledgers, small Node scripts, Codex skills, and optional Codex heartbeat automations. You can read every decision surface in the repository.

The important trick is continuity with human priority. When someone is at the Mac, they can inspect progress, redirect scope, edit code, or stop automation at any time; automation stays behind the developer's live judgment. When nobody is at the Mac and unattended mode is enabled, the controller can keep moving after a child window finishes: review the evidence, accept or reject it, create the next task package, fan out to the next windows, and repeat until the user goal is done, a hard gate appears, or there is no eligible TODO left. It is automation in service of total control, not a one-shot reminder and not a replacement for a present developer.

## Install Shape

Do not put your product repositories inside this repository. Clone the control workspace next to the repositories it will manage:

```text
MyWorkspace/
  AGENTS.md                  # unpacked total-control entrypoint
  codex-control-workspace/   # this repository
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
  workspace-ledger/          # project-specific long-term records
```

The generic repository keeps reusable control logic. Your project-specific active plans live in `.workspace-active/`, local runtime data lives in `.workspace-local/`, and long-term project history lives in the sibling `workspace-ledger/`.

## Getting Started

Use Codex as the installer. Ask it to inspect the parent folder, propose repository roles, and wait for confirmation before writing anything:

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

After the scope is confirmed, configure the sibling windows:

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

If you do not have separate design or test repositories, use internal surfaces:

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --internal-design \
  --internal-test \
  --write
```

`write-agents` only updates managed `codex-control-workspace:scope` blocks in configured sibling repositories. It does not replace a child repository's own rules.

## How It Works

### Total Control

The parent `AGENTS.md` is the always-loaded control contract. It is generated from this repository's `AGENTS.md` and tells Codex how to think before dispatching, testing, accepting, archiving, or automating work.

The strongest rules stay there because they are safety rails for the controller itself: do not replace judgment with script output, do not accept weak evidence, do not turn thin wiring into a completed feature, and do not send work to another window before the boundary is clear.

### Current Work

`.workspace-active/workspace/index.md` is the active control entrypoint. It points to the current plan, current status, TODO board, test exchange, design inbox, and automation state.

Current plans are short-lived. They describe the present goal, task packages, window coverage, producer / consumer order, validation commands, and backfill requirements. When finished, important evidence is moved to `../workspace-ledger/`.

### Child Windows

Each child repository keeps its own `AGENTS.md`. The control installer adds a compact managed block that tells the child window:

- where the control workspace is;
- which window name it owns;
- where the current plan and ledger are;
- how to execute an assigned dispatch packet and return a result envelope;
- when to stop and report back.

The child still owns its repository. It can inspect code, implement changes, run tests, and even use Codex sub-agents inside its own boundary. Total control accepts only the unified evidence it returns.

## Codex Automation Closed Loop

Codex Automation Closed Loop lets the controller wake real Codex windows with heartbeat automations while keeping planning and acceptance in total control.

The script layer manages explicit packets and envelopes:

```sh
node scripts/workspace-control.mjs loop register-thread --window <window> --thread-id <realThreadId> --write --json
node scripts/workspace-control.mjs loop create-dispatch --target-window <window> --task-id <taskId> --control-plan <plan> --objective "<objective>" --prompt-file <promptFile> --write --json
node scripts/workspace-control.mjs loop build-delivery --packet-file <packetFile> --require-thread --write --json
node scripts/workspace-control.mjs loop submit-result --target-window <window> --task-id <taskId> --status completed --evidence-ref <ref> --write --json
node scripts/workspace-control.mjs loop review-results --group <group> --json
```

The script does not call Codex automation APIs by itself. It prepares delivery envelopes. A Codex controller window or delivery adapter creates the heartbeat from the envelope, then the target window reports a `TargetResultEnvelope`.

The loop is designed for long unattended runs that remain interruptible. If a developer is present, their manual correction, code edit, or scope decision takes priority over the next automated hop. If the Mac is left alone, total control can review result envelopes, pull raw evidence, accept or reject it, create the next task package, and dispatch again until the user goal is done, a hard gate appears, or there is no eligible TODO left.

On macOS, keep-awake is delivery support, not task logic. If an installation enables it, failure to start or stop keep-awake is reported as an automation readiness risk rather than hidden behind task status.

## Daily Use

Start with the active control surface:

```sh
node scripts/workspace-control.mjs status
node scripts/workspace-control.mjs loop status --json
node scripts/verify-control-center.mjs --require-task-packages --with-script-tests
```

For ordinary manual dispatch, the controller writes one prompt for all windows: read the parent `AGENTS.md`, read the current plan, read your own repository `AGENTS.md`, declare your window identity, do only the task assigned to your window, and backfill evidence.

For unattended work, use Codex Automation Closed Loop only when the current plan explicitly allows it. Turning it on does not make every conversation automatic; it only authorizes the current plan's target fan-out, result review, and next-wave decisions. Manual developer input always outranks the next automated dispatch.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Source total-control instructions, unpacked to the parent workspace root. |
| `workspace.config.json` | Generic window names, repository paths, role labels, and script defaults. |
| `.workspace-active/` | Ignored current control surface: current plans, TODOs, test exchange, design inbox. |
| `.workspace-local/` | Ignored local runtime: thread ids, automation loop state, local config override. |
| `../workspace-ledger/` | Project-specific long-term records outside the generic repository. |
| `scripts/` | Installation, validation, ledger, automation, and control helper scripts. |
| `skills/` | Operational manuals for total control, target windows, testing, ledgers, and automation. |
| `templates/` | Minimal skeletons for plans, task packages, design handoff, tests, and confirmations. |

## Design Philosophy

1. **Prompt-native, file-backed** — the workflow is readable by humans and by Codex.
2. **Total control before automation** — scripts classify and deliver; the controller still accepts or rejects evidence.
3. **Sibling repositories stay independent** — product code, tests, and commits stay in their own repositories.
4. **Active work is local, history is separate** — generic code stays clean; project memory lives in active and ledger surfaces.
5. **Small scripts, strong boundaries** — automation is useful only when it preserves window identity, repository scope, and evidence quality.

Codex Control Workspace is not a replacement for judgment. It is the scaffolding that keeps judgment present when the work spreads across many windows.
