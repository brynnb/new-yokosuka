# Identifier reference

This section is the lookup point for native identifiers used by New Yokosuka.
Consult it before assigning a person, place, model, flag, or behavior a readable
name. Native numeric identifiers and four-character codes remain authoritative;
an abbreviation is never evidence for its meaning.

Preserved wiki tables and original-source examples are indexed under
[external references](external/README.md), separately from our reviewed mappings.

## Ownership

| Reference | Owns |
| --- | --- |
| [Actor identities](actor-identities.md), its [complete generated index](actor-identities.generated.md), [reviewed label registry](reviewed-actor-labels.json), and [project descriptor registry](project-actor-descriptors.json) | Actor codes, authored dialogue identities, evidence-backed reviewed labels, explicitly project-generated descriptors, model codes, program instances, and narrative grouping |
| [Areas and worlds](areas-and-worlds.md) and its [complete generated index](areas-and-worlds.generated.md) | Native areas, browser worlds, display locations, interiors, and transitions |
| [State banks and flags](state-banks-and-flags.md) and its [complete generated index](state-banks-and-flags.generated.md) | Persistent storage and researched flag labels |
| [Scheduled-actor concepts](scheduled-actor-concepts.md) and [all scheduled operations](scheduled-actor-operations.generated.md) | Terms used by the schedule extractor and runtime |
| [Native operations](native-operations.md) and the [complete proven-operation index](native-operations.generated.md) | Proven operation behavior and its limits |
| [Shenmue I scripted source inventory](shenmue1-scripted-scene-inventory.generated.md) and [native entry coverage](shenmue1-scripted-route-coverage.generated.md) | All-disc MAPINFO/AUTH sources, exact native entry candidates, static closures, and unresolved blocker impact |
| [Narrative terminology](narrative-terminology.md) | Original-story facts and MMO adaptation concepts |

## Evidence and confidence

Use sources in this order: SHA-256-verified executable/archive extraction;
generated data with retained provenance; direct captures; project configuration
that cites those sources; project prose; external guides. Existing prose is not
stronger evidence than extracted data.

The controlled confidence vocabulary is:

- `confirmed`: directly established by exact extracted or executable evidence.
- `high`: independently supported evidence with no material contradiction.
- `medium`: a strong interpretation with a meaningful unresolved boundary.
- `low`: tentative and unsuitable as a hard implementation dependency.
- `unresolved`: no supported human meaning; retain the native value only.

Project terminology and MMO policy must be labeled as such. A source identity
describes what an actor/resource is in the original data. An MMO narrative
identity groups projections that represent one story character and may impose
adaptation policy; it does not rewrite the source code or prove native behavior.

## Regenerating the indexes

Run these after changing an authoritative input:

```sh
node tools/reference/generate_identifier_actor_reference.mjs
node tools/reference/generate_identifier_area_reference.mjs
node tools/reference/generate_identifier_state_reference.mjs
node tools/reference/generate_identifier_operation_references.mjs
```

Pass `--check` to each command for a read-only freshness check. The focused
test runs all four checks and validates coverage, evidence paths, controlled
confidence labels, and contradictory assignments:

```sh
node --test tests/IdentifierReference.test.js
```

## Adding a mapping

1. Record the exact native identifier and its type.
2. Cite the generated evidence path and retain hashes, offsets, or program IDs
   when available.
3. Keep actor code, authored person identity, model code, and program instance
   in separate fields. Keep native area, browser world, display name, interior,
   and map variant separate in the same way.
4. Assign one confidence label from the vocabulary above. Use `unresolved`
   rather than guessing.
5. If evidence proves an unresolved code is a generic resource or non-person
   controller, add a `project-generated` descriptor to the reviewed registry.
   Do not put that descriptor in the evidence-backed name field.
6. Add or update the focused validation in `tests/IdentifierReference.test.js`.
   Generated sources must be regenerated with their documented command, never
   hand-edited.

## Look here before writing canon

- Did I look up every four-character or numeric identifier here and in its
  cited extraction?
- Am I accidentally treating a model, speaker, schedule, or browser world as
  an actor identity or native area?
- Is a flag alias clearly a research label rather than stored state?
- Does a canonical walkthrough sequence actually have a proven native gate?
- Are unknowns still written as `unresolved`?
