# Goro's Warehouse No. 8 distraction

On the day after the harbor guards turn Ryo away, approach Goro near Warehouse No. 8 and choose **Ask Goro for help**. Ryo and Goro speak, then Goro and Nagashima pick an argument with the guards. Ryo slips through the ground-floor entrance while they are occupied. The rear window remains a separate way to gain access.

## Original controller and personal Story state

| Source | What it controls |
| --- | --- |
| Disc 2 MFSY, routine 0x54568, write at 0x54cae | Front guard refusal sets flag 230. |
| JOMO, 0x4d842–0x4d8ae | After refusal and before gaining access, the home morning code sets flag 813. Story records the refusal date and checks the personal calendar. Existing Story saves that recorded only the refusal can use the route. An original-state-only save must have both 230 and 813. |
| MFSY, 0x24926 and 0x26f18 | Requires 230 and 813 with 240 clear. Checks within eight units of the native harbor point (-114.5, 0, 108.45). |
| MFSY, 0x6d164 → 0x6d9c4 → 0x6c114 | Binds the E1081 conversation and the 01GAR recording to GKYU. Plays the prelude and selects film slot 0. |
| MFSY, 0x6d848, 0x6d860 and 0x6d8b8 | Sets flags 192 and 240 and travels to MS8S entry 1. Story commits the travel and personal flags on successful completion. |
| MS8S, CHRS data at 0x2df84 and 0x2df98 | Ground-floor arrival at browser coordinates (-8.31, 0, 135.76), native yaw 225°. The rear climb enters upstairs at entry 0. |

The Goro route gives the two original flags and a personal completion receipt. The rear climb also sets 240. Declining or cancelling the distraction preserves the choice of entrance. After the distraction, climb the stairs and approach the office. A two-unit, three-dimensional native position and facing check starts the invoice conversation. The two office staff and Ryo have ten recorded lines in this branch. It writes flag 242, adds the Old Warehouse District clue to the notebook and returns Ryo to the harbor through MFSY entry 5. The window route keeps its existing arrival sequence.

The upstairs MS8S collision field contains three hinged doors. MAPINFO names the same CHRT image `MS8S_DOOR` three times at `0x2b4dc`, then places three instances starting at `0x2b52c`. The image resolves to `DR02_026.MT5`. Instance 0 meets upper collision segment 960 and retains its harbor return. Instances 1 and 2 meet segments 616 and 644 and open within the warehouse. Ryo can approach the office listening point from the corridor with those doors closed.

## Voices, staging and film

The four prelude voices play at native frames 0, 100, 230 and 360. Cameras 8250, 8251, 8252 and 8253 cut at frames 0, 110, 170 and 200. The prelude uses the source actors' marks and Goro's motions from M_GKYU.MOTN. His two run clips play at the native three-quarter speed. Camera 8251 uses a fixed 1.6-unit head-height approximation for its Ryo-relative position and target. The original director waits until frame 440 before its fade. The original BGM090 cue starts during the prelude and continues across the handover to the native film. Cancellation releases it with the rest of the presentation.

The 930-frame GKYU/SEQDATA2.AUTH film contains the camera track, five actor movement tracks, nine motion commands, eight English voice cues and 25 sound commands. Eleven distinct sound-bank records supply the effects. It uses M_01GAR.MOTN, the 01GAR recordings, A1_SOKOS.SND, BGM090, and the original actor models for Goro (KMB_L), Nagashima (YAB_L) and the two guards (KVJ_L and KVK_L).

The original MFSY controller writes Goro's face parameters at `0x6d5dc` and requests his face at `0x6d5f0`. The film attaches the Disc 2 `KMB_F.MT5` head and its `KMB_FTBL.BIN` deformation table to Goro's `KMB_L` body. Six vertices bind at the neck seam and the detailed mesh replaces 238 coarse head triangles. The four `01GARB001–004` recordings carry 60 Hz SRF mouth cues. The game evaluates their shapes with 80 upper-face and 80 mouth poses obtained by running the original SH-4 TALK function. The staged prelude uses Goro's regular head. Nagashima and the two guards use their original body meshes.

To reproduce the face poses, use the isolated TALK fixture described in the [animation tooling guide](../guides/tooling/animation-and-placement.md#extract_native_face_posespy). From the checkout run the following command with the fixture's GDB port.

```sh
python3 -m tools.animation.extract_native_face_poses --port 3264 \
  --binding GORO=KMB:extracted_disc2_v2/data/SCENE/02/MODEL/FACE/KMB_FTBL.BIN \
  --output play/assets/harbor/goro-guard-distraction/goro-talk-poses.generated.json
node tools/cutscenes/build_goro_guard_pack.mjs
```

The asset and staging builders check source hashes before rebuilding. The original package and generated dialogue are covered by [package checks](../../tests/GoroGuardDistraction.test.js). The server's optional-encounter tests exercise the original flags, dated and older personal saves, both cancellation points, the alternate entry, and replay prevention.

## Upstairs office after the distraction

Entry 1 places Ryo on the ground floor at world (-8.31, 0, 135.76). Goro's
receipt enables the upstairs listening scene. MS8S director `0x25bd8` tests
the native point (18.01, 4.275, 137.16) at `0x25f8e` using a 2 m sphere and
bearing 8192 ± 16384 in 16-bit turns. Server and client run the same test. Walk along the upper corridor to world (-19.5, 4.275, 137.75) to
hear the workers through the office wall. Standing directly underneath cannot start the conversation.

Both native MS8S collision fields mark the ends of this 6 m stair flight.
In field 0000 the lower and upper entrance records are 44 and 844. In field
0001 they are 536 and 508. A code-0 L-shaped barrier (record 72) crosses the
flight on the ground-floor field. The upper field supplies two boundary rails
(records 700 and 816). Between the two gate midpoints, world (-8.376,
151.397) and (-12.621, 155.637), the browser selects the upper rails across
the original width of 1.799 m. The room director also reads Ryo's base
position at `0x2608e` and distinguishes the upper floor with Y > 4 m at
`0x260aa`. Story uses this source floor classification to select 0001 over
the rest of the upper level, including window entry 0 at y=4.275. This
collision selection is an adaptation of the director's floor test. Below that
threshold and outside the stair flight, 0000 governs the warehouse, including
Goro's entry 1 at y=0. A Radeon keyboard run walked from his actual doorway
around the crates, up the full flight and along the upper corridor with the
doors closed. The listening scene started at (-19.704, 4.275, 138.203).
Cancelling there left bit 242 clear. Across 157 shipped collision variants,
only MS8S gains this floor and stair handoff.

The upper floor has three code-100 hinged thresholds (0001 records 960,
616 and 644). Each hinge opens and closes its own collision segment. Near
960 the room director calls `0x26b84` with mode 2 for inspection line A028.
Near 616 it uses mode 3 for A003. These are independent indoor inspections.
The only recovered MS8S script transfer to MFSY entry 5 occurs at the end
of the invoice director. The generated map catalog associates the room's
named door with that destination because it is the room's sole outgoing
destination. In the browser, using handle 960 opens its leaf and then
travels outside. The 616 hinge opens into an interior office. Ryo can hear
the workers from the corridor without opening either door.

The original invoice owner is `0x27284`. Ryo moves to native (16.15, 4.275,
135.18) and listens at the office. The package stages the original
`AKI_KIKU_HANASI_TATIGIKI_F_0100` clip from M_0153 and both M_MS8S
worker gestures. It uses the KWA_L model for Tomohito Niizato and SGK_L for
Tsukasa Takagi. Both models are byte-identical to their room package members.
Moving camera 1106 follows its source splines for 4⅓ seconds. The shot holds
during player-paced text. The source's other camera changes and the timing of
individual worker gestures remain approximate.

The ten original E1009B recordings play in director order (A013, B001, C001,
B002, C002, C003, B003, C004, A014, A017). After the last line, `0x28146`
sets native bit 242 and `0x2815e` returns Ryo to MFSY entry 5. Story saves the
same native flag, Old Warehouse District notebook clue, and named invoice
completion together. Cancellation preserves the completed diversion and allows
another approach. The existing window-entry route retains its earlier arrival
presentation.

An independent ground-floor inspection remains under investigation. MS8S
`0x246ac` offers separate A019 and A020 branches at `0x25502` and `0x2558e` about the
address on a printed invoice. The specific selectable object, inspection prerequisites and
terminal progression write still need verification. The separate lighting hint
from `0x28198` plays A018. Neither hint grants the upstairs route's clue.

Rebuild the staging with `node tools/scripting/build_warehouse_office_staging.mjs`.
`tests/AuthoredSceneStagingRuntime.test.js` exercises the shipped camera and
three motions. Server `internal/scriptevent/warehouse_office_test.go` exercises
the spatial gate, both receipts, all ten voice IDs, cancellation and travel.
