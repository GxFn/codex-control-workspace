#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const workspaceRoot = path.resolve(getValue("--root", process.cwd()));
const json = args.includes("--json");
const indexPath = path.join(workspaceRoot, "docs/workspace/index.md");
const requiredFields = [
  "本次决策触发",
  "需求 / 测试结果理解",
  "已核对证据",
  "是否需要先验证 / 重新计划 / 用户确认",
  "本次允许更新",
  "本次不得更新",
];
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    issues.push("docs/workspace/index.md is missing.");
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
    issues.push("Could not resolve current plan from docs/workspace/index.md.");
    return null;
  }
  return path.resolve(path.dirname(indexPath), target.split("#")[0]);
}

function fieldValue(section, field) {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(field)}[：:][^\\S\\r\\n]*(.*)$`, "m");
  return section.match(pattern)?.[1]?.trim() ?? null;
}

function isPlaceholder(value) {
  return /^(|TODO|TBD|待补|待填写|<[^>]+>)$/i.test(value.trim());
}

const planPath = currentPlanPathFromIndex();
let planRelative = null;
let presentFields = [];

if (planPath && existsSync(planPath)) {
  planRelative = path.relative(workspaceRoot, planPath);
  const planContent = read(planPath);
  const section = sectionContent(planContent, "总控决策记录");
  if (!section) {
    issues.push(`${planRelative} is missing ## 总控决策记录.`);
  } else {
    presentFields = requiredFields.filter((field) => fieldValue(section, field) !== null);
    for (const field of requiredFields) {
      const value = fieldValue(section, field);
      if (value === null) {
        issues.push(`${planRelative} decision preflight is missing field: ${field}`);
      } else if (isPlaceholder(value)) {
        issues.push(`${planRelative} decision preflight field is empty or placeholder: ${field}`);
      }
    }
  }
} else if (planPath) {
  issues.push(`current plan is missing: ${path.relative(workspaceRoot, planPath)}`);
}

const result = {
  ok: issues.length === 0,
  plan: planRelative,
  requiredFields,
  presentFields,
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log("Decision preflight check passed.");
  console.log(`Plan: ${result.plan ?? "(none)"}`);
} else {
  console.error("Decision preflight check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  for (const warning of warnings) {
    console.error(`Warning: ${warning}`);
  }
}

if (!result.ok) {
  process.exit(1);
}
