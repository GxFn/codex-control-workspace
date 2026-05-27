#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { workspaceLedgerPaths } from "./lib/workspace-config.mjs";

const workspaceRoot = process.cwd();
const args = process.argv.slice(2);
const ledgerPaths = workspaceLedgerPaths({ workspaceRoot, args });
const indexPath = ledgerPaths.workspaceIndexPath;
const requirePackages = args.includes("--require");
const json = args.includes("--json");

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

function sectionContent(content, headingPattern) {
  const headingRegex =
    headingPattern instanceof RegExp
      ? new RegExp(`^## .*(?:${headingPattern.source}).*$`, headingPattern.flags.includes("i") ? "mi" : "m")
      : new RegExp(`^## .*${headingPattern}.*$`, "m");
  const match = content.match(headingRegex);
  if (!match || typeof match.index !== "number") {
    return "";
  }
  const rest = content.slice(match.index);
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

function packageCards(section) {
  const matches = [...section.matchAll(/^###\s+([A-Za-z0-9_.-]+)(?:\s*[：:].*)?$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? section.length;
    return {
      id: match[1],
      body: section.slice(start, end),
    };
  });
}

function bodyIncludes(body, terms) {
  return terms.some((term) => body.includes(term));
}

const explicitPlan = getArgValue("--plan");
const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
const issues = [];
const warnings = [];
let packageSectionPresent = false;
let packageRows = 0;

if (!planPath || !existsSync(planPath)) {
  issues.push(planPath ? `plan is missing: ${path.relative(workspaceRoot, planPath)}` : "plan path could not be resolved");
} else {
  const content = read(planPath);
  const packageSection = sectionContent(content, /任务包|Task Package/i);
  packageSectionPresent = packageSection.length > 0;

  if (requirePackages && !packageSectionPresent) {
    issues.push("missing task package section (`## 任务包` / `## 阶段任务包`)");
  }

  if (packageSectionPresent) {
    const rows = tableRows(packageSection);
    const header = rows[0] ?? [];
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => !/^:?-{3,}:?$/.test(cell)));
    const cards = packageCards(packageSection);

    if (cards.length > 0) {
      packageRows = cards.length;

      const requiredCardTerms = [
        ["窗口"],
        ["阶段目标", "当前阶段目标"],
        ["主线动作"],
        ["合并 TODO", "可一起关闭的 TODO"],
        ["明确不包含", "排除事项", "不包含"],
        ["下一处真实阻塞点", "阻塞 / 依赖", "依赖前提"],
        ["阻塞点之前还能做", "还能做"],
        ["验证命令", "统一验证命令"],
        ["回填要求"],
      ];

      for (const card of cards) {
        for (const terms of requiredCardTerms) {
          if (!bodyIncludes(card.body, terms)) {
            issues.push(`task package card ${card.id} must include one of: ${terms.join(" / ")}`);
          }
        }
      }
    } else {
      packageRows = dataRows.length;

      const requiredHeaderTerms = [
        ["任务包", "包 ID", "ID"],
        ["窗口"],
        ["阶段", "目标"],
        ["主线"],
        ["TODO"],
        ["阻塞", "依赖"],
        ["验证"],
        ["回填"],
      ];

      for (const terms of requiredHeaderTerms) {
        if (!headerIncludes(header, terms)) {
          issues.push(`task package table header must include one of: ${terms.join(" / ")}`);
        }
      }

      if (!headerIncludes(header, ["不包含", "排除", "不做"])) {
        warnings.push("task package table should include 明确不包含 / 排除事项 to keep package scope clear");
      }

      if (header.length > 6) {
        warnings.push("task package table is wide; prefer a narrow index table plus per-package cards");
      }
    }

    if (packageRows === 0) {
      warnings.push("task package section has no data rows");
    }

    if (!/阻塞点|真实阻塞|还能做什么/.test(packageSection)) {
      warnings.push("task package section should state the next real blocker and what can be done before it");
    }

    if (requirePackages) {
      if (!/\bAGENTS\.md\b/.test(packageSection)) {
        issues.push("task package section must include the execution precondition to read target repository AGENTS.md");
      }
      if (!/定位/.test(packageSection)) {
        issues.push("task package section must include an explicit window/repository positioning precondition");
      }
    }
  } else if (!requirePackages) {
    warnings.push("no task package section found; pass --require for plans that use package-based dispatch");
  }
}

const result = {
  ok: issues.length === 0,
  plan: planPath ? path.relative(workspaceRoot, planPath) : null,
  packageSectionPresent,
  packageRows,
  issues,
  warnings,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log("Task package check passed.");
  console.log(`Plan: ${result.plan}`);
  console.log(`Task package section: ${packageSectionPresent ? "present" : "not present"}`);
  console.log(`Task package rows: ${packageRows}`);
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
} else {
  console.error("Task package check failed:");
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
