---
name: codex-automation-target
description: Use when a target Codex window receives a Codex Automation Closed Loop delivery heartbeat, executes only its assigned dispatch packet, reports a TargetResultEnvelope, handles one-shot wakeup cleanup, or enforces target-window boundaries without claim / finish / chain-next state.
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
- rules: 用完即弃；只执行本窗口任务；返回 TargetResultEnvelope；不创建下一跳。
```

Do not require the prompt to repeat command manuals. Derive commands from the
variables and this skill. If the variables conflict with the target repository
or current plan, stop and report instead of guessing.

## Target Flow

1. **Consume wakeup**
   - If the heartbeat includes `automation_id`, delete only that one-shot
     automation through the Codex automation tool before long work. Deleting the
     wakeup is not task completion evidence; it only prevents repeated
     interruption.

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

## Boundaries

- A `TargetResultEnvelope` is a report, not acceptance.
- Target windows do not create next-hop heartbeats by default.
- `TestWindow` is total-control-owned unless the current plan and delivery
  envelope explicitly authorize an exception.
- Raw thread ids stay only in local runtime files, never in tracked docs,
  prompts, GitHub, or result text.
- `claim / finish / chain-next` commands are not part of this flow.
