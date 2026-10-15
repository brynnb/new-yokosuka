# Nozomi's rescue

This chapter follows [Chen's post-letter warning](story-harbor-work.md#post-letter-master-chen-visit).
Progress uses ordinary server/Yarn events and personal saves, not the original
room controller. Current implementation reaches the late-night telephone call;
transport, the motorcycle ride, battles and rescue are not implemented yet.

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
