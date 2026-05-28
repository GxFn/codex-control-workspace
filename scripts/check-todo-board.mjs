#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadWorkspaceConfig, workspaceLedgerPaths } from "./lib/workspace-config.mjs";

const workspaceRoot = process.cwd();
const args = process.argv.slice(2);
const workspaceConfig = loadWorkspaceConfig({ workspaceRoot, args });
const ledgerPaths = workspaceLedgerPaths({ workspaceRoot, args, config: workspaceConfig });
const indexPath = ledgerPaths.workspaceIndexPath;
const requireTodo = args.includes("--require");
const json = args.includes("--json");

const requiredWindows = workspaceConfig.requiredDispatchWindows;

function getArgValue(name) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function read(file) {
  return readFileSync(file, "utf8");
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return [];
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function sectionContent(content, heading) {
  const start = content.indexOf(`## ${heading}`);
  if (start < 0) {
    return "";
  }
  const rest = content.slice(start);
  const next = rest.slice(1).search(/\n## /);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

function extractFirstLinkTarget(markdown) {
  const match = markdown.match(/\[[^\]]+]\(([^)]+)\)/);
  return match ? match[1] : null;
}

function currentPlanPathFromIndex() {
  if (!existsSync(indexPath)) {
    return null;
  }
  const content = read(indexPath);
  const section = sectionContent(content, "当前总控入口");
  const rows = section
    .split("\n")
    .map(splitMarkdownRow)
    .filter((row) => row.length > 0);
  const firstDataRow = rows.find(
    (row) => row[0] !== "类型" && !row.every((cell) => /^:?-{3,}:?$/.test(cell)),
  );
  if (!firstDataRow || firstDataRow.length < 2) {
    return null;
  }
  const target = extractFirstLinkTarget(firstDataRow[1]);
  return target ? path.resolve(path.dirname(indexPath), target.split("#")[0]) : null;
}

function tableRows(section) {
  return section
    .split("\n")
    .map(splitMarkdownRow)
    .filter((row) => row.length > 0 && !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

function headerIncludes(header, terms) {
  return terms.some((term) => header.some((cell) => cell.includes(term)));
}

const explicitPlan = getArgValue("--plan");
const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
const issues = [];
const warnings = [];
let todoPresent = false;
let idlePresent = false;

if (!planPath || !existsSync(planPath)) {
  issues.push(planPath ? `plan is missing: ${path.relative(workspaceRoot, planPath)}` : "plan path could not be resolved");
} else {
  const content = read(planPath);
  const todoSection = sectionContent(content, "TODO / Backlog");
  const idleSection = sectionContent(content, "空闲窗口调度");
  todoPresent = todoSection.length > 0;
  idlePresent = idleSection.length > 0;

  if (requireTodo && !todoPresent) {
    issues.push("missing `## TODO / Backlog` section");
  }
  if (requireTodo && !idlePresent) {
    issues.push("missing `## 空闲窗口调度` section");
  }

  if (todoPresent) {
    const rows = tableRows(todoSection);
    const header = rows[0] ?? [];
    if (!headerIncludes(header, ["ID"]) || !headerIncludes(header, ["状态"]) || !headerIncludes(header, ["归属", "推荐窗口"])) {
      issues.push("TODO table header must include ID, 状态, and 归属/推荐窗口");
    }
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => !/^:?-{3,}:?$/.test(cell)));
    if (dataRows.length === 0) {
      warnings.push("TODO / Backlog section has no data rows");
    }
  }

  if (idlePresent) {
    const missingWindows = requiredWindows.filter((window) => !idleSection.includes(`\`${window}\``));
    if (missingWindows.length > 0) {
      issues.push(`idle scheduling section missing windows: ${missingWindows.join(", ")}`);
    }
    const rows = tableRows(idleSection);
    const header = rows[0] ?? [];
    if (!headerIncludes(header, ["窗口"]) || !headerIncludes(header, ["调度"]) || !headerIncludes(header, ["是否发送"])) {
      warnings.push("idle scheduling table should include 窗口, 调度, and 是否发送 columns");
    }
  }

  if (!requireTodo && !todoPresent && !idlePresent) {
    warnings.push("no TODO board found; pass --require for plans that use TODO scheduling");
  }
}

const result = {
  ok: issues.length === 0,
  plan: planPath ? path.relative(workspaceRoot, planPath) : null,
  todoPresent,
  idlePresent,
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log("TODO board check passed.");
  console.log(`Plan: ${result.plan}`);
  console.log(`TODO / Backlog: ${todoPresent ? "present" : "not present"}`);
  console.log(`Idle window scheduling: ${idlePresent ? "present" : "not present"}`);
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
} else {
  console.error("TODO board check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  if (warnings.length > 0) {
    console.error("Warnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
}

if (!result.ok) {
  process.exitCode = 1;
}
