#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "status";
const options = args[0] && !args[0].startsWith("--") ? args.slice(1) : args;
const workspaceRoot = path.resolve(getValue("--root", process.cwd()));
const stateDir = path.resolve(getValue("--state-dir", path.join(workspaceRoot, ".workspace-local/codex-automation-loop")));
const write = hasFlag("--write");
const json = hasFlag("--json");
const version = 1;
const threadRegistrationVersion = 2;
const deliveryEnvelopeVersion = 2;
const windowConfigVersion = 1;
const deliveryRunVersion = 1;
const keepLiveVersion = 1;

const dirs = {
  packets: path.join(stateDir, "dispatch-packets"),
  deliveries: path.join(stateDir, "delivery-envelopes"),
  deliveryRuns: path.join(stateDir, "delivery-runs"),
  results: path.join(stateDir, "target-results"),
  registry: path.join(stateDir, "thread-registry"),
  windowConfig: path.join(stateDir, "window-config"),
  keepLive: path.join(stateDir, "keep-live"),
};

const helpText = `
Codex automation closed-loop contract manager

Usage:
  node scripts/codex-automation-loop.mjs status [--json]
  node scripts/codex-automation-loop.mjs register-thread --window <name> --thread-id <id> [--role target|controller|test-target|design|observer] [--cwd <path>] [--responsibility-root <path>] [--display-title <title>] [--write-boundary <path>...] [--canonical-use <text>] [--supersedes-window <name>...] --write [--json]
  node scripts/codex-automation-loop.mjs build-window-config --window <name> [--busy-policy append-if-steerable|fail-if-busy] [--require-thread] --write [--json]
  node scripts/codex-automation-loop.mjs create-dispatch --target-window <name> --task-id <id> --control-plan <path> --objective <text> [--prompt <text>|--prompt-file <path>] [--group <id>] [--context-policy assumed-current|refresh-if-missing|force-refresh] [--scope <text>...] [--forbidden <text>...] [--evidence <text>...] [--write] [--json]
  node scripts/codex-automation-loop.mjs build-delivery --packet-file <path> [--delivery-id <id>] [--return-route controller|none] [--busy-policy append-if-steerable|fail-if-busy] [--automation-enabled] [--require-thread] [--write] [--json]
  node scripts/codex-automation-loop.mjs build-controller-return --group <id> --last-completed-target <window> --last-task-id <taskId> --control-plan <path> [--controller-window <name>] [--busy-policy append-if-steerable|fail-if-busy] [--automation-enabled] [--require-thread] [--write] [--json]
  node scripts/codex-automation-loop.mjs record-delivery-run --delivery-file <path> --status sent|blocked|failed [--host-method send_message_to_thread] [--host-mode new-turn|append-to-active-turn|unknown] [--readback-ok true|false] [--evidence <text>] [--error <text>] --write [--json]
  node scripts/codex-automation-loop.mjs keep-live-state --automation-run-id <id> --status running|stopped|failed [--mechanism macos-caffeinate|manual|none] [--pid <pid>] [--error <text>] --write [--json]
  node scripts/codex-automation-loop.mjs submit-result --target-window <name> --task-id <id> --status completed|blocked|needs-review [--group <id>] [--changed-repo <repo>...] [--commit <hash>...] [--evidence-ref <ref>...] [--verification <text>...] [--risk <text>...] [--next-suggestion <text>] [--write] [--json]
  node scripts/codex-automation-loop.mjs review-results (--group <id>|--task-id <id>) [--json]
  node scripts/codex-automation-loop.mjs stop-loop --reason <text> --write [--json]

Design:
  This script is the new CodexAutomationClosedLoop contract surface. It does
  not parse current plans, decide sendable windows, claim target work, create
  legacy Codex automations, or accept evidence. Total control creates dispatch
  packets and later reviews raw evidence. Delivery adapters only consume the
  delivery envelope. Target windows return result envelopes.
`.trim();

class CliExit extends Error {}

function hasFlag(name) {
  return options.includes(name);
}

function getValue(name, fallback = null) {
  const eq = options.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
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

function slug(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function output(payload, textLines = []) {
  const complete = { scriptComplete: true, ...payload };
  if (!complete.agentNext) {
    complete.agentNext = inferAgentNext(complete);
  }
  if (json) {
    console.log(JSON.stringify(complete, null, 2));
    return;
  }
  for (const line of textLines) {
    console.log(line);
  }
  if (complete.agentNext) {
    console.log(`Agent next: ${complete.agentNext}`);
  }
}

function inferAgentNext(payload) {
  if (!payload.ok) return "Stop and inspect the reported closed-loop contract issue.";
  if (payload.command === "create-dispatch") return "Build a delivery envelope from the dispatch packet or queue it for the delivery adapter.";
  if (payload.command === "register-thread") return "Build or refresh the local window config, then build delivery envelopes when total control decides to dispatch.";
  if (payload.command === "build-window-config") return "Use this child-window config when creating direct-thread delivery envelopes.";
  if (payload.command === "build-delivery") return payload.threadReady ? "Send the prompt with the host thread tool, then record a delivery run." : "Register the target thread before direct-thread delivery.";
  if (payload.command === "build-controller-return") return payload.threadReady ? "Send the controller-return prompt with the host thread tool, then record a delivery run." : "Register the controller thread before unattended return.";
  if (payload.command === "record-delivery-run") return payload.status === "sent" ? "Wait for the target result envelope or run review-results when ready." : "Return to total control judgment for the delivery block.";
  if (payload.command === "keep-live-state") return "Continue or stop unattended automation according to the current plan and keep-live status.";
  if (payload.command === "submit-result") return "Wake total control or run review-results; the result is not an acceptance verdict.";
  if (payload.command === "review-results") return payload.decision === "wait" ? "Wait for missing target result envelopes." : "Total control must pull raw evidence and make the verdict.";
  if (payload.command === "stop-loop") return "Closed-loop delivery is stopped; do not create new deliveries.";
  return "Continue by total-control judgment.";
}

function fail(message) {
  output({ ok: false, command, error: message });
  process.exitCode = 1;
  throw new CliExit(message);
}

function ensureInsideWorkspace(file, label) {
  const relative = path.relative(workspaceRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`${label} must stay inside workspace: ${file}`);
  }
}

function ensureStateDirs() {
  for (const dir of Object.values(dirs)) {
    mkdirSync(dir, { recursive: true });
  }
}

function atomicWriteJson(file, value) {
  ensureInsideWorkspace(file, "closed-loop state");
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temp, file);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
}

function readJson(file, label = "JSON file") {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Invalid ${label} ${file}: ${error.message}`);
  }
}

function resolveInputPath(value, label) {
  if (!value) fail(`${label} is required.`);
  const file = path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
  if (!existsSync(file)) fail(`${label} does not exist: ${value}`);
  return file;
}

function packetFileFor(packetId) {
  return path.join(dirs.packets, `${slug(packetId)}.json`);
}

function deliveryFileFor(deliveryId) {
  return path.join(dirs.deliveries, `${slug(deliveryId)}.json`);
}

function deliveryRunFileFor(deliveryRunId) {
  return path.join(dirs.deliveryRuns, `${slug(deliveryRunId)}.json`);
}

function threadFileFor(windowName) {
  return path.join(dirs.registry, `${slug(windowName)}.json`);
}

function windowConfigFileFor(windowName) {
  return path.join(dirs.windowConfig, `${slug(windowName)}.json`);
}

function keepLiveStateFile() {
  return path.join(dirs.keepLive, "state.json");
}

function resultFileFor(targetWindow, taskId) {
  return path.join(dirs.results, `${slug(targetWindow)}__${slug(taskId)}.json`);
}

function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(dir, name));
}

function requireValue(name) {
  const value = getValue(name, "");
  if (!value.trim()) fail(`${name} is required.`);
  return value.trim();
}

function validateContextPolicy(value) {
  const allowed = new Set(["assumed-current", "refresh-if-missing", "force-refresh"]);
  if (!allowed.has(value)) {
    fail(`--context-policy must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateResultStatus(value) {
  const allowed = new Set(["completed", "blocked", "needs-review"]);
  if (!allowed.has(value)) {
    fail(`--status must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateReturnRoute(value) {
  const allowed = new Set(["controller", "none"]);
  if (!allowed.has(value)) {
    fail(`--return-route must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateDeliveryRole(value) {
  const normalized = String(value || "target").trim();
  const aliases = new Map([
    ["AlembicTest", "test-target"],
    ["TestWindow", "test-target"],
    ["DesignWindow", "design"],
  ]);
  const role = aliases.get(normalized) || normalized;
  const allowed = new Set(["target", "controller", "test-target", "design", "observer"]);
  if (!allowed.has(role)) {
    fail(`--role must be one of: ${[...allowed].join(", ")}`);
  }
  return role;
}

function normalizeLegacyRole(value) {
  const role = String(value || "target").trim();
  if (role === "controller") return "controller";
  if (/test/i.test(role)) return "test-target";
  if (/design/i.test(role)) return "design";
  if (/observer/i.test(role)) return "observer";
  return "target";
}

function validateBusyPolicy(value) {
  const allowed = new Set(["append-if-steerable", "fail-if-busy"]);
  if (!allowed.has(value)) {
    fail(`--busy-policy must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateDeliveryRunStatus(value) {
  const allowed = new Set(["sent", "blocked", "failed"]);
  if (!allowed.has(value)) {
    fail(`--status must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateHostMode(value) {
  const allowed = new Set(["new-turn", "append-to-active-turn", "unknown"]);
  if (!allowed.has(value)) {
    fail(`--host-mode must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function validateKeepLiveStatus(value) {
  const allowed = new Set(["running", "stopped", "failed"]);
  if (!allowed.has(value)) {
    fail(`--status must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  fail(`Boolean value expected, got: ${value}`);
}

function validateThreadId(value) {
  const threadId = String(value ?? "").trim();
  const placeholders = new Set(["current-codex-thread", "current thread", "<thread id>", "unknown", ""]);
  if (placeholders.has(threadId.toLowerCase())) {
    fail("--thread-id must be a real Codex thread id, not a placeholder.");
  }
  if (/\s/.test(threadId)) {
    fail("--thread-id must not contain whitespace.");
  }
  return threadId;
}

function readWorkspaceConfig() {
  for (const candidate of [
    path.join(workspaceRoot, ".workspace-local/workspace.config.json"),
    path.join(workspaceRoot, "workspace.config.json"),
  ]) {
    if (existsSync(candidate)) return readJson(candidate, "workspace config");
  }
  return {};
}

function repositoryForWindow(windowName) {
  const config = readWorkspaceConfig();
  const repositories = Array.isArray(config.repositories) ? config.repositories : [];
  return {
    config,
    repository: repositories.find((item) => item.windowName === windowName) ?? null,
  };
}

function formatTargetPrompt({ targetWindow, taskId, controlPlan, dispatchGroup }) {
  return [
    `继续当前窗口任务：${targetWindow} / ${taskId}。`,
    "",
    "变量：",
    `- currentWindow: ${targetWindow}`,
    `- taskId: ${taskId}`,
    `- controlPlan: ${controlPlan}`,
    ...(dispatchGroup ? [`- dispatchGroup: ${dispatchGroup}`] : []),
    "- rules: 用完即弃；只执行本窗口任务；返回 TargetResultEnvelope；不创建子窗口下一跳；结果齐件且 returnRoute=controller 时只创建总控回跳。",
    "- skill: ../codex-control-workspace/skills/dev/codex-automation-target/SKILL.md",
  ].join("\n");
}

function formatControllerReturnPrompt({ dispatchGroup, lastCompletedTarget, lastTaskId, controlPlan }) {
  return [
    `继续总控验收：${lastCompletedTarget} 回填。`,
    "",
    "变量：",
    `- dispatchGroup: ${dispatchGroup}`,
    `- lastCompletedTarget: ${lastCompletedTarget}`,
    `- lastTaskId: ${lastTaskId}`,
    `- controlPlan: ${controlPlan}`,
    "- rules: 用完即弃；review-results；证据通过且目标未完成时创建下一批 dispatch；仅异常诊断。",
    "- skill: codex-control-workspace/skills/dev/codex-automation-controller/SKILL.md",
  ].join("\n");
}

function readDispatchPrompt({ promptArg, promptFileArg, targetWindow, taskId, controlPlan, dispatchGroup }) {
  if (promptFileArg) return readFileSync(resolveInputPath(promptFileArg, "--prompt-file"), "utf8").trim();
  if (!promptArg) return formatTargetPrompt({ targetWindow, taskId, controlPlan, dispatchGroup });

  const prompt = promptArg.trim();
  if (!prompt) return formatTargetPrompt({ targetWindow, taskId, controlPlan, dispatchGroup });
  if (prompt.startsWith("继续当前窗口任务：") && !prompt.includes("\n变量：")) {
    return formatTargetPrompt({ targetWindow, taskId, controlPlan, dispatchGroup });
  }
  return prompt;
}

function commandRegisterThread() {
  if (!write) fail("register-thread requires --write.");
  const windowName = requireValue("--window");
  const threadId = validateThreadId(requireValue("--thread-id"));
  const deliveryRole = validateDeliveryRole(getValue("--role", "target"));
  const cwd = getValue("--cwd", "");
  const responsibilityRoot = getValue("--responsibility-root", "");
  const displayTitle = getValue("--display-title", "");
  const canonicalUse = getValue("--canonical-use", "");
  const writeBoundary = getAllValues("--write-boundary");
  const supersedesWindowNames = getAllValues("--supersedes-window");
  const registration = {
    kind: "CodexWindowThreadRegistration",
    version: threadRegistrationVersion,
    windowName,
    displayTitle: displayTitle || undefined,
    deliveryRole,
    threadId,
    cwd: cwd || undefined,
    responsibilityRoot: responsibilityRoot || cwd || undefined,
    writeBoundary,
    canonicalUse: canonicalUse || undefined,
    supersedesWindowNames,
    registeredAt: nowIso(),
    lastVerifiedAt: nowIso(),
  };
  ensureStateDirs();
  atomicWriteJson(threadFileFor(windowName), registration);
  output(
    {
      ok: true,
      command: "register-thread",
      wrote: true,
      windowName,
      deliveryRole,
      threadRegistered: true,
      threadIdRedacted: true,
      registryFile: path.relative(workspaceRoot, threadFileFor(windowName)),
    },
    [`Registered Codex thread for ${windowName}.`],
  );
}

function loadThreadRegistration(windowName) {
  const file = threadFileFor(windowName);
  if (!existsSync(file)) return null;
  const registration = readJson(file, "thread registration");
  if (!["CodexAutomationThreadRegistration", "CodexWindowThreadRegistration"].includes(registration.kind)) {
    fail(`Invalid thread registration for ${windowName}.`);
  }
  const roleCandidate = registration.deliveryRole || registration.role || registration.windowRole || registration.windowName;
  const deliveryRole = normalizeLegacyRole(roleCandidate);
  return {
    ...registration,
    kind: "CodexWindowThreadRegistration",
    version: threadRegistrationVersion,
    deliveryRole,
    role: undefined,
    threadRegistryFile: path.relative(stateDir, file),
    responsibilityRoot: registration.responsibilityRoot || registration.cwd,
  };
}

function redactDeliveryEnvelope(envelope) {
  const redacted = structuredClone(envelope);
  if (redacted.targetThread?.threadId) {
    redacted.targetThread.threadId = "<redacted>";
  }
  return redacted;
}

function buildWindowConfig(windowName, { busyPolicy = "append-if-steerable", requireThread = false } = {}) {
  const registration = loadThreadRegistration(windowName);
  if (requireThread && !registration) fail(`No registered thread for window: ${windowName}`);
  const { config, repository } = repositoryForWindow(windowName);
  const dispatchWindows = new Set([
    ...(Array.isArray(config.dispatchWindows) ? config.dispatchWindows : []),
    ...(Array.isArray(config.requiredDispatchWindows) ? config.requiredDispatchWindows : []),
    config.controlWindow,
  ].filter(Boolean));
  const deliveryRole = registration?.deliveryRole || (windowName === config.controlWindow ? "controller" : "target");
  const dispatchable = ["controller", "target", "test-target"].includes(deliveryRole) && (dispatchWindows.size === 0 || dispatchWindows.has(windowName) || Boolean(registration));
  return {
    kind: "CodexSubwindowDispatchConfig",
    version: windowConfigVersion,
    windowName,
    repositoryPath: repository?.path,
    responsibility: repository?.role,
    dispatchable,
    threadRegistered: Boolean(registration),
    threadRegistryFile: path.relative(stateDir, threadFileFor(windowName)),
    cwd: registration?.cwd || repository?.path,
    responsibilityRoot: registration?.responsibilityRoot || repository?.path,
    deliveryRole,
    delivery: {
      transport: "direct-thread",
      requireThread: true,
      busyPolicy,
      missingThread: "fail-closed",
      readbackRequired: true,
    },
    automation: {
      mode: "manual-or-unattended",
      continuousWhenEnabled: true,
      keepLive: "required-when-automation-enabled",
    },
    result: {
      returnRoute: "controller",
      resultEnvelopeRequired: true,
    },
    generatedAt: nowIso(),
  };
}

function commandStatus() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(helpText);
    return;
  }
  const packetCount = listJsonFiles(dirs.packets).length;
  const deliveryCount = listJsonFiles(dirs.deliveries).length;
  const deliveryRunCount = listJsonFiles(dirs.deliveryRuns).length;
  const resultCount = listJsonFiles(dirs.results).length;
  const registeredThreadCount = listJsonFiles(dirs.registry).length;
  const windowConfigCount = listJsonFiles(dirs.windowConfig).length;
  const keepLiveStateExists = existsSync(keepLiveStateFile());
  output(
    {
      ok: true,
      command: "status",
      stateDir,
      packetCount,
      deliveryCount,
      deliveryRunCount,
      resultCount,
      registeredThreadCount,
      windowConfigCount,
      keepLiveStateExists,
    },
    [
      "Codex automation closed-loop status",
      `State: ${path.relative(workspaceRoot, stateDir) || "."}`,
      `Dispatch packets: ${packetCount}`,
      `Delivery envelopes: ${deliveryCount}`,
      `Delivery runs: ${deliveryRunCount}`,
      `Target results: ${resultCount}`,
      `Registered threads: ${registeredThreadCount}`,
      `Window configs: ${windowConfigCount}`,
      `Keep-live state: ${keepLiveStateExists ? "present" : "missing"}`,
    ],
  );
}

function commandBuildWindowConfig() {
  const windowName = requireValue("--window");
  const busyPolicy = validateBusyPolicy(getValue("--busy-policy", "append-if-steerable"));
  const config = buildWindowConfig(windowName, { busyPolicy, requireThread: hasFlag("--require-thread") });
  const configFile = windowConfigFileFor(windowName);
  if (write) {
    ensureStateDirs();
    atomicWriteJson(configFile, config);
  }
  output(
    {
      ok: true,
      command: "build-window-config",
      wrote: write,
      windowName,
      config,
      configFile: write ? path.relative(workspaceRoot, configFile) : "",
    },
    [
      `${write ? "Created" : "Would create"} window config for ${windowName}.`,
      `Thread: ${config.threadRegistered ? "registered" : "missing"}`,
      `Dispatchable: ${config.dispatchable ? "yes" : "no"}`,
    ],
  );
}

function commandCreateDispatch() {
  const targetWindow = requireValue("--target-window");
  const taskId = requireValue("--task-id");
  const controlPlan = requireValue("--control-plan");
  const objective = requireValue("--objective");
  const promptArg = getValue("--prompt", "");
  const promptFileArg = getValue("--prompt-file", "");
  const dispatchGroup = getValue("--group", "");
  const prompt = readDispatchPrompt({ promptArg, promptFileArg, targetWindow, taskId, controlPlan, dispatchGroup });
  if (!prompt) fail("Prompt cannot be empty.");

  const id = [dispatchGroup, targetWindow, taskId].filter(Boolean).map(slug).join("__");
  const packet = {
    kind: "ControllerDispatchPacket",
    version,
    id,
    targetWindow,
    taskId,
    dispatchGroup: dispatchGroup || undefined,
    controlPlan,
    objective,
    scope: getAllValues("--scope"),
    forbidden: getAllValues("--forbidden"),
    evidenceRequired: getAllValues("--evidence"),
    resultContract: "target-result-envelope-v1",
    contextPolicy: validateContextPolicy(getValue("--context-policy", "refresh-if-missing")),
    prompt,
    createdAt: nowIso(),
  };

  const packetFile = packetFileFor(packet.id);
  if (write) {
    ensureStateDirs();
    atomicWriteJson(packetFile, packet);
  }
  output(
    {
      ok: true,
      command: "create-dispatch",
      wrote: write,
      packet,
      packetFile: write ? path.relative(workspaceRoot, packetFile) : "",
    },
    [
      `${write ? "Created" : "Would create"} dispatch packet ${packet.id}.`,
      `Target: ${targetWindow}`,
      `Task: ${taskId}`,
    ],
  );
}

function commandBuildDelivery() {
  const packetFile = resolveInputPath(requireValue("--packet-file"), "--packet-file");
  const packet = readJson(packetFile, "dispatch packet");
  if (packet.kind !== "ControllerDispatchPacket") fail("Packet file must contain a ControllerDispatchPacket.");
  if (!packet.targetWindow || !packet.prompt || !packet.taskId) fail("Dispatch packet is missing targetWindow, taskId, or prompt.");

  const deliveryId = getValue("--delivery-id", `delivery-${packet.id}`);
  const busyPolicy = validateBusyPolicy(getValue("--busy-policy", "append-if-steerable"));
  const automationEnabled = hasFlag("--automation-enabled");
  const registration = loadThreadRegistration(packet.targetWindow);
  if (hasFlag("--require-thread") && !registration) fail(`No registered thread for target window: ${packet.targetWindow}`);
  const windowConfig = buildWindowConfig(packet.targetWindow, { busyPolicy });
  const envelope = {
    kind: "DeliveryEnvelope",
    version: deliveryEnvelopeVersion,
    deliveryId,
    sourcePacketId: packet.id,
    targetWindow: packet.targetWindow,
    taskId: packet.taskId,
    dispatchGroup: packet.dispatchGroup,
    controlPlan: packet.controlPlan,
    prompt: packet.prompt,
    returnRoute: validateReturnRoute(getValue("--return-route", "controller")),
    oneShot: true,
    correlationId: packet.dispatchGroup || packet.id,
    targetThread: registration
      ? {
          windowName: registration.windowName,
          deliveryRole: registration.deliveryRole,
          threadIdRedacted: true,
          threadRegistryFile: registration.threadRegistryFile,
          cwd: registration.cwd,
          responsibilityRoot: registration.responsibilityRoot,
        }
      : undefined,
    transport: {
      kind: "direct-thread",
      threadRegistryFile: path.relative(stateDir, threadFileFor(packet.targetWindow)),
      busyPolicy,
      readbackRequired: true,
      missingThread: "fail-closed",
    },
    automation: {
      enabled: automationEnabled,
      continuousLoop: automationEnabled,
      keepLive: automationEnabled,
      keepLiveStateFile: automationEnabled ? path.relative(stateDir, keepLiveStateFile()) : undefined,
    },
    windowConfig,
    createdAt: nowIso(),
  };

  const deliveryFile = deliveryFileFor(envelope.deliveryId);
  if (write) {
    ensureStateDirs();
    atomicWriteJson(deliveryFile, envelope);
  }
  output(
    {
      ok: true,
      command: "build-delivery",
      wrote: write,
      envelope: redactDeliveryEnvelope(envelope),
      deliveryFile: write ? path.relative(workspaceRoot, deliveryFile) : "",
      threadReady: Boolean(registration),
      threadIdRedacted: Boolean(registration),
    },
    [
      `${write ? "Created" : "Would create"} delivery envelope ${deliveryId}.`,
      `Target: ${envelope.targetWindow}`,
      `Return route: ${envelope.returnRoute}`,
      `Thread: ${registration ? "registered" : "missing"}`,
    ],
  );
}

function commandBuildControllerReturn() {
  const dispatchGroup = requireValue("--group");
  const lastCompletedTarget = requireValue("--last-completed-target");
  const lastTaskId = requireValue("--last-task-id");
  const controlPlan = requireValue("--control-plan");
  const config = readWorkspaceConfig();
  const controllerWindow = getValue("--controller-window", config.controlWindow || config.workspaceName || "ControlWorkspace");
  const busyPolicy = validateBusyPolicy(getValue("--busy-policy", "append-if-steerable"));
  const automationEnabled = hasFlag("--automation-enabled");
  const registration = loadThreadRegistration(controllerWindow);
  if (hasFlag("--require-thread") && !registration) fail(`No registered controller thread for window: ${controllerWindow}`);
  const windowConfig = buildWindowConfig(controllerWindow, { busyPolicy });

  const prompt = formatControllerReturnPrompt({ dispatchGroup, lastCompletedTarget, lastTaskId, controlPlan });
  const envelope = {
    kind: "ControllerReturnEnvelope",
    version: deliveryEnvelopeVersion,
    deliveryId: `controller-return-${slug(dispatchGroup)}__${slug(lastCompletedTarget)}__${slug(lastTaskId)}`,
    dispatchGroup,
    lastCompletedTarget,
    lastTaskId,
    controlPlan,
    prompt,
    oneShot: true,
    targetThread: registration
      ? {
          windowName: registration.windowName,
          deliveryRole: registration.deliveryRole,
          threadIdRedacted: true,
          threadRegistryFile: registration.threadRegistryFile,
          cwd: registration.cwd,
          responsibilityRoot: registration.responsibilityRoot,
        }
      : undefined,
    transport: {
      kind: "direct-thread",
      threadRegistryFile: path.relative(stateDir, threadFileFor(controllerWindow)),
      busyPolicy,
      readbackRequired: true,
      missingThread: "fail-closed",
    },
    automation: {
      enabled: automationEnabled,
      continuousLoop: automationEnabled,
      keepLive: automationEnabled,
      keepLiveStateFile: automationEnabled ? path.relative(stateDir, keepLiveStateFile()) : undefined,
    },
    windowConfig,
    createdAt: nowIso(),
  };

  const returnFile = deliveryFileFor(envelope.deliveryId);
  if (write) {
    ensureStateDirs();
    atomicWriteJson(returnFile, envelope);
  }
  output(
    {
      ok: true,
      command: "build-controller-return",
      wrote: write,
      envelope: redactDeliveryEnvelope(envelope),
      returnFile: write ? path.relative(workspaceRoot, returnFile) : "",
      threadReady: Boolean(registration),
      threadIdRedacted: Boolean(registration),
    },
    [
      `${write ? "Created" : "Would create"} controller-return envelope ${envelope.deliveryId}.`,
      `Controller: ${controllerWindow}`,
      `Thread: ${registration ? "registered" : "missing"}`,
    ],
  );
}

function commandRecordDeliveryRun() {
  if (!write) fail("record-delivery-run requires --write.");
  const deliveryFile = resolveInputPath(requireValue("--delivery-file"), "--delivery-file");
  const envelope = readJson(deliveryFile, "delivery envelope");
  if (!["DeliveryEnvelope", "ControllerReturnEnvelope"].includes(envelope.kind)) {
    fail("Delivery file must contain a DeliveryEnvelope or ControllerReturnEnvelope.");
  }
  const status = validateDeliveryRunStatus(requireValue("--status"));
  const readbackOk = parseBoolean(getValue("--readback-ok", ""), status === "sent");
  const evidence = getValue("--evidence", "");
  const error = getValue("--error", "");
  if (status === "sent" && (!readbackOk || !evidence.trim())) {
    fail("sent delivery runs require --readback-ok true and --evidence.");
  }
  if (status !== "sent" && !error.trim()) {
    fail("blocked/failed delivery runs require --error.");
  }
  const deliveryRunId = getValue("--delivery-run-id", `run-${envelope.deliveryId}`);
  const keepLiveState = envelope.automation?.keepLive ? path.relative(stateDir, keepLiveStateFile()) : null;
  const run = {
    kind: "DirectThreadDeliveryRun",
    version: deliveryRunVersion,
    deliveryRunId,
    deliveryId: envelope.deliveryId,
    targetWindow: envelope.targetWindow || envelope.targetThread?.windowName,
    taskId: envelope.taskId || envelope.lastTaskId,
    dispatchGroup: envelope.dispatchGroup,
    transport: "direct-thread",
    status,
    thread: {
      windowName: envelope.targetThread?.windowName || envelope.targetWindow,
      threadIdRedacted: true,
      threadRegistryFile: envelope.transport?.threadRegistryFile || envelope.targetThread?.threadRegistryFile,
    },
    hostAction: {
      method: getValue("--host-method", "send_message_to_thread"),
      mode: validateHostMode(getValue("--host-mode", "unknown")),
    },
    readback: {
      checked: status === "sent" || getValue("--readback-ok", "") !== "",
      ok: readbackOk,
      evidence: evidence || undefined,
    },
    keepLive: {
      enabledForRun: Boolean(envelope.automation?.keepLive),
      stateFile: keepLiveState,
    },
    error: error || undefined,
    createdAt: nowIso(),
  };
  const runFile = deliveryRunFileFor(deliveryRunId);
  ensureStateDirs();
  atomicWriteJson(runFile, run);
  output(
    {
      ok: true,
      command: "record-delivery-run",
      wrote: true,
      status,
      run,
      runFile: path.relative(workspaceRoot, runFile),
    },
    [
      `Recorded direct-thread delivery run ${deliveryRunId}.`,
      `Status: ${status}`,
    ],
  );
}

function commandKeepLiveState() {
  if (!write) fail("keep-live-state requires --write.");
  const automationRunId = requireValue("--automation-run-id");
  const status = validateKeepLiveStatus(requireValue("--status"));
  const pidValue = getValue("--pid", "");
  const pid = pidValue ? Number(pidValue) : undefined;
  if (pidValue && (!Number.isInteger(pid) || pid <= 0)) fail("--pid must be a positive integer.");
  const state = {
    kind: "AutomationKeepLiveState",
    version: keepLiveVersion,
    enabled: status === "running",
    automationRunId,
    mechanism: getValue("--mechanism", "manual"),
    startedAt: status === "running" ? nowIso() : undefined,
    stoppedAt: status === "stopped" ? nowIso() : undefined,
    pid,
    status,
    lastCheckedAt: nowIso(),
    error: getValue("--error", "") || null,
  };
  if (status === "failed" && !state.error) fail("failed keep-live state requires --error.");
  ensureStateDirs();
  atomicWriteJson(keepLiveStateFile(), state);
  output(
    {
      ok: true,
      command: "keep-live-state",
      wrote: true,
      status,
      state,
      stateFile: path.relative(workspaceRoot, keepLiveStateFile()),
    },
    [
      `Recorded keep-live state for ${automationRunId}.`,
      `Status: ${status}`,
    ],
  );
}

function commandSubmitResult() {
  const targetWindow = requireValue("--target-window");
  const taskId = requireValue("--task-id");
  const status = validateResultStatus(requireValue("--status"));
  const evidenceRefs = getAllValues("--evidence-ref");
  const verificationSummary = getAllValues("--verification");
  const commits = getAllValues("--commit");
  if (status === "completed" && evidenceRefs.length === 0 && verificationSummary.length === 0 && commits.length === 0) {
    fail("completed results require --evidence-ref, --verification, or --commit.");
  }

  const result = {
    kind: "TargetResultEnvelope",
    version,
    targetWindow,
    taskId,
    dispatchGroup: getValue("--group", "") || undefined,
    status,
    changedRepos: getAllValues("--changed-repo"),
    commits,
    evidenceRefs,
    verificationSummary,
    riskSummary: getAllValues("--risk"),
    nextSuggestion: getValue("--next-suggestion", "") || undefined,
    reportedAt: nowIso(),
  };

  const resultFile = resultFileFor(targetWindow, taskId);
  if (write) {
    ensureStateDirs();
    atomicWriteJson(resultFile, result);
  }
  output(
    {
      ok: true,
      command: "submit-result",
      wrote: write,
      result,
      resultFile: write ? path.relative(workspaceRoot, resultFile) : "",
    },
    [
      `${write ? "Recorded" : "Would record"} result envelope for ${targetWindow} / ${taskId}.`,
      `Status: ${status}`,
    ],
  );
}

function loadPacketsForReview() {
  const group = getValue("--group", "");
  const taskId = getValue("--task-id", "");
  if (!group && !taskId) fail("review-results requires --group or --task-id.");
  const packets = listJsonFiles(dirs.packets)
    .map((file) => readJson(file, "dispatch packet"))
    .filter((packet) => packet.kind === "ControllerDispatchPacket")
    .filter((packet) => (group ? packet.dispatchGroup === group : packet.taskId === taskId));
  return { group, taskId, packets };
}

function commandReviewResults() {
  const { group, taskId, packets } = loadPacketsForReview();
  if (packets.length === 0) fail("No matching dispatch packets found for review.");
  const results = packets.map((packet) => {
    const file = resultFileFor(packet.targetWindow, packet.taskId);
    return {
      packet,
      file,
      result: existsSync(file) ? readJson(file, "target result") : null,
    };
  });
  const missing = results.filter((item) => !item.result).map((item) => item.packet.id);
  const blocked = results.filter((item) => item.result?.status === "blocked").map((item) => item.packet.id);
  const needsReview = results.filter((item) => item.result && item.result.status !== "blocked").map((item) => item.packet.id);
  const decision = missing.length > 0 ? "wait" : blocked.length > 0 ? "blocked" : "needs-controller-review";

  output(
    {
      ok: true,
      command: "review-results",
      group: group || undefined,
      taskId: taskId || undefined,
      packetCount: packets.length,
      missing,
      blocked,
      needsReview,
      decision,
    },
    [
      `Review scope: ${group ? `group ${group}` : `task ${taskId}`}`,
      `Packets: ${packets.length}`,
      `Decision: ${decision}`,
    ],
  );
}

function commandStopLoop() {
  if (!write) fail("stop-loop requires --write.");
  const reason = requireValue("--reason");
  const marker = {
    kind: "CodexAutomationLoopStop",
    version,
    stoppedAt: nowIso(),
    reason,
  };
  atomicWriteJson(path.join(stateDir, "stop.json"), marker);
  output(
    {
      ok: true,
      command: "stop-loop",
      wrote: true,
      markerFile: path.relative(workspaceRoot, path.join(stateDir, "stop.json")),
      reason,
    },
    [`Closed-loop delivery stopped: ${reason}`],
  );
}

try {
  switch (command) {
    case "status":
      commandStatus();
      break;
    case "register-thread":
      commandRegisterThread();
      break;
    case "build-window-config":
      commandBuildWindowConfig();
      break;
    case "create-dispatch":
      commandCreateDispatch();
      break;
    case "build-delivery":
      commandBuildDelivery();
      break;
    case "build-controller-return":
      commandBuildControllerReturn();
      break;
    case "record-delivery-run":
      commandRecordDeliveryRun();
      break;
    case "keep-live-state":
      commandKeepLiveState();
      break;
    case "submit-result":
      commandSubmitResult();
      break;
    case "review-results":
      commandReviewResults();
      break;
    case "stop-loop":
      commandStopLoop();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(helpText);
      break;
    default:
      fail(`Unknown command: ${command}\n\n${helpText}`);
  }
} catch (error) {
  if (!(error instanceof CliExit)) {
    throw error;
  }
}
