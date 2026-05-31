# Direct Thread Window Configuration

This reference defines the file contract for child-window direct thread
dispatch. It is a design and implementation guide for
`CODEX-DIRECT-THREAD-DISPATCH-2026-05-31`; it does not itself authorize
dispatch, acceptance, or product implementation.

## Principles

- Direct thread dispatch is the normal work pipeline.
- Raw Codex thread ids are local runtime state only. They must stay under
  `.workspace-local/` and must never be copied into tracked docs, prompts,
  commits, GitHub, or result text.
- `workspace.config.json` defines repository/window identity. It does not store
  thread ids or delivery runtime state.
- A child window may only execute work assigned to its configured window name
  and current dispatch packet.
- Keep-live is runtime liveness support for unattended automation mode. It is
  not delivery transport, target work, or acceptance evidence.
- Delivery success proves only that the prompt reached a thread. Total control
  still needs a `TargetResultEnvelope` and raw evidence before acceptance.

## File Owners

| File / directory | Owner | Purpose | Tracked |
| --- | --- | --- | --- |
| `workspace.config.json` | workspace install scope | Generic repository/window map and roles. | yes |
| `.workspace-local/workspace.config.json` | local install scope | Machine-specific repository/window map override. | no |
| `.workspace-local/codex-automation-loop/thread-registry/<window>.json` | local runtime | Real Codex thread registration for one window. | no |
| `.workspace-local/codex-automation-loop/window-config/<window>.json` | local runtime | Derived child-window dispatch config, safe to regenerate from workspace config + thread registry. | no |
| `.workspace-local/codex-automation-loop/dispatch-packets/*.json` | total control | Controller-created work packet. | no |
| `.workspace-local/codex-automation-loop/delivery-envelopes/*.json` | total control / delivery adapter | Mechanical delivery plan that references a dispatch packet. | no |
| `.workspace-local/codex-automation-loop/delivery-runs/*.json` | delivery adapter | Actual direct-thread send attempt, readback, and failure evidence. | no |
| `.workspace-local/codex-automation-loop/target-results/*.json` | target window | Target result envelope returned to total control. | no |
| `.workspace-local/codex-automation-loop/keep-live/state.json` | delivery support | Current unattended keep-live process/state. | no |
| `.workspace-local/codex-automation-loop/stop.json` | total control | Explicit stop marker for unattended automation. | no |

## Thread Registration

One file per real Codex window:

```json
{
  "kind": "CodexWindowThreadRegistration",
  "version": 2,
  "windowName": "AlembicPlugin",
  "displayTitle": "AlembicPlugin 职责窗口",
  "deliveryRole": "target",
  "threadId": "<local-runtime-only>",
  "cwd": "/absolute/project/or/workspace/path",
  "responsibilityRoot": "/absolute/repository/or/testing/root",
  "writeBoundary": [
    "/absolute/path/that/window/may/write"
  ],
  "canonicalUse": "Stable purpose of this Codex thread.",
  "supersedesWindowNames": [],
  "registeredAt": "2026-05-31T00:00:00.000Z",
  "lastVerifiedAt": "2026-05-31T00:00:00.000Z"
}
```

Required fields:

- `windowName`: must match a configured dispatch window or explicitly allowed
  testing / design window.
- `deliveryRole`: `controller`, `target`, `test-target`, `design`, or
  `observer`. Only `controller`, `target`, and `test-target` are dispatchable.
- `threadId`: required for direct dispatch and local-only.
- `cwd`: the project cwd used by the Codex thread.
- `responsibilityRoot`: the real repository or testing responsibility root.

Compatibility:

- Existing `CodexAutomationThreadRegistration` v1 files may be read, but new
  writes should migrate to `CodexWindowThreadRegistration` v2.
- A v1 `role` value maps to v2 `deliveryRole`.
- If `cwd` and `responsibilityRoot` differ, the delivery adapter must preserve
  both; target prompts must state the window responsibility, not infer it from
  cwd alone.

## Derived Window Config

`window-config/<window>.json` is safe to regenerate. It combines local config,
repository role, thread registration, and current automation policy without
duplicating raw thread ids into tracked docs.

```json
{
  "kind": "CodexSubwindowDispatchConfig",
  "version": 1,
  "windowName": "AlembicPlugin",
  "repositoryPath": "../AlembicPlugin",
  "responsibility": "Codex MCP, skills, channel/marketplace, plugin runtime",
  "dispatchable": true,
  "threadRegistryFile": "thread-registry/AlembicPlugin.json",
  "delivery": {
    "transport": "direct-thread",
    "requireThread": true,
    "busyPolicy": "append-if-steerable",
    "missingThread": "fail-closed",
    "readbackRequired": true
  },
  "automation": {
    "mode": "manual-or-unattended",
    "continuousWhenEnabled": true,
    "keepLive": "required-when-automation-enabled"
  },
  "result": {
    "returnRoute": "controller",
    "resultEnvelopeRequired": true
  }
}
```

No field in `window-config` may contain raw thread ids. Store only file refs or
redacted/hashes when a diagnostic needs identity continuity.

## Delivery Envelope Changes

The code-stage `DeliveryEnvelope` should stop producing legacy schedule or
automation payloads. It should become a direct-thread plan:

```json
{
  "kind": "DeliveryEnvelope",
  "version": 2,
  "deliveryId": "delivery-...",
  "sourcePacketId": "dispatch-packet-id",
  "targetWindow": "AlembicPlugin",
  "taskId": "TASK-ID",
  "dispatchGroup": "group-id",
  "controlPlan": ".workspace-active/workspace/current/plan.md",
  "prompt": "继续当前窗口任务：...",
  "returnRoute": "controller",
  "transport": {
    "kind": "direct-thread",
    "threadRegistryFile": "thread-registry/AlembicPlugin.json",
    "busyPolicy": "append-if-steerable",
    "readbackRequired": true
  },
  "automation": {
    "enabled": false,
    "continuousLoop": false,
    "keepLive": false
  },
  "loopGuard": {
    "returnReason": "result-ready",
    "controllerReviewRequired": true,
    "noEligibleTaskAction": "stop-without-next-delivery",
    "repeatControllerReturnForbidden": true
  },
  "correlationId": "group-id",
  "createdAt": "2026-05-31T00:00:00.000Z"
}
```

When the user explicitly enables unattended automation for the current plan:

```json
{
  "automation": {
    "enabled": true,
    "continuousLoop": true,
    "keepLive": true,
    "keepLiveStateFile": "keep-live/state.json"
  }
}
```

Forbidden in v2 delivery envelopes:

- `schedule.kind = "heartbeat"`
- `rrule`
- `codexAutomation`
- raw `targetThreadId` in default JSON output

Controller-return exit logic:

- Build controller return only after `review-results` is no longer `wait`.
- Send it to the existing registered controller thread; do not create a new
  controller window only for return.
- On receipt, total control reviews evidence and current TODOs. If no eligible
  next task remains, it stops without creating another delivery.
- A controller-return message must never create another controller-return for
  itself.

## Delivery Run Evidence

Every actual thread-send attempt writes a run file:

```json
{
  "kind": "DirectThreadDeliveryRun",
  "version": 1,
  "deliveryRunId": "run-...",
  "deliveryId": "delivery-...",
  "targetWindow": "AlembicPlugin",
  "transport": "direct-thread",
  "status": "sent",
  "thread": {
    "windowName": "AlembicPlugin",
    "threadIdRedacted": true,
    "threadRegistryFile": "thread-registry/AlembicPlugin.json"
  },
  "hostAction": {
    "method": "send_message_to_thread",
    "mode": "new-turn"
  },
  "readback": {
    "checked": true,
    "ok": true,
    "evidence": "host-readback-summary-or-local-tool-output"
  },
  "keepLive": {
    "enabledForRun": false,
    "stateFile": null
  },
  "createdAt": "2026-05-31T00:00:00.000Z"
}
```

Allowed `status` values:

- `sent`: host send succeeded and readback evidence exists.
- `blocked`: missing thread registration, no host thread-send capability, or
  busy not-steerable target.
- `failed`: host send attempted but failed; include error summary.

`sent` is not acceptance. The target still must return a result envelope.

## Keep-Live State

Keep-live is required only when unattended automation is enabled:

```json
{
  "kind": "AutomationKeepLiveState",
  "version": 1,
  "enabled": true,
  "automationRunId": "run-or-dispatch-group",
  "mechanism": "macos-caffeinate",
  "startedAt": "2026-05-31T00:00:00.000Z",
  "pid": 12345,
  "status": "running",
  "lastCheckedAt": "2026-05-31T00:00:00.000Z",
  "error": null
}
```

Keep-live failure blocks unattended reliability, not the target task itself.
Total control records it as automation readiness risk and decides whether to
continue manually.

## Stop And Cleanup

- `stop.json` stops future unattended automation dispatch. It does not delete
  past delivery evidence.
- Stale legacy delivery envelopes with `schedule.kind = "heartbeat"` should be
  ignored for new dispatch and may be archived or deleted only by total-control
  decision.
- Thread registrations are not deleted by default. Replace them only when the
  user opens a new responsibility window or explicitly changes the canonical
  thread.

## Implementation Checklist

1. Add `window-config/` and `delivery-runs/` directories to the local runtime
   initializer.
2. Extend thread registration from v1 to v2 while reading v1 as compatibility.
3. Generate `CodexSubwindowDispatchConfig` from workspace config + thread
   registry without exposing raw thread ids.
4. Change `build-delivery` / `build-controller-return` to v2 direct-thread
   envelopes and remove legacy schedule / automation payloads.
5. Add a delivery adapter entry that consumes v2 envelopes, calls the host
   thread-send capability, writes `DirectThreadDeliveryRun`, and fails closed
   when thread-send cannot be proven.
6. Add automation-enabled mode that loops controller review / next-wave
   dispatch until final completion, hard gate, user stop, missing evidence that
   needs human judgment, or no eligible TODO.
7. Add keep-live start/check/stop state under `keep-live/state.json` for
   automation-enabled runs.
8. Add unit tests for v1 registry compatibility, v2 redaction, missing thread
   fail-closed, direct delivery run evidence, continuous-loop stop conditions,
   and keep-live state failures.
