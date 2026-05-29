# Codex Automation Closed Loop

This reference describes the automation path for ControlWorkspace. It is the
only supported closed-loop automation contract surface.

## Layering

| Layer | Owns | Must not own |
| --- | --- | --- |
| Controller planning | User goal, current plan, task package, target list, dispatch packet content. | Codex heartbeat API details, child-window execution, acceptance without evidence. |
| Delivery adapter | One-shot heartbeat creation, keep-live support, local delivery log, stagger. | Current-plan parsing, prompt authorship, task acceptance, TODO selection. |
| Target execution | Assigned task execution inside one window/repo, evidence collection, result envelope. | Other windows' work, next-wave planning, controller acceptance. |
| Controller review | Result aggregation, raw evidence pull, accept/rework/block/next-wave decision. | Blind trust in result envelopes or script statuses. |

## Commands

Use `node scripts/codex-automation-loop.mjs` from the control workspace root.

| Scenario | Command | Meaning |
| --- | --- | --- |
| Inspect local loop state | `status --json` | Counts local dispatch packets, delivery envelopes, and target results. |
| Register target thread | `register-thread --window <window> --thread-id <id> --write --json` | Stores a real Codex thread id under ignored local runtime. JSON output redacts the id. |
| Create a controller dispatch packet | `create-dispatch ... --write --json` | Writes a `ControllerDispatchPacket`; total control has already decided the task and prompt. |
| Create a delivery envelope | `build-delivery --packet-file <packetFile> --require-thread --write --json` | Writes a `DeliveryEnvelope`; a delivery adapter may create a Codex heartbeat from it. |
| Record target result | `submit-result ... --write --json` | Writes a `TargetResultEnvelope`; it is not an acceptance verdict. |
| Check group readiness | `review-results --group <group> --json` | Returns `wait`, `blocked`, or `needs-controller-review`; total control still pulls raw evidence. |
| Stop future delivery | `stop-loop --reason "<reason>" --write --json` | Writes an explicit local stop marker. |

## Prompt Rules

- Prompt first line must describe the real task: `继续当前窗口任务：...` or
  `继续总控验收：...`.
- Prompt body carries dynamic values and rule names only.
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
