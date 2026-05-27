# TestWindow Agent Instructions

本目录是 ControlWorkspace 内置的测试协调窗口入口。若用户配置了外部 `TestWindow` 仓库，外部仓库自己的 `AGENTS.md` 和本 workspace 写入的 scope 管理块优先生效；本文件用于没有外部测试仓库时承接旧 TestWindow 的真实场景验证边界。

**重要**：本目录不是产品源码仓库，也不是用户真实业务项目。它只保留测试单、测试策略、验证证据链接、复现说明和必要的测试辅助资产。

## Visible Automation Dispatch

- 如果本窗口通过 ControlWorkspace 的 Visible Automation Dispatch heartbeat 唤醒，先读取 workspace `AGENTS.md`、当前总控文档、`skills/dev/visible-automation-dispatch-target/SKILL.md` 和本文件。
- 只允许 claim / finish `TestWindow` 目标任务；不得代领、处理、验证或总结其它窗口任务。
- VAD smoke 中的 `TestWindow` 可以只是非测试型可见窗口目标；除非当前总控文档或测试单明确要求真实测试，否则不得运行真实项目测试、cold-start、Dashboard 手动观察或回归验证。
- 下一跳 heartbeat 只是投递信封；只有 finish JSON 明确 `handoffPolicy=target-courier` 且 `courierAllowed=true` 时，才可按 payload 创建下一条 automation 并 record-arm。不得 claim / finish 下一窗口任务。

## 窗口定位

- `TestWindow` 是 ControlWorkspace 的独立测试验证窗口，用来承接总控分配的复现、冒烟、回归、冷启动监控、跨仓库集成验证和证据整理。
- 本窗口不是 Base/Core/Agent/Dashboard/Plugin/ControlWorkspace 或 RealTestProject 的替代开发窗口。
- 如果验证任务需要修改源代码，应把问题、证据、建议修复仓库和最小复现路径回填给总控，由总控分派到对应产品窗口。

## 测试边界

- 可以做：复现步骤整理、命令封装、日志观察、API 状态检查、Dashboard 行为记录、冷启动 / 重建流程监控、跨仓库 smoke、测试数据说明和验证报告。
- 不要做：在本目录实现产品 runtime、UI、Plugin、Core API、总控功能或真实测试项目产品功能。
- 不要做：为了让测试通过而改动真实业务项目结构、删除用户数据、隐藏失败日志、绕过质量门禁、伪造候选或把未验证命令写成通过。
- 不要做：长期依赖本目录里的 mock 替代真实调用链。测试可以有 fixture，但最终结论必须回到真实入口、真实数据、真实状态变化和真实消费方。

## 需要测试时

- 先读取当前总控文档、目标仓库 `AGENTS.md`、相关脚本说明和真实入口，再执行测试。
- 测试前必须写清“验证什么闭环”：入口、触发动作、真实数据、状态变化、消费方、失败路径和完成标准。
- 测试结论必须基于真实命令、真实 API、真实日志、真实 UI 状态或真实文件证据；不要只凭推断判断通过。
- 如果命令无法运行，记录原因、环境限制和下一步建议，不能把未运行命令写成通过。

## 文件存放约定

- 本窗口规则：`AGENTS.md`。
- 长期测试策略：`docs/testing-operation-policy.md`。
- 测试单模板：`templates/test-handoff-template.md`。
- 长期验证报告、复现记录和监控记录：本窗口 `docs/`。
- 跨仓库当前测试交流入口：`../current/test-exchange.md`。
- 临时输出、日志截取和本地缓存：`tmp/`，默认不进入 git。
