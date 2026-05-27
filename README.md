# Codex Control Workspace

A local-first control workspace for coordinating multiple Codex windows across sibling repositories.

中文说明见 [README.zh-CN.md](README.zh-CN.md).

This repository packages a proven total-control workflow: a source `AGENTS.md` that can be unpacked to the parent workspace root, current-plan ledgers, task packages, visible heartbeat dispatch, target/controller skills, templates, installation helpers, and validation scripts. It is intentionally prompt-and-file based so a clone can work without a hosted service.

The intended GitHub install shape is not "put your repos inside this repo." Clone this control repo next to the repositories it will manage:

```text
MyWorkspace/
  codex-control-workspace/
  ProductRepo/
  CoreRepo/
  PluginRepo/
  DesignRepo/
  TestRepo/
```

## What This Is

- `AGENTS.md`: the source total-control rule surface. After `sync-root-agents --write`, the parent workspace `AGENTS.md` is the always-loaded Codex entrypoint.
- `workspace.config.json`: project/window names, sibling directory scope, and role labels.
- `skills/`: operational manuals for control, target windows, testing, ledgers, and VAD.
- `templates/`: human-authored plan, task package, handoff, and confirmation skeletons.
- `scripts/`: mechanical checks and local runtime helpers.
- `.workspace-active/`: ignored active working surface for the current index, current plans, TODO board, test exchange, Design inbox, and VAD state that should not be committed to the generic repo.
- `.workspace-local/`: ignored local runtime/config surface for thread ids, VAD state, and optional `workspace.config.json` overrides for one installation.
- `../workspace-ledger/`: the project-specific long-term ledger for requirement designs, archives, internal Design/Test surfaces, child-window records, and historical evidence. Keep it outside this generic repository.

## Quick Start

1. Create or choose a parent folder for the project family.
2. Clone this repository into that parent as a sibling of the repos it will manage.
3. Ask Codex to inspect the sibling directories, propose scope, and wait for your confirmation.
4. Decide whether `DesignWindow` and `TestWindow` are external sibling directories or internal workspace templates.
5. Write `workspace.config.json` only after the scope is confirmed.
6. Unpack the control `AGENTS.md` into the parent workspace root so Codex auto-loads the control rules when the parent folder is opened.
7. Generate child-window prompts and write managed access cards into sibling `AGENTS.md` files.
8. Keep `.workspace-active/workspace/index.md` as the single active control document entrypoint.
9. Run:

```sh
node scripts/control-workspace-install.mjs discover --json
node scripts/control-workspace-install.mjs status --json
node scripts/verify-control-center.mjs --require-task-packages --with-script-tests
```

For visible automation dispatch, register real Codex thread ids locally under `.workspace-local/visible-dispatch/`; never commit them.

## Codex-Assisted Installation

Use Codex as the installer and reviewer:

```text
You are installing codex-control-workspace. Read README.md, README.zh-CN.md,
AGENTS.md, workspace.config.json, and scripts/README.md. Run
node scripts/control-workspace-install.mjs discover --json, list sibling
repositories and proposed window roles, then wait for my confirmation before
running configure or write-agents.
```

After confirmation:

```sh
node scripts/control-workspace-install.mjs configure --repo BaseWindow=../ProductRepo --repo PluginWindow=../PluginRepo --internal-design --internal-test --write
node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
node scripts/control-workspace-install.mjs prompts
node scripts/control-workspace-install.mjs write-agents --all --write
node scripts/control-workspace-install.mjs write-agents --all --include-unmanaged --write
```

The managed `AGENTS.md` block is a compact child-window access card, not a full rule copy. It records the control workspace, window name, active index/status, current-plan entrypoint, VAD claim/finish boundary, and the per-window ledger path. Hard rules stay in the parent `AGENTS.md` and in each child repository's own stop card.

If the user already has design or test repositories, configure them explicitly instead of using the internal flags:

```sh
node scripts/control-workspace-install.mjs configure --repo DesignWindow=../DesignRepo --repo TestWindow=../TestRepo --write
node scripts/control-workspace-install.mjs sync-root-agents --write
node scripts/control-workspace-install.mjs sync-templates --all --write
```

External design/test directories receive only the minimum alignment files needed by the control scripts: Design operating policy, Design original-plan / requirement-design / signal / handoff templates, the Design handoff board, Test operation policy, Test handoff template, and Test alignment notes. Internal mode keeps the same functional surfaces in `../workspace-ledger/design/` and `../workspace-ledger/testing/`, so project-specific files remain outside this generic repository.

Each configured child window also gets a project-specific ledger directory such as `../workspace-ledger/BaseWindow/` or `../workspace-ledger/PluginWindow/`. Use those directories for cross-window task notes, backfills, evidence links, and acceptance records that used to live under project-specific `docs/<WindowName>/` folders.

## Design Rules

The repository keeps the original workflow shape on purpose. Most customization should be project parameters and naming, not a rewrite of the control discipline. If you need to change behavior, update `AGENTS.md`, the relevant skill, and script tests together.

## Configuration Boundary

Runtime scripts read project/window names, sibling repository paths, protected repo prefixes, Design handoff paths, test exchange paths, and optional process matchers from `workspace.config.json`. For one machine or one project family, an ignored `.workspace-local/workspace.config.json` overrides the tracked generic config without polluting the GitHub repository. The script test suite keeps legacy Alembic fixture data only as regression coverage for the workflow this repository was extracted from; new workspaces should customize the config file and human-facing text.
