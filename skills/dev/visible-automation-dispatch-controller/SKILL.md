---
name: visible-automation-dispatch-controller
description: Use when ControlWorkspace total control is awakened by a Visible Automation Dispatch controller-return heartbeat, runs unattended automation-goal mode, reviews a completed dispatch group, decides acceptance / rejection / self-test / TestWindow handoff / next wave / next TODO, or must avoid small-task drift while continuing toward the user-approved final goal.
---

# Visible Automation Dispatch Controller

Total-control-only skill for VAD controller-return heartbeats. `AGENTS.md` owns hard judgment; this skill owns the operating steps.

## Intent

VAD unattended mode means: keep moving the user-approved final goal until it is complete, then optionally review the next automation-eligible TODO. A stage boundary, plan refresh, or "show Stage N plan" note is not a stop by itself when the next work stays inside the approved goal and completion definition.

Automation is only delivery. Scripts report state and print payloads; total control still accepts evidence, chooses scope, writes/refines plans, and decides whether to continue.

## Three Steps

1. **Review evidence**
   - Read `AGENTS.md`, workspace index/status, current control plan, and this skill.
   - Run `group-status --group <id> --json` and `controller-tick --compact --json` for orientation; use full `controller-tick --json` when task-level queue evidence is needed.
   - If the heartbeat message includes `automation_id`, run `audit-automation --automation-id <automation_id> --role controller-return --group <id> --json` before trusting the return; after a compliant audit, delete this wakeup automation and run `record-stop` before long evidence review.
   - Separate target self-report, raw evidence, and total-control verdict.
   - Accept/reject/block completed tasks only after evidence answers the assigned boundary.

2. **Decide the next unit**
   - If evidence is insufficient, re-dispatch or request补证 for the owning window.
   - If a directly checkable issue exists, self-test or inspect here before involving `TestWindow`.
   - If the active goal is still incomplete and the next step is in scope, create/refresh the next executable control plan and task packages.
   - If the active goal is complete, archive/close it before reviewing the next automation-eligible TODO. A `complete-pending-archive` plan is a stop-for-archive / confirmation point, not a TODO auto-claim point.

3. **Dispatch or stop**
   - For dispatch: `preflight --from-plan --json`, `enqueue --from-plan --group <id> --return-policy controller-last --write`, `arm-batch --group <id> --json`, create each returned heartbeat in `createOrder` order, wait `waitBeforeCreateSeconds` before each create after the first, then run each record command.
   - For stop: disable mode only when a hard gate below is hit, no useful next unit exists, or the user explicitly asks to stop. After disable or final archive, run `post-run-audit --json` before claiming the automation run is clean.

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

## Preflight Commands

```text
node scripts/visible-dispatch.mjs group-status --group <dispatchGroupId> --json
node scripts/visible-dispatch.mjs controller-tick --compact --json
node scripts/visible-dispatch.mjs preflight --from-plan --json
node scripts/visible-dispatch.mjs preflight --group <dispatchGroupId> --json
node scripts/visible-dispatch.mjs arm-batch --group <dispatchGroupId> --json
```

Preflight verifies local-only registry entries against actual Codex session files. If it fails, fix registration; do not arm payloads.

`arm-batch` defaults to a small create-time stagger. The first heartbeat can be
created immediately; for each later payload, wait its `waitBeforeCreateSeconds`
before calling `codex_app.automation_update`. Use `--stagger-seconds <n>` for a
different interval or `--no-stagger` only when intentionally testing
back-to-back scheduling. Keep the default stagger unless there is a specific
test reason to change it; it is the current field-tested guard against creating
several minute-based heartbeats in the exact same instant.

## Heartbeat Cleanup

If the controller-return message includes `automation_id`, treat it as a
disposable wakeup. After the local compliance audit passes, delete only that
heartbeat and run:

```text
node scripts/visible-dispatch.mjs record-stop --automation-id <automation_id> --write --reason "controller return received"
```

If `audit-automation` reports `deleteRecommended: true`, delete the heartbeat
first, record-stop with the audit reason, and do not accept or continue the
group until total control has repaired the local state or plan.

Controller-return payloads should be generated by `visible-dispatch.mjs` as a
manual total-control prompt plus a short automation supplement. If a returned
heartbeat still uses the old `VAD controller-return heartbeat` block, treat it
as template drift: follow this skill for safety, then update the script/template
before continuing the automation loop.

Disable mode only for a hard gate or explicit user stop:

```text
node scripts/visible-dispatch.mjs mode --disable --write
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
