#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceConfig, workspaceLedgerPaths } from "./lib/workspace-config.mjs";

const rawArgs = process.argv.slice(2);
const command = rawArgs[0] && !rawArgs[0].startsWith("--") ? rawArgs[0] : "status";
const options = rawArgs[0] && !rawArgs[0].startsWith("--") ? rawArgs.slice(1) : rawArgs;
const workspaceRoot = path.resolve(getValue("--root", process.cwd()));
const stateDir = path.resolve(getValue("--state-dir", path.join(workspaceRoot, ".workspace-local/visible-dispatch")));
const write = hasFlag("--write");
const json = hasFlag("--json");
const scriptPath = fileURLToPath(import.meta.url);

const workspaceConfig = loadWorkspaceConfig({
  workspaceRoot,
  args: options,
  onError: (configPath, error) => {
    fail(`Invalid workspace config ${path.relative(workspaceRoot, configPath)}: ${error.message}`);
  },
});
const ledgerPaths = workspaceLedgerPaths({ workspaceRoot, args: options, config: workspaceConfig });
const controlWindowName = workspaceConfig.controlWindow;
const testWindowName = workspaceConfig.testWindow;
const dispatchWindowNames = workspaceConfig.dispatchWindows;
const dispatchWindows = new Set(dispatchWindowNames);
const registryWindows = new Set([...dispatchWindows, controlWindowName]);
const configuredControlRepoDir = workspaceConfig.controlRepoDir ?? path.basename(workspaceRoot);
const configuredParentWorkspaceRoot = path.resolve(workspaceRoot, workspaceConfig.workspaceRoot ?? "..");
const installedAsControlRepo =
  configuredControlRepoDir &&
  path.basename(workspaceRoot) === configuredControlRepoDir &&
  path.resolve(configuredParentWorkspaceRoot, configuredControlRepoDir) === workspaceRoot;
const sendEligibleStatuses = new Set(["待启动", "执行中"]);
const heartbeatRrule = "FREQ=MINUTELY;INTERVAL=1";
// Small create-time gap observed to avoid same-minute heartbeat coalescing.
const defaultArmBatchStaggerSeconds = 20;
const totalControlArmOnlyTargets = new Set([testWindowName]);
const finalSessionEventRe = /(?:turn[./_-]?completed|response[./_-]?completed|final_answer|agent_message)/i;
const runningSessionEventRe = /(?:tool_call|command|exec|turn[./_-]?started|response[./_-]?started|agent_reasoning|agent_progress)/i;
const sessionUuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

const files = {
  state: path.join(stateDir, "state.json"),
  registry: path.join(stateDir, "window-registry.json"),
  queue: path.join(stateDir, "dispatch-queue.json"),
  runs: path.join(stateDir, "automation-runs.json"),
  groups: path.join(stateDir, "dispatch-groups.json"),
  keepAwakeControl: path.join(stateDir, "keep-awake-control.json"),
};

const helpText = `
Visible automation dispatch local state manager

Usage:
  node scripts/visible-dispatch.mjs status [--json]
  node scripts/visible-dispatch.mjs init [--write] [--json]
  node scripts/visible-dispatch.mjs mode --enable|--disable --write [--reason <text>] [--no-keep-awake]
  node scripts/visible-dispatch.mjs start-plan --write [--plan <path>] [--group <id>] [--return-policy controller-last|target-courier] [--stagger-seconds <n>|--no-stagger] [--no-keep-awake] [--json]
  node scripts/visible-dispatch.mjs resume-plan --write [--plan <path>] [--group <id>] [--return-policy controller-last|target-courier] [--stagger-seconds <n>|--no-stagger] [--no-keep-awake] [--json]
  node scripts/visible-dispatch.mjs stop-plan --write [--reason <text>] [--json]
  node scripts/visible-dispatch.mjs register --window <name> --thread <threadId> [--cwd <cwd>] --write
  node scripts/visible-dispatch.mjs unregister --window <name> --write [--reason <text>]
  node scripts/visible-dispatch.mjs preflight [--from-plan|--task <taskId>|--group <id>|--window <name>] [--include-controller] [--json]
  node scripts/visible-dispatch.mjs enqueue --from-plan [--plan <path>] [--group <id>] [--return-policy controller-last|target-courier] --write
  node scripts/visible-dispatch.mjs arm --task <taskId> [--json]
  node scripts/visible-dispatch.mjs arm-batch --group <id> [--stagger-seconds <n>|--no-stagger] [--json]
  node scripts/visible-dispatch.mjs record-arm --task <taskId> --automation-id <id> --write [--lease-minutes <n>]
  node scripts/visible-dispatch.mjs record-return --group <id> --automation-id <id> --write
  node scripts/visible-dispatch.mjs record-stop --automation-id <id> [--task <taskId>] --write [--reason <text>]
  node scripts/visible-dispatch.mjs claim --window <name> --write [--lease-minutes <n>]
  node scripts/visible-dispatch.mjs complete --task <taskId> --write [--backfill <text>]
  node scripts/visible-dispatch.mjs block --task <taskId> --reason <text> --write
  node scripts/visible-dispatch.mjs finish --window <name> [--thread <threadId>] [--task <taskId>] --backfill <text>|--backfill-file <path> --write [--chain-next] [--json]
  node scripts/visible-dispatch.mjs group-status --group <id> [--json]
  node scripts/visible-dispatch.mjs tick [--write] [--json]
  node scripts/visible-dispatch.mjs controller-tick [--compact] [--json]
  node scripts/visible-dispatch.mjs post-run-audit [--json]
  node scripts/visible-dispatch.mjs audit-automation --automation-id <id> [--window <name>] [--group <id>] [--role target|controller-return] [--strict] [--json]
  node scripts/visible-dispatch.mjs accept --task <taskId> [--verdict accepted|rejected] [--note <text>] [--allow-active-automation] --write
  node scripts/visible-dispatch.mjs cleanup [--write] [--json]
  node scripts/visible-dispatch.mjs prune-history [--include-current-accepted] [--write] [--json]

Safety:
  Runtime files live under .workspace-local/visible-dispatch by default and are
  ignored by git. The script does not call Codex automation APIs directly; arm
  and finish-chain only print payloads that a Codex window can pass to
  codex_app.automation_update. preflight, arm, and arm-batch verify that target
  window thread ids resolve to local Codex session files before payloads are
  used. init prepares local runtime files without dispatching anything.
  start-plan is the first unattended launch for the active plan. resume-plan is
  the normal continuation after a controller return or manual interruption.
  Both are fast paths: they enable mode, enqueue the current plan only when
  needed, and print heartbeat payloads or a wait/review/attention decision
  without running the full diagnostic suite. stop-plan is the clean
  close switch: it disables future finish-chain jumps and stops keep-awake.
  mode=disabled is the close switch: it stops
  controller loops immediately, and any already-awake target window will record
  completion without receiving another finish-chain wake payload.
  On macOS, mode=enabled starts a local caffeinate keep-awake process unless
  --no-keep-awake or CODEX_VAD_KEEP_AWAKE=0 is set; mode=disabled stops the
  keep-awake process recorded in local runtime state.
`.trim();

function hasFlag(name) {
  return options.includes(name);
}

function getValue(name, fallback = null) {
  const eq = options.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = options.indexOf(name);
  if (index >= 0 && options[index + 1] && !options[index + 1].startsWith("--")) {
    return options[index + 1];
  }
  return fallback;
}

function getAllValues(name) {
  const values = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === name && options[index + 1] && !options[index + 1].startsWith("--")) {
      values.push(options[index + 1]);
      index += 1;
    } else if (option.startsWith(`${name}=`)) {
      values.push(option.slice(name.length + 1));
    }
  }
  return values;
}

function nowIso() {
  return new Date().toISOString();
}

function fail(message) {
  const payload = completeScriptPayload({ ok: false, error: message });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(message);
    if (payload.agentNext) {
      console.error(`Agent next: ${payload.agentNext}`);
    }
  }
  process.exit(1);
}

function ensureWorkspacePath(file, label) {
  const relative = path.relative(workspaceRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`${label} must stay inside workspace: ${file}`);
  }
}

function readJson(file, fallback) {
  if (!existsSync(file)) {
    return structuredClone(fallback);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`Invalid JSON in ${path.relative(workspaceRoot, file)}: ${err.message}`);
  }
}

function atomicWriteJson(file, value) {
  ensureWorkspacePath(file, "visible dispatch state");
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temp, file);
  } catch (err) {
    if (existsSync(temp)) {
      unlinkSync(temp);
    }
    throw err;
  }
}

function defaultState() {
  return {
    version: 1,
    mode: "disabled",
    loopEnabled: false,
    updatedAt: null,
    stopRequestedAt: null,
    disablePolicy: "stop-next-chain",
    reason: "",
    keepAwake: defaultKeepAwake(),
  };
}

function defaultKeepAwake() {
  return {
    enabled: true,
    active: false,
    platform: process.platform,
    pid: 0,
    childPid: 0,
    strategy: "watcher",
    token: "",
    command: "caffeinate",
    args: ["-dimsu"],
    startedAt: null,
    stoppedAt: null,
    stopReason: "",
    lastError: "",
  };
}

function defaultRegistry() {
  return { version: 1, windows: [] };
}

function defaultQueue() {
  return { version: 1, tasks: [] };
}

function defaultRuns() {
  return { version: 1, runs: [] };
}

function defaultGroups() {
  return { version: 1, groups: [] };
}

function readAll() {
  return {
    state: readJson(files.state, defaultState()),
    registry: readJson(files.registry, defaultRegistry()),
    queue: readJson(files.queue, defaultQueue()),
    runs: readJson(files.runs, defaultRuns()),
    groups: readJson(files.groups, defaultGroups()),
  };
}

function output(value, text) {
  const payload = completeScriptPayload(value);
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const rendered = text ?? JSON.stringify(payload, null, 2);
    console.log(rendered);
    if (payload?.agentNext && !rendered.includes("Agent next:")) {
      console.log(`Agent next: ${payload.agentNext}`);
    }
  }
}

function completeScriptPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return {
    ...value,
    scriptComplete: true,
    agentNext: inferAgentNext(value),
  };
}

function inferAgentNext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  if (typeof value.agentNext === "string" && value.agentNext.trim()) {
    return value.agentNext.trim();
  }
  if (value.ok === false) {
    return "Stop and resolve the reported script error before continuing.";
  }
  if (value.chain?.nextAction) {
    if (value.chain.nextAction === "armNext") {
      return "Create the returned heartbeat payload only if its permission flags allow it, then run the matching record command.";
    }
    if (value.chain.nextAction === "returnToController") {
      return "Create the returned controller heartbeat, then run record-return with the returned automation id.";
    }
    if (value.chain.nextAction === "noReturn") {
      return "Do not create another heartbeat; wait for remaining group work or total-control review.";
    }
    return `Follow chain.nextAction=${value.chain.nextAction}.`;
  }
  if (value.topAction) {
    if (value.topAction === "stopped") {
      return "Stop the automation path and report the concise status.";
    }
    if (value.topAction === "review") {
      return "Review evidence as total control; do not auto-accept script state as the verdict.";
    }
    if (value.topAction === "dispatch" || value.topAction === "arm") {
      return "Use the returned payloads to create only the allowed heartbeat automations, then record the created ids.";
    }
    if (value.topAction === "wait") {
      return "Wait for the outstanding target windows; do not create extra automation.";
    }
    return `Follow topAction=${value.topAction}.`;
  }
  if (Array.isArray(value.payloads) && value.payloads.length > 0) {
    return "Create the returned heartbeat payloads with the configured stagger, then record the created automation ids.";
  }
  if (value.payload?.prompt && value.payload?.targetThreadId) {
    return "Create this heartbeat payload with codex_app.automation_update, then run the matching record command.";
  }
  if (value.nextAction) {
    return `Follow nextAction=${value.nextAction}.`;
  }
  if (value.operation === "stop-plan" || value.mode === "disabled") {
    return "Automation is disabled; stop chaining and report status.";
  }
  if (value.operation === "start-plan" || value.operation === "resume-plan") {
    return "Continue with the returned launch/resume decision; only dispatch payloads that are present and allowed.";
  }
  if (typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }
  if (value.ok === true) {
    return "Script completed; inspect this result and continue the current control workflow.";
  }
  return "Script completed; inspect this result before continuing.";
}

function relativeToWorkspace(file) {
  return path.relative(workspaceRoot, file).replaceAll(path.sep, "/");
}

function relativePath(from, to) {
  const rel = path.relative(from, to).replaceAll(path.sep, "/");
  return rel && !rel.startsWith(".") ? rel : rel || ".";
}

function workspaceRootPath(file) {
  const abs = path.resolve(file);
  if (!installedAsControlRepo) {
    return relativeToWorkspace(abs);
  }
  return relativePath(configuredParentWorkspaceRoot, abs);
}

function repositoryRootForWindow(windowName) {
  const repo = (workspaceConfig.repositories ?? []).find((item) => item?.windowName === windowName);
  if (!repo?.path) {
    return null;
  }
  return path.resolve(workspaceRoot, repo.path);
}

function promptPathForWindow(windowName, file) {
  if (windowName === controlWindowName) {
    return workspaceRootPath(file);
  }
  const repoRoot = repositoryRootForWindow(windowName);
  if (installedAsControlRepo && repoRoot) {
    return relativePath(repoRoot, file);
  }
  return relativeToWorkspace(file);
}

function scriptCommandForWindow(windowName, args) {
  const suffix = `node scripts/visible-dispatch.mjs ${args}`;
  if (!installedAsControlRepo) {
    return suffix;
  }
  if (windowName === controlWindowName) {
    return `cd ${configuredControlRepoDir} && ${suffix}`;
  }
  const repoRoot = repositoryRootForWindow(windowName);
  if (!repoRoot) {
    return `cd ${configuredControlRepoDir} && ${suffix}`;
  }
  return `cd ${relativePath(repoRoot, workspaceRoot)} && ${suffix}`;
}

function validateWindow(windowName, { allowController = false } = {}) {
  const allowed = allowController ? registryWindows : dispatchWindows;
  if (!allowed.has(windowName)) {
    fail(`Unsupported visible dispatch window: ${windowName}. Allowed: ${[...allowed].join(", ")}`);
  }
}

function validateThreadId(threadId) {
  const error = threadIdValidationError(threadId);
  if (error) {
    fail(error);
  }
}

function threadIdValidationError(threadId) {
  const value = String(threadId ?? "").trim();
  const normalized = value.toLowerCase();
  const placeholderPatterns = [
    /^current[-_\s]*codex[-_\s]*thread$/,
    /^current[-_\s]*thread([-_\s]*id)?$/,
    /^thread[-_\s]*id$/,
    /^unknown$/,
    /^placeholder$/,
    /^todo$/,
    /^tbd$/,
    /^<.*>$/,
    /当前.*线程/,
  ];
  if (!value || placeholderPatterns.some((pattern) => pattern.test(normalized))) {
    return `Invalid visible dispatch thread id placeholder: ${threadId}`;
  }
  return "";
}

function codexHome() {
  return path.resolve(getValue("--codex-home", process.env.CODEX_HOME || path.join(os.homedir(), ".codex")));
}

function codexSessionsRoot() {
  return path.resolve(getValue("--codex-sessions-root", path.join(codexHome(), "sessions")));
}

function listCodexSessionFiles(root) {
  const files = [];
  walkCodexSessions(root, files);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function walkCodexSessions(dir, files) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCodexSessions(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        const stat = statSync(fullPath);
        files.push({ path: fullPath, mtimeMs: stat.mtimeMs });
      } catch {
        // Ignore sessions that disappear while scanning.
      }
    }
  }
}

function readFirstLine(filePath, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const fd = openSync(filePath, "r");
  try {
    const chunks = [];
    let offset = 0;
    let total = 0;
    const chunkSize = 128 * 1024;
    while (total < maxBytes) {
      const buffer = Buffer.alloc(chunkSize);
      const bytesRead = readSync(fd, buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(10);
      if (newline >= 0) {
        chunks.push(chunk.subarray(0, newline));
        break;
      }
      chunks.push(chunk);
      offset += bytesRead;
      total += bytesRead;
    }
    return Buffer.concat(chunks).toString("utf8").replace(/\r$/, "");
  } finally {
    closeSync(fd);
  }
}

function readLastJsonRecord(filePath) {
  try {
    const stat = statSync(filePath);
    const length = Math.min(stat.size, 256 * 1024);
    const fd = openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, stat.size - length);
      const lines = buffer.toString("utf8").split(/\r?\n/).filter(Boolean).reverse();
      for (const line of lines) {
        try {
          return JSON.parse(line);
        } catch {
          // Try the previous line.
        }
      }
      return null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function idFromSessionPath(filePath) {
  return path.basename(filePath).match(sessionUuidRe)?.[1] || "";
}

function readSessionMeta(filePath) {
  const fallbackId = idFromSessionPath(filePath);
  try {
    const firstLine = readFirstLine(filePath);
    const record = JSON.parse(firstLine);
    if (record.type !== "session_meta") {
      return fallbackId ? { threadId: fallbackId, cwd: "", name: "", source: "path" } : null;
    }
    const payload = record.payload || {};
    const threadId = payload.id || fallbackId;
    if (!threadId) return null;
    return {
      threadId,
      cwd: payload.cwd || "",
      name: payload.name || payload.title || "",
      source: payload.source || "session_meta",
    };
  } catch {
    return fallbackId ? { threadId: fallbackId, cwd: "", name: "", source: "path" } : null;
  }
}

function statusFromSessionRecord(record) {
  if (!record || record.type === "session_meta") return "";
  const payload = record.payload || {};
  const item = record.item || payload.item || payload || {};
  const typeText = [
    record.type,
    record.method,
    payload.type,
    payload.phase,
    item.type,
    item.phase,
    item.status,
  ].filter(Boolean).join(" ");
  const text = `${typeText} ${JSON.stringify({
    message: payload.message || item.message || "",
    role: item.role || payload.role || "",
  })}`;
  if (/final_answer/i.test(text)) return "idle";
  if (/turn[./_-]?completed|response[./_-]?completed/i.test(text)) return "idle";
  if (item.type === "agent_message" || item.type === "message") {
    if (item.phase === "final_answer" || payload.phase === "final_answer") return "idle";
  }
  if (runningSessionEventRe.test(text) && !finalSessionEventRe.test(text)) return "running";
  return "";
}

function detectSessionStatus(sessionPath) {
  if (!sessionPath) return { status: "unknown", reason: "missing session path", lastEventAtMs: 0 };
  let stat;
  try {
    stat = statSync(sessionPath);
  } catch {
    return { status: "unknown", reason: "session file unavailable", lastEventAtMs: 0 };
  }
  const status = statusFromSessionRecord(readLastJsonRecord(sessionPath));
  if (status) {
    return { status, reason: `last event ${status}`, lastEventAtMs: stat.mtimeMs };
  }
  const idleDebounceMs = parsePositiveInteger(getValue("--idle-debounce-ms", "3000"), "--idle-debounce-ms");
  if (Date.now() - stat.mtimeMs < idleDebounceMs) {
    return { status: "running", reason: "recent session write", lastEventAtMs: stat.mtimeMs };
  }
  return { status: "idle", reason: "session file stable", lastEventAtMs: stat.mtimeMs };
}

function findCodexSessionById(threadId) {
  const target = String(threadId || "").trim().toLowerCase();
  if (!target) return null;
  const sessionsRoot = codexSessionsRoot();
  for (const file of listCodexSessionFiles(sessionsRoot)) {
    const meta = readSessionMeta(file.path);
    if (!meta?.threadId) continue;
    if (String(meta.threadId).toLowerCase() !== target) continue;
    const status = detectSessionStatus(file.path);
    return {
      ...meta,
      threadPath: file.path,
      updatedAtMs: file.mtimeMs,
      sessionStatus: status.status,
      sessionStatusReason: status.reason,
      lastEventAtMs: status.lastEventAtMs,
    };
  }
  return null;
}

function cwdMatchesSession(registryCwd, sessionCwd) {
  if (!registryCwd || !sessionCwd) return true;
  try {
    return path.resolve(registryCwd) === path.resolve(sessionCwd);
  } catch {
    return registryCwd === sessionCwd;
  }
}

function deliveryTargetReadiness(entry, { requireIdle = false } = {}) {
  if (!entry) {
    return { ready: false, reason: "No active window registry entry is available." };
  }
  const threadError = threadIdValidationError(entry.threadId);
  if (threadError) {
    return { ready: false, reason: threadError };
  }
  const session = findCodexSessionById(entry.threadId);
  if (!session) {
    return {
      ready: false,
      reason: `No local Codex session was found for ${entry.windowName}; register the real target thread before arming automation.`,
    };
  }
  if (requireIdle && session.sessionStatus !== "idle") {
    return {
      ready: false,
      reason: `${entry.windowName} session is ${session.sessionStatus}; wait for the target Codex window to become idle.`,
      session,
    };
  }
  const warnings = [];
  if (session.sessionStatus === "running") {
    warnings.push(`${entry.windowName} session appears running; automation may wait behind active work.`);
  }
  if (!cwdMatchesSession(entry.cwd, session.cwd)) {
    warnings.push(`${entry.windowName} registry cwd differs from the resolved Codex session cwd.`);
  }
  return { ready: true, reason: "", session, warnings };
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`${label} must be a non-negative integer.`);
  }
  return parsed;
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
  const indexPath = ledgerPaths.workspaceIndexPath;
  if (!existsSync(indexPath)) {
    fail(`${relativeToWorkspace(indexPath)} is missing; pass --plan explicitly.`);
  }
  const content = readFileSync(indexPath, "utf8");
  const section = sectionContent(content, "当前总控入口");
  const rows = section
    .split("\n")
    .map(splitMarkdownRow)
    .filter((row) => row.length > 0);
  const planRow = rows.find((row) => row[0] === "当前计划");
  const target = extractFirstLinkTarget(planRow?.[1] ?? "");
  if (!target) {
    fail(`Could not resolve current plan from ${relativeToWorkspace(indexPath)}.`);
  }
  return path.resolve(path.dirname(indexPath), target.split("#")[0]);
}

function parseDispatchRows(planContent) {
  const dispatchSection = sectionContent(planContent, "窗口分派") || sectionContent(planContent, "窗口覆盖状态");
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
    const window = cells[0].match(/`([^`]+)`/)?.[1] ?? cells[0].replace(/<br\s*\/?>/gi, " ").trim();
    const status = ["待启动", "执行中", "待验收", "阻塞", "已完成", "暂停", "观察中", "无任务"].find((candidate) =>
      cells[0].includes(candidate),
    ) ?? "";
    rows.push({ window, status, task: cells[1] });
  }
  return rows;
}

function taskKeyFromDispatchTask(taskText) {
  const match = String(taskText ?? "").match(/`([A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,})`/);
  if (!match) {
    return "";
  }
  return match[1].replace(/[^A-Za-z0-9._:-]/g, "-");
}

function taskIdForPlanWindow(planPath, windowName, taskText = "") {
  const base = `${path.basename(planPath, ".md")}__${windowName}`;
  const taskKey = taskKeyFromDispatchTask(taskText);
  return taskKey ? `${base}__${taskKey}` : base;
}

function sanitizeGroupId(value) {
  const groupId = String(value ?? "").trim();
  if (!groupId) {
    fail("Dispatch group id is required.");
  }
  if (!/^[a-zA-Z0-9._:-]+$/.test(groupId)) {
    fail(`Invalid dispatch group id: ${groupId}. Use letters, numbers, dot, colon, underscore, or dash.`);
  }
  return groupId;
}

function validateReturnPolicy(value) {
  const policy = String(value ?? "").trim();
  if (!["controller-last", "target-courier"].includes(policy)) {
    fail("--return-policy must be controller-last or target-courier.");
  }
  return policy;
}

function parseStatusLine(content) {
  return content.match(/^状态：(.+)$/m)?.[1]?.trim() ?? "";
}

function parseMarkdownTable(section) {
  const rows = section
    .split("\n")
    .map(splitMarkdownRow)
    .filter((row) => row.length > 0);
  const header = rows.find((row) => row.some((cell) => cell === "ID" || cell === "状态" || cell === "优先级"));
  if (!header) {
    return [];
  }
  const headerLineIndex = rows.indexOf(header);
  return rows
    .slice(headerLineIndex + 1)
    .filter((row) => !row.every((cell) => /^-+$/.test(cell)))
    .map((row) =>
      Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])),
    );
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function priorityRank(priority) {
  const match = stripMarkdown(priority).match(/^P(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 99;
}

function isTodoCandidate(row) {
  const status = stripMarkdown(row["状态"]);
  const owner = stripMarkdown(row["归属"]);
  const windowName = stripMarkdown(row["推荐窗口"]);
  if (!row["ID"] || /已完成|已取消|取消|不做|归档|观察中/.test(status)) {
    return false;
  }
  if (/待定/.test(owner) || /待定/.test(windowName)) {
    return false;
  }
  return true;
}

function todoCandidatesFromBoard(limit = 5) {
  const todoPath = ledgerPaths.globalTodoPath;
  if (!existsSync(todoPath)) {
    return [];
  }
  const content = readFileSync(todoPath, "utf8");
  const section = sectionContent(content, "全局 TODO");
  return parseMarkdownTable(section)
    .filter(isTodoCandidate)
    .sort((a, b) => {
      const byPriority = priorityRank(a["优先级"]) - priorityRank(b["优先级"]);
      if (byPriority !== 0) {
        return byPriority;
      }
      return stripMarkdown(a["ID"]).localeCompare(stripMarkdown(b["ID"]));
    })
    .slice(0, limit)
    .map((row) => ({
      id: stripMarkdown(row["ID"]),
      status: stripMarkdown(row["状态"]),
      type: stripMarkdown(row["类型"]),
      priority: stripMarkdown(row["优先级"]),
      owner: stripMarkdown(row["归属"]),
      target: stripMarkdown(row["事项 / 目标"]),
      affectsDispatch: stripMarkdown(row["影响复测 / 派发"]),
      dependency: stripMarkdown(row["依赖 / 触发"]),
      recommendedWindow: stripMarkdown(row["推荐窗口"]),
      mountedAt: stripMarkdown(row["当前挂载"]),
    }));
}

function keepAwakeCommand() {
  return getValue("--keep-awake-command", process.env.CODEX_VAD_KEEP_AWAKE_COMMAND || "caffeinate");
}

function keepAwakeArgs() {
  const explicitArgs = getAllValues("--keep-awake-arg");
  if (explicitArgs.length > 0) {
    return explicitArgs;
  }
  const jsonArgs = process.env.CODEX_VAD_KEEP_AWAKE_ARGS_JSON;
  if (jsonArgs) {
    try {
      const parsed = JSON.parse(jsonArgs);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed;
      }
    } catch {
      return ["-dims"];
    }
  }
  return ["-dims"];
}

function keepAwakeEnabled() {
  if (hasFlag("--no-keep-awake")) {
    return false;
  }
  return process.env.CODEX_VAD_KEEP_AWAKE !== "0";
}

function keepAwakeStrategy() {
  return getValue("--keep-awake-strategy", process.env.CODEX_VAD_KEEP_AWAKE_STRATEGY || "watcher");
}

function normalizeKeepAwakeState(state) {
  const current = state.keepAwake && typeof state.keepAwake === "object" ? state.keepAwake : {};
  return {
    ...defaultKeepAwake(),
    ...current,
    enabled: keepAwakeEnabled(),
    platform: process.platform,
    childPid: Number.isInteger(Number(current.childPid)) ? Number(current.childPid) : 0,
    strategy: current.strategy || keepAwakeStrategy(),
    token: typeof current.token === "string" ? current.token : "",
    command: current.command || keepAwakeCommand(),
    args: Array.isArray(current.args) && current.args.every((item) => typeof item === "string")
      ? current.args
      : keepAwakeArgs(),
  };
}

function isPidRunning(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function sleepSync(ms) {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, ms);
}

function waitForPidExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    sleepSync(50);
  }
  return !isPidRunning(pid);
}

function keepAwakeStatus(state, extra = {}) {
  const keepAwake = normalizeKeepAwakeState(state);
  const workerActive = isPidRunning(keepAwake.pid);
  const childActive = isPidRunning(keepAwake.childPid);
  return {
    ...keepAwake,
    active: workerActive || childActive,
    workerActive,
    childActive,
    ...extra,
  };
}

function readKeepAwakeControl() {
  if (!existsSync(files.keepAwakeControl)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(files.keepAwakeControl, "utf8"));
  } catch {
    return {};
  }
}

function writeKeepAwakeControl(value) {
  atomicWriteJson(files.keepAwakeControl, value);
}

function keepAwakeWorkerArgs(status, token) {
  return [
    scriptPath,
    "keep-awake-worker",
    "--root",
    workspaceRoot,
    "--state-dir",
    stateDir,
    "--token",
    token,
    "--keep-awake-command",
    status.command,
    ...status.args.flatMap((arg) => ["--keep-awake-arg", arg]),
  ];
}

function readWorkerChildPid(token, timeoutMs = 750) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const control = readKeepAwakeControl();
    if (control.token === token && Number.isInteger(Number(control.childPid)) && Number(control.childPid) > 0) {
      return Number(control.childPid);
    }
    sleepSync(25);
  }
  const control = readKeepAwakeControl();
  return control.token === token && Number.isInteger(Number(control.childPid)) ? Number(control.childPid) : 0;
}

function startKeepAwake(state, { dryRun = false } = {}) {
  const status = keepAwakeStatus(state, {
    command: keepAwakeCommand(),
    args: keepAwakeArgs(),
  });
  if (!status.enabled) {
    return {
      ...status,
      message: status.active ? "disabled; already running" : "disabled",
    };
  }
  if (status.platform !== "darwin") {
    return { ...status, active: false, pid: 0, message: "macOS only" };
  }
  if (status.active) {
    return { ...status, message: "already running" };
  }
  if (dryRun) {
    return { ...status, active: false, pid: 0, message: "would start" };
  }
  try {
    const token = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
    writeKeepAwakeControl({
      version: 1,
      token,
      action: "run",
      requestedAt: nowIso(),
      command: status.command,
      args: status.args,
      workerPid: 0,
      childPid: 0,
    });
    const child = spawn(process.execPath, keepAwakeWorkerArgs(status, token), {
      stdio: "ignore",
      // The watcher outlives this short-lived CLI invocation and exits by
      // observing a local stop marker, avoiding cross-command signal EPERM in
      // Codex sandboxed shells.
      detached: true,
    });
    child.unref?.();
    if (!child.pid) {
      return {
        ...status,
        active: false,
        pid: 0,
        lastError: `Failed to start ${status.command}: no child pid returned.`,
        message: "failed",
      };
    }
    const childPid = readWorkerChildPid(token);
    return {
      ...status,
      active: true,
      pid: child.pid || 0,
      childPid,
      strategy: "watcher",
      token,
      startedAt: nowIso(),
      stoppedAt: null,
      stopReason: "",
      lastError: "",
      message: "started",
    };
  } catch (error) {
    return {
      ...status,
      active: false,
      pid: 0,
      lastError: error.message,
      message: "failed",
    };
  }
}

function stopKeepAwake(state, { dryRun = false, reason = "" } = {}) {
  const status = keepAwakeStatus(state);
  if (!status.active) {
    return {
      ...status,
      active: false,
      pid: 0,
      stoppedAt: status.stoppedAt || nowIso(),
      stopReason: reason,
      lastError: "",
      message: status.pid ? "not running" : "not started",
    };
  }
  if (dryRun) {
    return { ...status, message: "would stop" };
  }
  if (status.strategy === "watcher" && status.token) {
    writeKeepAwakeControl({
      version: 1,
      token: status.token,
      action: "stop",
      requestedAt: nowIso(),
      reason,
      workerPid: status.pid || 0,
      childPid: status.childPid || 0,
    });
    const workerExited = waitForPidExit(status.pid, 5000);
    const childExited = waitForPidExit(status.childPid, 3000);
    if (workerExited && childExited) {
      return {
        ...status,
        active: false,
        workerActive: false,
        childActive: false,
        pid: 0,
        childPid: 0,
        token: "",
        stoppedAt: nowIso(),
        stopReason: reason,
        lastError: "",
        message: "stopped",
      };
    }
    return {
      ...status,
      active: isPidRunning(status.pid) || isPidRunning(status.childPid),
      workerActive: isPidRunning(status.pid),
      childActive: isPidRunning(status.childPid),
      lastError: [
        workerExited ? "" : `worker pid ${status.pid} did not exit after stop marker`,
        childExited ? "" : `keep-awake child pid ${status.childPid} did not exit after worker stop`,
      ].filter(Boolean).join("; "),
      message: "stop failed",
    };
  }
  try {
    process.kill(status.pid, "SIGTERM");
    return {
      ...status,
      active: false,
      pid: 0,
      childPid: 0,
      token: "",
      stoppedAt: nowIso(),
      stopReason: reason,
      lastError: "",
      message: "stopped",
    };
  } catch (error) {
    return {
      ...status,
      active: isPidRunning(status.pid),
      lastError: error.message,
      message: "stop failed",
    };
  }
}

function keepAwakeWorkerCommandArgs(commandName, args) {
  if (process.platform === "darwin" && path.basename(commandName) === "caffeinate" && !args.includes("-w")) {
    return [...args, "-w", String(process.pid)];
  }
  return args;
}

function commandKeepAwakeWorker() {
  const token = getValue("--token", "");
  if (!token) {
    fail("keep-awake-worker requires --token.");
  }
  const commandName = keepAwakeCommand();
  const args = keepAwakeWorkerCommandArgs(commandName, keepAwakeArgs());
  let child = null;
  let exiting = false;

  const stopChild = () => {
    if (!child?.pid || !isPidRunning(child.pid)) {
      return;
    }
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      return;
    }
    if (!waitForPidExit(child.pid, 1200)) {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch {
        // The parent watcher is exiting; status checks will surface residue.
      }
    }
  };

  const exitWorker = (code = 0) => {
    if (exiting) {
      return;
    }
    exiting = true;
    stopChild();
    process.exit(code);
  };

  try {
    child = spawn(commandName, args, { stdio: "ignore" });
  } catch (error) {
    writeKeepAwakeControl({
      version: 1,
      token,
      action: "failed",
      workerPid: process.pid,
      childPid: 0,
      updatedAt: nowIso(),
      error: error.message,
    });
    process.exit(1);
  }

  writeKeepAwakeControl({
    version: 1,
    token,
    action: "run",
    workerPid: process.pid,
    childPid: child.pid || 0,
    updatedAt: nowIso(),
    command: commandName,
    args,
  });

  child.on("exit", () => exitWorker(0));
  process.on("SIGTERM", () => exitWorker(0));
  process.on("SIGINT", () => exitWorker(0));

  setInterval(() => {
    const control = readKeepAwakeControl();
    if (control.token === token && control.action === "stop") {
      exitWorker(0);
    }
    try {
      const state = readJson(files.state, defaultState());
      if (state.keepAwake?.token === token && state.mode !== "enabled") {
        exitWorker(0);
      }
    } catch {
      // Keep the watcher alive if state is temporarily being written.
    }
  }, 500).unref?.();
}

function commandStatus() {
  const { state, registry, queue, runs, groups } = readAll();
  const counts = queue.tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  const keepAwake = keepAwakeStatus(state);
  output(
    {
      ok: true,
      stateDir: relativeToWorkspace(stateDir),
      mode: state.mode,
      loopEnabled: Boolean(state.loopEnabled),
      registeredWindows: registry.windows.length,
      taskCounts: counts,
      automationRuns: runs.runs.length,
      dispatchGroups: groups.groups.length,
      disablePolicy: state.disablePolicy ?? "stop-next-chain",
      keepAwake,
    },
    [
      "Visible dispatch status",
      `State dir: ${relativeToWorkspace(stateDir)}`,
      `Mode: ${state.mode}`,
      `Loop enabled: ${Boolean(state.loopEnabled)}`,
      `Disable policy: ${state.disablePolicy ?? "stop-next-chain"}`,
      `Keep awake: ${keepAwake.active ? `active pid=${keepAwake.pid}` : keepAwake.message || "inactive"}`,
      `Registered windows: ${registry.windows.length}`,
      `Tasks: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
      `Automation runs: ${runs.runs.length}`,
      `Dispatch groups: ${groups.groups.length}`,
    ].join("\n"),
  );
}

function commandInit() {
  const runtimeFiles = [
    { key: "state", file: files.state, value: defaultState() },
    { key: "registry", file: files.registry, value: defaultRegistry() },
    { key: "queue", file: files.queue, value: defaultQueue() },
    { key: "runs", file: files.runs, value: defaultRuns() },
    { key: "groups", file: files.groups, value: defaultGroups() },
  ];
  const missing = runtimeFiles.filter((item) => !existsSync(item.file));
  if (write) {
    mkdirSync(stateDir, { recursive: true });
    for (const item of missing) {
      atomicWriteJson(item.file, item.value);
    }
  }
  output(
    {
      ok: true,
      wrote: write,
      stateDir: relativeToWorkspace(stateDir),
      created: missing.map((item) => item.key),
      existing: runtimeFiles.filter((item) => existsSync(item.file)).map((item) => item.key),
      nextStep:
        "Register real thread ids if needed, then use start-plan for the first launch or resume-plan for a continuation.",
    },
    [
      `Visible dispatch init ${write ? "applied" : "dry-run"}.`,
      `State dir: ${relativeToWorkspace(stateDir)}`,
      `Created: ${missing.map((item) => item.key).join(", ") || "none"}`,
      "No mode change, queue claim, heartbeat payload, or automation deletion was performed.",
    ].join("\n"),
  );
}

function redactThreadEntry(entry) {
  return {
    ...entry,
    threadId: entry.threadId ? "<local-only>" : "",
  };
}

function redactTaskForOutput(task) {
  if (!task || typeof task !== "object") {
    return task;
  }
  return {
    ...task,
    completedByThreadId: task.completedByThreadId ? "<local-only>" : task.completedByThreadId,
  };
}

function groupSummariesById(groups, queue) {
  return new Map(groups.groups.map((group) => [group.groupId, summarizeGroup(group, queue)]));
}

function controllerDecisionFromQueue(state, registry, queue, groups, currentPlanPath) {
  const observedAt = nowIso();
  const nowMs = Date.parse(observedAt);
  const activeWindows = activeWindowSet(registry);
  const groupSummaries = groupSummariesById(groups, queue);
  const tasks = queue.tasks.map((task) => ({
    taskId: task.taskId,
    targetWindow: task.targetWindow,
    status: task.status,
    controlDoc: task.controlDoc ?? null,
    leaseUntil: task.leaseUntil ?? null,
    armLeaseUntil: task.armLeaseUntil ?? null,
    automationId: task.automationId ?? null,
    hasBackfill: hasBackfill(task),
    groupId: task.groupId ?? null,
    ...classifyTaskForTick(task, state, activeWindows, nowMs, groupSummaries),
  }));
  const historicResolvedTasks = tasks.filter(
    (task) =>
      task.controlDoc &&
      task.controlDoc !== currentPlanPath &&
      ["accepted", "rejected", "blocked"].includes(task.status),
  );
  const actionableTasks = tasks.filter((task) => !historicResolvedTasks.includes(task));
  if (actionableTasks.some((task) => task.nextAction === "acceptanceReview")) {
    return {
      topAction: "review",
      nextAction: "acceptanceReview",
      message: "Completed task has backfill evidence; total control should review before continuing.",
      ignoredHistoricTasks: historicResolvedTasks,
      tasks,
    };
  }
  if (actionableTasks.some((task) => task.waitState === "attention" || task.waitState === "blocked")) {
    return {
      topAction: "attention",
      nextAction: "resolveQueue",
      message: "Dispatch queue has a blocked or attention-needed task; resolve it before selecting more work.",
      ignoredHistoricTasks: historicResolvedTasks,
      tasks,
    };
  }
  if (actionableTasks.some((task) => task.waitState === "waiting")) {
    return {
      topAction: "wait",
      nextAction: "waitForBackfill",
      message: "Dispatch queue has active work; wait for claim or backfill.",
      ignoredHistoricTasks: historicResolvedTasks,
      tasks,
    };
  }
  if (actionableTasks.some((task) => task.nextAction === "arm")) {
    const task = actionableTasks.find((item) => item.nextAction === "arm");
    return {
      topAction: "arm",
      nextAction: "prepareArmPayload",
      message: "Queued task is ready for an automation payload.",
      suggestedCommand: `node scripts/visible-dispatch.mjs arm --task ${task.taskId} --json`,
      ignoredHistoricTasks: historicResolvedTasks,
      tasks,
    };
  }
  return { topAction: null, nextAction: null, message: "", ignoredHistoricTasks: historicResolvedTasks, tasks };
}

function buildControllerTickResult() {
  const { state, registry, queue, groups } = readAll();
  const planPath = currentPlanPathFromIndex();
  const planContent = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
  const currentPlan = {
    path: relativeToWorkspace(planPath),
    status: parseStatusLine(planContent),
  };
  const dispatchRows = parseDispatchRows(planContent);
  const sendEligibleRows = dispatchRows.filter((row) => sendEligibleStatuses.has(row.status));
  const existingTaskIds = new Set(queue.tasks.map((task) => task.taskId));
  const missingSendEligibleRows = sendEligibleRows.filter(
    (row) => !existingTaskIds.has(taskIdForPlanWindow(planPath, row.window, row.task)),
  );
  const unsupportedRows = sendEligibleRows.filter((row) => !dispatchWindows.has(row.window));
  const queueDecision = controllerDecisionFromQueue(state, registry, queue, groups, currentPlan.path);
  const todoCandidates = todoCandidatesFromBoard();

  let decision;
  if (state.mode !== "enabled") {
    decision = {
      topAction: "stopped",
      nextAction: "modeDisabled",
      message: "Automation mode is disabled; do not enqueue, arm, or select TODO work.",
    };
  } else if (unsupportedRows.length > 0) {
    decision = {
      topAction: "attention",
      nextAction: "fixDispatchCoverage",
      message: `Current plan has send-eligible unsupported windows: ${unsupportedRows.map((row) => row.window).join(", ")}.`,
    };
  } else if (queueDecision.topAction) {
    decision = queueDecision;
  } else if (missingSendEligibleRows.length > 0) {
    decision = {
      topAction: "enqueue",
      nextAction: "enqueueCurrentPlan",
      message: "Current plan has send-eligible dispatch windows without queue tasks; enqueue from plan before selecting TODO work.",
      suggestedCommand: "node scripts/visible-dispatch.mjs enqueue --from-plan --write",
    };
  } else if (sendEligibleRows.length > 0) {
    decision = {
      topAction: "decision",
      nextAction: "closeOrRefreshCurrentPlan",
      message: "Current plan send-eligible rows already have queue tasks; close, refresh, or replan before selecting TODO work.",
    };
  } else if (/阻塞|待裁决|暂停|待确认/.test(currentPlan.status)) {
    decision = {
      topAction: "decision",
      nextAction: "resolveCurrentPlan",
      message: "Current plan is blocked or waiting for a decision; total control must resolve it before choosing a new TODO.",
    };
  } else if (/已完成.*待归档|已完成待归档/.test(currentPlan.status)) {
    decision = {
      topAction: "decision",
      nextAction: "archiveOrConfirmNextMainline",
      message: "Current plan is complete but not archived; archive it or get explicit confirmation before selecting a new TODO.",
    };
  } else if (todoCandidates.length > 0) {
    decision = {
      topAction: "mainlineCandidate",
      nextAction: "reviewTodoCandidate",
      message: "No send-eligible current-plan task exists; review the top TODO candidate without bypassing confirmation gates.",
      candidate: todoCandidates[0],
    };
  } else {
    decision = {
      topAction: "idle",
      nextAction: "none",
      message: "No send-eligible current-plan task and no eligible TODO candidate were found.",
    };
  }

  return {
    ok: true,
    observedAt: nowIso(),
    mode: state.mode,
    loopEnabled: Boolean(state.loopEnabled),
    currentPlan,
    sendEligibleWindows: sendEligibleRows.map((row) => ({
      window: row.window,
      status: row.status,
      task: row.task,
      taskId: taskIdForPlanWindow(planPath, row.window, row.task),
    })),
    missingSendEligibleWindows: missingSendEligibleRows.map((row) => ({
      window: row.window,
      status: row.status,
      task: row.task,
      taskId: taskIdForPlanWindow(planPath, row.window, row.task),
    })),
    queueTaskCount: queue.tasks.length,
    queueDecision,
    todoCandidates,
    ...decision,
  };
}

function compactControllerTickResult(result) {
  const tasks = Array.isArray(result.queueDecision?.tasks) ? result.queueDecision.tasks : [];
  const taskStatusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  const waitStateCounts = tasks.reduce((acc, task) => {
    acc[task.waitState] = (acc[task.waitState] ?? 0) + 1;
    return acc;
  }, {});
  const actionCounts = tasks.reduce((acc, task) => {
    acc[task.nextAction] = (acc[task.nextAction] ?? 0) + 1;
    return acc;
  }, {});
  return {
    ok: result.ok,
    observedAt: result.observedAt,
    mode: result.mode,
    loopEnabled: result.loopEnabled,
    currentPlan: result.currentPlan,
    sendEligibleWindowCount: result.sendEligibleWindows.length,
    missingSendEligibleWindowCount: result.missingSendEligibleWindows.length,
    queueTaskCount: result.queueTaskCount,
    taskStatusCounts,
    waitStateCounts,
    actionCounts,
    topAction: result.topAction,
    nextAction: result.nextAction,
    message: result.message,
    candidate: result.candidate
      ? {
          id: result.candidate.id,
          status: result.candidate.status,
          priority: result.candidate.priority,
          recommendedWindow: result.candidate.recommendedWindow,
        }
      : null,
  };
}

function commandControllerTick() {
  const result = buildControllerTickResult();
  const printable = hasFlag("--compact") ? compactControllerTickResult(result) : result;
  output(
    printable,
    [
      hasFlag("--compact") ? "Visible dispatch controller tick (compact)" : "Visible dispatch controller tick",
      `Mode: ${result.mode}`,
      `Current plan: ${result.currentPlan.path} (${result.currentPlan.status || "unknown"})`,
      `Top action: ${result.topAction}`,
      `Next action: ${result.nextAction}`,
      result.message,
    ].join("\n"),
  );
}

function statusDocumentStaleLines(state, currentPlan) {
  const statusPath = ledgerPaths.workspaceCurrentStatusPath;
  if (!existsSync(statusPath)) {
    return [];
  }
  const content = readFileSync(statusPath, "utf8");
  const staleLines = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (
      state.mode !== "enabled" &&
      /(?:Visible Dispatch|VAD|自动化)/i.test(line) &&
      /(?:mode enabled|loop enabled|防睡眠 active|准备由 VAD|投递给|enabled)/i.test(line)
    ) {
      staleLines.push({ line: index + 1, text: line.trim() });
    }
    if (
      /已完成.*待归档|已完成待归档/.test(currentPlan.status) &&
      /当前 Stage [0-9A-Z]+.*(?:准备|等待|执行中|待验收)|等待 .*claim|等待 .*backfill/i.test(line)
    ) {
      staleLines.push({ line: index + 1, text: line.trim() });
    }
  }
  return staleLines;
}

function commandPostRunAudit() {
  const { state, queue, runs } = readAll();
  const keepAwake = keepAwakeStatus(state);
  const tick = buildControllerTickResult();
  const issues = [];
  const warnings = [];
  const activeRuns = runs.runs.filter((run) => run.status !== "stopped");
  const activeTasks = queue.tasks.filter((task) => ["queued", "armed", "claimed", "running", "stale", "completed"].includes(task.status));
  const staleStatusLines = statusDocumentStaleLines(state, tick.currentPlan);

  if (state.mode !== "disabled" || state.loopEnabled) {
    issues.push("VAD mode is not fully disabled.");
  }
  if (state.mode !== "enabled" && keepAwake.active) {
    issues.push(`Keep-awake process is still active (pid=${keepAwake.pid}).`);
  }
  if (activeRuns.length > 0) {
    issues.push(`Local automation runs are still active: ${activeRuns.map((run) => run.automationId).join(", ")}.`);
  }
  if (activeTasks.length > 0) {
    issues.push(`Dispatch queue still has non-terminal tasks: ${activeTasks.map((task) => `${task.taskId}:${task.status}`).join(", ")}.`);
  }
  if (tick.sendEligibleWindows.length > 0) {
    issues.push(`Current plan still has send-eligible windows: ${tick.sendEligibleWindows.map((row) => row.window).join(", ")}.`);
  }
  if (staleStatusLines.length > 0) {
    issues.push(`workspace-current-status.md appears stale on ${staleStatusLines.length} line(s).`);
  }
  if (tick.todoCandidates.length > 0 && /已完成.*待归档|已完成待归档/.test(tick.currentPlan.status)) {
    warnings.push("TODO candidates exist, but current plan is complete-pending-archive; do not auto-select a new mainline without confirmation.");
  }
  if (keepAwake.lastError) {
    warnings.push(`Last keep-awake error: ${keepAwake.lastError}`);
  }

  const result = {
    ok: issues.length === 0,
    observedAt: nowIso(),
    mode: state.mode,
    loopEnabled: Boolean(state.loopEnabled),
    keepAwake,
    currentPlan: tick.currentPlan,
    topAction: tick.topAction,
    nextAction: tick.nextAction,
    sendEligibleWindowCount: tick.sendEligibleWindows.length,
    queueTaskCount: queue.tasks.length,
    activeTaskCount: activeTasks.length,
    activeAutomationRunCount: activeRuns.length,
    staleStatusLines,
    issues,
    warnings,
  };
  output(
    result,
    [
      "Visible dispatch post-run audit",
      `Result: ${result.ok ? "pass" : "fail"}`,
      `Mode: ${state.mode}, loop=${Boolean(state.loopEnabled)}, keep-awake=${keepAwake.active ? `active pid=${keepAwake.pid}` : keepAwake.message || "inactive"}`,
      `Current plan: ${tick.currentPlan.path} (${tick.currentPlan.status || "unknown"})`,
      `Top action: ${tick.topAction}, next action: ${tick.nextAction}`,
      `Issues: ${issues.join("; ") || "none"}`,
      `Warnings: ${warnings.join("; ") || "none"}`,
    ].join("\n"),
  );
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

function applyModeChange({ enable, reason = "", dryRun = !write } = {}) {
  const state = readJson(files.state, defaultState());
  const keepAwake = enable
    ? startKeepAwake(state, { dryRun })
    : stopKeepAwake(state, { dryRun, reason });
  const modeOk = !(!enable && keepAwake.active && keepAwake.lastError);
  const updatedAt = nowIso();
  const next = {
    ...state,
    mode: enable ? "enabled" : "disabled",
    loopEnabled: enable,
    updatedAt,
    stopRequestedAt: enable ? null : updatedAt,
    disablePolicy: enable ? "" : "stop-next-chain",
    reason,
    keepAwake,
  };
  return { state, next, keepAwake, modeOk };
}

function commandMode() {
  const enable = hasFlag("--enable");
  const disable = hasFlag("--disable");
  if (enable === disable) {
    fail("Pass exactly one of --enable or --disable.");
  }
  const reason = getValue("--reason", "");
  const { next, keepAwake, modeOk } = applyModeChange({ enable, reason });
  if (write) {
    atomicWriteJson(files.state, next);
  }
  output(
    {
      ok: modeOk,
      wrote: write,
      state: next,
      keepAwake,
      guidance: enable
        ? "Automation mode is enabled for eligible current-plan dispatch only. Manual Design discussion, total-control planning, or single-window development still requires explicit total-control judgment and must not be treated as unattended work."
        : modeOk
          ? "Automation mode is disabled. Already-awake target windows may finish once, but finish-chain must not produce another heartbeat payload."
          : "Automation mode is disabled, but keep-awake failed to stop. Treat this as an automation shutdown risk and stop the recorded process before claiming the shutdown is clean.",
    },
    [
      `${write ? "Updated" : "Would update"} visible dispatch mode to ${next.mode}.`,
      `Keep awake: ${keepAwake.active ? `active pid=${keepAwake.pid}` : keepAwake.message || "inactive"}`,
      enable
        ? "Manual Design discussion, total-control discussion, and single-window development remain manual unless a current plan explicitly dispatches them."
        : modeOk
          ? "Finish-chain is closed for the next jump; keep-awake has been stopped when it was owned by this runtime."
          : "Finish-chain is closed, but keep-awake did not stop; resolve this before reporting a clean shutdown.",
    ].join("\n"),
  );
  if (!modeOk) {
    process.exitCode = 1;
  }
}

function commandStopPlan() {
  if (!write) {
    fail("stop-plan requires --write.");
  }
  const reason = getValue("--reason", "stop plan");
  const { next, keepAwake, modeOk } = applyModeChange({ enable: false, reason });
  atomicWriteJson(files.state, next);
  output(
    {
      ok: modeOk,
      wrote: true,
      operation: "stop-plan",
      mode: next.mode,
      loopEnabled: Boolean(next.loopEnabled),
      keepAwake,
      nextStep: modeOk
        ? "Future finish-chain payloads are disabled. Run post-run-audit only when you need to claim the automation surface is fully clean."
        : "Keep-awake did not stop cleanly. Treat this as an automation shutdown risk and inspect the recorded worker/child process.",
    },
    [
      "Visible dispatch stop-plan applied.",
      `Mode: ${next.mode}`,
      `Keep awake: ${keepAwake.active ? `active pid=${keepAwake.pid}` : keepAwake.message || "inactive"}`,
      modeOk
        ? "Finish-chain is closed. Post-run audit is optional unless you are reporting a clean final shutdown."
        : "Finish-chain is closed, but keep-awake did not stop cleanly.",
    ].join("\n"),
  );
  if (!modeOk) {
    process.exitCode = 1;
  }
}

function commandRegister() {
  const windowName = getValue("--window");
  const threadId = getValue("--thread");
  if (!windowName || !threadId) {
    fail("register requires --window and --thread.");
  }
  validateWindow(windowName, { allowController: true });
  validateThreadId(threadId);
  const registry = readJson(files.registry, defaultRegistry());
  const entry = {
    windowName,
    threadId: threadId.trim(),
    cwd: getValue("--cwd", ""),
    role: getValue("--role", windowName),
    status: "active",
    source: getValue("--source", "manual"),
    lastSeenAt: nowIso(),
  };
  registry.windows = registry.windows.filter((item) => item.windowName !== windowName);
  registry.windows.push(entry);
  registry.updatedAt = nowIso();
  if (write) {
    atomicWriteJson(files.registry, registry);
  }
  output(
    { ok: true, wrote: write, entry: redactThreadEntry(entry), storedThreadId: write ? "local-only" : "dry-run" },
    `${write ? "Registered" : "Would register"} ${windowName} for visible dispatch.`,
  );
}



function commandUnregister() {
  const windowName = getValue("--window");
  if (!windowName) {
    fail("unregister requires --window.");
  }
  validateWindow(windowName, { allowController: true });
  const registry = readJson(files.registry, defaultRegistry());
  const before = registry.windows.length;
  registry.windows = registry.windows.filter((item) => item.windowName !== windowName);
  registry.updatedAt = nowIso();
  registry.unregisterReason = getValue("--reason", "");
  const removed = before - registry.windows.length;
  if (write) {
    atomicWriteJson(files.registry, registry);
  }
  output(
    { ok: true, wrote: write, windowName, removed },
    `${write ? "Unregistered" : "Would unregister"} ${windowName} (${removed} entr${removed === 1 ? "y" : "ies"}).`,
  );
}

function addRequiredWindow(required, windowName, reason) {
  validateWindow(windowName, { allowController: true });
  const existing = required.get(windowName);
  if (existing) {
    existing.reasons.push(reason);
    return;
  }
  required.set(windowName, { windowName, reasons: [reason] });
}

function requiredWindowsForPreflight(queue, groups) {
  const required = new Map();
  for (const windowName of getAllValues("--window")) {
    addRequiredWindow(required, windowName, "--window");
  }

  const taskId = getValue("--task");
  if (taskId) {
    const task = queue.tasks.find((item) => item.taskId === taskId);
    if (!task) fail(`Task not found: ${taskId}`);
    addRequiredWindow(required, task.targetWindow, `task:${taskId}`);
  }

  const groupId = getValue("--group");
  if (groupId) {
    const normalizedGroupId = sanitizeGroupId(groupId);
    const group = groups.groups.find((item) => item.groupId === normalizedGroupId);
    if (!group) fail(`Dispatch group not found: ${normalizedGroupId}`);
    const taskIds = new Set(Array.isArray(group.taskIds) ? group.taskIds : []);
    const groupTasks = queue.tasks.filter((task) => task.groupId === normalizedGroupId || taskIds.has(task.taskId));
    for (const task of groupTasks) {
      addRequiredWindow(required, task.targetWindow, `group:${normalizedGroupId}`);
    }
    if (group.returnPolicy === "controller-last" || hasFlag("--include-controller")) {
      addRequiredWindow(required, controlWindowName, `group-controller:${normalizedGroupId}`);
    }
  }

  if (hasFlag("--from-plan")) {
    const explicitPlan = getValue("--plan");
    const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
    if (!existsSync(planPath)) {
      fail(`Plan not found: ${relativeToWorkspace(planPath)}`);
    }
    const rows = parseDispatchRows(readFileSync(planPath, "utf8")).filter((row) => sendEligibleStatuses.has(row.status));
    for (const row of rows) {
      addRequiredWindow(required, row.window, `plan:${relativeToWorkspace(planPath)}`);
    }
    if (hasFlag("--include-controller")) {
      addRequiredWindow(required, controlWindowName, `plan-controller:${relativeToWorkspace(planPath)}`);
    }
  }

  if (required.size === 0) {
    const activeStatuses = new Set(["queued", "claimed", "armed", "running"]);
    for (const task of queue.tasks.filter((item) => activeStatuses.has(item.status))) {
      addRequiredWindow(required, task.targetWindow, `queue:${task.taskId}`);
    }
    for (const group of groups.groups.filter((item) => item.returnPolicy === "controller-last" && item.status !== "returned")) {
      addRequiredWindow(required, controlWindowName, `group-controller:${group.groupId}`);
    }
  }

  return [...required.values()];
}

function redactSessionForOutput(session) {
  if (!session) return null;
  return {
    found: true,
    threadPath: session.threadPath ? "<local-only>" : "",
    cwd: session.cwd || "",
    name: session.name || "",
    source: session.source || "",
    updatedAtMs: session.updatedAtMs || 0,
    sessionStatus: session.sessionStatus || "unknown",
    sessionStatusReason: session.sessionStatusReason || "",
    lastEventAtMs: session.lastEventAtMs || 0,
  };
}

function computePreflight() {
  const { state, registry, queue, runs, groups } = readAll();
  const requireIdle = hasFlag("--require-idle");
  const allowActiveRuns = hasFlag("--allow-active-runs");
  const required = requiredWindowsForPreflight(queue, groups);
  const issues = [];
  const warnings = [];
  const windows = required.map((item) => {
    const entry = activeRegistryEntry(registry, item.windowName);
    const readiness = deliveryTargetReadiness(entry, { requireIdle });
    if (!entry) {
      issues.push(`No active window registry entry for ${item.windowName}.`);
    } else if (!readiness.ready) {
      issues.push(readiness.reason);
    }
    if (readiness.warnings?.length) {
      warnings.push(...readiness.warnings);
    }
    return {
      windowName: item.windowName,
      reasons: item.reasons,
      registered: Boolean(entry),
      threadId: entry?.threadId ? "<local-only>" : "",
      cwd: entry?.cwd || "",
      ready: readiness.ready,
      issue: readiness.ready ? "" : readiness.reason,
      session: redactSessionForOutput(readiness.session),
    };
  });
  const activeRuns = runs.runs.filter((run) => run.status !== "stopped");
  if (activeRuns.length > 0 && !allowActiveRuns) {
    issues.push(`Active automation run(s) exist: ${activeRuns.map((run) => run.automationId).join(", ")}.`);
  }
  if (required.length === 0) {
    warnings.push("No required dispatch windows were found for preflight.");
  }
  const keepAwake = keepAwakeStatus(state);
  if (state.mode === "enabled" && keepAwake.enabled && !keepAwake.active) {
    warnings.push("Automation mode is enabled but keep-awake is not active.");
  }
  return {
    ok: issues.length === 0,
    ready: issues.length === 0,
    checkedAt: nowIso(),
    stateDir: relativeToWorkspace(stateDir),
    mode: state.mode,
    loopEnabled: Boolean(state.loopEnabled),
    codexSessionsRoot: codexSessionsRoot(),
    requireIdle,
    requiredWindowCount: required.length,
    windows,
    activeAutomationRuns: activeRuns.map((run) => ({
      taskId: run.taskId,
      targetWindow: run.targetWindow,
      automationId: run.automationId,
      status: run.status,
      runType: run.runType || "target",
    })),
    keepAwake,
    warnings,
    issues,
  };
}

function commandPreflight() {
  const result = computePreflight();
  output(
    result,
    [
      `Visible dispatch preflight: ${result.ready ? "ready" : "blocked"}`,
      `Mode: ${result.mode}`,
      `Required windows: ${result.requiredWindowCount}`,
      `Issues: ${result.issues.join("; ") || "none"}`,
      `Warnings: ${result.warnings.join("; ") || "none"}`,
    ].join("\n"),
  );
  if (!result.ready) {
    process.exit(1);
  }
}

function defaultGroupIdForPlan(planPath) {
  return path.basename(planPath, ".md").replace(/[^a-zA-Z0-9._:-]+/g, "-");
}

function enqueueFromPlan({ planPath, groupId = "", returnPolicy = "", writeChanges = false } = {}) {
  if (!existsSync(planPath)) {
    fail(`Plan not found: ${relativeToWorkspace(planPath)}`);
  }
  const planContent = readFileSync(planPath, "utf8");
  const rows = parseDispatchRows(planContent).filter((row) => sendEligibleStatuses.has(row.status));
  const unsupported = rows.filter((row) => !dispatchWindows.has(row.window));
  if (unsupported.length > 0) {
    fail(`Plan has send-eligible unsupported windows: ${unsupported.map((row) => row.window).join(", ")}`);
  }
  const queue = readJson(files.queue, defaultQueue());
  const groups = readJson(files.groups, defaultGroups());
  const normalizedGroupId = groupId ? sanitizeGroupId(groupId) : "";
  const normalizedReturnPolicy = normalizedGroupId ? validateReturnPolicy(returnPolicy || "controller-last") : "";
  const created = [];
  const groupTaskIds = [];
  for (const row of rows) {
    const taskId = taskIdForPlanWindow(planPath, row.window, row.task);
    const existing = queue.tasks.find((task) => task.taskId === taskId);
    const task = {
      taskId,
      targetWindow: row.window,
      status: "queued",
      controlDoc: relativeToWorkspace(planPath),
      promptRef: "可复制提示词",
      taskSummary: row.task,
      createdAt: nowIso(),
      claim: null,
      leaseUntil: null,
      backfill: null,
      groupId: normalizedGroupId || undefined,
      returnPolicy: normalizedReturnPolicy || undefined,
    };
    groupTaskIds.push(taskId);
    if (!existing) {
      queue.tasks.push(task);
      created.push(task);
    } else if (!["completed", "blocked"].includes(existing.status)) {
      Object.assign(existing, {
        targetWindow: task.targetWindow,
        controlDoc: task.controlDoc,
        promptRef: task.promptRef,
        taskSummary: task.taskSummary,
        groupId: task.groupId,
        returnPolicy: task.returnPolicy,
        refreshedAt: nowIso(),
      });
    }
  }
  if (normalizedGroupId) {
    const existingGroup = groups.groups.find((group) => group.groupId === normalizedGroupId);
    const nextGroup = {
      groupId: normalizedGroupId,
      controlDoc: relativeToWorkspace(planPath),
      returnPolicy: normalizedReturnPolicy,
      status: "open",
      taskIds: groupTaskIds,
      createdAt: existingGroup?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    if (existingGroup) {
      Object.assign(existingGroup, nextGroup);
    } else {
      groups.groups.push(nextGroup);
    }
    groups.updatedAt = nextGroup.updatedAt;
  }
  queue.updatedAt = nowIso();
  if (writeChanges) {
    atomicWriteJson(files.queue, queue);
    if (normalizedGroupId) {
      atomicWriteJson(files.groups, groups);
    }
  }
  return {
    ok: true,
    wrote: writeChanges,
    plan: relativeToWorkspace(planPath),
    groupId: normalizedGroupId || null,
    returnPolicy: normalizedReturnPolicy || null,
    created,
    taskCount: queue.tasks.length,
    queue,
    groups,
  };
}

function commandEnqueue() {
  if (!hasFlag("--from-plan")) {
    fail("enqueue currently supports only --from-plan.");
  }
  const explicitPlan = getValue("--plan");
  const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
  const result = enqueueFromPlan({
    planPath,
    groupId: getValue("--group", ""),
    returnPolicy: getValue("--return-policy", "controller-last"),
    writeChanges: write,
  });
  output(
    {
      ok: result.ok,
      wrote: result.wrote,
      plan: result.plan,
      groupId: result.groupId,
      returnPolicy: result.returnPolicy,
      created: result.created,
      taskCount: result.taskCount,
    },
    `${write ? "Enqueued" : "Would enqueue"} ${result.created.length} visible dispatch task(s) from ${result.plan}.`,
  );
}

function activeRegistryEntry(registry, windowName) {
  return registry.windows.find((item) => item.windowName === windowName && item.status === "active");
}

function buildTaskPrompt(task) {
  const targetSkillPath = promptPathForWindow(
    task.targetWindow,
    path.resolve(workspaceRoot, "skills/dev/visible-automation-dispatch-target/SKILL.md"),
  );
  return [
    `继续当前窗口任务：${task.targetWindow}。`,
    "",
    `先读取 AGENTS.md、${promptPathForWindow(task.targetWindow, ledgerPaths.workspaceIndexPath)}、${promptPathForWindow(task.targetWindow, path.resolve(workspaceRoot, task.controlDoc))}，以及你所在窗口/目标仓库的 AGENTS.md。`,
    "",
    "先明确声明当前窗口定位和本轮仓库职责。",
    "",
    "再按照文档领取并完成分配给你所在窗口的任务。",
    "",
    "如果任务包较大，可在当前窗口职责和计划边界内自行判断是否开启 Codex 子 agent 分担工作；最终由当前窗口统一复核和回填。",
    "",
    "完成后回填：完成范围、提交 hash、验证命令、验证结果、遗留风险和下一步建议。",
    "",
    "自动化补充：",
    `- currentWindow：${task.targetWindow}`,
    `- taskId：${task.taskId}`,
    `- controlDoc：${task.controlDoc}`,
    `- rules：用完即弃；按 target skill 领取/完成；只处理本窗口任务；下一跳仅按 finish JSON 权限。`,
    `- skill：${targetSkillPath}`,
  ].join("\n");
}

function buildArmPayload(task, registry) {
  const windowEntry = activeRegistryEntry(registry, task.targetWindow);
  if (!windowEntry) {
    return {
      payload: null,
      reason: `No active window registry entry for ${task.targetWindow}.`,
    };
  }
  const readiness = deliveryTargetReadiness(windowEntry);
  if (!readiness.ready) {
    return {
      payload: null,
      reason: readiness.reason,
    };
  }
  const prompt = buildTaskPrompt(task);
  const payload = {
    kind: "heartbeat",
    destination: "thread",
    targetThreadId: windowEntry.threadId,
    name: `继续 ${task.targetWindow} 任务`,
    rrule: heartbeatRrule,
    prompt,
    taskId: task.taskId,
    targetWindow: task.targetWindow,
    controlDoc: task.controlDoc,
    cadence: heartbeatRrule,
    chainMode: "finish-chain",
    stopSwitchCommand: scriptCommandForWindow(task.targetWindow, "stop-plan --write"),
  };
  return { payload, reason: "" };
}

function buildControllerReturnPrompt(group, completedTask) {
  const controllerSkillPath = workspaceRootPath(
    path.resolve(workspaceRoot, "skills/dev/visible-automation-dispatch-controller/SKILL.md"),
  );
  return [
    `继续总控验收：${completedTask.targetWindow} 回填。`,
    "",
    `先读取 AGENTS.md、${promptPathForWindow(controlWindowName, ledgerPaths.workspaceIndexPath)}、${promptPathForWindow(controlWindowName, ledgerPaths.workspaceCurrentStatusPath)}、${promptPathForWindow(controlWindowName, path.resolve(workspaceRoot, group.controlDoc))}，以及 ${controllerSkillPath}。`,
    "",
    `先明确声明当前窗口定位：${controlWindowName} 总控；本轮职责：验收回跳 group，区分窗口自述、原始证据和总控裁决。`,
    "",
    "再按照当前总控文档和 controller skill 判断：接受、打回、补证、自测、创建下一阶段任务包、继续派发或停止等待用户确认。",
    "",
    "自动化补充：",
    `- dispatchGroup：${group.groupId}`,
    `- lastCompletedTarget：${completedTask.targetWindow}`,
    `- lastTaskId：${completedTask.taskId}`,
    `- controlPlan：${group.controlDoc}`,
    "- rules：用完即弃；group-status；controller-tick；证据通过且目标未完成时 resume-plan；仅异常诊断 audit-automation。",
    `- skill：${controllerSkillPath}`,
  ].join("\n");
}

function buildControllerReturnPayload(group, completedTask, registry) {
  const controllerEntry = activeRegistryEntry(registry, controlWindowName);
  if (!controllerEntry) {
    return {
      payload: null,
      reason: `No active ${controlWindowName} controller registry entry is available for controller return.`,
    };
  }
  const readiness = deliveryTargetReadiness(controllerEntry);
  if (!readiness.ready) {
    return {
      payload: null,
      reason: readiness.reason,
    };
  }
  const payload = {
    kind: "heartbeat",
    destination: "thread",
    targetThreadId: controllerEntry.threadId,
    name: "继续总控验收",
    rrule: heartbeatRrule,
    prompt: buildControllerReturnPrompt(group, completedTask),
    groupId: group.groupId,
    targetWindow: controlWindowName,
    controlDoc: group.controlDoc,
    cadence: heartbeatRrule,
    chainMode: "controller-return",
    controllerReturnAllowed: true,
  };
  return { payload, reason: "" };
}

function commandArm() {
  const taskId = getValue("--task");
  if (!taskId) {
    fail("arm requires --task.");
  }
  const { state, registry, queue } = readAll();
  if (state.mode !== "enabled") {
    fail("Visible dispatch mode is disabled; enable it before arming automation.");
  }
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    fail(`Task not found: ${taskId}`);
  }
  if (!["queued", "claimed"].includes(task.status)) {
    fail(`Task ${taskId} is ${task.status}; only queued/claimed tasks can be armed.`);
  }
  const { payload, reason } = buildArmPayload(task, registry);
  if (!payload) {
    fail(reason);
  }
  output({ ok: true, payload }, `Prepared arm payload for ${task.targetWindow} / ${taskId}.`);
}

function prepareArmBatch({ groupId, state, registry, queue, groups, staggerSeconds }) {
  if (state.mode !== "enabled") {
    fail("Visible dispatch mode is disabled; enable it before arming automation.");
  }
  const group = groups.groups.find((item) => item.groupId === groupId);
  if (!group) {
    fail(`Dispatch group not found: ${groupId}`);
  }
  const groupTasks = queue.tasks.filter((task) => task.groupId === groupId);
  const payloads = [];
  const skipped = [];
  for (const task of groupTasks) {
    if (!["queued", "claimed"].includes(task.status)) {
      skipped.push({ taskId: task.taskId, targetWindow: task.targetWindow, status: task.status });
      continue;
    }
    const { payload, reason } = buildArmPayload(task, registry);
    if (payload) {
      const createOrder = payloads.length + 1;
      const createDelaySeconds = (createOrder - 1) * staggerSeconds;
      payloads.push({
        taskId: task.taskId,
        targetWindow: task.targetWindow,
        createOrder,
        createDelaySeconds,
        waitBeforeCreateSeconds: createOrder === 1 ? 0 : staggerSeconds,
        payload,
      });
    } else {
      skipped.push({ taskId: task.taskId, targetWindow: task.targetWindow, status: task.status, reason });
    }
  }
  return {
    ok: skipped.length === 0,
    group,
    staggerSeconds,
    staggerInstructions:
      staggerSeconds > 0
        ? "Create payloads in createOrder order; wait waitBeforeCreateSeconds before each create after the first."
        : "No create-time stagger requested; payloads may be created back-to-back.",
    payloads,
    skipped,
  };
}

function commandArmBatch() {
  const groupId = sanitizeGroupId(getValue("--group"));
  const staggerSeconds = hasFlag("--no-stagger")
    ? 0
    : parseNonNegativeInteger(
        getValue("--stagger-seconds", String(defaultArmBatchStaggerSeconds)),
        "--stagger-seconds",
      );
  const { state, registry, queue, groups } = readAll();
  const result = prepareArmBatch({ groupId, state, registry, queue, groups, staggerSeconds });
  output(
    {
      ok: true,
      group: result.group,
      staggerSeconds: result.staggerSeconds,
      staggerInstructions: result.staggerInstructions,
      payloads: result.payloads,
      skipped: result.skipped,
    },
    [
      `Prepared ${result.payloads.length} arm payload(s) for dispatch group ${groupId}.`,
      `Create stagger: ${staggerSeconds}s between payloads.`,
      `Skipped: ${result.skipped.map((item) => `${item.taskId}:${item.reason ?? item.status}`).join(", ") || "none"}`,
    ].join("\n"),
  );
}

function commandStart({ restart = false, operation = restart ? "resume-plan" : "start-plan" } = {}) {
  if (!write) {
    fail(`${operation} requires --write.`);
  }
  const explicitPlan = getValue("--plan");
  const planPath = explicitPlan ? path.resolve(workspaceRoot, explicitPlan) : currentPlanPathFromIndex();
  if (!existsSync(planPath)) {
    fail(`Plan not found: ${relativeToWorkspace(planPath)}`);
  }
  const staggerSeconds = hasFlag("--no-stagger")
    ? 0
    : parseNonNegativeInteger(
        getValue("--stagger-seconds", String(defaultArmBatchStaggerSeconds)),
        "--stagger-seconds",
      );

  const state = readJson(files.state, defaultState());
  const keepAwake = startKeepAwake(state, { dryRun: false });
  const enabledAt = nowIso();
  const nextState = {
    ...state,
    mode: "enabled",
    loopEnabled: true,
    updatedAt: enabledAt,
    stopRequestedAt: null,
    disablePolicy: "",
    reason: restart ? "resume plan fast path" : "start plan fast path",
    keepAwake,
  };
  atomicWriteJson(files.state, nextState);

  let tick = buildControllerTickResult();
  const readyArmTask = tick.queueDecision?.tasks?.find((task) => task.nextAction === "arm" && task.groupId);
  const groupId = sanitizeGroupId(getValue("--group", readyArmTask?.groupId || defaultGroupIdForPlan(planPath)));
  const returnPolicy = validateReturnPolicy(getValue("--return-policy", "controller-last"));
  let enqueueResult = null;
  let armResult = null;
  let action = tick.topAction || "idle";

  if (tick.topAction === "wait" || tick.topAction === "review" || tick.topAction === "attention") {
    action = tick.topAction;
  } else {
    const missingCount = tick.missingSendEligibleWindowCount ?? tick.missingSendEligibleWindows?.length ?? 0;
    if (missingCount > 0) {
      enqueueResult = enqueueFromPlan({ planPath, groupId, returnPolicy, writeChanges: true });
      tick = buildControllerTickResult();
    }
    const all = readAll();
    const group = all.groups.groups.find((item) => item.groupId === groupId);
    if (group) {
      armResult = prepareArmBatch({
        groupId,
        state: all.state,
        registry: all.registry,
        queue: all.queue,
        groups: all.groups,
        staggerSeconds,
      });
      action = armResult.payloads.length > 0 ? "createHeartbeats" : tick.topAction || "idle";
    }
  }

  const skipped = armResult?.skipped ?? [];
  const ok = skipped.length === 0 && !(keepAwake.enabled && !keepAwake.active && keepAwake.lastError);
  const result = {
    ok,
    wrote: true,
    mode: "enabled",
    operation,
    restart,
    action,
    plan: relativeToWorkspace(planPath),
    groupId,
    returnPolicy,
    keepAwake,
    tick: {
      topAction: tick.topAction,
      nextAction: tick.nextAction,
      message: tick.message,
      sendEligibleWindowCount: tick.sendEligibleWindowCount,
      missingSendEligibleWindowCount: tick.missingSendEligibleWindowCount,
    },
    enqueue: enqueueResult
      ? {
          createdCount: enqueueResult.created.length,
          taskCount: enqueueResult.taskCount,
        }
      : null,
    arm: armResult
      ? {
          payloadCount: armResult.payloads.length,
          staggerSeconds: armResult.staggerSeconds,
          staggerInstructions: armResult.staggerInstructions,
          payloads: armResult.payloads,
          skipped,
        }
      : null,
    nextStep:
      armResult?.payloads.length > 0
        ? "Create each payload with codex_app.automation_update in createOrder order, then run the matching record-arm command."
        : action === "wait"
          ? "Do not create new automation; wait for the active target to claim or backfill."
          : action === "review"
            ? "Review completed backfill evidence before dispatching more work."
            : action === "attention"
              ? "Run diagnostic commands for the attention-needed task before continuing."
              : "No automation payload is needed right now.",
  };
  output(
    result,
    [
      `Visible dispatch ${operation} fast path: ${action}.`,
      `Mode: enabled; keep-awake=${keepAwake.active ? `active pid=${keepAwake.pid}` : keepAwake.message || "inactive"}`,
      `Plan: ${result.plan}`,
      `Group: ${groupId}`,
      `Payloads: ${armResult?.payloads.length ?? 0}`,
      `Skipped: ${skipped.map((item) => `${item.taskId}:${item.reason ?? item.status}`).join(", ") || "none"}`,
      result.nextStep,
    ].join("\n"),
  );
  if (!ok || action === "attention") {
    process.exitCode = 1;
  }
}

function commandRecordArm() {
  const taskId = getValue("--task");
  const automationId = getValue("--automation-id");
  if (!taskId || !automationId) {
    fail("record-arm requires --task and --automation-id.");
  }
  const queue = readJson(files.queue, defaultQueue());
  const runs = readJson(files.runs, defaultRuns());
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    fail(`Task not found: ${taskId}`);
  }
  if (!["queued", "claimed"].includes(task.status)) {
    fail(`Task ${taskId} is ${task.status}; only queued/claimed tasks can record arming.`);
  }
  const duplicate = runs.runs.find(
    (run) => run.taskId === taskId && run.automationId === automationId && run.status !== "stopped",
  );
  if (duplicate) {
    fail(`Automation ${automationId} is already recorded for ${taskId}.`);
  }

  const armedAt = nowIso();
  const leaseMinutes = parsePositiveInteger(getValue("--lease-minutes", "15"), "--lease-minutes");
  const run = {
    runId: `${taskId}__${automationId}`,
    taskId,
    targetWindow: task.targetWindow,
    automationId,
    status: getValue("--automation-status", "active"),
    createdAt: armedAt,
    controlDoc: task.controlDoc,
  };
  task.status = "armed";
  task.automationId = automationId;
  task.armedAt = armedAt;
  task.armLeaseUntil = new Date(Date.parse(armedAt) + leaseMinutes * 60 * 1000).toISOString();
  task.lastArmRunId = run.runId;
  queue.updatedAt = armedAt;
  runs.runs = [...runs.runs, run];
  runs.updatedAt = armedAt;
  if (write) {
    atomicWriteJson(files.queue, queue);
    atomicWriteJson(files.runs, runs);
  }
  output(
    { ok: true, wrote: write, task, run },
    `${write ? "Recorded" : "Would record"} automation ${automationId} for ${taskId}.`,
  );
}

function commandRecordReturn() {
  const groupId = sanitizeGroupId(getValue("--group"));
  const automationId = getValue("--automation-id");
  if (!automationId) {
    fail("record-return requires --automation-id.");
  }
  const groups = readJson(files.groups, defaultGroups());
  const runs = readJson(files.runs, defaultRuns());
  const group = groups.groups.find((item) => item.groupId === groupId);
  if (!group) {
    fail(`Dispatch group not found: ${groupId}`);
  }
  const activeControllerReturn = runs.runs.find(
    (run) => run.groupId === groupId && run.runType === "controller-return" && run.status !== "stopped",
  );
  if (activeControllerReturn) {
    fail(
      `Controller return automation ${activeControllerReturn.automationId} is already active for ${groupId}; stop it before recording another controller return.`,
    );
  }
  const duplicate = runs.runs.find(
    (run) => run.groupId === groupId && run.automationId === automationId && run.status !== "stopped",
  );
  if (duplicate) {
    fail(`Controller return automation ${automationId} is already recorded for ${groupId}.`);
  }
  const recordedAt = nowIso();
  const run = {
    runId: `${groupId}__controller-return__${automationId}`,
    taskId: `controller-return:${groupId}`,
    groupId,
    targetWindow: controlWindowName,
    automationId,
    status: "active",
    createdAt: recordedAt,
    controlDoc: group.controlDoc,
    runType: "controller-return",
  };
  group.controllerReturnAutomationId = automationId;
  group.controllerReturnRecordedAt = recordedAt;
  group.status = "return-armed";
  group.updatedAt = recordedAt;
  groups.updatedAt = recordedAt;
  runs.runs = [...runs.runs, run];
  runs.updatedAt = recordedAt;
  if (write) {
    atomicWriteJson(files.groups, groups);
    atomicWriteJson(files.runs, runs);
  }
  output(
    { ok: true, wrote: write, group, run },
    `${write ? "Recorded" : "Would record"} controller return automation ${automationId} for ${groupId}.`,
  );
}

function commandRecordStop() {
  const automationId = getValue("--automation-id");
  const taskId = getValue("--task");
  if (!automationId) {
    fail("record-stop requires --automation-id.");
  }

  const queue = readJson(files.queue, defaultQueue());
  const runs = readJson(files.runs, defaultRuns());
  const groups = readJson(files.groups, defaultGroups());
  const activeMatches = runs.runs.filter(
    (run) => run.automationId === automationId && (!taskId || run.taskId === taskId) && run.status !== "stopped",
  );
  const stoppedControllerMatches = runs.runs.filter(
    (run) =>
      run.automationId === automationId &&
      (!taskId || run.taskId === taskId) &&
      run.status === "stopped" &&
      run.runType === "controller-return" &&
      run.groupId,
  );
  if (activeMatches.length === 0 && stoppedControllerMatches.length === 0) {
    fail(`No active automation run found for ${automationId}${taskId ? ` / ${taskId}` : ""}.`);
  }

  const stoppedAt = nowIso();
  const reason = getValue("--reason", "");
  const touchedTaskIds = new Set(activeMatches.map((run) => run.taskId));
  for (const run of activeMatches) {
    run.previousStatus = run.status;
    run.status = "stopped";
    run.stoppedAt = stoppedAt;
    run.stopReason = reason;
  }
  for (const task of queue.tasks) {
    if (touchedTaskIds.has(task.taskId) && task.automationId === automationId) {
      task.automationStoppedAt = stoppedAt;
      task.automationStopReason = reason;
    }
  }
  const stoppedGroups = [];
  const controllerReturnStops = new Map(
    [...activeMatches, ...stoppedControllerMatches]
      .filter((run) => run.runType === "controller-return" && run.groupId)
      .map((run) => [
        run.groupId,
        {
          stoppedAt: run.stoppedAt || stoppedAt,
          reason: reason || run.stopReason || "",
        },
      ]),
  );
  for (const group of groups.groups) {
    const controllerStop = controllerReturnStops.get(group.groupId);
    if (!controllerStop || group.status === "returned") {
      continue;
    }
    group.previousStatus = group.status;
    group.status = "returned";
    group.controllerReturnStoppedAt = controllerStop.stoppedAt;
    group.controllerReturnStopReason = controllerStop.reason;
    group.updatedAt = stoppedAt;
    stoppedGroups.push(group);
  }
  if (activeMatches.length > 0) {
    queue.updatedAt = stoppedAt;
    runs.updatedAt = stoppedAt;
  }
  if (stoppedGroups.length > 0) {
    groups.updatedAt = stoppedAt;
  }
  if (write) {
    if (activeMatches.length > 0) {
      atomicWriteJson(files.queue, queue);
      atomicWriteJson(files.runs, runs);
    }
    if (stoppedGroups.length > 0) {
      atomicWriteJson(files.groups, groups);
    }
  }
  output(
    {
      ok: true,
      wrote: write,
      stoppedAt,
      stoppedRuns: activeMatches,
      alreadyStoppedControllerRuns: stoppedControllerMatches,
      stoppedGroups,
    },
    `${write ? "Recorded" : "Would record"} stopped automation ${automationId}.`,
  );
}

function taskById(queue) {
  return new Map(queue.tasks.map((task) => [task.taskId, task]));
}

function currentPlanRelativePathForAudit() {
  return relativeToWorkspace(currentPlanPathFromIndex());
}

function auditTargetAutomation({ run, queue, state, automationId, currentPlan, expectedWindow, expectedGroup, allowHistoric, allowTestWindow }) {
  const issues = [];
  const warnings = [];
  const task = taskById(queue).get(run.taskId);
  if (!task) {
    issues.push(`No queue task exists for run taskId ${run.taskId}.`);
    return { run, task: null, issues, warnings };
  }

  if (task.automationId !== automationId) {
    issues.push(`Task ${task.taskId} records automationId ${task.automationId || "(none)"} instead of ${automationId}.`);
  }
  if (task.targetWindow !== run.targetWindow) {
    issues.push(`Run target ${run.targetWindow} does not match task target ${task.targetWindow}.`);
  }
  if (expectedWindow && task.targetWindow !== expectedWindow) {
    issues.push(`Expected target window ${expectedWindow}, found ${task.targetWindow}.`);
  }
  if (expectedGroup && task.groupId !== expectedGroup) {
    issues.push(`Expected dispatch group ${expectedGroup}, found ${task.groupId || "(none)"}.`);
  }
  if (!allowHistoric && task.controlDoc !== currentPlan) {
    issues.push(`Task controlDoc ${task.controlDoc || "(none)"} does not match current plan ${currentPlan}.`);
  }
  if (task.targetWindow === testWindowName && !allowTestWindow) {
    issues.push(`${testWindowName} automation requires explicit total-control authorization; pass --allow-test-window only when the current plan permits it.`);
  }
  if (state.mode === "disabled") {
    issues.push("VAD mode is disabled; target-window automation must not remain scheduled.");
  }
  if (["accepted", "rejected", "blocked"].includes(task.status)) {
    issues.push(`Task ${task.taskId} is terminal (${task.status}) but its automation is still active.`);
  } else if (task.status === "completed") {
    issues.push(`Task ${task.taskId} is completed but its disposable wakeup is still active; it should have been deleted/record-stopped on receipt, so total control must review evidence and clean the residual run before acceptance.`);
  } else if (!["armed", "claimed", "running"].includes(task.status)) {
    issues.push(`Task ${task.taskId} is ${task.status}; active automation is only compliant for armed/claimed/running target tasks.`);
  }
  if (!task.automationClaimedAt && task.status === "claimed") {
    warnings.push(`Task ${task.taskId} is claimed but has no automationClaimedAt marker.`);
  }
  return { run, task: redactTaskForOutput(task), issues, warnings };
}

function auditControllerReturnAutomation({ run, queue, groups, automationId, currentPlan, expectedWindow, expectedGroup, allowHistoric }) {
  const issues = [];
  const warnings = [];
  if (run.targetWindow !== controlWindowName) {
    issues.push(`Controller-return run target must be ${controlWindowName}, found ${run.targetWindow}.`);
  }
  if (expectedWindow && expectedWindow !== controlWindowName) {
    issues.push(`Controller-return automation cannot target ${expectedWindow}.`);
  }
  const group = groups.groups.find((item) => item.groupId === run.groupId);
  if (!group) {
    issues.push(`No dispatch group exists for controller-return group ${run.groupId || "(none)"}.`);
    return { run, group: null, summary: null, issues, warnings };
  }
  if (expectedGroup && group.groupId !== expectedGroup) {
    issues.push(`Expected dispatch group ${expectedGroup}, found ${group.groupId}.`);
  }
  if (group.controllerReturnAutomationId !== automationId) {
    issues.push(`Group ${group.groupId} records controllerReturnAutomationId ${group.controllerReturnAutomationId || "(none)"} instead of ${automationId}.`);
  }
  if (!allowHistoric && group.controlDoc !== currentPlan) {
    issues.push(`Group controlDoc ${group.controlDoc || "(none)"} does not match current plan ${currentPlan}.`);
  }
  const summary = summarizeGroup(group, queue);
  if (!summary.terminal) {
    issues.push(`Controller return is armed before group ${group.groupId} is terminal.`);
  }
  if (group.status !== "return-armed") {
    issues.push(`Controller-return group ${group.groupId} status is ${group.status}; active controller-return automation expects return-armed.`);
  }
  return { run, group, summary, issues, warnings };
}

function commandAuditAutomation() {
  const automationId = getValue("--automation-id");
  if (!automationId) {
    fail("audit-automation requires --automation-id.");
  }
  const expectedWindow = getValue("--window", "");
  if (expectedWindow) {
    validateWindow(expectedWindow, { allowController: true });
  }
  const expectedGroup = getValue("--group", "");
  if (expectedGroup) {
    sanitizeGroupId(expectedGroup);
  }
  const expectedRole = getValue("--role", "");
  if (expectedRole && !["target", "controller-return"].includes(expectedRole)) {
    fail("--role must be target or controller-return.");
  }

  const { state, queue, runs, groups } = readAll();
  const currentPlan = currentPlanRelativePathForAudit();
  const allowHistoric = hasFlag("--allow-historic");
  const allowTestWindow = hasFlag("--allow-test-window") || hasFlag("--allow-alembic-test");
  const allMatches = runs.runs.filter((run) => run.automationId === automationId);
  const activeMatches = allMatches.filter((run) => run.status !== "stopped");
  const issues = [];
  const warnings = [];

  if (activeMatches.length === 0) {
    issues.push(`No active VAD automation run is recorded for ${automationId}.`);
  }
  if (activeMatches.length > 1) {
    issues.push(`Multiple active VAD automation runs are recorded for ${automationId}.`);
  }

  const audits = activeMatches.map((run) => {
    const actualRole = run.runType === "controller-return" ? "controller-return" : "target";
    if (expectedRole && actualRole !== expectedRole) {
      issues.push(`Expected automation role ${expectedRole}, found ${actualRole}.`);
    }
    const audit = actualRole === "controller-return"
      ? auditControllerReturnAutomation({
          run,
          queue,
          groups,
          automationId,
          currentPlan,
          expectedWindow,
          expectedGroup,
          allowHistoric,
        })
      : auditTargetAutomation({
          run,
          queue,
          state,
          automationId,
          currentPlan,
          expectedWindow,
          expectedGroup,
          allowHistoric,
          allowTestWindow,
        });
    issues.push(...audit.issues);
    warnings.push(...audit.warnings);
    return { role: actualRole, ...audit };
  });

  const compliant = issues.length === 0;
  const result = {
    ok: true,
    automationId,
    compliant,
    verdict: compliant ? "compliant" : "non_compliant",
    deleteRecommended: !compliant,
    currentPlan,
    mode: state.mode,
    loopEnabled: Boolean(state.loopEnabled),
    activeRunCount: activeMatches.length,
    stoppedRunCount: allMatches.length - activeMatches.length,
    issues,
    warnings,
    audits,
    deleteTool: !compliant ? { tool: "codex_app.automation_update", mode: "delete", id: automationId } : null,
    recordStopCommand: activeMatches.length > 0
      ? `node scripts/visible-dispatch.mjs record-stop --automation-id ${automationId} --write --reason "<reason>"`
      : null,
    recordStopNote: activeMatches.length > 0
      ? "After deleting the Codex automation, record the stop locally."
      : "No active local VAD run exists, so there is no local run to record-stop after deletion.",
    note: "This script judges local VAD compliance only. Total control performs the actual Codex automation deletion with codex_app.automation_update.",
  };

  output(
    result,
    [
      `Automation ${automationId}: ${result.verdict}`,
      `Delete recommended: ${result.deleteRecommended ? "yes" : "no"}`,
      `Issues: ${issues.join("; ") || "none"}`,
      `Warnings: ${warnings.join("; ") || "none"}`,
    ].join("\n"),
  );
  if (!compliant && hasFlag("--strict")) {
    process.exit(1);
  }
}

function summarizeGroup(group, queue) {
  const queueById = new Map(queue.tasks.map((task) => [task.taskId, task]));
  const declaredTaskIds = Array.isArray(group.taskIds) ? group.taskIds : [];
  const groupTasks =
    declaredTaskIds.length > 0
      ? declaredTaskIds.map((taskId) => queueById.get(taskId)).filter(Boolean)
      : queue.tasks.filter((task) => task.groupId === group.groupId);
  const missingTaskIds = declaredTaskIds.filter((taskId) => !queueById.has(taskId));
  const terminalStatuses = new Set(["completed", "accepted", "rejected", "blocked"]);
  const taskSummaries = groupTasks.map((task) => ({
    taskId: task.taskId,
    targetWindow: task.targetWindow,
    status: task.status,
    hasBackfill: hasBackfill(task),
    automationId: task.automationId ?? null,
    completedAt: task.completedAt ?? null,
  }));
  const unfinished = taskSummaries.filter((task) => !terminalStatuses.has(task.status));
  const completed = taskSummaries.filter((task) => task.status === "completed");
  const blocked = taskSummaries.filter((task) => task.status === "blocked");
  return {
    groupId: group.groupId,
    returnPolicy: group.returnPolicy,
    status: group.status,
    controlDoc: group.controlDoc,
    taskCount: taskSummaries.length,
    declaredTaskCount: declaredTaskIds.length || taskSummaries.length,
    missingTaskCount: missingTaskIds.length,
    missingTaskIds,
    completedCount: completed.length,
    blockedCount: blocked.length,
    unfinishedCount: unfinished.length,
    terminal: missingTaskIds.length === 0 && unfinished.length === 0 && taskSummaries.length > 0,
    tasks: taskSummaries,
  };
}

function commandGroupStatus() {
  const groupId = sanitizeGroupId(getValue("--group"));
  const { queue, groups } = readAll();
  const group = groups.groups.find((item) => item.groupId === groupId);
  if (!group) {
    fail(`Dispatch group not found: ${groupId}`);
  }
  const summary = summarizeGroup(group, queue);
  output(
    { ok: true, group: summary },
    [
      `Dispatch group ${groupId}`,
      `Return policy: ${summary.returnPolicy}`,
      `Tasks: ${summary.taskCount}, completed: ${summary.completedCount}, blocked: ${summary.blockedCount}, unfinished: ${summary.unfinishedCount}`,
      `Terminal: ${summary.terminal}`,
    ].join("\n"),
  );
}

function commandClaim() {
  const windowName = getValue("--window");
  if (!windowName) {
    fail("claim requires --window.");
  }
  validateWindow(windowName);
  const queue = readJson(files.queue, defaultQueue());
  const now = Date.now();
  const leaseMinutes = parsePositiveInteger(getValue("--lease-minutes", "30"), "--lease-minutes");
  const task = queue.tasks.find((item) => {
    if (item.targetWindow !== windowName) {
      return false;
    }
    if (item.status === "queued" || item.status === "armed") {
      return true;
    }
    if (["claimed", "running"].includes(item.status) && item.leaseUntil) {
      return Date.parse(item.leaseUntil) <= now;
    }
    return false;
  });
  if (!task) {
    output({ ok: true, wrote: false, claimed: null }, `No visible dispatch task available for ${windowName}.`);
    return;
  }
  const claimedAt = nowIso();
  task.status = "claimed";
  task.claim = { windowName, claimedAt };
  task.leaseUntil = new Date(now + leaseMinutes * 60 * 1000).toISOString();
  if (task.automationId) {
    task.automationClaimedAt = claimedAt;
  }
  queue.updatedAt = claimedAt;
  if (write) {
    atomicWriteJson(files.queue, queue);
  }
  output(
    { ok: true, wrote: write, claimed: task },
    `${write ? "Claimed" : "Would claim"} visible dispatch task ${task.taskId} for ${windowName}.`,
  );
}

function commandComplete() {
  const taskId = getValue("--task");
  if (!taskId) {
    fail("complete requires --task.");
  }
  const queue = readJson(files.queue, defaultQueue());
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    fail(`Task not found: ${taskId}`);
  }
  task.status = "completed";
  task.completedAt = nowIso();
  task.backfill = getValue("--backfill", task.backfill ?? "");
  queue.updatedAt = task.completedAt;
  if (write) {
    atomicWriteJson(files.queue, queue);
  }
  output({ ok: true, wrote: write, completed: task }, `${write ? "Completed" : "Would complete"} ${taskId}.`);
}

function commandBlock() {
  const taskId = getValue("--task");
  const reason = getValue("--reason");
  if (!taskId || !reason) {
    fail("block requires --task and --reason.");
  }
  const queue = readJson(files.queue, defaultQueue());
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    fail(`Task not found: ${taskId}`);
  }
  if (["accepted", "rejected"].includes(task.status)) {
    fail(`Task ${taskId} is ${task.status}; accepted/rejected tasks cannot be blocked.`);
  }
  const blockedAt = nowIso();
  task.previousStatus = task.status;
  task.status = "blocked";
  task.blockedAt = blockedAt;
  task.blockedReason = reason;
  queue.updatedAt = blockedAt;
  if (write) {
    atomicWriteJson(files.queue, queue);
  }
  output({ ok: true, wrote: write, blocked: task }, `${write ? "Blocked" : "Would block"} ${taskId}.`);
}

function readBackfillText() {
  const inline = getValue("--backfill", "");
  const file = getValue("--backfill-file");
  if (inline && file) {
    fail("Pass only one of --backfill or --backfill-file.");
  }
  if (file) {
    const resolved = path.resolve(workspaceRoot, file);
    ensureWorkspacePath(resolved, "backfill file");
    if (!existsSync(resolved)) {
      fail(`Backfill file not found: ${relativeToWorkspace(resolved)}`);
    }
    return readFileSync(resolved, "utf8").trim();
  }
  return inline.trim();
}

function selectCompletableTask(queue, windowName, taskId) {
  if (taskId) {
    const task = queue.tasks.find((item) => item.taskId === taskId);
    if (!task) {
      fail(`Task not found: ${taskId}`);
    }
    if (task.targetWindow !== windowName) {
      fail(`Task ${taskId} targets ${task.targetWindow}, not ${windowName}.`);
    }
    return task;
  }
  const active = queue.tasks.find(
    (task) => task.targetWindow === windowName && ["claimed", "running"].includes(task.status),
  );
  if (active) {
    return active;
  }
  return queue.tasks.find(
    (task) => task.targetWindow === windowName && ["armed", "queued"].includes(task.status),
  );
}

function buildFinishChain({ state, registry, queue, groups, completedTask, chainNext }) {
  if (!chainNext) {
    return {
      enabled: false,
      nextAction: "none",
      message: "No next automation payload generated because --chain-next was not provided.",
    };
  }
  if (state.mode !== "enabled") {
    return {
      enabled: true,
      nextAction: "modeDisabled",
      message: "Visible dispatch mode is disabled; completion is recorded but no next heartbeat payload is emitted.",
    };
  }
  if (completedTask.groupId) {
    const group = groups.groups.find((item) => item.groupId === completedTask.groupId);
    if (!group) {
      return {
        enabled: true,
        nextAction: "inspect",
        message: `Task ${completedTask.taskId} belongs to missing dispatch group ${completedTask.groupId}.`,
      };
    }
    if (group.returnPolicy === "controller-last") {
      const summary = summarizeGroup(group, queue);
      group.lastCompletedTaskId = completedTask.taskId;
      group.lastCompletedAt = completedTask.completedAt;
      group.updatedAt = nowIso();
      if (summary.missingTaskCount > 0) {
        group.status = "needs-inspection";
        return {
          enabled: true,
          nextAction: "inspect",
          handoffPolicy: "controller-last",
          message: `Dispatch group ${group.groupId} references missing task(s): ${summary.missingTaskIds.join(", ")}.`,
          group: summary,
        };
      }
      if (!summary.terminal) {
        group.status = "open";
        return {
          enabled: true,
          nextAction: "noReturn",
          handoffPolicy: "controller-last",
          message: `Dispatch group ${group.groupId} still has ${summary.unfinishedCount} unfinished task(s); do not return to total control yet.`,
          group: summary,
        };
      }
      if (group.status === "return-armed" || group.status === "returned") {
        return {
          enabled: true,
          nextAction: "review",
          handoffPolicy: "controller-return",
          message: `Dispatch group ${group.groupId} already has a recorded controller return; do not create another heartbeat.`,
          group: summary,
        };
      }
      const { payload, reason } = buildControllerReturnPayload(group, completedTask, registry);
      if (!payload) {
        group.status = "needs-controller-registration";
        return {
          enabled: true,
          nextAction: "registerController",
          handoffPolicy: "controller-last",
          message: reason,
          group: summary,
        };
      }
      group.status = summary.blockedCount > 0 ? "return-ready-with-blockers" : "return-ready";
      group.returnReadyAt = nowIso();
      return {
        enabled: true,
        nextAction: "returnToController",
        handoffPolicy: "controller-return",
        message: `Dispatch group ${group.groupId} is terminal; create exactly one controller-return heartbeat.`,
        group: summary,
        payload,
        recordReturnCommand: scriptCommandForWindow(
          completedTask.targetWindow,
          `record-return --group ${group.groupId} --automation-id <automation-id> --write`,
        ),
      };
    }
  }
  const activeWindows = activeWindowSet(registry);
  const nowMs = Date.now();
  const classified = queue.tasks.map((task) => ({
    taskId: task.taskId,
    targetWindow: task.targetWindow,
    status: task.status,
    ...classifyTaskForTick(task, state, activeWindows, nowMs),
  }));
  const blockers = classified.filter(
    (task) =>
      task.taskId !== completedTask.taskId &&
      task.status !== "queued" &&
      (task.waitState === "attention" || task.waitState === "blocked") &&
      !(task.status === "completed" && task.nextAction === "acceptanceReview"),
  );
  if (blockers.length > 0) {
    return {
      enabled: true,
      nextAction: blockers[0].nextAction,
      message: `Queue needs attention before chaining: ${blockers[0].message}`,
      blockingTask: blockers[0],
    };
  }
  const nextQueued = queue.tasks.find((task) => task.status === "queued");
  if (!nextQueued) {
    const waiting = classified.find((task) => task.waitState === "waiting");
    return {
      enabled: true,
      nextAction: waiting ? "wait" : "review",
      message: waiting
        ? "Another task is already active; no new payload was generated."
        : "No queued task remains; completed tasks still require total-control acceptance.",
    };
  }
  if (totalControlArmOnlyTargets.has(nextQueued.targetWindow) && completedTask.targetWindow !== nextQueued.targetWindow) {
    return {
      enabled: true,
      nextAction: "controllerArm",
      handoffPolicy: "total-control-only",
      message: `Next queued task targets ${nextQueued.targetWindow}; previous target window must not create this heartbeat. Total control should arm the next task.`,
      taskId: nextQueued.taskId,
      targetWindow: nextQueued.targetWindow,
      armCommand: scriptCommandForWindow(controlWindowName, `arm --task ${nextQueued.taskId} --json`),
      recordArmCommand: scriptCommandForWindow(
        controlWindowName,
        `record-arm --task ${nextQueued.taskId} --automation-id <automation-id> --write`,
      ),
    };
  }
  const { payload, reason } = buildArmPayload(nextQueued, registry);
  if (!payload) {
    return {
      enabled: true,
      nextAction: "registerWindow",
      message: reason,
      taskId: nextQueued.taskId,
      targetWindow: nextQueued.targetWindow,
    };
  }
  return {
    enabled: true,
    nextAction: "armNext",
    handoffPolicy: "target-courier",
    message: `Next queued task can be armed for ${nextQueued.targetWindow}.`,
    taskId: nextQueued.taskId,
    targetWindow: nextQueued.targetWindow,
    payload: { ...payload, courierAllowed: true },
    recordArmCommand: scriptCommandForWindow(
      completedTask.targetWindow,
      `record-arm --task ${nextQueued.taskId} --automation-id <automation-id> --write`,
    ),
  };
}

function commandFinish() {
  const windowName = getValue("--window");
  if (!windowName) {
    fail("finish requires --window.");
  }
  validateWindow(windowName);
  const backfill = readBackfillText();
  if (!backfill) {
    fail("finish requires non-empty --backfill or --backfill-file evidence.");
  }

  const state = readJson(files.state, defaultState());
  const registry = readJson(files.registry, defaultRegistry());
  const queue = readJson(files.queue, defaultQueue());
  const groups = readJson(files.groups, defaultGroups());
  const threadId = getValue("--thread");
  const finishedAt = nowIso();

  if (threadId) {
    validateThreadId(threadId);
    registry.windows = registry.windows.filter((item) => item.windowName !== windowName);
    registry.windows.push({
      windowName,
      threadId: threadId.trim(),
      cwd: getValue("--cwd", ""),
      role: getValue("--role", windowName),
      status: "active",
      source: "finish",
      lastSeenAt: finishedAt,
    });
    registry.updatedAt = finishedAt;
  }

  const task = selectCompletableTask(queue, windowName, getValue("--task"));
  if (!task) {
    fail(`No queued, armed, claimed, or running task is available for ${windowName}.`);
  }
  if (!["queued", "armed", "claimed", "running"].includes(task.status)) {
    fail(`Task ${task.taskId} is ${task.status}; finish can only complete queued, armed, claimed, or running tasks.`);
  }

  const previousStatus = task.status;
  if (["queued", "armed"].includes(task.status)) {
    task.claim = { windowName, claimedAt: finishedAt };
    if (task.automationId) {
      task.automationClaimedAt = finishedAt;
    }
  }
  task.previousStatus = previousStatus;
  task.status = "completed";
  task.completedAt = finishedAt;
  task.completedByThreadId = threadId || task.completedByThreadId || "";
  task.completionSource = "finish";
  task.backfill = backfill;
  queue.updatedAt = finishedAt;

  const chain = buildFinishChain({
    state,
    registry,
    queue,
    groups,
    completedTask: task,
    chainNext: hasFlag("--chain-next"),
  });

  if (write) {
    if (threadId) {
      atomicWriteJson(files.registry, registry);
    }
    atomicWriteJson(files.queue, queue);
    if (task.groupId) {
      groups.updatedAt = finishedAt;
      atomicWriteJson(files.groups, groups);
    }
  }

  output(
    { ok: true, wrote: write, registeredThread: Boolean(threadId), completed: redactTaskForOutput(task), chain },
    [
      `${write ? "Finished" : "Would finish"} ${task.taskId} for ${windowName}.`,
      `Previous status: ${previousStatus}`,
      `Chain next action: ${chain.nextAction}`,
      chain.message,
    ].join("\n"),
  );
}

function hasBackfill(task) {
  if (typeof task.backfill === "string") {
    return task.backfill.trim().length > 0;
  }
  return Boolean(task.backfill);
}

function activeWindowSet(registry) {
  return new Set(
    registry.windows
      .filter((entry) => entry.status === "active" && deliveryTargetReadiness(entry).ready)
      .map((entry) => entry.windowName),
  );
}

function classifyTaskForTick(task, state, activeWindows, nowMs, groupSummaries = new Map()) {
  if (task.status === "queued") {
    if (state.mode !== "enabled") {
      return {
        waitState: "paused",
        nextAction: "modeDisabled",
        message: "Loop is disabled; do not arm automation.",
      };
    }
    if (!activeWindows.has(task.targetWindow)) {
      return {
        waitState: "blocked",
        nextAction: "registerWindow",
        message: `No active registry entry for ${task.targetWindow}.`,
      };
    }
    return {
      waitState: "ready",
      nextAction: "arm",
      message: "Task is queued and target window is registered.",
    };
  }

  if (task.status === "armed") {
    if (task.automationStoppedAt) {
      const leaseMs = Date.parse(task.armLeaseUntil ?? "");
      if (
        task.automationStopReason === "target received" &&
        state.mode === "enabled" &&
        Number.isFinite(leaseMs) &&
        leaseMs > nowMs
      ) {
        return {
          waitState: "waiting",
          nextAction: "waitForClaim",
          message: `Automation ${task.automationId ?? "(unknown)"} was received and disposed; waiting for target window claim until ${task.armLeaseUntil}.`,
        };
      }
      return {
        waitState: "attention",
        nextAction: "reviewStopped",
        message: `Automation ${task.automationId ?? "(unknown)"} was stopped before claim; total control should requeue, block, or close the task.`,
      };
    }
    if (state.mode !== "enabled") {
      return {
        waitState: "attention",
        nextAction: "stopAutomation",
        message: "Task has an armed automation while the loop is disabled.",
      };
    }
    if (!task.automationId) {
      return {
        waitState: "attention",
        nextAction: "recordArm",
        message: "Task is armed but has no recorded automationId.",
      };
    }
    const leaseMs = Date.parse(task.armLeaseUntil ?? "");
    if (!Number.isFinite(leaseMs)) {
      return {
        waitState: "attention",
        nextAction: "repairArmLease",
        message: "Task is armed but has no valid armLeaseUntil.",
      };
    }
    if (leaseMs <= nowMs) {
      return {
        waitState: "attention",
        nextAction: "markStale",
        message: `Armed automation was not claimed before ${task.armLeaseUntil}.`,
      };
    }
    return {
      waitState: "waiting",
      nextAction: "waitForClaim",
      message: `Automation ${task.automationId} is armed; waiting for target window claim until ${task.armLeaseUntil}.`,
    };
  }

  if (task.status === "claimed" || task.status === "running") {
    const leaseMs = Date.parse(task.leaseUntil ?? "");
    if (!Number.isFinite(leaseMs)) {
      return {
        waitState: "attention",
        nextAction: "repairLease",
        message: "Task is active but has no valid leaseUntil.",
      };
    }
    if (leaseMs <= nowMs) {
      return {
        waitState: "attention",
        nextAction: "markStale",
        message: `Lease expired at ${task.leaseUntil}.`,
      };
    }
    return {
      waitState: "waiting",
      nextAction: "wait",
      message: `Lease active until ${task.leaseUntil}.`,
    };
  }

  if (task.status === "stale") {
    return {
      waitState: "attention",
      nextAction: "reviewStale",
      message: "Task lease expired earlier; total control should review or requeue.",
    };
  }

  if (task.status === "completed") {
    const groupSummary = task.groupId ? groupSummaries.get(task.groupId) : null;
    if (groupSummary?.returnPolicy === "controller-last" && !groupSummary.terminal) {
      return {
        waitState: "waiting",
        nextAction: "waitForGroup",
        message: `Task is complete, but dispatch group ${groupSummary.groupId} still has ${groupSummary.unfinishedCount} unfinished task(s); wait for the final target before total-control review.`,
      };
    }
    if (hasBackfill(task)) {
      return {
        waitState: "ready",
        nextAction: "acceptanceReview",
        message: "Task has completion backfill and is ready for total-control acceptance.",
      };
    }
    return {
      waitState: "attention",
      nextAction: "requestBackfill",
      message: "Task is completed but has no backfill evidence.",
    };
  }

  if (task.status === "blocked") {
    return {
      waitState: "blocked",
      nextAction: "resolveBlocker",
      message: "Task is blocked by the target window.",
    };
  }

  if (task.status === "accepted") {
    return {
      waitState: "done",
      nextAction: "none",
      message: "Task was accepted by total control.",
    };
  }

  if (task.status === "rejected") {
    return {
      waitState: "attention",
      nextAction: "followUp",
      message: "Task was rejected by total control and needs follow-up.",
    };
  }

  return {
    waitState: "attention",
    nextAction: "inspect",
    message: `Unknown task status: ${task.status}`,
  };
}

function commandTick() {
  const { state, registry, queue, groups } = readAll();
  const observedAt = nowIso();
  const nowMs = Date.parse(observedAt);
  const activeWindows = activeWindowSet(registry);
  const groupSummaries = groupSummariesById(groups, queue);
  let changed = false;
  const tasks = queue.tasks.map((task) => {
    const summary = classifyTaskForTick(task, state, activeWindows, nowMs, groupSummaries);
    if (write && summary.nextAction === "markStale") {
      task.previousStatus = task.status;
      task.status = "stale";
      task.staleAt = observedAt;
      changed = true;
      return {
        taskId: task.taskId,
        targetWindow: task.targetWindow,
        status: task.status,
        previousStatus: task.previousStatus,
        ...classifyTaskForTick(task, state, activeWindows, nowMs, groupSummaries),
      };
    }
    return {
      taskId: task.taskId,
      targetWindow: task.targetWindow,
      status: task.status,
      leaseUntil: task.leaseUntil ?? null,
      armLeaseUntil: task.armLeaseUntil ?? null,
      automationId: task.automationId ?? null,
      hasBackfill: hasBackfill(task),
      ...summary,
    };
  });

  if (write && changed) {
    queue.updatedAt = observedAt;
    atomicWriteJson(files.queue, queue);
  }

  const waitCounts = tasks.reduce((acc, task) => {
    acc[task.waitState] = (acc[task.waitState] ?? 0) + 1;
    return acc;
  }, {});
  const actionCounts = tasks.reduce((acc, task) => {
    acc[task.nextAction] = (acc[task.nextAction] ?? 0) + 1;
    return acc;
  }, {});
  const topAction = tasks.some((task) => task.nextAction === "stopAutomation")
    ? "cleanup"
    : tasks.some((task) => task.nextAction === "acceptanceReview")
      ? "review"
      : tasks.some((task) => task.waitState === "attention" || task.waitState === "blocked")
          ? "attention"
          : state.mode !== "enabled"
            ? "stopped"
            : tasks.some((task) => task.waitState === "waiting")
              ? "wait"
              : state.mode === "enabled" && tasks.some((task) => task.nextAction === "arm")
                ? "arm"
                : "wait";

  output(
    {
      ok: true,
      wrote: write && changed,
      observedAt,
      mode: state.mode,
      loopEnabled: Boolean(state.loopEnabled),
      activeWindows: [...activeWindows],
      topAction,
      waitCounts,
      actionCounts,
      tasks,
    },
    [
      "Visible dispatch tick",
      `Mode: ${state.mode}`,
      `Top action: ${topAction}`,
      `Tasks: ${tasks.length}`,
      `Wait states: ${Object.entries(waitCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
      `Actions: ${Object.entries(actionCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
      changed && write ? "Marked expired active tasks as stale." : "No persistent tick changes.",
    ].join("\n"),
  );
}

function commandAccept() {
  const taskId = getValue("--task");
  if (!taskId) {
    fail("accept requires --task.");
  }
  const verdict = getValue("--verdict", "accepted");
  if (!["accepted", "rejected"].includes(verdict)) {
    fail("--verdict must be accepted or rejected.");
  }
  const queue = readJson(files.queue, defaultQueue());
  const runs = readJson(files.runs, defaultRuns());
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    fail(`Task not found: ${taskId}`);
  }
  if (task.status !== "completed") {
    fail(`Task ${taskId} is ${task.status}; only completed tasks can be accepted or rejected.`);
  }
  if (verdict === "accepted" && !hasBackfill(task)) {
    fail(`Task ${taskId} has no backfill evidence; reject it or request backfill before accepting.`);
  }
  const activeRuns = runs.runs.filter((run) => run.taskId === taskId && run.status !== "stopped");
  if (verdict === "accepted" && activeRuns.length > 0 && !hasFlag("--allow-active-automation")) {
    fail(
      `Task ${taskId} still has active automation run(s): ${activeRuns.map((run) => run.automationId).join(", ")}. Disposable wakeups should be deleted/record-stopped on receipt; clean active runs before accepting, or pass --allow-active-automation with a reason.`,
    );
  }

  const decidedAt = nowIso();
  task.status = verdict;
  task.acceptance = {
    verdict,
    decidedAt,
    note: getValue("--note", ""),
  };
  if (verdict === "accepted") {
    task.acceptedAt = decidedAt;
  } else {
    task.rejectedAt = decidedAt;
  }
  queue.updatedAt = decidedAt;
  if (write) {
    atomicWriteJson(files.queue, queue);
  }
  output(
    { ok: true, wrote: write, task: redactTaskForOutput(task), activeRuns },
    `${write ? "Recorded" : "Would record"} total-control ${verdict} verdict for ${taskId}.`,
  );
}

function commandCleanup() {
  const { state, queue, runs } = readAll();
  const now = Date.now();
  const staleTasks = queue.tasks.filter((task) => {
    if (["claimed", "running"].includes(task.status) && task.leaseUntil) {
      return Date.parse(task.leaseUntil) <= now;
    }
    if (task.status === "armed" && task.automationStoppedAt) {
      return false;
    }
    if (task.status === "armed" && task.armLeaseUntil) {
      return Date.parse(task.armLeaseUntil) <= now;
    }
    return false;
  });
  const stoppedAutomationTasks = queue.tasks.filter((task) => task.status === "armed" && task.automationStoppedAt);
  const activeAutomationRuns = runs.runs.filter((run) => run.status !== "stopped");
  const shouldStop = state.mode === "disabled";
  const result = {
    ok: true,
    wrote: write,
    mode: state.mode,
    shouldStop,
    staleTasks: staleTasks.map((task) => task.taskId),
    stoppedAutomationTasks: stoppedAutomationTasks.map((task) => task.taskId),
    activeAutomationRuns: activeAutomationRuns.map((run) => ({
      runId: run.runId,
      taskId: run.taskId,
      targetWindow: run.targetWindow,
      automationId: run.automationId,
    })),
    automationRuns: runs.runs.length,
  };
  output(
    result,
    [
      `Visible dispatch cleanup ${write ? "checked" : "dry-run"}.`,
      `Mode: ${state.mode}`,
      `Stop arming new automation: ${shouldStop}`,
      `Stale claimed tasks: ${result.staleTasks.join(", ") || "none"}`,
      `Stopped automation tasks: ${result.stoppedAutomationTasks.join(", ") || "none"}`,
      `Active automation runs: ${result.activeAutomationRuns.map((run) => run.automationId).join(", ") || "none"}`,
      "Note: actual Codex automation deletion is performed by total control with codex_app.automation_update.",
    ].join("\n"),
  );
}

function commandPruneHistory() {
  const queue = readJson(files.queue, defaultQueue());
  const runs = readJson(files.runs, defaultRuns());
  const groups = readJson(files.groups, defaultGroups());
  const currentPlanPath = relativeToWorkspace(currentPlanPathFromIndex());
  const includeCurrentAccepted = hasFlag("--include-current-accepted");
  const terminalHistoricStatuses = new Set(["accepted", "rejected", "blocked"]);
  const activeRunTaskIds = new Set(
    runs.runs.filter((run) => run.status !== "stopped").map((run) => run.taskId),
  );
  const prunableTasks = queue.tasks.filter(
    (task) =>
      task.controlDoc &&
      terminalHistoricStatuses.has(task.status) &&
      (task.controlDoc !== currentPlanPath || (includeCurrentAccepted && task.status === "accepted")) &&
      !activeRunTaskIds.has(task.taskId),
  );
  const prunableTaskIds = new Set(prunableTasks.map((task) => task.taskId));
  const prunableRuns = runs.runs.filter((run) => prunableTaskIds.has(run.taskId) && run.status === "stopped");
  const skippedHistoricActiveTasks = queue.tasks.filter(
    (task) =>
      task.controlDoc &&
      terminalHistoricStatuses.has(task.status) &&
      (task.controlDoc !== currentPlanPath || (includeCurrentAccepted && task.status === "accepted")) &&
      activeRunTaskIds.has(task.taskId),
  );
  const remainingTaskIdsAfterPrune = new Set(
    queue.tasks.filter((task) => !prunableTaskIds.has(task.taskId)).map((task) => task.taskId),
  );
  const activeRunGroupIds = new Set(
    runs.runs.filter((run) => run.groupId && run.status !== "stopped").map((run) => run.groupId),
  );
  const prunableGroups = groups.groups.filter((group) => {
    if (
      !group.controlDoc ||
      (group.controlDoc === currentPlanPath && !includeCurrentAccepted) ||
      activeRunGroupIds.has(group.groupId)
    ) {
      return false;
    }
    const taskIds = Array.isArray(group.taskIds) ? group.taskIds : [];
    return taskIds.length > 0 && taskIds.every((taskId) => !remainingTaskIdsAfterPrune.has(taskId));
  });
  const prunableGroupIds = new Set(prunableGroups.map((group) => group.groupId));
  const prunableGroupRuns = runs.runs.filter(
    (run) => run.groupId && prunableGroupIds.has(run.groupId) && run.status === "stopped",
  );
  const prunableRunIds = new Set([...prunableRuns, ...prunableGroupRuns].map((run) => run.runId));

  if (write && prunableTasks.length > 0) {
    queue.tasks = queue.tasks.filter((task) => !prunableTaskIds.has(task.taskId));
    queue.updatedAt = nowIso();
    atomicWriteJson(files.queue, queue);
  }
  if (write && prunableRunIds.size > 0) {
    runs.runs = runs.runs.filter((run) => !prunableRunIds.has(run.runId));
    runs.updatedAt = nowIso();
    atomicWriteJson(files.runs, runs);
  }
  if (write && prunableGroups.length > 0) {
    groups.groups = groups.groups.filter((group) => !prunableGroupIds.has(group.groupId));
    groups.updatedAt = nowIso();
    atomicWriteJson(files.groups, groups);
  }

  output(
    {
      ok: true,
      wrote: write,
      currentPlan: currentPlanPath,
      includeCurrentAccepted,
      prunedTasks: prunableTasks.map((task) => ({
        taskId: task.taskId,
        targetWindow: task.targetWindow,
        status: task.status,
        controlDoc: task.controlDoc,
        automationId: task.automationId ?? null,
      })),
      prunedStoppedAutomationRuns: prunableRuns.map((run) => ({
        runId: run.runId,
        taskId: run.taskId,
        targetWindow: run.targetWindow,
        automationId: run.automationId,
      })),
      prunedGroups: prunableGroups.map((group) => ({
        groupId: group.groupId,
        status: group.status,
        controlDoc: group.controlDoc,
      })),
      prunedStoppedControllerRuns: prunableGroupRuns.map((run) => ({
        runId: run.runId,
        groupId: run.groupId,
        targetWindow: run.targetWindow,
        automationId: run.automationId,
      })),
      skippedHistoricActiveTasks: skippedHistoricActiveTasks.map((task) => ({
        taskId: task.taskId,
        targetWindow: task.targetWindow,
        status: task.status,
        controlDoc: task.controlDoc,
        automationId: task.automationId ?? null,
      })),
      remainingTaskCount: write ? queue.tasks.length : queue.tasks.length - prunableTasks.length,
    },
    [
      `Visible dispatch history prune ${write ? "applied" : "dry-run"}.`,
      `Current plan: ${currentPlanPath}`,
      `Include current accepted tasks: ${includeCurrentAccepted}`,
      `Prunable historic terminal tasks: ${prunableTasks.map((task) => task.taskId).join(", ") || "none"}`,
      `Prunable stopped automation runs: ${[...prunableRuns, ...prunableGroupRuns].map((run) => run.automationId).join(", ") || "none"}`,
      `Prunable dispatch groups: ${prunableGroups.map((group) => group.groupId).join(", ") || "none"}`,
      `Skipped historic tasks with active runs: ${skippedHistoricActiveTasks.map((task) => task.taskId).join(", ") || "none"}`,
    ].join("\n"),
  );
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    console.log(helpText);
    break;
  case "status":
    commandStatus();
    break;
  case "init":
    commandInit();
    break;
  case "mode":
    commandMode();
    break;
  case "start-plan":
    commandStart({ restart: false, operation: "start-plan" });
    break;
  case "resume-plan":
    commandStart({ restart: true, operation: "resume-plan" });
    break;
  case "stop-plan":
    commandStopPlan();
    break;
  case "keep-awake-worker":
    commandKeepAwakeWorker();
    break;
  case "register":
    commandRegister();
    break;
  case "unregister":
    commandUnregister();
    break;
  case "preflight":
    commandPreflight();
    break;
  case "enqueue":
    commandEnqueue();
    break;
  case "arm":
    commandArm();
    break;
  case "arm-batch":
    commandArmBatch();
    break;
  case "record-arm":
    commandRecordArm();
    break;
  case "record-return":
    commandRecordReturn();
    break;
  case "record-stop":
    commandRecordStop();
    break;
  case "claim":
    commandClaim();
    break;
  case "complete":
    commandComplete();
    break;
  case "block":
    commandBlock();
    break;
  case "finish":
    commandFinish();
    break;
  case "group-status":
    commandGroupStatus();
    break;
  case "tick":
    commandTick();
    break;
  case "controller-tick":
    commandControllerTick();
    break;
  case "post-run-audit":
    commandPostRunAudit();
    break;
  case "audit-automation":
    commandAuditAutomation();
    break;
  case "accept":
    commandAccept();
    break;
  case "cleanup":
    commandCleanup();
    break;
  case "prune-history":
    commandPruneHistory();
    break;
  default:
    fail(`Unknown visible-dispatch command: ${command}\n\n${helpText}`);
}
