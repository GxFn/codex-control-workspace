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
dispatch is complete from the controller side. Release the controller for other
workspace traffic instead of keeping an artificial in-progress state attached
to that task. The target window returns by submitting a `TargetResultEnvelope`
and sending a controller return according to the dispatch group's stored
`returnPolicy`. Until then, total control is free to handle other user input or
parallel plans.

The previous `claim / finish / chain-next / start-plan / resume-plan` protocol
is retired. Do not use it for closed-loop work.

## Prompt Shape

Controller wakeups should be task-first and compact:

```text
继续总控验收：<windowA>、<windowB> 回填。

变量：
- dispatchGroup: <group>
- triggerTarget: <window>
- triggerTaskId: <task>
- stateRoot: <path>
- humanContextRef: <path>
- returnPolicy: group-ready
- reviewScope: group
- groupStatus: ready
- rules: 用完即弃；review-results；按 groupSnapshot 判断单个回填、继续等待或整组验收；仅在证据通过且目标未完成时创建下一批 dispatch。
```

Do not start the visible prompt with the automation mechanism name. Do not paste
command manuals into the prompt. For `returnPolicy=group-ready`, the visible
title uses the returned window names, not the dispatch group id; keep the group
id in the variables for review and diagnostics.

Keep happy-path prompt variables compact. Do not print `completedTargets`, and
do not print empty `blockedTargets` / `missingTargets`. The full machine
snapshot remains in `ControllerReturnEnvelope.groupSnapshot`. Only expose
non-empty exception state in the prompt, such as:

```text
- blockedTargets: <windows>
- remainingTargets: <windows>
```

For `returnPolicy=per-target`, the first line is
`继续总控验收：<triggerTarget> 回填。`, but the prompt must still include the
remaining / missing group summary so total control does not mistake a single
target callback for whole-group completion.

## Normal Controller Flow

1. **Orient**
   - Read workspace `AGENTS.md`, workspace index/status, the current
     state-root `developer-progress.md` / `controller-state.json`, and this
     skill.
   - State that this is the total-control window.
   - Direct thread delivery has no automation cleanup step. If a previous local
     automation is still present, treat it as stale runtime state and stop for
     total-control cleanup rather than continuing a legacy route.

2. **Review target results**
   - For the compact controller evidence surface, run:

```text
node scripts/codex-automation-loop.mjs review-pack --group <dispatchGroup> --json
```

   - Use the review pack to find result files, commits, evidence refs,
     verification summaries, target delivery status, and controller-return
     status. The review pack is not a verdict; total control still pulls raw
     evidence before acceptance.
   - When debugging readiness only, run:

```text
node scripts/codex-automation-loop.mjs review-results --group <dispatchGroup> --json
```

   - Inspect `returnPolicy`, `groupStatus`, `readyResults`, `missingResults`,
     `blockedResults`, `groupSnapshot`, and `controllerReturnDeliveries`.
   - `wait` means the current return policy does not allow controller review
     yet. For `group-ready`, this includes partially complete groups.
   - `partially-ready` in `groupStatus` means some targets have returned and
     some are still missing. It is reviewable only when `returnPolicy.mode` is
     `per-target`.
   - `blocked` means at least one target reported a block; total control still
     reads the evidence before deciding whether it is a product block,
     environment block, or reporting block.
   - `needs-controller-review` means envelopes are present; pull raw evidence
     from commits, diffs, command outputs, runtime JSON, logs, reports, or
     screenshots before writing an acceptance verdict.
   - `controllerReturnDelivery.status` and `controllerReturnDeliveries`
     describe only the return transport.
     `pending-host-send` means a target built a `ControllerReturnEnvelope` but
     the real direct-thread send/readback/record step has not happened yet.
     Treat it as incomplete transport, not as a completed callback.

3. **Dispatch next work**
   - If the goal still needs work, total control decides the next task package
     and writes it into the controller state root first. The developer progress
     document is only the human context/projection, not automation authority.
     Create or update the task package with:

```text
node scripts/controller-state.mjs add-task-package --state-root <stateRoot> --task-package-id <taskPackageId> --summary "<summary>" --source-ref "<sourceRef>" --target-window <window> --target-task-id <taskId> --write --json
```

   - Append the human-readable task package entry only as a timestamped log:

```text
node scripts/append-progress-log.mjs --state-root <stateRoot> --type task-package --task-package-id <taskPackageId> --summary "<summary>" --source-ref "<sourceRef>" --write --json
```

   - Refresh only the generated `Unified Status` block when the projection is
     stale:

```text
node scripts/render-progress-doc.mjs --state-root <stateRoot> --write --json
```
   - Ensure each target window has a local thread registration. Register a real
     thread id only in local runtime:

```text
node scripts/codex-automation-loop.mjs register-thread --window <window> --thread-id <realThreadId> --role target --responsibility-root <repo-or-workspace-path> --write --json
```

   - If you only need the individual mechanical steps, build or refresh the
     target's local file config before delivery:

```text
node scripts/codex-automation-loop.mjs build-window-config --window <window> --require-thread --write --json
```

   - Choose the dispatch group's return policy before creating the first
     dispatch packet. `group-ready` creates one barrier callback after all
     expected targets return. `per-target` lets each target wake total control
     when its own result exists, while the group snapshot still lists remaining
     targets.
   - For the state-machine happy path, prepare dispatch from the state root.
     Use the same `--group`, `--controller-window`, and `--return-policy` for
     the whole group. `--controller-window` must be this controller window's
     registered name, so automation started by controller A returns to
     controller A instead of the global workspace default.

```text
node scripts/codex-automation-loop.mjs prepare-dispatch-from-state --state-root <stateRoot> --target-task-id <taskId> --group <dispatchGroup> --controller-window <currentControllerWindow> --return-policy group-ready --human-context-ref <stateRoot>/developer-progress.md --require-thread --write --json
```

     This writes the same window config, dispatch packet/group, and delivery
     envelope with `stateRef` / `humanContextRef`, and preserves the compact
     prompt card shape. It stops before host thread send/readback, so delivery
     still requires the host thread tool and `record-delivery-run`.

   - Add `--automation-enabled` only for an explicitly unattended run. In that
     mode, start keep-live before dispatch:

```text
node scripts/codex-automation-loop.mjs start-keep-live --automation-run-id <dispatchGroup-or-runId> --write --json
```

     The script owns one shared local macOS watcher and records active
     automation-run leases under ignored runtime. Starting keep-live while the
     watcher exists only adds / refreshes that run's lease. `keep-live-state`
     remains only for manual or external keep-live evidence. If
     `start-keep-live` cannot prove an active watcher, record it as an
     automation readiness risk; do not treat keep-live as working merely
     because a state file exists.
   - The delivery adapter or total-control operator uses direct thread delivery
     when the host capability and real thread registration are available. The
     script itself does not prove delivery. Delivery command output never emits
     raw thread ids; raw ids stay in ignored local runtime files. If the thread
     id or host send capability is unavailable, fail closed and return to
     total-control judgment.
   - Keep the transport policy simple: the adapter either performs a direct
     new-turn send with readback evidence or records blocked / failed evidence
     for total-control judgment.
   - After the host send and readback, record delivery evidence:

```text
node scripts/codex-automation-loop.mjs record-delivery-run --delivery-file <deliveryFile> --status sent --readback-ok true --evidence "<host send/readback evidence>" --write --json
```

   - Once the delivery run is recorded as sent/readback-ok, the controller-side
     dispatch is done. End the current controller work for that task unless
     there is a separate ready result to review. The target's result envelope
     plus controller-return is the next re-entry point.
   - For unattended return, register the controller thread once with role
     `controller`. Target windows may only create a controller-return delivery
     through `build-controller-return` according to the dispatch group's stored
     `controllerWindow` and `returnPolicy`: `group-ready` requires all expected
     results, while `per-target` allows this target's result to wake total
     control with a partial group snapshot. They still must send that
     controller-return through the host thread tool, confirm readback, and
     record the delivery run before the callback is complete. They still must
     not create another target-window hop.
   - Controller return is not a loop trigger by itself. When total control is
     woken by a controller-return envelope, it reviews the group and either:
     creates the next dispatch only when the controller state root still has an
     eligible unfinished task, or stops without another delivery when the goal
     is done, no task remains, or a user decision is needed.

4. **Stop**
   - Stop only for explicit user stop, hard gate, final archive, missing
     evidence that needs total-control judgment, or no useful
     automation-eligible work:

   - After a demand is completed, archived, or switched to an idle current
     control plan, scan formal Design handoffs and TODO candidates before
     ending an unattended run:

```text
node scripts/workspace-control.mjs next-work --after-completion --json
```

     If the user has named a specific ready demand, focus the scan:

```text
node scripts/workspace-control.mjs next-work --id <DESIGN-KEY> --json
```

     This scan is not acceptance and not dispatch. Continue unattended only
     when it returns one mechanically auto-claimable candidate inside the
     approved automation boundary; otherwise stop for total-control choice.

```text
node scripts/codex-automation-loop.mjs stop-loop --automation-run-id <dispatchGroup-or-runId> --reason "<reason>" --write --json
```

   - `stop-loop` releases this run's keep-live lease. The watcher stops only
     when no other automation run still holds a lease. Use `stop-keep-live
     --automation-run-id <id> --reason "<reason>" --write --json` only when
     closing keep-live without closing the delivery loop.

## Hard Gates

Stop and report when any applies:

- The wakeup cannot be tied to the current user goal, state root, legal group,
  target task, or real thread.
- A result envelope has no raw evidence pointer.
- Evidence is contradictory or only natural-language assertion.
- The next step changes the approved goal, removes scope, downgrades capability,
  or touches a protected real test project without written boundary.
- A target window tried to do another window's work, handle `TestWindow`, or
  create its own next-hop without explicit state-root authorization.
- Two automated retries fail on the same issue.

Do not stop merely because a phase completed or a plan refresh is needed when
the next unit still serves the approved final goal.

Do stop without creating another delivery when `review-results` plus current
plan/TODO inspection shows no eligible next task. Do not create a controller
return for the controller-return message itself.
