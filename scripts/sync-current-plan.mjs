#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const write = args.includes("--write");
const check = args.includes("--check");
const json = args.includes("--json");

function getArgValue(name, fallback = null) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const workspaceRoot = path.resolve(getArgValue("--root", process.cwd()));
const indexPath = path.join(workspaceRoot, "docs/workspace/index.md");
const currentIndexPath = path.join(workspaceRoot, "docs/workspace/current/index.md");
const currentStatusPath = path.join(workspaceRoot, "docs/workspace/current/workspace-current-status.md");
const explicitPlan = getArgValue("--plan");

const syncStringFields = new Set([
  "status",
  "indexPlanDescription",
  "indexStatusDescription",
  "currentIndexType",
  "currentIndexDescription",
  "currentStatusSummary",
]);
const syncArrayFields = new Set(["indexRows", "currentIndexRows"]);
const syncKeys = new Set([...syncStringFields, ...syncArrayFields]);
const rowKeys = new Set(["type", "doc", "status", "description", "insertAfter"]);

function read(file) {
  return readFileSync(file, "utf8");
}

function relativeToWorkspace(file) {
  return path.relative(workspaceRoot, file).replaceAll(path.sep, "/");
}

function normalizeRelative(fromFile, targetFile) {
  return path.relative(path.dirname(fromFile), targetFile).replaceAll(path.sep, "/");
}

function ensureInsideWorkspace(file, label) {
  const relative = path.relative(workspaceRoot, file);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside workspace: ${file}`);
}

function atomicWriteFile(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, file);
  } catch (err) {
    if (existsSync(temp)) {
      unlinkSync(temp);
    }
    throw err;
  }
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

function stripLinkTarget(target) {
  let clean = target.trim();
  if (clean.startsWith("<") && clean.endsWith(">")) {
    clean = clean.slice(1, -1);
  }
  const hashIndex = clean.indexOf("#");
  if (hashIndex >= 0) {
    clean = clean.slice(0, hashIndex);
  }
  return clean;
}

function extractFirstLinkTarget(markdown) {
  const match = markdown.match(/\[[^\]]+]\(([^)]+)\)/);
  return match ? stripLinkTarget(match[1]) : null;
}

function sectionContent(content, heading) {
  const match = content.match(new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m"));
  if (!match || typeof match.index !== "number") {
    return "";
  }
  const rest = content.slice(match.index);
  const next = rest.slice(1).search(/\n## /);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

function replaceSection(content, heading, replacement) {
  const match = content.match(new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m"));
  if (!match || typeof match.index !== "number") {
    const insertBefore = content.match(/^## 回填区\s*$/m);
    if (insertBefore && typeof insertBefore.index === "number") {
      return `${content.slice(0, insertBefore.index).trimEnd()}\n\n${replacement.trimEnd()}\n\n${content.slice(insertBefore.index)}`;
    }
    return `${content.trimEnd()}\n\n${replacement.trimEnd()}\n`;
  }
  const start = match.index;
  const rest = content.slice(start);
  const next = rest.slice(1).search(/\n## /);
  const end = next >= 0 ? start + next + 1 : content.length;
  return `${content.slice(0, start)}${replacement.trimEnd()}\n${content.slice(end)}`;
}

function replaceTableRow(content, sectionHeading, key, row) {
  const section = sectionContent(content, sectionHeading);
  if (!section) {
    throw new Error(`Section not found: ${sectionHeading}`);
  }
  const lines = section.split("\n");
  const index = lines.findIndex((line) => splitMarkdownRow(line)[0] === key);
  if (index < 0) {
    throw new Error(`Row not found in ${sectionHeading}: ${key}`);
  }
  lines[index] = row;
  return content.replace(section, lines.join("\n"));
}

function upsertTableRow(content, sectionHeading, key, row, insertAfterKey = null) {
  const section = sectionContent(content, sectionHeading);
  if (!section) {
    throw new Error(`Section not found: ${sectionHeading}`);
  }
  const lines = section.split("\n");
  const existing = lines.findIndex((line) => splitMarkdownRow(line)[0] === key);
  if (existing >= 0) {
    lines[existing] = row;
    return content.replace(section, lines.join("\n"));
  }

  let insertAt = lines.findIndex((line) => splitMarkdownRow(line)[0] === insertAfterKey);
  if (insertAt >= 0) {
    insertAt += 1;
  } else {
    insertAt = lines.findIndex((line) => splitMarkdownRow(line).some((cell) => /^:?-{3,}:?$/.test(cell)));
    insertAt = insertAt >= 0 ? insertAt + 1 : lines.length;
  }
  lines.splice(insertAt, 0, row);
  return content.replace(section, lines.join("\n"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLine(content, label) {
  const match = content.match(new RegExp(`^${escapeRegExp(label)}[：:]\\s*(.+?)\\s*$`, "m"));
  return match?.[1] ?? "";
}

function parseTitle(content) {
  return content.match(/^#\s+(.+?)\s*$/m)?.[1] ?? "Current Plan";
}

function parseSyncBlock(content) {
  const match = content.match(/<!--\s*workspace-sync\s*([\s\S]*?)\s*-->/);
  if (!match) {
    return {};
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("workspace-sync must be a JSON object");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid workspace-sync JSON: ${err.message}`);
  }
}

function validateSyncBlockPlacement(content) {
  const syncIndex = content.search(/<!--\s*workspace-sync\b/);
  if (syncIndex < 0) {
    return [];
  }

  const backfillIndex = content.search(/^## 回填区\s*$/m);
  if (backfillIndex >= 0 && syncIndex < backfillIndex) {
    return [
      "workspace-sync block must appear after `## 回填区`; keep script metadata below the human-facing plan content",
    ];
  }

  const firstSectionIndex = content.search(/^## /m);
  if (firstSectionIndex >= 0 && syncIndex < firstSectionIndex) {
    return [
      "workspace-sync block must not appear before the first human-facing section; move it near the bottom of the plan",
    ];
  }

  return [];
}

function validateSyncBlock(sync) {
  const issues = [];
  for (const key of Object.keys(sync)) {
    if (!syncKeys.has(key)) {
      issues.push(`workspace-sync has unsupported key: ${key}`);
    }
  }
  for (const key of syncStringFields) {
    if (sync[key] !== undefined && typeof sync[key] !== "string") {
      issues.push(`workspace-sync.${key} must be a string`);
    }
  }
  for (const key of syncArrayFields) {
    if (sync[key] !== undefined && !Array.isArray(sync[key])) {
      issues.push(`workspace-sync.${key} must be an array`);
    }
    for (const [index, row] of (sync[key] ?? []).entries()) {
      issues.push(...validateSyncRow(row, `${key}[${index}]`, key === "indexRows"));
    }
  }
  return issues;
}

function validateSyncRow(row, label, hasStatus) {
  const issues = [];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return [`workspace-sync.${label} must be an object`];
  }
  for (const key of Object.keys(row)) {
    if (!rowKeys.has(key)) {
      issues.push(`workspace-sync.${label} has unsupported key: ${key}`);
    }
  }
  for (const key of ["type", "doc", "description"]) {
    if (typeof row[key] !== "string" || row[key].trim().length === 0) {
      issues.push(`workspace-sync.${label}.${key} must be a non-empty string`);
    }
  }
  if (hasStatus && row.status !== undefined && typeof row.status !== "string") {
    issues.push(`workspace-sync.${label}.status must be a string`);
  }
  if (row.insertAfter !== undefined && typeof row.insertAfter !== "string") {
    issues.push(`workspace-sync.${label}.insertAfter must be a string`);
  }
  return issues;
}

function resolveWorkspaceDocTarget(rawDoc, label) {
  // 同步脚本只接受 workspace-relative 文件路径，避免把总控写入扩散到子仓库外或用户本机路径。
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawDoc) || rawDoc.startsWith("#")) {
    throw new Error(`${label} must be a workspace-relative file path, not ${rawDoc}`);
  }
  if (path.isAbsolute(rawDoc)) {
    throw new Error(`${label} must not be an absolute path`);
  }
  const target = path.resolve(workspaceRoot, rawDoc);
  ensureInsideWorkspace(target, label);
  if (!existsSync(target)) {
    throw new Error(`${label} does not exist: ${rawDoc}`);
  }
  return target;
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
  const planRow = rows.find((row) => row[0] === "当前计划");
  const firstDataRow = rows.find(
    (row) => row[0] !== "类型" && !row.every((cell) => /^:?-{3,}:?$/.test(cell)),
  );
  const target = extractFirstLinkTarget(planRow?.[1] ?? firstDataRow?.[1] ?? "");
  return target ? path.resolve(path.dirname(indexPath), target) : null;
}

function promptSectionForStatus(planContent) {
  const section =
    sectionContent(planContent, "可复制分派提示词") ||
    sectionContent(planContent, "当前可复制分派提示词") ||
    sectionContent(planContent, "可复制提示词");
  if (!section) {
    return "";
  }
  return section.replace(/^## .+$/m, "## 可复制提示词");
}

function dispatchSectionForIndex(planContent) {
  const section = sectionContent(planContent, "窗口分派");
  if (!section) {
    return "";
  }
  return section.replace(/^## .+$/m, "## 窗口覆盖状态");
}

function syncStatusSummary(content, planLink, statusSummary) {
  const section = sectionContent(content, "状态摘要");
  if (!section) {
    return content;
  }

  const lines = section.split("\n");
  let planLineIndex = lines.findIndex((line) => line.startsWith("- 当前计划："));
  const planLabel = path.basename(planLink);
  const planLine = `- 当前计划：[${planLabel}](${planLink})。`;
  if (planLineIndex >= 0) {
    lines[planLineIndex] = planLine;
  } else {
    planLineIndex = lines.findIndex((line) => line.trim().length === 0);
    const insertAt = planLineIndex >= 0 ? planLineIndex + 1 : 1;
    lines.splice(insertAt, 0, planLine);
    planLineIndex = insertAt;
  }

  if (statusSummary) {
    const summaryLine = `- ${statusSummary}`;
    const nextBullet = lines.findIndex((line, index) => index > planLineIndex && line.startsWith("- "));
    if (nextBullet >= 0) {
      lines[nextBullet] = summaryLine;
    } else {
      lines.splice(planLineIndex + 1, 0, summaryLine);
    }
  }

  return content.replace(section, lines.join("\n"));
}

function summarizeChanged(before, after, file) {
  return {
    changed: before !== after,
    file,
  };
}

function readRequiredFile(file, issues) {
  if (!existsSync(file)) {
    issues.push(`required file is missing: ${relativeToWorkspace(file)}`);
    return "";
  }
  return read(file);
}

const planPath = explicitPlan
  ? path.resolve(workspaceRoot, explicitPlan)
  : currentPlanPathFromIndex();

const issues = [];
const warnings = [];
const changes = [];
const outputs = [];

if (write && check) {
  issues.push("use either --write or --check, not both");
}

for (const file of [indexPath, currentIndexPath, currentStatusPath]) {
  ensureInsideWorkspace(file, "script output");
}

readRequiredFile(path.join(workspaceRoot, "AGENTS.md"), issues);
readRequiredFile(indexPath, issues);
readRequiredFile(currentIndexPath, issues);
readRequiredFile(currentStatusPath, issues);

if (!planPath || !existsSync(planPath)) {
  issues.push(planPath ? `plan is missing: ${relativeToWorkspace(planPath)}` : "plan path could not be resolved");
} else {
  try {
    ensureInsideWorkspace(planPath, "plan");
  } catch (err) {
    issues.push(err.message);
  }
}

if (issues.length === 0) {
  try {
    const planContent = read(planPath);
    issues.push(...validateSyncBlockPlacement(planContent));
    const sync = parseSyncBlock(planContent);
    issues.push(...validateSyncBlock(sync));
    const planTitle = parseTitle(planContent);
    const planStatus = sync.status ?? parseLine(planContent, "状态");
    const planDocLink = normalizeRelative(indexPath, planPath);
    const currentPlanLink = normalizeRelative(currentIndexPath, planPath);
    const statusPlanLink = normalizeRelative(currentStatusPath, planPath);
    const statusDocLink = normalizeRelative(indexPath, currentStatusPath);

    if (!planStatus) {
      issues.push("plan is missing a `状态：...` line or workspace-sync.status");
    }

    const planDescription =
      sync.indexPlanDescription ?? `当前总控计划：${planTitle}。`;
    const statusDescription =
      sync.indexStatusDescription ?? "当前窗口状态、发送名单和活跃观察项以当前计划为准。";
    const currentIndexType = sync.currentIndexType ?? "当前计划";
    const currentIndexDescription =
      sync.currentIndexDescription ?? `当前执行入口：${planTitle}。`;
    const currentStatusSummary = sync.currentStatusSummary ?? "";

    if (issues.length === 0) {
      // 这里只同步总控已经写进当前计划的机械重复信息；验收、TODO 和派发决策仍由总控文档先表达。
      let indexContent = read(indexPath);
      const originalIndexContent = indexContent;
      indexContent = replaceTableRow(
        indexContent,
        "当前总控入口",
        "当前计划",
        `| 当前计划 | [${planDocLink}](${planDocLink}) | ${planStatus} | ${planDescription} |`,
      );
      indexContent = replaceTableRow(
        indexContent,
        "当前总控入口",
        "当前状态",
        `| 当前状态 | [${statusDocLink}](${statusDocLink}) | ${planStatus} | ${statusDescription} |`,
      );
      const indexDispatchSection = dispatchSectionForIndex(planContent);
      if (indexDispatchSection) {
        indexContent = replaceSection(indexContent, "窗口覆盖状态", indexDispatchSection);
      } else {
        warnings.push("plan has no `## 窗口分派`; workspace index coverage section was not synced");
      }
      for (const row of sync.indexRows ?? []) {
        const target = resolveWorkspaceDocTarget(row.doc, `workspace-sync.indexRows.${row.type}.doc`);
        const link = normalizeRelative(indexPath, target);
        indexContent = upsertTableRow(
          indexContent,
          "当前总控入口",
          row.type,
          `| ${row.type} | [${link}](${link}) | ${row.status ?? planStatus} | ${row.description} |`,
          row.insertAfter ?? "当前状态",
        );
      }
      outputs.push({ path: indexPath, content: indexContent });
      changes.push(summarizeChanged(originalIndexContent, indexContent, relativeToWorkspace(indexPath)));

      let currentIndexContent = read(currentIndexPath);
      const originalCurrentIndexContent = currentIndexContent;
      currentIndexContent = upsertTableRow(
        currentIndexContent,
        "当前地图",
        currentIndexType,
        `| ${currentIndexType} | [${currentPlanLink}](${currentPlanLink}) | ${currentIndexDescription} |`,
        "当前状态",
      );
      for (const row of sync.currentIndexRows ?? []) {
        const target = resolveWorkspaceDocTarget(row.doc, `workspace-sync.currentIndexRows.${row.type}.doc`);
        const link = normalizeRelative(currentIndexPath, target);
        currentIndexContent = upsertTableRow(
          currentIndexContent,
          "当前地图",
          row.type,
          `| ${row.type} | [${link}](${link}) | ${row.description} |`,
          row.insertAfter ?? currentIndexType,
        );
      }
      outputs.push({ path: currentIndexPath, content: currentIndexContent });
      changes.push(summarizeChanged(originalCurrentIndexContent, currentIndexContent, relativeToWorkspace(currentIndexPath)));

      let currentStatusContent = read(currentStatusPath);
      const originalCurrentStatusContent = currentStatusContent;
      currentStatusContent = currentStatusContent.replace(/^状态[：:].*$/m, `状态：${planStatus}`);
      currentStatusContent = syncStatusSummary(currentStatusContent, statusPlanLink, currentStatusSummary);
      const dispatchSection = sectionContent(planContent, "窗口分派");
      if (dispatchSection) {
        currentStatusContent = replaceSection(currentStatusContent, "窗口分派", dispatchSection);
      } else {
        warnings.push("plan has no `## 窗口分派`; current status dispatch section was not synced");
      }
      const promptSection = promptSectionForStatus(planContent);
      if (promptSection) {
        currentStatusContent = replaceSection(currentStatusContent, "可复制提示词", promptSection);
      } else {
        warnings.push("plan has no copyable prompt section; current status prompt section was not synced");
      }
      outputs.push({ path: currentStatusPath, content: currentStatusContent });
      changes.push(summarizeChanged(originalCurrentStatusContent, currentStatusContent, relativeToWorkspace(currentStatusPath)));
    }
  } catch (err) {
    issues.push(err.message);
  }
}

const outOfSync = changes.some((change) => change.changed);
if (issues.length === 0 && write) {
  for (const output of outputs) {
    const previous = existsSync(output.path) ? read(output.path) : "";
    if (previous !== output.content) {
      atomicWriteFile(output.path, output.content);
    }
  }
}

if (issues.length === 0 && check && outOfSync) {
  issues.push("current plan sync check failed: generated surfaces are out of sync; run `node scripts/sync-current-plan.mjs --write`.");
}

const result = {
  ok: issues.length === 0,
  wrote: write && issues.length === 0,
  check,
  outOfSync,
  root: workspaceRoot,
  plan: planPath ? relativeToWorkspace(planPath) : null,
  changes,
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  const mode = write ? "applied" : check ? "check" : "dry-run";
  console.log(`Current plan sync ${mode} passed.`);
  console.log(`Plan: ${result.plan}`);
  for (const change of changes) {
    const verb = change.changed ? (write ? "updated" : "would update") : "unchanged";
    console.log(`- ${verb} ${change.file}`);
  }
  for (const warning of warnings) {
    console.log(`Warning: ${warning}`);
  }
} else {
  console.error("Current plan sync failed:");
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
