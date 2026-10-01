# Player-facing Shenmue I scene inventory

This inventory answers a narrower question than the raw AUTH corpus: which authored timelines belong to a real player-facing cinematic owner or trigger route, and which coherent scenes are not yet selectable?

The generated report is `tools/evidence/player-cutscene-scene-inventory.json`. Run:

```sh
python3 -m tools.cutscenes.audit_player_cutscene_scene_inventory
```

The reviewed grouping input is `tools/data/player-cutscene-scene-groups.json`. It is intentionally small and human-reviewed. The generator validates every declaration against the selector audit, package-readiness bindings, native owner candidates, program pack, and full AUTH inventory. This keeps semantic judgments reviewable without hard-coding them in runtime code.

## Why 491 AUTH resources are not 491 cutscenes

The discs contain 491 logical AUTH resources and 404 unique payloads across 136 MAPINFO programs. Those include cinematic fragments, alternate gameplay conversations, transition variants, ambient map presentation, resident-object staging, duplicated payload references, and resources whose owner selection has not been recovered. Archive presence alone is therefore not evidence of a distinct cinematic.

The reviewed grouping reduces 58 selector entries to 21 owner/trigger groups.
Many entries are ordered fragments or gameplay variants, not independent story
cinematics. All current selectors use generated preview programs; the older
report's six-owner/52-preview execution split is historical, not the current
runtime classification. The selector-entry count describes the development UI;
the owner/trigger-group count describes the recovered native ownership model.

## Reviewed scene coverage

Every coherent scene in the reviewed player-facing set is now selectable. Nozomi rescue and kitten care use the canonical multi-AUTH sequence runtime, retaining a single package lease across their authored segments.

- **Nozomi rescue** exposes both authored lead-ins as cinematic routes `[slot 0|3, 1, 2]`, with cameras, animation, dialogue, sound, the child's AIRO hand attachment, and aftermath music. The native interstitial's second slot-1 call at `0x7587e` is conditional: the `0x0088` result-3 branch at `0x7562a` bypasses it, while the repeat path loops back through `0x75c48` to `0x74c44`. The old preview incorrectly made that replay unconditional. Interactive fight mechanics and retries are intentionally omitted, not represented as another mandatory cinematic.
- **Yamanose kitten care** preserves its three ordered activities, 6,911 authored frames, 59 voiced lines, exact cameras, actor animation, props, attachment cues, and BGM051 under one package lease. Its realtime interstitial logic and final persistent CATM/BOX1 gameplay-state replay remain fidelity limitations rather than missing cinematic content.

**Fuku-san's letter** has a selector preview for its complete 954-frame TGMA AUTH activity, including the recovered original FUB TALK poses. It remains an activity preview rather than a claim that all persistent gameplay effects of the native owner are reproduced.

The phone-book AUTH is a specialized gameplay-control timeline, not a standalone cinematic. KAKG slots 0 and 1 stage the resident KAWA object for two conversations already in the selector; they are not additional scenes.

## Other records deliberately excluded from the missing count

Four reviewed candidates are ambient or gameplay presentation: JD00 nighttime taxi state, JHD0 MPM support-map staging, JU00 gate/room transition, and D000 nighttime map lighting.

Two JHD0 KAKG installer candidates reference payloads already owned by the reviewed Hazuki conversation route. They are duplicate installer references, not new cinematics.

The former five-candidate discovery boundary is now resolved and promoted into the selected groups. Its 14 installs represent **ten player-facing cinematics backed by 12 unique AUTH payloads**, not 14 scenes:

- DNOZ owner `0x1d74` contains two Nozomi scenes. Selector 0 plays loose `SEQDATA4.BIN` then `SEQDATA5.BIN` with `01SKI`, `A1_NOZOK`, and BGM068; selector 1 plays `SEQDATA2.BIN` then `SEQDATA3.BIN` with `01FULB`, `A1_NONAM`, and BGM068. These are two ordered-fragment packages in the dedicated DNOZ world.
- JHD0 dispatcher `0x56028`, state 97, plays the disc-two `HOUO/SEQDATAD.AUTH` Phoenix-mirror scene through function `0x24044`. Its package needs the Hazuki grounds, Ryo, Fuku-san, the `MIRR` scene object, `M_01DIS`, and `A1_HOUHA`.
- JOMO story owner `0x4f758` selects six distinct silent dream/vision activities, KKYA through KKYF, by exact event codes 2103, 1701, 1801, 2204, 2001/2002, and 2106. The cross-disc archives are intentional; package them as six variants using the bedroom dream presentation and the native BGM079/BGM201 branch.
- TOKI owner `0x19e0` and child `0x2280` install the same loose disc-one `SEQDATA2.BIN` at three state paths (0, 10, and 99). This is one Ryo/Asada cinematic replayed three ways, not three scenes. It needs the Tomato-store world, `M_0142`, the TEGS hand prop/attachments, `A0142B`, `A1_TOURA`, and BGM050.

The exact route, member identity, ordering, content statistics, audio, world, and dependencies are generated in `tools/evidence/player-cutscene-owner-discovery.json`. The player-facing inventory now reports zero unresolved owner candidates, ten promoted discovery scenes, and no newly discovered scene still awaiting selector packaging.

## Promotion policy

A new selector scene should be added at its native owner boundary. Composite scenes remain one selector scene even when their owner sequences several AUTH fragments and realtime interstitials. Gameplay variants may remain individually selectable for testing, but the inventory keeps them grouped under the common trigger family. Ambient, transition, staging, and duplicate records never become selector scenes merely because their AUTH payload parses successfully.
