import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const defaultWorkspaceConfig = {
  workspaceName: "ControlWorkspace",
  controlWindow: "ControlWorkspace",
  designWindow: "DesignWindow",
  testWindow: "TestWindow",
  realProjectWindow: "RealTestProject",
  baseWindow: "BaseWindow",
  workspaceRoot: "..",
  controlRepoDir: "codex-control-workspace",
  allowMissingRepos: true,
  dispatchWindows: [
    "BaseWindow",
    "CoreWindow",
    "AgentWindow",
    "DashboardWindow",
    "PluginWindow",
    "TestWindow",
  ],
  requiredDispatchWindows: [
    "BaseWindow",
    "CoreWindow",
    "AgentWindow",
    "DashboardWindow",
    "PluginWindow",
    "TestWindow",
    "RealTestProject",
  ],
  repoNames: ["BaseWindow", "CoreWindow", "AgentWindow", "DashboardWindow", "PluginWindow"],
  testExchangePath: "docs/workspace/current/test-exchange.md",
  designHandoffBoard: "../DesignWindow/docs/current/workspace-handoff-board.md",
  designHandoffInbox: "docs/workspace/current/design-handoff-inbox.md",
  runtimeProcessMatchers: [],
  runtimeProcessLabel: "configured",
  repositoryRoles: {
    BaseWindow: "Local platform or base runtime",
    CoreWindow: "Shared deterministic core",
    AgentWindow: "Agent runtime and orchestration",
    DashboardWindow: "Frontend UI",
    PluginWindow: "Host integration or plugin entry",
    DesignWindow: "Requirement design and handoff",
    TestWindow: "Real environment validation",
    RealTestProject: "Protected real test project",
  },
  repositories: [
    { windowName: "BaseWindow", path: "../BaseWindow", role: "Local platform or base runtime", managedAgents: true },
    { windowName: "CoreWindow", path: "../CoreWindow", role: "Shared deterministic core", managedAgents: true },
    { windowName: "AgentWindow", path: "../AgentWindow", role: "Agent runtime and orchestration", managedAgents: true },
    { windowName: "DashboardWindow", path: "../DashboardWindow", role: "Frontend UI", managedAgents: true },
    { windowName: "PluginWindow", path: "../PluginWindow", role: "Host integration or plugin entry", managedAgents: true },
    { windowName: "DesignWindow", path: "../DesignWindow", role: "Requirement design and handoff", managedAgents: true },
    { windowName: "TestWindow", path: "../TestWindow", role: "Real environment validation", managedAgents: true },
    { windowName: "RealTestProject", path: "../RealTestProject", role: "Protected real test project", managedAgents: false },
  ],
  protectedWorkspacePrefixes: [],
  disallowedTrackedPaths: [".DS_Store"],
};

export function getArgValue(args, name, fallback = null) {
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

export function workspaceConfigPath({ workspaceRoot = process.cwd(), args = process.argv.slice(2) } = {}) {
  const configArg = getArgValue(args, "--config", process.env.CODEX_CONTROL_WORKSPACE_CONFIG ?? "workspace.config.json");
  return path.isAbsolute(configArg) ? configArg : path.join(workspaceRoot, configArg);
}

export function readWorkspaceConfig({ workspaceRoot = process.cwd(), args = process.argv.slice(2), onError = null } = {}) {
  const configPath = workspaceConfigPath({ workspaceRoot, args });
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    if (onError) {
      onError(configPath, error);
      return {};
    }
    throw error;
  }
}

export function loadWorkspaceConfig(options = {}) {
  const userConfig = readWorkspaceConfig(options);
  const merged = { ...defaultWorkspaceConfig, ...userConfig };
  const repositoryRoles = {
    ...defaultWorkspaceConfig.repositoryRoles,
    ...(userConfig.repositoryRoles ?? {}),
  };
  const repositories = Array.isArray(userConfig.repositories)
    ? userConfig.repositories
        .filter((repo) => repo && repo.windowName && repo.path)
        .map((repo) => ({
          ...repo,
          role: repo.role ?? repositoryRoles[repo.windowName] ?? "Configured repository",
          managedAgents: repo.managedAgents !== false,
        }))
    : defaultWorkspaceConfig.repositories;
  const repositoryWindowNames = repositories.map((repo) => repo.windowName);
  const hasConfiguredRepositories = Array.isArray(userConfig.repositories) && repositoryWindowNames.length > 0;
  const dispatchWindows = Array.isArray(userConfig.dispatchWindows)
    ? userConfig.dispatchWindows
    : Array.isArray(userConfig.windows)
      ? userConfig.windows
      : hasConfiguredRepositories
        ? repositoryWindowNames.filter((name) => name !== merged.designWindow && name !== merged.realProjectWindow)
        : defaultWorkspaceConfig.dispatchWindows;
  const testWindow = userConfig.testWindow ?? merged.testWindow;
  const realProjectWindow = userConfig.realProjectWindow ?? merged.realProjectWindow;
  const requiredDispatchWindows = Array.isArray(userConfig.requiredDispatchWindows)
    ? userConfig.requiredDispatchWindows
    : hasConfiguredRepositories
      ? repositoryWindowNames
      : [...dispatchWindows, realProjectWindow].filter(Boolean);
  const repoNames = Array.isArray(userConfig.repoNames)
    ? userConfig.repoNames
    : hasConfiguredRepositories
      ? repositoryWindowNames.filter((name) => ![merged.designWindow, testWindow, realProjectWindow].includes(name))
      : dispatchWindows.filter((name) => name !== testWindow);

  return {
    ...merged,
    dispatchWindows,
    requiredDispatchWindows,
    repoNames,
    testWindow,
    realProjectWindow,
    repositoryRoles,
    repositories,
  };
}
