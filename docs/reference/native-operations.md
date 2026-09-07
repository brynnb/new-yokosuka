# Native operations

Only bounded, evidence-backed semantics belong here.

The [complete generated proven-operation index](native-operations.generated.md)
contains all 25 entries in the reviewed native semantic registry. Regenerate it
with `node tools/reference/generate_identifier_operation_references.mjs`, or add
`--check` to validate freshness. Operations absent from that registry and
unconstrained suboperations remain numeric and `unresolved`.

| Operation | Subsystem | Proven behavior | Common misconception | Evidence | Confidence |
| --- | --- | --- | --- | --- | --- |
| `0x0051` | free conversation | Larger conversation manager API; subcommands 11–16 read/write persistent banks 2–4 | It is not a generic persistent-state dispatcher, and other subcommands must not inherit flag semantics | `tools/evidence/dialogue-native-free-conversation.json`; `tools/evidence/dialogue-predicate-values.json`; `tools/evidence/scripted-world-state-inventory.json` | `confirmed` |
| `0x08` | scheduled actor | Writes four-character area to actor `+0x0c`; an area change clears XYZ and gates linked actors by matching residency | It does not animate a door or move/authorize the player | `tools/evidence/scheduled-actor-area-residency-evidence.json` | `confirmed` |
| `0x2a` | scheduled actor | Stores linked scene-object code/control and dispatches timed modes; modes 4/5 select two native position/state slots | Modes 4 and 5 are not universally “open” and “closed” | `tools/evidence/scheduled-actor-scene-object-evidence.json`; `tools/evidence/d000-scheduled-scene-objects.json`; `play/data/shenmue1-scheduled-scene-objects.json` | `confirmed` |
| `0x0098` | map script | Gets/sets integer state at `+0x00` in one of 32 96-byte MAP-layer records | A non-Boolean value must not be labeled visible, open, or active without object evidence | `tools/evidence/scripted-world-state-inventory.json`; `tools/evidence/d000-time-window-evidence.json` | `confirmed` |
| `0x0030` | player map transition | Accepts `(scene, four-character area, entry)` and initiates the native destination transition | A destination call alone does not prove a clickable portal, physical source, or player eligibility | `tools/evidence/map-transition-catalog.json`; `tools/evidence/map-event-callbacks.json`; `tools/evidence/player-portal-inventory.json` | `confirmed` |

The reviewed D000 `BS01`–`BS16` corpus has independent physical evidence for
its two endpoints. That local conclusion must not be generalized to every
operation-`0x2a` target.
