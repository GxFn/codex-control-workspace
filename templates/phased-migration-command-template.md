# 分阶段迁移指挥模板

定位：长期模板
更新日期：2026-05-26
总控窗口：ControlWorkspace
状态：长期模板

本模板用于跨仓库迁移、抽取、收敛、删除和发布封口。使用前先读取 `AGENTS.md` 和 `skills/dev/control-workspace-governance/references/phased-migration.md`；本文只保留可复制骨架，迁移经验、扫描命令和反模式不在模板中重复。

## 总控计划骨架

````markdown
# <Topic> 分阶段迁移总控计划

日期：YYYY-MM-DD
状态：暂停 / 待启动 / 执行中 / 待验收 / 已完成
发送给：无
总控定位：本文件是 ControlWorkspace 当前总控计划；只承载迁移目标、阶段边界、窗口分派、TODO 归口、测试交接和验收回填，不承载产品实现。

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

## 当前真实扫描基线

### 工作区状态

```text
git status --short
git log --oneline -8
```

### 入口 / 调用 / 发布扫描

```text
<commands and summarized results>
```

### 五类边界

- 进入目标仓库：
- 留在源仓库：
- 留在 host / adapter：
- 删除候选：
- 不得删除：

### 阶段拆分依据

- 代码事实：
- producer / consumer 依赖：
- 不可提前消费的上游：
- 发布 / live 风险：

## 分阶段计划

| Phase | 目标 | 入口条件 | 允许范围 | 禁止事项 | 验证方式 | 下一波触发 |
| --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | 基线盘点 |  |  |  |  |  |
| Phase 1 | target public surface / contract |  |  |  |  |  |
| Phase 2 | outer consumption replacement |  |  |  |  |  |
| Phase 3 | delete candidate cleanup |  |  |  |  |  |
| Phase 4 | release / live seal |  |  |  |  |  |

## 当前任务包

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
| `DesignWindow` | 无任务 / 观察 / 需求设计 | 否 | 只有需要需求讨论、signal 判断或 handoff 草案时才发送。 |
| `TestWindow` | 阻塞 / 待启动 / 无任务 | 否 |  |
| `RealTestProject` | 无任务 / 观察 | 否 | 真实项目只作为受保护测试目标，不直接派发。 |

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| `BaseWindow`<br>无任务 |  |
| `CoreWindow`<br>无任务 |  |
| `AgentWindow`<br>无任务 |  |
| `DashboardWindow`<br>无任务 |  |
| `PluginWindow`<br>无任务 |  |
| `DesignWindow`<br>无任务 |  |
| `TestWindow`<br>无任务 |  |
| `RealTestProject`<br>无任务 | 不改真实项目源码。 |

## 可复制提示词

发送给：无

```text
继续当前总控任务：<计划 / wave 名>。

先读：AGENTS.md、.workspace-active/workspace/index.md、.workspace-active/workspace/current/<当前总控文档名>.md，以及本窗口/目标仓库 AGENTS.md。

定位：声明当前窗口和本轮仓库职责。

领取：按当前计划领取分配给本窗口的任务。

完成后按当前计划回填证据、边界、风险和下一步建议。
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
- 测试交流入口：[test-exchange.md](test-exchange.md)

## 回填区

- YYYY-MM-DD HH:mm CST：

<!-- workspace-sync
{
  "status": "<当前计划状态>",
  "indexPlanDescription": "<写入 .workspace-active/workspace/index.md 当前计划行的说明>",
  "indexStatusDescription": "<写入 .workspace-active/workspace/index.md 当前状态行的说明>",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "<写入 .workspace-active/workspace/current/index.md 的说明>",
  "currentStatusSummary": "<写入 .workspace-active/workspace/current/workspace-current-status.md 状态摘要的主线说明>",
  "indexRows": [],
  "currentIndexRows": []
}
-->
````

## 单仓库执行记录骨架

````markdown
# <Topic> <Repo> Phase N

日期：YYYY-MM-DD
窗口：`Repo`
状态：执行中 / 待验收 / 已完成 / 阻塞

## 领取任务

- 当前窗口定位：
- 本仓库职责：
- 本仓库不承担：
- 对应总控任务包：

## 执行前扫描

```text
<commands and results>
```

## 实现记录

- 完成范围：
- 修改文件：
- 真实调用链：
- 兼容 / 删除边界：

## 验证记录

```text
<commands and results>
```

## 提交

- 提交 hash：
- 未提交原因（如无）：

## 遗留风险

-

## 回填给总控

- 完成范围：
- 验证命令和结果：
- 遗留风险：
- 下一步建议：
````

## 验收 / 下一波骨架

````markdown
# <Topic> Wave N Acceptance And Next Plan

日期：YYYY-MM-DD
总控窗口：ControlWorkspace
状态：待验收 / 已完成 / 下一波待启动

## 本轮验收结论

- 窗口自述：
- 原始证据：
- 总控独立裁决：
- 是否达到当前阶段目标：
- 未达成差距：

## 验收命令

```text
<commands and results>
```

## 边界复核

- 已切换：
- 仍保留：
- 删除候选：
- 不得删除：

## 下一波分派表

| 窗口 / 状态 | 任务 |
| --- | --- |
| `Repo`<br>待启动 |  |

## 总控决策

- 是否继续：
- 是否归档：
- 是否需要用户确认：
````
