# Final day and departure

This chapter continues the separately saved [ride home and rest](story-nozomi-rescue.md#ride-home-and-rest).
The [GameSpot guide](https://www.digitpress.com/library/manuals/dreamcast/shenmue_guide.pdf),
printed pp.63–65, establishes meditation, Tom's invitation, dismissal from Alpha
Trading, Tom's training/farewell, the evening confrontation and departure.
Ordinary authored Yarn events own progress; original films cannot award combat
or training success. Original controller reconstruction is not a prerequisite.

## Morning presentation sources

All three presentations use the existing Disc3 chapter pack builder and shared
AUTH player. Archive hashes pin original source identity; actors, motions,
cameras and available audio remain original. Model/prop associations are
declared authoring decisions, not recovered native controller dispatch.

| Event | Original source | Important retained data |
| --- | --- | --- |
| Dojo meditation | `JHD0/MSOU.PKS`, `92d841582c87eda667d2f377bbbc3cadbb2618fa4a414651bcee72182a8d14ec` | `SEQDATA1.AUTH`, 1,150 frames; `M_01MSO.MOTN` bank16, Iwao's `IWA_M`, sword/scabbard `SINS501G`/`SAYS500G`. No authored speech. |
| Tom's lunch invitation | `MFSY/TOMOGORI.PKS`, `cce64a24b1d50d80efd0e008a7e714b6811e5c7db4063df0e043d2de840dcc09` | `SEQDATA1.AUTH`, 713 frames; `M_01TOM.MOTN` bank16, original `AMG_L` Tom body, `01TOMA.AFS` and `A1_TOMNA.SND`. |
| Yada's dismissal | `MFSY/MARU_KUB.PKS`, `ffc7a9549dca0d9fe6f683f7884e8239a511bfc74f5d8cac7281962674552cb5` | `SEQDATA2.AUTH`, 1,720 frames; `M_01KUB.MOTN` bank17, existing Yada body, original Alpha room, `01KUB.AFS` and `A1_KUBI.SND`. |

Generate one selected presentation using
`node tools/cutscenes/build_harbor_job_pack.mjs --profile final-meditation --audio`,
or profiles `tom-lunch-invitation` and `yada-dismissal`. Generated manifests
record individual source, voice, sound and output identities. No asset
publication is implied by local generation.

## Connected morning event definitions

| Field | Dojo meditation | Tom's invitation | Alpha dismissal |
| --- | --- | --- | --- |
| Personal prerequisites | Story Ryo, completed opening and independently saved final-morning rest. | Saved meditation. | Saved lunch invitation. |
| Location / trigger | Walk into the established dojo-floor volume in `JHD0` / Hazuki Grounds, then choose **Meditate** or **Not yet**. | Arrival/approach around original TOMOGORI Ryo browser `[106.778,0,14.119]`; **Talk with Tom** / **Leave it for now**. | Existing tested Alpha doorway approach `[25,0,71]`; **Speak with Yada** / **Leave it for now**. |
| Cast / props | Ryo, original Iwao body, original sword and scabbard; prop associations are authored from archive identity. | Ryo and original archive-local Tom body. | Ryo, existing Yada body, original Alpha room leased for presentation. The door remains an original reference without separate moving geometry. |
| Sequence / audio / camera | Original 1,150-frame ASEQ and 39.2-second movement/camera coverage, 17 original effects, no voice commands. | Original 23.78-second camera/motion, seven original English voices and ten effects. | Original 57.35-second camera/motion, fourteen original English voices and eight effects. |
| Time / weather | Preserve weather. On acknowledgement, advance to 10:15 only if earlier; otherwise preserve current date/time. Transfer to original Tom approach. | Keep personal clock/weather. Acknowledgement transfers to the tested exterior Alpha approach; original automatic walking is condensed to saved travel. | Keep personal clock/weather. Restore exterior approach; do not strand Ryo inside unloaded room geometry. |
| Challenge / outcome | No challenge or invented insight flag. Save only meditation and reviewed travel/time. | Save only invitation and lunch-promise notebook page. No actual lunch, training or farewell result. | Save only dismissal and its notebook page. No salary, compensation, inventory grant or farewell result. |
| Cleanup / cancellation / replay | Each film uses the shared return-state, camera, actor and control leases. Cancel/preparation failure saves no own outcome and permits retry. Natural ending or supported explicit skip must be acknowledged before settlement. Completed events do not replay; already earned preceding outcomes survive cancellation/reconnect. | Same ownership and settlement rules. | Same ownership and settlement rules. |

The original automatic morning routing is deliberately condensed. A late or
reconnected personal save is not locked out by a missed 10:15 appointment and
does not jump to the following day just to reach it. No original calendar bit,
native controller state, weather or unrelated NPC schedule is fabricated.
Incidental ghost compositing, separate door callbacks and soundtrack selection
are not reconstructed by this chapter.

## Verification and remaining work

The real Yarn compiler/engine checks the three events independently: missing
prerequisites, Free roam, incomplete opening, wrong bounds, completed events,
decline, cancellation before/during film and successful acknowledgement.
Early, exact10:15 and late saves prove that only early meditation advances the
clock, without a date rewind or extra-day jump. Exact allowed effects exclude
money/items, training and future story results. The real official import CLI
also validates/publishes all three events in the isolated QA database. The
content generator now rejects out-of-range trigger priorities before producing
invalid import metadata.

The 4.3-minute earned-save browser continuation passes real world loading and
the dojo approach, decline, cancelled meditation/reload/retry, its natural
ending, same-date10:15 Tom arrival, cancelled/retried/naturally completed
invitation, immediate Alpha arrival, cancelled/retried/naturally completed
dismissal, both notebook pages and completed reload without replay. Controls
are released, ¥22,836 and eight inventory entries are unchanged, and no later
training/farewell/finale outcome is inserted. Source cameras show Iwao's close-up,
Ryo's invitation shot and both Ryo/Yada inside the original Alpha room.
A separate 40.7-second renderer-only check confirms Tom's original body and
cart, both Tom and Ryo together, explicit cancellation and restored pose/controls
without changing earned flags. It does not count as another narrative win.

Presentation limits remain explicit: the morning dojo lighting is dark and
the vision uses ordinary original actor presentation rather than reconstructed
ghost compositing. Detailed room-door callbacks and soundtrack selection are
not claimed. No replacement speech or missing-voice alias was needed: all 21
requested English voices and 35 effects resolve. No assets have been uploaded.

Tom's actual lesson/farewell, evening battles, final Chai encounter,
departing gifts and departure remain separate missing outcomes. The guide's
training input is forward, forward, A, A. Watching a demonstration must not
count as performing it. No future outcome should be inserted into a saved
morning checkpoint.
