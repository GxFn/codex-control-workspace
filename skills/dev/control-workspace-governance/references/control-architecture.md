# Workspace Control Architecture

Use this reference when restructuring `AGENTS.md`, workspace skills, templates,
scripts, current plans, or Visible Automation Dispatch automation surfaces.

## Layer Map

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| `AGENTS.md` | Resident hard rules, stop cards, total-control identity, repository boundaries, confirmation gates, testing / acceptance bottom lines, and pointers to lower layers. | Long command sequences, examples, large templates, script troubleshooting, current wave facts. |
| Current control plan | The active user goal, completion definition, current evidence, task packages, send/no-send table, TODO rolling, test judgment, and automation mode chosen for this goal. | Permanent rules, old historical backfill, product implementation details. |
| Workspace skill `control-workspace-governance` | Procedures that are needed only for a matching workflow: TODO, dispatch, testing, script pipeline, ledger moves, and this architecture map. | Hard anti-failure rules that were added because total control repeatedly made mistakes. |
| VAD controller / target skills | Unattended heartbeat operating steps and role guards for controller-return or target-window heartbeats. | User goals, acceptance verdicts, raw thread ids, product implementation permission. |
| Templates | Reusable skeletons with required sections and script-readable anchors. | Current statuses, one-off decisions, long playbooks, runtime state. |
| Scripts | Mechanical sync, validation, import, archive, status, install-scope management, runtime, and VAD local-state operations with explicit write/apply gates. | Total-control judgment, evidence acceptance, TODO priority decisions, product code changes. |
| `.workspace-local/visible-dispatch/` | Local-only VAD mode, queues, automation run metadata, and raw thread ids. | Tracked docs, GitHub commits, human-facing status. |

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
| Controller self heartbeat | The current task is owned by `ControlWorkspace` itself. | Codex heartbeat attached to the current thread; no VAD target queue. | User stop, plan hard gate, or no useful next unit. |
| VAD target fan-out | The current plan has child-window tasks and verified thread registrations. | `visible-dispatch enqueue/arm-batch` plus Codex heartbeat creation for target windows. | Mode disabled, preflight failure, evidence gate, or group completion. |
| VAD controller return | The final target in a dispatch group has finished and total control must review. | Controller-return heartbeat plus `group-status` / `controller-tick`. | Acceptance decision, next-wave dispatch, or hard stop gate. |
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
