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
| Record keep-live state | `keep-live-state --status active --host-mode manual-or-external --reason "<reason>" --write --json` | Tracks unattended-run keep-live support under ignored local runtime. This state does not prove delivery or acceptance. |
| Record target result | `submit-result ... --write --json` | Writes a `TargetResultEnvelope`; it is not an acceptance verdict. |
| Check group readiness | `review-results --group <group> --json` | Returns `wait`, `blocked`, or `needs-controller-review`; total control still pulls raw evidence. |
| Build controller return | `build-controller-return --group <group> ... --require-thread --write --json` | Looks up the registered control thread from local runtime state and writes a `ControllerReturnEnvelope` after a target result group is ready. Output never exposes raw thread ids; the delivery adapter reads the ignored registry file for local send execution. |
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

Keep-live / keep-awake is enabled support for unattended automation runs. It is
not a delivery transport, not a target task, and not acceptance evidence; failure
to start or stop it is an automation readiness risk.

A `DeliveryEnvelope` alone is only a mechanical plan. Do not claim that a
delivery was sent unless `record-delivery-run` or equivalent host readback
evidence proves the direct-thread send.

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
