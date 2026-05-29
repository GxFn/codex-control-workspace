# Development Skills

This directory stores skills that are actively developed from
ControlWorkspace.

Development skills may be edited frequently and can be synced or linked into a
local Codex skills directory for live use when requested. They are not
automatically installed, bundled, or promoted to stable workspace assets.

Current development skills:

- `control-workspace-governance/`: total-control procedures and references for
  TODO, dispatch, testing, workspace ledger / document-surface, script pipeline,
  automation operation, phased migration, and control architecture work. Hard
  anti-failure rules remain in workspace `AGENTS.md`.
- `codex-automation-controller/`: total-control rules for the new
  CodexAutomationClosedLoop controller side: create dispatch packets, build
  delivery envelopes, review result envelopes, pull raw evidence, and decide
  next wave / stop.
- `codex-automation-target/`: target-window rules for the new
  CodexAutomationClosedLoop target side: consume one-shot wakeups, execute only
  the assigned dispatch packet, and return `TargetResultEnvelope`.
- `progressive-chain-validation/`: workspace bridge into the external PCV
  repository. It provides a lightweight ControlWorkspace `SKILL.md` while
  keeping canonical PCV method content in the independent source checkout.

Promotion path:

1. Develop in `skills/dev/<skill-name>/`.
2. Validate locally.
3. Use from Codex through an explicit sync/link step.
4. Promote to `skills/library/<skill-name>/` when the skill becomes stable.
