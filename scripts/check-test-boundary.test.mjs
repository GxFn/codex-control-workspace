#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const script = path.join(workspaceRoot, "scripts/check-test-boundary.mjs");
const legacyConfig = path.join(workspaceRoot, "scripts/fixtures/legacy-alembic-workspace.config.json");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function makeFixture({
  alembicTestStatus = "无任务",
  alembicTestTask = "Test task",
  testStatus = "已完成",
  includeBoundary = false,
  planExtra = "",
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "check-test-boundary-"));
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/plan.md](current/plan.md) | fixture | fixture |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/plan.md"),
    `
# Fixture Plan

## 窗口分派

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>无任务 | None |
| \`AlembicCore\`<br>无任务 | None |
| \`AlembicAgent\`<br>无任务 | None |
| \`AlembicDashboard\`<br>无任务 | None |
| \`AlembicPlugin\`<br>无任务 | None |
| \`AlembicTest\`<br>${alembicTestStatus} | ${alembicTestTask} |
| \`BiliDili\`<br>无任务 | None |
${planExtra}
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/alembic-test-exchange.md"),
    `
# AlembicTest Exchange

## 当前测试单

### Test-2026-05-26-99：Fixture

状态：${testStatus}

#### 测试目标

- Fixture
${includeBoundary ? `
#### 总控自测排除理由

- 为什么总控不能自己完成验证：需要真实项目环境。
- 需要的真实场景 / 真实项目 / cold-start / rescan / Dashboard 手动观察 / 运行时监控 / 跨仓库环境证据：真实项目运行时。
- 已由总控自行完成的最小验证：脚本校验已通过。

#### 测试前边界与多条件判断

- 测试要回答的问题：真实项目是否复现。
- 测试对象 / 目标窗口 / 线程 / 项目边界：AlembicTest 真实项目窗口。
- 总控可自测项：脚本和文档。
- 必须交给 \`AlembicTest\` 的真实场景条件：真实项目运行。
- 成功能推出的结论：真实场景通过。
- 失败能推出的结论：真实场景未通过。
- 不能推出的结论：不能推出源码根因。
- 停止或不开始条件：缺少真实项目配置。
` : ""}
`,
  );
  return root;
}

function run(root) {
  return spawnSync("node", [script, "--root", root, "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CODEX_CONTROL_WORKSPACE_CONFIG: legacyConfig },
  });
}

test("passes when AlembicTest is not send-eligible", () => {
  const root = makeFixture();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.testWindowSendEligible, false);
});

test("fails when AlembicTest is send-eligible without active test card", () => {
  const root = makeFixture({ alembicTestStatus: "待启动", testStatus: "已完成" });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no active AlembicTest test card exists/);
});

test("passes AlembicTest non-test thread registry tasks without a test card", () => {
  const root = makeFixture({
    alembicTestStatus: "待启动",
    alembicTestTask: "回填本窗口可见 Codex thread id；非测试型线程登记，不运行真实项目测试。",
    testStatus: "已完成",
    planExtra: `

## 测试交接

- 是否需要 \`AlembicTest\`：否；本轮 AlembicTest 只作为非测试型 thread registry 目标窗口。
`,
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.testWindowSendEligible, true);
  assert.equal(parsed.testWindowNonTestOnly, true);
  assert.equal(parsed.activeTestCount, 0);
});

test("passes AlembicTest non-test automation smoke tasks without a test card", () => {
  const root = makeFixture({
    alembicTestStatus: "待启动",
    alembicTestTask: "非测试型 Codex Automation Closed Loop smoke：回填 TargetResultEnvelope 和本窗口自动化日志，不运行真实项目测试。",
    testStatus: "已完成",
    planExtra: `

## 目标判断

- 用户目标：Codex Automation Closed Loop 真实 heartbeat smoke。
- 不纳入本轮事项：不运行真实项目测试，不创建 AlembicTest 测试单。

## 测试交接

- 是否需要 \`AlembicTest\`：否；本轮 AlembicTest 只作为非测试型自动化可见窗口参与 heartbeat smoke。
`,
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.testWindowSendEligible, true);
  assert.equal(parsed.testWindowNonTestOnly, true);
  assert.equal(parsed.activeTestCount, 0);
});

test("fails active test cards that lack boundary judgment", () => {
  const root = makeFixture({ alembicTestStatus: "待启动", testStatus: "待启动" });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing test-boundary field/);
});

test("passes active test cards with self-test exclusion and boundary judgment", () => {
  const root = makeFixture({ alembicTestStatus: "待启动", testStatus: "待启动", includeBoundary: true });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.activeTestCount, 1);
});
