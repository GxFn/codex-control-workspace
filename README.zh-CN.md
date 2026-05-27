# Codex Control Workspace 中文说明

这是一个本地优先的 Codex 多窗口总控工作区，用来协调同一个项目族里的多个仓库、多个 Codex 窗口、任务包、验收、TODO、测试边界和可选自动化。

## 安装形态

这个 GitHub 仓库不应该包裹你的产品子仓库。推荐形态是：你先准备一个父目录，然后把 `codex-control-workspace/` 和其它仓库并列放置。

```text
MyWorkspace/
  codex-control-workspace/
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
```

旧 Alembic 项目也按同样方式理解：`codex-control-workspace/` 是一个独立总控仓库，旁边才是 `Alembic`、`AlembicCore`、`AlembicPlugin` 等产品仓库。

## 用 Codex 交互式安装

建议让 Codex 做安装助手，而不是手动猜目录：

```text
你是 codex-control-workspace 安装助手。
先读取 README.zh-CN.md、README.md、AGENTS.md、workspace.config.json、scripts/README.md。
运行 node scripts/control-workspace-install.mjs discover --json。
列出同级目录、建议窗口名、已有 AGENTS.md 状态和职责建议。
等待我确认目录范围和窗口职责后，再运行 configure --write 或 write-agents --write。
```

常用命令：

```sh
cd MyWorkspace/codex-control-workspace
node scripts/control-workspace-install.mjs discover --json
node scripts/control-workspace-install.mjs status --json
```

用户确认后，写入配置。若用户没有独立需求设计目录和测试目录，使用内部模式：

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --internal-design \
  --internal-test \
  --write
node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
```

若用户已有独立 Design / Test 目录，只把它们作为同级外部目录接入，并同步必要模板：

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --repo DesignWindow=../DesignRepo \
  --repo TestWindow=../TestRepo \
  --write
node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
```

内部模式会使用本仓库内的活跃文档面和同级长期账本：

- `.workspace-active/workspace/current/design-handoff-board.md`
- `.workspace-active/workspace/current/test-exchange.md`
- `../workspace-ledger/design/`
- `../workspace-ledger/testing/`

外部模式不会复制整套 workspace，只在外部 Design/Test 目录下创建总控对齐所需的最小文件：Design 运行规则、original-plan / requirement-design / signal / handoff 模板、Design handoff board、Test 运行规则、Test handoff 模板和 Test alignment 说明。内部模式则在本仓库内提供同等功能入口，让没有独立 Design / Test 仓库的用户也能跑完整流程。

父级工作区必须有自己的 `AGENTS.md`。运行 `sync-root-agents --write` 会把 `codex-control-workspace/AGENTS.md` 解包到父目录 `AGENTS.md`，并把内部路径改成指向 `codex-control-workspace/`。这样你打开父级 workspace 时，Codex 会自动加载总控规则；其它脚本、skill、模板和活跃账本仍保存在 `codex-control-workspace/` 内。

生成给子窗口的提示词：

```sh
node scripts/control-workspace-install.mjs prompts
node scripts/control-workspace-install.mjs prompts --window BaseWindow
```

写入或刷新同级仓库的 `AGENTS.md` scope 管理块：

```sh
node scripts/control-workspace-install.mjs write-agents --all --write
node scripts/control-workspace-install.mjs write-agents --window PluginWindow --write
```

`write-agents` 默认是 dry-run；只有带 `--write` 才会写文件。脚本只会写 `workspace.config.json` 指定父目录内的同级仓库，且只维护带 `codex-control-workspace:scope` 标记的管理块，不会覆盖子仓库原有规则正文。

## 子窗口提示词用途

`prompts` 会为每个配置仓库生成一段简短提示词。它要求子窗口：

- 确认自己所在目录和窗口名；
- 读取本目录 `AGENTS.md`；
- 必要时用安装脚本刷新 scope 管理块；
- 只在自己的目录范围和职责内工作；
- 发现目录或职责不一致时停止并回报总控。

这让总控仓库可以保持通用，而每个子仓库通过自己的 `AGENTS.md` 明确范围和职责。

## 日常使用

总控入口仍是：

```sh
node scripts/verify-control-center.mjs --require-task-packages --with-script-tests
node scripts/workspace-control.mjs status
```

核心文档入口仍是 `.workspace-active/workspace/index.md`。当前计划、TODO、任务包、验收、测试交流和自动化状态都从这里挂载。

`.workspace-active/` 是当前活跃任务面，不跟随 `codex-control-workspace` 的 git。当前总控入口、当前计划、活跃 TODO、测试交流、Design inbox 和 VAD 当前状态都放在这里，方便随项目运行而变化。

`.workspace-local/` 是本机运行态和本机配置面，不跟随 git。真实 Codex thread id、VAD runtime state，以及某个安装实例专属的 `workspace.config.json` 覆盖文件都放这里。

`../workspace-ledger/` 是项目专属长期账本，也不跟随 `codex-control-workspace` 的 git。它保存需求设计、归档历史、内部 Design/Test 入口，以及每个子窗口自己的协作文档目录，例如 `../workspace-ledger/BaseWindow/`、`../workspace-ledger/PluginWindow/`。完成归档时，从 `.workspace-active/` 收束到 `../workspace-ledger/`。

## 配置文件

`workspace.config.json` 是通用安装范围的默认事实来源；如果存在 `.workspace-local/workspace.config.json`，脚本会优先读取本机覆盖配置，用来承载 Alembic 这类项目专属窗口名单而不提交到通用仓库。关键字段：

- `workspaceRoot`: 父目录相对本仓库的位置，通常是 `..`。
- `controlRepoDir`: 本总控仓库目录名，默认 `codex-control-workspace`。
- `repositories`: 每个同级仓库的窗口名、路径、职责和是否写入 `AGENTS.md`。
- `dispatchWindows`: 可以接收任务的窗口。
- `repoNames`: 需要统计 git 状态的产品仓库窗口。
- `designHandoffBoard`: Design handoff board 路径。内部模式是 `.workspace-active/workspace/current/design-handoff-board.md`；外部模式通常是 `../DesignWindow/docs/current/workspace-handoff-board.md`。
- `testExchangePath`: 总控仓库内测试交流文档路径。
- `windowLedgerRoot`: 各子窗口协作文档根目录，默认 `../workspace-ledger`；脚本会为配置里的窗口生成 `../workspace-ledger/<WindowName>/README.md`。

不要把真实 thread id、密钥或本机私密路径写进 tracked 配置或文档。
