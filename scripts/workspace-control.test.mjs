#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const controlScript = path.join(workspaceRoot, "scripts/workspace-control.mjs");

function run(args) {
  return spawnSync("node", [controlScript, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
}

test("--print verify maps friendly flags to verify-control-center flags", () => {
  const result = run(["--print", "verify", "--dispatch", "--runtime", "--script-tests"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /node scripts\/verify-control-center\.mjs --require-todo --require-task-packages --with-runtime --with-script-tests/,
  );
});

test("--print sync write keeps explicit write gate and post-check", () => {
  const result = run(["--print", "sync", "--write", "--verify", "--dispatch"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/sync-current-plan\.mjs --write/);
  assert.match(result.stdout, /node scripts\/sync-current-plan\.mjs --check/);
  assert.match(result.stdout, /node scripts\/verify-control-center\.mjs --require-todo --require-task-packages/);
});

test("--print design preserves focused handoff validation arguments", () => {
  const result = run(["--print", "design", "--id", "PCVM-2026-05-25", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/import-design-handoffs\.mjs --json --id PCVM-2026-05-25/);
});

test("--print loop maps to codex automation closed-loop script", () => {
  const result = run(["--print", "loop", "status", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/codex-automation-loop\.mjs status --json/);
});

test("status --json returns a machine-readable aggregate", () => {
  const result = run(["status", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, "status");
  assert.deepEqual(
    payload.checks.map((check) => check.key),
    ["repoStatus", "currentPlanSync", "dispatchCoverage"],
  );
});

test("--print install maps to control workspace install script", () => {
  const result = run(["--print", "install", "prompts", "--window", "BaseWindow"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/control-workspace-install\.mjs prompts --window BaseWindow/);
});

test("--print install supports internal Design/Test template sync", () => {
  const result = run(["--print", "install", "configure", "--internal-design", "--internal-test", "--write"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/control-workspace-install\.mjs configure --internal-design --internal-test --write/);
});

test("--print install write-agents supports explicit unmanaged window refresh", () => {
  const result = run(["--print", "install", "write-agents", "--all", "--include-unmanaged", "--write"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /node scripts\/control-workspace-install\.mjs write-agents --all --include-unmanaged --write/);
});

test("legacy vad command is not accepted", () => {
  const result = run(["--print", "vad", "status", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown workspace-control command: vad/);
});

test("unknown command fails closed", () => {
  const result = run(["--print", "launch"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown workspace-control command/);
});
