<div align="center">

# Codex Control Workspace

一个本地优先的 Codex 多窗口总控工作区，用可见、可接管的自动化持续推进多仓库协作。

[English](README.md)

</div>

---

- [为什么](#为什么) · [安装形态](#安装形态) · [开始安装](#开始安装) · [它如何工作](#它如何工作) · [Codex 自动化闭环](#codex-自动化闭环) · [日常使用](#日常使用) · [目录职责](#目录职责) · [设计取向](#设计取向)

## 为什么

一个 Codex 窗口很适合处理一个仓库。真实产品工作通常没有这么整齐。

一个需求可能同时涉及插件入口、本地 daemon、共享 core、Dashboard、需求设计窗口和真实项目测试窗口。如果每个窗口只靠自己的上下文往前走，计划很容易漂移：一个窗口做了薄接口，另一个窗口等不到证据，测试窗口验证了错误问题，总控则不断改状态文档，却没有把真实闭环跑通。

Codex Control Workspace 提供的是一个**总控面**：

```text
用户目标
   ↓
总控计划
   ↓
任务包 → 同级 Codex 子窗口
   ↓
证据回填 → 总控验收
   ↓
下一阶段、继续派发、归档或停止
```

它刻意保持朴素：没有托管服务，没有数据库，没有隐藏调度器。核心就是 `AGENTS.md`、Markdown 账本、小型 Node 脚本、Codex skill，以及可选的 Codex heartbeat 自动化。所有判断面都在文件里，可以读、可以改、可以复核。

真正的优势是“人优先的连续性”。有人在 Mac 前时，可以随时查看进度、调整范围、直接改代码或关闭自动化；自动化永远排在开发者现场判断之后。没有人在 Mac 前且已开启无人值守模式时，总控才会在子窗口完成后继续验收证据、接受或打回、补计划、创建下一阶段任务包、再次派发，直到用户最终目标完成、出现硬门禁，或没有可领取 TODO。自动化服务于总控判断，而不是替代总控判断。

## 安装形态

不要把产品仓库塞进这个仓库里。推荐做法是把 `codex-control-workspace/` 放在项目族父目录下，和它要管理的仓库并列：

```text
MyWorkspace/
  AGENTS.md                  # 解包后的总控入口
  codex-control-workspace/   # 本仓库
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
  workspace-ledger/          # 项目专属长期账本
```

这个 GitHub 仓库只保存通用总控能力。项目运行中的当前计划放在 `.workspace-active/`，本机运行态放在 `.workspace-local/`，长期历史和项目专属文档放在同级 `workspace-ledger/`。

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

如果你没有独立的需求设计仓库或测试仓库，可以使用内部入口：

```sh
node scripts/control-workspace-install.mjs configure \
  --repo BaseWindow=../ProductRepo \
  --repo PluginWindow=../PluginRepo \
  --internal-design \
  --internal-test \
  --write
```

`write-agents` 只维护同级仓库 `AGENTS.md` 中带 `codex-control-workspace:scope` 标记的管理块，不会覆盖子仓库原有规则正文。

## 它如何工作

### 总控入口

父目录的 `AGENTS.md` 是 Codex 自动读取的总控契约。它由本仓库 `AGENTS.md` 解包生成，规定总控在派发、测试、验收、归档和自动化之前必须如何思考。

最硬的规则保留在这里，因为它们约束的是总控本身：不能用脚本输出代替判断，不能接受薄弱证据，不能把空壳连接包装成完成，不能在边界不清时把任务丢给别的窗口。

### 当前工作面

`.workspace-active/workspace/index.md` 是当前总控入口。它挂载当前计划、当前状态、TODO、测试交流、Design inbox 和自动化状态。

当前计划是短期文件，只描述这一轮目标、任务包、窗口覆盖、producer / consumer 顺序、验证命令和回填要求。完成后，有长期价值的证据再收束到 `../workspace-ledger/`。

### 子窗口

每个子仓库保留自己的 `AGENTS.md`。安装脚本会写入一个紧凑的管理块，让子窗口知道：

- 总控仓库在哪里；
- 自己对应哪个窗口名；
- 当前计划和长期账本在哪里；
- 如何执行分配给自己的 dispatch packet 并回填 result envelope；
- 什么情况必须停止并回报总控。

子窗口仍然拥有自己的仓库。它可以读代码、实现、测试，也可以在自己的边界内使用 Codex 子 agent。总控只验收它统一回填的原始证据。

## Codex 自动化闭环

Codex Automation Closed Loop 用 Codex heartbeat 唤醒真实子窗口，但计划和验收始终留在总控。

脚本层只负责明确的 packet / envelope：

```sh
node scripts/workspace-control.mjs loop register-thread --window <window> --thread-id <realThreadId> --write --json
node scripts/workspace-control.mjs loop create-dispatch --target-window <window> --task-id <taskId> --control-plan <plan> --objective "<objective>" --prompt-file <promptFile> --write --json
node scripts/workspace-control.mjs loop build-delivery --packet-file <packetFile> --require-thread --write --json
node scripts/workspace-control.mjs loop submit-result --target-window <window> --task-id <taskId> --status completed --evidence-ref <ref> --write --json
node scripts/workspace-control.mjs loop review-results --group <group> --json
```

脚本不会直接调用 Codex automation API。它只生成 delivery envelope。总控窗口或 delivery adapter 按 envelope 创建 heartbeat，目标窗口完成后回填 `TargetResultEnvelope`。

这个闭环面向长时间无人值守运行，但始终可被人接管。开发者在场时，手动修正、代码修改和范围裁决优先于下一次自动跳转；Mac 空闲无人看守时，总控可以复核 result envelope、拉取原始证据、接受或打回、创建下一阶段任务包并继续派发，直到用户最终目标完成、出现硬门禁，或没有可领取 TODO。

在 macOS 上，防睡眠只是 delivery support，不是任务逻辑。若安装实例启用防睡眠，启动或停止失败必须报告为自动化就绪风险，不能隐藏在任务状态里。

## 日常使用

从当前总控面开始：

```sh
node scripts/workspace-control.mjs status
node scripts/workspace-control.mjs loop status --json
node scripts/verify-control-center.mjs --require-task-packages --with-script-tests
```

普通手动派发时，总控默认只给一条通用提示词：读取父级 `AGENTS.md`、读取当前计划、读取自己仓库的 `AGENTS.md`、声明窗口身份、只做分配给自己的任务、回填证据。

无人值守时，只有当前计划明确允许 Codex Automation Closed Loop，才开启自动化。开启自动化不代表所有聊天、需求讨论或单窗口开发都自动进入流水线；它只授权当前计划里的目标窗口派发、结果验收和下一阶段裁决。开发者的实时输入永远高于下一次自动派发。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `AGENTS.md` | 总控规则源文件，用于解包到父级工作区。 |
| `workspace.config.json` | 通用窗口名、同级仓库路径、职责标签和脚本默认配置。 |
| `.workspace-active/` | 不提交的当前工作面：当前计划、TODO、测试交流、Design inbox。 |
| `.workspace-local/` | 不提交的本机运行态：thread id、自动化闭环状态、本机配置覆盖。 |
| `../workspace-ledger/` | 位于本仓库外的项目专属长期账本。 |
| `scripts/` | 安装、校验、账本、自动化和总控辅助脚本。 |
| `skills/` | 总控、子窗口、测试、账本和自动化操作手册。 |
| `templates/` | 计划、任务包、Design handoff、测试单和阶段确认的最小骨架。 |

## 设计取向

1. **提示词原生，文件承载**：人能读，Codex 也能读。
2. **先总控判断，再自动化投递**：脚本负责分类和投递，不替代验收。
3. **同级仓库保持独立**：产品代码、测试和提交仍留在自己的仓库。
4. **当前工作本地化，长期历史外置**：通用仓库保持干净，项目记忆进入 active 和 ledger。
5. **脚本要小，边界要硬**：自动化只有在保住窗口身份、仓库范围和证据质量时才有价值。

Codex Control Workspace 不是判断力的替代品。它是让判断力在多窗口、多仓库工作里持续在线的脚手架。
