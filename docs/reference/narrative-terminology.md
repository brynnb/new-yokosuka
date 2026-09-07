# Narrative terminology

This is the controlled glossary for storyline research and MMO adaptation.
Definitions are project terminology unless explicitly marked as an original
source fact or MMO policy. Actor, area, state, and runtime identifiers remain
owned by their respective reference files.

## Evidence and source interpretation

| Term | Kind | Definition |
| --- | --- | --- |
| Original-source fact | evidence classification | Behavior, data, text, or identity directly supported by extracted native evidence. |
| Evidence-backed interpretation | evidence classification | Human explanation supported by evidence but containing a bounded interpretive step. It must carry confidence and unresolved alternatives. |
| MMO adaptation policy | policy classification | Deliberate New Yokosuka behavior. It must not be presented as original Dreamcast behavior. |
| Evidence confidence | project term | Controlled assessment (`confirmed`, `high`, `medium`, `low`, `unresolved`) of support, not design priority. |
| Unresolved | evidence state | Native value or relationship whose human meaning is not proven. Preserve the identifier and evidence without guessing. |
| Native condition | source fact | Exact authored predicate such as flags, date bounds, base selector, runtime value, or logical combination. |
| Native date predicate | source fact | Original month/day condition. It is chronology and selector evidence, not automatically an MMO calendar rule. |
| Flag alias | research label | Provisional readable label attached to an exact bank/index. It never replaces numeric state or proves an exclusive global meaning. |
| Proven mechanical prerequisite | source fact | Exact traced predicate, item, state, transition, or other native gate required for an action. |
| Canonical walkthrough order | research chronology | Reviewed default sequence supported by story evidence. It does **not** automatically prove a hard native dependency. |
| Competing interpretation | research state | Plausible alternative meaning retained until evidence distinguishes it. |

## Clocks and state domains

| Term | Scope | Definition |
| --- | --- | --- |
| Public world clock | server-wide | Shared time-of-day used for lighting, public timetables, opening hours, and public events. |
| Public MMO calendar | server-wide | Shared date visible to players. It must not select a character's personal story chapter. |
| Original story date | research metadata | Date on which an event or schedule could occur in the original story. |
| Personal narrative phase | per character | Stable progression state controlling dialogue, objectives, rewards, eligibility, and personal scenes. |
| Shared-world policy phase | server/deployment | Optional explicit public-event phase. It is never inferred from the most advanced connected player. |
| Event-instance clock | per instance | Clock controlling a private or party scene, battle, or temporary instance state. |
| Personal flag state | per character | MMO progression values derived through reviewed policy. They must not directly mutate shared NPC simulation. |
| Shared world state | server-wide | Publicly authoritative actors, objects, routes, collisions, clock, and other state visible to players in a shared zone. |

## Story graph and progression

| Term | Definition |
| --- | --- |
| Phase ID | Stable project identifier such as `S1-040`, independent of a native flag number. |
| Main spine | Reviewed required progression through narrative phases. |
| Canonical order | Default reviewed order of beats; chronology alone is not a proven mechanical prerequisite. |
| Entry condition | Evidence-backed or policy-defined requirement for beginning a phase. Original and MMO conditions must be distinguished. |
| Completion path | Valid action sequence that completes a phase and reaches its convergence milestone. |
| Alternate clue route | One of several supported paths satisfying the same downstream investigation requirement. |
| Optional clue route | Route that adds context or clue state without becoming a mandatory blocker. |
| Mandatory path | Required path proven by native mechanics or explicitly chosen by reviewed MMO policy. |
| Convergence milestone | Personal state where alternate routes rejoin and downstream eligibility agrees. |
| Idempotent completion | Repeating an already completed clue or objective does not duplicate rewards, regress state, or fork the milestone. |
| Personal checkpoint | Server-committed recovery boundary for story progress or an instance. |
| Personal cooldown | Per-character replacement for a native next-day wait when reviewed policy preserves a delay without using the public date. |
| Fallback route | Reviewed accessible alternative when public opening hours or shared-NPC availability would otherwise block mandatory progress. |

## Identities, projections, and schedules

| Term | Definition |
| --- | --- |
| Narrative identity | Reviewed grouping of source programs, actor codes, or zone projections that represent one story character. It is MMO metadata, not a native identifier rewrite. |
| NPC dossier | Evidence and policy record for one narrative identity, including source instances, projections, variants, and duplicate policy. |
| Shared NPC | Server-authoritative public actor whose presence is not controlled by one player's progress. |
| Shared projection | One public physical representation of a narrative identity in a browser/server zone. |
| Zone projection | Projection tied to a particular zone; different-zone projections may share one narrative identity. |
| Same-zone duplicate | Two public projections of one narrative identity in one zone. Forbidden by default and allowed only through explicit review. |
| Canonical daily routine | Reviewed shared schedule assembled from native evidence for stable public availability. |
| Native absence | Empty, terminal, or off-map source schedule. It is evidence, not automatic authority to remove a shared NPC. |
| Personal dialogue | Dialogue resolved from the interacting character's phase while the physical NPC may remain shared. |
| Personal objective | Per-character task and completion state; another player's completion cannot advance it. |

## Presentation and authority

| Term | Definition |
| --- | --- |
| Shared ambient world | Ordinary server-authoritative world layer containing public actors, routes, objects, and daily routines. |
| Presentation overlay | Temporary per-player visual/dialogue staging over a shared world without changing public authoritative state. |
| Personal cosmetic overlay | Per-player appearance substitution with no public identity or schedule change. |
| Staged actor copy | Temporary overlay actor used for a personal scene; it is not another shared projection. |
| Private instance | Server-owned isolated scene for one player when combat, exclusivity, or substantial world changes require it. |
| Party instance | Server-owned isolated scene shared by an authorized party while progression and rewards remain individually validated. |
| Event token | Server-issued authorization tying a client presentation or instance to specific eligibility and completion rules. |
| Completion checkpoint | Server-validated point at which consequential story state, rewards, inventory, or combat results may be committed. |
| Recovery path | Deterministic restoration or exit behavior after disconnect, failure, timeout, or interrupted overlay/instance. |
| Client presentation completion | Notification that local staging ended. It is never sufficient authority by itself for consequential progression. |

## Schedule adaptation classifications

| Classification | Meaning |
| --- | --- |
| `retain-shared` | Keep the reviewed source routine as public shared behavior. |
| `merge-into-shared` | Combine compatible native variants into one reviewed public routine. |
| `ignore-native-absence` | Keep a useful shared projection despite source empty, terminal, or off-map staging. |
| `public-calendar-event` | Use an explicitly reviewed server-wide date/event policy, not a personal story date. |
| `personal-dialogue-only` | Change dialogue/objectives per character without changing public actor presentation. |
| `personal-cutscene-overlay` | Stage a brief per-player scene while retaining the ambient shared world for others. |
| `personal-cosmetic-overlay` | Change appearance locally for a personal event. |
| `private-instance` | Move the event into a solo server instance. |
| `party-instance` | Move the event into a party server instance. |
| `unresolved` | Preserve base behavior and evidence until policy can be supported and reviewed. |

## Non-equivalences

- Public MMO date is not original story date or personal narrative phase.
- Canonical order is not automatically a proven mechanical prerequisite.
- Native flag is not phase ID, objective, or flag alias.
- Actor code, source program, program instance, shared projection, and
  narrative identity are not interchangeable.
- Empty schedule is not automatic shared-NPC removal policy.
- Presentation overlay is not authoritative story completion.
- Different-zone projections do not justify same-zone duplicates.

The normative policy and authoring workflow remain in
`docs/design/shenmue1-narrative-adaptation.md`; this glossary owns the terms used
to describe that policy.
