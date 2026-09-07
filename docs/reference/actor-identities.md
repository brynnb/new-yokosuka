# Actor identities

An actor code is a native four-character identity key. It is not necessarily a
model code, a dialogue speaker label, a source program, a runtime actor record,
or an MMO narrative identity. The [complete generated actor
index](actor-identities.generated.md) is the exhaustive union of the current
dialogue-resource and schedule catalogs. This file keeps reviewed mappings and
research notes separate from that generated table.

Regenerate the index with `node tools/reference/generate_identifier_actor_reference.mjs`,
or validate it with the same command plus `--check`. Do not edit the generated
Markdown manually.

The `/play` selected-NPC debug bar reads `definition.label` from generated
scheduled-actor data. Those labels originate in the same exact character
mapping retained by `play/data/shenmue1-schedule-catalog.json`, which the index
already consumes. All 225 runtime-rendered actor codes are labeled. A separate
`docs/reference/reviewed-actor-labels.json` registry holds readable dialogue
labels supported by the runtime mapping and corroborated by extracted Japanese
speaker labels. Full expansions absent from the archive stay `high` confidence
rather than being presented as `confirmed`. The remaining `unresolved` rows
are dialogue-only identities or non-rendered schedule/controller codes, so the
debug bar does not provide additional names for them.

For unresolved codes that evidence shows will not identify a named person, the
generated index has a separate **Project-generated descriptor** field. Its
small reviewed registry is
`docs/reference/project-actor-descriptors.json`. A descriptor is only a stable
way for this project to discuss a generic resource or controller: it is never a
translation, a discovered full name, or a replacement for the native actor
code. Codes whose role or possible person identity is still ambiguous retain a
dash instead of receiving an abbreviation-based guess. The registry covers the
bus task/controller (`BUS_`), both generic door resources (`DOOR`, `DORG`), and
every unresolved dialogue resource whose extracted Japanese speaker label is a
generic role such as worker, fisherman, thug, or age/gender category. It also
covers `BUS2`, whose captured program owns bus routes and targets `BUSW`, plus
all 21 `CAxx` codes using the deliberately narrow description “numbered
non-rendered timetable program.” Their placement as a uniform schedule family,
missing character mappings/models, and timetable payloads are proven; expanding
`CA` to “car” or claiming a traffic role is not. Every currently unresolved
actor code therefore has a descriptor, without pretending its readable name or
unproven higher-level purpose is known.

## Confirmed reviewed identities

| Actor code | Confirmed full name | Authored dialogue identity | Proven model code | Schedule programs / areas | Narrative identity | Evidence | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `HRSK` | Nozomi Harasaki | `HRSK` | `NZM_M` | `HRSK:c15070554728…`; `D000` | `nozomi-harasaki` | `tools/evidence/dialogue-actor-resources.json` resource 59, SHA-256 `34be3543…`; `play/data/dialogue/messages/HRSK.generated.js`; schedule catalog | `confirmed` | Historically mislabeled as Yamagishi. The abbreviation is misleading and must not be interpreted. |
| `YAMA` | Shigeo Yamagishi | `YAMA` | `YMG_L` | `YAMA:75e8096a55de…`; `D000`, `JD00` | `shigeo-yamagishi` | actor resources resource 234, SHA-256 `0fa140c1…`; `play/data/dialogue/messages/YAMA.generated.js`; schedule catalog | `confirmed` | This, not `HRSK`, is Yamagishi's actor identity. |
| `NGSM` | Tetsuya Nagashima | `NGSM` | `YAB_L` | `NGSM:ac7ffddcd279…`; `D000` | `tetsuya-nagashima` | actor resources resource 150, SHA-256 `d112ccba…`; `play/data/dialogue/messages/NGSM.generated.js`; schedule catalog | `confirmed` | Historically mislabeled as Nozomi. Dialogue addresses Nagashima explicitly. |
| `TOM_` | Tom Johnson | `TOM_` | `AME_L` | `TOM_:6e2a79570122…`, `TOM_:dd3e7fb82b93…`; `D000`, `MFSY` | `tom-johnson` | actor resources resource 222, SHA-256 `688e5f06…`; `play/data/dialogue/messages/TOM_.generated.js`; schedule catalog | `confirmed` | The dialogue resource has no `actorLabel`, but authored dialogue says Tom and both independently mapped schedule programs label Tom Johnson. |

All four identities also occur in the exact 301-entry identity table preserved
by `tools/evidence/dialogue-progress-state.json`. Generated dialogue modules are
produced by `python3 -m tools.scripting.generate_native_dialogue_selector_data`; do not
edit them manually.

## Additional subtitle-backed labels

These full labels are project-reviewed mappings. Four are already used by the
dialogue runtime; the medium-confidence `IZAW` mapping additionally relies on a
cited secondary character reference. Their extracted subtitle resources bind
each actor resource to the shown Japanese speaker form, but do not store the
complete English name.

| Actor code | Reviewed readable label | Extracted speaker label | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| `HARY` | Harry Thompson | `ハリー` | `play/dialogue/NativeDialogueSpeaker.js`; `play/data/dialogue/messages/HARY.generated.js` | `high` |
| `IZAW` | Midori Aizawa | `碧` | `play/data/dialogue/messages/IZAW.generated.js`; actor resource `IZAW` / message speaker `IZWA`; secondary character reference | `medium` |
| `JONZ` | Jones Henders | `ジョーンズ` | `play/dialogue/NativeDialogueSpeaker.js`; `play/data/dialogue/messages/JONZ.generated.js` | `high` |
| `RBRT` | Robert Wells | `ロバート` | `play/dialogue/NativeDialogueSpeaker.js`; `play/data/dialogue/messages/RBRT.generated.js` | `high` |
| `SERA` | Takeshi Sera | `世良` | `play/dialogue/NativeDialogueSpeaker.js`; `play/data/dialogue/messages/SERA.generated.js` | `high` |

`IZAW` is deliberately weaker than the other rows: the archive establishes the
speaker form `碧` and the near-matching native codes, while the full name
“Midori Aizawa” comes from a secondary [Shenmue character
reference](https://shenmue.fandom.com/wiki/Midori_Aizawa). It is useful for
lookup but must not be treated as an exact extracted full-name mapping.

## Identity and projection rules

One narrative identity can own multiple source programs and zone projections.
For example, the two `TOM_` program IDs are independently extracted program
instances but both represent Tom Johnson. A program's selected schedule variant
can change its timetable and area residency without creating a new person.
Conversely, a matching model code or dialogue speaker is not sufficient to
merge actor identities. Runtime records may be recreated or projected per zone,
so do not assume one actor code always means one physical runtime instance.

Where a resource's `actorCode` and `authoredPersonIdentity` differ, preserve
both fields. The extraction explicitly contains cross-identity mappings. An MMO
dossier may group source projections only after evidence-backed narrative
review; the grouping is adaptation policy, not a native identifier rewrite.
