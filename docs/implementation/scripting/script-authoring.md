# Database and Yarn script authoring

Status: canonical authoring architecture
Last reviewed: October 16, 2026

## Purpose

The script repository supports reviewed translations of original behavior and
new community-authored content in the same versioned system. Original source
provenance is metadata on a script version, not a separate runtime object
model.

PostgreSQL is canonical. Exported files and built-in Go definitions are import
sources and reproducible fixtures; runtime selection does not read loose script
files from the browser.

This guide includes the author-facing workflow, Yarn examples, and fidelity
policy below. The standalone server's
[scripted-event guide](https://github.com/brynnb/new-yokosuka-server/blob/main/docs/scripted-events.md)
is authoritative for its current HTTP API and authorization rules.

## Repository model

A script has a stable identity and immutable versions. A version contains its
Yarn source, compiler output and diagnostics, dependency indexes, trigger
analysis, native provenance, review state, and publication state.

The repository additionally tracks:

- collaborators and permissions;
- immutable version-pinned review threads;
- moderation and archive history;
- rollbacks as publication changes rather than version mutation;
- reusable test fixtures;
- identifier indexes for completion and schema inspection; and
- durable script-event runs and traces.

Published versions are never edited in place. A correction creates another
version and explicitly changes which immutable version is published.

## Yarn boundary

Yarn is used for readable branching dialogue and orchestration. The compiler
validates source structure and produces the runtime representation consumed by
the Go bridge. The command registry is versioned under the standalone server's
`internal/scriptcontent/commands.v*.json` and exposed through the script schema
API. The browser keeps its presentation-facing snapshot at
`play/data/server-command-registry.json`.

The supported surface is intentionally smaller than a general programming
language. Authorable commands and queries have declared parameter types,
identifier kinds, authority, waits, cleanup, and side effects. Unknown commands
or dynamic values where a static registered identifier is required fail
compilation or execution.

## Triggers

Triggers are structured database records derived from script definitions, not
filename conventions. A trigger selects a start node by exact context such as:

- kind (`use`, automatic, or another registered family);
- native area;
- actor or object identity;
- action;
- priority; and
- reviewed dependencies or predicates.

For example, the D000 telephone book uses `use / D000 / TBK1 / Start`. The
server selects a currently published version and pins the event run to it.

## Authority

The server may authorize durable state only through supported, validated
commands and authoritative inputs. The client can report presentation cleanup,
line advancement, or a selected server-issued option ID. It cannot grant
itself flags, inventory, money or progress. Personal QTE/training/combat results
are intentionally trusted client reports; only the selected script decides their effects.

Presentation commands name entries in a bounded client catalog. Cameras,
motions, sequences, and activities must exist under exact identifiers and have
complete adapters. The client rejects unknown or incomplete entries.

`start_activity` is currently a server-orchestrated presentation command. Its
acknowledgement says that registered client presentation settled; it is not a
gameplay-result claim. Result-bearing activities use the server-owned challenge
or combat protocol before scripts branch on success or award anything.

`start_challenge "registered-id"` / `challenge_result("registered-id")` use
client-timed prompts or registered move lessons. `start_combat "registered-id"` /
`combat_result("registered-id")` use client-simulated personal fights. IDs
come from closed catalogs, not arbitrary client assets. The browser owns movement,
targeting, moves, hits, health, AI and the outcome through the same engine as
Combat Practice. It sends readiness, sparse keepalives and a typed result, not
attack packets. Ordinary Continue, an introduction skip or a stale token cannot
authorize a success branch. A modified client can report an allowed outcome early;
that is an accepted personal-Story policy. Cancel/failure leaves
the enclosing story event retryable unless its reviewed script explicitly settles
a different outcome.

Authored combat definitions live in `tools/scripting/story-combat.json`.
`build_story_combat.mjs` derives positions from a hash-pinned original AUTH or a
reviewed authored scene (never both) into `play/data/story-combat.json`. The full
Practice move catalog stays in `src/MartialArtsCombat.js`; no three-move copy is
generated. Only ID/label/allowed outcomes go into the server's
`internal/scriptevent/combats.json`. `check-server-contract.mjs` checks that
projection; `--sync-scripting` does not overwrite client combat content.
Content, simulation and Babylon presentation remain separate; do not implement
one-off fights in Yarn command handlers.

`StoryQteRuntime` starts its monotonic timer when the ready acknowledgement is
presented, not when the server sent it. Keyboard and touch judge locally and send
one `challenge_result` (`challengeOutcome: "success" | "failure"`) for the whole
attempt; no button stream or server deadline remains. Retry uses a fresh attempt
token; duplicate ready/poll replies do not reset local progress. Definitions can
use per-step windows and simultaneous button chords; the current cinematic QTE
catalog still uses authored two-second windows, not recovered Dreamcast timing.
Prompt/correct/wrong feedback reuses the existing menu cues and effects-volume
preferences. These are explicit audio adaptations, not verified original QTE sounds.

Move lessons are `kind: "training"`, not cinematic QTEs. Tornado Kick and Swallow
Flip configure the regular `StoryCombatRuntime` with nonlethal instructors and
no time limit. The lesson selects its move through the existing command override
used by move scrolls, and observes actual `move-ended` events. Tornado Kick
requires the second kick, even in the air; Swallow Flip requires a connected
counter/throw. Instructions show the player's current combat key bindings.
Gui Zhang's predictable teaching strikes are authored coaching, not native AI.
Original introductions/demonstrations and acknowledged endings remain in Yarn;
the fake held-pose QTE and duplicate success-move films are retired.

`StoryCombatRuntime` owns the encounter lifetime, original borrowed models,
nonlethal practice, waves, ally rules, recovery and final outcome. It composes
`CombatEncounterRuntime`, `CombatInput`, `CombatTargetIndicator` and the existing
animation adapter rather than maintaining another fighting engine. The shared
targeting automatically faces the selected opponent; left/right target keys
choose adjacent opponents in camera space. The full move list and health HUD
work in both modes. NPC moves/AI and balance remain adaptations, not recovered
character-specific native movesets. AI animation roles are independent of team.

The server still owns encounter authorization, attempt tokens, bounded leases,
character saves and once-only Yarn settlement. Neither winning nor reporting a
result immediately commits a subsequent unfinished conversation's effects.
Fight-local HP is separate from persistent HP. Client and server must deploy
together for this protocol change; it needs no database migration. Future PvP
must validate cross-player outcomes separately; personal Story results cannot
mutate another player's combat state. No speculative PvP implementation is added.

Migration verification: 199 focused client tests cover all 17 encounter
definitions, wave progression, nonlethal practice, recovery, cancellation,
timeouts and successive attempt ownership. Hardware-rendered checks exercise
Practice, original Gui Zhang AI combat and the seventy-man fight's first cohort,
selection, shared throw animation and cleanup (account/transport are fixtures).
That is the earlier combat migration baseline. The local-timing/lesson update
adds focused timer, chord, stale-response, real-move and wire-boundary tests;
`tests/e2e/combat-targeting.spec.js` exercises delayed QTE readiness and both
lessons through the real renderer with fixture account/transport only.
Separate real Yarn/PostgreSQL checks exercise result authorization and settlement.
This is not a complete rendered replay of all chapters or a claim of final balance.

`postCombatChallenge` on a reviewed investigation route links a fight, a separate
challenge and its aftermath within that same Yarn transaction. Failed fights
retry the fight; failed challenges retry their staging. Only the common success
ending stages notebook/effects. Authored scene staging can borrow original prop
models through the shared attachment runtime. `waitForMotions: true` waits for
the longest loaded non-looping clip, with a 120-second safety ceiling; use an
explicit `durationSeconds` only for a reviewed authored hold. These timing
options are mutually exclusive. Neither presentation feature decides a gameplay
result.

## Original and community scripts

Reviewed original translations and community scripts share the same CRUD,
version, review, moderation, and runtime concepts.

Original translations additionally preserve:

- exact native source references and hashes;
- recovered region identities and ownership classification;
- reviewed trigger mappings;
- fidelity notes and unresolved boundaries; and
- deterministic built-in fixtures.

The built-in catalog under the standalone server's `internal/officialscript/` is the
reproducible source for reviewed imports. It currently includes Hato, the
JOMO/Goro telephone call, the D000 telephone book, and three D000 door checks.
PostgreSQL remains the runtime repository after import.

## Import and development

Import all reviewed definitions into the configured local database:

```bash
npm run import:official-scripts
```

`npm run dev:all` performs the same fail-closed, idempotent import before
starting the server and Vite. It should retain an unchanged published version
rather than creating duplicates.

The generic recovered-script import pipeline is:

```bash
npm run import:scripts
```

The browser editor is an incomplete, local-only prototype, excluded from Git
and production builds. If you have its local files, it is available at
`/script-editor/` when the development app and server are running.
It uses the server APIs for documents, versions, schema,
fixtures, collaborators, reviews, moderation, archive/restore, and publication
operations.

## Test fixtures

A fixture supplies bounded server facts for previewing a start node. It can
cover story values, calendar, inventory, actor/object presence, choices, and
registered presentation dependencies. Fixtures do not mutate a real player's
state and do not fabricate native browser objects.

Built-in original scripts carry reviewed fixtures alongside their definition.
Database fixtures can be saved and run from the editor. A preview proving that
Yarn yields `start_activity` does not by itself prove the native Babylon
activity; that remains covered by browser integration tests and interaction
documentation.

## Relevant implementation

| Concern | Location |
| --- | --- |
| Yarn source parsing and registry validation | server `internal/scriptcontent/` |
| Runtime bridge/session protocol | server `internal/scriptruntime/` |
| Trigger selection and event execution | server `internal/scriptevent/` |
| Repository, versions, reviews, fixtures, traces | server `internal/store/` |
| HTTP CRUD API | server `internal/httpapi/script_*.go`, `scripts.go` |
| Realtime delivery | server `internal/realtime/script_events.go` |
| Reviewed imports | server `internal/officialscript/` |
| Browser event controller and presentation | `play/scripts/` |
| CRUD interface | `script-editor/` |

## Authoring rules

- Use a structured trigger, not code that searches for a convenient actor or
  object at runtime.
- Use registry completion and identifiers instead of free-form presentation
  names.
- Keep original provenance exact and distinguish translation from inference.
- Never make a client acknowledgement authorize a durable effect.
- Add a fixture for each meaningful branch.
- Publish a new immutable version after review; do not patch published rows.
- Leave unsupported source behavior explicit rather than replacing it with a
  plausible generic command.

## Workflow

1. Create a Yarn draft from a starter template.
2. Add exact entry triggers in **Details**. A talk trigger names an area and
   actor, a use trigger names an area and object, and an automatic trigger names
   its room-owned route. Do not substitute distance or a nearby object.
3. Edit **Script**. Tab or Ctrl/Command-Space completes commands, functions, and
   identifiers from the pinned schema and published PostgreSQL catalog.
4. Save until the compiler status is valid and inspect **Dependencies**.
5. Add **Test** fixtures for every meaningful story, time, inventory, random,
   and choice branch. Preview executes the real compiled server program without
   committing its staged state.
6. Submit the draft. Submission makes that version immutable. Reviewers discuss
   that exact version in **Review**; corrections become a child draft.
7. A moderator publishes the reviewed version. New interactions select it
   atomically; already-running interactions remain pinned to their starting
   version. A rollback creates and publishes another immutable version rather
   than reopening history.

## Yarn shape

```yarn
title: Start
---
<<if flag_set("community.black-car.asked")>>
    Ryo: I already asked about the black car. #speaker:AKIR
<<else>>
    Ryo: Did you see a black car? #speaker:AKIR
    <<set_flag "community.black-car.asked">>
<<endif>>
<<complete>>
===
```

Every displayed line requires an exact `#speaker:` tag. A `#voice:` tag is
optional for community dialogue. The runtime rejects an unknown speaker rather
than showing a line under the wrong character.

Use ordinary Yarn choices when the player selects a response:

```yarn
Ryo: What should I ask? #speaker:AKIR
-> Ask about the neighborhood
    Ryo: Have you seen anything unusual nearby? #speaker:AKIR
-> Leave
    Ryo: I should keep moving. #speaker:AKIR
```

The editor's command catalog and `/api/script-schema` are authoritative for the
current command/query vocabulary. This guide deliberately does not duplicate a
long command list that could become stale. Unknown command names fail the
official compiler. Closed presentation capabilities such as cameras, motions,
sequences, activities, and spatial bounds also require a reviewed identifier;
authors cannot invent one in source text.

## Authority and effects

Story flags, progress, inventory, yen, completion, trigger ownership, random
results, and selected choices are evaluated or staged by the server. Durable
effects commit only when the pinned run completes. Cancellation, disconnect,
presentation failure, or room exit rolls staged effects back according to the
event owner's contract.

The Babylon client may acknowledge a camera, motion, dialogue line, compound
sequence, or presentation-only activity. That acknowledgement cannot authorize
money, items, rewards, or story progress. A result-bearing activity needs an
explicit server-owned result contract before it becomes authorable.

## Recovery fidelity

Recovered originals and their provenance are immutable references. A translated
script should preserve consequential branches, waits, voices, presentation,
state effects, repetition, cancellation, and cleanup. If a required operation
or trigger route is not proven, leave the boundary explicit. Do not hide it
behind a generic command, proximity check, guessed timer, permissive fallback,
or actor-specific shortcut.

Use the emulator only when consequential uncertainty cannot be resolved from
static source evidence, and then only through natural gameplay and read-only
observation.

## Random-query evaluation

The Hato translation exposed a subtle compiler/runtime behavior:
Yarn Spinner reevaluated `random_integer` when a function call appeared directly
inside the local `declare` expression on the third/`else` route. Hato v7 retains
the v6 correction that declares a plain numeric local and assigns the query
result in a separate `set`.
An official compiler/runtime integration trace proves exactly one authoritative
random query for the third route, and all six saved Hato fixtures execute with
their expected complete/declined outcome.
