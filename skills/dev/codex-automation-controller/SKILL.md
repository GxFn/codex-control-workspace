---
name: codex-automation-controller
description: Use when ControlWorkspace total control starts or resumes Codex Automation Closed Loop, reviews target result envelopes, creates dispatch packets, builds delivery envelopes, decides acceptance / rework / block / next wave, or stops unattended automation.
---

# Codex Automation Controller

Use this skill only from the total-control window. `AGENTS.md` owns hard
judgment; this skill owns the mechanical loop steps.

## Intent

Codex Automation Closed Loop is a delivery layer wrapped around normal total
control. It lets total control fan out work to target windows, receive compact
result envelopes, pull raw evidence, and decide the next wave. It does not
replace total-control planning or acceptance.

Direct thread dispatch is the normal work pipeline. When unattended automation
is explicitly enabled, run it as a continuous loop inside the approved user
goal, repository boundary, and eligible TODO set: review, pull evidence, decide,
plan the next package, dispatch again, and keep moving until final completion,
a hard gate, explicit user stop, missing evidence that needs human judgment, or
no eligible TODO remains. Automation-enabled runs should also enable keep-live /
keep-awake support; keep-live is runtime liveness support, not delivery
transport and not acceptance evidence.

Total control is a traffic controller, not a worker locked to one lane. After a
target dispatch has been sent, read back, and recorded as a delivery run, that
dispatch is complete from the controller side. Do not create a heartbeat,
self-wakeup, recurring reminder, or artificial in-progress state just to keep
the controller attached to that task. The target window returns by submitting a
`TargetResultEnvelope` and, when the group is ready, sending one controller
return. Until then, total control is free to handle other user input or parallel
plans.

The previous `claim / finish / chain-next / start-plan / resume-plan` protocol
is retired. Do not use it for closed-loop work.

## Prompt Shape

Controller wakeups should be task-first and compact:

```text
继续总控验收：<lastCompletedTarget> 回填。

变量：
- dispatchGroup: <group>
- lastCompletedTarget: <window>
- lastTaskId: <task>
- controlPlan: <path>
- rules: 用完即弃；review-results；证据通过且目标未完成时创建下一批 dispatch；仅异常诊断。
```

Do not start the visible prompt with the automation mechanism name. Do not paste
command manuals into the prompt.

## Normal Controller Flow

1. **Orient**
   - Read workspace `AGENTS.md`, workspace index/status, the current control
     plan, and this skill.
   - State that this is the total-control window.
   - Direct thread delivery has no automation cleanup step. If a previous local
     automation is still present, treat it as stale runtime state and stop for
     total-control cleanup rather than continuing a legacy route.

2. **Review target results**
   - Run:

```text
node scripts/codex-automation-loop.mjs review-results --group <dispatchGroup> --json
```

   - `wait` means some target result envelopes are missing.
   - `blocked` means at least one target reported a block; total control still
     reads the evidence before deciding whether it is a product block,
     environment block, or reporting block.
   - `needs-controller-review` means envelopes are present; pull raw evidence
     from commits, diffs, command outputs, runtime JSON, logs, reports, or
     screenshots before writing an acceptance verdict.

3. **Dispatch next work**
   - If the goal still needs work, total control decides the next task package
     and writes/refines the current plan first.
   - Ensure each target window has a local thread registration. Register a real
     thread id only in local runtime:

```text
node scripts/codex-automation-loop.mjs register-thread --window <window> --thread-id <realThreadId> --role target --responsibility-root <repo-or-workspace-path> --write --json
```

   - Build or refresh the target's local file config before delivery:

```text
node scripts/codex-automation-loop.mjs build-window-config --window <window> --busy-policy append-if-steerable --require-thread --write --json
```

   - For each target, create a dispatch packet. Omit `--prompt` for the default
     compact target prompt; use `--prompt-file` only when the current plan needs
     a custom wakeup shape.

```text
node scripts/codex-automation-loop.mjs create-dispatch --target-window <window> --task-id <taskId> --group <dispatchGroup> --control-plan <path> --objective "<objective>" --evidence "<required evidence>" --write --json
```

   - Then create a delivery envelope:

```text
node scripts/codex-automation-loop.mjs build-delivery --packet-file <packetFile> --require-thread --busy-policy append-if-steerable --write --json
```

   - Add `--automation-enabled` only for an explicitly unattended run. In that
     mode, start keep-live before dispatch:

```text
node scripts/codex-automation-loop.mjs start-keep-live --automation-run-id <dispatchGroup-or-runId> --write --json
```

     The script owns a local macOS watcher and writes both state and control
     files under ignored runtime. `keep-live-state` remains only for manual or
     external keep-live evidence. If `start-keep-live` cannot prove an active
     watcher, record it as an automation readiness risk; do not treat
     keep-live as working merely because a state file exists.
   - The delivery adapter or total-control operator uses direct thread delivery
     when the host capability and real thread registration are available. The
     script itself does not prove delivery. Delivery command output never emits
     raw thread ids; raw ids stay in ignored local runtime files. If the thread
     id or host send capability is unavailable, fail closed and return to
     total-control judgment.
   - After the host send and readback, record delivery evidence:

```text
node scripts/codex-automation-loop.mjs record-delivery-run --delivery-file <deliveryFile> --status sent --readback-ok true --evidence "<host send/readback evidence>" --write --json
```

   - Once the delivery run is recorded as sent/readback-ok, the controller-side
     dispatch is done. End the current controller work for that task unless
     there is a separate ready result to review. Do not schedule controller
     heartbeat or self-wakeup work; the target's result envelope plus
     controller-return is the next re-entry point.
   - For unattended return, register the controller thread once with role
     `controller`. Target windows may only create a controller-return delivery
     through `build-controller-return` after `review-results` says the group is
     ready; they still must not create another target-window hop.
   - Controller return is not a loop trigger by itself. When total control is
     woken by a controller-return envelope, it reviews the group and either:
     creates the next dispatch only when the current plan still has an eligible
     unfinished task, or stops without another delivery when the goal is done,
     no task remains, or a user decision is needed.

4. **Stop**
   - Stop only for explicit user stop, hard gate, final archive, missing
     evidence that needs total-control judgment, or no useful
     automation-eligible work:

```text
node scripts/codex-automation-loop.mjs stop-loop --reason "<reason>" --write --json
```

   - `stop-loop` also stops the local keep-live watcher. Use
     `stop-keep-live --automation-run-id <id> --reason "<reason>" --write --json`
     only when closing keep-live without closing the delivery loop.

## Hard Gates

Stop and report when any applies:

- The wakeup cannot be tied to the current user goal, current plan, legal group,
  target task, or real thread.
- A result envelope has no raw evidence pointer.
- Evidence is contradictory or only natural-language assertion.
- The next step changes the approved goal, removes scope, downgrades capability,
  or touches a protected real test project without written boundary.
- A target window tried to do another window's work, handle `TestWindow`, or
  create its own next-hop without explicit current-plan authorization.
- Two automated retries fail on the same issue.

Do not stop merely because a phase completed or a plan refresh is needed when
the next unit still serves the approved final goal.

Do stop without creating another delivery when `review-results` plus current
plan/TODO inspection shows no eligible next task. Do not create a controller
return for the controller-return message itself.
