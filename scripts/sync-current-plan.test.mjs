import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptsDir);
const syncScript = path.join(scriptsDir, "sync-current-plan.mjs");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function readFile(file) {
  return readFileSync(file, "utf8");
}

function createWorkspaceFixture({
  planSync = "",
  planSyncPlacement = "bottom",
  planStatus = "新状态",
  planHeading = "Example Plan",
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "alembic-sync-current-plan-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture Agents\n");
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/example-plan.md](current/example-plan.md) | 旧状态 | 旧计划说明 |
| 当前状态 | [current/workspace-current-status.md](current/workspace-current-status.md) | 旧状态 | 旧状态说明 |
| 旧行 | [current/old.md](current/old.md) | 观察中 | 应保留 |

## 窗口覆盖状态

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>无任务 | 旧 |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/index.md"),
    `
# Current

## 当前地图

| 类型 | 文档 | 说明 |
| --- | --- | --- |
| 当前状态 | [workspace-current-status.md](workspace-current-status.md) | 旧状态 |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/workspace-current-status.md"),
    `
# Status

状态：旧状态

## 状态摘要

- 当前计划：[old.md](old.md)。
- 旧摘要。

## 窗口分派

发送给：\`Alembic\`

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>待启动 | 旧任务 |

## 可复制提示词

旧提示词

## 回填区

- 旧记录。
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/example-plan.md"),
    `
# ${planHeading}

状态：${planStatus}

${planSyncPlacement === "top" ? planSync : ""}

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>无任务 | 新任务 |
| \`AlembicCore\`<br>无任务 | 新任务 |
| \`AlembicAgent\`<br>已完成 | 新任务 |
| \`AlembicDashboard\`<br>已完成 | 新任务 |
| \`AlembicPlugin\`<br>无任务 | 新任务 |
| \`AlembicTest\`<br>已完成 | 新任务 |
| \`BiliDili\`<br>无任务 | 新任务 |

## 当前可复制分派提示词

发送给：无。

\`\`\`text
先读取 AGENTS.md 和目标仓库 AGENTS.md。
先明确声明当前窗口定位和本轮仓库职责。
\`\`\`

## 回填区

- Fixture 回填记录。

${planSyncPlacement === "bottom" ? planSync : ""}
`,
  );
  return root;
}

function runSync(root, args = []) {
  return execFileSync("node", [syncScript, "--root", root, ...args], {
    encoding: "utf8",
  });
}

function runSyncResult(root, args = []) {
  return spawnSync("node", [syncScript, "--root", root, ...args], {
    encoding: "utf8",
  });
}

test("dry-run reports changes without writing repeated current-control docs", () => {
  const root = createWorkspaceFixture({
    planSync: `
<!-- workspace-sync
{
  "status": "同步状态",
  "indexPlanDescription": "同步计划说明",
  "indexStatusDescription": "同步状态说明",
  "currentIndexType": "当前专项",
  "currentIndexDescription": "同步当前地图说明",
  "currentStatusSummary": "同步状态摘要。"
}
-->
`,
  });

  const before = readFile(path.join(root, "docs/workspace/index.md"));
  const output = runSync(root);

  assert.match(output, /would update docs\/workspace\/index\.md/);
  assert.equal(readFile(path.join(root, "docs/workspace/index.md")), before);
});

test("--write syncs index rows, current map row, dispatch section, and prompt section", () => {
  const root = createWorkspaceFixture({
    planSync: `
<!-- workspace-sync
{
  "status": "同步状态",
  "indexPlanDescription": "同步计划说明",
  "indexStatusDescription": "同步状态说明",
  "currentIndexType": "当前专项",
  "currentIndexDescription": "同步当前地图说明",
  "currentStatusSummary": "同步状态摘要。"
}
-->
`,
  });

  runSync(root, ["--write"]);

  const index = readFile(path.join(root, "docs/workspace/index.md"));
  const currentIndex = readFile(path.join(root, "docs/workspace/current/index.md"));
  const status = readFile(path.join(root, "docs/workspace/current/workspace-current-status.md"));

  assert.match(index, /\| 当前计划 \| \[current\/example-plan\.md]\(current\/example-plan\.md\) \| 同步状态 \| 同步计划说明 \|/);
  assert.match(index, /\| 当前状态 \| \[current\/workspace-current-status\.md]\(current\/workspace-current-status\.md\) \| 同步状态 \| 同步状态说明 \|/);
  assert.match(index, /## 窗口覆盖状态[\s\S]*\| `AlembicDashboard`<br>已完成 \| 新任务 \|/);
  assert.match(currentIndex, /\| 当前专项 \| \[example-plan\.md]\(example-plan\.md\) \| 同步当前地图说明 \|/);
  assert.match(status, /^状态：同步状态$/m);
  assert.match(status, /- 当前计划：\[example-plan\.md]\(example-plan\.md\)。/);
  assert.match(status, /- 同步状态摘要。/);
  assert.match(status, /\| `AlembicDashboard`<br>已完成 \| 新任务 \|/);
  assert.match(status, /## 可复制提示词\n\n发送给：无。/);
});

test("--check fails when generated surfaces are stale and passes after --write", () => {
  const root = createWorkspaceFixture();

  const stale = runSyncResult(root, ["--check"]);
  assert.notEqual(stale.status, 0);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /out of sync/);

  runSync(root, ["--write"]);
  const fresh = runSyncResult(root, ["--check"]);
  assert.equal(fresh.status, 0);
});

test("workspace-sync extra rows synchronize controlled index and current-index entries", () => {
  const root = createWorkspaceFixture({
    planSync: `
<!-- workspace-sync
{
  "status": "同步状态",
  "indexRows": [
    {
      "type": "Dashboard 回填",
      "doc": "docs/AlembicDashboard/dashboard-backfill.md",
      "status": "总控验收通过",
      "description": "Dashboard 回填说明",
      "insertAfter": "当前状态"
    }
  ],
  "currentIndexRows": [
    {
      "type": "Dashboard 回填",
      "doc": "docs/AlembicDashboard/dashboard-backfill.md",
      "description": "短期地图回填说明"
    }
  ]
}
-->
`,
  });
  writeFile(path.join(root, "docs/AlembicDashboard/dashboard-backfill.md"), "# Backfill\n");

  runSync(root, ["--write"]);

  const index = readFile(path.join(root, "docs/workspace/index.md"));
  const currentIndex = readFile(path.join(root, "docs/workspace/current/index.md"));

  assert.match(index, /\| Dashboard 回填 \| \[\.\.\/AlembicDashboard\/dashboard-backfill\.md]\(\.\.\/AlembicDashboard\/dashboard-backfill\.md\) \| 总控验收通过 \| Dashboard 回填说明 \|/);
  assert.match(currentIndex, /\| Dashboard 回填 \| \[\.\.\/\.\.\/AlembicDashboard\/dashboard-backfill\.md]\(\.\.\/\.\.\/AlembicDashboard\/dashboard-backfill\.md\) \| 短期地图回填说明 \|/);
});

test("invalid workspace-sync JSON fails closed without writing", () => {
  const root = createWorkspaceFixture({
    planSync: `
<!-- workspace-sync
{ "status": "broken",
-->
`,
  });
  const before = readFile(path.join(root, "docs/workspace/index.md"));

  const result = runSyncResult(root, ["--write"]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Invalid workspace-sync JSON/);
  assert.equal(readFile(path.join(root, "docs/workspace/index.md")), before);
});

test("workspace-sync row targets cannot escape the workspace", () => {
  const root = createWorkspaceFixture({
    planSync: `
<!-- workspace-sync
{
  "status": "同步状态",
  "indexRows": [
    {
      "type": "越界",
      "doc": "../outside.md",
      "status": "不应写入",
      "description": "不应写入"
    }
  ]
}
-->
`,
  });
  const before = readFile(path.join(root, "docs/workspace/index.md"));

  const result = runSyncResult(root, ["--write"]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must stay inside workspace/);
  assert.equal(readFile(path.join(root, "docs/workspace/index.md")), before);
});

test("workspace-sync metadata cannot sit above human-facing plan content", () => {
  const root = createWorkspaceFixture({
    planSyncPlacement: "top",
    planSync: `
<!-- workspace-sync
{
  "status": "同步状态"
}
-->
`,
  });
  const before = readFile(path.join(root, "docs/workspace/index.md"));

  const result = runSyncResult(root, ["--write"]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must appear after `## 回填区`/);
  assert.equal(readFile(path.join(root, "docs/workspace/index.md")), before);
});
