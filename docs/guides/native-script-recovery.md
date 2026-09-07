# Native script recovery and evidence

Status: canonical recovery workflow
Last reviewed: August 2, 2026

## Purpose

The recovery pipeline turns original Shenmue data and executable behavior into
bounded, reviewable runtime inputs. Its purpose is not to produce plausible
scripts. It must preserve exact identities, control flow, arguments, state
sources, and uncertainty.

Detailed extractor formats remain documented in
[`docs/research/shenmue1/dialogue-extraction.md`](../research/shenmue1/dialogue-extraction.md).
Effect-catalog construction and adapter extension are documented in
[`docs/research/shenmue1/dialogue-gameplay-effects.md`](../research/shenmue1/dialogue-gameplay-effects.md).

## Evidence layers

| Layer | Examples | What it proves |
| --- | --- | --- |
| Original assets | MAPINFO, actor resources, AFS/PKS archives, MOTN, AUTH, SND | Authored data, bytecode, media, and resource identity |
| Executable evidence | Hash-pinned SH-4/AICA handlers and data tables | Operation semantics, ABIs, dispatch, and controller behavior |
| Static generated evidence | `tools/evidence/*.json`, `.disc-work/dialogue/*.json` | Recovered control flow, calls, predicates, arguments, and bounded conclusions |
| Natural emulator observation | Read-only debugger observations with source hashes | Runtime values that static evidence cannot consequentially resolve |
| Runtime tests | `tests/Native*.test.js`, Go integration tests | The implementation follows the declared evidence boundary |

An emulator observation does not override contradictory static evidence. It
must name what was observed, under what natural game conditions, and what was
not inferred.

## Pipeline

### 1. Identify exact sources

Record disc, area, archive/member, executable or MAPINFO hash, and native file
offsets. Four-character actor and object tags remain exact. Do not select a
source because it has a similar filename or nearby dialogue.

### 2. Recover actor dialogue

The actor pipeline extracts resource identities, entry selectors, progress
records, predicate value sources, body graphs, messages, waits, commands, and
voice ownership. Generated browser data is derived from those reports rather
than hand-authored per NPC.

Relevant package commands include:

```bash
npm run extract:dialogue-actor-resources
npm run extract:dialogue-actor-entry-routes
npm run extract:dialogue-progress-state
npm run extract:dialogue-actor-body-routes
npm run extract:dialogue-predicate-values
npm run generate:dialogue-predicate-data
npm run generate:dialogue-selector-data
```

### 3. Recover room control flow

The room pipeline identifies functions and basic blocks, follows direct calls
and child coroutines, recovers operation arguments, reconstructs branch
expressions and result comparisons, and preserves scheduler continuations.

```bash
npm run extract:scripted-event-control-flow
npm run compile:native-event-ir
```

The full IR is research coverage. It is not shipped wholesale to the browser.

### 4. Prove operation semantics

An operation ID alone is insufficient. Recovery must identify supported modes
or selectors, argument ABI, result behavior, state owner, lifecycle, and
completion semantics. One ID may contain multiple behavior families.

`tools/evidence/native-operation-semantics.json` is the registry boundary.
Operation-specific evidence files retain executable addresses, hashes, call
sites, supported modes, and explicit exclusions.

### 5. Declare exact routes

`tools/data/native-event-program-routes.json` declares the roots allowed into the
bounded browser pack, including source hashes, entry functions, interaction
tags, cameras, motion banks, persistent controllers, and evidence.

```bash
npm run build:native-event-program-pack
```

The pack builder retains the required closure and rejects missing declared
behavior. It also emits a compact browser index and one content-addressed JSON
asset per exact program. `/play` imports only the index and fetches the selected
program when it starts, so Vite never parses the complete recovered corpus.
Adding a route is a review decision, not a side effect of discovering another
function.

### 6. Bind presentation

Proven operations are connected to reusable owners for actor state, scene
state, resources, map layers, audio, cameras, motion, objects, and
transactions. A browser adapter must preserve the proven lifetime and cleanup;
merely returning success is not implementation.

### 7. Validate production composition

Validation progresses from extractor tests, to runtime unit tests, to a
production-shaped integration using the real route and owners, then to a Vite
build. Use the actual emulator only if a consequential ambiguity remains after
static analysis.

## Generated versus maintained files

Generated files are reproducible outputs and should not become places for
manual fixes. Maintained route declarations and semantic registries choose
what generated evidence is safe to ship.

| Kind | Representative files |
| --- | --- |
| Full generated research | `tools/evidence/native-event-ir.json`, `.disc-work/dialogue/scripted-event-control-flow-index.json` |
| Maintained route declarations | `tools/data/native-event-program-routes.json` |
| Maintained semantic boundary | `tools/evidence/native-operation-semantics.json` and operation evidence builders |
| Browser program index | `play/data/events/nativeEventProgramIndex.generated.json` |
| Lazily loaded programs | `public/data/native-event-programs/*.json` |
| Combined audit pack | `play/data/events/nativeEventPrograms.generated.json` |
| Translation coverage | `tools/evidence/script-translation-coverage.json` |

Coverage totals must be read from the generated summaries. Repeated call sites
are not unique commands, and represented operations are not automatically
player-complete.

## Promotion checklist

Before changing an unresolved behavior to supported, verify:

- The exact native source and hash are recorded.
- Arguments and result consumers are recovered.
- Every supported mode is named; unknown modes remain rejected.
- State and lifecycle ownership are explicit.
- The implementation participates in commit and rollback.
- Consequential presentation has a real adapter.
- Focused tests include success, unsupported input, and cleanup.
- A production route reaches the behavior without a one-off bypass.
- Documentation names both the proven conclusion and remaining boundary.

## Prohibited shortcuts

- Choosing branches merely to make a test scenario proceed.
- Treating unknown operations as successful no-ops.
- Replacing completion queries with arbitrary timeouts.
- Using proximity when the original uses an owner, object tag, or spatial
  record.
- Patching emulator RAM or manufacturing handler calls to obtain desired
  results.
- Assigning semantic story names without independent proof.
- Hand-editing generated IR or runtime packs.

## Emulator policy

Prefer static disc and executable evidence. Use an isolated actual emulator
only when runtime state is consequential and cannot be recovered statically.
Allowed observations follow natural execution and read memory or debugger
state. Record the executable/data hash, trigger conditions, addresses, raw
values, bounded conclusion, and shutdown status.

The emulator is a research instrument, not the runtime and not a substitute
for implementing the recovered owner.
