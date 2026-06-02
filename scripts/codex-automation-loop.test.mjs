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

function seedCompletedResult(root, { targetWindow = "Alembic", taskId = "TASK-RETURN", group = "GROUP-RETURN", controllerWindow = "" } = {}) {
  const dispatch = run(root, [
    "create-dispatch",
    "--target-window",
    targetWindow,
    "--task-id",
    taskId,
    "--group",
    group,
    ...(controllerWindow ? ["--controller-window", controllerWindow] : []),
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Return fixture",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
  const result = run(root, [
    "submit-result",
    "--target-window",
    targetWindow,
    "--task-id",
    taskId,
    "--group",
    group,
    "--status",
    "completed",
    "--evidence-ref",
    "fixture evidence",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
    "--evidence",
    "commit",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
  const dispatchPayload = JSON.parse(dispatch.stdout);
  assert.equal(dispatchPayload.ok, true);
  assert.equal(dispatchPayload.packet.targetWindow, "Alembic");
  assert.equal(dispatchPayload.packet.prompt.startsWith("继续当前窗口任务"), true);
  assert.deepEqual(dispatchPayload.packet.returnPolicy, { mode: "group-ready" });
  assert.deepEqual(dispatchPayload.dispatchGroup.returnPolicy, { mode: "group-ready" });
  assert.equal(dispatchPayload.dispatchGroup.expectedTargets[0].targetWindow, "Alembic");
  assert.equal(dispatchPayload.packetFile.endsWith("GROUP-1__Alembic__TASK-1.json"), true);
  assert.equal(dispatchPayload.dispatchGroupFile.endsWith("dispatch-groups/GROUP-1.json"), true);

  const delivery = run(root, [
    "build-delivery",
    "--packet-file",
    dispatchPayload.packetFile,
    "--delivery-id",
    "delivery-1",
    "--write",
  ]);
  assert.equal(delivery.status, 0, delivery.stderr || delivery.stdout);
  const deliveryPayload = JSON.parse(delivery.stdout);
  assert.equal(deliveryPayload.envelope.prompt, dispatchPayload.packet.prompt);
  assert.equal(deliveryPayload.envelope.oneShot, true);
  assert.equal(deliveryPayload.envelope.returnRoute, "controller");
  assert.deepEqual(deliveryPayload.envelope.returnPolicy, { mode: "group-ready" });
  assert.equal(deliveryPayload.envelope.version, 2);
  assert.equal(deliveryPayload.envelope.transport.kind, "direct-thread");
  assert.equal(deliveryPayload.envelope.schedule, undefined);
  assert.equal(deliveryPayload.envelope.codexAutomation, undefined);
});

test("prepare-dispatch writes window config, packet, and delivery without changing prompt shape", () => {
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

  const prepared = run(root, [
    "prepare-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-PREPARE",
    "--group",
    "GROUP-PREPARE",
    "--controller-window",
    "AlembicWorkspace",
    "--return-policy",
    "group-ready",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Prepared fixture",
    "--evidence",
    "commit",
    "--require-thread",
    "--write",
  ]);
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
  const payload = JSON.parse(prepared.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.packet.targetWindow, "Alembic");
  assert.equal(payload.threadReady, true);
  assert.equal(payload.windowConfig.threadRegistered, true);
  assert.equal(payload.envelope.sourcePacketId, payload.packet.id);
  assert.equal(payload.envelope.prompt, payload.packet.prompt);
  assert.match(payload.envelope.prompt, /^继续当前窗口任务：Alembic \/ TASK-PREPARE。/);
  assert.match(payload.envelope.prompt, /\n\n变量：\n- currentWindow: Alembic\n- taskId: TASK-PREPARE/);
  assert.doesNotMatch(prepared.stdout, /0192fac-real-thread/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.deliveryFile), "utf8"), /0192fac-real-thread/);
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
    "--controller-window",
    "AlembicWorkspace-Aux",
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
  assert.match(payload.packet.prompt, /\n- controllerWindow: AlembicWorkspace-Aux\n/);
  assert.match(payload.packet.prompt, /\n- dispatchGroup: GROUP-PROMPT\n/);
  assert.match(payload.packet.prompt, /不创建子窗口下一跳/);
  assert.match(payload.packet.prompt, /dispatch group returnPolicy/);
  assert.match(payload.packet.prompt, /\n- skill: \.\.\/codex-control-workspace\/skills\/dev\/codex-automation-target\/SKILL\.md$/);
  assert.equal(payload.packet.controllerWindow, "AlembicWorkspace-Aux");
  assert.equal(payload.dispatchGroup.controllerWindow, "AlembicWorkspace-Aux");
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
  assert.equal(registerPayload.deliveryRole, "target");
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
      "--write",
    ]).stdout,
  );
  const delivery = run(root, ["build-delivery", "--packet-file", dispatch.packetFile, "--require-thread", "--write"]);
  assert.equal(delivery.status, 0, delivery.stderr || delivery.stdout);
  const payload = JSON.parse(delivery.stdout);
  assert.equal(payload.threadReady, true);
  assert.equal(payload.threadIdRedacted, true);
  assert.equal(payload.envelope.transport.kind, "direct-thread");
  assert.equal(payload.envelope.targetThread.threadIdRedacted, true);
  assert.equal(payload.envelope.targetThread.threadRegistryFile, "thread-registry/Alembic.json");
  assert.equal(payload.envelope.codexAutomation, undefined);
  assert.doesNotMatch(readFileSync(path.join(root, payload.deliveryFile), "utf8"), /0192fac-real-thread/);
});

test("builds derived window config without exposing raw thread ids", () => {
  const root = makeFixture();
  writeFile(
    path.join(root, ".workspace-local/workspace.config.json"),
    JSON.stringify(
      {
        controlWindow: "AlembicWorkspace",
        dispatchWindows: ["Alembic"],
        repositories: [{ windowName: "Alembic", path: "../Alembic", role: "Base repo" }],
      },
      null,
      2,
    ),
  );
  const register = run(root, [
    "register-thread",
    "--window",
    "Alembic",
    "--thread-id",
    "0192fac-real-thread",
    "--role",
    "target",
    "--cwd",
    "../Alembic",
    "--responsibility-root",
    "../Alembic",
    "--write",
  ]);
  assert.equal(register.status, 0, register.stderr || register.stdout);

  const configResult = run(root, ["build-window-config", "--window", "Alembic", "--require-thread", "--write"]);
  assert.equal(configResult.status, 0, configResult.stderr || configResult.stdout);
  const payload = JSON.parse(configResult.stdout);
  assert.equal(payload.config.kind, "CodexSubwindowDispatchConfig");
  assert.equal(payload.config.threadRegistered, true);
  assert.equal(payload.config.delivery.transport, "direct-thread");
  assert.equal(payload.config.threadRegistryFile, "thread-registry/Alembic.json");
  assert.doesNotMatch(configResult.stdout, /0192fac-real-thread/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.configFile), "utf8"), /0192fac-real-thread/);
});

test("normalizes legacy deliveryRole values when deriving window config", () => {
  const root = makeFixture();
  writeFile(
    path.join(root, ".workspace-local/workspace.config.json"),
    JSON.stringify(
      {
        dispatchWindows: ["AlembicTest-IDE"],
        repositories: [{ windowName: "AlembicTest-IDE", path: "../AlembicTest", role: "Test window" }],
      },
      null,
      2,
    ),
  );
  writeFile(
    path.join(root, ".workspace-local/codex-automation-loop/thread-registry/AlembicTest-IDE.json"),
    JSON.stringify(
      {
        kind: "CodexWindowThreadRegistration",
        version: 2,
        windowName: "AlembicTest-IDE",
        deliveryRole: "AlembicTest",
        threadId: "0192fac-test-thread",
        cwd: "../AlembicTest",
      },
      null,
      2,
    ),
  );

  const configResult = run(root, ["build-window-config", "--window", "AlembicTest-IDE", "--require-thread", "--write"]);
  assert.equal(configResult.status, 0, configResult.stderr || configResult.stdout);
  const payload = JSON.parse(configResult.stdout);
  assert.equal(payload.config.deliveryRole, "test-target");
  assert.equal(payload.config.dispatchable, true);
  assert.doesNotMatch(configResult.stdout, /0192fac-test-thread/);
});

test("builds controller-return envelopes from registered controller threads", () => {
  const root = makeFixture();
  seedCompletedResult(root);
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
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--return-reason",
    "blocked",
    "--require-thread",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.threadReady, true);
  assert.equal(payload.threadIdRedacted, true);
  assert.equal(payload.envelope.kind, "ControllerReturnEnvelope");
  assert.equal(payload.envelope.version, 2);
  assert.equal(payload.envelope.triggerTarget, "Alembic");
  assert.equal(payload.envelope.triggerTaskId, "TASK-RETURN");
  assert.deepEqual(payload.envelope.returnPolicy, { mode: "group-ready" });
  assert.equal(payload.envelope.reviewScope, "group");
  assert.equal(payload.envelope.groupSnapshot.groupStatus, "ready");
  assert.equal(payload.envelope.transport.kind, "direct-thread");
  assert.equal(payload.envelope.loopGuard.returnReason, "blocked");
  assert.equal(payload.envelope.loopGuard.noEligibleTaskAction, "stop-without-next-delivery");
  assert.equal(payload.envelope.loopGuard.repeatControllerReturnForbidden, true);
  assert.equal(payload.envelope.targetThread.threadRegistryFile, "thread-registry/AlembicWorkspace.json");
  assert.equal(payload.envelope.deliveryCompletion.required, true);
  assert.equal(payload.envelope.deliveryCompletion.pendingUntil, "host-send-readback-recorded");
  assert.equal(payload.deliveryStatus, "pending-host-send");
  assert.equal(payload.deliveryCompletionRequired, true);
  assert.equal(payload.envelope.codexAutomation, undefined);
  assert.match(payload.envelope.prompt, /^继续总控验收：Alembic 回填。/);
  assert.match(payload.envelope.prompt, /\n- triggerTarget: Alembic\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- completedTargets:/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- blockedTargets: 无\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- missingTargets: 无\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- remainingTargets: 无\n/);
  assert.match(payload.envelope.prompt, /没有任务、目标完成或需要用户裁决时停止，不创建下一跳/);
  assert.match(payload.envelope.prompt, /\n- dispatchGroup: GROUP-RETURN\n/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.returnFile), "utf8"), /0192fac-controller-thread/);

  const review = JSON.parse(run(root, ["review-results", "--group", "GROUP-RETURN"]).stdout);
  assert.equal(review.controllerReturnDelivery.status, "pending-host-send");
  assert.equal(review.controllerReturnDelivery.envelopeCount, 1);
});

test("controller-return defaults to the dispatch group's originating controller", () => {
  const root = makeFixture();
  writeFile(
    path.join(root, ".workspace-local/workspace.config.json"),
    JSON.stringify({ controlWindow: "AlembicWorkspace" }, null, 2),
  );
  seedCompletedResult(root, { group: "GROUP-AUX", taskId: "TASK-AUX", controllerWindow: "AlembicWorkspace-Aux" });
  const registerMain = run(root, [
    "register-thread",
    "--window",
    "AlembicWorkspace",
    "--thread-id",
    "0192fac-main-controller-thread",
    "--role",
    "controller",
    "--write",
  ]);
  assert.equal(registerMain.status, 0, registerMain.stderr || registerMain.stdout);
  const registerAux = run(root, [
    "register-thread",
    "--window",
    "AlembicWorkspace-Aux",
    "--thread-id",
    "0192fac-aux-controller-thread",
    "--role",
    "controller",
    "--write",
  ]);
  assert.equal(registerAux.status, 0, registerAux.stderr || registerAux.stdout);

  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-AUX",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-AUX",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--require-thread",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.envelope.controllerWindow, "AlembicWorkspace-Aux");
  assert.equal(payload.envelope.targetThread.windowName, "AlembicWorkspace-Aux");
  assert.equal(payload.envelope.targetThread.threadRegistryFile, "thread-registry/AlembicWorkspace-Aux.json");
  assert.equal(payload.envelope.transport.threadRegistryFile, "thread-registry/AlembicWorkspace-Aux.json");
  assert.equal(payload.envelope.groupSnapshot.controllerWindow, "AlembicWorkspace-Aux");
  assert.equal(payload.envelope.loopGuard.controllerWindow, "AlembicWorkspace-Aux");
  assert.match(payload.envelope.prompt, /\n- controllerWindow: AlembicWorkspace-Aux\n/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.returnFile), "utf8"), /0192fac-aux-controller-thread/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.returnFile), "utf8"), /0192fac-main-controller-thread/);
});

test("dispatch groups reject mixed originating controllers", () => {
  const root = makeFixture();
  const first = run(root, [
    "create-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--group",
    "GROUP-MIXED-CONTROLLER",
    "--controller-window",
    "AlembicWorkspace-Aux",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Fixture",
    "--write",
  ]);
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const second = run(root, [
    "create-dispatch",
    "--target-window",
    "AlembicAgent",
    "--task-id",
    "TASK-2",
    "--group",
    "GROUP-MIXED-CONTROLLER",
    "--controller-window",
    "AlembicWorkspace",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Fixture",
    "--write",
  ]);
  assert.notEqual(second.status, 0);
  assert.match(second.stdout, /already returns to controller AlembicWorkspace-Aux/);
});

test("controller-return never embeds raw ids in v2 envelopes", () => {
  const root = makeFixture();
  seedCompletedResult(root);
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
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
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
  assert.equal(payload.envelope.targetThread.threadIdRedacted, true);
  assert.equal(payload.envelope.codexAutomation, undefined);
  assert.doesNotMatch(result.stdout, /0192fac-controller-thread/);
});

test("controller-return requires registered controller thread when requested", () => {
  const root = makeFixture();
  seedCompletedResult(root);
  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
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
  seedCompletedResult(root);
  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-RETURN",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-RETURN",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.wrote, false);
  assert.equal(payload.threadReady, false);
  assert.equal(payload.envelope.codexAutomation, undefined);
  assert.equal(payload.envelope.transport.kind, "direct-thread");
});

test("controller-return fails closed when group still has missing results", () => {
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
  const dispatch = run(root, [
    "create-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-MISSING",
    "--group",
    "GROUP-MISSING",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Missing result fixture",
    "--write",
  ]);
  assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);

  const result = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-MISSING",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-MISSING",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--return-reason",
    "result-ready",
    "--require-thread",
    "--write",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Cannot build controller return before trigger target result exists/);
});

test("controller-return is only complete after host send readback is recorded", () => {
  const root = makeFixture();
  seedCompletedResult(root);
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
  const build = JSON.parse(
    run(root, [
      "build-controller-return",
      "--group",
      "GROUP-RETURN",
      "--trigger-target",
      "Alembic",
      "--trigger-task-id",
      "TASK-RETURN",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--require-thread",
      "--write",
    ]).stdout,
  );

  const pending = JSON.parse(run(root, ["review-results", "--group", "GROUP-RETURN"]).stdout);
  assert.equal(pending.controllerReturnDelivery.status, "pending-host-send");
  assert.equal(pending.controllerReturnDelivery.sentCount, 0);

  const runResult = run(root, [
    "record-delivery-run",
    "--delivery-file",
    build.returnFile,
    "--status",
    "sent",
    "--host-method",
    "send_message_to_thread",
    "--host-mode",
    "new-turn",
    "--readback-ok",
    "true",
    "--evidence",
    "controller thread readback saw the return prompt",
    "--write",
  ]);
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);

  const sent = JSON.parse(run(root, ["review-results", "--group", "GROUP-RETURN"]).stdout);
  assert.equal(sent.controllerReturnDelivery.status, "sent");
  assert.equal(sent.controllerReturnDelivery.sentCount, 1);
  assert.equal(sent.controllerReturnDelivery.deliveries[0].readbackOk, true);
  assert.doesNotMatch(readFileSync(path.join(root, build.returnFile), "utf8"), /0192fac-controller-thread/);
  assert.doesNotMatch(runResult.stdout, /0192fac-controller-thread/);
});

test("records direct-thread delivery run evidence", () => {
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
  const dispatch = JSON.parse(
    run(root, [
      "create-dispatch",
      "--target-window",
      "Alembic",
      "--task-id",
      "TASK-RUN",
      "--group",
      "GROUP-RUN",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      "Implement fixture",
      "--write",
    ]).stdout,
  );
  const delivery = JSON.parse(
    run(root, ["build-delivery", "--packet-file", dispatch.packetFile, "--require-thread", "--write"]).stdout,
  );
  const runResult = run(root, [
    "record-delivery-run",
    "--delivery-file",
    delivery.deliveryFile,
    "--status",
    "sent",
    "--host-mode",
    "new-turn",
    "--readback-ok",
    "true",
    "--evidence",
    "thread readback saw prompt",
    "--write",
  ]);
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  const payload = JSON.parse(runResult.stdout);
  assert.equal(payload.run.kind, "DirectThreadDeliveryRun");
  assert.equal(payload.run.status, "sent");
  assert.equal(payload.run.thread.threadIdRedacted, true);
  assert.equal(payload.run.thread.threadRegistryFile, "thread-registry/Alembic.json");
  assert.equal(payload.run.readback.ok, true);
  assert.doesNotMatch(readFileSync(path.join(root, payload.runFile), "utf8"), /0192fac-real-thread/);
});

test("delivery run evidence rejects unsupported host mode", () => {
  const root = makeFixture();
  run(root, [
    "register-thread",
    "--window",
    "Alembic",
    "--thread-id",
    "0192fac-real-thread",
    "--role",
    "target",
    "--write",
  ]);
  const dispatch = JSON.parse(run(root, [
    "create-dispatch",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-NO-GUIDE",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
    "--objective",
    "Implement fixture",
    "--write",
  ]).stdout);
  const delivery = JSON.parse(run(root, [
    "build-delivery",
    "--packet-file",
    dispatch.packetFile,
    "--require-thread",
    "--write",
  ]).stdout);
  const result = run(root, [
    "record-delivery-run",
    "--delivery-file",
    delivery.deliveryFile,
    "--status",
    "sent",
    "--host-mode",
    "unsupported-mode",
    "--readback-ok",
    "true",
    "--evidence",
    "thread showed requested change",
    "--write",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /--host-mode must be one of: new-turn, unknown/);
});

test("records keep-live state for unattended automation", () => {
  const root = makeFixture();
  const result = run(root, [
    "keep-live-state",
    "--automation-run-id",
    "GROUP-RUN",
    "--status",
    "running",
    "--mechanism",
    "macos-caffeinate",
    "--pid",
    "12345",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.state.kind, "AutomationKeepLiveState");
  assert.equal(payload.state.enabled, true);
  assert.equal(payload.state.status, "running");
  assert.equal(payload.state.pid, 12345);
  assert.match(readFileSync(path.join(root, payload.stateFile), "utf8"), /GROUP-RUN/);
});

test("stopped keep-live state does not retain a legacy automation lease", () => {
  const root = makeFixture();
  const result = run(root, [
    "keep-live-state",
    "--automation-run-id",
    "OLD-RUN",
    "--status",
    "stopped",
    "--mechanism",
    "macos-caffeinate",
    "--write",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const status = JSON.parse(run(root, ["status"]).stdout);
  assert.equal(status.keepLive.active, false);
  assert.equal(status.keepLive.activeRunCount, 0);
  assert.deepEqual(status.keepLive.activeAutomationRunIds, []);
});

test(
  "starts and stops a local keep-live watcher on macOS",
  { skip: process.platform !== "darwin" ? "keep-live watcher is macOS-only" : false },
  () => {
    const root = makeFixture();
    let startPayload = null;
    try {
      const start = run(root, [
        "start-keep-live",
        "--automation-run-id",
        "WATCH-RUN",
        "--keep-live-command",
        process.execPath,
        "--keep-live-arg=-e",
        "--keep-live-arg",
        "setInterval(() => {}, 1000)",
        "--write",
      ]);
      assert.equal(start.status, 0, start.stderr || start.stdout);
      startPayload = JSON.parse(start.stdout);
      assert.equal(startPayload.ready, true);
      assert.equal(startPayload.keepLive.status, "running");
      assert.ok(startPayload.keepLive.workerPid > 0);
      assert.ok(startPayload.keepLive.childPid > 0);

      const status = JSON.parse(run(root, ["status"]).stdout);
      assert.equal(status.keepLive.active, true);
      assert.equal(status.keepLive.status, "running");
      assert.deepEqual(status.keepLive.activeAutomationRunIds, ["WATCH-RUN"]);

      const secondStart = run(root, [
        "start-keep-live",
        "--automation-run-id",
        "WATCH-RUN-2",
        "--keep-live-command",
        process.execPath,
        "--keep-live-arg=-e",
        "--keep-live-arg",
        "setInterval(() => {}, 1000)",
        "--write",
      ]);
      assert.equal(secondStart.status, 0, secondStart.stderr || secondStart.stdout);
      const secondStartPayload = JSON.parse(secondStart.stdout);
      assert.equal(secondStartPayload.ready, true);
      assert.equal(secondStartPayload.keepLive.message, "already running");
      assert.equal(secondStartPayload.keepLive.workerPid, startPayload.keepLive.workerPid);
      assert.deepEqual(secondStartPayload.keepLive.activeAutomationRunIds, ["WATCH-RUN", "WATCH-RUN-2"]);

      const releaseSecond = run(root, [
        "stop-loop",
        "--automation-run-id",
        "WATCH-RUN-2",
        "--reason",
        "second done",
        "--write",
      ]);
      assert.equal(releaseSecond.status, 0, releaseSecond.stderr || releaseSecond.stdout);
      const releaseSecondPayload = JSON.parse(releaseSecond.stdout);
      assert.equal(releaseSecondPayload.ok, true);
      assert.equal(releaseSecondPayload.keepLive.active, true);
      assert.equal(releaseSecondPayload.keepLive.retainedByOtherRuns, true);
      assert.deepEqual(releaseSecondPayload.keepLive.activeAutomationRunIds, ["WATCH-RUN"]);

      const stop = run(root, ["stop-keep-live", "--automation-run-id", "WATCH-RUN", "--reason", "test done", "--write"]);
      assert.equal(stop.status, 0, stop.stderr || stop.stdout);
      const stopPayload = JSON.parse(stop.stdout);
      assert.equal(stopPayload.ok, true);
      assert.equal(stopPayload.keepLive.active, false);
      assert.equal(stopPayload.keepLive.status, "stopped");
      const state = JSON.parse(readFileSync(path.join(root, stopPayload.stateFile), "utf8"));
      assert.equal(state.workerPid, 0);
      assert.equal(state.childPid, 0);
      assert.equal(state.stopReason, "test done");
    } finally {
      if (startPayload?.keepLive?.active) {
        run(root, ["stop-keep-live", "--automation-run-id", "WATCH-RUN", "--reason", "test cleanup", "--write"]);
      }
    }
  },
);

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

test("review-pack summarizes result evidence, delivery runs, and controller-return status", () => {
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
  const dispatch = JSON.parse(
    run(root, [
      "create-dispatch",
      "--target-window",
      "Alembic",
      "--task-id",
      "TASK-PACK",
      "--group",
      "GROUP-PACK",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      "Review fixture",
      "--write",
    ]).stdout,
  );
  const delivery = JSON.parse(
    run(root, [
      "build-delivery",
      "--packet-file",
      dispatch.packetFile,
      "--require-thread",
      "--write",
    ]).stdout,
  );
  const record = run(root, [
    "record-delivery-run",
    "--delivery-file",
    delivery.deliveryFile,
    "--status",
    "sent",
    "--host-method",
    "send_message_to_thread",
    "--host-mode",
    "new-turn",
    "--readback-ok",
    "true",
    "--evidence",
    "readback ok",
    "--write",
  ]);
  assert.equal(record.status, 0, record.stderr || record.stdout);
  const reportFile = path.join(root, "reports/result.md");
  writeFile(reportFile, "# report\n");
  const submit = run(root, [
    "submit-result",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-PACK",
    "--group",
    "GROUP-PACK",
    "--status",
    "completed",
    "--commit",
    "abc123",
    "--evidence-ref",
    "reports/result.md",
    "--verification",
    "npm test PASS",
    "--write",
  ]);
  assert.equal(submit.status, 0, submit.stderr || submit.stdout);

  const packed = run(root, ["review-pack", "--group", "GROUP-PACK"]);
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const payload = JSON.parse(packed.stdout);
  assert.equal(payload.command, "review-pack");
  assert.equal(payload.reviewPack.decision, "needs-controller-review");
  assert.equal(payload.reviewPack.gates.rawEvidencePullRequired, true);
  assert.equal(payload.reviewPack.targetResults[0].commits[0], "abc123");
  assert.equal(payload.reviewPack.targetResults[0].evidenceRefSummaries[0].exists, true);
  assert.equal(payload.reviewPack.targetResults[0].targetDeliveries[0].status, "sent");
  assert.equal(payload.reviewPack.controllerReturnDelivery.status, "not-built");
  assert.doesNotMatch(packed.stdout, /0192fac-real-thread/);
});

test("group-ready controller-return title lists returned windows instead of group id", () => {
  const root = makeFixture();
  for (const [targetWindow, taskId] of [
    ["Alembic", "TASK-1"],
    ["AlembicCore", "TASK-2"],
  ]) {
    const result = run(root, [
      "create-dispatch",
      "--target-window",
      targetWindow,
      "--task-id",
      taskId,
      "--group",
      "GROUP-MULTI-TITLE",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      `Fixture ${taskId}`,
      "--write",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const submit = run(root, [
      "submit-result",
      "--target-window",
      targetWindow,
      "--task-id",
      taskId,
      "--group",
      "GROUP-MULTI-TITLE",
      "--status",
      "completed",
      "--commit",
      `${targetWindow}-commit`,
      "--write",
    ]);
    assert.equal(submit.status, 0, submit.stderr || submit.stdout);
  }

  const controllerReturn = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-MULTI-TITLE",
    "--trigger-target",
    "AlembicCore",
    "--trigger-task-id",
    "TASK-2",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
  ]);
  assert.equal(controllerReturn.status, 0, controllerReturn.stderr || controllerReturn.stdout);
  const payload = JSON.parse(controllerReturn.stdout);
  assert.match(payload.envelope.prompt, /^继续总控验收：Alembic、AlembicCore 回填。/);
  assert.doesNotMatch(payload.envelope.prompt, /^继续总控验收：GROUP-MULTI-TITLE/);
  assert.match(payload.envelope.prompt, /\n- dispatchGroup: GROUP-MULTI-TITLE\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- completedTargets:/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- blockedTargets: 无\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- missingTargets: 无\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- remainingTargets: 无\n/);
});

test("per-target return policy allows one completed result to wake total control", () => {
  const root = makeFixture();
  for (const [index, [targetWindow, taskId]] of [
    ["Alembic", "TASK-1"],
    ["AlembicAgent", "TASK-2"],
  ].entries()) {
    const result = run(root, [
      "create-dispatch",
      "--target-window",
      targetWindow,
      "--task-id",
      taskId,
      "--group",
      "GROUP-PER-TARGET",
      ...(index === 0 ? ["--return-policy", "per-target"] : []),
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      `Fixture ${taskId}`,
      "--write",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const submitOne = run(root, [
    "submit-result",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--group",
    "GROUP-PER-TARGET",
    "--status",
    "completed",
    "--commit",
    "abc123",
    "--write",
  ]);
  assert.equal(submitOne.status, 0, submitOne.stderr || submitOne.stdout);

  const review = JSON.parse(run(root, ["review-results", "--group", "GROUP-PER-TARGET"]).stdout);
  assert.equal(review.decision, "needs-controller-review");
  assert.equal(review.groupStatus, "partially-ready");
  assert.deepEqual(review.returnPolicy, { mode: "per-target" });
  assert.equal(review.readyResults.length, 1);
  assert.equal(review.missingResults.length, 1);
  assert.deepEqual(review.groupSnapshot.missingTargets, ["AlembicAgent"]);

  const controllerReturn = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-PER-TARGET",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-1",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
  ]);
  assert.equal(controllerReturn.status, 0, controllerReturn.stderr || controllerReturn.stdout);
  const payload = JSON.parse(controllerReturn.stdout);
  assert.equal(payload.envelope.reviewScope, "single-target");
  assert.deepEqual(payload.envelope.returnPolicy, { mode: "per-target" });
  assert.equal(payload.envelope.groupSnapshot.groupStatus, "partially-ready");
  assert.match(payload.envelope.prompt, /^继续总控验收：Alembic 回填。/);
  assert.match(payload.envelope.prompt, /\n- remainingTargets: AlembicAgent\n/);
  assert.doesNotMatch(payload.envelope.prompt, /\n- completedTargets:/);
});

test("group-ready return policy waits for every target before controller return", () => {
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
      "GROUP-BARRIER",
      "--control-plan",
      ".workspace-active/workspace/current/plan.md",
      "--objective",
      `Fixture ${taskId}`,
      "--write",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  const submitOne = run(root, [
    "submit-result",
    "--target-window",
    "Alembic",
    "--task-id",
    "TASK-1",
    "--group",
    "GROUP-BARRIER",
    "--status",
    "completed",
    "--commit",
    "abc123",
    "--write",
  ]);
  assert.equal(submitOne.status, 0, submitOne.stderr || submitOne.stdout);
  const review = JSON.parse(run(root, ["review-results", "--group", "GROUP-BARRIER"]).stdout);
  assert.equal(review.decision, "wait");
  assert.equal(review.groupStatus, "partially-ready");

  const controllerReturn = run(root, [
    "build-controller-return",
    "--group",
    "GROUP-BARRIER",
    "--trigger-target",
    "Alembic",
    "--trigger-task-id",
    "TASK-1",
    "--control-plan",
    ".workspace-active/workspace/current/plan.md",
  ]);
  assert.notEqual(controllerReturn.status, 0);
  assert.match(controllerReturn.stdout, /Cannot build group-ready controller return while dispatch group has missing results/);
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
