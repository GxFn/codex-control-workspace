<div align="center">

# Codex Control Workspace

一个本地优先的 Codex 多仓库总控工作区：唯一机器状态根、唯一开发者可读推进面，以及仍然由总控裁决的 direct-thread 无人值守闭环。

[English](README.md)

</div>

---

- [为什么](#为什么) · [安装形态](#安装形态) · [开始安装](#开始安装) · [总控流水线](#总控流水线) · [无人值守自动化](#无人值守自动化) · [日常使用](#日常使用) · [目录职责](#目录职责) · [设计哲学](#设计哲学)

## 为什么

一个 Codex 窗口很适合处理一个仓库。真实产品工作通常没有这么整齐。

一个需求可能同时涉及插件入口、本地 daemon、共享 core、Dashboard、需求设计窗口和真实项目测试窗口。如果每个窗口只靠自己的上下文往前走，计划很容易漂移：一个窗口做了薄接口，另一个窗口等不到证据，测试窗口验证了错误问题，总控则不断改状态文档，却没有把真实闭环跑通。

Codex Control Workspace 提供的是总控面：

```text
用户目标
   ↓
状态根需求
   ↓
任务包 → 同级 Codex 子窗口
   ↓
目标窗口结果证据
   ↓
总控 review 裁决
   ↓
下一任务包、返工、阻塞、完成或停止
```

当前实现刻意保持简洁：没有托管服务，没有数据库，没有隐藏调度器。通用仓库保存 `AGENTS.md`、模板、skills 和 Node 脚本。项目运行态放在 Git 外的 `.workspace-active/`；真实 thread id 等本机状态放在 `.workspace-local/`；长期项目记忆放在同级 `workspace-ledger/`。

关键是职责分离。机器状态是 JSON；开发者可读推进文档只是投影；direct-thread 自动化负责在 Codex 窗口之间移动 packet，但不验收工作。总控必须继续拉取原始证据、判断结果是否通过，并选择下一步可领取任务。

## 安装形态

不要把产品仓库塞进这个仓库里。推荐做法是把 `codex-control-workspace/` 放在项目族父目录下，和它要管理的仓库并列：

```text
MyWorkspace/
  AGENTS.md                  # 解包后的总控入口
  codex-control-workspace/   # 本通用仓库
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
  workspace-ledger/          # 项目专属长期账本
```

tracked `workspace.config.json` 是可复用默认配置。真实本机安装可以用 `.workspace-local/workspace.config.json` 覆盖；这个文件不提交。`.workspace-active/` 与 `.workspace-local/` 是安装 / 运行态，不是产品源码状态。仓库内模板是创建这些本地面的支持方式。

## 开始安装

建议让 Codex 做安装助手，而不是手动猜目录。把下面这段交给 Codex：

```text
你是 codex-control-workspace 安装助手。
先读取 README.md、README.zh-CN.md、AGENTS.md、workspace.config.json、scripts/README.md。
运行 node scripts/control-workspace-install.mjs discover --json。
列出同级仓库、建议窗口名、已有 AGENTS.md 状态和职责建议。
等待我确认目录范围和窗口职责后，再运行 configure、sync-root-agents、sync-templates 或 write-agents。
```

先做只读探测：

```sh
cd MyWorkspace/codex-control-workspace
node scripts/control-workspace-install.mjs discover --json
node scripts/control-workspace-install.mjs status --json
```

确认范围后，写入窗口配置：

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --repo DesignWindow=../DesignRepo \
  --repo TestWindow=../TestRepo \
  --write

node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
node scripts/control-workspace-install.mjs prompts
node scripts/control-workspace-install.mjs write-agents --all --write
```

如果你没有独立的需求设计仓库或测试仓库，可以使用内部支持面：

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --internal-design \
  --internal-test \
  --write
```

`write-agents` 只维护同级仓库 `AGENTS.md` 中带 `codex-control-workspace:scope` 标记的管理块，不会覆盖子仓库原有规则正文。

## 总控流水线

### 总控门禁

父目录的 `AGENTS.md` 是 Codex 自动读取的总控契约。它由本仓库 `AGENTS.md` 解包生成，规定总控在派发、测试、验收、归档和自动化之前必须如何思考。

最硬的规则保留在这里，因为它们约束的是总控本身：不能用脚本输出代替判断，不能接受薄弱证据，不能把空壳连接包装成完成，不能在最小代码闭环没跑通时扩大范围，不能在边界不清时把任务丢给别的窗口。

### 状态根

新需求由 `controller-state.mjs init` 创建一个 controller state root。状态根包含这些机器文件：

```text
demand.json
controller-state.json
controller-events.jsonl
intake/*.json
test-cards/*.json
task-packages/*.json
target-results/*.json
transition-candidates/*.json
developer-progress.md
```

`controller-state.json` 是流程权威。`developer-progress.md` 是开发者可读推进面：目标、完成定义、阶段方案、任务包、追加式回填摘要、裁决记录，以及自动生成的 `Unified Status` 区块。脚本只能重建这个固定区块；其它内容是可读上下文或带时间戳的追加历史。

### Design 与 Test Intake

Design 和 Test 不再各自维护一套状态机。它们把结构化证据挂到当前状态根：

```sh
node scripts/controller-state.mjs init \
  --demand-key <key> \
  --title "<title>" \
  --goal "<goal>" \
  --completion-definition "<done>" \
  --stage-plan "<stage plan>" \
  --write --json

node scripts/control-intake.mjs design-handoff \
  --state-root <stateRoot> \
  --design-key <DESIGN-KEY> \
  --write --json

node scripts/control-intake.mjs test-card \
  --state-root <stateRoot> \
  --test-id <testId> \
  --target-window <TestWindow> \
  --question "<question>" \
  --object-boundary "<boundary>" \
  --controller-self-check "<already checked>" \
  --real-scenario-condition "<why real scenario is needed>" \
  --success-means "<success conclusion>" \
  --failure-means "<failure conclusion>" \
  --cannot-conclude "<what this test cannot prove>" \
  --stop-condition "<when to stop>" \
  --write --json
```

`control-intake.mjs` 只负责验证并写入机器 intake。它不接收 Design handoff、不验收测试结果、不修改 controller state、不创建 dispatch。

### 任务包与验收

正常路线是任务包、派发、结果、归约、裁决：

```sh
node scripts/controller-state.mjs add-task-package \
  --state-root <stateRoot> \
  --task-package-id <packageId> \
  --summary "<summary>" \
  --target-window <window> \
  --target-task-id <taskId> \
  --target-summary "<target task>" \
  --write --json

node scripts/codex-automation-loop.mjs prepare-dispatch-from-state \
  --state-root <stateRoot> \
  --task-package-id <packageId> \
  --target-task-id <taskId> \
  --group <groupId> \
  --controller-window <controllerWindow> \
  --human-context-ref <stateRoot>/developer-progress.md \
  --require-thread \
  --write --json

node scripts/controller-state.mjs import-target-result \
  --state-root <stateRoot> \
  --target-window <window> \
  --target-task-id <taskId> \
  --status completed \
  --evidence-ref <ref> \
  --verification "<verification summary>" \
  --write --json

node scripts/codex-automation-loop.mjs review-pack \
  --state-root <stateRoot> \
  --json

node scripts/controller-state.mjs reduce-results \
  --state-root <stateRoot> \
  --write --json

node scripts/controller-state.mjs decide-review \
  --state-root <stateRoot> \
  --candidate-id <candidateId> \
  --decision accept \
  --reason "<controller evidence verdict>" \
  --evidence-ref <ref> \
  --write --json
```

当需求已完成、已归档、暂停、阻塞、正在等待总控 review，或目标任务已 accepted / completed / blocked 时，`prepare-dispatch-from-state` 会 fail closed。导入结果不是验收；`reduce-results` 和 `decide-review` 是独立的总控步骤。

## 无人值守自动化

Codex Automation Closed Loop 是无人值守工作的 transport 和回调契约。它只走 direct-thread：

1. 真实 Codex thread id 登记在 `.workspace-local/`。
2. 从状态根任务包生成 dispatch packet。
3. 生成 delivery envelope。
4. 用宿主 thread 工具发送提示词。
5. 用 send/readback 证据记录 delivery run。
6. 目标窗口返回 result envelope。
7. 总控复核原始证据并裁决下一次状态迁移。

常用命令：

```sh
node scripts/codex-automation-loop.mjs register-thread \
  --window <window> \
  --thread-id <realThreadId> \
  --role target \
  --write --json

node scripts/codex-automation-loop.mjs record-delivery-run \
  --delivery-file <deliveryEnvelope> \
  --status sent \
  --host-method send_message_to_thread \
  --host-mode new-turn \
  --readback-ok true \
  --evidence "<readback summary>" \
  --write --json

node scripts/codex-automation-loop.mjs review-results \
  --group <groupId> \
  --json

node scripts/codex-automation-loop.mjs build-controller-return \
  --group <groupId> \
  --trigger-target <window> \
  --trigger-task-id <taskId> \
  --controller-window <controllerWindow> \
  --require-thread \
  --write --json

node scripts/codex-automation-loop.mjs stop-loop \
  --automation-run-id <runId> \
  --reason "<reason>" \
  --write --json
```

脚本层不会自己发送 host thread message，也不会验收证据。delivery adapter 或总控窗口必须完成真实发送并记录 readback。回调由 `DispatchGroup.controllerWindow` 与 `return-policy` 决定：`group-ready` 是所有预期窗口都有结果后的一次 barrier callback；`per-target` 允许每个已完成目标唤醒总控，但必须携带 completed / blocked / missing 的 group snapshot。

无人值守只在已确认需求内持续推进：review result envelope、拉原始证据、接受或打回、创建下一可领取任务包、再次派发。停止条件是最终完成、硬门禁、用户停止、无可领取 TODO、证据必须人工裁决，或当前状态禁止派发。

在 macOS 上，keep-live / 防睡眠只是自动化支持，不是任务逻辑，也不是投递证明。如果无人值守依赖它，启动或停止失败必须报告为自动化就绪风险。

## 日常使用

从当前总控面开始：

```sh
node scripts/workspace-control.mjs status
node scripts/workspace-control.mjs loop status --json
node scripts/workspace-control.mjs verify --script-tests
```

用 `workspace-control.mjs --print <command>` 可以查看底层脚本调用。完整脚本目录在 [scripts/README.md](scripts/README.md)。

普通手动派发时，总控提示词应该保持短：读取父级 `AGENTS.md`、读取状态根和 `developer-progress.md`、读取目标仓库 `AGENTS.md`、声明窗口身份、只做分配给自己的目标任务、回填证据。

开启无人值守不代表所有聊天、需求讨论或单窗口开发都自动进入流水线；它只授权当前需求在已确认目标、完成定义和仓库边界内进行目标窗口 fan-out、结果验收和下一任务包裁决。开发者实时输入永远高于下一次自动跳转。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `AGENTS.md` | 总控规则源文件，用于解包到父级工作区。 |
| `workspace.config.json` | 通用窗口名、同级仓库路径、职责标签和脚本默认配置。 |
| `.workspace-active/` | 不提交的项目运行态：当前索引、状态根、推进文档、TODO 投影、intake、test cards。 |
| `.workspace-local/` | 不提交的本机运行态：真实 thread id、自动化闭环状态、keep-live 状态、本机配置覆盖。 |
| `../workspace-ledger/` | 位于本仓库外的项目专属长期账本。 |
| `scripts/` | 安装、校验、账本、状态机、intake、自动化和总控辅助脚本。 |
| `skills/` | 总控、子窗口、测试、账本和自动化操作手册。 |
| `templates/` | 状态根、开发者推进文档、Design/Test 支持面和阶段确认的最小骨架。 |

## 设计哲学

1. **唯一状态机**：`controller-state.json` 是流程权威；Markdown 只是投影或证据。
2. **唯一开发者可读推进面**：开发者在一个地方读取目标、阶段方案、任务包、回填和裁决。
3. **机器数据保持机器化**：重复状态、thread id、envelope、任务包、test card、intake 都用 JSON / JSONL。
4. **自动化是 transport，不是判断力**：direct-thread 投递和回调负责移动工作；总控负责接受或打回。
5. **Design 和 Test 挂到需求**：handoff 和真实场景测试边界进入状态根 intake，不生成并行计划。
6. **同级仓库保持独立**：产品代码、测试和提交仍留在自己的仓库。
7. **干净模板优先于聪明分叉**：默认路线要易读、易验、难误用。

Codex Control Workspace 不是判断力的替代品。它是让判断力在多窗口、多仓库工作里持续在线的脚手架。
