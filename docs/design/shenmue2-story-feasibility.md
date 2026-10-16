# Shenmue II Story feasibility

Reviewed October 16, 2026. This is a source/input and architecture audit, not
implemented or visually verified S2 Story coverage.

The [authored event model](story-event-template.md) is suitable for S2. Reuse the
same server-owned Yarn events, personal calendar, receipts, challenges and
presentation ownership. Exploration assets are substantially available, but
the current S1 cinematic pipeline cannot simply play S2 scene files unchanged.
Do not make another quest engine or require a complete native S2 interpreter.

## Narrative references

The original [Dreamcast manual](https://manuals.plus/m/10bd1931de872f5bbbaec5ea09f6f2fefb460fdd1f55406c725d3c2d2cf6b346.pdf)
describes investigation, the notebook, personal time, timed QTEs and free
battles. It also describes carrying selected S1 possessions, money, moves and
time into S2; it does not specify a New Yokosuka multiplayer migration policy.

Contemporary player-authored references include
[etjester's Dreamcast walkthrough](https://gamefaqs.gamespot.com/dreamcast/458064-shenmue-ii/faqs/52892),
[Crazyreyn's walkthrough](https://gamefaqs.gamespot.com/dreamcast/458064-shenmue-ii/faqs/26765)
and [wardles_tollbar's walkthrough](https://www.supercheats.com/dreamcast/walkthroughs/shenmue2-walkthrough04.txt).
Etjester explicitly distinguishes required scenes from optional subquests.
These establish narrative order, not binary identifiers, exact camera values
or proof that an extracted package renders correctly. GameFAQs access during
this audit was limited to indexed excerpts; the third guide and manual were
accessible. Cross-check a selected event against footage before staging it.

| Narrative section | Useful implementation boundary |
| --- | --- |
| Disc 1, arrival and the Four Wude | Arrival, stolen bag/recovery and lodging; then the search for Lishao Tao and the four lessons. |
| Disc 2, Zhu and Ren | Library work, Chawan Sign, Zhang's rescue, Ren and departure for Kowloon. |
| Disc 3, Kowloon | Investigation, Yellow Head Building, rescues and the rooftop confrontation. |
| Disc 4, Guilin | Travel with Shenhua, route/QTE choices, her home and the final discoveries. |

These are planning boundaries, not a claim that every optional scene has been
catalogued. Original design drafts may differ from the retail game and must not
silently override retail walkthroughs or extracted data.

## Available assets and actual reuse

Counts below are a local catalog snapshot, not an asset-publication receipt.

| Input or subsystem | Verified availability and boundary |
| --- | --- |
| All-disc model catalog | `.disc-work/shenmue2-models/models.json`: 9,842 models, including 5,752 scene models, 36 shared-archive models and 4,054 global models; 1,849 texture packs. It deliberately stages model extensions, not a complete cinematic inventory. See the [model guide](../guides/shenmue2-models.md). |
| Playable exploration worlds | `play/config/worlds.js` has 134 S2 world entries. The generated disc 2–4 exploration catalog contributes 98 of those. World loading, prepared scenery, doors and collision are reusable; a world entry does not prove a Story trigger or cinematic exists. |
| Music | `public/music/shenmue2-asset-viewer-manifest.json` has 425 audible tracks from all four discs. Music rendering and playback are reusable; mapping a particular Story cue still needs source/scene verification. This catalog is not a voice catalog. |
| Characters and motion | MT7 loading and the existing [S2 NPC motion runtime](../implementation/shenmue2-animation.md) are available. Exact HUMANS/model-family identity matters. NPC locomotion support is not proof of cinematic motion compatibility. |
| Scene ownership and actors | `NativeAseqPackageActorRuntime` already accepts MT5 and MT7. Reuse its temporary actors, scenery, camera ownership, cancellation and cleanup rather than building a second renderer. |
| Original files | Full extracted disc 2–4 trees and the disc 1 GDI/track files are locally available. The old disc 1 extracted-tree link is dangling, but a read-only GDI directory traversal found 3,558 files and readable scene/voice archives. Re-extract selected files to durable scratch storage; another disc download is not presently required. |
| Authority and saves | Existing Story/Free roam isolation, atomic effects, time transitions, named travel, combat, QTE and acknowledged presentation are reusable. None currently supplies an authored S2 campaign. |

## Concrete cinematic format boundary

The existing IPAC reader opens the sampled S2 PKS files. Their `AUTHOR.AUTH`
members start with an **AUTH** container, containing named scene records; those
records contain a size-delimited **TRCK** followed by additional data such as
`AUVW`. The S1 activity reader expects an exact standalone TRCK. Passing the
entire member, or its entire named-record body, is therefore incorrect.

Reading only the declared TRCK inside the first named record produced:

| Disc / archive under `SCENE/0n` | Named record / TRCK bytes | Existing readers |
| --- | --- | --- |
| 1 and 2, `AR02/ARMWAUTH.PKS` | `YASA` / 50,900 | TRCK chunk table and one ACAM camera parse. ASEQ rejects frame `942682160`; AMOV cannot resolve its actor tags without ASEQ. |
| 3, `QF00/QES1AUTH.PKS` | `STRT` / 15,104 | Same chunk families and one camera parse. ASEQ rejects frame `825831984`. |
| 4, `552E/MPK00.PKS` | `AT00` / 23,308 | Same chunk families and one camera parse. ASEQ rejects frame `842347824`. |

Each sampled TRCK has `ASEQ`, `ACAM`, `AMOV` and `ASTR` chunks. The frame errors
show the S1 ASEQ layout is not applicable unchanged; they are not evidence of
corrupt disc data. Camera parsing alone proves neither the scene's chosen
camera nor its rendered framing. No S2 cinematic was rendered in this audit.

Archive SHA-256 identities, in table order:

```text
06d07ca610c362e804c40c8957c90a822640078ce5bba7b2d1d1af7546d06d3f
4465f6b64b5e25bc2bfc340da2e2d2905fc1d542920661bd376bd345c6d348e4
997ce39e57a23a054718e727801567a01ce3e2bff5bb58a6d068af6654bfb591
```

The disc 1/2 sample is byte-identical. Sample motion members are
`0008A.MOTN`, `0291A.MOTN` and `0552E.MOTN`. `MotnLoader` can enumerate 16, 8
and 4 entries respectively, but reports `standardBlockLayout: false` and the
same suspicious first-entry `durationFrames: 15564` for all three. This is
**index-reading evidence only**, not valid cinematic animation decoding. The
`.MOTN` extension does not make the S1 body decoder safe to reuse. Start from
the existing S2 curve/rig implementation and validate one actual cinematic pose
against a frame reference before choosing its adapter.

## Missing work before an S2 vertical slice

1. Extract a small, hash-pinned arrival/bag/recovery asset set. Validate the
   AUTH named-record wrapper and the S2 sequence layout without weakening S1
   parsing. Translate only the chosen scene's commands into the shared player;
   authored shots/gestures are acceptable explicitly labelled alternatives.
2. Bind exact actors, body motion, subtitles and voice cues. `SCENE/01/STREAM`
   and the later discs contain AFS containers, but this audit did not decode
   their scene-to-line mappings, language or complete voice coverage. Reuse
   existing audio/container utilities where applicable; do not invent IDs or
   claim the music catalog provides dialogue.
3. Add reviewed S2 personal actor placements and triggers. The current server
   NPC manifest has 234 actors across 33 area mappings and **zero S2 world
   mappings**. Browser-side S2 exploration crowds are not an authoritative
   personal Story NPC stream. Use the existing personal actor/presence policy;
   do not reconstruct all retail schedules before making the slice playable.
4. Extend existing travel/time/content validation deliberately. The server's
   current destination IDs require `^s1\.[a-z0-9.-]+$` and scenes 1–3. Do not
   pass S2 destinations through that contract under disguised S1 identifiers.
   Add game/disc-qualified provenance and collision checks to the same
   catalogs, not a parallel travel system.
5. Define one durable S1→S2 checkpoint in the existing Story save. It must carry
   the reviewed possessions, time, progress and personal NPC context atomically,
   be retry-safe and leave the completed S1 save recoverable. Keep two play
   modes, not a third S2 mode. This audit adds no S2 flags or save migration.
6. Choose an explicit economy adaptation before implementing the bag theft.
   The shared character currently owns yen and inventory across both modes;
   blindly removing those would punish Free roam. Recommended first slice:
   narratively steal/recover the Story bag without deleting shared property;
   do not label yen as Hong Kong dollars. A separate Story currency balance
   would require an approved extension to the same server-owned ledger.
7. Author notebook pages, meaningful choices and actual challenge outcomes
   through Yarn. Accept cancellation, interruption and failed preparation as
   retryable, and verify saved arrival/reload/mode changes in the real browser.

## Recommended first slice

Connect arrival → bag theft → real pursuit/fight and recovery → Come Over
Guest House → first saved night, before attempting the Four Wude. Keep the
original main-route conditions; optional arm wrestling, purchases and incidental
gestures need not block that slice. A staged preview is not completion.

Do not begin the rest of S2 merely because the map catalog is extensive. The
next concrete proof is one correctly bound, cancellable original S2 scene plus
one independently acknowledged gameplay outcome and durable continuation.
