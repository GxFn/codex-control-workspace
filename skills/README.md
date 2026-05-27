# Workspace Skills

This directory stores reusable Codex skill assets owned by ControlWorkspace.

These files are workspace assets only. They are not automatically installed into
Codex, bundled into PluginWindow, or published anywhere unless a control plan
explicitly assigns that work.

Recommended layout:

- `dev/<skill-name>/`: skills that are actively developed from this workspace
  and may be synced into the local Codex skills directory for live use.
- `library/<skill-name>/`: complete workspace-approved skill assets.
- `templates/`: reusable skill templates and drafting helpers.

Skill assets kept here must:

- describe their trigger, scope, and expected user intent;
- avoid secrets, local absolute paths, and environment-specific assumptions;
- name their intended installation or consumption path when they are promoted;
- stay focused on workflow guidance, verification, or coordination rather than
  duplicating child repository runtime implementation.

Current drafts:

- `dev/control-workspace-governance/`: trial extraction for bulky
  ControlWorkspace control-center details. It currently holds TODO / Backlog,
  window dispatch, testing / validation, workspace ledger / document-surface,
  workspace script pipeline, VAD operation, phased migration, and workspace
  control architecture references that used to live inline in `AGENTS.md` or
  ad hoc conversation memory.
  `AGENTS.md` remains the hard boundary source and points to this skill only
  when those detailed workflows are needed. Anti-failure hard rules must stay
  in `AGENTS.md`, not only here.
- `dev/visible-automation-dispatch-target/`: target-window skill for Visible
  Automation Dispatch heartbeat tasks. It keeps unattended claim / finish /
  next-heartbeat courier rules, target-window role guards, `TestWindow`
  boundaries, and local thread-id handling out of long generated prompts and
  child-repository `AGENTS.md` files.
- `dev/visible-automation-dispatch-controller/`: total-control skill for
  Visible Automation Dispatch controller-return heartbeats. It keeps
  unattended acceptance, self-test / real-test judgment, next-wave decisions,
  and anti-small-task-drift rules close to the automation controller without
  moving hard boundaries out of `AGENTS.md`.
- `dev/progressive-chain-validation/`: source ledger for the external PCV
  repository. It is not a complete Codex skill package and intentionally has no
  `SKILL.md`; do not install or advertise this directory as a runnable skill.

Development workflow:

1. Keep active skill work in `skills/dev/<skill-name>/`.
2. Validate the skill structure before local use.
3. Sync or link the skill into the local Codex skills directory only when the
   user explicitly wants to use it from Codex runtime.
4. Promote to `skills/library/<skill-name>/` only when the skill is stable and
   meant to be a workspace-approved reusable asset.
