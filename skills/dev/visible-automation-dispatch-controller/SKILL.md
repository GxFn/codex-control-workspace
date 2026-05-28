---
name: visible-automation-dispatch-controller
description: Use when ControlWorkspace total control is awakened by a Visible Automation Dispatch controller-return heartbeat, runs unattended automation-goal mode, reviews a completed dispatch group, decides acceptance / rejection / self-test / TestWindow handoff / next wave / next TODO, or must avoid small-task drift while continuing toward the user-approved final goal.
---

# Visible Automation Dispatch Controller

Total-control-only skill for VAD controller-return heartbeats. `AGENTS.md` owns hard judgment; this skill owns the operating steps.

## Intent

VAD unattended mode means: keep moving the user-approved final goal until it is complete, then optionally review the next automation-eligible TODO. A stage boundary, plan refresh, or "show Stage N plan" note is not a stop by itself when the next work stays inside the approved goal and completion definition.

Automation is only delivery. Scripts report state and print payloads; total control still accepts evidence, chooses scope, writes/refines plans, and decides whether to continue.

## Lightweight Return Prompt Contract

Controller-return heartbeats are lightweight wakeup envelopes. The prompt should
carry only:

- `dispatchGroup`
- `lastCompletedTarget`
- `lastTaskId`
- `controlPlan`
- rule names: `用完即弃`, `group-status`, `controller-tick`,
  `resume-plan`, and `仅异常诊断 audit-automation`

Do not require the heartbeat prompt to repeat full command lines. Derive every
command from those variables and this skill. If a required value is missing or
conflicts with local VAD state, stop the fast path and diagnose instead of
guessing.

## Normal Fast Path

Use this path for first launch / resume / ordinary controller returns. Do not run the
full diagnostic suite before every hop; only branch into diagnostics when a
command reports `attention`, `blocked`, missing thread registration, conflicting
evidence, or a failed heartbeat create.

1. **Start plan or resume plan**
   - Run `node scripts/visible-dispatch.mjs start-plan --write --json` for a fresh current-plan dispatch, or `node scripts/visible-dispatch.mjs resume-plan --write --json` after a controller return or manual interruption.
   - If the result action is `createHeartbeats`, create the returned payloads in `createOrder` order and then run the matching `record-arm` command for each automation id.
   - If the result action is `wait`, do not create anything; an existing target heartbeat/task is already in flight.
   - If the result action is `review`, review the completed backfill before dispatching more work.
   - If the result action is `attention`, stop the fast path and use the diagnostic commands below.

2. **Controller return**
   - Consume the disposable wakeup first: delete only this controller-return automation and run `record-stop --reason "controller return received"`.
   - Use the prompt `dispatchGroup` with `group-status --group <dispatchGroup> --json`, then read the current plan and group evidence before making the total-control verdict.
   - If the active goal still needs work, refresh/create the next current plan and run `resume-plan --write --json` to dispatch it.

3. **Clean stop**
   - Use `stop-plan --write --reason "<reason>"` only for explicit user stop, hard gate, final archive, or no useful automation-eligible work.
   - After a stop, run `post-run-audit --json` before claiming the automation surface is clean.

## Three Steps

1. **Review evidence**
   - Read `AGENTS.md`, workspace index/status, current control plan, and this skill.
   - Use prompt variables to run `group-status --group <dispatchGroup> --json`; use `controller-tick --compact --json` for a small orientation snapshot.
   - If the heartbeat message includes `automation_id`, delete this wakeup automation and run `record-stop` before long evidence review. Run `audit-automation` only when the automation id, group, plan, or local run state looks inconsistent.
   - Separate target self-report, raw evidence, and total-control verdict.
   - Accept/reject/block completed tasks only after evidence answers the assigned boundary.

2. **Decide the next unit**
   - If evidence is insufficient, re-dispatch or request补证 for the owning window.
   - If a directly checkable issue exists, self-test or inspect here before involving `TestWindow`.
   - If the active goal is still incomplete and the next step is in scope, create/refresh the next executable control plan and task packages.
   - If the active goal is complete, archive/close it before reviewing the next automation-eligible TODO. A `complete-pending-archive` plan is a stop-for-archive / confirmation point, not a TODO auto-claim point.

3. **Dispatch or stop**
   - For normal dispatch: use `start-plan --write --json` or `resume-plan --write --json`, create each returned heartbeat in `createOrder` order, wait `waitBeforeCreateSeconds` before each create after the first, then run each record command.
   - For stop: use `stop-plan` only when a hard gate below is hit, no useful next unit exists, or the user explicitly asks to stop. After `stop-plan` or final archive, run `post-run-audit --json` before claiming the automation run is clean.

## Hard Gates

Stop and report instead of continuing only when one applies:

- VAD mode is disabled.
- The current controller-return automation fails local compliance audit, points at an old plan / wrong group, or cannot be tied to a recorded controller-return run.
- Required window thread registration or preflight fails.
- The next step changes the approved goal, removes scope, downgrades capability, touches a real test project, or starts 038/039 without permission.
- Evidence is missing, contradictory, only natural-language assertion, or conflicts with local code facts.
- Two automatic retries failed on the same issue.
- `TestWindow` would be needed but the test boundary/reason is not written.
- No high-value next unit exists and the remaining TODO is low-value cleanup unrelated to the active goal.
- The user explicitly asks to pause/stop or starts a normal discussion that is not a VAD controller heartbeat.

Do not stop merely because a phase completed, a Stage plan was produced, or the current plan needs a next-wave refresh.

## Diagnostic Commands

Use these only after the fast path reports `attention` / `blocked`, a heartbeat
creation fails, a target does not claim in time, or total-control evidence
conflicts with local state.

```text
node scripts/visible-dispatch.mjs group-status --group <dispatchGroupId> --json
node scripts/visible-dispatch.mjs controller-tick --compact --json
node scripts/visible-dispatch.mjs preflight --from-plan --json
node scripts/visible-dispatch.mjs preflight --group <dispatchGroupId> --json
node scripts/visible-dispatch.mjs arm-batch --group <dispatchGroupId> --json
```

`preflight` verifies local-only registry entries against actual Codex session files. If it fails, fix registration; do not arm payloads.

`arm-batch` defaults to a small create-time stagger. The first heartbeat can be
created immediately; for each later payload, wait its `waitBeforeCreateSeconds`
before calling `codex_app.automation_update`. Use `--stagger-seconds <n>` for a
different interval or `--no-stagger` only when intentionally testing
back-to-back scheduling. Keep the default stagger unless there is a specific
test reason to change it; it is the current field-tested guard against creating
several minute-based heartbeats in the exact same instant.

## Heartbeat Cleanup

If the controller-return message includes `automation_id`, treat it as a
disposable wakeup. Delete only that heartbeat and run:

```text
node scripts/visible-dispatch.mjs record-stop --automation-id <automation_id> --write --reason "controller return received"
```

If local state looks wrong, run `audit-automation`. If it reports
`deleteRecommended: true`, delete the heartbeat first, record-stop with the
audit reason, and do not accept or continue the group until total control has
repaired the local state or plan.

Controller-return payloads should be generated by `visible-dispatch.mjs` as a
manual total-control prompt plus a short automation supplement. If a returned
heartbeat still uses the old `VAD controller-return heartbeat` block, treat it
as template drift: follow this skill for safety, then update the script/template
before continuing the automation loop.

The prompt first line should describe the real work, such as
`继续总控验收：<window> 回填。`; do not start the visible prompt with `VAD` or
`Visible Automation Dispatch`.

VAD script JSON should include `scriptComplete: true` and `agentNext`. Treat
`agentNext` as the next control action cue after command execution, not as an
acceptance verdict. If a command output lacks that cue, read the command result
directly and continue by this skill instead of waiting for another script.

Disable mode only for a hard gate or explicit user stop:

```text
node scripts/visible-dispatch.mjs stop-plan --write --reason "<reason>"
node scripts/visible-dispatch.mjs post-run-audit --json
```

`post-run-audit` must pass before reporting a clean shutdown. It checks local
mode / keep-awake, active automation runs, non-terminal queue tasks,
send-eligible current-plan rows, and stale current-status automation text. A
warning about TODO candidates after a complete-pending-archive plan is expected;
do not turn that warning into an automatic TODO claim.

After the plan is accepted and either archived or explicitly kept as closed, a
runtime-only cleanup can be inspected with:

```text
node scripts/visible-dispatch.mjs prune-history --include-current-accepted --json
```

Run the same command with `--write` only when total control has decided the
accepted current-plan dispatch history no longer needs to stay in local VAD
runtime state.
