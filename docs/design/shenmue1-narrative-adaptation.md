# Shenmue I MMO narrative adaptation

Use the [identifier reference](../reference/README.md) for actor, area, flag, and
runtime terminology. Extracted mappings override names inferred from codes.

This document is the canonical design contract for adapting Shenmue I's
single-player story, flags, events, and NPC schedules to New Yokosuka's shared
multiplayer world. It records project policy rather than claiming that the
policy is original Dreamcast behavior.

The [scheduled-NPC guide](../implementation/scheduled-npcs.md) owns current NPC simulation and
generated-data details. The [multiplayer guide](../implementation/multiplayer-server.md) owns
server and persistence boundaries. This document defines how adapted story
policy must be researched, represented, reviewed, and implemented.

## Decision summary

The following decisions are foundational and must not be silently reversed by
later implementation work:

1. New Yokosuka has one synchronized public date and clock for all players.
2. A player's Shenmue story progress is personal character state.
3. The public date must never select a personal story chapter or an NPC's
   story-dependent schedule.
4. Native month/day and flag predicates are evidence for defining named MMO
   narrative phases. They are not runtime predicates against the public date.
5. Shared NPCs should remain available. Native empty, terminal, or off-map
   schedules do not automatically justify removing an NPC from the MMO.
6. One narrative character may have simultaneous projections in different
   zones when that keeps the story playable. Two shared copies in one zone
   require explicit review.
7. Dialogue and personal objectives may differ by player while the physical
   shared NPC remains the same.
8. Brief staged scenes use personal presentation overlays. Events that alter a
   large space, require authoritative combat, or allow interference use a
   private or party server instance.
9. An LLM may propose adaptation policy offline, but it does not choose runtime
   schedules. Its output must be structured, evidence-backed, deterministic,
   and reviewable.

## Separate clocks and state domains

Do not collapse these concepts into one date or one set of flags.

| Domain | Scope | Purpose |
| --- | --- | --- |
| Public world clock | Server-wide | Shared day/night presentation, ordinary daily timetables, opening hours, lighting, and public events |
| Original story date | Research metadata | Records when an event could occur in Shenmue I and explains native date predicates |
| Personal narrative phase | Per character | Controls dialogue, objectives, rewards, personal scenes, and story eligibility |
| Shared-world policy phase | Server-wide or deployment-configured, if introduced | Optional public MMO events; never inferred from the most advanced connected player |
| Event-instance clock | Per instance | Controls a private or party scene, battle, or temporary world state |

The current public calendar begins June 9, 1986. Original Shenmue playable
story begins December 3, 1986 after the November 29 prologue and can run until
April 15, 1987. This discrepancy is acceptable only because the public MMO
calendar is not the story-progress clock.

### Converting native date predicates

A native selector condition can contain required-set flags, required-clear
flags, month/day bounds, and a required base selector. Preserve all those
fields as source evidence. Convert them during offline narrative authoring:

```text
native condition
  flags 160 set; flags 345 and 790 clear; date December 26 onward

becomes
  candidate narrative phase: post-letter / pre-travel Nozomi routine
  original date note: alternate was available from December 26
  MMO schedule decision: reviewed shared routine or personal overlay
```

The production schedule selector must not compare that December 26 bound with
the synchronized public MMO date to determine a player's story experience.
The original bound can instead inform one of these explicit decisions:

- the date was only a single-player deadline and is removed;
- the behavior belongs to a named personal narrative phase;
- the behavior becomes an optional personal scene;
- the behavior belongs to an independently scheduled public holiday event; or
- the evidence is unresolved and the base shared behavior remains in use.

No conversion is automatic. A date predicate is context, not proof of the
correct MMO treatment.

## Authority and presentation layers

### Shared ambient world

The server owns shared NPC transforms, routes, interactions, and public daily
routines. Personal story flags must not mutate this layer directly.

Default policy:

- keep ordinary and story-important NPCs present;
- create a useful canonical daily routine from reviewed native schedules;
- retain source-authored routes and placements when possible;
- ignore native disappearance when it only protects a single-player scene;
- provide one shared projection per narrative identity per zone; and
- allow the same identity in different zones when required for accessibility.

Different-zone projections are separate physical server entities that share a
narrative identity. For example, Tom can have a Dobuita projection and a
Harbor projection. Both resolve dialogue from the interacting player's
personal state.

### Personal dialogue and objectives

Dialogue state remains per character. Two players talking to the same shared
NPC may receive different dialogue, notebook updates, choices, and objectives.
Personal progression should refer to the narrative identity, not require one
specific physical projection unless location is essential to the scene.

Quest design should tolerate reviewed MMO relocation. If an early-story player
finds Tom at the Harbor rather than Dobuita, Tom can provide the appropriate
early dialogue there. When the original location is narratively important, a
permanent different-zone projection or personal scene may be used instead.

### Personal presentation overlays

The browser may temporarily replace shared presentation for one player:

- suppress a shared actor locally;
- create staged actor copies;
- control cameras, animation, props, and effects; and
- restore shared presentation after the scene.

The server must still authorize eligibility, issue an event token, validate a
completion checkpoint, and commit story flags, rewards, inventory, or combat
results. A client reporting that a movie finished is not sufficient authority
for consequential progression.

Other players continue to see the shared ambient NPC during the personal
scene. Native schedules that hide Nozomi for a kidnapping or cutscene are
strong candidates for this treatment rather than global removal.

### Private and party instances

Use a server-owned instance when an event:

- changes a substantial part of a zone;
- has authoritative combat or rewards;
- requires exclusive NPC or enemy placement;
- changes doors, collision, or world objects;
- can be disrupted by unrelated players; or
- lasts too long or covers too much space for a presentation overlay.

The 70-man battle is the clearest private Harbor instance. Rescue encounters,
major Chai fights, and warehouse infiltration sequences must be evaluated with
the same criteria. An instance may be solo or party-scoped, but it must have a
server identity distinct from the shared world, deterministic entry/exit, and
an explicit recovery path after disconnect.

## Narrative phase model

The MMO canon has a readable main spine with bounded alternative paths. It is
not one flat list of flags, and it is not an unrestricted graph inferred at
runtime.

Each phase receives a stable ID:

```text
S1-000 Iwao's murder
S1-010 Ryo awakens
S1-020 Investigate the black car
S1-030 Find Yamagishi
S1-040 Question Nozomi and Tom
```

A phase may contain alternate clue routes that converge on one milestone:

```text
learn about the Three Blades
        /        |        \
      cook     tailor     barber
        \        |        /
             Liu Sr.
```

The main canon document must use this template for every phase:

```markdown
### S1-NNN: Human-readable name

**Original story**
Concise summary of the original event and its narrative purpose.

**Entry conditions**
- Prior MMO phase or phases
- Confirmed native milestone flags
- Original date/time restrictions, as research metadata only

**Completion paths**
- Mandatory path
- Valid alternate routes
- Convergence milestone

**Personal changes**
- Flag milestones
- Dialogue/notebook state
- Items, rewards, or unlocked objectives

**Original world changes**
- NPC presence, area, routine, model, doors, and event objects

**MMO adaptation**
- Shared-world behavior
- Personal overlay behavior
- Instance behavior
- Deliberate deviations from the original

**Affected narrative identities**
- Links to every reviewed NPC dossier

**Evidence**
- Native files, operations, dialogue, captures, and tests
- External walkthrough citations used for chronology

**Confidence and unresolved questions**
- Separate confidence for story order, flag meaning, and world effects
```

## Human-readable flag names

The original persistent story bank remains numerically authoritative. Names are
research aliases, not replacements for source indices.

Prefer milestone names because a set bit often remains set after its active
chapter:

```text
B2_0100_CHARLIE_INVESTIGATION_REACHED
B2_0150_CHARLIE_PHASE_COMPLETED

S1_PHASE_CHARLIE_INVESTIGATION =
  B2_0100_CHARLIE_INVESTIGATION_REACHED
  && !B2_0150_CHARLIE_PHASE_COMPLETED
```

Do not name flag 100 `CHARLIE_INVESTIGATION_ACTIVE`; that incorrectly implies
the bit is cleared when the phase ends.

Every alias record must include:

- bank and numeric index;
- proposed milestone name;
- evidence summary and references;
- confidence: `confirmed`, `high`, `medium`, `low`, or `unresolved`;
- known set/clear operations;
- phases and NPC conditions that consume it; and
- competing interpretations.

Unknown flags retain explicit names such as
`B2_0790_UNRESOLVED_NOZOMI_DATE_VARIANT`. It is better to preserve uncertainty
than turn a plausible story interpretation into a false fact.

## Narrative identity and NPC dossiers

Review narrative identities, not actor rows in isolation. One character can
have multiple source programs, actor codes, models, or zone projections. Tom's
D000 and MFSY `TOM_` programs belong in one Tom Johnson dossier.

Each dossier must record:

```json
{
  "characterId": "tom-johnson",
  "actorInstances": ["TOM_:dd3e7fb82b93", "TOM_:6e2a79570122"],
  "sharedPresence": "always",
  "zoneProjections": {
    "dobuita": "canonical-dobuita-routine",
    "mfsy": "canonical-harbor-routine"
  },
  "sameZoneDuplicatePolicy": "forbidden",
  "dialogueState": "per-player",
  "storyVariantPolicies": [
    {
      "nativeCondition": "flags 510-527",
      "nativeEffect": "off-map absence",
      "sharedTreatment": "ignore-native-absence",
      "personalTreatment": "private-rescue-instance"
    }
  ],
  "confidence": "high",
  "reviewStatus": "pending"
}
```

The exact persisted format can change, but these decisions must remain
machine-readable enough to audit. Free-form prose alone is not sufficient for
hundreds of actors.

Allowed treatment classifications should remain small and consistent:

- `retain-shared`
- `merge-into-shared`
- `ignore-native-absence`
- `duplicate-across-zones`
- `personal-dialogue-only`
- `personal-cutscene-overlay`
- `personal-cosmetic-overlay`
- `private-instance`
- `party-instance`
- `requires-human-judgment`

## LLM-assisted authoring workflow

LLM work is an offline research and authoring aid. Use this sequence:

1. Deterministically extract the actor's native selector, every variant,
   operations, routes, areas, dates, flags, dialogue references, and evidence.
2. Group source instances into a reviewed narrative identity.
3. Compare the native changes with the current canon phase and external story
   chronology.
4. Produce a structured adaptation proposal with evidence and confidence.
5. Run a second critic pass for availability, duplicate identities, quest
   reachability, contradictory schedules, and unsupported flag names.
6. Perform human review for every `requires-human-judgment` decision and every
   same-zone duplicate.
7. Compile approved policy into runtime data; do not execute LLM prose at
   runtime.
8. Simulate all relevant phases, times, zones, and instance transitions.

Per-character review must be followed by a global chapter review. Individually
reasonable NPC decisions can conflict when a scene requires several actors or
when multiple programs represent one character.

## Required invariants

Generated policy and tests must eventually enforce:

- Public calendar date does not select personal narrative progress.
- Personal flags do not directly despawn or relocate a shared NPC.
- Every required dialogue target has an available approved projection.
- A narrative identity has at most one visible shared projection per zone
  unless an explicit reviewed exception exists.
- Different-zone projections share personal dialogue identity without sharing
  physical simulation state.
- Every personal overlay restores shared presentation on completion, failure,
  cancellation, and reconnect.
- Every private instance has validated entry, persistence or recovery rules,
  and an exit to the correct shared world.
- Story rewards and consequential flags are committed by the server.
- Every deviation from native behavior names the source behavior it replaces.
- Unresolved evidence remains unresolved in generated policy.

## Initial canon-writing scope

Build the approach incrementally. The first canon pass should stop after the
Charlie investigation:

1. Iwao's murder and the four-day handoff.
2. Ryo awakens and speaks with Ine and Fukuhara.
3. The kitten encounter.
4. Investigation of the black car.
5. Yamagishi's account.
6. Nozomi and Tom's evidence.
7. Chinese community and Three Blades routes.
8. Liu Senior.
9. Sailors and Heartbeats.
10. Charlie's gang, tattoo parlor, and convergence on the Chinese letter.

This range already tests alternate clue routes, time-gated businesses,
personal scenes, optional events, schedule changes, and converging flags. Do
not author the entire game from a walkthrough in one unreviewed pass.

## Concrete policy examples

### Nozomi

Native schedules hide or effectively remove Nozomi during flag bands
`100-150` and `500-527`. The latter aligns with the kidnapping/rescue crisis.
MMO default: keep shared Nozomi available, make her personal dialogue phase
aware, and stage kidnapped Nozomi in a personal overlay or private rescue
instance. Do not globally hide her because one player entered the crisis.

### Tom

Native variants move Tom between Dobuita and the Harbor and hide him during
part of the rescue sequence. MMO default: support one Dobuita and one Harbor
projection under the same narrative identity, keep both generally available,
and resolve dialogue per player. Avoid two shared Toms in the same zone.

### Fukuhara

Native operation `0x2f` changes Fukuhara between `FUK_M` and `FUB_M` in some
routines. Use a canonical shared appearance schedule when the change makes
sense publicly. If the alternate model is specific to a personal event, use a
personal cosmetic overlay instead of changing him for everyone.

### Tetsuya Nagashima

Native selectors can choose an exactly empty timetable. MMO default: retain a
useful shared routine unless later story research proves that public presence
would make a required event impossible.

## Source hierarchy and external references

Research claims use this priority:

1. Extracted scripts, executable behavior, dialogue, schedules, and captures.
2. Native notebook entries and event dependencies.
3. Shotgunnova's structured full walkthrough for chronology and alternate
   routes: <https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404>
4. Force Vector's notebook guide for clue routes and convergence:
   <https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/14458>
5. Other walkthroughs and plot summaries as discrepancy checks, never as
   stronger evidence than the game data.

External sources must be cited and summarized rather than copied. When a guide
and native evidence disagree, record the discrepancy and preserve the native
facts.

## Current implementation boundary

The current server manifest retains every mapped native schedule variant. The
NPC engine owns one global selector state initialized to base selector 1 with
no story flags, and it reselects using the public game date on a new calendar
day. This is a safe temporary base schedule, not the final MMO narrative
system.

Until approved narrative policy is compiled into the runtime:

- keep the global selector flags empty;
- do not feed one player's dialogue flags into shared NPC simulation;
- do not aggregate connected players' flags by minimum, maximum, majority, or
  most-recent update;
- do not treat public calendar rollover as story progression; and
- do not remove retained native variants or their evidence.

## Context recovery checklist

Before continuing narrative, flag, or schedule work after a context reset:

1. Read this document.
2. Read [scheduled-npcs.md](../implementation/scheduled-npcs.md) and
   [multiplayer-server.md](../implementation/multiplayer-server.md).
3. Identify whether the task changes shared world state, personal narrative
   state, a presentation overlay, or an instance.
4. Verify that public date is not being used as personal story state.
5. Preserve numeric native flags and evidence alongside any readable alias.
6. Review all source instances belonging to the same narrative identity.
7. Test reachability and cross-NPC consistency, not only one actor's output.
