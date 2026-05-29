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
   - If this is a heartbeat wakeup and it contains `automation_id`, consume only
     that one-shot automation through the Codex automation tool before long
     review. This only clears the wakeup; it is not acceptance evidence.

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
node scripts/codex-automation-loop.mjs register-thread --window <window> --thread-id <realThreadId> --write --json
```

   - For each target, create a dispatch packet:

```text
node scripts/codex-automation-loop.mjs create-dispatch --target-window <window> --task-id <taskId> --group <dispatchGroup> --control-plan <path> --objective "<objective>" --prompt-file <promptFile> --evidence "<required evidence>" --write --json
```

   - Then create a delivery envelope:

```text
node scripts/codex-automation-loop.mjs build-delivery --packet-file <packetFile> --require-thread --stagger-seconds <seconds> --write --json
```

   - The delivery adapter or total-control operator creates the Codex heartbeat
     from the delivery envelope. The script itself does not call Codex
     automation APIs. Delivery command output redacts thread ids by default;
     raw ids stay in ignored local runtime files.

4. **Stop**
   - Stop only for explicit user stop, hard gate, final archive, or no useful
     automation-eligible work:

```text
node scripts/codex-automation-loop.mjs stop-loop --reason "<reason>" --write --json
```

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
