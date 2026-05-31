---
name: codex-automation-target
description: Use when a target Codex window receives a Codex Automation Closed Loop direct-thread delivery, executes only its assigned dispatch packet, reports a TargetResultEnvelope, or enforces target-window boundaries without claim / finish / chain-next state.
---

# Codex Automation Target

Use this skill only inside a target-window automation wakeup. Workspace
`AGENTS.md`, the current control plan, and the target repository `AGENTS.md`
remain higher authority.

## Prompt Shape

Target wakeups should be task-first and compact:

```text
继续当前窗口任务：<currentWindow> / <taskId>。

变量：
- currentWindow: <window>
- taskId: <taskId>
- controlPlan: <path>
- dispatchGroup: <group>
- rules: 用完即弃；只执行本窗口任务；返回 TargetResultEnvelope；不创建子窗口下一跳；结果齐件且 returnRoute=controller 时只创建总控回跳。
```

Do not require the prompt to repeat command manuals. Derive commands from the
variables and this skill. If the variables conflict with the target repository
or current plan, stop and report instead of guessing.

## Target Flow

1. **Consume delivery**
   - Direct thread delivery is the only supported target wakeup contract.
     Treat it as prompt delivery, not as task completion evidence.
   - If no real thread id or host thread-send capability is available, stop and
     report the delivery block to total control instead of creating another
     transport route.

2. **Orient**
   - Read workspace `AGENTS.md`, workspace index/status, the current control
     plan, this skill, and the target repository `AGENTS.md`.
   - State current window identity and repository responsibility.
   - Do not use legacy `claim` to discover work. The dispatch packet / prompt
     is the assigned work boundary.

3. **Execute**
   - Do only the assigned task inside this window / repository boundary.
   - You may use Codex sub agents inside this same repository boundary for
     large task packages, but this window owns final review and evidence.
   - Do not handle another window's work, `TestWindow` work, total-control
     acceptance, or next-wave planning.

4. **Report result envelope**
   - From the control workspace root, record the result:

```text
node scripts/codex-automation-loop.mjs submit-result --target-window <currentWindow> --task-id <taskId> --group <dispatchGroup> --status completed --changed-repo <repo> --commit <hash> --evidence-ref <file-or-log> --verification "<command and result>" --risk "<risk>" --write --json
```

   - Use `--status blocked` for a real blocker and include `--risk` /
     `--next-suggestion`.
   - Use `--status needs-review` when work is partial or the total-control
     boundary needs a decision.

5. **Return to controller when ready**
   - Do not create another target-window hop.
   - If the delivery return route is `controller`, run:

```text
node scripts/codex-automation-loop.mjs review-results --group <dispatchGroup> --json
```

   - If the decision is `wait`, stop; another target has not reported yet.
   - If the decision is `blocked` or `needs-controller-review`, build only a
     controller-return envelope:

```text
node scripts/codex-automation-loop.mjs build-controller-return --group <dispatchGroup> --last-completed-target <currentWindow> --last-task-id <taskId> --control-plan <controlPlan> --require-thread --write --json
```

   - Use the controller-return direct thread delivery path defined by the
     current control plan. This is the allowed total-control return, not a next
     target hop. The delivery adapter records send/readback evidence with
     `record-delivery-run`; target result text must not contain raw thread ids.

## Boundaries

- A `TargetResultEnvelope` is a report, not acceptance.
- Target windows do not create target-window next-hop deliveries by default.
  Controller return is allowed only through `build-controller-return` after
  `review-results` says the group is ready for total-control review.
- `TestWindow` is total-control-owned unless the current plan and delivery
  envelope explicitly authorize an exception.
- Raw thread ids stay only in local runtime files, never in tracked docs,
  prompts, GitHub, or result text. Thread ids exposed for local direct-send
  execution must not be copied into result envelopes.
- `claim / finish / chain-next` commands are not part of this flow.
