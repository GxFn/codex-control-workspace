#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const installScript = path.join(workspaceRoot, "scripts/control-workspace-install.mjs");

function writeFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${content.trimEnd()}\n`);
}

function makeFixture() {
  const parent = mkdtempSync(path.join(os.tmpdir(), "control-install-"));
  const control = path.join(parent, "codex-control-workspace");
  const base = path.join(parent, "BaseWindow");
  const plugin = path.join(parent, "PluginWindow");
  mkdirSync(path.join(control, "scripts"), { recursive: true });
  mkdirSync(path.join(base, ".git"), { recursive: true });
  mkdirSync(plugin, { recursive: true });
  writeFile(path.join(plugin, "AGENTS.md"), "# Plugin Instructions\n\nExisting rule.");
  writeFile(
    path.join(control, "workspace.config.json"),
    JSON.stringify(
      {
        workspaceName: "FixtureWorkspace",
        controlWindow: "FixtureWorkspace",
        workspaceRoot: "..",
        controlRepoDir: "codex-control-workspace",
        allowMissingRepos: true,
        repositoryRoles: {
          BaseWindow: "Base runtime",
          PluginWindow: "Plugin entry",
        },
        repositories: [
          { windowName: "BaseWindow", path: "../BaseWindow", role: "Base runtime", managedAgents: true },
        ],
      },
      null,
      2,
    ),
  );
  return { parent, control, base, plugin };
}

function run(fixture, args) {
  return spawnSync("node", [installScript, ...args, "--root", fixture.control], {
    cwd: fixture.control,
    encoding: "utf8",
  });
}

function runJson(fixture, args) {
  const result = run(fixture, [...args, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("discover lists sibling repositories and marks configured scopes", () => {
  const fixture = makeFixture();
  const payload = runJson(fixture, ["discover"]);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.discoveredRepositories.map((repo) => [repo.name, repo.path, repo.configured]),
    [
      ["BaseWindow", "../BaseWindow", true],
      ["PluginWindow", "../PluginWindow", false],
    ],
  );
});

test("configure writes user-confirmed sibling mappings into workspace.config.json", () => {
  const fixture = makeFixture();
  const payload = runJson(fixture, [
    "configure",
    "--repo",
    "BaseWindow=../BaseWindow",
    "--repo",
    "PluginWindow=../PluginWindow",
    "--write",
  ]);
  assert.equal(payload.wrote, true);
  const config = JSON.parse(readFileSync(path.join(fixture.control, "workspace.config.json"), "utf8"));
  assert.equal(config.workspaceRoot, "..");
  assert.equal(config.controlRepoDir, "codex-control-workspace");
  assert.deepEqual(config.repoNames, ["BaseWindow", "PluginWindow"]);
  assert.deepEqual(
    config.repositories.map((repo) => [repo.windowName, repo.path]),
    [
      ["BaseWindow", "../BaseWindow"],
      ["PluginWindow", "../PluginWindow"],
    ],
  );
});

test("prompts use sibling control script paths for child windows", () => {
  const fixture = makeFixture();
  const payload = runJson(fixture, ["prompts", "--window", "BaseWindow"]);
  assert.equal(payload.prompts.length, 1);
  assert.match(payload.prompts[0].prompt, /你是 BaseWindow 子窗口/);
  assert.match(payload.prompts[0].prompt, /node \.\.\/codex-control-workspace\/scripts\/control-workspace-install\.mjs status --json/);
});

test("write-agents is dry-run by default and writes managed scope blocks with --write", () => {
  const fixture = makeFixture();
  let payload = runJson(fixture, ["write-agents", "--window", "BaseWindow"]);
  assert.equal(payload.results[0].changed, true);
  assert.equal(payload.results[0].wrote, false);
  assert.equal(existsSync(path.join(fixture.base, "AGENTS.md")), false);

  payload = runJson(fixture, ["write-agents", "--window", "BaseWindow", "--write"]);
  assert.equal(payload.results[0].wrote, true);
  const baseAgents = readFileSync(path.join(fixture.base, "AGENTS.md"), "utf8");
  assert.match(baseAgents, /codex-control-workspace:scope:start/);
  assert.match(baseAgents, /Window name: `BaseWindow`/);

  runJson(fixture, [
    "configure",
    "--repo",
    "BaseWindow=../BaseWindow",
    "--repo",
    "PluginWindow=../PluginWindow",
    "--write",
  ]);
  payload = runJson(fixture, ["write-agents", "--window", "PluginWindow", "--write"]);
  assert.equal(payload.results[0].wrote, true);
  const pluginAgents = readFileSync(path.join(fixture.plugin, "AGENTS.md"), "utf8");
  assert.match(pluginAgents, /Existing rule/);
  assert.match(pluginAgents, /Window name: `PluginWindow`/);
});
