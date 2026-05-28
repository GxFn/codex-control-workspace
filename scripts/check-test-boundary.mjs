#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadWorkspaceConfig, resolveConfigPath, workspaceLedgerPaths } from "./lib/workspace-config.mjs";

const args = process.argv.slice(2);
const workspaceRoot = path.resolve(getValue("--root", process.cwd()));
const json = args.includes("--json");
const workspaceConfig = loadWorkspaceConfig({ workspaceRoot, args });
const ledgerPaths = workspaceLedgerPaths({ workspaceRoot, args, config: workspaceConfig });
const indexPath = ledgerPaths.workspaceIndexPath;
const testWindowName = workspaceConfig.testWindow;
const exchangePath = resolveConfigPath(workspaceRoot, workspaceConfig.testExchangePath);
const sendEligibleStatuses = new Set(["待启动", "执行中"]);
const activeTestStatuses = ["待启动", "执行中"];
const issues = [];
const warnings = [];

function getValue(name, fallback = null) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }
  return fallback;
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
    issues.push(`${path.relative(workspaceRoot, indexPath)} is missing.`);
    return null;
  }
  const section = sectionContent(read(indexPath), "当前总控入口");
  const rows = section
    .split("\n")
    .map(splitMarkdownRow)
    .filter((row) => row.length > 0);
  const planRow = rows.find((row) => row[0] === "当前计划");
  const target = extractFirstLinkTarget(planRow?.[1] ?? "");
  if (!target) {
    issues.push(`Could not resolve current plan from ${path.relative(workspaceRoot, indexPath)}.`);
    return null;
  }
  return path.resolve(path.dirname(indexPath), target.split("#")[0]);
}

function parseDispatchRows(planContent) {
  const dispatchSection = sectionContent(planContent, "窗口分派") || sectionContent(planContent, "窗口覆盖状态");
  const rows = [];
  for (const line of dispatchSection.split("\n")) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 2 || cells[0] === "窗口 / 状态" || cells[0].startsWith("---")) {
      continue;
    }
    const windowName = cells[0].match(/`([^`]+)`/)?.[1] ?? "";
    const status = ["待启动", "执行中", "待验收", "阻塞", "已完成", "暂停", "观察中", "无任务"].find((item) =>
      cells[0].includes(item),
    ) ?? "";
    rows.push({ windowName, status, task: cells[1] });
  }
  return rows;
}

function isNonTestTargetTask(row, planContent) {
  const planSignals = `${row.task}\n${sectionContent(planContent, "目标判断")}\n${sectionContent(planContent, "窗口分派")}\n${sectionContent(planContent, "可复制提示词")}\n${sectionContent(planContent, "测试交接")}`;
  const isThreadRegistry = /thread id|线程/.test(row.task) && /登记|回填|收集|registry/i.test(row.task);
  const isVadSmoke =
    /Visible Automation Dispatch|visible dispatch|VAD|自动化|heartbeat|finish-chain|claim|smoke|冒烟/i.test(
      planSignals,
    ) && /smoke|冒烟|heartbeat|自动化|可见窗口|finish-chain|claim|回填/i.test(row.task);
  const excludesTesting = /非测试型|不做测试交接|不运行真实项目测试|不运行.*测试/.test(planSignals);
  return (isThreadRegistry || isVadSmoke) && excludesTesting;
}

function testBlocks(content) {
  const matches = [...content.matchAll(/^###\s+(Test-[^\n]+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? content.length;
    const body = content.slice(start, end);
    const status = body.match(/^状态：(.+)$/m)?.[1]?.trim() ?? "";
    return { title: match[1].trim(), status, body };
  });
}

function requireTerms(block, terms) {
  for (const term of terms) {
    if (!block.body.includes(term)) {
      issues.push(`${block.title} is active but missing test-boundary field: ${term}`);
    }
  }
}

const planPath = currentPlanPathFromIndex();
let testWindowSendEligible = false;
let testWindowNonTestOnly = false;
let planRelative = null;

if (planPath && existsSync(planPath)) {
  planRelative = path.relative(workspaceRoot, planPath);
  const planContent = read(planPath);
  const dispatchRows = parseDispatchRows(planContent);
  const testWindowRows = dispatchRows.filter((row) => row.windowName === testWindowName && sendEligibleStatuses.has(row.status));
  testWindowSendEligible = testWindowRows.length > 0;
  testWindowNonTestOnly =
    testWindowRows.length > 0 && testWindowRows.every((row) => isNonTestTargetTask(row, planContent));
} else if (planPath) {
  issues.push(`current plan is missing: ${path.relative(workspaceRoot, planPath)}`);
}

let activeTests = [];
if (existsSync(exchangePath)) {
  activeTests = testBlocks(read(exchangePath)).filter((block) =>
    activeTestStatuses.some((status) => block.status.includes(status)),
  );
} else {
  warnings.push(`${path.relative(workspaceRoot, exchangePath)} is missing.`);
}

if (testWindowSendEligible && activeTests.length === 0 && !testWindowNonTestOnly) {
  issues.push(`${testWindowName} is send-eligible in the current plan, but no active ${testWindowName} test card exists.`);
}

for (const block of activeTests) {
  requireTerms(block, [
    "#### 总控自测排除理由",
    "为什么总控不能自己完成验证",
    "需要的真实场景",
    "已由总控自行完成的最小验证",
    "#### 测试前边界与多条件判断",
    "测试要回答的问题",
    "测试对象 / 目标窗口 / 线程 / 项目边界",
    "总控可自测项",
    `必须交给 \`${testWindowName}\` 的真实场景条件`,
    "成功能推出的结论",
    "失败能推出的结论",
    "不能推出的结论",
    "停止或不开始条件",
  ]);
}

const result = {
  ok: issues.length === 0,
  plan: planRelative,
  testWindowName,
  testWindowSendEligible,
  testWindowNonTestOnly,
  testWindowRegistryOnly: testWindowNonTestOnly,
  activeTestCount: activeTests.length,
  activeTests: activeTests.map((block) => ({ title: block.title, status: block.status })),
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log("Test boundary check passed.");
  console.log(`Plan: ${result.plan ?? "(none)"}`);
  console.log(`${testWindowName} send-eligible: ${testWindowSendEligible ? "yes" : "no"}`);
  console.log(`${testWindowName} non-test task: ${testWindowNonTestOnly ? "yes" : "no"}`);
  console.log(`Active ${testWindowName} tests: ${activeTests.length}`);
  for (const warning of warnings) {
    console.log(`Warning: ${warning}`);
  }
} else {
  console.error("Test boundary check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  for (const warning of warnings) {
    console.error(`Warning: ${warning}`);
  }
}

if (!result.ok) {
  process.exitCode = 1;
}
