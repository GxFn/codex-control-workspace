# Control Workspace Index

This file is the single workspace entrypoint. Current status, active TODO, test exchange, and active control plans live in `docs/workspace/current/`. Completed plans should move to `docs/workspace/archive/`.

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/example-control-plan.md](current/example-control-plan.md) | draft | Example control plan for a freshly extracted control workspace. |
| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | draft | Fresh template status. |
| Global TODO Board | [current/global-todo-board.md](current/global-todo-board.md) | maintained | Cross-plan TODO ledger. |
| Design Handoff Board | [current/design-handoff-board.md](current/design-handoff-board.md) | maintained | Internal DesignWindow handoff board when no external design repository is configured. |
| Test Exchange | [current/test-exchange.md](current/test-exchange.md) | maintained | Real-scenario validation handoff and evidence ledger. |
| Workspace Record Map | [workspace-record-map.md](workspace-record-map.md) | maintained | Long-term archive and evidence map. |
| 当前短期工作区 | [current/](current/) | maintained | Current status, active TODO, test exchange, and current plans. |
| Script Index | [../../scripts/README.md](../../scripts/README.md) | maintained | Mechanical script entrypoint. |
| Skill Index | [../../skills/README.md](../../skills/README.md) | maintained | Skill assets. |

## Current Dispatch Surface

Keep active dispatch rows in the current plan. This index should remain small.

## 窗口覆盖状态

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

## 状态枚举

- `待启动`: ready to dispatch.
- `执行中`: currently being handled by the named window.
- `已 arm`: heartbeat payload has been armed.
- `待验收`: waiting for total-control review.
- `阻塞`: blocked by evidence, thread id, dependency, or user confirmation.
- `观察中`: visible but not currently sendable.
- `无任务`: no current work.
- `已完成`: accepted and closed.
- `暂停`: paused until user or evidence changes.
