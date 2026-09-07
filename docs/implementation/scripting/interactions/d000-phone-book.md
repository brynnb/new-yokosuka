# D000 telephone-book interaction

Status: implemented reviewed vertical slice; broader presentation fidelity is
still incomplete
Last reviewed: August 2, 2026

## Player outcome

Using the Dobuita telephone book can run the recovered room-owned interaction:
Ryo is placed under scripted control, the event camera and native motion
sequence run, closed and opened telephone-book props attach to the authored
Ryo controls, SA1071 dialogue and the proven room sound are presented, cleanup
runs, movement is restored, and the persistent D000 owner returns to its poll
loop.

The database-backed Yarn entry selects and owns the event lifetime. It does not
reimplement the native sequence or grant durable story progress from the
client's completion acknowledgement.

## Stable identities

| Identity | Value |
| --- | --- |
| Area | `D000` |
| Selected object | `TBK1` |
| Object action | `1` |
| Database slug | `original-d000-telephone-book` |
| Yarn start node | `Start` |
| Trigger | `use / D000 / TBK1` |
| Specialized activity | `d000.telephone-book.native` |
| Native program | `disc1-d000-phone-book-0x6a49c` |
| Persistent owner | `0x69b14` |
| Interaction child | `0x6a49c` |
| Dialogue region | `0x6b06c` |
| Player actor | `AKIR` |
| Event camera | `4310` |
| Dialogue archive | `SA1071.AFS` |

The program is sourced from Disc 1 `SCENE/01/D000/MAPINFO.BIN`, whose reviewed
route declaration records SHA-256
`7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e`.

## End-to-end ownership

```text
player selects and uses TBK1
  -> browser sends exact use/D000/TBK1 selector
  -> server selects and pins original-d000-telephone-book
  -> Yarn yields start_activity("d000.telephone-book.native")
  -> browser presentation transaction starts lazily
  -> NativeScriptActivityRunner validates D000 and the selected TBK1 object
  -> selected-object action 1 is claimed
  -> native D000 persistent owner 0x69b14 receives the TBK1 event word
  -> owner evaluates its exact guards and calls child 0x6a49c
  -> native interpreter drives camera, motion, props, sound, dialogue, waits,
     and cleanup through reusable adapters
  -> owner reaches its maintenance checkpoint and resumes its poll loop
  -> activity restores presentation-only working state and releases TBK1
  -> browser acknowledges start_activity cleanup
  -> server completes the pinned script event with no durable reward
```

The child must not be called directly in production. D000 launches owner
`0x69b14` once from room initialization (`0x8d548`, launch call `0x8da8a`). The
owner initializes its controller, polls operation `0x0116(-1)`, dispatches
authored event words, services status, waits one native tick at `0x69e8e`, and
loops. The native lifecycle checkpoints at that maintenance wait rather than
at arbitrary waits inside the child.

## Selection and guards

The browser must retain the exact selected `TBK1` scene object. The specialized
activity descriptor requires D000, `TBK1`, action 1, and forbids durable client
effects.

The native owner dispatches the child only for event code `TBK1` after its two
free-conversation reads `(11,190)` and `(11,200)`, with the authored
primary-runtime transitions around the child. The debug-ready scenario supplies
only evidence-backed temporary state; ordinary gameplay must obtain eligible
state from real progression.

## Database/Yarn layer

The reviewed source is intentionally small:

```yarn
title: Start
tags: original disc1 D000 TBK1 specialized-activity
---
<<start_activity "d000.telephone-book.native">>
<<complete>>
===
```

This is not a shortcut around native behavior. The complete recovered sequence
already has one room owner, interpreter, and rollback boundary. Yarn adds
authoritative selection, immutable versioning, cancellation, trace history,
and community repository integration without duplicating low-level operations.

The official import records six native sources: the room program, SA1071
archive, D000 motion bank, closed prop, opened prop, and bounded presentation
evidence. Its integration test verifies that PostgreSQL execution yields the
exact activity and completes with no flag or inventory mutation.

## Native visible sequence

The bounded implementation includes:

- event camera 4310;
- Ryo motion requests `0x700f`, `0x700a`, `0x700b`, `0x7007`, and `0x7009`;
- the closed `TBK1` and opened `TBK3` prop states;
- exact FIXO attach/detach behavior and recovered local transforms;
- SA1071 dialogue alternatives through native dialogue presentation;
- the proven D000 F1DOBUIT sound command from child `0x6be1c`;
- actor look-point, controller, resource, and associated-record work required
  by the represented path;
- motion-status and scheduler waits; and
- the authored postlude and persistent-owner checkpoint.

The motion requests use `play/assets/dobuita/M_D000.MOTN` with the route's
native bank/index rule. The broader AUTH evidence independently identifies the
telephone-book timeline and its authored source frames.

## Prop bindings

The native interaction has two separate book objects, not one mesh toggled by
a guessed phase.

| State | Object | Model | Ryo control | Runtime matrix | Render key |
| --- | --- | --- | ---: | ---: | ---: |
| Closed book | `TBK1` | `DENS501G.CHRM` | 18 | 36 | -65 |
| Opened book | `TBK3` | `DENS502G.CHRM` | 12 | 30 | -66 |

Operation `0x00e6` creates or updates the exact FIXO attachment from its local
translation, fixed-turn rotation, parent tag, and model-control ID. Operation
`0x001b` clears it. The transforms come from source evidence rather than visual
offset fitting.

The exact vectors and model hashes are in
`tools/evidence/d000-phone-book-interaction.json`.

## State, persistence, and cancellation

`NativeScriptActivityRunner` captures the current client gameplay snapshot for
this presentation-only activity. It suppresses ordinary native dialogue
persistence while Yarn owns the event and restores the snapshot on completion,
cancellation, or failure.

The selected-object action controller holds the `TBK1` claim for the entire
activity and releases it exactly once during settlement. Movement, camera,
motion, object, dialogue, resource, audio, and room-state owners participate in
transaction cleanup.

The official Yarn has no command after `start_activity` that mutates durable
state. A successful client acknowledgement therefore cannot award flags,
inventory, yen, or progress. Cancellation enters an explicit database event
state, cancels the native owner, restores presentation state, and prevents the
stale asynchronous command from emitting a second result.

## Debugging the interaction

In local `/play`, choose **Dobuita: phone book (ready)** from **Script test
scenario**, then click **Apply & teleport** and interact with the book. The
scenario:

- loads Dobuita/D000;
- teleports to the recovered player pose near `TBK1`;
- writes temporary native dialogue bank 2 values 180 = 1 and 190 = 0; and
- runs inside a persistence sandbox.

Development console output should show both a database start for
`original-d000-telephone-book` and a native start for
`disc1-d000-phone-book-0x6a49c`, owned by `0x69b14` and dispatched to `0x6a49c`.

Use the general [debugging guide](../debugging.md) for stop-reason diagnosis,
cleanup expectations, and validation commands.

## Evidence and implementation map

### Evidence and route declarations

- `tools/evidence/d000-primary-interaction-owner.json`
- `tools/evidence/d000-phone-book-interaction.json`
- `tools/evidence/d000-phone-controller-sound-evidence.json`
- `tools/evidence/d000-event-camera-catalog.json`
- `tools/evidence/live-d000-global-controller-poll-emulator-evidence.json`
- `tools/evidence/live-d000-event-control-emulator-evidence.json`
- `tools/data/native-event-program-routes.json`

### Runtime and presentation

- `play/events/NativeRoomControllerLifecycle.js`
- `play/events/NativeRoomScriptRuntime.js`
- `play/events/NativeRoomSceneComposition.js`
- `play/events/NativeScriptedEventRuntime.js`
- `play/interactions/DobuitaInteractionProps.js`
- `play/scripts/NativeScriptActivityRunner.js`
- `play/scripts/NativeSelectedObjectActionController.js`
- `play/scripts/ScriptEventController.js`
- `play/scripts/ScriptEventPresentationCatalog.js`
- `play/scripts/ScriptEventPresentationRuntime.js`
- `play/scripts/ScriptEventBabylonAdapters.js`

### Server ownership

- standalone server `internal/officialscript/phone_book.go`
- standalone server `internal/officialscript/phone_book_integration_test.go`
- standalone server `internal/scriptevent/`
- standalone server `internal/scriptruntime/`
- standalone server `internal/store/script_events.go`

### Focused tests

- `tests/NativePhoneBookControllerIntegration.test.js`
- `tests/NativeRoomControllerLifecycle.test.js`
- `tests/NativeRoomSceneComposition.test.js`
- `tests/NativeScriptActivityRunner.test.js`
- `tests/NativeTaggedObjectActionRuntime.test.js`
- `tests/ScriptEventController.test.js`
- `tests/ScriptEventPresentationRuntime.test.js`
- standalone server `internal/officialscript/phone_book_integration_test.go`

## Known boundaries

This slice is implemented and production-shaped, but it is not evidence that
all original telephone presentation is complete. Remaining fidelity work
includes comparing the complete original AUTH staging and actor placement
against ordinary Babylon gameplay, validating every visible look/joint detail,
and extending the same architecture to more room interactions. Any newly found
operation or timing owner must be recovered and integrated rather than patched
inside this route.

The larger dialogue/script project remains incomplete even when this one
interaction succeeds.
