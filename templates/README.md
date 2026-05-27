# Workspace Templates

This directory stores reusable workspace-level templates for planning,
dispatch, acceptance, and documentation.

Use `.workspace-active/workspace/current/` for active control documents and
`../workspace-ledger/` for archived or long-lived project records. Use this
directory only for stable reusable skeletons that can be copied or adapted into
future plans.

Templates should avoid task-specific status, commit hashes, local absolute
paths, secrets, or one-off decisions.

## Templates

- [test-handoff-template.md](test-handoff-template.md)：总控派发给 `TestWindow` 的测试单模板。
- [goal-stage-confirmation-template.md](goal-stage-confirmation-template.md)：任务级“最终目标 + 分阶段确认”模板。
- [original-plan-template.md](original-plan-template.md)：`DesignWindow` 原始计划书模板；用户确认前不承载执行阶段。
- [phased-migration-command-template.md](phased-migration-command-template.md)：分阶段迁移 / 大型收口指挥短模板；完整迁移经验、扫描命令和反模式见 `skills/dev/control-workspace-governance/references/phased-migration.md`。
- [requirement-design-template.md](requirement-design-template.md)：需求设计文档模板。
- [workspace-signal-template.md](workspace-signal-template.md)：`DesignWindow` 给总控的轻量 bug / TODO / research / decision signal 模板。
- [workspace-handoff-template.md](workspace-handoff-template.md)：`DesignWindow` 给总控的完整需求设计 / 方案交接模板。
- [workspace-control-plan-template.md](workspace-control-plan-template.md)：当前总控计划模板，包含目标判断、任务包、窗口分派、测试边界和 `workspace-sync` 脚本锚点。
- [workspace-task-package-template.md](workspace-task-package-template.md)：总控 wave 派发中的任务包模板，用于把当前阶段主线动作和可关闭 TODO 合并成可验收任务包。
- [starter-workspace/](starter-workspace/)：安装时生成 `.workspace-active/workspace/` 初始活跃账本的模板。
- [window-support/](window-support/)：内部 `DesignWindow` / `TestWindow` 支撑文件模板；外部窗口安装时也从这里同步必要文件。

实际执行文档写入 `.workspace-active/workspace/current/`；完成、归档或长期化后再收束到 `../workspace-ledger/`。模板只作为复制起点，不承载当前状态。
