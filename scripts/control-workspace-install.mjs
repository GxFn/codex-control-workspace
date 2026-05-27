#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWorkspaceConfig,
  readWorkspaceConfig,
  workspaceConfigPath,
} from "./lib/workspace-config.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultControlRoot = path.dirname(path.dirname(scriptPath));
const rawArgs = process.argv.slice(2);
const command = rawArgs[0] ?? "help";
const args = rawArgs.slice(1);
const json = args.includes("--json");
const write = args.includes("--write");

function fail(message) {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

function hasFlag(name) {
  return args.includes(name);
}

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

function getAllValues(name) {
  const out = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(`${name}=`)) {
      out.push(arg.slice(name.length + 1));
    } else if (arg === name && args[index + 1] && !args[index + 1].startsWith("--")) {
      out.push(args[index + 1]);
      index += 1;
    }
  }
  return out;
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, prettyJson(value));
}

function resolveMaybeRelative(root, value) {
  if (!value) {
    return root;
  }
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeFromControl(controlRoot, absolutePath) {
  const relative = slash(path.relative(controlRoot, absolutePath));
  return relative === "" ? "." : relative;
}

function relativeCommandPath(fromDir, absoluteScriptPath) {
  const relative = slash(path.relative(fromDir, absoluteScriptPath));
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function toWindowName(directoryName) {
  return directoryName
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function commandContext() {
  const controlRoot = resolveMaybeRelative(defaultControlRoot, getValue("--root", "."));
  const config = loadWorkspaceConfig({ workspaceRoot: controlRoot, args });
  const userConfig = readWorkspaceConfig({ workspaceRoot: controlRoot, args });
  const configPath = workspaceConfigPath({ workspaceRoot: controlRoot, args });
  const parentRoot = resolveMaybeRelative(controlRoot, getValue("--parent", config.workspaceRoot ?? ".."));
  return { controlRoot, config, userConfig, configPath, parentRoot };
}

function normalizedRepositories(config) {
  return (config.repositories ?? [])
    .filter((repo) => repo && repo.windowName && repo.path)
    .map((repo) => ({
      windowName: repo.windowName,
      path: slash(repo.path),
      role: repo.role ?? config.repositoryRoles?.[repo.windowName] ?? "Configured repository",
      managedAgents: repo.managedAgents !== false,
    }));
}

function repositoryAbsPath(controlRoot, repo) {
  return path.resolve(controlRoot, repo.path);
}

function discoverSiblingRepositories({ controlRoot, parentRoot, config }) {
  if (!existsSync(parentRoot)) {
    fail(`Parent workspace directory does not exist: ${parentRoot}`);
  }
  const controlBasename = path.basename(controlRoot);
  const configured = new Map(
    normalizedRepositories(config).map((repo) => [path.resolve(controlRoot, repo.path), repo]),
  );
  const ignore = new Set([
    controlBasename,
    ".git",
    ".workspace-local",
    "node_modules",
    ".DS_Store",
  ]);

  return readdirSync(parentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !ignore.has(entry.name))
    .map((entry) => {
      const absolutePath = path.join(parentRoot, entry.name);
      const configuredRepo = configured.get(absolutePath);
      const suggestedWindowName = configuredRepo?.windowName ?? toWindowName(entry.name);
      const role = configuredRepo?.role
        ?? config.repositoryRoles?.[suggestedWindowName]
        ?? "Project repository; confirm scope and responsibility before enabling.";
      return {
        name: entry.name,
        path: relativeFromControl(controlRoot, absolutePath),
        absolutePath,
        suggestedWindowName,
        role,
        configured: Boolean(configuredRepo),
        isGitRepo: existsSync(path.join(absolutePath, ".git")),
        hasAgents: existsSync(path.join(absolutePath, "AGENTS.md")),
        hasPackageJson: existsSync(path.join(absolutePath, "package.json")),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function statusPayload() {
  const context = commandContext();
  const configuredRepositories = normalizedRepositories(context.config).map((repo) => {
    const absolutePath = repositoryAbsPath(context.controlRoot, repo);
    return {
      ...repo,
      absolutePath,
      exists: existsSync(absolutePath) && statSync(absolutePath).isDirectory(),
      hasAgents: existsSync(path.join(absolutePath, "AGENTS.md")),
      withinParent: isInside(absolutePath, context.parentRoot),
    };
  });
  const discovered = discoverSiblingRepositories(context).map(({ absolutePath, ...item }) => item);
  const missing = configuredRepositories.filter((repo) => !repo.exists);
  const outsideParent = configuredRepositories.filter((repo) => !repo.withinParent);
  return {
    ok: missing.length === 0 || context.config.allowMissingRepos === true,
    controlRoot: context.controlRoot,
    parentRoot: context.parentRoot,
    configPath: context.configPath,
    workspaceName: context.config.workspaceName,
    controlRepoDir: context.config.controlRepoDir,
    configuredRepositories: configuredRepositories.map(({ absolutePath, ...repo }) => repo),
    discoveredRepositories: discovered,
    missingConfiguredRepositories: missing.map((repo) => repo.windowName),
    outsideParentRepositories: outsideParent.map((repo) => repo.windowName),
  };
}

function printResult(payload) {
  if (json) {
    console.log(prettyJson(payload));
    return;
  }
  if (payload.command === "discover" || payload.discoveredRepositories) {
    console.log(`${payload.workspaceName} install discovery`);
    console.log(`Control repo: ${payload.controlRoot}`);
    console.log(`Parent workspace: ${payload.parentRoot}`);
    for (const repo of payload.discoveredRepositories) {
      console.log(`- ${repo.suggestedWindowName}: ${repo.path}${repo.configured ? " (configured)" : ""}`);
    }
    return;
  }
  console.log(prettyJson(payload));
}

function parseKeyValueSpec(spec, kind) {
  const index = spec.indexOf("=");
  if (index <= 0 || index === spec.length - 1) {
    fail(`${kind} must use WindowName=value syntax: ${spec}`);
  }
  return [spec.slice(0, index), spec.slice(index + 1)];
}

function parseRepoSpecs(context) {
  const roleOverrides = new Map(getAllValues("--role").map((spec) => parseKeyValueSpec(spec, "--role")));
  const repoSpecs = getAllValues("--repo");
  if (repoSpecs.length === 0 && !hasFlag("--use-discovered")) {
    fail("configure requires at least one --repo WindowName=../RepositoryPath, or --use-discovered for a dry-run proposal.");
  }

  if (repoSpecs.length > 0) {
    return repoSpecs.map((spec) => {
      const [windowName, repoPath] = parseKeyValueSpec(spec, "--repo");
      const absolutePath = resolveMaybeRelative(context.controlRoot, repoPath);
      if (!isInside(absolutePath, context.parentRoot)) {
        fail(`Repository path for ${windowName} is outside the parent workspace: ${repoPath}`);
      }
      return {
        windowName,
        path: slash(repoPath),
        role: roleOverrides.get(windowName)
          ?? context.config.repositoryRoles?.[windowName]
          ?? "Project repository; confirm scope and responsibility before enabling.",
        managedAgents: true,
      };
    });
  }

  return discoverSiblingRepositories(context).map((repo) => ({
    windowName: repo.suggestedWindowName,
    path: repo.path,
    role: repo.role,
    managedAgents: true,
  }));
}

function configurePayload() {
  const context = commandContext();
  const repositories = parseRepoSpecs(context);
  const workspaceName = getValue("--workspace-name", context.config.workspaceName);
  const controlWindow = getValue("--control-window", workspaceName);
  const designWindow = getValue("--design-window", context.config.designWindow);
  const testWindow = getValue("--test-window", context.config.testWindow);
  const realProjectWindow = getValue("--real-project-window", context.config.realProjectWindow);
  const baseWindow = getValue("--base-window", context.config.baseWindow ?? repositories[0]?.windowName);
  const repositoryRoles = { ...context.config.repositoryRoles };
  for (const repo of repositories) {
    repositoryRoles[repo.windowName] = repo.role;
  }
  const names = repositories.map((repo) => repo.windowName);
  const dispatchWindows = names.filter((name) => name !== designWindow && name !== realProjectWindow);
  const repoNames = names.filter((name) => ![designWindow, testWindow, realProjectWindow].includes(name));
  const protectedWorkspacePrefixes = repositories
    .map((repo) => repo.path)
    .filter((repoPath) => !repoPath.startsWith("../") && repoPath !== ".")
    .map((repoPath) => `${repoPath.replace(/\/+$/, "")}/`);
  const nextConfig = {
    ...context.userConfig,
    workspaceName,
    controlWindow,
    designWindow,
    testWindow,
    realProjectWindow,
    baseWindow,
    workspaceRoot: slash(path.relative(context.controlRoot, context.parentRoot)) || ".",
    controlRepoDir: path.basename(context.controlRoot),
    dispatchWindows,
    requiredDispatchWindows: names,
    repoNames,
    protectedWorkspacePrefixes,
    repositoryRoles,
    repositories,
  };

  if (write) {
    writeJson(context.configPath, nextConfig);
  }

  return {
    ok: true,
    command: "configure",
    wrote: write,
    configPath: context.configPath,
    nextConfig,
  };
}

function buildChildPrompt(context, repo) {
  const absolutePath = repositoryAbsPath(context.controlRoot, repo);
  const relativeScript = relativeCommandPath(absolutePath, path.join(context.controlRoot, "scripts/control-workspace-install.mjs"));
  const controlPath = slash(path.relative(absolutePath, context.controlRoot)) || ".";
  return `你是 ${repo.windowName} 子窗口，目标目录是 ${repo.path}，职责是：${repo.role}。

先读取本目录 AGENTS.md；如果缺少 codex-control-workspace scope 管理块，先确认目录范围，不要跨目录工作。

请先运行：
node ${relativeScript} status --json

确认当前目录属于 ${repo.windowName} 后，只处理本窗口职责内任务；需要写入或刷新本目录 AGENTS.md 时运行：
node ${relativeScript} write-agents --window ${repo.windowName} --write

控制仓库相对路径：${controlPath}
如目录、职责或控制计划不一致，停止并回报总控。`;
}

function promptsPayload() {
  const context = commandContext();
  const windowFilter = getValue("--window");
  const repositories = normalizedRepositories(context.config)
    .filter((repo) => repo.managedAgents !== false)
    .filter((repo) => !windowFilter || repo.windowName === windowFilter);
  if (windowFilter && repositories.length === 0) {
    fail(`No configured repository found for window: ${windowFilter}`);
  }
  return {
    ok: true,
    command: "prompts",
    prompts: repositories.map((repo) => ({
      windowName: repo.windowName,
      path: repo.path,
      prompt: buildChildPrompt(context, repo),
    })),
  };
}

const AGENTS_START = "<!-- codex-control-workspace:scope:start -->";
const AGENTS_END = "<!-- codex-control-workspace:scope:end -->";

function scopeBlock(context, repo) {
  const absolutePath = repositoryAbsPath(context.controlRoot, repo);
  const controlRelative = slash(path.relative(absolutePath, context.controlRoot)) || ".";
  return `${AGENTS_START}
## Codex Control Workspace Scope

- Control workspace: \`${controlRelative}\`
- Window name: \`${repo.windowName}\`
- Directory scope: \`${repo.path}\`
- Responsibility: ${repo.role}

Rules:
- Stay inside this repository unless the control workspace explicitly assigns a cross-repository task.
- Read this file before claiming work from the control workspace.
- If the requested window name, directory path, or responsibility does not match this block, stop and report the mismatch.
- Use the control workspace current plan and task package as the source of task scope; do not invent broader work from automation payloads.
${AGENTS_END}`;
}

function upsertScopeBlock(existing, block) {
  if (!existing.trim()) {
    return `# Repository Agent Instructions\n\n${block}\n`;
  }
  const start = existing.indexOf(AGENTS_START);
  const end = existing.indexOf(AGENTS_END);
  if (start >= 0 && end > start) {
    return `${existing.slice(0, start).trimEnd()}\n\n${block}\n\n${existing.slice(end + AGENTS_END.length).trimStart()}`.trimEnd() + "\n";
  }
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function writeAgentsPayload() {
  const context = commandContext();
  const windowFilter = getValue("--window");
  const all = hasFlag("--all");
  if (!windowFilter && !all) {
    fail("write-agents requires --window <WindowName> or --all.");
  }
  const targets = normalizedRepositories(context.config)
    .filter((repo) => repo.managedAgents !== false)
    .filter((repo) => all || repo.windowName === windowFilter);
  if (targets.length === 0) {
    fail(`No managed repository found${windowFilter ? ` for ${windowFilter}` : ""}.`);
  }

  const results = targets.map((repo) => {
    const absolutePath = repositoryAbsPath(context.controlRoot, repo);
    if (!isInside(absolutePath, context.parentRoot)) {
      fail(`Refusing to write outside parent workspace for ${repo.windowName}: ${repo.path}`);
    }
    if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
      return { windowName: repo.windowName, path: repo.path, ok: false, issue: "directory missing", wrote: false };
    }
    const agentsPath = path.join(absolutePath, "AGENTS.md");
    const existing = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
    const next = upsertScopeBlock(existing, scopeBlock(context, repo));
    const changed = next !== existing;
    if (write && changed) {
      writeFileSync(agentsPath, next);
    }
    return {
      windowName: repo.windowName,
      path: repo.path,
      agentsPath,
      ok: true,
      changed,
      wrote: write && changed,
    };
  });
  return { ok: results.every((result) => result.ok), command: "write-agents", wrote: write, results };
}

function help() {
  return {
    ok: true,
    commands: {
      discover: "List sibling repository candidates under the parent workspace.",
      status: "Show configured repositories, discovered siblings, and scope issues.",
      configure: "Write workspace.config.json after user-confirmed --repo mappings.",
      prompts: "Print child-window prompts for confirming scope and refreshing AGENTS.md.",
      "write-agents": "Append or refresh managed scope blocks in configured child AGENTS.md files.",
    },
    examples: [
      "node scripts/control-workspace-install.mjs discover --json",
      "node scripts/control-workspace-install.mjs configure --repo BaseWindow=../MyApp --repo PluginWindow=../MyPlugin --write",
      "node scripts/control-workspace-install.mjs prompts --window BaseWindow",
      "node scripts/control-workspace-install.mjs write-agents --all --write",
    ],
  };
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    printResult(help());
    break;
  case "discover": {
    const context = commandContext();
    printResult({
      ok: true,
      command: "discover",
      workspaceName: context.config.workspaceName,
      controlRoot: context.controlRoot,
      parentRoot: context.parentRoot,
      discoveredRepositories: discoverSiblingRepositories(context).map(({ absolutePath, ...item }) => item),
    });
    break;
  }
  case "status":
    printResult(statusPayload());
    break;
  case "configure":
    printResult(configurePayload());
    break;
  case "prompts":
    printResult(promptsPayload());
    break;
  case "write-agents":
    printResult(writeAgentsPayload());
    break;
  default:
    fail(`Unknown install command: ${command}`);
}
