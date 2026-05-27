# Codex Control Workspace

A local-first control workspace for coordinating multiple Codex windows across repositories.

This repository packages the workflow that was proven in `AlembicWorkspace`: a total-control `AGENTS.md`, current-plan ledgers, task packages, visible heartbeat dispatch, target/controller skills, templates, and validation scripts. It is intentionally prompt-and-file based so a clone can work without a hosted service.

## What This Is

- `AGENTS.md`: the always-loaded total-control rule surface. Keep hard stop rules here.
- `workspace.config.json`: project/window names and role labels.
- `skills/`: operational manuals for control, target windows, testing, ledgers, and VAD.
- `templates/`: human-authored plan, task package, handoff, and confirmation skeletons.
- `scripts/`: mechanical checks and local runtime helpers.
- `docs/workspace/`: the current control ledger, TODO board, test exchange, and long-term map.

## Quick Start

1. Copy this repository for your project.
2. Edit `workspace.config.json` and the top project naming in `AGENTS.md`.
3. Keep `docs/workspace/index.md` as the single entrypoint.
4. Create a current control plan from `templates/workspace-control-plan-template.md`.
5. Run:

```sh
node scripts/verify-control-center.mjs --require-task-packages --with-script-tests
```

For visible automation dispatch, register real Codex thread ids locally under `.workspace-local/visible-dispatch/`; never commit them.

## Design Rules

The repository keeps the original workflow shape on purpose. Most customization should be project parameters and naming, not a rewrite of the control discipline. If you need to change behavior, update `AGENTS.md`, the relevant skill, and script tests together.

## First Version Scope

This first extraction includes the proven workspace machinery and a generic configuration file. Some documents and script messages still preserve Alembic-derived examples or file names where the scripts depend on them; those are safe examples, not runtime secrets. Future work should add an init command that generates a fully renamed project skeleton from `workspace.config.json`.
