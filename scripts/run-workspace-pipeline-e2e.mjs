#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const keepFixture = args.includes("--keep");
const json = args.includes("--json");
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptsDir);
const fixtureParentRoot = mkdtempSync(path.join(os.tmpdir(), "control-workspace-pipeline-e2e-"));
const fixtureRoot = path.join(fixtureParentRoot, "codex-control-workspace");
const steps = [];

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function readFile(file) {
  return readFileSync(file, "utf8");
}

function run(label, command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? fixtureRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ALEMBIC_WORKSPACE_PIPELINE_E2E: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  steps.push({
    label,
    command: [command, ...commandArgs].join(" "),
    status: result.status ?? 1,
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed with status ${result.status ?? 1}${detail ? `\n${detail}` : ""}`);
  }

  return result.stdout;
}

function runScript(label, script, scriptArgs = []) {
  return run(label, "node", [`scripts/${script}`, ...scriptArgs]);
}

function runScriptJson(label, script, scriptArgs = []) {
  const output = runScript(label, script, [...scriptArgs, "--json"]);
  return JSON.parse(output);
}

function initGitRepo(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function setupRepoShells() {
  initGitRepo(fixtureRoot);
  for (const repo of ["BaseWindow", "CoreWindow", "AgentWindow", "DashboardWindow", "PluginWindow"]) {
    initGitRepo(path.join(fixtureParentRoot, repo));
  }
}

function setupScriptsLink() {
  symlinkSync(path.join(repoRoot, "scripts"), path.join(fixtureRoot, "scripts"), "dir");
}

function designDoc(title) {
  return `# ${title}

Design Key: E2E-FLOW-2026-05-25

## 目标

用于 workspace 脚本端到端 fixture，不代表真实产品需求。
`;
}

function writeDesignHandoffFixture() {
  const designDir = path.join(fixtureParentRoot, "DesignWindow/docs/current/e2e-flow");
  writeFile(path.join(designDir, "original-plan-2026-05-25.md"), designDoc("E2E Original Plan"));
  writeFile(path.join(designDir, "requirement-design-2026-05-25.md"), designDoc("E2E Requirement Design"));
  writeFile(path.join(designDir, "workspace-handoff-2026-05-25.md"), designDoc("E2E Workspace Handoff"));
  writeFile(
    path.join(fixtureParentRoot, "DesignWindow/docs/current/workspace-handoff-board.md"),
    `# Workspace Handoff Board

## Handoff 清单

| ID | 状态 | 标题 | 原始计划 | 需求设计 | Handoff | 用户确认 | 当前主线关系 | 建议 TODO | 优先级 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E2E-FLOW-2026-05-25 | ready-for-workspace | E2E 全链需求 | [original](e2e-flow/original-plan-2026-05-25.md) | [design](e2e-flow/requirement-design-2026-05-25.md) | [handoff](e2e-flow/workspace-handoff-2026-05-25.md) | 用户已确认 | 不影响真实主线 | GTODO-E2E-001 | P1 | 进入 fixture wave |
`,
  );
}

function dispatchRows({ completed }) {
  if (completed) {
    return `| \`BaseWindow\`<br>无任务 | fixture 不改后端。 |
| \`CoreWindow\`<br>无任务 | fixture 无共享 contract。 |
| \`AgentWindow\`<br>无任务 | fixture 不改 Agent。 |
| \`DashboardWindow\`<br>已完成 | E2E fixture 实现窗口已回填。 |
| \`PluginWindow\`<br>无任务 | fixture 不改 Plugin。 |
| \`DesignWindow\`<br>已完成 | E2E fixture 需求设计 handoff 已导入。 |
| \`TestWindow\`<br>已完成 | E2E fixture 测试单已回填通过。 |
| \`RealTestProject\`<br>无任务 | 不触碰真实项目。 |`;
  }

  return `| \`BaseWindow\`<br>观察中 | 等 Dashboard fixture 回填。 |
| \`CoreWindow\`<br>无任务 | fixture 无共享 contract。 |
| \`AgentWindow\`<br>无任务 | fixture 不改 Agent。 |
| \`DashboardWindow\`<br>待启动 | 承接 E2E fixture 实现窗口。 |
| \`PluginWindow\`<br>无任务 | fixture 不改 Plugin。 |
| \`DesignWindow\`<br>已完成 | E2E fixture 需求设计 handoff 已导入。 |
| \`TestWindow\`<br>阻塞 | 等 Dashboard fixture 回填后测试。 |
| \`RealTestProject\`<br>无任务 | 不触碰真实项目。 |`;
}

function planContent({ completed = false } = {}) {
  const status = completed ? "已完成" : "执行中";
  const sendLine = completed ? "发送给：无" : "发送给：`DashboardWindow`";
  const todoStatus = completed ? "已完成" : "执行中";
  return `# E2E Workspace Plan

状态：${status}

## 总控决策记录

- 本次决策触发：E2E fixture 需要验证需求到测试结束归档脚本全链。
- 需求 / 测试结果理解：fixture 只验证 workspace 自动化文档链路，不代表产品实现。
- 已核对证据：fixture Design handoff、current plan、TODO、任务包和测试交流。
- 是否需要先验证 / 重新计划 / 用户确认：不需要用户确认，脚本会在 fixture 内自测。
- 本次允许更新：fixture workspace 文档和归档入口。
- 本次不得更新：不得写入真实产品仓库或真实测试项目。

## 阶段任务包

### E2E-P1

窗口：\`DashboardWindow\`
阶段目标：完成 fixture UI 任务并交给 TestWindow。
主线动作：从 Design handoff 进入 workspace TODO，再派发 Dashboard fixture 任务。
合并 TODO：GTODO-E2E-001。
明确不包含：不修改任何真实产品仓库。
下一处真实阻塞点：Dashboard fixture 回填前 TestWindow 阻塞。
阻塞点之前还能做：同步 current plan、校验分派表、准备测试交流。
验证命令：\`node scripts/verify-control-center.mjs --require-todo --require-task-packages\`
回填要求：完成范围、提交 hash、验证结果和测试结论。
执行前置硬规则：先读取 AGENTS.md 和目标仓库 AGENTS.md，并明确当前窗口定位。

## TODO / Backlog

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GTODO-E2E-001 | ${todoStatus} | fixture | P1 | Workspace | 验证脚本全链可执行 | 是 | E2E-FLOW-2026-05-25 | DashboardWindow |

## 空闲窗口调度

| 窗口 | 调度 | 是否发送 | 原因 |
| --- | --- | --- | --- |
| \`BaseWindow\` | 观察 | 否 | fixture 不改后端。 |
| \`CoreWindow\` | 无任务 | 否 | fixture 无共享 contract。 |
| \`AgentWindow\` | 无任务 | 否 | fixture 不改 Agent。 |
| \`DashboardWindow\` | ${completed ? "已完成" : "主线任务"} | ${completed ? "否" : "是"} | ${completed ? "已回填" : "当前可推进"}。 |
| \`PluginWindow\` | 无任务 | 否 | fixture 不改 Plugin。 |
| \`DesignWindow\` | 已完成 | 否 | fixture Design handoff 已导入。 |
| \`TestWindow\` | ${completed ? "已完成" : "阻塞"} | 否 | ${completed ? "测试已通过" : "等待上游"}。 |
| \`RealTestProject\` | 无任务 | 否 | fixture 不触碰真实项目。 |

## 窗口分派

${sendLine}

| 窗口 / 状态 | 任务 |
| --- | --- |
${dispatchRows({ completed })}

## 可复制提示词

${sendLine}

\`\`\`text
继续当前总控任务：E2E workspace plan。

先读：AGENTS.md、docs/workspace/index.md、docs/workspace/current/e2e-workspace-plan-2026-05-25.md，以及本窗口/目标仓库 AGENTS.md。

定位：声明当前窗口和本轮仓库职责。

领取：按当前计划领取分配给本窗口的任务。

完成后按当前计划回填证据、边界、风险和下一步建议。
\`\`\`

## 回填区

- ${completed ? "DashboardWindow fixture 和 TestWindow fixture 均已回填通过。" : "等待执行窗口回填。"}

<!-- workspace-sync
{
  "status": "${status}",
  "indexPlanDescription": "E2E fixture：需求到测试结束归档脚本全链。",
  "indexStatusDescription": "E2E fixture 当前状态，由 sync-current-plan 生成。",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "E2E fixture 当前计划。",
  "indexRows": [
    {
      "type": "E2E Design Handoff Inbox",
      "doc": "docs/workspace/current/design-handoff-inbox.md",
      "status": "维护中",
      "description": "由 import-design-handoffs 生成的 fixture inbox。",
      "insertAfter": "当前状态"
    },
    {
      "type": "E2E 需求设计",
      "doc": "docs/requirement-designs/e2e-flow/requirement-design-2026-05-25.md",
      "status": "已完成",
      "description": "fixture 需求设计入口，用于 compact-workspace-index 验证。",
      "insertAfter": "E2E Design Handoff Inbox"
    }
  ],
  "currentIndexRows": [
    {
      "type": "E2E Test Exchange",
      "doc": "docs/workspace/current/test-exchange.md",
      "description": "fixture 测试交流入口。",
      "insertAfter": "当前计划"
    }
  ]
}
-->
`;
}

function idlePlanContent() {
  return `# E2E Idle Control

状态：空闲

## 总控决策记录

- 本次决策触发：E2E fixture 已归档，需要空闲 current plan 维持验证入口。
- 需求 / 测试结果理解：空闲计划只用于证明归档后总控入口仍可校验。
- 已核对证据：归档后的 current index、workspace index 和 record map。
- 是否需要先验证 / 重新计划 / 用户确认：不需要，post-archive verification 会复核。
- 本次允许更新：fixture 空闲入口。
- 本次不得更新：不得重新派发窗口或触碰真实产品仓库。

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`BaseWindow\`<br>无任务 | fixture 已归档。 |
| \`CoreWindow\`<br>无任务 | fixture 已归档。 |
| \`AgentWindow\`<br>无任务 | fixture 已归档。 |
| \`DashboardWindow\`<br>无任务 | fixture 已归档。 |
| \`PluginWindow\`<br>无任务 | fixture 已归档。 |
| \`DesignWindow\`<br>已完成 | fixture 需求设计 handoff 已归档。 |
| \`TestWindow\`<br>已完成 | fixture 测试已完成。 |
| \`RealTestProject\`<br>无任务 | fixture 不触碰真实项目。 |

## 可复制提示词

发送给：无，fixture 已归档。

\`\`\`text
先读取 AGENTS.md 和当前总控文档，并明确当前窗口定位。
\`\`\`

## 回填区

- E2E fixture 已切回空闲入口。

<!-- workspace-sync
{
  "status": "空闲",
  "indexPlanDescription": "E2E fixture 归档后的空闲控制入口。",
  "indexStatusDescription": "E2E fixture 归档后当前状态。",
  "currentIndexType": "当前计划",
  "currentIndexDescription": "E2E fixture 归档后空闲状态。"
}
-->
`;
}

function writeWorkspaceFixture() {
  writeFile(path.join(fixtureRoot, "AGENTS.md"), "# Fixture AGENTS\n");
  writeFile(
    path.join(fixtureRoot, "workspace.config.json"),
    JSON.stringify(
      {
        workspaceName: "ControlWorkspace",
        controlWindow: "ControlWorkspace",
        designWindow: "DesignWindow",
        testWindow: "TestWindow",
        realProjectWindow: "RealTestProject",
        baseWindow: "BaseWindow",
        workspaceRoot: "..",
        controlRepoDir: "codex-control-workspace",
        allowMissingRepos: true,
        dispatchWindows: ["BaseWindow", "CoreWindow", "AgentWindow", "DashboardWindow", "PluginWindow", "TestWindow"],
        requiredDispatchWindows: ["BaseWindow", "CoreWindow", "AgentWindow", "DashboardWindow", "PluginWindow", "DesignWindow", "TestWindow", "RealTestProject"],
        repoNames: ["BaseWindow", "CoreWindow", "AgentWindow", "DashboardWindow", "PluginWindow"],
        designHandoffBoard: "../DesignWindow/docs/current/workspace-handoff-board.md",
        designHandoffInbox: "docs/workspace/current/design-handoff-inbox.md",
        testExchangePath: "docs/workspace/current/test-exchange.md",
        repositories: [
          { windowName: "BaseWindow", path: "../BaseWindow", role: "Base runtime", managedAgents: true, mode: "external" },
          { windowName: "CoreWindow", path: "../CoreWindow", role: "Core runtime", managedAgents: true, mode: "external" },
          { windowName: "AgentWindow", path: "../AgentWindow", role: "Agent runtime", managedAgents: true, mode: "external" },
          { windowName: "DashboardWindow", path: "../DashboardWindow", role: "Dashboard UI", managedAgents: true, mode: "external" },
          { windowName: "PluginWindow", path: "../PluginWindow", role: "Plugin entry", managedAgents: true, mode: "external" },
          { windowName: "DesignWindow", path: "../DesignWindow", role: "Requirement design and handoff", managedAgents: true, mode: "external" },
          { windowName: "TestWindow", path: "docs/workspace/testing", role: "Internal test coordination workspace", managedAgents: false, mode: "internal" }
        ]
      },
      null,
      2,
    ),
  );
  writeFile(path.join(fixtureRoot, "docs/requirement-designs/e2e-flow/requirement-design-2026-05-25.md"), designDoc("Workspace Requirement Design Copy"));
  writeFile(path.join(fixtureRoot, "docs/workspace/current/e2e-workspace-plan-2026-05-25.md"), planContent());
  writeFile(path.join(fixtureRoot, "docs/workspace/current/e2e-idle-control-2026-05-25.md"), idlePlanContent());
  writeFile(
    path.join(fixtureRoot, "docs/workspace/index.md"),
    `# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/e2e-workspace-plan-2026-05-25.md](current/e2e-workspace-plan-2026-05-25.md) | 执行中 | E2E fixture 当前计划。 |
| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 执行中 | E2E fixture 当前状态。 |
| 当前短期工作区 | [current/](current/) | 短期入口 | fixture current 区。 |
| 长期记录地图 | [workspace-record-map.md](workspace-record-map.md) | 长期地图 | fixture 记录地图。 |

## 窗口覆盖状态

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`BaseWindow\`<br>观察中 | fixture。 |
| \`CoreWindow\`<br>无任务 | fixture。 |
| \`AgentWindow\`<br>无任务 | fixture。 |
| \`DashboardWindow\`<br>待启动 | fixture。 |
| \`PluginWindow\`<br>无任务 | fixture。 |
| \`DesignWindow\`<br>已完成 | fixture handoff 已导入。 |
| \`TestWindow\`<br>阻塞 | fixture。 |
| \`RealTestProject\`<br>无任务 | fixture。 |

## 状态枚举

- 待启动
- 执行中
- 待验收
- 阻塞
- 已完成
- 暂停
- 观察中
- 无任务
`,
  );
  writeFile(
    path.join(fixtureRoot, "docs/workspace/current/index.md"),
    `# Current Index

## 当前地图

| 类型 | 文档 | 说明 |
| --- | --- | --- |
| 当前状态 | [workspace-current-status.md](workspace-current-status.md) | fixture 当前状态。 |
`,
  );
  writeFile(
    path.join(fixtureRoot, "docs/workspace/current/workspace-current-status.md"),
    `# Current Status

状态：执行中

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`BaseWindow\`<br>无任务 | 等待同步。 |

## 可复制提示词

发送给：无。

## 回填区

- 初始 fixture。
`,
  );
  writeFile(
    path.join(fixtureRoot, "docs/workspace/current/global-todo-board.md"),
    `# Global TODO Board

## 全局 TODO

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 | 当前挂载 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GTODO-E2E-001 | 已完成 | fixture | P1 | Workspace | E2E 全链已完成 | 否 | E2E-FLOW-2026-05-25 | DashboardWindow | e2e plan |
| GTODO-E2E-002 | 观察中 | fixture | P3 | Workspace | 保留观察项 | 否 | 无 | ControlWorkspace | global |

## 最近同步记录

- 2026-05-24：旧同步记录一。
- 2026-05-25：旧同步记录二。
`,
  );
  writeFile(
    path.join(fixtureRoot, "docs/workspace/current/test-exchange.md"),
    `# Test Exchange

## Test-2026-05-25-E2E

状态：已完成
结论：fixture 通过。
`,
  );
  writeFile(
    path.join(fixtureRoot, "docs/workspace/workspace-record-map.md"),
    `# Workspace Record Map

## Archive Topics

| 归档主题 | 目录 | 说明 |
| --- | --- | --- |
`,
  );
}

function switchToCompletedPlan() {
  writeFile(path.join(fixtureRoot, "docs/workspace/current/e2e-workspace-plan-2026-05-25.md"), planContent({ completed: true }));
}

function switchToIdleControl() {
  const indexPath = path.join(fixtureRoot, "docs/workspace/index.md");
  const previous = readFile(indexPath);
  const withIdleCurrent = previous
    .replace(
      "| 当前计划 | [current/e2e-workspace-plan-2026-05-25.md](current/e2e-workspace-plan-2026-05-25.md) | 已完成 | E2E fixture：需求到测试结束归档脚本全链。 |",
      "| 当前计划 | [current/e2e-idle-control-2026-05-25.md](current/e2e-idle-control-2026-05-25.md) | 空闲 | E2E fixture 归档后的空闲控制入口。 |",
    )
    .replace(
      "| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 已完成 | E2E fixture 当前状态，由 sync-current-plan 生成。 |",
      "| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 空闲 | E2E fixture 归档后当前状态。 |",
    );
  const completedRow =
    "| E2E 已完成计划 | [current/e2e-workspace-plan-2026-05-25.md](current/e2e-workspace-plan-2026-05-25.md) | 已完成 | 待归档的 E2E fixture 计划。 |";
  writeFile(
    indexPath,
    withIdleCurrent.includes(completedRow)
      ? withIdleCurrent
      : withIdleCurrent.replace("| 长期记录地图 |", `${completedRow}\n| 长期记录地图 |`),
  );
}

function cleanup() {
  if (!keepFixture && existsSync(fixtureParentRoot)) {
    rmSync(fixtureParentRoot, { recursive: true, force: true });
  }
}

try {
  setupRepoShells();
  setupScriptsLink();
  writeDesignHandoffFixture();
  writeWorkspaceFixture();

  const handoff = runScriptJson("Design handoff import", "import-design-handoffs.mjs", [
    "--write",
    "--id",
    "E2E-FLOW-2026-05-25",
  ]);
  assert.equal(handoff.readyCount, 1);
  assert.equal(handoff.wroteInbox, true);

  runScript("Initial current-plan sync", "sync-current-plan.mjs", ["--write"]);
  runScript("Initial current-plan sync check", "sync-current-plan.mjs", ["--check"]);
  runScript("Initial control-center verification", "verify-control-center.mjs", [
    "--require-todo",
    "--require-task-packages",
    "--with-script-tests",
  ]);
  runScriptJson("Runtime residue read-only check", "check-runtime-residue.mjs");

  switchToCompletedPlan();
  runScript("Completed current-plan sync", "sync-current-plan.mjs", ["--write"]);
  runScript("Completed current-plan sync check", "sync-current-plan.mjs", ["--check"]);
  runScript("Completed control-center verification", "verify-control-center.mjs", [
    "--require-todo",
    "--require-task-packages",
  ]);

  switchToIdleControl();
  runScript("Idle current-plan sync", "sync-current-plan.mjs", ["--write"]);
  runScript("Idle current-plan sync check", "sync-current-plan.mjs", ["--check"]);

  const archiveDryRun = runScriptJson("Workspace archive dry-run", "archive-workspace-docs.mjs", [
    "--topic",
    "e2e-full-chain",
    "--file",
    "docs/workspace/current/e2e-workspace-plan-2026-05-25.md",
  ]);
  assert.equal(archiveDryRun.operations.length, 1);

  const archiveApply = runScriptJson("Workspace archive apply", "archive-workspace-docs.mjs", [
    "--topic",
    "e2e-full-chain",
    "--file",
    "docs/workspace/current/e2e-workspace-plan-2026-05-25.md",
    "--apply",
  ]);
  assert.equal(archiveApply.applied, true);
  assert.equal(archiveApply.operations.length, 1);

  const compact = runScriptJson("Workspace index compaction", "compact-workspace-index.mjs", [
    "--topic",
    "e2e-full-chain",
    "--match",
    "E2E",
    "--apply",
  ]);
  assert.equal(compact.applied, true);
  assert.ok(compact.removedRows >= 1);

  const todoArchive = runScriptJson("Global TODO archive", "archive-global-todo-board.mjs", [
    "--date",
    "2026-05-25",
    "--keep-sync",
    "0",
    "--apply",
  ]);
  assert.equal(todoArchive.applied, true);
  assert.equal(todoArchive.completedRows, 1);

  const summaries = runScriptJson("Archive topic summaries", "generate-archive-topic-summaries.mjs", ["--apply"]);
  assert.equal(summaries.applied, true);
  assert.ok(summaries.topics >= 1);

  runScript("Post-archive control-center verification", "verify-control-center.mjs", ["--with-script-tests"]);

  const result = {
    ok: true,
    fixtureParentRoot: keepFixture ? fixtureParentRoot : null,
    fixtureRoot: keepFixture ? fixtureRoot : null,
    keptFixture: keepFixture,
    stepCount: steps.length,
    steps,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Workspace pipeline E2E passed.");
    console.log(`Fixture: ${keepFixture ? fixtureParentRoot : "(removed)"}`);
    console.log(`Steps: ${steps.length}`);
    for (const step of steps) {
      console.log(`- PASS ${step.label}`);
    }
  }
} catch (error) {
  const result = {
    ok: false,
    fixtureParentRoot,
    fixtureRoot,
    keptFixture: true,
    stepCount: steps.length,
    steps,
    error: error instanceof Error ? error.message : String(error),
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error("Workspace pipeline E2E failed.");
    console.error(`Fixture kept for inspection: ${fixtureParentRoot}`);
    console.error(result.error);
  }
  process.exitCode = 1;
} finally {
  if (process.exitCode !== 1) {
    cleanup();
  }
}
