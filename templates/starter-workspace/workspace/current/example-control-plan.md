# Example Control Plan

日期：2026-05-27
状态：draft
发送给：无
总控定位：This file is the current control plan. Replace it with a real plan before dispatching windows.

## 目标判断

- 用户目标：initialize a control workspace.
- 最终完成定义：current plan, TODO board, dispatch table, and validation scripts are in place.
- 当前是否已经达到：draft.
- 未达到时剩余差距：replace example content with a real project plan.
- 已达到时验收 / 归档判断：not reached.
- 当前任务分区：workspace setup.
- 不纳入本轮事项：product implementation.

## 总控决策记录

- 本次决策触发：template initialization.
- 需求 / 测试结果理解：no product work is active.
- 已核对证据：repository files only.
- 是否需要先验证 / 重新计划 / 用户确认：user confirmation required before real dispatch.
- 本次允许更新：workspace template files.
- 本次不得更新：product repositories and protected real projects.

## 任务包

| 任务包 ID | 窗口 | 阶段 / 目标 | 主线 | TODO | 阻塞 / 依赖 | 验证 | 回填 | 明确不包含 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXAMPLE-P1 | `ControlWorkspace` | Replace template content with real project settings. | Update config and plan skeleton. | TODO-EXAMPLE-001 | User must define real repositories before dispatch. | `node scripts/verify-control-center.mjs --require-task-packages --with-script-tests` | Record changed files and validation result. | Product implementation. | draft |

下一处真实阻塞点：没有真实项目参数，不能派发子窗口。

阻塞点之前还能做：保留 template skeleton 并运行脚本验证。

执行前置硬规则：

- 先读取本 workspace `AGENTS.md`、当前总控文档和目标仓库自己的 `AGENTS.md`。
- 开始执行前先明确声明当前窗口定位、目标仓库职责、本轮任务职责，以及本仓库明确不承担的职责。

## TODO / Backlog

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO-EXAMPLE-001 | parked | template | P3 | ControlWorkspace | Replace example TODO. | no | none | ControlWorkspace |

## 空闲窗口调度

| 窗口 | 调度 | 是否发送 | 原因 |
| --- | --- | --- | --- |
| `BaseWindow` | 无任务 | 否 | Template only. |
| `CoreWindow` | 无任务 | 否 | Template only. |
| `AgentWindow` | 无任务 | 否 | Template only. |
| `DashboardWindow` | 无任务 | 否 | Template only. |
| `PluginWindow` | 无任务 | 否 | Template only. |
| `DesignWindow` | 无任务 | 否 | Template setup only; use DesignWindow when a real requirement design task exists. |
| `TestWindow` | 无任务 | 否 | Template only. |
| `RealTestProject` | 无任务 | 否 | Protected project. |

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| `BaseWindow`<br>无任务 | Not sent. |
| `CoreWindow`<br>无任务 | Not sent. |
| `AgentWindow`<br>无任务 | Not sent. |
| `DashboardWindow`<br>无任务 | Not sent. |
| `PluginWindow`<br>无任务 | Not sent. |
| `DesignWindow`<br>无任务 | Not sent. |
| `TestWindow`<br>无任务 | Not sent. |
| `RealTestProject`<br>无任务 | Not sent. |

## 可复制提示词

发送给：无

```text
No dispatch prompt until a real plan is created.
```

## 测试交接

- Need TestWindow: no.
- Control self-test conclusion: script checks are enough for template setup.
- Real-scenario reason: none.
- Test boundary judgment:
  - Question: does the template validate?
  - Object boundary: this repository only.
  - Success means: template mechanics are ready.
  - Failure means: template files or scripts need repair.
  - Does not prove: any product behavior.
  - Stop condition: missing project-specific target.
- Test card: none.
- Test exchange: [test-exchange.md](test-exchange.md)

## 回填区

- 2026-05-27: Example plan created.

<!-- workspace-sync
{
  "status": "draft",
  "indexPlanDescription": "Example control plan for a freshly extracted control workspace.",
  "indexStatusDescription": "Fresh template status.",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "Example control plan.",
  "currentStatusSummary": "Freshly extracted control workspace template; replace this with a real plan before dispatch.",
  "indexRows": [
    {
      "type": "Design Handoff Board",
      "doc": ".workspace-active/workspace/current/design-handoff-board.md",
      "status": "maintained",
      "description": "Internal DesignWindow handoff board when no external design repository is configured.",
      "insertAfter": "Global TODO Board"
    }
  ],
  "currentIndexRows": [
    {
      "type": "Design Handoff Board",
      "doc": ".workspace-active/workspace/current/design-handoff-board.md",
      "description": "Internal DesignWindow handoff board.",
      "insertAfter": "Global TODO"
    }
  ]
}
-->
