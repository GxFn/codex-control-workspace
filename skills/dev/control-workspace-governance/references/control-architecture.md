# Workspace Control Architecture

Use this reference when restructuring `AGENTS.md`, workspace skills, templates,
scripts, current plans, or automation surfaces.

## Layer Map

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| `AGENTS.md` | Resident hard rules, stop cards, total-control identity, repository boundaries, confirmation gates, testing / acceptance bottom lines, and pointers to lower layers. | Long command sequences, examples, large templates, script troubleshooting, current wave facts. |
| Current control plan | The active user goal, completion definition, current evidence, task packages, send/no-send table, TODO rolling, test judgment, and automation mode chosen for this goal. | Permanent rules, old historical backfill, product implementation details. |
| Workspace skill `control-workspace-governance` | Procedures that are needed only for a matching workflow: TODO, dispatch, testing, script pipeline, ledger moves, and this architecture map. | Hard anti-failure rules that were added because total control repeatedly made mistakes. |
| Codex automation controller / target skills | Unattended heartbeat operating steps, dispatch/result envelope handling, and role guards for controller-return or target-window wakeups. | User goals, acceptance verdicts, raw thread ids, product implementation permission. |
| Templates | Reusable skeletons with required sections and script-readable anchors. | Current statuses, one-off decisions, long playbooks, runtime state. |
| Scripts | Mechanical sync, validation, import, archive, status, install-scope management, runtime, and closed-loop contract operations with explicit write/apply gates. | Total-control judgment, evidence acceptance, TODO priority decisions, product code changes. |
| `.workspace-local/codex-automation-loop/` | Local-only dispatch packets, delivery envelopes, target result envelopes, stop markers, and delivery support state. | Tracked docs, GitHub commits, human-facing status, acceptance verdicts. |

## Asset Ownership Decision Matrix

Use this matrix before shrinking prompts, moving rules, changing templates, or
adding scripts. `keep` means the asset remains a primary owner. `downshift`
means repeated detail should move to a lower layer while the resident boundary
or pointer remains. `rewrite` means the current wording should be made more
precise without changing ownership. `discard` means the content should not be
preserved except as historical archive.

| Asset | Keep | Downshift | Rewrite | Discard |
| --- | --- | --- | --- | --- |
| Root `AGENTS.md` and control-source `AGENTS.md` | Stop cards, total-control identity, confirmation gates, testing / acceptance boundaries, dispatch / automation hard gates, workspace ownership map, and skill pointers. | Long command examples, script troubleshooting, template bodies, wave-specific facts, and one-off status text. | Dense rule clusters may be split into clearer stop-card bullets only after mapping old rule to new owner. | No known anti-failure rule may be discarded; obsolete mechanism names may be removed after the new owner is explicit. |
| `control-workspace-governance` skill and references | Workflow procedures, command order, examples, script-selection rules, ledger placement details, migration checklists, and this matrix. | Hard stop rules must be mirrored back to `AGENTS.md`; current-plan facts stay in current ledgers. | References should name the trigger scenario and the resident `AGENTS.md` boundary they supplement. | References that only repeat current-plan facts or old mechanism manuals should be archived or removed. |
| Codex automation controller / target skills | Packet / envelope / result handling, one-shot heartbeat behavior, role guards, review-results operation, and delivery troubleshooting. | User goal, scope, acceptance verdicts, and cross-window scheduling stay in the current plan and total-control review. | Prompts should be semantic wakeup envelopes with dynamic variables and skill names, not command manuals. | Old `claim / finish / chain-next / VAD` manuals should not be revived as active protocol. |
| Templates | Required headings, script-readable anchors, enum fields, narrow tables, placeholder labels, and brief boundary reminders. | Long playbooks, repository-specific facts, task examples, and troubleshooting move to references or current plans. | Templates should be small enough to copy without deleting irrelevant sections. | Task-specific status, commit hashes, local paths, and current wave facts. |
| Scripts | Mechanical validation, sync, import, archive, status, install-scope writes with explicit gates, and local automation contract files. | Decisions about readiness, TODO priority, evidence acceptance, or next user goal stay with total control. | JSON output should expose completion cues such as `scriptComplete` and `agentNext` where Codex needs to continue. | Scripts that silently write child repos, accept evidence, or choose scope without a current-plan decision. |
| `.workspace-active/workspace/current/` | Active goal, current status, current plan, task packages, TODO / Backlog, test exchange, backfills, and short-lived evidence pointers. | Permanent rules and reusable formats move to `AGENTS.md`, references, or templates; completed history moves to `workspace-ledger`. | Current docs should name the first blocker and allowed / forbidden conclusions before writing sync metadata. | Duplicated history, stale prompt blocks, and archived waves that are no longer current. |
| `workspace-ledger/` | Long-lived requirements, goal-stage confirmations, repo-specific collaboration records, accepted history, archive maps, and project ledger. | Active execution state stays in `.workspace-active`; generic reusable structure stays in templates/references. | Ledger entries should be linked from the active index when still relevant. | Temporary runtime state, raw thread ids, local paths, and noisy active backfill. |
| Child repository `AGENTS.md` managed blocks | Scope card, parent pointers, local stop card, repo responsibility, active-plan pointer, and role guard. | Current wave details, other-window tasks, total-control verdicts, and full prompt text stay out of child `AGENTS.md`. | Managed blocks should be regenerated from config rather than manually edited. | Repeated total-control hard rules that do not apply to the child window, stale old workspace paths, and fake thread ids. |
| `.workspace-local/` runtime | Local config overlays, real thread ids, delivery runtime, stop markers, and machine-local state. | Human-readable status moves to current plans; durable history moves to `workspace-ledger`. | Local files should be inspectable by scripts but never required in Git. | Any tracked or prompt-visible raw thread id. |
| PCV / PCVM skill and outputs | Evidence labels, stage-node vocabulary, scorecard readiness hints, and progressive-chain planning method. | Workspace status machine and total-control verdict stay in Workspace current plans. | PCV output should be projected into Workspace task packages and evidence sections. | A second independent control state machine. |

## Default Control Loop

Use this loop for ordinary ControlWorkspace work unless the user explicitly
asks for a different mode:

| Step | Owner | Input | Output | Stop Gate |
| --- | --- | --- | --- | --- |
| Intake | Total control | User request, Design handoff, TODO candidate, or automation return. | Classified request with source and confirmation state. | Stop if target, completion definition, scope, or user confirmation is unclear. |
| Decision | Total control | Intake plus local evidence and current plan. | Accept / defer / request design / create TODO / create plan decision. | Stop if the decision changes user scope, route, visible behavior, or repository boundary without confirmation. |
| Ledger | Total control, with scripts only for mechanical sync. | Accepted decision. | Current plan, TODO, Design inbox, or workspace-ledger entry. | Stop if a script would turn a suggestion into an accepted task. |
| Plan | Total control. | Ledger entry and evidence. | Task package, send/no-send table, test boundary, and validation plan. | Stop if package does not map to the final goal or lacks evidence requirements. |
| Deliver | Manual prompt or automation delivery adapter. | Task package and target window. | Lightweight wakeup prompt or delivery envelope. | Stop if target window, thread id, or route is not proven. |
| Result | Target window. | Its assigned task package only. | Target result envelope or manual backfill with raw evidence pointers. | Stop if the target tries to accept, route, or perform another window's task. |
| Review | Total control. | Result envelope/backfill plus raw evidence. | Accept / rework / blocked / next plan decision. | Stop if evidence is missing, conflicts, or only repeats a self-report. |
| Record | Total control, with scripts only for mechanical sync/archive. | Review decision. | Updated current plan/status/TODO/archive. | Stop if recording would hide an unresolved issue or close an incomplete goal. |

Manual prompts and automation envelopes are both delivery mechanisms for the
same task package. They must not carry different goals, hidden scope, or
different completion definitions.

## Handoff State Enums

New Design handoff surfaces should use machine-readable enum fields alongside
human prose. Old rows may remain readable through compatibility logic, but new
templates should prefer these fields:

| Field | Values | Purpose |
| --- | --- | --- |
| `用户确认状态` / `userConfirmationStatus` | `unconfirmed`, `confirmed`, `needs-confirmation`, `not-required`, `superseded` | Machine gate for whether a handoff can become a current plan or TODO. |
| `状态` / `handoffStatus` | `draft`, `ready-for-workspace`, `accepted-by-workspace`, `needs-design`, `paused`, `archived`, `research`, `absorbed-by-codex-loop` | Handoff lifecycle. |
| `主线关系状态` / `mainlineRelation` | `none`, `todo-candidate`, `next-mainline`, `blocks-current`, `interrupts-current`, `after-current` | Machine-readable relationship to current mainline. |
| `优先级枚举` / `priority` | `P0`, `P1`, `P2`, `P3` | Sorting hint only; total control still decides scheduling. |

If enum values and prose conflict, scripts should fail closed and total control
must review. Do not silently prefer whichever field gives the most convenient
answer.

## Resident Rule Test

Before moving anything out of `AGENTS.md`, ask:

1. Was this rule added to prevent a known total-control failure mode?
2. Would hiding it make it easier to skip thinking, over-delegate, over-document,
   trust a window self-report, misuse `TestWindow`, or fabricate progress?
3. Does the rule need to be checked before most replies, file edits, dispatches,
   tests, acceptances, or automation jumps?

If yes, keep the rule in `AGENTS.md`. A skill may repeat or operationalize it,
but must not become the only place where it exists.

## Pointer Contract

Every pointer from `AGENTS.md` to a skill or reference should state:

- the trigger scenario;
- the lower-layer file to read;
- the resident boundary that still stays in `AGENTS.md`;
- the validation command or evidence surface, when relevant.

Do not write vague pointers such as "see skill for details" when the missing
detail changes safety, acceptance, testing, or repository boundaries.

## Template Contract

Templates should be small enough to copy without editing large irrelevant
sections. A template that contains a long operating manual, many conditional
rules, or topic-specific examples is probably a skill reference or policy doc.

Keep templates focused on:

- required headings;
- table shapes consumed by scripts;
- placeholder labels;
- one short reminder for hard boundaries.

## Script Contract

Scripts can automate repeated mechanical work only after total control has made
the decision. They should:

- default to check / dry-run, or require explicit `--write` / `--apply`;
- print machine-readable JSON when used by automation;
- keep writes inside workspace-owned docs or local runtime unless the user has
  confirmed an install-scope write such as child `AGENTS.md`, or a current plan
  explicitly authorizes more;
- fail closed when required thread ids, anchors, task packages, TODO sections,
  or test-boundary fields are missing.

Scripts must not silently accept evidence, choose the next user goal, edit child
repositories, or turn a failed gate into a successful status.

## Automation Classes

| Class | Use When | Mechanism | Stop Condition |
| --- | --- | --- | --- |
| Controller self heartbeat | The current task is owned by `ControlWorkspace` itself. | Codex heartbeat attached to the current thread; no target dispatch packet. | User stop, plan hard gate, or no useful next unit. |
| Closed-loop target fan-out | The current plan has child-window tasks and verified thread registrations. | Total control creates dispatch packets and delivery envelopes; delivery adapter creates Codex heartbeats. | Delivery failure, evidence gate, or group ready for controller review. |
| Closed-loop controller return | Target result envelopes for a dispatch group are ready or a target reports blocked. | Controller-return heartbeat plus `review-results`; total control then pulls raw evidence. | Acceptance decision, next-wave dispatch, hard stop gate, or missing evidence. |
| Manual discussion | User is designing, asking, or redirecting. | Normal chat. | Do not treat as unattended automation. |

Automation never replaces total-control judgment. It only wakes the right thread
or window to continue a decision that the current plan already permits.

## Migration Checklist

When refreshing workspace control assets:

1. Build an inventory of current `AGENTS.md`, skills, references, templates,
   scripts, current plans, and local runtime surfaces.
2. For each duplicated or dense rule, classify it as resident hard rule,
   workflow procedure, template field, script contract, or current-plan fact.
3. For every hard rule moved or rewritten, record old owner and new owner.
4. Update indexes (`skills/README.md`, `templates/README.md`,
   `scripts/README.md`, workspace index/current status) only after the owner is
   decided.
5. Run the smallest validation command that proves the touched layer, then the
   broader control-center verification before acceptance.
