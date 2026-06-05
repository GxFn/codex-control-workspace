#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const script = path.join(workspaceRoot, "scripts/codex-automation-loop.mjs");

function writeText(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function writeJson(file, value) {
  writeText(file, JSON.stringify(value, null, 2));
}

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "codex-loop-state-only-"));
  writeJson(path.join(root, "workspace.config.json"), {
    workspaceName: "ControlWorkspace",
    controlWindow: "AlembicWorkspace",
    repositories: [
      { windowName: "AlembicWorkspace", path: ".", role: "controller" },
      { windowName: "AlembicPlugin", path: "../AlembicPlugin", role: "plugin" },
    ],
    dispatchWindows: ["AlembicWorkspace", "AlembicPlugin"],
  });
  const stateRoot = path.join(root, ".workspace-active/workspace/current/CSMR-FIXTURE");
  mkdirSync(path.join(stateRoot, "task-packages"), { recursive: true });
  mkdirSync(path.join(stateRoot, "target-results"), { recursive: true });
  writeJson(path.join(stateRoot, "controller-state.json"), {
    schemaVersion: 1,
    demandKey: "CSMR-FIXTURE",
    title: "Controller State Fixture",
    state: "planned",
    stateReason: "test",
    revision: 3,
    activeStageId: null,
    updatedAt: "2026-06-05T00:00:00.000Z",
    allowedActions: [],
    blockers: [],
    decisionsRequired: [],
    stages: [],
    taskPackages: [{
      taskPackageId: "CSMR-PKG-1",
      summary: "Fixture package",
      status: "pending",
      createdAt: "2026-06-05T00:00:00.000Z",
    }],
    targetTasks: [{
      targetTaskId: "CSMR-TASK-1",
      taskPackageId: "CSMR-PKG-1",
      targetWindow: "AlembicPlugin",
      summary: "Run fixture target task",
      status: "pending",
      createdAt: "2026-06-05T00:00:00.000Z",
    }],
    windows: [{
      windowName: "AlembicPlugin",
      windowState: "pending",
      taskPackageIds: ["CSMR-PKG-1"],
      targetTaskIds: ["CSMR-TASK-1"],
    }],
    review: {
      status: "none",
      readyResultIds: [],
      blockedResultIds: [],
      missingResultIds: [],
    },
    automation: {
      enabled: false,
      activeRunIds: [],
      lastReviewPack: null,
    },
    projection: {
      status: "synced",
      lastRenderedAt: "2026-06-05T00:00:00.000Z",
      progressDoc: "developer-progress.md",
    },
  });
  writeJson(path.join(stateRoot, "task-packages/CSMR-PKG-1.json"), {
    schemaVersion: 1,
    taskPackageId: "CSMR-PKG-1",
    demandKey: "CSMR-FIXTURE",
    summary: "Fixture package",
    status: "pending",
    targetTasks: [{
      targetTaskId: "CSMR-TASK-1",
      taskPackageId: "CSMR-PKG-1",
      targetWindow: "AlembicPlugin",
      summary: "Run fixture target task",
      status: "pending",
    }],
    createdAt: "2026-06-05T00:00:00.000Z",
  });
  writeText(path.join(stateRoot, "developer-progress.md"), "# Controller State Fixture");
  return {
    root,
    stateRootRef: ".workspace-active/workspace/current/CSMR-FIXTURE",
    stateRoot,
  };
}

function run(root, args) {
  return spawnSync("node", [script, ...args, "--root", root, "--json"], {
    cwd: root,
    encoding: "utf8",
  });
}

function parseOk(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function registerThread(root, windowName, role = "target") {
  return parseOk(run(root, [
    "register-thread",
    "--window",
    windowName,
    "--thread-id",
    `0192fac-${windowName}`,
    "--role",
    role,
    "--write",
  ]));
}

function prepareDispatch(root, stateRootRef, extra = []) {
  return parseOk(run(root, [
    "prepare-dispatch-from-state",
    "--state-root",
    stateRootRef,
    "--target-task-id",
    "CSMR-TASK-1",
    "--group",
    "GROUP-STATE",
    "--controller-window",
    "AlembicWorkspace",
    "--human-context-ref",
    `${stateRootRef}/developer-progress.md`,
    "--require-thread",
    "--write",
    ...extra,
  ]));
}

test("help exposes state-root commands and rejects old dispatch routes", () => {
  const { root } = makeFixture();
  const help = spawnSync("node", [script, "--help", "--root", root], { cwd: root, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /prepare-dispatch-from-state/);
  assert.doesNotMatch(help.stdout, /create-dispatch/);
  assert.doesNotMatch(help.stdout, /prepare-dispatch --target-window/);
  assert.doesNotMatch(help.stdout, /--control-plan/);

  for (const command of ["create-dispatch", "prepare-dispatch"]) {
    const result = run(root, [command, "--write"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Unknown command/);
  }
});

test("registers threads locally and redacts thread ids", () => {
  const { root } = makeFixture();
  const payload = registerThread(root, "AlembicPlugin");
  assert.equal(payload.ok, true);
  assert.equal(payload.windowName, "AlembicPlugin");
  assert.equal(payload.threadIdRedacted, true);
  assert.doesNotMatch(JSON.stringify(payload), /0192fac-AlembicPlugin/);

  const config = parseOk(run(root, ["build-window-config", "--window", "AlembicPlugin", "--require-thread", "--write"]));
  assert.equal(config.config.threadRegistered, true);
  assert.equal(config.config.dispatchable, true);
  assert.equal(config.config.delivery.transport, "direct-thread");
});

test("prepare-dispatch-from-state writes packet, group, and delivery without control plan authority", () => {
  const { root, stateRootRef } = makeFixture();
  registerThread(root, "AlembicPlugin");
  const payload = prepareDispatch(root, stateRootRef);

  assert.equal(payload.ok, true);
  assert.equal(payload.command, "prepare-dispatch-from-state");
  assert.equal(payload.packet.controlPlan, undefined);
  assert.equal(payload.dispatchGroup.controlPlan, undefined);
  assert.equal(payload.envelope.controlPlan, undefined);
  assert.equal(payload.packet.stateRef.stateRoot, stateRootRef);
  assert.equal(payload.packet.stateRef.taskPackageId, "CSMR-PKG-1");
  assert.equal(payload.packet.stateRef.stateRevision, 3);
  assert.equal(payload.dispatchGroup.stateRef.stateRoot, stateRootRef);
  assert.equal(payload.envelope.stateRef.targetTaskId, "CSMR-TASK-1");
  assert.match(payload.packet.prompt, /- stateRoot: \.workspace-active\/workspace\/current\/CSMR-FIXTURE/);
  assert.match(payload.packet.prompt, /- humanContextRef: \.workspace-active\/workspace\/current\/CSMR-FIXTURE\/developer-progress\.md/);
  assert.doesNotMatch(payload.packet.prompt, /controlPlan:/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.packetFile), "utf8"), /controlPlan/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.deliveryFile), "utf8"), /controlPlan/);
  assert.doesNotMatch(readFileSync(path.join(root, payload.deliveryFile), "utf8"), /0192fac-AlembicPlugin/);
});

test("build-delivery rejects legacy packets without stateRef", () => {
  const { root } = makeFixture();
  const packetFile = path.join(root, "legacy-packet.json");
  writeJson(packetFile, {
    kind: "ControllerDispatchPacket",
    version: 1,
    id: "legacy-packet",
    targetWindow: "AlembicPlugin",
    taskId: "TASK-LEGACY",
    prompt: "继续当前窗口任务：AlembicPlugin / TASK-LEGACY。",
  });
  const result = run(root, ["build-delivery", "--packet-file", "legacy-packet.json", "--write"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing stateRef/);
});

test("review-results and controller return require state-root group evidence", () => {
  const { root, stateRootRef } = makeFixture();
  registerThread(root, "AlembicPlugin");
  registerThread(root, "AlembicWorkspace", "controller");
  const prepared = prepareDispatch(root, stateRootRef);

  const waiting = parseOk(run(root, ["review-results", "--group", "GROUP-STATE"]));
  assert.equal(waiting.decision, "wait");
  assert.equal(waiting.groupSnapshot.missingTargets[0], "AlembicPlugin");

  const completed = parseOk(run(root, [
    "submit-result",
    "--target-window",
    "AlembicPlugin",
    "--task-id",
    "CSMR-TASK-1",
    "--group",
    "GROUP-STATE",
    "--status",
    "completed",
    "--evidence-ref",
    "reports/result.json",
    "--verification",
    "focused smoke passed",
    "--write",
  ]));
  assert.equal(completed.result.status, "completed");

  const ready = parseOk(run(root, ["review-results", "--group", "GROUP-STATE"]));
  assert.equal(ready.decision, "needs-controller-review");
  assert.equal(ready.groupSnapshot.readyTargets[0], "AlembicPlugin");

  const returned = parseOk(run(root, [
    "build-controller-return",
    "--group",
    "GROUP-STATE",
    "--trigger-target",
    "AlembicPlugin",
    "--trigger-task-id",
    "CSMR-TASK-1",
    "--require-thread",
    "--write",
  ]));
  assert.equal(returned.envelope.controlPlan, undefined);
  assert.equal(returned.envelope.stateRef.stateRoot, stateRootRef);
  assert.equal(returned.envelope.humanContextRef, `${stateRootRef}/developer-progress.md`);
  assert.match(returned.envelope.prompt, /- stateRoot: \.workspace-active\/workspace\/current\/CSMR-FIXTURE/);
  assert.doesNotMatch(returned.envelope.prompt, /controlPlan:/);
  assert.doesNotMatch(readFileSync(path.join(root, returned.returnFile), "utf8"), /controlPlan/);
  assert.equal(returned.envelope.dispatchGroup, prepared.packet.dispatchGroup);
});

test("state-root review-pack reads target results from controller state root", () => {
  const { root, stateRootRef, stateRoot } = makeFixture();
  writeJson(path.join(stateRoot, "target-results/result-1.json"), {
    schemaVersion: 1,
    resultId: "result-1",
    demandKey: "CSMR-FIXTURE",
    taskPackageId: "CSMR-PKG-1",
    targetTaskId: "CSMR-TASK-1",
    targetWindow: "AlembicPlugin",
    status: "completed",
    evidenceRefs: ["reports/plugin-result.json"],
    verification: ["unit tests passed"],
    risks: [],
    createdAt: "2026-06-05T00:01:00.000Z",
  });

  const payload = parseOk(run(root, ["review-pack", "--state-root", stateRootRef]));
  assert.equal(payload.source, "controller-state-root");
  assert.equal(payload.decision, "needs-controller-review");
  assert.equal(payload.reviewPack.gates.stateRootBased, true);
  assert.equal(payload.reviewPack.targetResults[0].stateRootResult, true);
  assert.equal(payload.reviewPack.rawEvidenceRequired[0].evidenceRefs[0], "reports/plugin-result.json");
});

test("completed target results require reviewable evidence", () => {
  const { root } = makeFixture();
  const result = run(root, [
    "submit-result",
    "--target-window",
    "AlembicPlugin",
    "--task-id",
    "CSMR-TASK-1",
    "--status",
    "completed",
    "--write",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /completed results require/);
});

test("record-delivery-run enforces sent readback evidence", () => {
  const { root, stateRootRef } = makeFixture();
  registerThread(root, "AlembicPlugin");
  const prepared = prepareDispatch(root, stateRootRef);

  const missingEvidence = run(root, [
    "record-delivery-run",
    "--delivery-file",
    prepared.deliveryFile,
    "--status",
    "sent",
    "--readback-ok",
    "true",
    "--write",
  ]);
  assert.notEqual(missingEvidence.status, 0);
  assert.match(missingEvidence.stdout, /sent delivery runs require/);

  const recorded = parseOk(run(root, [
    "record-delivery-run",
    "--delivery-file",
    prepared.deliveryFile,
    "--status",
    "sent",
    "--readback-ok",
    "true",
    "--evidence",
    "read_thread latest turn is inProgress",
    "--write",
  ]));
  assert.equal(recorded.status, "sent");
  assert.equal(recorded.run.readback.ok, true);
  assert.doesNotMatch(JSON.stringify(recorded), /0192fac-AlembicPlugin/);
});

test("stop-loop writes a stop marker without creating new delivery state", () => {
  const { root } = makeFixture();
  const payload = parseOk(run(root, [
    "stop-loop",
    "--reason",
    "test complete",
    "--write",
  ]));
  assert.equal(payload.command, "stop-loop");
  assert.equal(payload.reason, "test complete");
  assert.equal(payload.keepLive.active, false);
});
