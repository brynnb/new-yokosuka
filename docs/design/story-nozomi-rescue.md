# Nozomi's rescue

This chapter follows [Chen's post-letter warning](story-harbor-work.md#post-letter-master-chen-visit).
Progress uses ordinary server/Yarn events and personal saves, not the original
room controller. Verified gameplay reaches the transport inquiry and motorcycle
handoff after the late-night telephone call, then the controllable motorcycle
ride and saved harbor arrival. The warehouse battles and original hostage
conversation are connected; their verification boundary is recorded below.
The ride home and separate dawn/rest saves are connected; their verification
boundary is recorded below. The [final-day continuation](story-final-day.md)
now connects dojo meditation, Tom's invitation and Alpha dismissal; subsequent
training/farewell, final battles and departure remain missing.

## Rest and the call

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp.60–61, orders evening rest, waking at 23:45, Ine-san's warning and
Chai's demand to meet behind Warehouse No.17. A later motorcycle ride and fights
are genuine challenges, not outcomes to award for watching this conversation.

| Field | Implementation |
| --- | --- |
| Prerequisites | Story Ryo, completed opening, earned post-letter Chen conversation and fifth working day. Free roam and other players' progress are unaffected. |
| Optional rest | At the already tested bedroom approach, 20:00–23:45, choose **Rest for a while** or **Stay awake**. Accepting atomically saves 23:45 on the same personal date, the existing bedside arrival and only the rest receipt. No sleeping film or following-day skip. |
| Call trigger | Walk into the tested foyer/hall approach after 23:45 and before 06:00. Ordinary waiting can bypass rest. The server independently checks time, location and prerequisites. |
| Actors / prop | Original AKIR and INE_ movement/body clips and the existing TEL_ telephone. Borrow and restore the phone; do not add a duplicate world model. Chai and Nozomi are remote voices, not bodies in the house. |
| Sequence / cameras | Original embedded `01GET` alternate AUTH, 2,265 frames; the shared player retains its camera and movement tracks and 79.33-second presentation duration. Bank 25 uses original `M_01GT.MOTN` sequence indices 32/33. |
| Audio / environment | All 19 English voices/subtitles and 10 original effects resolve. Reuse BGM063, which the original map's adjacent resource cluster names; starting it at activity entry is an authored timing approximation. Preserve personal weather, date and ordinary home rendering. |
| Outcome | Natural ending or supported explicit skip saves only the call milestone, notebook clue and server-derived personal call minute. No money, inventory, rescue, bike, combat or later-chapter success. |
| Exit / retry | Restore the original gameplay position, camera and controls. Cancelled or failed preparation/presentation remains retryable; saved rest survives reload, an unacknowledged call does not. Completed reload must not replay. |

The ordinary foyer trigger, optional rest choice, timing window and return to the
gameplay approach are authored. The original automatic 00:03 departure is not
recreated: the personal clock pauses during presentation and resumes on exit.
The later transport deadline is not implemented or falsely marked successful.
Detailed telephone receiver/hand callbacks and exact facial animation remain
limited by the shared original-scene player.

## Source identities

- Disc3 JOMO `MAPINFO.BIN`:
  `43c613a944cc021e26793193826cf6e7dde57cd5f55ce1bfa9c1e41ce33c9c89`.
  Selected AUTH at `0xae990`, 9,480 bytes,
  `42959eb45297b6dfc93906cf1403b4a4a0d10f7a9d98399973094e650ba9f78f`.
- `COMMON03.PKS`:
  `4df506b3994e111f1bc105a4485a22b19abcdf9cb6a1a02b2e0fab3f049cf136`;
  `M_01GT.MOTN`, 33,268 bytes,
  `d5fa591c1fadad7e1a4391390d57452c51ec69d5badaa598f1af54d3b55b618a`.
- `01GET.AFS`:
  `094744020cc5e287d1bcad7b4f2e76643e502dca1b7bc76c8a42506724d9862e`.
- `A1_FUKYU.SND`:
  `ef51ec306c847c654388677b89f6cf67698287b51f11252c6f546486266476f7`.
- `BGM063.SND`:
  `10dd803ed6c835cfc54967205bcae9e9c7eed0ba9380a9d5e52c9d49f084c879`.
  Reuse the viewer's existing rendered track, source ID
  `9c6892be5fa729b65e082fca6ea936f53f9ddcd4b1e30a10fd75a688674758fc`.

The longer 2,420-frame AUTH at `0x9f1fc` requests `01GETA001.str` and
`01GETB001.str`, neither present in this disc's English `01GET.AFS`. The selected
original alternate requests exactly the 19 available files. Its use is an
explicit adaptation, not a recovered native branch predicate. No missing voice
alias, invented speech or edited AUTH command list is used.

Generate this presentation with
`node tools/cutscenes/build_home_ticket_pack.mjs --profile nozomi-night-call --audio`.
The existing shared compiler now accepts a source disc per profile; Disc2
profiles retain their original paths and identities.

## Finding transport and borrowing the motorcycle

The same guide, printed p.61, directs Ryo to a late-opening bar after learning
that the buses have stopped. Saijo suggests Naoyuki, whose house is in
Sakuragaoka. Visiting the friend directly is also valid; the optional inquiry
does not become a fabricated prerequisite for borrowing.

| Field | Implementation |
| --- | --- |
| Eligibility | Personal Story Ryo with the acknowledged hostage call, 23:45–03:00. Neither event is available in Free roam or before the call. No extra weather/date reset. |
| Saijo trigger / cast | Ordinary click on the existing Saijo resident at Bar Yokosuka (`DBYO`). Reuse normal NPC facing and gameplay camera, not a duplicate private bartender. |
| Saijo action / audio | Eight original `F1131` English lines: urgently ask for a motorcycle; Saijo suggests Naoyuki. Ordering is authored. Cancellation saves nothing; final acknowledgement saves only referral/notebook. The suggestion retires after the borrowing is complete. |
| Naoyuki trigger | Authored approach volume around original `BIKE/SEQDATA1` initial Ryo pose, native `[10.151859,0,32.457863]`, mirrored into browser X. Explicit **Ask to borrow the motorcycle** / **Leave it for now** choice. |
| Naoyuki cast / props | Original Ryo and Naoyuki motion/camera, existing original `RFB_L` Naoyuki body. The package's `YKG_M` is not used as Naoyuki. Original motorcycle and helmet reuse their own movement tracks. Model associations are authored; speed/headlight/taillight reference planes are not rendered. |
| Presentation / timing | Original `BIKE/SEQDATA1.AUTH`, 1,640 frames, 54.68 seconds, `M_01BIKE.MOTN` bank 16. Thirteen English voices and sixteen effects resolve. The offscreen `damy` speaker is labeled neutrally **Voice**, not assigned an invented identity. |
| Music / environment | Original JD00 resource cluster names `01BIKE`, `bgm200.snd` and `a1_bikek.snd`. Reuse the existing viewer BGM200 rendering through `/play`'s shared music registration. Starting it at film entry is an adaptation. Preserve personal night/weather. |
| Borrowing outcome | Acknowledged natural ending or explicit skip saves permission, notebook and personal minute only. No permanent inventory item, money, time jump, course/harbor arrival, driving victory or rescue result. |
| Exit / retry | Shared presentation restores the gameplay approach, camera and controls, even though the original film includes Ryo riding away. Leaving/cancelling is retryable; reload must preserve completed outcomes without replay. Detailed keys/hand callbacks remain omitted. |

The separate [two-minute motorcycle challenge](#timed-motorcycle-ride) now
supplies the actual riding outcome. Watching this film does not stand in for
controlling the bike or reaching the harbor.

### Transport source identities

- Disc3 JD00 `BIKE.PKS`:
  `210e1da2234b945233003d61801d2fd6f12b0a48c4b05d3f8bfcb14bce8aa971`.
  `SEQDATA1.AUTH`:
  `3696031327eb6a138705cec6af4f75884d741af8727b7467a38a436c24562a47`;
  `M_01BIKE.MOTN`:
  `00156cbf7b4bf80522147d444f7996e6658fcfb22198adc323b3a6e1b8d44089`.
- JD00 `MAPINFO.BIN`:
  `e4226a975c1ed35277eb3e6474928eeba0c10ecf4d8e293319c3f4aa76223e78`.
  Resource cluster at decimal 429477 names `01BIKE`, BGM200 and A1_BIKEK.
- `BIKE.PKF`:
  `7543a068268fc6664eb8b2394a03ea2ae9001d79e8712108a328f526a665398c`.
- `01BIKE.AFS`:
  `e5dbf50ca72ea0ae81ac0d886556eb5fe7616d15f720dc5503df7c3e0aca03ad`.
- `A1_BIKEK.SND`:
  `dae8dded2c83d1e34f455f9327f9d445c3b3f4208d81dc6223353a4728d216cf`.
- `BGM200.SND`:
  `33e03d8688b0714d16e3f987a054dcbafc52722fe69c69429531516bfa7fab9e`.
  Viewer source ID:
  `d613ad6c6de39f76be5166d29e5ceb8d3a028280998f913909597f6eaa958a29`.

Generate the film through the existing Disc3 archive compiler:
`node tools/cutscenes/build_harbor_job_pack.mjs --profile nozomi-motorcycle --audio`.
The ordinary Saijo dialogue uses `build_story_investigation.mjs --voices
--voice-route saijo-nozomi-transport`; source is the existing HUMANS English
resource, with no fabricated lines or aliases.

## Verification

The real compiler checks prerequisites, both sides of the overnight window,
wrong location/mode/opening, decline/cancel and once-only outcomes. Rest cannot
award the call; the call cannot award rescue, money, items or travel.

The connected browser check starts from the genuinely earned Chen save. It
verifies ordinary travel/waiting, bedside decline/cancel, same-date 23:45 rest,
saved reload, real bedroom-door use/walking, cancelled call/reload/retry,
natural ending, successful BGM063 response and completed notebook/reload
without replay. Rendered captures show Ine-san and Ryo in the original shots.
Currency remains ¥22,836 and inventory is unchanged. The 33 new local runtime
records total 1,696,609 bytes and match their hashes/sizes; none were uploaded.
Auditory mix comparison and exact receiver/hand animation are not claimed.

That test first exposed a clock boundary bug: the old personal waking-day
calculation changed a saved 23:45 to the following 08:45. New characterization
tests failed by exactly 32,400,000 ms before the fix. Story now uses continuous
24-hour snapshots, preserving the existing 15-game-seconds-per-real-second pace,
scene pause and offline freeze. Public Free roam retains its original skip.
Focused clock/realtime tests cover overnight saves, transition/pause, midnight
and year rollover, viewer isolation and stale receipts; the existing browser
interpolator already supports the advertised 0–24-hour bounds.

The transport continuation also passes a connected earned-save browser check:
real Bar Yokosuka door entry, visible Saijo click, cancelled/retried original
inquiry, saved referral/reload, real Ito-house approach, leave/cancel and saved
confirmation retry, original film's natural ending, BGM200 response, independent
permission/notebook and completed reload without replay. Captures show Saijo,
Naoyuki, Ryo, the original motorcycle and helmet. Currency remains ¥22,836 and
inventory is unchanged; no ride/rescue outcome is awarded. All 47 new local
asset records (2,081,431 bytes) match their hashes/sizes; none were published.

## Timed motorcycle ride

The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp.61–62, describes acceleration, braking and steering, two real minutes
to reach the harbor, road-edge scrapes and retry after failure. The original
`SCENE/03/NBIK` is also identified in the
[format guide](../research/shenmue1/file-formats.md). No typed Entry or default
AKIR placement was extracted for this area; the start and finish below are
explicit authored choices, not a recovered native route-controller result.

| Field | Implementation |
| --- | --- |
| Prerequisite / entry | Saved borrowing permission and personal Story Ryo. The already tested Ito-house approach offers **Ride to the harbor** / **Leave it for now**. Repeatable travel saves the road start and only an entry receipt. Neither a movie nor boarding counts as a completed ride. |
| World / cast | Normal world loader, original `S3_NBIK_MAP17.MT5`, Ryo, original BIKS520G motorcycle and `AKI_AKI_MOTORBIKE_1` riding pose from the existing original M_01BIKE bank. No alternate renderer or permanent inventory vehicle. |
| Route / support | Start at browser `[18,0,-66]`; 13 ordered gates lead along the original main road to `[18.038,7.2,-846]`. Compile the asphalt triangles and their actual bends, dips and elevated decks. Surface lookup follows the connected height, rather than snapping to a bridge above an underpass. |
| Controls / camera | Forward accelerates, backward brakes, left/right steer; existing movement bindings and held touch buttons. Chase camera follows the bike. The shared actor presenter and prop adapter each receive the same once-converted native pose. |
| Timer / authority | 120 real seconds start only after models, motion, input and presentation are prepared. The server accepts bounded, increasing-sequence control intents under the current event/token. It owns speed, road-edge contact, height, gate order and deadline. Client position, animation or a supplied result cannot win. |
| Failure / retry | Timeout and lost input yield no ride receipt. Choose another attempt or return to the tested Naoyuki approach. Retry gets a fresh token, start, deadline and zero gates. Cancelled/failed preparation releases the model, camera and input owners. The whole reviewed road is eligible after reconnect, so a transient mid-ride saved pose cannot strand the player outside a tiny start trigger. |
| Completion | Only actual driving success atomically saves the ride flag, server-derived personal minute and existing tested Warehouse No.17 alley arrival. No currency, inventory, rescue, battle, next-day or finale outcome. |
| Calendar / weather | Preserve the personal date/weather. Existing Story presentation pauses the calendar during the challenge. Do not force 03:00 or make retry permanently unavailable after that hour. This differs intentionally from the original fixed-time departure. |

### Road source and declared adaptations

`NBIK/MAP17.MT5` SHA-256:
`4be58ff0bb5d2d7fd3a429847a53e542cd4a8509e2a9dbc654529e367cb014d5`.
The extracted original and the viewer/game's existing public model are
byte-identical. Decoded texture slots 77/86, IDs `d8a4d2926631425f` and
`d8a4d2926531425f`, are the asphalt/marking resources. Slot 78 is pavement,
not road. Flat normals or map bounds alone are not a safe surface classifier.
The compiler retains 513 road triangles, welds sub-millimetre tile seams at
1 mm, and deterministically samples 131 centre-line points and the gates.

Regenerate through `node tools/worlds/build_motorcycle_course.mjs`, with
`NEW_YOKOSUKA_SERVER_DIR` when the server is not the adjacent default checkout.
Then mirror contracts with `node scripts/check-server-contract.mjs --sync-scripting`.
Original extraction is required for compilation, not for server runtime.

Starting/ending points, ordered gates and simplified handling are authored.
Maximum speed is 16 m/s, acceleration 5 m/s², braking 12 m/s² and steering at
most 1.2 rad/s. Road-edge contact slows the bike without persistent damage.
This is a bounded playable reconstruction of the main road, not proof that
the original complete route/controller was recovered. Traffic, original horn,
helmet attachment, dynamic lean/wheel animation, detailed hand grips and exact
headlight/audio mixing remain omitted. The original riding pose is held.

### Ride verification

Focused server tests drive the original geometry using controls only; validate
malformed input, road edges, ordered gates, deadline, interrupted input and
fresh retry state. Real Yarn compiler/engine tests exercise the actual content
through success, timeout/retry, interruption/retry, cancellation, returning to
Naoyuki, missing permission, wrong bounds/mode and completed re-entry. Only
travel/minute/ride effects are permitted. Client tests cover asset preparation,
late cancellation, failed loading, matching rider/prop coordinates, owned cleanup
and preserving driving controls through the actual WebSocket serializer.

The connected real-GPU browser check starts from the genuinely earned borrowing
save: confirmed road transfer, original rider/bike/street rendering, real driving,
X cancellation, saved road reload, return to Naoyuki, physical gate approach,
another confirmed transfer, all 13 gates through keyboard controls, saved harbor
arrival, released controls and completed reload without replay. It passes in
1.9 minutes. Rendered captures show the aligned rider/bike and original bends.
Currency stays ¥22,836, inventory is unchanged, and only the entry/ride receipts
are new. No future rescue, battle or finale flag is inserted.

The first rendered check exposed a missing WebSocket field; the serializer now
has a regression for real driving-control payloads. A second check exposed a
double-mirrored rider/prop placement. The compiled road now uses the same browser
coordinates as existing movement challenges, while both presentation adapters
receive matching, once-converted native poses. Neither issue is masked by a
location offset or alternate model. The final check uses a fresh clone of the
earned pre-ride save. No additional game-art/audio binaries were generated or uploaded.

## Warehouse battles and Terry's deal

The same GameSpot guide, printed pp.62–63, orders a harbor fight, another fight
inside the warehouse, then Terry's hostage deal and the ride home. Separate
ordinary Yarn events save the two victories before the conversation. No native
room-controller reconstruction is required for these outcomes.

| Field | Implementation |
| --- | --- |
| Prerequisites / trigger | Personal Story Ryo with a genuinely completed motorcycle ride. The tested Warehouse No.17 alley offers **Face the attackers** or **Leave it for now**. Server-side mode, opening, milestone and bounds gates are independent of client dispatch. |
| Outside fight | Six distinct original `TERYB1` bodies, new chapter-local aliases `NR01`–`NR06`, in an authored alley formation. The archive identifies available models, not native spawn count/positions. Shared server combat requires all six actual defeats; only the outside-victory receipt settles. |
| Admission / interior | After that saved victory, explicitly confirm **Enter the warehouse**. Repeatable reward-free Story travel loads original `S3_TERY_MAP17/18/19` structures/ground, starting at authored browser `[-16,0,-24]`. No extracted default Entry exists. Alternate ground/broad harbor layers are excluded. Normal world loading, ground support, private actors and recovery are reused; no second renderer. |
| Inside fight | Seven distinct original `TERYB2` bodies, aliases `NR11`–`NR17`, in an authored warehouse formation. The same combat system saves only its independent victory. Both fights use 100 player health, 28 per opponent, at most two simultaneous attackers, existing basic moves and a fresh attempt after failure. Balance, roster size/formation and AI are explicit adaptations, not recovered native movesets. |
| Hostage presentation | **Confront Terry** starts original `TER2` AUTH C/D/E: 1,985/3,870/180 frames, shared `M_01TAP.MOTN` bank 16, original cameras and actor movement. Original AKIR/MRSK/STSI/HRSK/PEDR/TERY tags are retained; the coda uses CHAI/AKIR/HRSK. Terry/other thug body associations are authored. Nozomi and Shingo reuse the existing reviewed full-body assets. |
| Audio / environment | 52 available original English voices and 17 effects. `01TAPC026` and Chai's `01TAPH001` are absent from the pinned archive and remain explicitly unavailable, without substitute speech/subtitles. Reuse the viewer's BGM084 rendering: the original map resource cluster names this bank beside A1_TERRY and 01TAP; starting it at film entry is authored. Preserve the personal calendar/weather; the interior excludes precipitation. Detailed lighting, faces/grips and hand callbacks remain approximate. |
| Outcome | Only acknowledged natural ending or supported explicit skip of the three films saves `story.s1.nozomi-rescue.completed`, `notebook.s1.terry-hostage-deal` and server-derived personal minute. No money, items, ride-home, calendar advance or final-battle success. The notebook records the actual bargain, not an invented recovered appointment date. |
| Cancellation / recovery | Leave/cancel/preparation failure cannot win a battle or release Nozomi. Interruption/defeat retries with a new combat token. A cancelled hostage conversation retains both earned victories. Warehouse bounds allow recovery from transient combat poses after reconnect; completed events do not replay. The same authoritative transaction path owns all receipts and travel. |

The shared AUTH compiler extracts one original-asset pack. Battle definitions
refer to those same model/texture files, but battle-only actors are excluded
from cinematic instantiation. Source-qualified model pairs and aliases prevent
conflicts with the earlier MFSY biker actors. There is no new global NPC pool,
quest engine, permanent inventory motorcycle or client-authored victory.

### Warehouse source identities

Original Disc3 `SCENE/03/TERY` resources:

- `TERYB1.PKS`: `7f33a31c293b76270c2752981bc356f18461387cd523243460ae812473476ec6`;
  six low-detail BTA/BTB/BTC/BTD/BTE/BTF bodies.
- `TERYB2.PKS`: `17937a5d4ca08568b06c19a02dbe055aad3db4b90c395b1010cfb49447576a54`;
  seven low-detail BTG/BTH/BTI/BTJ/BTK/BTM/OKA bodies.
- `TER2.PKS`: `41ef8c4b096e251ad046e558d455d0972a986dc867bfcd44a4c40c3f6cbda256`.
- `MAPINFO.BIN`: `6395d96f1542fd9d71be9bfa7b42132865031a45437dcfdd098b6b0220291bc6`;
  original resource associations, not an embedded AUTH or recovered Entry.
- `STREAM/01TAP.AFS`: `8824c0058137812470773274106abe8d7bf201957811e69fbe8a12d568d0f97a`.
- `SOUND/A1_TERRY.SND`: `a9066c99966806378f34888d7a4239bde0eec7e33373a2ff0dfec5ab9e4906bd`.
- `SOUND/BGM084.SND`: `b2f1eeab4d264b03ea48c16a50b0b69885e4b939f38268d648db10c19c158d36`;
  viewer source ID `7e5bc0053824814ff10b0c7b78d3ddef0d0f0a769d47c53e35fdfe3851f7f3d0`.

Regenerate with `node tools/cutscenes/build_nozomi_rescue_pack.mjs --audio`,
then existing `build_story_combat.mjs`, `build_story_investigation.mjs` and
`check-server-contract.mjs --sync-scripting`, pointing `NEW_YOKOSUKA_SERVER_DIR`
at the authoritative server checkout. Hash-pinned texture archives and output
identities are retained in the builder/generated manifests.

### Warehouse verification

Real Yarn compiler/engine checks pass both actual fights, decline/cancel,
interrupted-input/fresh-token retry, prerequisite/mode/bounds/opening gates,
already-completed exclusion and acknowledgement of all three original films.
Each settlement contains only that event's own allowed effects. Focused client
checks validate distinct source-qualified model pairs, cinematic loading scope,
world selection and generated asset bytes, plus the existing actor/combat
ownership tests. The first rendered check verifies both keyboard-earned wins,
original warehouse/fighter/hostage rendering and cancelled-scene reload retaining
the victories; its natural-ending wait was too short for the 129-second deal.
The next run naturally completed all three films and saved the release, but
its music assertion incorrectly required a full HTTP200 rather than legitimate
media range responses. The corrected check resumes a copy of the genuinely
earned battle checkpoint, not injected victories. It passes cancellation,
reload, the original films' natural endings, actual BGM084 playback with an
advancing playhead/nonzero volume, HTTP206 responses, notebook settlement,
restored controls and completed reload without replay in 3.7 minutes.

Reviewed captures show the original warehouse/fighters, Nozomi and Terry in the
hostage conversation, and Chai's original jumping-away coda. Currency stays
¥22,836 and inventory is unchanged. All 95 new local runtime records
(6,475,529 bytes, including manifests) match their hashes/sizes; no assets were
uploaded. No future home-ride, final-day, battle or departure result was inserted.
Auditory mix comparison and exact native combat/presentation fidelity are not
claimed. The earlier genuinely earned ride and battle checkpoints are retained.

## Ride home and rest

The GameSpot guide, printed p.63, follows the hostage deal with a musical
motorcycle ride, home arrival at 05:56, then a separate save/sleep and 07:30
wake before the dojo meditation. These are ordinary events in the existing
Story settlement path; the ride is a presentation, not another driving win.

| Field | Implementation |
| --- | --- |
| Eligibility / entry | After the independently saved rescue, **Take Nozomi home** / **Leave it for now** confirms reward-free travel from the tested warehouse to `nbik-home`. Original first-film AKIR pose is native `[133.347809,0,26.650837]`, mirrored once into browser X. This is a cinematic arrival, not a recovered default Entry. |
| World / cast / props | Original NBIK harbor and road geometry in a separate cinematic world; the controllable `nbik` world retains MAP17-only loading. Original CHRS binds the motorcycle, six moving cars and moon. Original speed/headlight reference planes remain references, not recreated glow effects. NBIK requests Nozomi's `NZM_M`; reuse that exact full body from TER2 and its existing textures, not a renamed donor. Ryo remains the owned Story avatar. |
| Sequence / timing / camera | All 23 adjacent original TRCK clips, 4,661 frames / 155.37 seconds, original cameras/movement and M_01BIKE bank16. The existing exact-activity sequence compiler/player keeps one actor/camera/music owner across the shots. Adjacent-file playlist order is authored, not a recovered native controller branch/order. No new cutscene interpreter or story engine. |
| Dialogue / effects | Both original English 01BIKEB voices/subtitles and both original A1_NBIKE engine-effect tracks resolve. The opening conversation is 31.1 seconds; the remaining paired riding/embrace shots total 124.27 seconds. No invented dialogue, alias or skipped unavailable voice. |
| Music | Original Disc3 CDDA track5 is 124.79 seconds. Start it at the second clip and retain it through uncued shots with the existing music owner. Duration correspondence supports this pairing; exact CDDA control/cue execution is not recovered. The original PCM is decoded locally, not replaced with another recording. |
| Time / weather | Preserve the personal weather/calendar during presentation. Harbor layer choices are an authored adaptation of the existing day/evening scheme; MAP17 road remains always loaded, not swapped out as a harbor night layer. After acknowledgement, choose the next 05:56 occurrence, avoiding both calendar rewind and permanent late-save lockout. |
| Home outcome | Natural completion or supported explicit skip atomically saves only home milestone/notebook, 05:56 and the established Ryo bedroom arrival. Admission alone, cancellation or preparation failure cannot award this. No payment, inventory change, rest/wake, dojo, final-fight or departure result. |
| Rest / wake | At the existing tested bedside approach, choose **Sleep until 7:30 a.m.** or **Stay awake**. Sleep independently saves the next 07:30, bedside arrival and rest receipt. The sleeping/waking film is condensed; no unrelated nightmare is substituted. A later personal save targets the following date instead of rewinding. The dojo meditation remains a subsequent event. |
| Cancellation / reload / skip | The shared program releases original actors, camera, audio and inputs on abort/failure; cancelled presentation remains retryable at its saved cinematic start. Saved rescue is retained. Completed home/rest reload cannot replay the ride or grant future progression. Broad cinematic bounds cover transient shot poses without inventing a new recovery system. |

### Ride-home source identities

AUTH files contain `TRCK` headers; `AUTH` is their filename extension, not a
required binary marker. A bounded read of the existing parser reveals the
23 resources at offsets 10,572 through 308,488 in original NBIK `MAPINFO.BIN`.
Each strict container/chunk boundary is validated. Looking for literal `AUTH`
text alone would incorrectly report them absent.

- `MAPINFO.BIN`: `9acf1bacb3ac4f5533d00b709482dfc8848d9c39fcdfa23ce45e1900f0d06e31`.
- NBIK `M_01BIKE.BIN`, 243,256 bytes:
  `b3795359d698c4128ade05ad47dd487c4cc6aba6c51a39a19242e75b06fe5dae`.
  Includes original paired riding, mounting, turning and embrace motions.
- `STREAM/01BIKEB.AFS`:
  `7d018d2ecc4d85e5b680cdcb33f33947970d33b9959f16a51772e120243e7675`.
- `SOUND/A1_NBIKE.SND`:
  `d28ee580a7603f021de0adf0f492f1d802692c658451749d864e0eed2f89b034`.
- Original Disc3 GDI track5: type0, LBA180906, 2,352-byte sectors,
  byte offset352800. Track SHA256:
  `bece1989acdbbd6c707cbf6a41ca95b133f4c123ec4520dc2db7e08054d6dcdb`.
  The 22,012,368-byte, stereo44.1kHz16-bit little-endian PCM payload hashes to
  `031d1b724985ca7737ccdcfae4a2d461e11c219e46425f2b7fecfe1729ea59bf`.
  Adjacent-sample roughness validates little-endian decoding (0.071 versus
  1.416 with the incorrect byte order). The cue/duration pairing remains an
  explicitly inferred authoring choice, not proof of original controller recovery.

Generate through `node tools/cutscenes/build_nozomi_home_pack.mjs --audio`.
The original GDI/CDDA track is required in addition to extracted data;
`SHENMUE_DISC3_GDI` overrides the existing local disc-work GDI. The generator
resolves relative tracks against the real GDI directory, including worktree
links, without putting local paths into generated metadata. Then run:

```sh
python3 -m tools.cutscenes.build_native_activity_preview_programs
python3 -m tools.scripting.build_native_event_program_pack
node tools/scripting/build_story_investigation.mjs
node scripts/check-server-contract.mjs --sync-scripting
```

Set `NEW_YOKOSUKA_SERVER_DIR` for the authoritative server checkout. Native
program regeneration retains JOMO initialization research in the offline pack,
but its explicit `runtimeScope: research` excludes it from discovery metadata
and fetchable production closures. Four older preview shards regenerate with
changed provenance only, not different executable functions.

### Ride-home verification

The real Yarn compiler/engine checks prerequisites, opening/mode/bounds,
decline/cancel, completed/repeatable entry and independent settlement. Normal,
exact-target, late-save and December31/year-rollover cases prove that resolved
clock effects move forward to the appropriate dawn/wake date. Focused client
checks cover exact23-clip program coverage, source/output identities, both
voices/effects, source-qualified Nozomi, original CD audio and research exclusion.
The three relevant Go packages pass with the real Yarn compiler; 100 focused
client checks and 18 program-pack compiler checks pass. These do not substitute
for the rendered handoff check.

The natural 23-shot browser run renders the original conversation and riding
sequence, advances the actual CD audio playhead and saves the 05:56 bedroom
arrival without currency/inventory changes. It exposed a shared dispatch bug:
`NativeScriptedEventRuntime` releases `current` but retains diagnostic status
`complete`; the presentation loop required status `idle` before enabling later
entries. Explicit program skip used cancellation and therefore concealed the
bug. Dispatch now checks actual `busy` ownership (execution, preparation or
automatic poll), preserving terminal diagnostics. The final 3.8-minute connected
browser check passes with that fix alone; the speculative extra networking
barrier was removed before this run. Natural completion reaches the immediate
bedside options, then **Stay awake**, saved reload, independent **Sleep until
7:30 a.m.**, final-morning reload and unlocked controls. All 23 original shot
starts, actual music playback, unchanged ¥22,836/eight inventory entries and no
future final-battle flag are checked. A separate earlier run verifies the
supported explicit program skip. Every check uses the isolated local database
and a genuinely earned rescue checkpoint, not inserted home/finale outcomes.
The earned final-morning database backup is retained. No assets were uploaded.

Rendered fidelity is not complete: Nozomi's riding skirt forms conspicuous
horizontal spikes in a close-up, despite the exact `NZM_M` body and original
paired motions. Standing/dialogue framing is correct. No guessed cloth runtime
mode, donor body or hand-edited source motion was introduced to hide it. The
shared cloth presentation needs a separately bounded investigation; this is a
visible limitation, not a missing story outcome or justification for native
controller reconstruction.
