---
name: visible-automation-dispatch-target
description: Use when an ControlWorkspace target Codex window receives a Visible Automation Dispatch heartbeat, participates in unattended automation mode, claims or finishes a visible-dispatch task, creates a permitted next heartbeat, or needs to enforce target-window role boundaries, TestWindow boundaries, record-arm, record-stop, and local thread-id handling.
---

# Visible Automation Dispatch Target

Use only inside a VAD target heartbeat. Workspace `AGENTS.md`, the current control plan, and the target repository `AGENTS.md` remain higher authority.

## Disposable Wakeup Rule

The heartbeat is only a one-time wakeup envelope. If the current heartbeat
message contains `automation_id`, delete only this automation immediately on
receipt, then record the local stop:

```text
node scripts/visible-dispatch.mjs record-stop --automation-id <automation_id> --write --reason "target received"
```

Use the Codex automation tool to delete the app automation first, then run the
record-stop command. Do not audit or over-check the target wakeup before this
delete; reaching the target thread is enough to consume it. If no
`automation_id` is available, continue normally and mention the missing id in
backfill risks.

Deleting the wakeup is not task completion evidence. It only prevents the same
heartbeat from interrupting later. After deletion, continue the real flow:
orient, claim, execute, finish, then handle any permitted next-hop payload.

## Three Steps

1. **Orient**
   - Apply the Disposable Wakeup Rule above immediately when `automation_id` is present; do not wait until finish or final response.
   - Read workspace `AGENTS.md`, workspace index/status, current control plan, this skill, and target repository `AGENTS.md`.
   - State current window identity and repository responsibility.

2. **Claim and execute**
   - From ControlWorkspace root:

```text
node scripts/visible-dispatch.mjs claim --window <current-window> --write --json
```

   - If no task is returned, stop.
   - Do only the claimed task and only within the control plan boundary.
   - Do not touch another window's task, product repo, test project, thread registry, or tracked docs unless this task explicitly authorizes it.
   - If the claimed task package is large, you may decide within the current window / repository boundary to use Codex sub agents for code research, implementation, tests, or docs. Sub agents must not claim other windows' work; the current window owns final review, evidence, and backfill.

3. **Finish and deliver**
   - Backfill completion scope, commands/checks, results, risks, and next-step recommendation:

```text
node scripts/visible-dispatch.mjs finish --window <current-window> --backfill "<evidence>" --write --chain-next --json
```

   - Add `--thread <real-thread-id>` only if known. Never use placeholders. Raw thread ids stay under `.workspace-local/visible-dispatch/`.

## Delivery Permissions

Creating a heartbeat is only courier delivery; it does not grant permission to do another window's work.

Create a next target heartbeat only if finish JSON says:

- `chain.nextAction === "armNext"`
- `chain.handoffPolicy === "target-courier"`
- `chain.payload.courierAllowed === true`

Create a controller-return heartbeat only if finish JSON says:

- `chain.nextAction === "returnToController"`
- `chain.handoffPolicy === "controller-return"`
- `chain.payload.controllerReturnAllowed === true`

After creating any heartbeat with `codex_app.automation_update`, run the matching record command from finish JSON.
Use the finish JSON payload as-is; do not handwrite or preserve an older
controller-return prompt. The controller-return payload should look like the
manual total-control prompt plus a short automation supplement, not the old
`VAD controller-return heartbeat` block.

## Stop Conditions

Stop without creating another heartbeat when finish returns `noReturn`, `modeDisabled`, `registerWindow`, `registerController`, `wait`, `review`, no payload, or no permission flag. `TestWindow` next-hop is total-control-owned unless both the current plan and finish JSON explicitly allow it.

Do not delete the received wakeup again at finish. Finish-time automation work
is limited to permitted next-hop heartbeat creation and the matching record
command printed by finish JSON. If the target did not receive `automation_id`,
do not invent one; report that cleanup gap in backfill risks.

If total control later audits this automation as non-compliant, its deletion
overrides target-window continuation. A target window must not recreate or
work around an automation that total control deleted.
