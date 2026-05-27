#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const indexPath = path.join(workspaceRoot, "docs/workspace/index.md");
const args = process.argv.slice(2);
const json = args.includes("--json");

function loadWorkspaceConfig() {
  const configArg = getArgValue("--config") ?? process.env.CODEX_CONTROL_WORKSPACE_CONFIG ?? "workspace.config.json";
  const configPath = path.isAbsolute(configArg) ? configArg : path.join(workspaceRoot, configArg);
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}

const workspaceConfig = loadWorkspaceConfig();
const requiredWindows = Array.isArray(workspaceConfig.requiredDispatchWindows)
  ? workspaceConfig.requiredDispatchWindows
  : Array.isArray(workspaceConfig.dispatchWindows)
    ? workspaceConfig.dispatchWindows
    : Array.isArray(workspaceConfig.windows)
      ? workspaceConfig.windows
      : ["Alembic", "AlembicCore", "AlembicAgent", "AlembicDashboard", "AlembicPlugin", "AlembicTest", "BiliDili"];
const validStatuses = new Set(["待启动", "执行中", "已 arm", "待验收", "阻塞", "已完成", "暂停", "观察中", "无任务"]);
const sendEligibleStatuses = new Set(["待启动", "执行中", "已 arm"]);
const blockedStatus = "阻塞";
const noSendStatuses = new Set(["待验收", "已完成", "暂停", "观察中", "无任务"]);

function getArgValue(name) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return null;
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

function dispatchPromptContent(content) {
  for (const heading of ["可复制分派提示词", "当前可复制分派提示词", "可复制提示词"]) {
    const section = sectionContent(content, heading);
    if (section) {
      return section;
    }
  }
  return "";
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

function parseDispatchRows(content) {
  const dispatchSection = sectionContent(content, "窗口分派") || sectionContent(content, "窗口覆盖状态");
  const rows = [];
  for (const line of dispatchSection.split("\n")) {
    const cells = splitMarkdownRow(line);
    if (
      cells.length < 2 ||
      cells[0] === "窗口" ||
      cells[0] === "窗口 / 状态" ||
      cells[0].startsWith("---")
    ) {
      continue;
    }

    if (cells.length === 2) {
      const window = cells[0].match(/`([^`]+)`/)?.[1] ?? cells[0].replace(/<br\s*\/?>/gi, " ").trim();
      const status = [...validStatuses].find((candidate) => cells[0].includes(candidate)) ?? "";
      rows.push({
        window,
        status,
        task: cells[1],
        docAction: "",
        savePath: "",
        raw: cells,
      });
      continue;
    }

    rows.push({
      window: cells[0].replaceAll("`", ""),
      status: cells[1],
      task: cells[2],
      docAction: cells[3] ?? "",
      savePath: cells[4] ?? "",
      raw: cells,
    });
  }
  return rows;
}

function parseDeclaredSendList(content) {
  const match = content.match(/发送给：([^\n]+)/);
  if (!match) {
    return null;
  }
  const windows = [];
  const regex = /`([^`]+)`/g;
  let item;
  while ((item = regex.exec(match[1]))) {
    windows.push(item[1]);
  }
  return windows;
}

const explicitPlan = getArgValue("--plan");
const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
const issues = [];
const warnings = [];

if (!planPath || !existsSync(planPath)) {
  issues.push(planPath ? `plan is missing: ${path.relative(workspaceRoot, planPath)}` : "plan path could not be resolved");
}

let rows = [];
let declaredSendList = null;
let promptContent = "";
if (planPath && existsSync(planPath)) {
  const content = read(planPath);
  rows = parseDispatchRows(content);
  declaredSendList = parseDeclaredSendList(content);
  promptContent = dispatchPromptContent(content);

  const byWindow = new Map(rows.map((row) => [row.window, row]));

  for (const window of requiredWindows) {
    if (!byWindow.has(window)) {
      issues.push(`missing dispatch coverage for ${window}`);
    }
  }

  for (const row of rows) {
    const requiredWindow = requiredWindows.includes(row.window);
    if (!requiredWindow && sendEligibleStatuses.has(row.status)) {
      issues.push(`unexpected send-eligible dispatch window: ${row.window}`);
    } else if (!requiredWindow && !validStatuses.has(row.status)) {
      warnings.push(`unexpected dispatch window: ${row.window}`);
    }
    if (!validStatuses.has(row.status)) {
      issues.push(`${row.window} has unknown status: ${row.status}`);
    }
    const looksLikePromptSending =
      /发送|提示词/.test(row.task) && !/不发送|不要发送|不再发送|当前不发送/.test(row.task);
    if (noSendStatuses.has(row.status) && looksLikePromptSending) {
      warnings.push(`${row.window} is ${row.status}; avoid assigning prompt-sending work unless the plan explains why`);
    }
  }
}

const sendList = rows
  .filter((row) => sendEligibleStatuses.has(row.status))
  .map((row) => row.window)
  .filter((window) => window.length > 0);
const blocked = rows.filter((row) => row.status === blockedStatus).map((row) => row.window);
const doNotSend = rows
  .filter((row) => noSendStatuses.has(row.status) || row.status === blockedStatus)
  .map((row) => row.window)
  .filter((window) => window.length > 0);

if (declaredSendList) {
  const expected = [...sendList].sort();
  const declared = [...declaredSendList].sort();
  if (expected.join(",") !== declared.join(",")) {
    issues.push(
      `declared send list [${declared.join(", ")}] does not match status-derived list [${expected.join(", ")}]`,
    );
  }
} else if (sendList.length > 0) {
  warnings.push("plan has send-eligible windows but no `发送给：...` line was found");
}

if (sendList.length > 0) {
  if (!/\bAGENTS\.md\b/.test(promptContent)) {
    issues.push("dispatch prompt must require reading workspace/target repository AGENTS.md before execution");
  }
  if (!/定位/.test(promptContent)) {
    issues.push("dispatch prompt must require the execution window to state its repository/window positioning");
  }
}

if (blocked.length > 0) {
  warnings.push(`blocked windows need manual review before sending prompts: ${blocked.join(", ")}`);
}

const result = {
  ok: issues.length === 0,
  plan: planPath ? path.relative(workspaceRoot, planPath) : null,
  sendList,
  blocked,
  doNotSend,
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log("Dispatch coverage check passed.");
  console.log(`Plan: ${result.plan}`);
  console.log(`Send prompts to: ${sendList.length > 0 ? sendList.join(", ") : "(none)"}`);
  console.log(`Do not send to: ${doNotSend.length > 0 ? doNotSend.join(", ") : "(none)"}`);
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
} else {
  console.error("Dispatch coverage check failed:");
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
  process.exit(1);
}
