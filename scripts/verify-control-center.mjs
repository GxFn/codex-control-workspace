#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const withRuntime = args.includes("--with-runtime");
const strictRuntime = args.includes("--strict-runtime");
const requireTodo = args.includes("--require-todo");
const requireTaskPackages = args.includes("--require-task-packages");
const withScriptTests = args.includes("--with-script-tests");

const checks = [
  {
    label: "workspace boundary",
    command: "node",
    args: ["scripts/check-workspace-boundary.mjs"],
  },
  {
    label: "repo status",
    command: "node",
    args: ["scripts/collect-repo-status.mjs"],
  },
  {
    label: "workspace docs",
    command: "node",
    args: ["scripts/verify-workspace-docs.mjs", "--all-workspace"],
  },
  {
    label: "script docs",
    command: "node",
    args: ["scripts/check-script-docs.mjs"],
  },
  {
    label: "current plan sync",
    command: "node",
    args: ["scripts/sync-current-plan.mjs", "--check"],
  },
  {
    label: "decision preflight",
    command: "node",
    args: ["scripts/check-decision-preflight.mjs"],
  },
  {
    label: "current layout",
    command: "node",
    args: ["scripts/check-workspace-current-layout.mjs"],
  },
  {
    label: "dispatch coverage",
    command: "node",
    args: ["scripts/check-dispatch-coverage.mjs"],
  },
  {
    label: "test boundary",
    command: "node",
    args: ["scripts/check-test-boundary.mjs"],
  },
  {
    label: "TODO board",
    command: "node",
    args: ["scripts/check-todo-board.mjs", ...(requireTodo ? ["--require"] : [])],
  },
  {
    label: "task packages",
    command: "node",
    args: ["scripts/check-task-packages.mjs", ...(requireTaskPackages ? ["--require"] : [])],
  },
  {
    label: "git diff whitespace",
    command: "git",
    args: ["diff", "--check"],
  },
];

if (withRuntime || strictRuntime) {
  checks.push({
    label: "runtime residue",
    command: "node",
    args: ["scripts/check-runtime-residue.mjs", ...(strictRuntime ? ["--strict"] : [])],
  });
}

if (withScriptTests) {
  checks.push({
    label: "workspace script tests",
    command: "node",
    args: [
      "--test",
      "scripts/check-decision-preflight.test.mjs",
      "scripts/check-dispatch-coverage.test.mjs",
      "scripts/check-script-docs.test.mjs",
      "scripts/check-test-boundary.test.mjs",
      "scripts/sync-current-plan.test.mjs",
      "scripts/visible-dispatch.test.mjs",
      "scripts/workspace-control.test.mjs",
    ],
  });
}

function runCheck(check) {
  console.log(`\n## ${check.label}`);
  console.log(`$ ${[check.command, ...check.args].join(" ")}`);

  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    ...check,
    status: result.status ?? 1,
    signal: result.signal ?? "",
    ok: result.status === 0,
  };
}

console.log("Control workspace verification");
console.log(`Runtime residue check: ${withRuntime || strictRuntime ? (strictRuntime ? "strict" : "warning") : "skipped"}`);
console.log(`Required TODO board: ${requireTodo ? "yes" : "no"}`);
console.log(`Required task packages: ${requireTaskPackages ? "yes" : "no"}`);
console.log(`Workspace script tests: ${withScriptTests ? "yes" : "no"}`);

const results = checks.map(runCheck);
const failed = results.filter((result) => !result.ok);

console.log("\n## Summary");
for (const result of results) {
  console.log(`- ${result.ok ? "PASS" : "FAIL"} ${result.label}`);
}

if (failed.length > 0) {
  process.exit(1);
}
