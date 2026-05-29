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

const dirs = {
  packets: path.join(stateDir, "dispatch-packets"),
  deliveries: path.join(stateDir, "delivery-envelopes"),
  results: path.join(stateDir, "target-results"),
  registry: path.join(stateDir, "thread-registry"),
};

const helpText = `
Codex automation closed-loop contract manager

Usage:
  node scripts/codex-automation-loop.mjs status [--json]
  node scripts/codex-automation-loop.mjs register-thread --window <name> --thread-id <id> [--role target|controller] [--cwd <path>] --write [--json]
  node scripts/codex-automation-loop.mjs create-dispatch --target-window <name> --task-id <id> --control-plan <path> --objective <text> (--prompt <text>|--prompt-file <path>) [--group <id>] [--context-policy assumed-current|refresh-if-missing|force-refresh] [--scope <text>...] [--forbidden <text>...] [--evidence <text>...] [--write] [--json]
  node scripts/codex-automation-loop.mjs build-delivery --packet-file <path> [--delivery-id <id>] [--return-route controller|none] [--no-keep-live] [--stagger-seconds <n>] [--require-thread] [--include-thread-id] [--write] [--json]
  node scripts/codex-automation-loop.mjs submit-result --target-window <name> --task-id <id> --status completed|blocked|needs-review [--group <id>] [--changed-repo <repo>...] [--commit <hash>...] [--evidence-ref <ref>...] [--verification <text>...] [--risk <text>...] [--next-suggestion <text>] [--write] [--json]
  node scripts/codex-automation-loop.mjs review-results (--group <id>|--task-id <id>) [--json]
  node scripts/codex-automation-loop.mjs stop-loop --reason <text> --write [--json]

Design:
  This script is the new CodexAutomationClosedLoop contract surface. It does
  not parse current plans, decide sendable windows, claim target work, create
  Codex automations, or accept evidence. Total control creates dispatch
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
  if (payload.command === "register-thread") return "Build delivery envelopes for registered target windows when total control decides to dispatch.";
  if (payload.command === "build-delivery") return payload.threadReady ? "Create the Codex heartbeat from the delivery envelope." : "Register the target thread before creating the Codex heartbeat.";
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

function threadFileFor(windowName) {
  return path.join(dirs.registry, `${slug(windowName)}.json`);
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

function commandRegisterThread() {
  if (!write) fail("register-thread requires --write.");
  const windowName = requireValue("--window");
  const threadId = validateThreadId(requireValue("--thread-id"));
  const role = getValue("--role", "target");
  if (!["target", "controller"].includes(role)) fail("--role must be target or controller.");
  const cwd = getValue("--cwd", "");
  const registration = {
    kind: "CodexAutomationThreadRegistration",
    version,
    windowName,
    role,
    threadId,
    cwd: cwd || undefined,
    registeredAt: nowIso(),
  };
  ensureStateDirs();
  atomicWriteJson(threadFileFor(windowName), registration);
  output(
    {
      ok: true,
      command: "register-thread",
      wrote: true,
      windowName,
      role,
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
  if (registration.kind !== "CodexAutomationThreadRegistration") {
    fail(`Invalid thread registration for ${windowName}.`);
  }
  return registration;
}

function redactDeliveryEnvelope(envelope) {
  const redacted = structuredClone(envelope);
  if (redacted.targetThread?.threadId) {
    redacted.targetThread.threadId = "<redacted>";
  }
  if (redacted.codexAutomation?.targetThreadId) {
    redacted.codexAutomation.targetThreadId = "<redacted>";
  }
  return redacted;
}

function commandStatus() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(helpText);
    return;
  }
  const packetCount = listJsonFiles(dirs.packets).length;
  const deliveryCount = listJsonFiles(dirs.deliveries).length;
  const resultCount = listJsonFiles(dirs.results).length;
  const registeredThreadCount = listJsonFiles(dirs.registry).length;
  output(
    {
      ok: true,
      command: "status",
      stateDir,
      packetCount,
      deliveryCount,
      resultCount,
      registeredThreadCount,
    },
    [
      "Codex automation closed-loop status",
      `State: ${path.relative(workspaceRoot, stateDir) || "."}`,
      `Dispatch packets: ${packetCount}`,
      `Delivery envelopes: ${deliveryCount}`,
      `Target results: ${resultCount}`,
      `Registered threads: ${registeredThreadCount}`,
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
  if (!promptArg && !promptFileArg) fail("Either --prompt or --prompt-file is required.");
  const prompt = promptFileArg ? readFileSync(resolveInputPath(promptFileArg, "--prompt-file"), "utf8").trim() : promptArg.trim();
  if (!prompt) fail("Prompt cannot be empty.");

  const dispatchGroup = getValue("--group", "");
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
  const stagger = Number(getValue("--stagger-seconds", "0"));
  if (!Number.isFinite(stagger) || stagger < 0) fail("--stagger-seconds must be a non-negative number.");
  const registration = loadThreadRegistration(packet.targetWindow);
  if (hasFlag("--require-thread") && !registration) fail(`No registered thread for target window: ${packet.targetWindow}`);
  const envelope = {
    kind: "DeliveryEnvelope",
    version,
    deliveryId,
    sourcePacketId: packet.id,
    targetWindow: packet.targetWindow,
    taskId: packet.taskId,
    dispatchGroup: packet.dispatchGroup,
    controlPlan: packet.controlPlan,
    prompt: packet.prompt,
    returnRoute: validateReturnRoute(getValue("--return-route", "controller")),
    oneShot: true,
    keepLive: !hasFlag("--no-keep-live"),
    correlationId: packet.dispatchGroup || packet.id,
    targetThread: registration
      ? {
          windowName: registration.windowName,
          role: registration.role,
          threadId: registration.threadId,
          cwd: registration.cwd,
        }
      : undefined,
    schedule: {
      kind: "heartbeat",
      rrule: "FREQ=MINUTELY;INTERVAL=1",
      staggerSeconds: stagger,
    },
    createdAt: nowIso(),
  };
  if (registration) {
    envelope.codexAutomation = {
      kind: "heartbeat",
      destination: "thread",
      targetThreadId: registration.threadId,
      name: `Codex automation ${packet.targetWindow}`,
      prompt: packet.prompt,
      rrule: envelope.schedule.rrule,
      status: "ACTIVE",
    };
  }

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
      envelope: hasFlag("--include-thread-id") ? envelope : redactDeliveryEnvelope(envelope),
      deliveryFile: write ? path.relative(workspaceRoot, deliveryFile) : "",
      threadReady: Boolean(registration),
      threadIdRedacted: Boolean(registration) && !hasFlag("--include-thread-id"),
    },
    [
      `${write ? "Created" : "Would create"} delivery envelope ${deliveryId}.`,
      `Target: ${envelope.targetWindow}`,
      `Return route: ${envelope.returnRoute}`,
      `Thread: ${registration ? "registered" : "missing"}`,
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
    case "create-dispatch":
      commandCreateDispatch();
      break;
    case "build-delivery":
      commandBuildDelivery();
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
