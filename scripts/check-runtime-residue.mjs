#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const json = args.includes("--json");
const strict = args.includes("--strict");

function parsePsLine(line) {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  return {
    pid: Number.parseInt(match[1], 10),
    command: match[2],
  };
}

function classify(command) {
  const lower = command.toLowerCase();
  if (
    command.includes("dist/bin/daemon-server.js") ||
    command.includes("daemon-server.js") ||
    /\balembic\s+start\b/.test(lower)
  ) {
    return "alembic-daemon";
  }

  if (command.includes("alembic-codex-mcp") || command.includes("alembic-codex-mcp-wrapper")) {
    return "codex-mcp";
  }

  if (
    (command.includes("vite") || command.includes("npm run dev")) &&
    (command.includes("AlembicDashboard") || command.includes("Alembic"))
  ) {
    return "dashboard-dev";
  }

  return null;
}

function readProcesses() {
  const output = execFileSync("ps", ["-axo", "pid,command"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\n")
    .slice(1)
    .map(parsePsLine)
    .filter(Boolean)
    .map((processInfo) => ({ ...processInfo, kind: classify(processInfo.command) }))
    .filter((processInfo) => processInfo.kind);
}

function shortCommand(command) {
  return command.length > 180 ? `${command.slice(0, 177)}...` : command;
}

let processes = [];
let readError = "";
try {
  processes = readProcesses();
} catch (error) {
  readError = error instanceof Error ? error.message : String(error);
}

const blockingKinds = new Set(["alembic-daemon", "dashboard-dev"]);
const blocking = processes.filter((processInfo) => blockingKinds.has(processInfo.kind));
const result = {
  ok: !strict || (!readError && blocking.length === 0),
  strict,
  readError,
  blocking,
  processes,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (readError) {
  console.log("Runtime residue check could not inspect processes.");
  console.log(`Reason: ${readError}`);
} else {
  console.log("Runtime residue check completed.");
  console.log(`Strict mode: ${strict ? "yes" : "no"}`);
  console.log(`Blocking residues: ${blocking.length}`);
  console.log(`Known Alembic-related processes: ${processes.length}`);

  if (processes.length > 0) {
    console.log("");
    console.log("| Kind | PID | Command |");
    console.log("| --- | ---: | --- |");
    for (const processInfo of processes) {
      console.log(`| ${processInfo.kind} | ${processInfo.pid} | ${shortCommand(processInfo.command).replaceAll("|", "\\|")} |`);
    }
  }
}

if (!result.ok) {
  process.exit(1);
}
