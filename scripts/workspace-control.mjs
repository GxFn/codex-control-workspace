#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceConfig } from "./lib/workspace-config.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(scriptsDir);
const rawArgs = process.argv.slice(2);
const printOnly = rawArgs.includes("--print");
const args = rawArgs.filter((arg) => arg !== "--print");
const command = args[0] ?? "help";
const commandArgs = args.slice(1);
const workspaceConfig = loadWorkspaceConfig({ workspaceRoot, args: rawArgs });

const testScripts = [
  "scripts/check-decision-preflight.test.mjs",
  "scripts/check-dispatch-coverage.test.mjs",
  "scripts/check-script-docs.test.mjs",
  "scripts/check-test-boundary.test.mjs",
  "scripts/sync-current-plan.test.mjs",
  "scripts/visible-dispatch.test.mjs",
  "scripts/workspace-control.test.mjs",
];

const helpText = `
${workspaceConfig.workspaceName} control script aggregator

Usage:
  node scripts/workspace-control.mjs <command> [options]
  node scripts/workspace-control.mjs --print <command> [options]

Commands:
  status      Show repo status and current dispatch/sync health.
  verify      Run verify-control-center with common option aliases.
  sync        Check or write current-plan generated surfaces.
  dispatch    Check dispatch, TODO, and task-package readiness.
  design      Refresh or validate Design handoff intake.
  runtime     Inspect runtime residue without mutating processes.
  scripts     Check script docs, optionally including script tests.
  vad         Inspect or operate Visible Automation Dispatch local state.
  pipeline    Run the fixture governance pipeline.
  help        Show this help.

Common examples:
  node scripts/workspace-control.mjs status
  node scripts/workspace-control.mjs verify --dispatch --script-tests
  node scripts/workspace-control.mjs sync --write --verify --dispatch
  node scripts/workspace-control.mjs design --id PCVM-2026-05-25 --json
  node scripts/workspace-control.mjs vad status --json
  node scripts/workspace-control.mjs vad controller --compact --json
  node scripts/workspace-control.mjs vad audit --automation-id <id> --json
  node scripts/workspace-control.mjs vad post-run-audit --json
  node scripts/workspace-control.mjs pipeline --json

Safety:
  This script only orchestrates existing workspace scripts. Write-capable flows
  still require explicit flags such as --write or --apply on the underlying
  script. Use --print to inspect the exact commands before running them.
`.trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function hasFlag(options, name) {
  return options.includes(name);
}

function getValue(options, name) {
  const eq = options.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = options.indexOf(name);
  if (index >= 0 && options[index + 1] && !options[index + 1].startsWith("--")) {
    return options[index + 1];
  }
  return null;
}

function assertKnownOptions(options, knownFlags, knownValues = []) {
  const valueNames = new Set(knownValues);
  const known = new Set([...knownFlags, ...knownValues]);
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (!option.startsWith("--")) {
      fail(`Unexpected positional argument: ${option}`);
    }
    const name = option.includes("=") ? option.slice(0, option.indexOf("=")) : option;
    if (!known.has(name)) {
      fail(`Unsupported option for ${command}: ${option}`);
    }
    if (valueNames.has(name) && !option.includes("=")) {
      if (!options[index + 1] || options[index + 1].startsWith("--")) {
        fail(`Missing value for ${name}.`);
      }
      index += 1;
    }
  }
}

function nodeScript(script, argsForScript = []) {
  return {
    command: process.execPath,
    displayCommand: "node",
    args: [`scripts/${script}`, ...argsForScript],
  };
}

function shellDisplay(step) {
  return [step.displayCommand ?? step.command, ...step.args].join(" ");
}

function verifyArgs(options) {
  const out = [];
  if (hasFlag(options, "--dispatch")) {
    out.push("--require-todo", "--require-task-packages");
  }
  if (hasFlag(options, "--todo")) {
    out.push("--require-todo");
  }
  if (hasFlag(options, "--task-packages")) {
    out.push("--require-task-packages");
  }
  if (hasFlag(options, "--runtime") || hasFlag(options, "--with-runtime")) {
    out.push("--with-runtime");
  }
  if (hasFlag(options, "--strict-runtime")) {
    out.push("--strict-runtime");
  }
  if (hasFlag(options, "--script-tests") || hasFlag(options, "--with-script-tests")) {
    out.push("--with-script-tests");
  }
  return [...new Set(out)];
}

function buildStatus(options) {
  assertKnownOptions(options, [], []);
  return [
    { label: "repo status", ...nodeScript("collect-repo-status.mjs") },
    { label: "current plan sync", ...nodeScript("sync-current-plan.mjs", ["--check"]) },
    { label: "dispatch coverage", ...nodeScript("check-dispatch-coverage.mjs") },
  ];
}

function buildVerify(options) {
  assertKnownOptions(options, [
    "--dispatch",
    "--todo",
    "--task-packages",
    "--runtime",
    "--with-runtime",
    "--strict-runtime",
    "--script-tests",
    "--with-script-tests",
  ]);
  return [{ label: "control-center verification", ...nodeScript("verify-control-center.mjs", verifyArgs(options)) }];
}

function buildSync(options) {
  assertKnownOptions(options, ["--check", "--write", "--verify", "--dispatch", "--json"]);
  if (hasFlag(options, "--json") && (hasFlag(options, "--write") || hasFlag(options, "--verify"))) {
    fail("sync --json is only supported for the single-command check path.");
  }

  const steps = [];
  if (hasFlag(options, "--write")) {
    steps.push({ label: "sync current plan", ...nodeScript("sync-current-plan.mjs", ["--write"]) });
    steps.push({ label: "sync current plan check", ...nodeScript("sync-current-plan.mjs", ["--check"]) });
  } else {
    steps.push({
      label: "sync current plan check",
      ...nodeScript("sync-current-plan.mjs", ["--check", ...(hasFlag(options, "--json") ? ["--json"] : [])]),
    });
  }

  if (hasFlag(options, "--verify")) {
    steps.push({
      label: "post-sync verification",
      ...nodeScript("verify-control-center.mjs", hasFlag(options, "--dispatch") ? ["--require-todo", "--require-task-packages"] : []),
    });
  }
  return steps;
}

function buildDispatch(options) {
  assertKnownOptions(options, [], []);
  return [
    { label: "dispatch coverage", ...nodeScript("check-dispatch-coverage.mjs") },
    { label: "TODO board", ...nodeScript("check-todo-board.mjs", ["--require"]) },
    { label: "task packages", ...nodeScript("check-task-packages.mjs", ["--require"]) },
  ];
}

function buildDesign(options) {
  assertKnownOptions(options, ["--write", "--json"], ["--id", "--board", "--inbox"]);
  const out = [];
  for (const flag of ["--write", "--json"]) {
    if (hasFlag(options, flag)) {
      out.push(flag);
    }
  }
  for (const valueFlag of ["--id", "--board", "--inbox"]) {
    const value = getValue(options, valueFlag);
    if (value) {
      out.push(valueFlag, value);
    }
  }
  return [{ label: "Design handoff intake", ...nodeScript("import-design-handoffs.mjs", out) }];
}

function buildRuntime(options) {
  assertKnownOptions(options, ["--strict"]);
  return [{ label: "runtime residue", ...nodeScript("check-runtime-residue.mjs", hasFlag(options, "--strict") ? ["--strict"] : []) }];
}

function buildScripts(options) {
  assertKnownOptions(options, ["--tests"]);
  const steps = [{ label: "script docs", ...nodeScript("check-script-docs.mjs") }];
  if (hasFlag(options, "--tests")) {
    steps.push({
      label: "workspace script tests",
      command: process.execPath,
      displayCommand: "node",
      args: ["--test", ...testScripts],
    });
  }
  return steps;
}

function buildVad(options) {
  const subcommand = options[0] ?? "status";
  const rest = options.slice(1);
  switch (subcommand) {
    case "status": {
      assertKnownOptions(rest, ["--json"]);
      return [{ label: "visible dispatch status", ...nodeScript("visible-dispatch.mjs", ["status", ...(hasFlag(rest, "--json") ? ["--json"] : [])]) }];
    }
    case "controller":
    case "controller-tick": {
      assertKnownOptions(rest, ["--json", "--compact"]);
      return [{
        label: "visible dispatch controller tick",
        ...nodeScript("visible-dispatch.mjs", [
          "controller-tick",
          ...(hasFlag(rest, "--compact") ? ["--compact"] : []),
          ...(hasFlag(rest, "--json") ? ["--json"] : []),
        ]),
      }];
    }
    case "post-run-audit":
    case "post-run": {
      assertKnownOptions(rest, ["--json"]);
      return [{ label: "visible dispatch post-run audit", ...nodeScript("visible-dispatch.mjs", ["post-run-audit", ...(hasFlag(rest, "--json") ? ["--json"] : [])]) }];
    }
    case "preflight": {
      assertKnownOptions(rest, ["--json", "--from-plan"], ["--group", "--task", "--window"]);
      const out = [];
      const group = getValue(rest, "--group");
      const task = getValue(rest, "--task");
      const windowName = getValue(rest, "--window");
      if (group) {
        out.push("--group", group);
      } else if (task) {
        out.push("--task", task);
      } else if (windowName) {
        out.push("--window", windowName);
      } else {
        out.push("--from-plan");
      }
      if (hasFlag(rest, "--json")) {
        out.push("--json");
      }
      return [{ label: "visible dispatch preflight", ...nodeScript("visible-dispatch.mjs", ["preflight", ...out]) }];
    }
    case "audit": {
      assertKnownOptions(
        rest,
        ["--json", "--strict", "--allow-historic", "--allow-alembic-test"],
        ["--automation-id", "--window", "--group", "--role"],
      );
      const automationId = getValue(rest, "--automation-id");
      if (!automationId) {
        fail("vad audit requires --automation-id <id>.");
      }
      const out = ["audit-automation", "--automation-id", automationId];
      for (const valueFlag of ["--window", "--group", "--role"]) {
        const value = getValue(rest, valueFlag);
        if (value) {
          out.push(valueFlag, value);
        }
      }
      for (const flag of ["--allow-historic", "--allow-alembic-test", "--strict", "--json"]) {
        if (hasFlag(rest, flag)) {
          out.push(flag);
        }
      }
      return [{ label: "visible dispatch automation audit", ...nodeScript("visible-dispatch.mjs", out) }];
    }
    case "group": {
      assertKnownOptions(rest, ["--json"], ["--group"]);
      const group = getValue(rest, "--group");
      if (!group) {
        fail("vad group requires --group <dispatchGroupId>.");
      }
      return [{ label: "visible dispatch group status", ...nodeScript("visible-dispatch.mjs", ["group-status", "--group", group, ...(hasFlag(rest, "--json") ? ["--json"] : [])]) }];
    }
    case "enable": {
      assertKnownOptions(rest, ["--write", "--json", "--no-keep-awake"], ["--reason"]);
      if (!hasFlag(rest, "--write")) {
        fail("vad enable requires --write.");
      }
      const out = ["mode", "--enable", "--write"];
      const reason = getValue(rest, "--reason");
      if (reason) {
        out.push("--reason", reason);
      }
      if (hasFlag(rest, "--no-keep-awake")) {
        out.push("--no-keep-awake");
      }
      if (hasFlag(rest, "--json")) {
        out.push("--json");
      }
      return [{ label: "visible dispatch enable mode", ...nodeScript("visible-dispatch.mjs", out) }];
    }
    case "disable": {
      assertKnownOptions(rest, ["--write", "--json"], ["--reason"]);
      if (!hasFlag(rest, "--write")) {
        fail("vad disable requires --write.");
      }
      const out = ["mode", "--disable", "--write"];
      const reason = getValue(rest, "--reason");
      if (reason) {
        out.push("--reason", reason);
      }
      if (hasFlag(rest, "--json")) {
        out.push("--json");
      }
      return [{ label: "visible dispatch disable mode", ...nodeScript("visible-dispatch.mjs", out) }];
    }
    case "prune": {
      assertKnownOptions(rest, ["--write", "--json", "--include-current-accepted"]);
      if (!hasFlag(rest, "--write")) {
        fail("vad prune requires --write.");
      }
      return [{
        label: "visible dispatch prune history",
        ...nodeScript("visible-dispatch.mjs", [
          "prune-history",
          ...(hasFlag(rest, "--include-current-accepted") ? ["--include-current-accepted"] : []),
          "--write",
          ...(hasFlag(rest, "--json") ? ["--json"] : []),
        ]),
      }];
    }
    default:
      fail(`Unknown vad subcommand: ${subcommand}. Expected status, controller, preflight, audit, group, enable, disable, post-run-audit, or prune.`);
  }
}

function buildPipeline(options) {
  assertKnownOptions(options, ["--keep", "--json"]);
  const out = [];
  for (const flag of ["--keep", "--json"]) {
    if (hasFlag(options, flag)) {
      out.push(flag);
    }
  }
  return [{ label: "governance pipeline fixture", ...nodeScript("run-workspace-pipeline-e2e.mjs", out) }];
}

function buildSteps() {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(helpText);
      return [];
    case "status":
      return buildStatus(commandArgs);
    case "verify":
      return buildVerify(commandArgs);
    case "sync":
      return buildSync(commandArgs);
    case "dispatch":
      return buildDispatch(commandArgs);
    case "design":
      return buildDesign(commandArgs);
    case "runtime":
      return buildRuntime(commandArgs);
    case "scripts":
      return buildScripts(commandArgs);
    case "vad":
      return buildVad(commandArgs);
    case "pipeline":
      return buildPipeline(commandArgs);
    default:
      fail(`Unknown workspace-control command: ${command}\n\n${helpText}`);
  }
}

function runStep(step) {
  console.log(`\n## ${step.label}`);
  console.log(`$ ${shellDisplay(step)}`);
  const result = spawnSync(step.command, step.args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.status ?? 1;
}

const steps = buildSteps();

if (printOnly && steps.length > 0) {
  console.log(`Workspace control command plan: ${command}`);
  for (const step of steps) {
    console.log(`$ ${shellDisplay(step)}`);
  }
  process.exit(0);
}

for (const step of steps) {
  const status = runStep(step);
  if (status !== 0) {
    process.exit(status);
  }
}
