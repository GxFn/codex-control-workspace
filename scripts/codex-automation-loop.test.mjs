#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const script = path.join(workspaceRoot, "scripts/codex-automation-loop.mjs");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-loop-"));
  writeFile(path.join(root, "prompt.md"), "继续当前窗口任务：Alembic / TASK-1。\n\n返回 result envelope。");
  writeFile(path.join(root, ".workspace-active/workspace/current/plan.md"), "# Fixture plan\n");
  return root;
}

function run(root, args) {
  return spawnSync("node", [script, ...args, "--root", root, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("creates dispatch packet and delivery envelope without parsing current plan", () => {
  const root = makeFixture();
  const dispatch = run(root, [
    "create-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--group",
    "GROUP-1",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Implement fixture",
    "--prompt-file",
    "prompt.md",
    "--evidence",
    "commit",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
  const dispatchPayload = JSON.parse(dispatch.stdout);
  assert.equal(dispatchPayload.ok, true);
  assert.equal(dispatchPayload.packet.targetWindow, "Alembic");
  assert.equal(dispatchPayload.packet.prompt.startsWith("继续当前窗口任务"), true);
  assert.equal(dispatchPayload.packetFile.endsWith("GROUP-1__Alembic__TASK-1.json"), true);

  const delivery = run(root, [
    "build-delivery",
    "--packet-file",
    dispatchPayload.packetFile,
    "--delivery-id",
    "delivery-1",
    "--stagger-seconds",
    "20",
    "--write",
  ]);
  assert.equal(delivery.status, 0, delivery.stderr || delivery.stdout);
  const deliveryPayload = JSON.parse(delivery.stdout);
  assert.equal(deliveryPayload.envelope.prompt, dispatchPayload.packet.prompt);
  assert.equal(deliveryPayload.envelope.oneShot, true);
  assert.equal(deliveryPayload.envelope.returnRoute, "controller");
  assert.equal(deliveryPayload.envelope.schedule.staggerSeconds, 20);
});

test("creates a readable default target prompt", () => {
  const root = makeFixture();
  const dispatch = run(root, [
    "create-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-DEFAULT-PROMPT",
    "--group",
    "GROUP-PROMPT",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Implement fixture",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
  const payload = JSON.parse(dispatch.stdout);
  assert.match(payload.packet.prompt, /^继续当前窗口任务：Alembic \/ TASK-DEFAULT-PROMPT。/);
  assert.match(payload.packet.prompt, /\n\n变量：\n- currentWindow: Alembic\n- taskId: TASK-DEFAULT-PROMPT/);
  assert.match(payload.packet.prompt, /\n- dispatchGroup: GROUP-PROMPT\n/);
  assert.match(payload.packet.prompt, /不创建子窗口下一跳/);
  assert.match(payload.packet.prompt, /returnRoute=controller/);
  assert.match(payload.packet.prompt, /\n- skill: \.\.\/codex-control-workspace\/skills\/dev\/codex-automation-target\/SKILL\.md$/);
});

test("normalizes one-line target prompts into the readable shape", () => {
  const root = makeFixture();
  const dispatch = run(root, [
    "create-dispatch",
    "--target-window",
    "AlembicAgent",
    "--task-id",
    "TASK-INLINE",
    "--group",
    "GROUP-INLINE",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Implement fixture",
    "--prompt",
    "继续当前窗口任务：AlembicAgent / TASK-INLINE。变量：currentWindow=AlembicAgent；taskId=TASK-INLINE；rules=用完即弃。",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
  const payload = JSON.parse(dispatch.stdout);
  assert.match(payload.packet.prompt, /^继续当前窗口任务：AlembicAgent \/ TASK-INLINE。/);
  assert.doesNotMatch(payload.packet.prompt, /变量：currentWindow=/);
  assert.match(payload.packet.prompt, /\n变量：\n- currentWindow: AlembicAgent\n- taskId: TASK-INLINE/);
});

test("registers target threads locally and redacts thread ids in delivery output", () => {
  const root = makeFixture();
  const register = run(root, [
    "register-thread",
    "--window",
    "Alembic",
    "--thread-id",
    "0192fac-real-thread",
    "--role",
    "target",
    "--write",
  ]);
  assert.equal(register.status, 0, register.stderr || register.stdout);
  const registerPayload = JSON.parse(register.stdout);
  assert.equal(registerPayload.threadRegistered, true);
  assert.equal(registerPayload.threadIdRedacted, true);
  assert.doesNotMatch(register.stdout, /0192fac-real-thread/);

  const dispatch = JSON.parse(
    run(root, [
      "create-dispatch",
      "--target-window",
      "Alembic",
      "--task-id",
      "TASK-THREAD",
      "--group",
      "GROUP-THREAD",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      "Implement fixture",
      "--prompt-file",
      "prompt.md",
      "--write",
    ]).stdout,
  );
  const delivery = run(root, ["build-delivery", "--packet-file", dispatch.packetFile, "--require-thread", "--write"]);
  assert.equal(delivery.status, 0, delivery.stderr || delivery.stdout);
  const payload = JSON.parse(delivery.stdout);
  assert.equal(payload.threadReady, true);
  assert.equal(payload.threadIdRedacted, true);
  assert.equal(payload.envelope.codexAutomation.targetThreadId, "<redacted>");
  assert.match(readFileSync(path.join(root, payload.deliveryFile), "utf8"), /0192fac-real-thread/);
});

test("builds controller-return envelopes from registered controller threads", () => {
  const root = makeFixture();
  writeFile(
    path.join(root, ".workspace-local/workspace.config.json"),
    JSON.stringify({ controlWindow: "AlembicWorkspace" }, null, 2),
  );
  const register = run(root, [
    "register-thread",
    "--window",
    "AlembicWorkspace",
    "--thread-id",
    "0192fac-controller-thread",
    "--role",
    "controller",
    "--write",
  ]);
  assert.equal(register.status, 0, register.stderr || register.stdout);

  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--last-completed-target",
    "Alembic",
    "--last-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--require-thread",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.threadReady, true);
  assert.equal(payload.threadIdRedacted, true);
  assert.equal(payload.envelope.kind, "ControllerReturnEnvelope");
  assert.equal(payload.envelope.codexAutomation.targetThreadId, "<redacted>");
  assert.match(payload.envelope.prompt, /^继续总控验收：Alembic 回填。/);
  assert.match(payload.envelope.prompt, /\n- dispatchGroup: GROUP-RETURN\n/);
  assert.match(readFileSync(path.join(root, payload.returnFile), "utf8"), /0192fac-controller-thread/);
});

test("controller-return can emit local automation payload for immediate heartbeat creation", () => {
  const root = makeFixture();
  writeFile(
    path.join(root, ".workspace-local/workspace.config.json"),
    JSON.stringify({ controlWindow: "AlembicWorkspace" }, null, 2),
  );
  const register = run(root, [
    "register-thread",
    "--window",
    "AlembicWorkspace",
    "--thread-id",
    "0192fac-controller-thread",
    "--role",
    "controller",
    "--write",
  ]);
  assert.equal(register.status, 0, register.stderr || register.stdout);

  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--last-completed-target",
    "Alembic",
    "--last-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--require-thread",
    "--include-thread-id",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.threadReady, true);
  assert.equal(payload.threadIdRedacted, false);
  assert.equal(payload.envelope.codexAutomation.targetThreadId, "0192fac-controller-thread");
});

test("controller-return requires registered controller thread when requested", () => {
  const root = makeFixture();
  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--last-completed-target",
    "Alembic",
    "--last-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--controller-window",
    "MissingController",
    "--require-thread",
    "--write",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /No registered controller thread/);
});

test("controller-return can be built as a dry-run without thread registration", () => {
  const root = makeFixture();
  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--last-completed-target",
    "Alembic",
    "--last-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.wrote, false);
  assert.equal(payload.threadReady, false);
  assert.equal(payload.envelope.codexAutomation, undefined);
});

test("--help prints usage instead of status", () => {
  const root = makeFixture();
  const result = spawnSync("node", [script, "--help", "--root", root], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /create-dispatch/);
  assert.doesNotMatch(result.stdout, /Dispatch packets:/);
});

test("reviews a group only after all target result envelopes exist", () => {
  const root = makeFixture();
  for (const [targetWindow, taskId] of [
    ["Alembic", "TASK-1"],
    ["AlembicAgent", "TASK-2"],
  ]) {
    const result = run(root, [
      "create-dispatch",
      "--target-window",
      targetWindow,
      "--task-id",
      taskId,
      "--group",
      "GROUP-2",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      `Fixture ${taskId}`,
      "--prompt",
      `继续当前窗口任务：${targetWindow} / ${taskId}。`,
      "--write",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const wait = run(root, ["review-results", "--group", "GROUP-2"]);
  assert.equal(wait.status, 0, wait.stderr || wait.stdout);
  assert.equal(JSON.parse(wait.stdout).decision, "wait");

  const submitOne = run(root, [
    "submit-result",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--group",
    "GROUP-2",
    "--status",
    "completed",
    "--commit",
    "abc123",
    "--write",
  ]);
  assert.equal(submitOne.status, 0, submitOne.stderr || submitOne.stdout);
  assert.equal(JSON.parse(run(root, ["review-results", "--group", "GROUP-2"]).stdout).decision, "wait");

  const submitTwo = run(root, [
    "submit-result",
    "--target-window",
    "AlembicAgent",
    "--task-id",
    "TASK-2",
    "--group",
    "GROUP-2",
    "--status",
    "completed",
    "--verification",
    "npm test PASS",
    "--write",
  ]);
  assert.equal(submitTwo.status, 0, submitTwo.stderr || submitTwo.stdout);

  const review = JSON.parse(run(root, ["review-results", "--group", "GROUP-2"]).stdout);
  assert.equal(review.decision, "needs-controller-review");
  assert.deepEqual(review.missing, []);
  assert.equal(review.needsReview.length, 2);
});

test("completed result requires evidence", () => {
  const root = makeFixture();
  const result = run(root, [
    "submit-result",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--status",
    "completed",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /completed results require/);
});

test("stop-loop writes explicit stop marker", () => {
  const root = makeFixture();
  const result = run(root, ["stop-loop", "--reason", "manual pause", "--write"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.match(readFileSync(path.join(root, payload.markerFile), "utf8"), /manual pause/);
});
