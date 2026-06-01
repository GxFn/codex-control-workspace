# Codex Automation Closed Loop

This reference describes the automation path for ControlWorkspace. It is the
only supported closed-loop automation contract surface.

Child-window file configuration, thread registry schema, delivery-run evidence,
and keep-live state are defined in
[direct-thread-window-config.md](direct-thread-window-config.md).

## Layering

| Layer | Owns | Must not own |
| --- | --- | --- |
| Controller planning | User goal, current plan, task package, target list, dispatch packet content. | Codex thread-send API details, child-window execution, acceptance without evidence. |
| Delivery adapter | Direct thread send, local delivery log, busy policy, stagger. | Current-plan parsing, prompt authorship, task acceptance, TODO selection, legacy automation transport. |
| Target execution | Assigned task execution inside one window/repo, evidence collection, result envelope. | Other windows' work, next-wave planning, controller acceptance. |
| Controller review | Result aggregation, raw evidence pull, accept/rework/block/next-wave decision. | Blind trust in result envelopes or script statuses. |

## Commands

Use `node scripts/codex-automation-loop.mjs` from the control workspace root.

| Scenario | Command | Meaning |
| --- | --- | --- |
| Inspect local loop state | `status --json` | Counts local dispatch packets, delivery envelopes, and target results. |
| Register target thread | `register-thread --window <window> --thread-id <id> --write --json` | Stores a real Codex thread id under ignored local runtime. JSON output redacts the id. |
| Build child-window file config | `build-window-config --window <window> --require-thread --write --json` | Writes a local `CodexSubwindowDispatchConfig` with dispatchability, role, registry file reference, busy policy, return route, and automation keep-live requirements. It never exposes raw thread ids. |
| Create a controller dispatch packet | `create-dispatch ... --write --json` | Writes a `ControllerDispatchPacket`; total control has already decided the task. By default the script generates a compact multi-line target prompt. |
| Create a delivery envelope | `build-delivery --packet-file <packetFile> --require-thread --write --json` | Writes a `DeliveryEnvelope`; the delivery adapter must use direct thread dispatch. If a real thread id or host send capability is unavailable, fail closed for total-control judgment. |
| Record delivery evidence | `record-delivery-run --delivery-file <deliveryFile> --status sent --readback-ok true --evidence "<evidence>" --write --json` | Records the local host send/readback result for a delivery envelope. This is transport evidence only, not task acceptance. |
| Start keep-live watcher | `start-keep-live --automation-run-id <id> --write --json` | Starts a local macOS watcher for unattended-run keep-live support and records state/control files under ignored runtime. This is readiness support only, not delivery or acceptance. |
| Stop keep-live watcher | `stop-keep-live --automation-run-id <id> --reason "<reason>" --write --json` | Stops the local watcher through its control marker and records whether worker / child processes exited. |
| Record external keep-live state | `keep-live-state --automation-run-id <id> --status running --mechanism macos-caffeinate --pid <pid> --write --json` | Compatibility command for manually proven or external keep-live evidence. Prefer `start-keep-live` for local unattended automation. |
| Record target result | `submit-result ... --write --json` | Writes a `TargetResultEnvelope`; it is not an acceptance verdict. |
| Check group readiness | `review-results --group <group> --json` | Returns `wait`, `blocked`, or `needs-controller-review`; total control still pulls raw evidence. It also reports `controllerReturnDelivery.status` so pending controller-return files without send/readback evidence are visible. |
| Build controller return | `build-controller-return --group <group> ... --return-reason result-ready --require-thread --write --json` | Looks up the registered control thread from local runtime state and writes a pending `ControllerReturnEnvelope` after a target result group is ready. Output never exposes raw thread ids; the delivery adapter reads the ignored registry file for local send execution. This is not a completed callback until `record-delivery-run` records `status=sent` and `readback.ok=true`. |
| Stop future delivery | `stop-loop --reason "<reason>" --write --json` | Writes an explicit local stop marker. |

## Delivery Transport Policy

The accepted direction for `CODEX-DIRECT-THREAD-DISPATCH-2026-05-31` is:

- default target fan-out and controller return: direct Codex thread delivery only;
- idle target thread: send a new turn / follow-up and verify thread readback;
- busy steerable thread: append follow-up to the in-progress turn; do not interrupt by default;
- busy not-steerable or missing real thread id: fail closed and return to total-control judgment;
- delivery success: transport evidence only, never task acceptance.

Direct thread dispatch is the normal work pipeline, whether the developer is
present or the run is unattended. When unattended automation is explicitly
enabled, the loop is continuous: controller review, evidence pull, acceptance
or rework decision, next task package, direct dispatch, and controller return
repeat until final completion, a hard gate, explicit user stop, missing
evidence requiring human judgment, or no eligible TODO remains.

Controller dispatch has a completion boundary. After the direct-thread send is
read back and recorded with `record-delivery-run`, total control has finished
that dispatch and should release itself for other workspace traffic. It should
not keep a heartbeat, self-wakeup, reminder, or synthetic working state merely
to stay attached to the dispatched task. The next touchpoint is the target
window's `TargetResultEnvelope` plus one controller-return when the group is
ready.

Controller return is a wakeup for total-control review, not an instruction to
keep looping. A controller-return envelope carries `loopGuard`: total control
may create the next dispatch only when the current plan still has an eligible
unfinished task, target evidence requires rework dispatch, or an approved
unattended run remains inside boundary. If no task remains, the correct action
is to stop without another delivery.

Creating a controller-return envelope is only the local return plan. The target
window must still use the host thread-send capability to send the envelope
prompt to the registered controller thread, read back the controller thread,
and record a delivery run. If host send or readback is unavailable, the target
records or reports a blocked / failed delivery and stops. `review-results`
must show `controllerReturnDelivery.status="sent"` before anyone treats the
return as a real callback.

Keep-live / keep-awake is enabled support for unattended automation runs. It is
not a delivery transport, not a target task, and not acceptance evidence; failure
to start or stop it is an automation readiness risk. Keep-live must not be used
as a controller heartbeat or as a reason to block total control from handling
other concurrent tasks.

The current script contract owns local macOS keep-live through
`start-keep-live` / `stop-keep-live`. The watcher starts `caffeinate` by
default, writes `keep-live/state.json` and `keep-live/control.json`, and stops
through a local stop marker so shutdown does not depend on fragile
cross-command process ownership. A run may claim keep-live only when the command
reports an active watcher. Otherwise mark keep-live as a readiness risk and
continue using target callback as the automation return path.

A `DeliveryEnvelope` alone is only a mechanical plan. Do not claim that a
delivery was sent unless `record-delivery-run` or equivalent host readback
evidence proves the direct-thread send.

A `ControllerReturnEnvelope` follows the same rule. It is `pending-host-send`
until a matching `DirectThreadDeliveryRun` has `status="sent"` and
`readback.ok=true`.

## Prompt Rules

- Prompt first line must describe the real task: `继续当前窗口任务：...` or
  `继续总控验收：...`.
- Prompt body carries dynamic values and rule names only.
- Target dispatch prompts default to the script-generated multi-line `变量：`
  block. Do not hand-pack `currentWindow/taskId/controlPlan/dispatchGroup` into
  one long sentence.
- `不创建下一跳` means no target-window next hop. It does not mean no
  controller return. The only allowed return is a controller-return envelope
  after `review-results` shows the group is no longer waiting.
- Command manuals, validation details, and troubleshooting belong in skills or
  the current control plan.
- The visible prompt lead must describe the real task, not an automation
  mechanism name.

## Result Review

`review-results` only answers whether the result envelopes exist and whether any
target reported a block. It never accepts the task.

Total control must still inspect:

- commits or no-commit reason;
- relevant diffs;
- command output;
- runtime JSON / logs / report paths / screenshots where applicable;
- current TODO / Backlog impact.

## Removed Previous Protocol

The previous `claim / finish / chain-next` protocol is retired. Do not mix it
with dispatch packets in one active loop, and do not reintroduce compatibility
aliases unless a future user explicitly approves a migration bridge.
