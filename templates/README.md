# Workspace Templates

This directory stores reusable workspace-level templates for planning,
dispatch, acceptance, and documentation.

Use `docs/workspace/` for actual control documents. Use this directory only for
stable reusable skeletons that can be copied or adapted into future plans.

Templates should avoid task-specific status, commit hashes, local absolute
paths, secrets, or one-off decisions.

## Templates

- [test-handoff-template.md](test-handoff-template.md)：总控派发给 `TestWindow` 的测试单模板。
- [goal-stage-confirmation-template.md](goal-stage-confirmation-template.md)：任务级“最终目标 + 分阶段确认”模板。
- [phased-migration-command-template.md](phased-migration-command-template.md)：分阶段迁移 / 大型收口指挥短模板；完整迁移经验、扫描命令和反模式见 `skills/dev/control-workspace-governance/references/phased-migration.md`。
- [requirement-design-template.md](requirement-design-template.md)：需求设计文档模板。
- [workspace-control-plan-template.md](workspace-control-plan-template.md)：当前总控计划模板，包含目标判断、任务包、窗口分派、测试边界和 `workspace-sync` 脚本锚点。
- [workspace-task-package-template.md](workspace-task-package-template.md)：总控 wave 派发中的任务包模板，用于把当前阶段主线动作和可关闭 TODO 合并成可验收任务包。

实际执行文档仍写入 `docs/workspace/` 或对应需求目录；模板只作为复制起点，不承载当前状态。
