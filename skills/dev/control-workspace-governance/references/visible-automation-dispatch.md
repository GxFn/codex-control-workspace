# Visible Automation Dispatch Operations

Use this reference when total control is starting, stopping, inspecting, or
debugging Visible Automation Dispatch (VAD). `AGENTS.md` owns hard safety
rules; VAD controller / target skills own heartbeat role behavior; this file
owns the workspace script operating map.

## Automation Types

- **Controller self heartbeat**: current task belongs to `ControlWorkspace`.
  Use a Codex heartbeat on the current thread. Do not enqueue VAD target tasks.
- **Target fan-out**: current plan has child-window tasks. Use
  `visible-dispatch` queue / group / arm commands after thread preflight.
- **Controller return**: final target in a group wakes `ControlWorkspace` for
  acceptance. Total control reviews evidence before accepting or dispatching the
  next wave.
- **Manual discussion**: normal user interaction. Never claim or chain VAD
  tasks from an ordinary discussion turn.

## Scenario Map

Use semantic commands instead of old generic verbs:

| Scenario | Command | Validation level | Notes |
| --- | --- | --- | --- |
| Initialize local runtime | `init --write --json` | Light | Creates missing local state files only. No mode change, no queue claim, no heartbeat payload, no Codex automation API. |
| First unattended launch for a current plan | `start-plan --write --json` | Fast-path required checks | Enables mode / keep-awake, enqueues current-plan send-eligible rows when needed, verifies target thread readiness while preparing payloads. |
| Normal continuation after controller return or manual interruption | `resume-plan --write --json` | Fast-path required checks | Reuses existing queue/group state, avoids duplicate tasks, returns `wait` / `review` / `attention` / payloads. |
| Target heartbeat execution | target skill `claim` / `finish` | Role-local checks | Delete the received disposable heartbeat first, then claim only this window's task and finish with evidence. |
| Controller-return execution | controller skill review flow | Evidence checks | Delete the received disposable return heartbeat first, then review raw evidence and decide next wave / stop / supplement. |
| Pause or close unattended mode | `stop-plan --write --reason "<reason>"` | Shutdown check only | Stops future finish-chain jumps and keep-awake. Run `post-run-audit` only when claiming the whole automation surface is clean. |
| Abnormal diagnosis | `controller-tick`, `preflight`, `audit-automation`, `post-run-audit` | Full or focused diagnostics | Use only after fast path reports `attention`, heartbeat creation fails, a target does not claim, or evidence/local state conflicts. |

`mode --enable|--disable` remains a low-level switch for scripts and repair
work. Normal operation should use `start-plan`, `resume-plan`, and `stop-plan`
so the command name describes intent.

## Fast Path First

Use fast path commands for first launch and normal resume. They do the
minimal useful work: enable mode, keep the Mac awake, classify current queue
state, enqueue the current plan only when needed, and return either heartbeat
payloads or a clear `wait` / `review` / `attention` decision.

```text
node scripts/visible-dispatch.mjs start-plan --write --json
node scripts/visible-dispatch.mjs resume-plan --write --json
node scripts/workspace-control.mjs vad start-plan --write --json
node scripts/workspace-control.mjs vad resume-plan --write --json
```

- `createHeartbeats`: create returned payloads with `codex_app.automation_update`
  in `createOrder` order, then run each `record-arm` command.
- `wait`: do not create new automations; existing work is in flight.
- `review`: review target backfill and make the total-control verdict.
- `attention`: stop the fast path and run diagnostic commands below.

Do not run full `preflight`, workspace verify, or automation audit before every
normal hop. Use them after the fast path reports a problem, a target fails to
claim, a heartbeat create fails, or evidence conflicts.

## Read-Only Orientation

```text
node scripts/visible-dispatch.mjs status --json
node scripts/visible-dispatch.mjs controller-tick --compact --json
node scripts/visible-dispatch.mjs group-status --group <dispatchGroupId> --json
node scripts/visible-dispatch.mjs audit-automation --automation-id <automationId> --json
node scripts/visible-dispatch.mjs post-run-audit --json
```

`controller-tick` is a classifier, not a verdict. If it says `modeDisabled`
during a controller self heartbeat, that can be correct; VAD mode only governs
target fan-out / finish-chain behavior. Use `--compact` when total control only
needs top action, counts, and current-plan state; use full `controller-tick
--json` when reviewing individual task classification. `post-run-audit` is the
end-of-run guard: it fails when local mode / keep-awake, active automation
runs, non-terminal tasks, send-eligible rows, or stale current-status text
still suggest automation is live.

## Automation Compliance And Deletion

Total control owns the authority to delete a non-compliant Codex automation.
Before trusting a heartbeat that looks stale, cross-window, off-plan, or
unexpected, run:

```text
node scripts/visible-dispatch.mjs audit-automation --automation-id <automationId> [--window <windowName>] [--group <dispatchGroupId>] [--role target|controller-return] --json
node scripts/workspace-control.mjs vad audit --automation-id <automationId> --json
```

The audit only judges local VAD state. It does not call Codex automation APIs.
When it reports `deleteRecommended: true`, total control should delete the
automation with `codex_app.automation_update` (`mode=delete`). If the audit
found an active local VAD run, then record the local stop:

```text
node scripts/visible-dispatch.mjs record-stop --automation-id <automationId> --write --reason "<why total control deleted it>"
```

Delete immediately when an automation is not tied to the current plan, current
task / dispatch group, expected target window, true thread id, allowed
`TestWindow` boundary, enabled VAD mode, or authorized next-hop policy.
Deleting a non-compliant automation is a total-control correction, not a user
confirmation gate.

## Mode And Runtime

```text
node scripts/visible-dispatch.mjs start-plan --write --json
node scripts/visible-dispatch.mjs resume-plan --write --json
node scripts/visible-dispatch.mjs stop-plan --write --reason "<reason>"
```

- Enable mode only when the current plan explicitly allows unattended VAD
  target fan-out or finish-chain continuation. Prefer `start-plan` / `resume-plan` over
  raw `mode --enable` because they also classify queue state and prepare payloads.
- Disable mode when the user stops automation, a hard gate triggers, or the
  current plan is no longer automation-owned.
- On macOS, enabled mode starts a local watcher that owns `caffeinate -dims`.
  Disabled mode writes a local stop marker; the watcher exits and releases
  `caffeinate` itself, avoiding cross-command `kill EPERM` in Codex sandboxed
  shells. If stop still fails, report an automation readiness risk and fix or
  manually stop the recorded worker / child process before claiming reliability.

## Target Fan-Out

```text
node scripts/visible-dispatch.mjs start-plan --write --json
node scripts/visible-dispatch.mjs resume-plan --write --json
```

Fast path is the normal fan-out route. It replaces the manual command chain
below unless a problem needs diagnosis:

```text
node scripts/visible-dispatch.mjs preflight --from-plan --json
node scripts/visible-dispatch.mjs enqueue --from-plan --group <dispatchGroupId> --return-policy controller-last --write
node scripts/visible-dispatch.mjs arm-batch --group <dispatchGroupId> [--stagger-seconds <n>|--no-stagger] --json
node scripts/visible-dispatch.mjs record-arm --task <taskId> --automation-id <automationId> --write
```

`start-plan` / `resume-plan` and `arm-batch` verify target thread readiness while
building payloads. Use explicit `preflight` when readiness fails or when you
are diagnosing registry/session drift. Thread ids are local runtime data under
`.workspace-local/visible-dispatch/`; never copy them into tracked docs. The
script prints heartbeat payloads but does not call Codex automation APIs.
Target payload text intentionally mirrors the manual copyable prompt first;
automation-specific content is only a lightweight variable supplement
(`currentWindow`, `taskId`, `controlDoc`, rule names, and target skill path).
The target window derives claim / finish / cleanup commands from those values
and `skills/dev/visible-automation-dispatch-target/SKILL.md`, so heartbeat text
does not drift into a second command manual.
Automation-facing script JSON should expose `scriptComplete: true` and
`agentNext`; text output should end with `Agent next:`. This is a continuation
cue for Codex after long command chains, not total-control acceptance evidence.
Batch payloads include `createOrder`, `createDelaySeconds`, and
`waitBeforeCreateSeconds`; create them in order and wait the per-item interval
before each create after the first. The default interval is intentionally small
and only reduces same-minute scheduling collisions; it does not guarantee
parallel execution if the Codex app runner serializes work internally. Keep the
default stagger for normal multi-window dispatch; use `--no-stagger` only for
explicit scheduling tests.

## Target Finish

Target windows use:

```text
node scripts/visible-dispatch.mjs claim --window <windowName> --write --json
node scripts/visible-dispatch.mjs finish --window <windowName> --backfill "<evidence>" --write --chain-next --json
```

When a target heartbeat is received, the heartbeat itself is disposable. If the
message includes `automation_id`, the target window deletes that app automation
immediately on receipt, then runs:

```text
node scripts/visible-dispatch.mjs record-stop --automation-id <automationId> --write --reason "target received"
```

This is the default target-side flow and does not require local audit before
deletion. It only stops repeated wakeups; it does not cancel the queued task,
claim lease, or finish-chain decision. After this delete / record-stop, the
target continues the real claim / execution / finish flow. Do not wait until
finish to delete the received wakeup, and do not delete it a second time at
finish.

Only create another heartbeat when finish JSON explicitly includes the matching
permission flag:

- target courier: `chain.nextAction === "armNext"`,
  `chain.handoffPolicy === "target-courier"`,
  `chain.payload.courierAllowed === true`;
- controller return: `chain.nextAction === "returnToController"`,
  `chain.handoffPolicy === "controller-return"`,
  `chain.payload.controllerReturnAllowed === true`.

`TestWindow` next-hop is total-control-owned by default.

Controller-return payloads are generated by the script and should be used
verbatim. The prompt must mirror the manual total-control workflow first, then
include only a short automation supplement with `dispatchGroup`,
`lastCompletedTarget`, `lastTaskId`, `controlPlan`, rule names, and controller
skill path. `用完即弃`, `group-status`, `controller-tick`, normal
`resume-plan`, and abnormal `audit-automation` commands are derived from those
variables by `skills/dev/visible-automation-dispatch-controller/SKILL.md`.
The first line should be human/task oriented, such as `继续总控验收：<window>
回填。`, and must not start with the automation mechanism name.
Do not handwrite full command lines or the old `VAD controller-return
heartbeat` prompt in target-window logic.

## Acceptance And Cleanup

```text
node scripts/visible-dispatch.mjs tick --write --json
node scripts/visible-dispatch.mjs accept --task <taskId> --verdict accepted --note "<evidence>" --write
node scripts/visible-dispatch.mjs block --task <taskId> --reason "<reason>" --write
node scripts/visible-dispatch.mjs record-stop --automation-id <automationId> --write --reason "<reason>"
node scripts/visible-dispatch.mjs post-run-audit --json
node scripts/visible-dispatch.mjs prune-history [--include-current-accepted] --write --json
```

Total control accepts only after reviewing raw evidence. `record-stop` records
external deletion / pause of Codex automations; for target wakeups, the normal
reason is `"target received"` because the wakeup is consumed before work starts.
It is not proof that a task finished. Use `block` for stopped, failed, or
manually abandoned tasks that should not continue. Use `prune-history` only
after current plan switches and historic terminal residue should no longer
affect controller decisions. Use `--include-current-accepted` only after total
control has accepted the current plan and decided the local accepted runtime
history may be cleaned; it does not replace archive or evidence review.

## Aggregated Entrypoint

For common checks, use:

```text
node scripts/workspace-control.mjs vad start-plan --write
node scripts/workspace-control.mjs vad resume-plan --write
node scripts/workspace-control.mjs vad status
node scripts/workspace-control.mjs vad controller --compact
node scripts/workspace-control.mjs vad stop-plan --write
node scripts/workspace-control.mjs vad post-run-audit
node scripts/workspace-control.mjs vad prune --include-current-accepted --write
```

`workspace-control.mjs` only orchestrates existing scripts. It still requires
write gates and never calls Codex automation APIs.
