#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const script = path.join(workspaceRoot, "scripts/visible-dispatch.mjs");
const legacyConfig = path.join(workspaceRoot, "scripts/fixtures/legacy-alembic-workspace.config.json");
const visibleWindows = [
  "Alembic",
  "AlembicCore",
  "AlembicAgent",
  "AlembicDashboard",
  "AlembicPlugin",
  "AlembicTest",
];

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function makeFixture({
  planStatus = "待启动",
  alembicStatus = "待启动",
  alembicTask = "Fixture task",
  sendTo = "`Alembic`",
  globalTodoRows = "",
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/plan.md](current/plan.md) | ${planStatus} | Fixture |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/plan.md"),
    `
# Fixture Plan

状态：${planStatus}

## 窗口分派

发送给：${sendTo}

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>${alembicStatus} | ${alembicTask} |
| \`AlembicCore\`<br>观察中 | Wait |
| \`AlembicAgent\`<br>无任务 | None |
| \`AlembicDashboard\`<br>无任务 | None |
| \`AlembicPlugin\`<br>无任务 | None |
| \`AlembicTest\`<br>无任务 | None |
| \`BiliDili\`<br>无任务 | None |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/global-todo-board.md"),
    `
# Fixture Global TODO

## 全局 TODO

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 | 当前挂载 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${globalTodoRows}
`,
  );
  return root;
}

function writeFullWindowPlan(root, { planFile, round, planStatus = "待启动" }) {
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/${planFile}](current/${planFile}) | ${planStatus} | Fake TODO round ${round} |
`,
  );
  writeFile(
    path.join(root, `docs/workspace/current/${planFile}`),
    `
# Fake TODO Round ${round}

状态：${planStatus}

## 窗口分派

发送给：${visibleWindows.map((windowName) => `\`${windowName}\``).join("、")}

| 窗口 / 状态 | 任务 |
| --- | --- |
${visibleWindows.map((windowName) => `| \`${windowName}\`<br>待启动 | Fake TODO round ${round} for ${windowName} |`).join("\n")}
| \`BiliDili\`<br>无任务 | None |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/global-todo-board.md"),
    `
# Fixture Global TODO

## 全局 TODO

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 | 当前挂载 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GTODO-FAKE-${round} | 待排期 | fake visible dispatch | P0 | \`AlembicWorkspace\` | Fake TODO round ${round} | 是 | fixture | \`AlembicWorkspace\` | ${planFile} |
`,
  );
}

function writeTwoWindowPlan(root, { planFile = "batch-return-plan.md", planStatus = "待启动" } = {}) {
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/${planFile}](current/${planFile}) | ${planStatus} | Batch return fixture |
`,
  );
  writeFile(
    path.join(root, `docs/workspace/current/${planFile}`),
    `
# Batch Return Plan

状态：${planStatus}

## 窗口分派

发送给：\`Alembic\`、\`AlembicCore\`

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>待启动 | Batch task for Alembic |
| \`AlembicCore\`<br>待启动 | Batch task for AlembicCore |
| \`AlembicAgent\`<br>无任务 | None |
| \`AlembicDashboard\`<br>无任务 | None |
| \`AlembicPlugin\`<br>无任务 | None |
| \`AlembicTest\`<br>无任务 | None |
| \`BiliDili\`<br>无任务 | None |
`,
  );
  writeFile(
    path.join(root, "docs/workspace/current/global-todo-board.md"),
    `
# Fixture Global TODO

## 全局 TODO

| ID | 状态 | 类型 | 优先级 | 归属 | 事项 / 目标 | 影响复测 / 派发 | 依赖 / 触发 | 推荐窗口 | 当前挂载 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
`,
  );
}

function argValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name && args[index + 1] && !args[index + 1].startsWith("--")) {
      values.push(args[index + 1]);
      index += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return values;
}

function isPlaceholderThreadId(threadId) {
  return !threadId || /^current[-_\s]*codex[-_\s]*thread$/i.test(threadId) || /^<.*>$/.test(threadId);
}

function writeCodexSession(root, threadId, { cwd = root, title = `Fixture ${threadId}` } = {}) {
  if (isPlaceholderThreadId(threadId)) return;
  const safe = threadId.replace(/[^a-zA-Z0-9-]/g, "-");
  writeFile(
    path.join(root, ".codex/sessions/2026/05/26", `rollout-2026-05-26T00-00-00-${safe}.jsonl`),
    `{"type":"session_meta","payload":{"id":"${threadId}","cwd":"${cwd}","title":"${title}","source":"test"}}
{"type":"response.completed","payload":{"type":"response.completed"}}
`,
  );
}

function run(root, args, { autoSession = true } = {}) {
  if (autoSession) {
    for (const threadId of argValues(args, "--thread")) {
      writeCodexSession(root, threadId);
    }
  }
  return spawnSync("node", [script, ...args, "--root", root], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_CONTROL_WORKSPACE_CONFIG: legacyConfig,
      CODEX_HOME: path.join(root, ".codex"),
      CODEX_VAD_KEEP_AWAKE: "0",
    },
  });
}

function runGeneric(controlRoot, args, { autoSession = true } = {}) {
  if (autoSession) {
    for (const threadId of argValues(args, "--thread")) {
      writeCodexSession(controlRoot, threadId);
    }
  }
  return spawnSync("node", [script, ...args, "--root", controlRoot], {
    cwd: controlRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_CONTROL_WORKSPACE_CONFIG: "",
      CODEX_HOME: path.join(controlRoot, ".codex"),
      CODEX_VAD_KEEP_AWAKE: "0",
    },
  });
}

function runWithKeepAwake(root, args) {
  return spawnSync("node", [script, ...args, "--root", root], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_CONTROL_WORKSPACE_CONFIG: legacyConfig,
      CODEX_HOME: path.join(root, ".codex"),
      CODEX_VAD_KEEP_AWAKE: "1",
    },
  });
}

function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function waitForPidExit(pid, timeoutMs = 1000) {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidIsRunning(pid)) {
      return true;
    }
    Atomics.wait(waitBuffer, 0, 0, 25);
  }
  return !pidIsRunning(pid);
}

function readJson(root, relative) {
  return JSON.parse(readFileSync(path.join(root, relative), "utf8"));
}

function writeJson(root, relative, value) {
  writeFile(path.join(root, relative), JSON.stringify(value, null, 2));
}

test("status is read-only and defaults to disabled mode", () => {
  const root = makeFixture();
  const result = run(root, ["status", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "disabled");
  assert.equal(parsed.registeredWindows, 0);
  assert.equal(parsed.scriptComplete, true);
  assert.match(parsed.agentNext, /Automation is disabled|Script completed/);
});

test("init prepares local runtime files without enabling dispatch", () => {
  const root = makeFixture();
  const result = run(root, ["init", "--write", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.wrote, true);
  assert.deepEqual(parsed.created.sort(), ["groups", "queue", "registry", "runs", "state"]);
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/state.json").mode, "disabled");
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks.length, 0);
});

test("mode changes require explicit write", () => {
  const root = makeFixture();
  const dryRun = run(root, ["mode", "--enable", "--json"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).wrote, false);

  const written = run(root, ["mode", "--enable", "--write", "--json"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).state.mode, "enabled");
  assert.equal(JSON.parse(written.stdout).state.keepAwake.enabled, false);
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/state.json").mode, "enabled");
});

test("stop-plan disables future dispatch jumps without running post-run audit", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  const result = run(root, ["stop-plan", "--write", "--reason", "manual stop", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.operation, "stop-plan");
  assert.equal(parsed.mode, "disabled");
  assert.equal(parsed.loopEnabled, false);
  const state = readJson(root, ".workspace-local/visible-dispatch/state.json");
  assert.equal(state.mode, "disabled");
  assert.equal(state.reason, "manual stop");
});

test("mode enable and disable manage the local keep-awake process on macOS", { skip: process.platform !== "darwin" }, () => {
  const root = makeFixture();
  const keepAwakeCommand = process.execPath;
  const keepAwakeArgs = ["-e", "setInterval(() => {}, 1000)"];
  let keepAwakePid = 0;
  try {
    const enable = runWithKeepAwake(root, [
      "mode",
      "--enable",
      "--write",
      "--json",
      "--keep-awake-command",
      keepAwakeCommand,
      ...keepAwakeArgs.flatMap((arg) => ["--keep-awake-arg", arg]),
    ]);
    assert.equal(enable.status, 0, enable.stderr);
    const enabled = JSON.parse(enable.stdout);
    assert.equal(enabled.keepAwake.active, true);
    assert.equal(enabled.keepAwake.command, keepAwakeCommand);
    assert.equal(enabled.keepAwake.strategy, "watcher");
    assert.ok(enabled.keepAwake.pid > 0);
    assert.ok(enabled.keepAwake.childPid > 0);
    keepAwakePid = enabled.keepAwake.pid;

    const disable = run(root, ["mode", "--disable", "--write", "--json", "--reason", "test close"]);
    assert.equal(disable.status, 0, disable.stderr);
    const disabled = JSON.parse(disable.stdout);
    assert.equal(disabled.state.mode, "disabled");
    assert.equal(disabled.keepAwake.enabled, false);
    assert.equal(disabled.keepAwake.active, false);
    assert.equal(disabled.keepAwake.pid, 0);
    assert.equal(disabled.keepAwake.stopReason, "test close");
    assert.equal(waitForPidExit(keepAwakePid), true);
    keepAwakePid = 0;
  } finally {
    if (keepAwakePid && pidIsRunning(keepAwakePid)) {
      process.kill(keepAwakePid, "SIGTERM");
    }
  }
});

test("registry rejects non-Alembic target windows", () => {
  const root = makeFixture();
  const result = run(root, ["register", "--window", "BiliDili", "--thread", "thread-1", "--write"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported visible dispatch window/);
});

test("register stores thread ids locally without echoing them in JSON output", () => {
  const root = makeFixture();
  const result = run(root, [
    "register",
    "--window",
    "Alembic",
    "--thread",
    "thread-visible-secret",
    "--write",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.entry.threadId, "<local-only>");
  assert.equal(parsed.storedThreadId, "local-only");

  const registry = readJson(root, ".workspace-local/visible-dispatch/window-registry.json");
  assert.equal(registry.windows[0].threadId, "thread-visible-secret");
});

test("register rejects placeholder thread ids and unregister removes polluted entries", () => {
  const root = makeFixture();
  const invalid = run(root, [
    "register",
    "--window",
    "AlembicTest",
    "--thread",
    "current-codex-thread",
    "--write",
    "--json",
  ]);
  assert.notEqual(invalid.status, 0);
  assert.match(JSON.parse(invalid.stdout).error, /Invalid visible dispatch thread id placeholder/);

  const valid = run(root, ["register", "--window", "AlembicTest", "--thread", "thread-valid-test", "--write", "--json"]);
  assert.equal(valid.status, 0, valid.stderr);
  const removed = run(root, ["unregister", "--window", "AlembicTest", "--write", "--json"]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).removed, 1);
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/window-registry.json").windows.length, 0);
});

test("enqueue from current plan creates only send-eligible Alembic tasks", () => {
  const root = makeFixture();
  const result = run(root, ["enqueue", "--from-plan", "--write", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.created.length, 1);
  assert.equal(parsed.created[0].targetWindow, "Alembic");
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(queue.tasks.length, 1);
});

test("enqueue distinguishes explicit task package ids in the same plan and window", () => {
  const root = makeFixture({ alembicTask: "执行 `G037-STAGE0-ALEMBIC`" });
  const first = run(root, ["enqueue", "--from-plan", "--write", "--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).created[0].taskId, "plan__Alembic__G037-STAGE0-ALEMBIC");

  writeFile(
    path.join(root, "docs/workspace/current/plan.md"),
    `
# Fixture Plan

状态：待启动

## 窗口分派

发送给：\`Alembic\`

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`Alembic\`<br>待启动 | 执行 \`G037-STAGE1-ALEMBIC\` |
| \`AlembicCore\`<br>观察中 | Wait |
| \`AlembicAgent\`<br>无任务 | None |
| \`AlembicDashboard\`<br>无任务 | None |
| \`AlembicPlugin\`<br>无任务 | None |
| \`AlembicTest\`<br>无任务 | None |
| \`BiliDili\`<br>无任务 | None |
`,
  );

  const tick = run(root, ["controller-tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.equal(
    JSON.parse(tick.stdout).missingSendEligibleWindows[0].taskId,
    "plan__Alembic__G037-STAGE1-ALEMBIC",
  );

  const second = run(root, ["enqueue", "--from-plan", "--write", "--json"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).created[0].taskId, "plan__Alembic__G037-STAGE1-ALEMBIC");
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.deepEqual(
    queue.tasks.map((task) => task.taskId),
    ["plan__Alembic__G037-STAGE0-ALEMBIC", "plan__Alembic__G037-STAGE1-ALEMBIC"],
  );
});

test("claim leases one task and prevents duplicate active claims", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);

  const first = run(root, ["claim", "--window", "Alembic", "--write", "--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).claimed.status, "claimed");

  const second = run(root, ["claim", "--window", "Alembic", "--write", "--json"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).claimed, null);
});

test("arm outputs a heartbeat payload without calling automation APIs", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-visible-1", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const result = run(root, ["arm", "--task", queue.tasks[0].taskId, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.payload.kind, "heartbeat");
  assert.equal(parsed.payload.name, "继续 Alembic 任务");
  assert.equal(parsed.payload.targetThreadId, "thread-visible-1");
  assert.equal(parsed.payload.rrule, "FREQ=MINUTELY;INTERVAL=1");
  assert.equal(parsed.payload.chainMode, "finish-chain");
  assert.match(parsed.payload.prompt, /继续当前窗口任务：Alembic/);
  assert.match(parsed.payload.prompt, /先读取 AGENTS\.md、docs\/workspace\/index\.md/);
  assert.match(parsed.payload.prompt, /先明确声明当前窗口定位和本轮仓库职责/);
  assert.match(parsed.payload.prompt, /Codex 子 agent/);
  assert.match(parsed.payload.prompt, /最终由当前窗口统一复核和回填/);
  assert.match(parsed.payload.prompt, /完成后回填：完成范围、提交 hash、验证命令/);
  assert.match(parsed.payload.prompt, /currentWindow：Alembic/);
  assert.match(parsed.payload.prompt, /taskId：plan__Alembic/);
  assert.match(parsed.payload.prompt, /controlDoc：docs\/workspace\/current\/plan\.md/);
  assert.match(parsed.payload.prompt, /用完即弃/);
  assert.match(parsed.payload.prompt, /按 target skill 领取\/完成/);
  assert.match(parsed.payload.prompt, /只处理本窗口任务/);
  assert.match(parsed.payload.prompt, /visible-automation-dispatch-target\/SKILL\.md/);
  assert.doesNotMatch(parsed.payload.prompt, /claim --window Alembic --write/);
  assert.doesNotMatch(parsed.payload.prompt, /finish --window Alembic/);
  assert.doesNotMatch(parsed.payload.prompt, /record-stop --automation-id/);
  assert.doesNotMatch(parsed.payload.prompt, /target completed/);
  assert.doesNotMatch(parsed.payload.prompt, /courierAllowed === true/);
  assert.doesNotMatch(parsed.payload.prompt, /recordArmCommand/);
  assert.doesNotMatch(parsed.payload.prompt, /无人值守接续规则/);
  assert.doesNotMatch(parsed.payload.prompt, /returnToController/);
  assert.ok(parsed.payload.prompt.length < 1050);
});

test("preflight verifies registered target threads resolve to local Codex sessions", () => {
  const root = makeFixture();
  run(root, ["register", "--window", "Alembic", "--thread", "thread-visible-1", "--write"]);

  const result = run(root, ["preflight", "--from-plan", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ready, true);
  assert.equal(parsed.requiredWindowCount, 1);
  assert.equal(parsed.windows[0].windowName, "Alembic");
  assert.equal(parsed.windows[0].threadId, "<local-only>");
  assert.equal(parsed.windows[0].session.found, true);
  assert.equal(parsed.windows[0].session.sessionStatus, "idle");
});

test("preflight blocks registered windows whose thread id has no local Codex session", () => {
  const root = makeFixture();
  run(root, ["register", "--window", "Alembic", "--thread", "thread-missing-session", "--write"], { autoSession: false });

  const result = run(root, ["preflight", "--from-plan", "--json"]);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ready, false);
  assert.match(parsed.issues.join("\n"), /No local Codex session was found for Alembic/);
});

test("arm refuses to print a heartbeat payload for an unverified thread", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-missing-session", "--write"], { autoSession: false });
  run(root, ["enqueue", "--from-plan", "--write"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const result = run(root, ["arm", "--task", queue.tasks[0].taskId, "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).error, /No local Codex session was found for Alembic/);
});

test("arm-batch prepares payloads for every queued task in a dispatch group", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-arm-batch-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);

  const enqueued = run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-1",
    "--return-policy",
    "controller-last",
    "--write",
    "--json",
  ]);
  assert.equal(enqueued.status, 0, enqueued.stderr);
  assert.equal(JSON.parse(enqueued.stdout).groupId, "batch-1");

  const result = run(root, ["arm-batch", "--group", "batch-1", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.staggerSeconds, 20);
  assert.match(parsed.staggerInstructions, /waitBeforeCreateSeconds/);
  assert.equal(parsed.payloads.length, 2);
  assert.deepEqual(
    parsed.payloads.map((item) => item.targetWindow).sort(),
    ["Alembic", "AlembicCore"],
  );
  assert.deepEqual(
    parsed.payloads.map((item) => item.createOrder),
    [1, 2],
  );
  assert.deepEqual(
    parsed.payloads.map((item) => item.createDelaySeconds),
    [0, 20],
  );
  assert.deepEqual(
    parsed.payloads.map((item) => item.waitBeforeCreateSeconds),
    [0, 20],
  );
  assert.equal(parsed.payloads.every((item) => item.payload.chainMode === "finish-chain"), true);
  assert.doesNotMatch(parsed.payloads[0].payload.prompt, /returnToController/);
  assert.ok(parsed.payloads.every((item) => item.payload.prompt.length < 1100));
});

test("start-plan fast path enables mode, enqueues current plan, and prepares payloads", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-start-fast-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);

  const result = run(root, [
    "start-plan",
    "--write",
    "--group",
    "batch-1",
    "--return-policy",
    "controller-last",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "enabled");
  assert.equal(parsed.operation, "start-plan");
  assert.equal(parsed.action, "createHeartbeats");
  assert.equal(parsed.enqueue.createdCount, 2);
  assert.equal(parsed.arm.payloadCount, 2);
  assert.deepEqual(
    parsed.arm.payloads.map((item) => item.targetWindow).sort(),
    ["Alembic", "AlembicCore"],
  );
});

test("old generic start command is not accepted", () => {
  const root = makeFixture();
  const result = run(root, ["start", "--write", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).error, /Unknown visible-dispatch command: start/);
});

test("resume-plan fast path preserves an already queued group without duplicating tasks", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-restart-fast-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);
  run(root, ["start-plan", "--write", "--group", "batch-1", "--json"]);

  const result = run(root, ["resume-plan", "--write", "--group", "batch-1", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.operation, "resume-plan");
  assert.equal(parsed.action, "createHeartbeats");
  assert.equal(parsed.enqueue, null);
  assert.equal(parsed.arm.payloadCount, 2);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(queue.tasks.length, 2);
});

test("arm-batch supports explicit stagger interval and no-stagger mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-arm-batch-stagger-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-1",
    "--return-policy",
    "controller-last",
    "--write",
  ]);

  const staggered = run(root, ["arm-batch", "--group", "batch-1", "--stagger-seconds", "35", "--json"]);
  assert.equal(staggered.status, 0, staggered.stderr);
  const parsedStaggered = JSON.parse(staggered.stdout);
  assert.equal(parsedStaggered.staggerSeconds, 35);
  assert.deepEqual(
    parsedStaggered.payloads.map((item) => item.createDelaySeconds),
    [0, 35],
  );

  const unstaggered = run(root, ["arm-batch", "--group", "batch-1", "--no-stagger", "--json"]);
  assert.equal(unstaggered.status, 0, unstaggered.stderr);
  const parsedUnstaggered = JSON.parse(unstaggered.stdout);
  assert.equal(parsedUnstaggered.staggerSeconds, 0);
  assert.deepEqual(
    parsedUnstaggered.payloads.map((item) => item.waitBeforeCreateSeconds),
    [0, 0],
  );
});

test("arm-batch skips queued tasks whose registered thread lacks a local session", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-arm-batch-missing-session-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-missing-core", "--write"], { autoSession: false });
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-1",
    "--return-policy",
    "controller-last",
    "--write",
  ]);

  const result = run(root, ["arm-batch", "--group", "batch-1", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.payloads.map((item) => item.targetWindow), ["Alembic"]);
  assert.deepEqual(parsed.skipped.map((item) => item.targetWindow), ["AlembicCore"]);
  assert.match(parsed.skipped[0].reason, /No local Codex session was found for AlembicCore/);
});

test("record-arm persists automation id and prevents duplicate arming", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;

  const recorded = run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write", "--json"]);
  assert.equal(recorded.status, 0, recorded.stderr);
  const parsed = JSON.parse(recorded.stdout);
  assert.equal(parsed.task.status, "armed");
  assert.equal(parsed.task.automationId, "auto-1");
  assert.equal(parsed.run.automationId, "auto-1");

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const runs = readJson(root, ".workspace-local/visible-dispatch/automation-runs.json");
  assert.equal(queue.tasks[0].status, "armed");
  assert.equal(runs.runs.length, 1);

  const duplicate = run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write", "--json"]);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stdout, /only queued\/claimed tasks can record arming|already recorded/);
});

test("record-stop marks automation runs stopped and removes cleanup noise", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write"]);

  const before = run(root, ["cleanup", "--json"]);
  assert.equal(before.status, 0, before.stderr);
  assert.equal(JSON.parse(before.stdout).activeAutomationRuns.length, 1);

  const stopped = run(root, [
    "record-stop",
    "--automation-id",
    "auto-1",
    "--reason",
    "deleted after validation",
    "--write",
    "--json",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(JSON.parse(stopped.stdout).stoppedRuns[0].status, "stopped");

  const runs = readJson(root, ".workspace-local/visible-dispatch/automation-runs.json");
  assert.equal(runs.runs[0].status, "stopped");
  assert.equal(runs.runs[0].previousStatus, "active");
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(queue.tasks[0].automationStoppedAt.length > 0, true);

  run(root, ["mode", "--disable", "--write"]);
  const after = run(root, ["cleanup", "--json"]);
  assert.equal(after.status, 0, after.stderr);
  const afterParsed = JSON.parse(after.stdout);
  assert.equal(afterParsed.activeAutomationRuns.length, 0);
  assert.deepEqual(afterParsed.stoppedAutomationTasks, [taskId]);

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.equal(JSON.parse(tick.stdout).tasks[0].nextAction, "reviewStopped");
});

test("target-received disposable heartbeat keeps armed task waiting for claim", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write"]);

  const stopped = run(root, [
    "record-stop",
    "--automation-id",
    "auto-1",
    "--reason",
    "target received",
    "--write",
    "--json",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  const parsed = JSON.parse(tick.stdout);
  assert.equal(parsed.topAction, "wait");
  assert.equal(parsed.tasks[0].nextAction, "waitForClaim");
  assert.match(parsed.tasks[0].message, /received and disposed/);
});

test("audit-automation accepts a matching active target automation", () => {
  const root = makeFixture();
  assert.equal(run(root, ["mode", "--enable", "--write"]).status, 0);
  assert.equal(run(root, ["enqueue", "--from-plan", "--write"]).status, 0);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  assert.equal(run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write"]).status, 0);

  const result = run(root, ["audit-automation", "--automation-id", "auto-1", "--window", "Alembic", "--role", "target", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.compliant, true);
  assert.equal(parsed.deleteRecommended, false);
  assert.deepEqual(parsed.issues, []);
});

test("audit-automation recommends deleting stale or unknown automations", () => {
  const root = makeFixture();
  assert.equal(run(root, ["mode", "--enable", "--write"]).status, 0);
  assert.equal(run(root, ["enqueue", "--from-plan", "--write"]).status, 0);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  assert.equal(run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write"]).status, 0);
  writeFile(
    path.join(root, "docs/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/new-plan.md](current/new-plan.md) | 待启动 | New plan |
`,
  );
  writeFile(path.join(root, "docs/workspace/current/new-plan.md"), "# New Plan\n\n状态：待启动\n");

  const stale = run(root, ["audit-automation", "--automation-id", "auto-1", "--json"]);
  assert.equal(stale.status, 0, stale.stderr);
  const staleParsed = JSON.parse(stale.stdout);
  assert.equal(staleParsed.compliant, false);
  assert.equal(staleParsed.deleteRecommended, true);
  assert.match(staleParsed.issues.join("\n"), /does not match current plan/);

  const unknown = run(root, ["audit-automation", "--automation-id", "missing-auto", "--json"]);
  assert.equal(unknown.status, 0, unknown.stderr);
  const unknownParsed = JSON.parse(unknown.stdout);
  assert.equal(unknownParsed.compliant, false);
  assert.equal(unknownParsed.deleteRecommended, true);
  assert.match(unknownParsed.issues.join("\n"), /No active VAD automation run/);
});

test("block records automation failure as a task blocker", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;

  const blocked = run(root, [
    "block",
    "--task",
    taskId,
    "--reason",
    "heartbeat did not claim",
    "--write",
    "--json",
  ]);
  assert.equal(blocked.status, 0, blocked.stderr);
  const parsed = JSON.parse(blocked.stdout);
  assert.equal(parsed.blocked.status, "blocked");
  assert.equal(parsed.blocked.previousStatus, "queued");
  assert.equal(parsed.blocked.blockedReason, "heartbeat did not claim");

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.equal(JSON.parse(tick.stdout).tasks[0].nextAction, "resolveBlocker");
});

test("armed tasks wait for target claim and can be claimed", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-visible-1", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-1", "--write"]);

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  const tickParsed = JSON.parse(tick.stdout);
  assert.equal(tickParsed.topAction, "wait");
  assert.equal(tickParsed.tasks[0].nextAction, "waitForClaim");

  const claimed = run(root, ["claim", "--window", "Alembic", "--write", "--json"]);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(JSON.parse(claimed.stdout).claimed.status, "claimed");
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].automationClaimedAt.length > 0, true);
});

test("tick write marks expired armed tasks as stale", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  queue.tasks[0].status = "armed";
  queue.tasks[0].automationId = "auto-1";
  queue.tasks[0].armLeaseUntil = "2000-01-01T00:00:00.000Z";
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", queue);

  const result = run(root, ["tick", "--write", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.wrote, true);
  assert.equal(parsed.tasks[0].status, "stale");
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].previousStatus, "armed");
});

test("tick reports stopped mode without mutating state", () => {
  const root = makeFixture();
  const result = run(root, ["tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "disabled");
  assert.equal(parsed.topAction, "stopped");
  assert.equal(parsed.tasks.length, 0);
});

test("tick reports queued tasks as ready to arm when enabled and registered", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-visible-1", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);

  const result = run(root, ["tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "arm");
  assert.equal(parsed.tasks[0].nextAction, "arm");
});

test("controller and tick wait for active automation before arming more queued tasks", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-wait-before-arm-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFullWindowPlan(root, { planFile: "fake-todo-round-wait.md", round: "wait" });
  run(root, ["mode", "--enable", "--write"]);
  for (const windowName of visibleWindows) {
    const registered = run(root, [
      "register",
      "--window",
      windowName,
      "--thread",
      `thread-${windowName}`,
      "--write",
      "--json",
    ]);
    assert.equal(registered.status, 0, registered.stderr);
  }
  run(root, ["enqueue", "--from-plan", "--write"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const firstTask = queue.tasks.find((task) => task.targetWindow === "Alembic");
  assert.ok(firstTask);
  const armed = run(root, ["arm", "--task", firstTask.taskId, "--json"]);
  assert.equal(armed.status, 0, armed.stderr);
  const recorded = run(root, [
    "record-arm",
    "--task",
    firstTask.taskId,
    "--automation-id",
    "auto-wait-before-arm",
    "--write",
    "--json",
  ]);
  assert.equal(recorded.status, 0, recorded.stderr);

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  const tickParsed = JSON.parse(tick.stdout);
  assert.equal(tickParsed.topAction, "wait");
  assert.equal(tickParsed.tasks.some((task) => task.nextAction === "arm"), true);
  assert.equal(tickParsed.tasks.some((task) => task.waitState === "waiting"), true);

  const controller = run(root, ["controller-tick", "--json"]);
  assert.equal(controller.status, 0, controller.stderr);
  const controllerParsed = JSON.parse(controller.stdout);
  assert.equal(controllerParsed.topAction, "wait");
  assert.equal(controllerParsed.nextAction, "waitForBackfill");
});

test("controller-tick stops cleanly when automation mode is disabled", () => {
  const root = makeFixture();
  const result = run(root, ["controller-tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "disabled");
  assert.equal(parsed.topAction, "stopped");
  assert.equal(parsed.nextAction, "modeDisabled");
});

test("controller-tick enqueues send-eligible current-plan tasks before TODO work", () => {
  const root = makeFixture({
    globalTodoRows:
      "| GTODO-1 | 待排期 | feature | P0 | `AlembicWorkspace` | Candidate | 是 | 无 | `AlembicWorkspace` | board |",
  });
  run(root, ["mode", "--enable", "--write"]);

  const result = run(root, ["controller-tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "enqueue");
  assert.equal(parsed.nextAction, "enqueueCurrentPlan");
  assert.equal(parsed.sendEligibleWindows[0].window, "Alembic");
  assert.match(parsed.suggestedCommand, /enqueue --from-plan --write/);
});

test("controller-tick stops at blocked current-plan decision gates", () => {
  const root = makeFixture({
    planStatus: "Wave 4 阻塞",
    alembicStatus: "观察中",
    sendTo: "无",
  });
  run(root, ["mode", "--enable", "--write"]);

  const result = run(root, ["controller-tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "decision");
  assert.equal(parsed.nextAction, "resolveCurrentPlan");
});

test("controller-tick selects the top TODO candidate only after the current plan is clear", () => {
  const root = makeFixture({
    planStatus: "已完成",
    alembicStatus: "无任务",
    sendTo: "无",
    globalTodoRows: [
      "| GTODO-2 | 待排期 | feature | P1 | `AlembicWorkspace` | Later | 是 | 无 | `AlembicWorkspace` | board |",
      "| GTODO-1 | 待排期 | feature | P0 | `AlembicWorkspace` | First | 是 | 无 | `AlembicWorkspace` | board |",
    ].join("\n"),
  });
  run(root, ["mode", "--enable", "--write"]);

  const result = run(root, ["controller-tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "mainlineCandidate");
  assert.equal(parsed.nextAction, "reviewTodoCandidate");
  assert.equal(parsed.candidate.id, "GTODO-1");
});

test("controller-tick compact stops at complete-pending-archive before TODO selection", () => {
  const root = makeFixture({
    planStatus: "已完成待归档",
    alembicStatus: "无任务",
    sendTo: "无",
    globalTodoRows:
      "| GTODO-1 | 待排期 | feature | P0 | `AlembicWorkspace` | First | 是 | 无 | `AlembicWorkspace` | board |",
  });
  run(root, ["mode", "--enable", "--write"]);

  const result = run(root, ["controller-tick", "--compact", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "decision");
  assert.equal(parsed.nextAction, "archiveOrConfirmNextMainline");
  assert.equal(parsed.candidate, null);
  assert.equal(parsed.queueTaskCount, 0);
  assert.equal(parsed.sendEligibleWindowCount, 0);
  assert.equal(parsed.queueDecision, undefined);
  assert.equal(parsed.todoCandidates, undefined);
});

test("controller-tick reports but does not block on historic resolved tasks from old plans", () => {
  const root = makeFixture({
    planStatus: "已完成",
    alembicStatus: "无任务",
    sendTo: "无",
    globalTodoRows:
      "| GTODO-1 | 待排期 | feature | P0 | `AlembicWorkspace` | First | 是 | 无 | `AlembicWorkspace` | board |",
  });
  run(root, ["mode", "--enable", "--write"]);
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", {
    version: 1,
    tasks: [
      {
        taskId: "old-plan__AlembicTest",
        targetWindow: "AlembicTest",
        status: "blocked",
        controlDoc: "docs/workspace/current/old-plan.md",
        blockedReason: "old heartbeat did not claim",
      },
    ],
  });

  const result = run(root, ["controller-tick", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.topAction, "mainlineCandidate");
  assert.equal(parsed.queueDecision.ignoredHistoricTasks[0].taskId, "old-plan__AlembicTest");
});

test("post-run-audit passes for a disabled plan with no active dispatch work", () => {
  const root = makeFixture({
    planStatus: "已完成待归档",
    alembicStatus: "无任务",
    sendTo: "无",
  });

  const result = run(root, ["post-run-audit", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.mode, "disabled");
  assert.equal(parsed.sendEligibleWindowCount, 0);
});

test("post-run-audit fails when current status still advertises stale automation work", () => {
  const root = makeFixture({
    planStatus: "已完成待归档",
    alembicStatus: "无任务",
    sendTo: "无",
  });
  writeFile(
    path.join(root, "docs/workspace/current/workspace-current-status.md"),
    `
# Current Status

Visible Dispatch 本地 runtime 当前 mode enabled, loop enabled, 防睡眠 active；Stage 5B 准备由 VAD 投递给 \`AlembicPlugin\`。
`,
  );

  const result = run(root, ["post-run-audit", "--json"]);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.issues.join("\n"), /workspace-current-status\.md appears stale/);
  assert.equal(parsed.staleStatusLines[0].line, 4);
});

test("prune-history removes old terminal tasks without touching current or active history", () => {
  const root = makeFixture({
    planStatus: "已完成",
    alembicStatus: "无任务",
    sendTo: "无",
  });
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", {
    version: 1,
    tasks: [
      {
        taskId: "old-blocked__AlembicTest",
        targetWindow: "AlembicTest",
        status: "blocked",
        controlDoc: "docs/workspace/current/old-plan.md",
        automationId: "auto-old-blocked",
      },
      {
        taskId: "old-accepted__Alembic",
        targetWindow: "Alembic",
        status: "accepted",
        controlDoc: "docs/workspace/current/older-plan.md",
      },
      {
        taskId: "old-active__AlembicCore",
        targetWindow: "AlembicCore",
        status: "blocked",
        controlDoc: "docs/workspace/current/old-plan.md",
        automationId: "auto-old-active",
      },
      {
        taskId: "plan__Alembic",
        targetWindow: "Alembic",
        status: "blocked",
        controlDoc: "docs/workspace/current/plan.md",
      },
      {
        taskId: "old-completed__AlembicDashboard",
        targetWindow: "AlembicDashboard",
        status: "completed",
        controlDoc: "docs/workspace/current/old-plan.md",
      },
    ],
  });
  writeJson(root, ".workspace-local/visible-dispatch/automation-runs.json", {
    version: 1,
    runs: [
      {
        runId: "old-blocked__auto-old-blocked",
        taskId: "old-blocked__AlembicTest",
        targetWindow: "AlembicTest",
        automationId: "auto-old-blocked",
        status: "stopped",
      },
      {
        runId: "old-active__auto-old-active",
        taskId: "old-active__AlembicCore",
        targetWindow: "AlembicCore",
        automationId: "auto-old-active",
        status: "active",
      },
      {
        runId: "old-group__controller-return__auto-old-controller",
        taskId: "controller-return:old-group",
        groupId: "old-group",
        targetWindow: "AlembicWorkspace",
        automationId: "auto-old-controller",
        status: "stopped",
        runType: "controller-return",
      },
    ],
  });
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-groups.json", {
    version: 1,
    groups: [
      {
        groupId: "old-group",
        controlDoc: "docs/workspace/current/old-plan.md",
        returnPolicy: "controller-last",
        status: "returned",
        taskIds: ["old-blocked__AlembicTest", "old-accepted__Alembic"],
      },
      {
        groupId: "current-group",
        controlDoc: "docs/workspace/current/plan.md",
        returnPolicy: "controller-last",
        status: "returned",
        taskIds: ["plan__Alembic"],
      },
    ],
  });

  const dryRun = run(root, ["prune-history", "--json"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const dryParsed = JSON.parse(dryRun.stdout);
  assert.equal(dryParsed.wrote, false);
  assert.deepEqual(
    dryParsed.prunedTasks.map((task) => task.taskId),
    ["old-blocked__AlembicTest", "old-accepted__Alembic"],
  );
  assert.deepEqual(dryParsed.skippedHistoricActiveTasks.map((task) => task.taskId), ["old-active__AlembicCore"]);
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks.length, 5);

  const written = run(root, ["prune-history", "--write", "--json"]);
  assert.equal(written.status, 0, written.stderr);
  const parsed = JSON.parse(written.stdout);
  assert.equal(parsed.wrote, true);
  assert.deepEqual(
    parsed.prunedStoppedAutomationRuns.map((run) => run.automationId),
    ["auto-old-blocked"],
  );
  assert.deepEqual(parsed.prunedGroups.map((group) => group.groupId), ["old-group"]);
  assert.deepEqual(parsed.prunedStoppedControllerRuns.map((run) => run.automationId), ["auto-old-controller"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.deepEqual(
    queue.tasks.map((task) => task.taskId),
    ["old-active__AlembicCore", "plan__Alembic", "old-completed__AlembicDashboard"],
  );
  const runs = readJson(root, ".workspace-local/visible-dispatch/automation-runs.json");
  assert.deepEqual(runs.runs.map((run) => run.runId), ["old-active__auto-old-active"]);
  const groups = readJson(root, ".workspace-local/visible-dispatch/dispatch-groups.json");
  assert.deepEqual(groups.groups.map((group) => group.groupId), ["current-group"]);
});

test("prune-history can explicitly remove accepted tasks from the current plan", () => {
  const root = makeFixture({
    planStatus: "已完成待归档",
    alembicStatus: "无任务",
    sendTo: "无",
  });
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", {
    version: 1,
    tasks: [
      {
        taskId: "plan__Alembic",
        targetWindow: "Alembic",
        status: "accepted",
        controlDoc: "docs/workspace/current/plan.md",
        automationId: "auto-current",
      },
      {
        taskId: "plan__AlembicCore",
        targetWindow: "AlembicCore",
        status: "blocked",
        controlDoc: "docs/workspace/current/plan.md",
      },
    ],
  });
  writeJson(root, ".workspace-local/visible-dispatch/automation-runs.json", {
    version: 1,
    runs: [
      {
        runId: "plan__Alembic__auto-current",
        taskId: "plan__Alembic",
        targetWindow: "Alembic",
        automationId: "auto-current",
        status: "stopped",
      },
    ],
  });

  const defaultPrune = run(root, ["prune-history", "--json"]);
  assert.equal(defaultPrune.status, 0, defaultPrune.stderr);
  assert.deepEqual(JSON.parse(defaultPrune.stdout).prunedTasks, []);

  const explicit = run(root, ["prune-history", "--include-current-accepted", "--write", "--json"]);
  assert.equal(explicit.status, 0, explicit.stderr);
  const parsed = JSON.parse(explicit.stdout);
  assert.equal(parsed.includeCurrentAccepted, true);
  assert.deepEqual(parsed.prunedTasks.map((task) => task.taskId), ["plan__Alembic"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.deepEqual(queue.tasks.map((task) => task.taskId), ["plan__AlembicCore"]);
});

test("finish registers the current thread, completes evidence, and prepares the next wake payload", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-finish-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);

  const claimed = run(root, ["claim", "--window", "Alembic", "--write", "--json"]);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(JSON.parse(claimed.stdout).claimed.taskId, "fake-todo-round-1__Alembic");

  const finished = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--thread",
    "thread-Alembic",
    "--backfill",
    "commit abc; npm test passed",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const parsed = JSON.parse(finished.stdout);
  assert.equal(parsed.completed.status, "completed");
  assert.equal(parsed.completed.previousStatus, "claimed");
  assert.equal(parsed.completed.completedByThreadId, "<local-only>");
  assert.equal(parsed.chain.nextAction, "armNext");
  assert.equal(parsed.chain.handoffPolicy, "target-courier");
  assert.equal(parsed.chain.payload.targetThreadId, "thread-AlembicCore");
  assert.equal(parsed.chain.payload.taskId, "fake-todo-round-1__AlembicCore");
  assert.equal(parsed.chain.payload.courierAllowed, true);
  assert.match(parsed.chain.recordArmCommand, /record-arm --task fake-todo-round-1__AlembicCore/);

  const registry = readJson(root, ".workspace-local/visible-dispatch/window-registry.json");
  assert.equal(registry.windows.find((entry) => entry.windowName === "Alembic").threadId, "thread-Alembic");
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(queue.tasks.find((task) => task.taskId === "fake-todo-round-1__Alembic").completedByThreadId, "thread-Alembic");
  assert.equal(queue.tasks.find((task) => task.taskId === "fake-todo-round-1__Alembic").status, "completed");
});

test("controller-last dispatch group returns to total control only after the final target finishes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-controller-last-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicWorkspace", "--thread", "thread-controller", "--write"]);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-return",
    "--return-policy",
    "controller-last",
    "--write",
    "--json",
  ]);

  run(root, ["claim", "--window", "Alembic", "--write"]);
  const firstFinish = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--backfill",
    "Alembic evidence complete",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(firstFinish.status, 0, firstFinish.stderr);
  const firstParsed = JSON.parse(firstFinish.stdout);
  assert.equal(firstParsed.chain.nextAction, "noReturn");
  assert.equal(firstParsed.chain.handoffPolicy, "controller-last");
  assert.equal(firstParsed.chain.group.unfinishedCount, 1);
  assert.equal(firstParsed.chain.payload, undefined);

  run(root, ["claim", "--window", "AlembicCore", "--write"]);
  const secondFinish = run(root, [
    "finish",
    "--window",
    "AlembicCore",
    "--backfill",
    "AlembicCore evidence complete",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(secondFinish.status, 0, secondFinish.stderr);
  const secondParsed = JSON.parse(secondFinish.stdout);
  assert.equal(secondParsed.chain.nextAction, "returnToController");
  assert.equal(secondParsed.chain.handoffPolicy, "controller-return");
  assert.equal(secondParsed.chain.payload.targetWindow, "AlembicWorkspace");
  assert.equal(secondParsed.chain.payload.name, "继续总控验收");
  assert.equal(secondParsed.chain.payload.targetThreadId, "thread-controller");
  assert.equal(secondParsed.chain.payload.controllerReturnAllowed, true);
  assert.match(secondParsed.chain.payload.prompt, /继续总控验收：AlembicCore 回填/);
  assert.match(secondParsed.chain.payload.prompt, /先读取 AGENTS\.md、docs\/workspace\/index\.md/);
  assert.match(secondParsed.chain.payload.prompt, /先明确声明当前窗口定位：AlembicWorkspace 总控/);
  assert.match(secondParsed.chain.payload.prompt, /区分窗口自述、原始证据和总控裁决/);
  assert.match(secondParsed.chain.payload.prompt, /dispatchGroup：batch-return/);
  assert.match(secondParsed.chain.payload.prompt, /lastCompletedTarget：AlembicCore/);
  assert.match(secondParsed.chain.payload.prompt, /lastTaskId：batch-return-plan__AlembicCore/);
  assert.match(secondParsed.chain.payload.prompt, /controlPlan：docs\/workspace\/current\/batch-return-plan\.md/);
  assert.match(secondParsed.chain.payload.prompt, /用完即弃/);
  assert.match(secondParsed.chain.payload.prompt, /audit-automation/);
  assert.match(secondParsed.chain.payload.prompt, /resume-plan/);
  assert.match(secondParsed.chain.payload.prompt, /group-status/);
  assert.match(secondParsed.chain.payload.prompt, /controller-tick/);
  assert.doesNotMatch(secondParsed.chain.payload.prompt, /record-stop --automation-id/);
  assert.doesNotMatch(secondParsed.chain.payload.prompt, /group-status --group batch-return/);
  assert.doesNotMatch(secondParsed.chain.payload.prompt, /controller-tick --json/);
  assert.doesNotMatch(secondParsed.chain.payload.prompt, /VAD controller-return heartbeat/);
  assert.ok(secondParsed.chain.payload.prompt.length < 1100);
  assert.match(secondParsed.chain.recordReturnCommand, /record-return --group batch-return/);

  const recorded = run(root, [
    "record-return",
    "--group",
    "batch-return",
    "--automation-id",
    "controller-return-1",
    "--write",
    "--json",
  ]);
  assert.equal(recorded.status, 0, recorded.stderr);
  const groupStatus = run(root, ["group-status", "--group", "batch-return", "--json"]);
  assert.equal(groupStatus.status, 0, groupStatus.stderr);
  const statusParsed = JSON.parse(groupStatus.stdout);
  assert.equal(statusParsed.group.terminal, true);
  assert.equal(statusParsed.group.completedCount, 2);
  const runs = readJson(root, ".workspace-local/visible-dispatch/automation-runs.json");
  assert.equal(runs.runs.some((run) => run.runType === "controller-return"), true);
});

test("installed control repo prompts use parent-root paths for controller returns", () => {
  const parentRoot = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-installed-parent-"));
  const controlRoot = path.join(parentRoot, "codex-control-workspace");
  mkdirSync(path.join(parentRoot, "BaseWindow"), { recursive: true });
  mkdirSync(path.join(parentRoot, "CoreWindow"), { recursive: true });
  writeFile(path.join(controlRoot, "AGENTS.md"), "# Control Fixture\n");
  writeFile(
    path.join(controlRoot, ".workspace-active/workspace/index.md"),
    `
# Workspace Index

## 当前总控入口

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 当前计划 | [current/batch-return-plan.md](current/batch-return-plan.md) | 待启动 | Batch return fixture |
`,
  );
  writeFile(
    path.join(controlRoot, ".workspace-active/workspace/current/batch-return-plan.md"),
    `
# Batch Return Plan

状态：待启动

## 窗口分派

发送给：\`BaseWindow\`、\`CoreWindow\`

| 窗口 / 状态 | 任务 |
| --- | --- |
| \`BaseWindow\`<br>待启动 | Batch task for BaseWindow |
| \`CoreWindow\`<br>待启动 | Batch task for CoreWindow |
| \`AgentWindow\`<br>无任务 | None |
| \`DashboardWindow\`<br>无任务 | None |
| \`PluginWindow\`<br>无任务 | None |
| \`TestWindow\`<br>无任务 | None |
| \`RealTestProject\`<br>无任务 | None |
`,
  );

  assert.equal(runGeneric(controlRoot, ["mode", "--enable", "--write"]).status, 0);
  assert.equal(
    runGeneric(controlRoot, ["register", "--window", "ControlWorkspace", "--thread", "thread-controller", "--write"])
      .status,
    0,
  );
  assert.equal(runGeneric(controlRoot, ["register", "--window", "BaseWindow", "--thread", "thread-base", "--write"]).status, 0);
  assert.equal(
    runGeneric(controlRoot, [
      "enqueue",
      "--from-plan",
      "--group",
      "installed-return",
      "--return-policy",
      "controller-last",
      "--write",
    ]).status,
    0,
  );

  const armed = runGeneric(controlRoot, ["arm", "--task", "batch-return-plan__BaseWindow", "--json"]);
  assert.equal(armed.status, 0, armed.stderr);
  const armPrompt = JSON.parse(armed.stdout).payload.prompt;
  assert.match(armPrompt, /\.\.\/codex-control-workspace\/\.workspace-active\/workspace\/index\.md/);
  assert.match(armPrompt, /currentWindow：BaseWindow/);
  assert.match(armPrompt, /taskId：batch-return-plan__BaseWindow/);
  assert.match(armPrompt, /controlDoc：\.workspace-active\/workspace\/current\/batch-return-plan\.md/);
  assert.match(armPrompt, /visible-automation-dispatch-target\/SKILL\.md/);
  assert.doesNotMatch(armPrompt, /cd \.\.\/codex-control-workspace && node scripts\/visible-dispatch\.mjs claim/);

  assert.equal(runGeneric(controlRoot, ["claim", "--window", "BaseWindow", "--write"]).status, 0);
  assert.equal(
    runGeneric(controlRoot, [
      "finish",
      "--window",
      "BaseWindow",
      "--backfill",
      "base evidence",
      "--chain-next",
      "--write",
    ]).status,
    0,
  );
  assert.equal(runGeneric(controlRoot, ["claim", "--window", "CoreWindow", "--write"]).status, 0);
  const finished = runGeneric(controlRoot, [
    "finish",
    "--window",
    "CoreWindow",
    "--backfill",
    "core evidence",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const prompt = JSON.parse(finished.stdout).chain.payload.prompt;
  assert.match(prompt, /继续总控验收：CoreWindow 回填/);
  assert.match(prompt, /codex-control-workspace\/\.workspace-active\/workspace\/index\.md/);
  assert.match(prompt, /codex-control-workspace\/\.workspace-active\/workspace\/current\/workspace-current-status\.md/);
  assert.match(prompt, /codex-control-workspace\/skills\/dev\/visible-automation-dispatch-controller\/SKILL\.md/);
  assert.match(prompt, /dispatchGroup：installed-return/);
  assert.match(prompt, /group-status/);
  assert.match(prompt, /controller-tick/);
  assert.match(prompt, /resume-plan/);
  assert.doesNotMatch(prompt, /cd codex-control-workspace && node scripts\/visible-dispatch\.mjs group-status/);
  assert.doesNotMatch(prompt, /cd codex-control-workspace && node scripts\/visible-dispatch\.mjs controller-tick/);
  assert.match(
    JSON.parse(finished.stdout).chain.recordReturnCommand,
    /cd \.\.\/codex-control-workspace && node scripts\/visible-dispatch\.mjs record-return --group installed-return/,
  );
  assert.doesNotMatch(prompt, /先读取 AGENTS\.md、\.workspace-active/);
  assert.doesNotMatch(prompt, /Continue Visible Automation Dispatch controller return/);
});

test("record-return rejects a second active controller return for the same group", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-controller-return-duplicate-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicWorkspace", "--thread", "thread-controller", "--write"]);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-return",
    "--return-policy",
    "controller-last",
    "--write",
  ]);

  for (const windowName of ["Alembic", "AlembicCore"]) {
    run(root, ["finish", "--window", windowName, "--backfill", `${windowName} done`, "--write", "--chain-next"]);
  }

  const first = run(root, [
    "record-return",
    "--group",
    "batch-return",
    "--automation-id",
    "controller-return-1",
    "--write",
    "--json",
  ]);
  assert.equal(first.status, 0, first.stderr);

  const duplicate = run(root, [
    "record-return",
    "--group",
    "batch-return",
    "--automation-id",
    "controller-return-2",
    "--write",
    "--json",
  ]);
  assert.notEqual(duplicate.status, 0);
  assert.match(JSON.parse(duplicate.stdout).error, /already active/);
});

test("record-stop marks controller-return groups as returned", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-controller-return-stop-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicWorkspace", "--thread", "thread-controller", "--write"]);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-return",
    "--return-policy",
    "controller-last",
    "--write",
  ]);
  run(root, ["finish", "--window", "Alembic", "--backfill", "Alembic evidence", "--chain-next", "--write"]);
  run(root, ["finish", "--window", "AlembicCore", "--backfill", "Core evidence", "--chain-next", "--write"]);
  run(root, ["record-return", "--group", "batch-return", "--automation-id", "controller-return-1", "--write"]);

  const stopped = run(root, [
    "record-stop",
    "--automation-id",
    "controller-return-1",
    "--reason",
    "controller return handled",
    "--write",
    "--json",
  ]);
  assert.equal(stopped.status, 0, stopped.stderr);
  const parsed = JSON.parse(stopped.stdout);
  assert.equal(parsed.stoppedGroups[0].status, "returned");
  assert.equal(parsed.stoppedGroups[0].previousStatus, "return-armed");

  const groupStatus = run(root, ["group-status", "--group", "batch-return", "--json"]);
  assert.equal(groupStatus.status, 0, groupStatus.stderr);
  assert.equal(JSON.parse(groupStatus.stdout).group.status, "returned");
  const cleanup = run(root, ["cleanup", "--json"]);
  assert.equal(cleanup.status, 0, cleanup.stderr);
  assert.equal(JSON.parse(cleanup.stdout).activeAutomationRuns.length, 0);
});

test("record-stop repairs a stale controller-return group after the run was already stopped", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-controller-return-repair-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicWorkspace", "--thread", "thread-controller", "--write"]);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-return",
    "--return-policy",
    "controller-last",
    "--write",
  ]);
  run(root, ["finish", "--window", "Alembic", "--backfill", "Alembic evidence", "--chain-next", "--write"]);
  run(root, ["finish", "--window", "AlembicCore", "--backfill", "Core evidence", "--chain-next", "--write"]);
  run(root, ["record-return", "--group", "batch-return", "--automation-id", "controller-return-1", "--write"]);

  const runs = readJson(root, ".workspace-local/visible-dispatch/automation-runs.json");
  runs.runs[0].status = "stopped";
  runs.runs[0].previousStatus = "active";
  runs.runs[0].stoppedAt = "2026-05-26T00:00:00.000Z";
  runs.runs[0].stopReason = "controller return handled";
  writeJson(root, ".workspace-local/visible-dispatch/automation-runs.json", runs);

  const repaired = run(root, [
    "record-stop",
    "--automation-id",
    "controller-return-1",
    "--reason",
    "controller return handled",
    "--write",
    "--json",
  ]);
  assert.equal(repaired.status, 0, repaired.stderr);
  const parsed = JSON.parse(repaired.stdout);
  assert.equal(parsed.stoppedRuns.length, 0);
  assert.equal(parsed.alreadyStoppedControllerRuns.length, 1);
  assert.equal(parsed.stoppedGroups[0].status, "returned");

  const groupStatus = run(root, ["group-status", "--group", "batch-return", "--json"]);
  assert.equal(groupStatus.status, 0, groupStatus.stderr);
  assert.equal(JSON.parse(groupStatus.stdout).group.status, "returned");
});

test("group-status reports missing declared group tasks as non-terminal", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-group-missing-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root);
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "batch-return",
    "--return-policy",
    "controller-last",
    "--write",
  ]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  queue.tasks = queue.tasks.filter((task) => task.targetWindow !== "AlembicCore");
  queue.tasks[0].status = "completed";
  queue.tasks[0].backfill = "Alembic done";
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", queue);

  const status = run(root, ["group-status", "--group", "batch-return", "--json"]);
  assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.group.missingTaskCount, 1);
  assert.deepEqual(parsed.group.missingTaskIds, ["batch-return-plan__AlembicCore"]);
  assert.equal(parsed.group.terminal, false);
});

test("unattended controller loop waits for full group, accepts, then arms the next refreshed plan", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-controller-loop-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeTwoWindowPlan(root, { planFile: "round-one.md" });
  run(root, ["mode", "--enable", "--write"]);
  for (const windowName of ["Alembic", "AlembicCore", "AlembicWorkspace"]) {
    run(root, ["register", "--window", windowName, "--thread", `thread-${windowName}`, "--write"]);
  }
  run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "round-one",
    "--return-policy",
    "controller-last",
    "--write",
  ]);
  const queued = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks;
  const alembicTask = queued.find((task) => task.targetWindow === "Alembic").taskId;
  const coreTask = queued.find((task) => task.targetWindow === "AlembicCore").taskId;
  for (const task of queued) {
    run(root, ["record-arm", "--task", task.taskId, "--automation-id", `auto-${task.targetWindow}`, "--write"]);
  }

  const firstFinish = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--task",
    alembicTask,
    "--backfill",
    "Alembic evidence complete",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(firstFinish.status, 0, firstFinish.stderr);
  assert.equal(JSON.parse(firstFinish.stdout).chain.nextAction, "noReturn");

  const midController = run(root, ["controller-tick", "--json"]);
  assert.equal(midController.status, 0, midController.stderr);
  const midParsed = JSON.parse(midController.stdout);
  assert.equal(midParsed.topAction, "wait");
  assert.equal(midParsed.nextAction, "waitForBackfill");
  assert.equal(
    midParsed.queueDecision.tasks.find((task) => task.taskId === alembicTask).nextAction,
    "waitForGroup",
  );

  const finalFinish = run(root, [
    "finish",
    "--window",
    "AlembicCore",
    "--task",
    coreTask,
    "--backfill",
    "AlembicCore evidence complete",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finalFinish.status, 0, finalFinish.stderr);
  const finalParsed = JSON.parse(finalFinish.stdout);
  assert.equal(finalParsed.chain.nextAction, "returnToController");
  assert.equal(finalParsed.chain.payload.controllerReturnAllowed, true);
  run(root, ["record-return", "--group", "round-one", "--automation-id", "return-round-one", "--write"]);

  const reviewTick = run(root, ["controller-tick", "--json"]);
  assert.equal(reviewTick.status, 0, reviewTick.stderr);
  assert.equal(JSON.parse(reviewTick.stdout).topAction, "review");

  for (const windowName of ["Alembic", "AlembicCore"]) {
    const stopped = run(root, ["record-stop", "--automation-id", `auto-${windowName}`, "--write", "--json"]);
    assert.equal(stopped.status, 0, stopped.stderr);
  }

  for (const taskId of [alembicTask, coreTask]) {
    const accepted = run(root, [
      "accept",
      "--task",
      taskId,
      "--verdict",
      "accepted",
      "--note",
      "fixture total-control acceptance",
      "--write",
      "--json",
    ]);
    assert.equal(accepted.status, 0, accepted.stderr);
  }

  const stalePlanTick = run(root, ["controller-tick", "--json"]);
  assert.equal(stalePlanTick.status, 0, stalePlanTick.stderr);
  const stalePlanParsed = JSON.parse(stalePlanTick.stdout);
  assert.equal(stalePlanParsed.topAction, "decision");
  assert.equal(stalePlanParsed.nextAction, "closeOrRefreshCurrentPlan");

  writeTwoWindowPlan(root, { planFile: "round-two.md" });
  const nextPlanTick = run(root, ["controller-tick", "--json"]);
  assert.equal(nextPlanTick.status, 0, nextPlanTick.stderr);
  const nextPlanParsed = JSON.parse(nextPlanTick.stdout);
  assert.equal(nextPlanParsed.topAction, "enqueue");
  assert.equal(nextPlanParsed.nextAction, "enqueueCurrentPlan");
  assert.equal(nextPlanParsed.queueDecision.ignoredHistoricTasks.length, 2);

  const enqueuedNext = run(root, [
    "enqueue",
    "--from-plan",
    "--group",
    "round-two",
    "--return-policy",
    "controller-last",
    "--write",
    "--json",
  ]);
  assert.equal(enqueuedNext.status, 0, enqueuedNext.stderr);
  const batch = run(root, ["arm-batch", "--group", "round-two", "--json"]);
  assert.equal(batch.status, 0, batch.stderr);
  assert.equal(JSON.parse(batch.stdout).payloads.length, 2);
});

test("finish rejects placeholder thread registration", () => {
  const root = makeFixture();
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  run(root, ["claim", "--window", "Alembic", "--write"]);

  const finished = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--thread",
    "<thread id>",
    "--backfill",
    "should fail before registry write",
    "--write",
    "--json",
  ]);
  assert.notEqual(finished.status, 0);
  assert.match(JSON.parse(finished.stdout).error, /Invalid visible dispatch thread id placeholder/);
});

test("finish leaves AlembicTest next-hop arming to total control", () => {
  const root = makeFixture();
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "AlembicTest", "--thread", "thread-AlembicTest", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);

  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  for (const task of queue.tasks) {
    if (["Alembic", "AlembicCore", "AlembicAgent", "AlembicDashboard"].includes(task.targetWindow)) {
      task.status = "completed";
      task.completedAt = "2026-05-26T00:00:00.000Z";
      task.backfill = `${task.targetWindow} completed`;
    }
    if (task.targetWindow === "AlembicPlugin") {
      task.status = "claimed";
    }
  }
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", queue);

  const finished = run(root, [
    "finish",
    "--window",
    "AlembicPlugin",
    "--backfill",
    "plugin completed its own target",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const parsed = JSON.parse(finished.stdout);
  assert.equal(parsed.chain.nextAction, "controllerArm");
  assert.equal(parsed.chain.handoffPolicy, "total-control-only");
  assert.equal(parsed.chain.targetWindow, "AlembicTest");
  assert.equal(parsed.chain.payload, undefined);
  assert.match(parsed.chain.armCommand, /arm --task fake-todo-round-1__AlembicTest --json/);
  assert.match(parsed.chain.recordArmCommand, /record-arm --task fake-todo-round-1__AlembicTest/);
});

test("finish does not chain when the next queued target has no registered thread", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-finish-missing-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  run(root, ["claim", "--window", "Alembic", "--write"]);

  const finished = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--thread",
    "thread-Alembic",
    "--backfill",
    "done with evidence",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const parsed = JSON.parse(finished.stdout);
  assert.equal(parsed.chain.nextAction, "registerWindow");
  assert.equal(parsed.chain.targetWindow, "AlembicCore");
  assert.equal(parsed.chain.payload, undefined);
});

test("finish respects disabled automation mode and refuses next wake payloads", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-finish-disabled-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  run(root, ["claim", "--window", "Alembic", "--write"]);

  const finished = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--thread",
    "thread-Alembic",
    "--backfill",
    "done while mode disabled",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const parsed = JSON.parse(finished.stdout);
  assert.equal(parsed.completed.status, "completed");
  assert.equal(parsed.chain.nextAction, "modeDisabled");
  assert.equal(parsed.chain.payload, undefined);
});

test("disabling mode after a payload is armed drains the current target without chaining", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-finish-disable-after-arm-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  writeFullWindowPlan(root, { planFile: "fake-todo-round-1.md", round: 1 });
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["register", "--window", "Alembic", "--thread", "thread-Alembic", "--write"]);
  run(root, ["register", "--window", "AlembicCore", "--thread", "thread-AlembicCore", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);

  const armed = run(root, ["arm", "--task", "fake-todo-round-1__Alembic", "--json"]);
  assert.equal(armed.status, 0, armed.stderr);
  assert.equal(JSON.parse(armed.stdout).payload.targetThreadId, "thread-Alembic");

  run(root, ["record-arm", "--task", "fake-todo-round-1__Alembic", "--automation-id", "auto-before-disable", "--write"]);
  run(root, ["mode", "--disable", "--write"]);

  const finished = run(root, [
    "finish",
    "--window",
    "Alembic",
    "--thread",
    "thread-Alembic",
    "--backfill",
    "current target completed after disable",
    "--chain-next",
    "--write",
    "--json",
  ]);
  assert.equal(finished.status, 0, finished.stderr);
  const parsed = JSON.parse(finished.stdout);
  assert.equal(parsed.completed.status, "completed");
  assert.equal(parsed.chain.nextAction, "modeDisabled");
  assert.equal(parsed.chain.payload, undefined);
});

test("fake TODO multi-window rounds complete without duplicate enqueue loops", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "visible-dispatch-full-window-"));
  writeFile(path.join(root, "AGENTS.md"), "# Fixture\n");
  run(root, ["mode", "--enable", "--write"]);
  for (const windowName of visibleWindows) {
    const registered = run(root, [
      "register",
      "--window",
      windowName,
      "--thread",
      `thread-${windowName}`,
      "--write",
      "--json",
    ]);
    assert.equal(registered.status, 0, registered.stderr);
  }

  for (let round = 1; round <= 3; round += 1) {
    const planFile = `fake-todo-round-${round}.md`;
    writeFullWindowPlan(root, { planFile, round });

    const before = run(root, ["controller-tick", "--json"]);
    assert.equal(before.status, 0, before.stderr);
    const beforeParsed = JSON.parse(before.stdout);
    assert.equal(beforeParsed.topAction, "enqueue");
    assert.equal(beforeParsed.missingSendEligibleWindows.length, visibleWindows.length);
    assert.equal(beforeParsed.queueDecision.ignoredHistoricTasks.length, (round - 1) * visibleWindows.length);

    const enqueued = run(root, ["enqueue", "--from-plan", "--write", "--json"]);
    assert.equal(enqueued.status, 0, enqueued.stderr);
    assert.equal(JSON.parse(enqueued.stdout).created.length, visibleWindows.length);

    for (const windowName of visibleWindows) {
      const taskId = `fake-todo-round-${round}__${windowName}`;
      const armed = run(root, ["arm", "--task", taskId, "--json"]);
      assert.equal(armed.status, 0, armed.stderr);
      const payload = JSON.parse(armed.stdout).payload;
      assert.equal(payload.targetWindow, windowName);
      assert.equal(payload.targetThreadId, `thread-${windowName}`);

      const recorded = run(root, [
        "record-arm",
        "--task",
        taskId,
        "--automation-id",
        `auto-${round}-${windowName}`,
        "--write",
        "--json",
      ]);
      assert.equal(recorded.status, 0, recorded.stderr);

      const claimed = run(root, ["claim", "--window", windowName, "--write", "--json"]);
      assert.equal(claimed.status, 0, claimed.stderr);
      assert.equal(JSON.parse(claimed.stdout).claimed.taskId, taskId);

      const completed = run(root, [
        "complete",
        "--task",
        taskId,
        "--backfill",
        `fake round ${round} ${windowName} complete`,
        "--write",
        "--json",
      ]);
      assert.equal(completed.status, 0, completed.stderr);

      const stopped = run(root, [
        "record-stop",
        "--automation-id",
        `auto-${round}-${windowName}`,
        "--write",
        "--json",
      ]);
      assert.equal(stopped.status, 0, stopped.stderr);

      const accepted = run(root, [
        "accept",
        "--task",
        taskId,
        "--note",
        `fake round ${round} evidence reviewed`,
        "--write",
        "--json",
      ]);
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(JSON.parse(accepted.stdout).task.status, "accepted");
    }

    const after = run(root, ["controller-tick", "--json"]);
    assert.equal(after.status, 0, after.stderr);
    const afterParsed = JSON.parse(after.stdout);
    assert.equal(afterParsed.topAction, "decision");
    assert.equal(afterParsed.nextAction, "closeOrRefreshCurrentPlan");
    assert.equal(afterParsed.missingSendEligibleWindows.length, 0);
  }

  run(root, ["mode", "--disable", "--write"]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(queue.tasks.length, visibleWindows.length * 3);
  assert.equal(queue.tasks.every((task) => task.status === "accepted"), true);
});

test("tick write marks expired active tasks as stale", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  queue.tasks[0].status = "claimed";
  queue.tasks[0].leaseUntil = "2000-01-01T00:00:00.000Z";
  writeJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json", queue);

  const result = run(root, ["tick", "--write", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.wrote, true);
  assert.equal(parsed.tasks[0].status, "stale");

  const updated = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  assert.equal(updated.tasks[0].status, "stale");
  assert.equal(updated.tasks[0].previousStatus, "claimed");
});

test("completed tasks with backfill can be accepted by total control", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const taskId = queue.tasks[0].taskId;
  const completed = run(root, ["complete", "--task", taskId, "--backfill", "commit abc; tests passed", "--write", "--json"]);
  assert.equal(completed.status, 0, completed.stderr);

  const tick = run(root, ["tick", "--json"]);
  assert.equal(tick.status, 0, tick.stderr);
  assert.equal(JSON.parse(tick.stdout).tasks[0].nextAction, "acceptanceReview");

  const accepted = run(root, ["accept", "--task", taskId, "--note", "evidence reviewed", "--write", "--json"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).task.status, "accepted");
  assert.equal(readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].status, "accepted");
});

test("accept refuses tasks that still have active automation runs", () => {
  const root = makeFixture();
  run(root, ["mode", "--enable", "--write"]);
  run(root, ["enqueue", "--from-plan", "--write"]);
  const taskId = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json").tasks[0].taskId;
  run(root, ["record-arm", "--task", taskId, "--automation-id", "auto-active", "--write"]);
  run(root, ["finish", "--window", "Alembic", "--backfill", "evidence complete", "--write"]);

  const refused = run(root, ["accept", "--task", taskId, "--write", "--json"]);
  assert.notEqual(refused.status, 0);
  assert.match(JSON.parse(refused.stdout).error, /active automation run/);

  run(root, ["record-stop", "--automation-id", "auto-active", "--write"]);
  const accepted = run(root, ["accept", "--task", taskId, "--write", "--json"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).task.status, "accepted");
});

test("accept refuses completed tasks without backfill evidence", () => {
  const root = makeFixture();
  run(root, ["enqueue", "--from-plan", "--write"]);
  const queue = readJson(root, ".workspace-local/visible-dispatch/dispatch-queue.json");
  const taskId = queue.tasks[0].taskId;
  run(root, ["complete", "--task", taskId, "--write"]);

  const result = run(root, ["accept", "--task", taskId, "--write", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no backfill evidence/);
});
