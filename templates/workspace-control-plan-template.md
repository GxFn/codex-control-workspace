# <Workspace Control Plan Title>

日期：YYYY-MM-DD
状态：暂停 / 待启动 / 执行中 / 待验收 / 已完成
发送给：无
总控定位：本文件是 ControlWorkspace 当前总控计划；只承载目标裁决、窗口分派、TODO 归口、测试交接和验收回填，不承载产品实现。

## 目标判断

- 用户目标：
- 最终完成定义：
- 当前是否已经达到：
- 未达到时剩余差距：
- 已达到时验收 / 归档判断：
- 当前任务分区：
- 不纳入本轮事项：

## 总控决策记录

- 本次决策触发：
- 需求 / 测试结果理解：
- 已核对证据：
- 是否需要先验证 / 重新计划 / 用户确认：
- 本次允许更新：
- 本次不得更新：

## Design / 需求来源

- 来源类型：用户直接需求 / DesignWindow handoff / workspace-signal / TODO 提升
- 来源文档：
- 用户确认状态：
- 总控接收结论：
- 是否需要目标阶段确认：
- 是否需要代码实现依赖调研：

## 代码事实与边界

- 相关仓库：
- 关键入口：
- producer / consumer 依赖：
- 不可提前消费的上游：
- 不允许触碰的目录 / 仓库：
- 真实测试项目是否涉及：

## 阶段顺序

1.
2.
3.

- 下一处真实阻塞点：
- 阻塞点之前还能做：
- 当前可派发窗口：
- 当前阻塞 / 观察窗口：

## 任务包

| 任务包 ID | 窗口 | 摘要 | 状态 |
| --- | --- | --- | --- |
| PKG-1 | `Repo` |  | 待启动 |

### PKG-1：<任务包名称>

窗口：`Repo`

派发时间（北京时间，YYYY-MM-DD HH:mm CST）：

状态更新时间（北京时间，YYYY-MM-DD HH:mm CST）：

阶段目标：

-

主线动作：

-

合并 TODO：

- `TODO-ID`：

明确不包含：

-

下一处真实阻塞点：

-

阻塞点之前还能做：

-

验证命令：

```text
<commands>
```

回填要求：

- 完成范围：
- 提交 hash：
- 验证命令和结果：
- 遗留风险：
- 下一步建议：

执行前置硬规则：

- 先读取本 workspace `AGENTS.md`、当前总控文档和目标仓库自己的 `AGENTS.md`。
- 开始执行前先明确声明当前窗口定位、目标仓库职责、本轮任务职责，以及本仓库明确不承担的职责。
- 若任务包较大，可在当前窗口职责和计划边界内自行判断是否开启 Codex 子 agent 分担工作；最终由当前窗口统一复核和回填。

## TODO / Backlog

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TODO-1 | 观察中 |  | P2 | Workspace |  | 否 |  | ControlWorkspace |

## 空闲窗口调度

| 窗口 | 调度 | 是否发送 | 原因 |
| --- | --- | --- | --- |
| `BaseWindow` | 观察 / 无任务 / 主线任务 | 否 |  |
| `CoreWindow` | 观察 / 无任务 / 主线任务 | 否 |  |
| `AgentWindow` | 观察 / 无任务 / 主线任务 | 否 |  |
| `DashboardWindow` | 观察 / 无任务 / 主线任务 | 否 |  |
| `PluginWindow` | 观察 / 无任务 / 主线任务 | 否 |  |
| `TestWindow` | 阻塞 / 待启动 / 无任务 | 否 |  |

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| `BaseWindow`<br>无任务 |  |
| `CoreWindow`<br>无任务 |  |
| `AgentWindow`<br>无任务 |  |
| `DashboardWindow`<br>无任务 |  |
| `PluginWindow`<br>无任务 |  |
| `TestWindow`<br>无任务 |  |
| `RealTestProject`<br>无任务 | 不改真实项目源码。 |

## 可复制提示词

发送给：无

```text
先读取 AGENTS.md、docs/workspace/index.md、docs/workspace/current/<当前总控文档名>.md，以及你所在窗口/目标仓库的 AGENTS.md。

先明确声明当前窗口定位和本轮仓库职责。

再按照文档领取并完成分配给你所在窗口的任务。

完成后回填：完成范围、提交 hash、验证命令、验证结果、遗留风险和下一步建议。
```

## 测试交接

- 是否需要 `TestWindow`：
- 总控自测结论：
- 需要真实场景的理由：
- 测试前边界与多条件判断：
  - 测试要回答的问题：
  - 测试对象 / 目标窗口 / 线程 / 项目边界：
  - 成功能推出的结论：
  - 失败能推出的结论：
  - 不能推出的结论：
  - 停止或不开始条件：
- 测试单：
- 测试交流入口：[alembic-test-exchange.md](alembic-test-exchange.md)
- 真实项目保护说明：

## 回填区

- YYYY-MM-DD HH:mm CST：

<!-- workspace-sync
{
  "status": "<当前计划状态>",
  "indexPlanDescription": "<写入 docs/workspace/index.md 当前计划行的说明>",
  "indexStatusDescription": "<写入 docs/workspace/index.md 当前状态行的说明>",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "<写入 docs/workspace/current/index.md 的说明>",
  "currentStatusSummary": "<写入 docs/workspace/current/workspace-current-status.md 状态摘要的主线说明>",
  "indexRows": [],
  "currentIndexRows": []
}
-->
