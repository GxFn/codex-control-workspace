import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const defaultWorkspaceConfig = {
  workspaceName: "ControlWorkspace",
  controlWindow: "ControlWorkspace",
  designWindow: "DesignWindow",
  testWindow: "TestWindow",
  realProjectWindow: "RealTestProject",
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
  designHandoffBoard: "DesignWindow/docs/current/workspace-handoff-board.md",
  designHandoffInbox: "docs/workspace/current/design-handoff-inbox.md",
  runtimeProcessMatchers: [],
  runtimeProcessLabel: "configured",
  protectedWorkspacePrefixes: [
    "BaseWindow/",
    "CoreWindow/",
    "AgentWindow/",
    "DashboardWindow/",
    "PluginWindow/",
    "TestWindow/",
    "RealTestProject/",
  ],
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
  const dispatchWindows = Array.isArray(userConfig.dispatchWindows)
    ? userConfig.dispatchWindows
    : Array.isArray(userConfig.windows)
      ? userConfig.windows
      : defaultWorkspaceConfig.dispatchWindows;
  const testWindow = userConfig.testWindow ?? merged.testWindow;
  const realProjectWindow = userConfig.realProjectWindow ?? merged.realProjectWindow;
  const requiredDispatchWindows = Array.isArray(userConfig.requiredDispatchWindows)
    ? userConfig.requiredDispatchWindows
    : [...dispatchWindows, realProjectWindow].filter(Boolean);
  const repoNames = Array.isArray(userConfig.repoNames)
    ? userConfig.repoNames
    : dispatchWindows.filter((name) => name !== testWindow);

  return {
    ...merged,
    dispatchWindows,
    requiredDispatchWindows,
    repoNames,
    testWindow,
    realProjectWindow,
  };
}
