# Dialogue and scripted-event architecture

Status: canonical architecture
Last reviewed: August 2, 2026

## System boundary

Shenmue does not express story progression as one chapter number or a table of
independent lines. It combines persistent values, actor conversation programs,
compiled room programs, live scene state, and multi-frame engine controllers.
A branch can depend on story state, time, position, an actor, an object, or the
result of an earlier operation. A selected path can coordinate dialogue,
motion, cameras, sound, props, map state, and persistence.

New Yokosuka preserves that separation:

```text
original assets and executable
  -> extraction and evidence
  -> generated actor and room programs
  -> native interpreters and state owners
  -> server-selected database/Yarn orchestration where reviewed
  -> transactional Babylon presentation
  -> explicit completion, cancellation, or diagnostic stop
```

The browser does not flatten an event into a list of visual effects. Native
control flow and operation results determine ordering and branching.

## State model

“Story flags” is a useful shorthand, but the runtime requires more than
Booleans.

| State family | Shape | Lifetime and purpose |
| --- | --- | --- |
| Story banks | Bits and bytes in native banks 2, 3, and 4 | Durable story and conversation conditions |
| Dialogue progress | 325 fixed records plus 24 dynamic identities | Selection, continuation, authored boundaries, and repeat prevention |
| Actor state | Sparse bytes and live actor/controller records | Availability, progress, motion, facing, look, and controller status |
| Scene state | Fields, object records, resources, layers, and transitions | Current-room execution and presentation state |
| Room-controller state | Event words, status ranges, continuation checkpoints | Persistent interaction dispatch and maintenance loops |
| Calendar and economy | Date, time, yen, and other numbers | Eligibility and numeric branches |
| Spatial state | Actor transforms and authored bounds | Position- and facing-dependent triggers |

Unknown numeric fields retain their native identity. They are not assigned a
story meaning from nearby dialogue or circumstantial behavior.

The native dialogue progress table is 3,900 bytes: 325 records of 12 bytes.
Each record stores selected and continuation offsets, an authored boundary, a
latest resume offset, and a 32-bit auxiliary value. The dynamic identity ring
stores exact four-byte actor identities rather than display names.

## Two native program families

### Actor conversations

Actor resources contain selector graphs and conversation bodies. Selection
evaluates typed predicates, then the chosen body emits an ordered stream of
messages, waits, commands, progress changes, and external event requests.

The browser path is:

```text
resolve scheduled actor and four-byte resource identity
  -> evaluate eligibility and selector predicates
  -> allocate or resume its progress record
  -> interpret the selected body
  -> present speaker, subtitle, voice, waits, and proven commands
  -> commit working state only after successful completion
```

Primary implementation owners live under `play/dialogue/`, including native
selection, speaker resolution, presentation, persistence, and scripted
dialogue sessions.

### Room scripted events

MAPINFO contains compiled SH-4 programs. The recovery pipeline reconstructs
functions, basic blocks, branches, direct calls, child coroutines, operation
arguments and results, scheduler yields, and continuation transfers.

The execution path is:

```text
room owner or exact interaction route
  -> evaluate scene, frame, and operation-result predicates
  -> execute calls and child coroutines
  -> dispatch evidence-backed operation adapters
  -> yield at represented scheduler boundaries
  -> resume at the authored continuation
  -> checkpoint or commit at the owning lifecycle boundary
```

`play/events/NativeEventInterpreter.js` owns represented control flow.
`NativeEventOperationRuntime.js` dispatches operation semantics. Scene,
resource, actor, controller, map, and audio modules own their respective state
instead of storing everything in the interpreter.

## Persistent room ownership

An interaction child is not necessarily its lifecycle owner. D000, for
example, launches a persistent controller that initializes once, polls native
event words, dispatches children such as `TBK1`, performs status maintenance,
waits one native tick, and returns to its loop.

`NativeRoomControllerLifecycle` retains the interpreter checkpoint at the
owner's exact maintenance boundary. A later interaction resumes that owner
instead of rerunning room initialization. Room teardown clears the checkpoint.
Child scheduler waits do not incorrectly commit the whole interaction.

This distinction is essential for fidelity and reuse: callers must enter a
recovered child through its proven owner unless independent evidence proves a
different entry.

## Database-backed scripts

PostgreSQL is the canonical editable repository for translated and community
scripts. Yarn is the text representation. The server owns:

- trigger matching;
- published version selection and pinning;
- predicate evaluation over authoritative facts;
- command ordering, choices, and waits;
- durable script-event state and trace history; and
- durable story, inventory, and economy mutation where supported.

The browser owns presentation that necessarily depends on the live Babylon
scene. `ScriptEventController` processes server yields. It opens a
`ScriptEventPresentationRuntime` transaction, presents lines and choices, and
acknowledges commands only after their adapters complete.

The current network sequence is:

```text
exact interaction context
  -> client requests a script event
  -> server selects and pins a published script version
  -> server yields command, line, options, or terminal event
  -> client presents and acknowledges that yield
  -> server advances the pinned run
  -> both sides commit on complete or roll back on cancellation/failure
```

If selection explicitly declines or no script exists, the caller may continue
to the recovered native interaction or ordinary inspection. Once a server run
may have started, an ambiguous connection failure must not also launch a local
fallback.

## Specialized native activities

Some recovered native sequences are already cohesive presentation programs.
Rewriting every native operation as a large Yarn file would duplicate proven
control flow and create two owners. For these cases Yarn can issue
`start_activity` using an exact registered activity identifier.

The D000 telephone book uses this boundary. Yarn owns trigger selection,
versioning, cancellation, and event lifetime. `NativeScriptActivityRunner`
requires the active area and selected scene object, claims that object action,
then enters the native persistent room owner. The server waits for client
settlement before completing the script event.

The telephone activity is explicitly presentation-only. Its client
acknowledgement cannot grant a flag, item, money, reward, or progress. A future
result-bearing activity needs a server-owned result protocol before Yarn may
branch on or reward its outcome.

## Presentation and transaction ownership

Presentation adapters are acquired lazily so a specialized activity can own
the same camera, motion, object, and dialogue resources without conflicting
with an unused outer Yarn transaction.

A transaction must account for:

- movement lock;
- camera and camera mode;
- player and NPC motion;
- facing and look points;
- dialogue and voice;
- object attachments and visibility;
- room audio and music;
- resource and controller records;
- map layer, collision, and render-preparation state; and
- working dialogue or actor state.

Successful settlement commits only the effects owned by that route.
Cancellation, map exit, disconnection, or diagnostic stop restores the prior
state. Presentation-only activities additionally restore the captured client
gameplay snapshot and suppress the ordinary native persistence callback.

## Failure policy

Execution stops rather than guesses when a consequential requirement is not
represented. Typical stop classes include:

- unresolved predicate input;
- unresolved or unsupported operation mode;
- missing scene object, actor, resource, camera, motion, or audio binding;
- missing current-event or controller owner;
- conflicting branch evidence;
- lost selected-object ownership; and
- failed transaction cleanup.

The nested reason chain is intentionally preserved for diagnosis. A stop is a
known boundary, not permission to return success, force a branch, invent a
timer, or silently skip presentation.

## Primary implementation map

| Concern | Primary location |
| --- | --- |
| Native actor dialogue | `play/dialogue/` |
| Native room interpretation and state | `play/events/` |
| Database event presentation and specialized activities | `play/scripts/` |
| Browser composition and world context | `play/PlayApplication.js` |
| Authoring, compilation, triggers, runtime sessions | standalone server `internal/scriptcontent/`, `scriptruntime/`, `scriptevent/` |
| Script persistence, versions, reviews, fixtures, traces | standalone server `internal/store/` |
| Reviewed official imports | standalone server `internal/officialscript/` |
| Extraction and evidence generation | `tools/` |
| Generated native programs | `play/data/events/` and `play/data/dialogue/` |

## Definition of complete

The broader system is complete only when it can select and execute the
required original interactions across state, time, space, inventory, actors,
objects, and controllers; present their complete authored sequences; persist
effects through the correct owners; preserve repeat and cancellation behavior;
and report unsupported boundaries explicitly.

Several exact vertical slices are implemented. The complete original corpus
is not.
