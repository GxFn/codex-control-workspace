#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const script = path.join(workspaceRoot, "scripts/check-decision-preflight.mjs");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function makeFixture({ includeSection = true, emptyField = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "check-decision-preflight-"));
  writeFile(
    path.join(root, ".workspace-active/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/plan.md](current/plan.md) | fixture | fixture |
`,
  );
  writeFile(
    path.join(root, ".workspace-active/workspace/current/plan.md"),
    `
# Fixture Plan

## 目标判断

- 用户目标：fixture。

${includeSection ? `## 总控决策记录

- 本次决策触发：用户要求调整总控规则。
- 需求 / 测试结果理解：这是规则治理，不是产品实现。
- 已核对证据：当前入口和相关模板。
- 是否需要先验证 / 重新计划 / 用户确认：${emptyField ? "" : "不需要重新派发，修改后运行脚本验证。"}
- 本次允许更新：规则、模板、校验脚本。
- 本次不得更新：不得改产品源码或创建测试单。
` : ""}

## 窗口分派

发送给：无

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>无任务 | None |
`,
  );
  return root;
}

function run(root) {
  return spawnSync("node", [script, "--root", root, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("passes when the current plan records decision preflight", () => {
  const result = run(makeFixture());
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.presentFields.length, 6);
});

test("fails when the current plan lacks decision preflight", () => {
  const result = run(makeFixture({ includeSection: false }));
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing ## 总控决策记录/);
});

test("fails placeholder or empty decision fields", () => {
  const result = run(makeFixture({ emptyField: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /empty or placeholder/);
});
