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

MFSY configures and requests Ryo's face at 0x6d29e/0x6d2fa and Goro's at 0x6d5dc/0x6d5f0. Both heads are attached before E1081 begins. The conversation uses Ryo's original YKC head and Goro's KMB head, with the original face tables and pose data. Each recording's audio clock drives that speaker's SRF mouth cues while the other actor keeps his head. Cancellation and the transition to GKYU release both stage-owned surfaces.

The 930-frame GKYU/SEQDATA2.AUTH film contains the camera track, five actor movement tracks, nine motion commands, eight English voice cues and 25 sound commands. Eleven distinct sound-bank records supply the effects. It uses M_01GAR.MOTN, the 01GAR recordings, A1_SOKOS.SND, BGM090, and the original actor models for Goro (KMB_L), Nagashima (YAB_L) and the two guards (KVJ_L and KVK_L).

The original MFSY controller writes Goro's face parameters at `0x6d5dc` and requests his face at `0x6d5f0`. The film attaches the Disc 2 `KMB_F.MT5` head and its `KMB_FTBL.BIN` deformation table to Goro's `KMB_L` body. Six vertices bind at the neck seam and the detailed mesh replaces 238 coarse head triangles. The four `01GARB001–004` recordings carry 60 Hz SRF mouth cues. The game evaluates their shapes with 80 upper-face and 80 mouth poses obtained by running the original SH-4 TALK function. Nagashima and the two guards use their original body meshes.

To reproduce the face poses, use the isolated TALK fixture described in the [animation tooling guide](../guides/tooling/animation-and-placement.md#extract_native_face_posespy). From the checkout run the following command with the fixture's GDB port.

```sh
python3 -m tools.animation.extract_native_face_poses --port 3264 \
  --binding GORO=KMB:extracted_disc2_v2/data/SCENE/02/MODEL/FACE/KMB_FTBL.BIN \
  --output play/assets/harbor/goro-guard-distraction/goro-talk-poses.generated.json
node tools/cutscenes/build_goro_guard_pack.mjs
```

The asset and staging builders check source hashes before rebuilding. The original package and generated dialogue are covered by [package checks](../../tests/GoroGuardDistraction.test.js). The server's optional-encounter tests exercise the original flags, dated and older personal saves, both cancellation points, the alternate entry, and replay prevention.

## Upstairs office from either entrance

Goro's diversion places Ryo on the ground floor at entry 1, world (-8.31, 0, 135.76). The rear-window climb brings him to upstairs entry 0. Both entrances leave him free to explore and enable the same listening scene. MS8S director `0x25bd8` tests
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

MS8S routine `0x27284` stages the workers' conversation. In the physically triggered mode 0, camera 1105 starts at the player's camera while Ryo walks from his actual position to native (16.15, 4.275, 135.18). The approach lasts two seconds in Story. Camera 1106 then moves into the listening shot. Ryo leans against the wall with the original `AKI_KIKU_HANASI_TATIGIKI_F_0100` motion from bank M_0153, beginning at frame 40 and holding at frame 160.

Cameras 1102 and 1103 cover the workers, with the cut at frame 350. Tsukasa Takagi (SGK_L) gestures at half speed, then holds his pose during the later exchange. Tomohito Niizato (KWA_L) continues his own gesture across that change. Both room models and both motions come from the MS8S package. Camera 1104 starts from the active workers' shot for Ryo's reaction. He then moves to the source window position for the actor-relative camera 1300. Dialogue advances at the player's pace. The timed mode-1 entrance uses an additional camera. During Ryo’s lean, MS8S dispatches sound command `0x000705a9` at motion frames 46, 63, 88, 110 and 139. In the Disc 2 location bank `F1NEW8SO.SND`, group `A905` track 7 contains only the sequence `C0 A0 00 80 FF` (event 0, value 128). It identifies no sample, and the effect of that event in the original sound driver remains unverified.

After A014, the original director writes a 30-frame fade to black at `0x27cec`, then waits at `0x27cfc` before moving Ryo. At the window it uncovers camera 1300 over 30 frames (`0x27fa2/0x27fb2`) before A017. Finishing A017 covers the warehouse over 60 frames (`0x280da/0x280ea`), then leaves it covered for the map transfer. The browser advances the original 8-bit alpha and hands the fully black frame to the destination loader. The Dreamcast updater `0x0c173b68` packs alpha into the high byte of the vertex color. Its draw callback `0x0c173b12` covers the 640 by 480 viewport and the primitive writer at `0x0c17dae4` applies that color to all four vertices.

The ten original E1009B recordings play in director order (A013, B001, C001,
B002, C002, C003, B003, C004, A014, A017). After the last line, `0x28146`
sets native bit 242 and `0x2815e` returns Ryo to MFSY entry 5. Story saves the
same native flag, Old Warehouse District notebook clue, and named invoice
completion together. Cancellation preserves the earned entrance and allows another approach from the corridor.

Two envelopes can be inspected independently of the listening scene. Both are
upstairs. The CHARA.CHRT bindings pair FUT0 with FUTS5K9G and FUT1 with
FUTS5D8G. MS8S initializer `0x23fd8` places them at browser coordinates
(-24.01, 5.04, 137.21) and (-27.33, 5.032, 139.11). The ordinary inspection
dispatcher `0x2560c` calls `0x246ac` with mode 8 for FUT0 and mode 7 for FUT1.
Story uses the two original meshes and a server-checked upper-floor reach volume
for each. This volume adapts the generic native object inspection range.

On FUT1, Ryo first recognizes a Warehouse No. 8 invoice (A019 at `0x25502`).
On FUT0, he notices the old warehouse address (A020 at `0x2558e`). When that
line finishes, `0x255ee` writes 0xff to scene byte `0x20c`. Subsequent FUT1
inspections test bit 0x40 and play Ryo’s question about Master Chen (A009 at
`0x2548e`). The two objects can be inspected repeatedly. Cancelling the address
line leaves the byte untouched, and entering the room again resets it. Each
line uses the original English audio, subtitle and lip data from E1009B.AFS.
The upstairs listening scene alone awards the district clue and sets bit 242.
The light upstairs is a separate timed hint. The map seeds scene dword
`0x214` with 14,400, then `0x25b20` arms slot zero of engine operation
`0x01a9`. The executable's mode-4 getter at `0x0c0c9760` reads this slot.
The update at `0x0c0c983a–0x0c0c9874` decrements it only when the first
engine availability check passes, the second is clear and the activity mask
is nonzero. A wall-clock delay would also count time when this timer is paused.

Once the signed counter is negative and scheduler field `0x1b8` is −1,
the director checks Ryo's height at `0x260aa`. Above four metres, the
timeout calls the listening scene in mode 1. At or below four metres,
`0x2610c` sets room bytes `0x208` and `0x209` and calls `0x28198`. After
a fade the hint places Ryo at world (−14.5, 0, 144.5) facing (−15.0296,
4.275, 134.5931), requests motion 0x387 and camera 1000, and plays A018,
“The light's on. Maybe somebody's there.” It returns control in MS8S.
The live Story region system currently lacks the native activity timer and
scheduler-slot condition for this fallback.

Rebuild the staging with `node tools/scripting/build_warehouse_office_staging.mjs`. To regenerate the three invoice recordings in a prepared checkout, set `NEW_YOKOSUKA_SERVER_DIR` and `VGMSTREAM_CLI` and run the following command.

```sh
node tools/scripting/build_story_investigation.mjs --voices \
  --voice-route warehouse-invoice-address \
  --voice-route warehouse-invoice-label \
  --voice-route warehouse-invoice-label-read
```

The [staging tests](../../tests/AuthoredSceneStagingRuntime.test.js) exercise the six cameras, actor motion, foreground fades and cancellation. The server's `internal/scriptevent/warehouse_office_test.go` covers the spatial gate, both entrance receipts, all ten voice IDs and the exit. The [Radeon runs](../../tools/evidence/story-cutscene-warehouse-invoices-2026-11-25.json) cover both player routes and the physical desk interactions.
