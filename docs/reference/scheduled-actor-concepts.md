# Scheduled-actor concepts

This is the terminology index. [Scheduled NPCs](../implementation/scheduled-npcs.md) remains
the runtime architecture and generation guide.

The [complete scheduled-actor operation index](scheduled-actor-operations.generated.md)
covers all 39 operation families present in the current runtime projection,
including exact, partial, and exact-no-visible-effect classifications. It is
generated from `tools/evidence/scheduled-actor-operation-coverage.json` with
`node tools/reference/generate_identifier_operation_references.mjs`; add `--check` to
validate freshness.

| Term | Definition |
| --- | --- |
| Actor code | Four-character native actor identity key; not inherently a person name or model. |
| Source program | Extracted native scheduled-actor byte program with its own source hash. |
| Program instance | Independently simulated occurrence of a source program; counts need not equal unique actor-code counts. |
| Selector slot | One of the native selector's 16 pointer positions. |
| Schedule variant | Timetable selected through one or more selector slots; several slots can point to the same table. |
| Area residency | Actor's logical four-character area state. It gates presence and linked-actor behavior. |
| Route | Authored movement geometry referenced by timetable operations. |
| Native operation | Numeric scheduler instruction. Meanings are assigned only after handler evidence. |
| Shared projection | MMO-visible presentation of a source actor in a browser world. This is project policy. |
| Narrative identity | Project grouping of source programs/projections that represent one story character. |
| Model override | Scheduled change to the actor's render model; it does not change actor identity. |
| Empty or terminal timetable | A selected schedule with no continuing visible routine, or one ending in a terminal state. It does not authorize an invented route. |

Operation `0x08` writes logical area residency and clears position when the area
changes. It does not animate a door, move a player, or authorize player travel.
Those are separate map/portal systems. Evidence:
`tools/evidence/scheduled-actor-area-residency-evidence.json`.

Multiple programs and zone projections may belong to one narrative identity:
Tom's `D000` and `MFSY` programs are the canonical example. The program IDs
remain distinct even when MMO policy groups them into one dossier.

## Current cardinalities and ownership

The complete source catalog contains 265 programs for 249 native registry
actor codes. The runtime projection contains 234 mapped program instances for
225 actor codes and 431 selector-backed variants. These counts answer different
questions and are validated by the schedule/runtime tests. Source hashes,
16-slot selectors, decoded timetables, and native operations belong to
`play/data/shenmue1-schedule-catalog.json`; server selection and simulation
belong to the Go runtime; browser shards retain render identities and route
geometry. A projection must not be counted as a newly discovered native actor
or source program.
