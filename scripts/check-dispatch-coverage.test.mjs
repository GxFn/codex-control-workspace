import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptsDir);
const checkScript = path.join(scriptsDir, "check-dispatch-coverage.mjs");
const checkTodoScript = path.join(scriptsDir, "check-todo-board.mjs");
const legacyConfig = path.join(scriptsDir, "fixtures/legacy-alembic-workspace.config.json");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function createFixture(extraRow) {
  const root = mkdtempSync(path.join(tmpdir(), "alembic-dispatch-coverage-"));
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/example-plan.md](current/example-plan.md) | 待启动 | fixture |
| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 待启动 | fixture |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/example-plan.md"),
    `
# Example Plan

状态：待启动
发送给：\`Alembic\`

## 窗口分派

发送给：\`Alembic\`

| 窗口 / 状态 | 任务 |
| --- | --- |
${extraRow ? `${extraRow}\n` : ""}| \`Alembic\`<br>待启动 | 执行任务。 |
| \`AlembicCore\`<br>观察中 | 当前不发送。 |
| \`AlembicAgent\`<br>无任务 | 当前不发送。 |
| \`AlembicDashboard\`<br>无任务 | 当前不发送。 |
| \`AlembicPlugin\`<br>无任务 | 当前不发送。 |
| \`AlembicTest\`<br>阻塞 | 等待上游。 |
| \`BiliDili\`<br>无任务 | 不改真实项目源码。 |

## 可复制提示词

发送给：\`Alembic\`

\`\`\`text
先读取 AGENTS.md、docs/workspace/index.md、docs/workspace/current/example-plan.md，以及你所在窗口/目标仓库的 AGENTS.md。
先明确声明当前窗口定位和本轮仓库职责。
\`\`\`
`,
  );
  return root;
}

function runCheck(root) {
  return spawnSync("node", [checkScript], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CODEX_CONTROL_WORKSPACE_CONFIG: legacyConfig },
  });
}

function runDefaultCheck(root, script, args = []) {
  return spawnSync("node", [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
}

test("completed nonstandard coverage row is accepted without unexpected-window warning", () => {
  const root = createFixture("| `progressive-chain-validation`<br>已完成 | Wave 0 已验收；当前不发送。 |");

  const result = runCheck(root);

  assert.equal(result.status, 0);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /unexpected dispatch window: progressive-chain-validation/);
});

test("send-eligible nonstandard coverage row fails closed", () => {
  const root = createFixture("| `custom-worker`<br>待启动 | 不应直接进入发送名单。 |");

  const result = runCheck(root);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /unexpected send-eligible dispatch window: custom-worker/);
});

test("armed Alembic window remains send-covered after automation creation", () => {
  const root = createFixture("");
  writeFile(
    path.join(root, "docs/workspace/current/example-plan.md"),
    `
# Example Plan

状态：执行中（已 arm）
发送给：\`Alembic\`

## 窗口分派

发送给：\`Alembic\`

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>已 arm | 目标 heartbeat 已创建，等待 claim。 |
| \`AlembicCore\`<br>观察中 | 当前不发送。 |
| \`AlembicAgent\`<br>无任务 | 当前不发送。 |
| \`AlembicDashboard\`<br>无任务 | 当前不发送。 |
| \`AlembicPlugin\`<br>无任务 | 当前不发送。 |
| \`AlembicTest\`<br>无任务 | 当前不发送。 |
| \`BiliDili\`<br>无任务 | 不改真实项目源码。 |

## 可复制提示词

发送给：\`Alembic\`

\`\`\`text
先读取 AGENTS.md、docs/workspace/index.md、docs/workspace/current/example-plan.md，以及你所在窗口/目标仓库的 AGENTS.md。
先明确声明当前窗口定位和本轮仓库职责。
\`\`\`
`,
  );

  const result = runCheck(root);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Send prompts to: Alembic/);
});

test("default workspace control template covers required windows and TODO scheduling", () => {
  const root = mkdtempSync(path.join(tmpdir(), "control-template-coverage-"));
  const template = readFileSync(path.join(repoRoot, "templates/workspace-control-plan-template.md"), "utf8");
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/template-plan.md](current/template-plan.md) | 暂停 | fixture |
| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 暂停 | fixture |
`,
  );
  writeFile(path.join(root, "docs/workspace/current/template-plan.md"), template);

  const dispatch = runDefaultCheck(root, checkScript);
  const todo = runDefaultCheck(root, checkTodoScript, ["--require"]);

  assert.equal(dispatch.status, 0, `${dispatch.stdout}\n${dispatch.stderr}`);
  assert.equal(todo.status, 0, `${todo.stdout}\n${todo.stderr}`);
});
