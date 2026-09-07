# Dialogue and scripting documentation

Status: canonical documentation index
Last reviewed: August 30, 2026

This directory is the entry point for New Yokosuka's recovered dialogue and
room-script system. It describes what the original game does, what the current
runtime implements, how database-authored scripts join that runtime, and how
to test the result without replacing unknown behavior with guesses.

The system is a substantial reusable foundation with several reviewed vertical
slices. It is not a complete implementation of Shenmue's story and event
engine.

## Reading paths

For a general technical orientation, read:

1. [Architecture](architecture.md)
2. [Native recovery](../../guides/native-script-recovery.md)
3. [Debugging and validation](debugging.md)

For database scripts and the community editor, read
[Script authoring](script-authoring.md).

For the non-obvious boundaries involved in wiring area-entry scenes, personal
story flags, live cutscenes, and QTE results, read
[Storyline gameplay integration](../../design/storyline-gameplay.md).

For the best complete example of a recovered object interaction, read
[D000 telephone book](interactions/d000-phone-book.md).

## Document ownership

| Document | Owns |
| --- | --- |
| [Architecture](architecture.md) | State, branching, runtime layers, authority, transactions, and failure policy |
| [Native recovery](../../guides/native-script-recovery.md) | Extraction, evidence, operation semantics, generated artifacts, and promotion workflow |
| [Script authoring](script-authoring.md) | PostgreSQL repository, Yarn, triggers, versions, CRUD, review, and author-facing limits |
| [Debugging](debugging.md) | Local scenarios, logging, failure diagnosis, tests, and emulator policy |
| [Storyline gameplay integration](../../design/storyline-gameplay.md) | Area-entry and interaction boundaries, personal progression, and presentation settlement |
| [D000 telephone book](interactions/d000-phone-book.md) | The exact TBK1 end-to-end vertical slice and its remaining gaps |

Interaction documents should follow the telephone-book structure instead of
adding another broad progress log. Add one only when an interaction has enough
recovered ownership, behavior, and tests to be useful on its own.

## Sources of truth

When sources disagree, use this order:

1. Hash-pinned original data or executable evidence.
2. Generated evidence and generated runtime packs.
3. Focused executable tests against the current implementation.
4. The canonical topic documents in this directory.
5. Archived Git history.

Generated counts must be read from their generated files rather than copied
into prose:

- `tools/evidence/shenmue1-scripted-scene-inventory.json`
- `tools/evidence/shenmue1-scripted-route-coverage.json`
- `play/data/events/nativeScriptedSceneCatalog.generated.json`
- `tools/evidence/native-event-ir.json`
- `tools/evidence/dialogue-gameplay-effects.json`
- `tools/evidence/native-operation-semantics.json`
- `tools/evidence/script-translation-coverage.json`
- `play/data/events/nativeEventProgramIndex.generated.json`
- `play/data/events/nativeEventPrograms.generated.json` (combined research and
  audit view; not imported by `/play`)

The generated evidence describes recovered coverage. The scripted-scene
catalog joins exact entry identities and AUTH metadata while keeping
research-only entries separate from reviewed routes. The compact runtime index
describes what the browser can discover synchronously; exact executable
programs are content-addressed under `public/data/native-event-programs/` and
are fetched only when one starts. The combined pack remains available for
offline audits without entering the production JavaScript graph. None implies
that every represented route is player-complete.

## Current reviewed vertical slices

The database-backed scripting path currently includes reviewed definitions for
D000 Hato, the JOMO/Goro telephone call, the D000 telephone book, and three
D000 door checks. The native room-event pack also contains bounded D000 entry,
telephone-book, and selector-18 closures.

These slices prove reusable architecture for:

- exact trigger selection;
- persistent room-controller ownership;
- branch-aware native interpretation;
- server-owned Yarn execution;
- client-owned transactional presentation;
- cancellation and rollback; and
- explicit failure at unsupported boundaries.

They do not prove complete game-wide script coverage.

## Detailed research material

This directory owns maintained runtime and authoring contracts. Native formats
and state layouts live in [dialogue extraction](../../research/shenmue1/dialogue-extraction.md);
operation-catalog details live in [gameplay effects](../../research/shenmue1/dialogue-gameplay-effects.md).
The former consolidated progress snapshot has been retired from public docs.

## Maintenance rules

- Put each claim in the document that owns its subject; link instead of
  duplicating long explanations.
- Separate proven native behavior, implemented behavior, and unresolved work.
- Link claims about exact values to evidence or tests.
- Do not put changing coverage totals in prose unless the document explicitly
  identifies the generated source and review date.
- Update an interaction document when its ownership, visible sequence,
  persistence, or fail-closed boundary changes.
- Keep chronological progress in Git history, not in these specifications.
