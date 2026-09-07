# Dialogue-driven gameplay effects

Status: current technical reference

Last reviewed: August 2, 2026

This document defines the evidence boundary, generated catalog, runtime model,
and extension rules for gameplay consequences found in dialogue-bearing native
scripts. For the complete system architecture and project status, see
[Dialogue and scripting](../../implementation/scripting/README.md).

The authoritative current catalog summary is
`tools/evidence/dialogue-gameplay-effects.json`. Per-operation behavior and
constraints are authoritative only in
`tools/evidence/native-operation-semantics.json` and the evidence files it
references. This document deliberately avoids copying a long per-operation
inventory that would become stale after every extraction pass.

## Scope and evidence boundary

The source is SH-4 code reachable from recovered SCN3 room-event entries and
child-coroutine launches. The compiler retains:

- disc, area, function, block, and call provenance;
- native operation IDs and recovered arguments;
- branch successors, calls, transfers, and terminators;
- runtime-bound operand sources;
- dialogue-region membership; and
- unresolved operations and control-flow boundaries.

An operation is promoted only when its handler behavior is supported by the
semantic registry. A known family can still be unresolved for an unsupported
mode, selector, malformed call, missing operand, or unproved adapter boundary.
Unknown values stay runtime-bound; they are not replaced by nearby constants.

The catalog is an audit and execution input. It is not permission to replay a
flat list of everything found in a dialogue function. The original branch,
call, coroutine, and ownership structure decides which effects occur.

## Build pipeline

```sh
python3 -m tools.scripting.compile_native_event_ir \
  --control-flow .disc-work/dialogue/scripted-event-control-flow-index.json
npm run build:dialogue-gameplay-effects
```

Outputs:

- `.disc-work/dialogue/dialogue-gameplay-effects.json`: complete local catalog;
- `tools/evidence/dialogue-gameplay-effects.json`: committed source-safe
  summary; and
- `tools/evidence/native-event-ir.json`: committed full-IR coverage summary.

The complete catalog remains a research artifact because it contains large
control-flow data and many paths that are not executable in `/play`.

## Current generated coverage

These values are derived from the committed summary:

| Metric | Count |
| --- | ---: |
| Areas | 51 |
| Dialogue-bearing functions | 1,278 |
| Functions with extracted effects | 469 |
| Effect templates | 8,379 |
| Fully static operands | 5,947 |
| Runtime-bound operands | 2,432 |
| Unresolved operation call sites in dialogue regions | 815 |
| Distinct unresolved operation IDs in dialogue regions | 100 |

Effect representation:

| Kind | Count |
| --- | ---: |
| `nativeOperation` | 6,876 |
| `stateBankWrite` | 763 |
| `objectRuntimeFlag` | 507 |
| `objectPresentationFlag` | 120 |
| `globalByteStateWrite` | 75 |
| `mapTransition` | 28 |
| `mapLayerState` | 7 |
| `actorByteStateWrite` | 3 |

`nativeOperation` is a representation kind, not a resolution status. Many of
those templates carry an exact proven semantic adapter while preserving the
original operation boundary.

Persistence classification:

| Owner/lifetime | Count |
| --- | ---: |
| Scene | 7,574 |
| Character | 766 |
| Immediate | 28 |
| Server | 11 |

The largest current unresolved dialogue families are read directly from
`summary.unresolvedOperationCounts` in the generated evidence. At this review
they begin with `0x0139` (57) and `0x001c` (37), then `0x0025`, `0x0193`, and
`0x01a5` (24 each). Operation `0x013e` no longer appears here: both of its
exact resource-slot modes are proven for all 530 authored calls.
Operations `0x0071`, `0x005d`, and the exact two-argument routes of `0x0121`
are also proven; their low-level numeric fields remain intentionally unnamed.
Operation `0x0118` now covers all 431 exact three-argument calls across its
four object/global dword and float-word routes. Operation `0x009d` covers all
351 authored MOTM-controller mode calls, including its complete reset route;
neither operation assigns a guessed gameplay name to those native fields.

Operation `0x0120` modes zero and one are bound to their recovered owner rather
than a generic record table. The native MAP loader passes its exact layer index
to the `CLIP` loader; parsed CLIP presence occupies dword `+0x00`, the operation
controls dword `+0x08`, and the consumer requires both to be nonzero. The
Babylon projection includes only collision-classified nodes from exact base or
two-digit numbered MAP filenames, with transaction rollback. Mode two's
separate dword `+0x34` remains state-only because its player-visible meaning is
not yet proved.

Operation `0x0050` now has a bounded exact AUTH-activity runtime. Positive
authored slot values require an operation-`0x013e` binding declared by the
active program; mode `-1` polls the exact active state and performs terminal
cleanup. D000's two slots resolve only through their exact static pointer pairs
to the two hash-pinned DRAUTH AUTH members. The reusable activity runner
validates ASEQ/ACAM/AMOV/ASTR and MOTN data, advances one authored frame per
room transaction tick, and rejects missing or asynchronous presentation
adapters. Rollback must release external activity ownership before scene state
is restored. The native evidence proves resource identity and lifecycle; it
does not authorize a silent audio fallback, nearest-actor lookup, or guessed
Babylon attachment.

## Runtime-bound versus unresolved

These terms are different:

- **Static:** every operand is known from original data or executable analysis.
- **Runtime-bound:** the semantic is known, but an exact frame, scene, actor,
  object, record, or result value must be supplied during execution.
- **Unresolved:** the operation behavior, mode, argument, control transfer, or
  mandatory adapter is not proven sufficiently to execute.

A runtime-bound effect can execute safely when its declared source exists. A
static effect can still be unreachable because its containing branch does not
run. An unresolved operation stops the interpreter before mutation.

## Transactional runtime

`play/events/NativeGameplayEffectRuntime.js` is the generic effect boundary.
It:

1. validates effect shapes and native identities;
2. materializes runtime operands from their declared sources;
3. preflights every required adapter before mutation;
4. applies effects in authored order;
5. records rollback actions; and
6. commits only at the owning interaction or room-controller boundary.

If a later effect fails, earlier mutations in the same transaction are rolled
back. Server-owned economy effects remain requests to the authoritative server;
the browser cannot directly mutate yen.

Scene effects are cleared with the world unless their native owner establishes
a longer lifetime. Character effects are serialized through the native
dialogue snapshot. Immediate transitions are consumed by execution. A numeric
global address is not automatically treated as durable story state.

## Branch-aware execution

`NativeEventInterpreter` executes the control-flow IR rather than the flattened
effect catalog. It supports represented predicates, calls, child coroutines,
frame and scene writes, operation-result propagation, scheduler yields, and
continuation transfers. It pauses or stops before every unsupported operation,
predicate, operand, call, transfer, or handler-specific scheduler boundary.

The production program pack includes only declared, hash-matched closures.
Interaction routes identify exact native entries and owners; they do not infer
an entry from an NPC name, proximity, subtitle, or descendant function.

## Adding operation support

To promote an operation or another mode of an existing operation:

1. Recover the exact handler path from executable and call-site evidence.
2. Record supported argument counts, modes, selectors, no-op paths, result
   behavior, and required native records.
3. Add or update a bounded evidence file.
4. Register the constrained semantic in
   `tools/evidence/native-operation-semantics.json`.
5. Regenerate the IR and effect summary.
6. Implement the smallest reusable runtime owner for the behavior.
7. Test successful, missing-state, unresolved, rollback, and result-routing
   paths.
8. Exercise the operation through a real program route before claiming a
   player-visible interaction.

Do not broaden a proven selector to adjacent selectors, assign a gameplay name
from context alone, bypass an active query, use a timer to replace a native
completion owner, or add an NPC-specific callback.

## Freshness checks

After changing extraction or semantic coverage, compare documentation against:

```sh
jq '.summary | {
  effectCount,
  effectFunctionCount,
  mapCount,
  effectKindCounts,
  resolutionCounts,
  persistenceCounts,
  unresolvedOperationCounts
}' tools/evidence/dialogue-gameplay-effects.json

jq '.summary | {
  actionCount,
  engineOperationCount,
  provenEngineOperationCount,
  unresolvedEngineOperationCount,
  unresolvedOperationIds
}' tools/evidence/native-event-ir.json
```

Update this document and the consolidated architecture only when the generated
figures or architectural meaning changes. Preserve dated checkpoint totals only
inside documents explicitly marked as historical logs.
