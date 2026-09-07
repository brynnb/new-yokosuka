# Martial arts combat

This document is the technical guide for martial arts in New Yokosuka. It
describes what was recovered from Shenmue, how it was recovered, how the
browser implementation uses it, and which remaining values are recreations
rather than proven native behavior.

The most important rule when extending this work is to keep provenance
attached to every claim:

- **Extracted** means read directly from a disc file or a captured original
  Dreamcast memory image.
- **Dynamically observed** means confirmed while Shenmue was running in the
  instrumented Flycast build.
- **Decompiled** means recovered from the SH-4 executable in Ghidra.
- **Correlated** means two native records were joined by identifiers,
  sequence-family names, compatible duration, or pose continuity, but the
  original call site has not necessarily been observed.
- **Recreated/tuned** means behavior supplied by this project so the system
  is playable; it must not be presented as an exact Shenmue constant.

Generated JSON under `tools/evidence/` is the machine-readable authority.
This document explains that evidence, while `src/MartialArtsCombat.js`
contains the currently playable interpretation.

## Native source and repository map

The work draws on four distinct source classes.

### Disc 3 data

The extraction root is resolved in this order:

1. `SHENMUE_DISC3_EXTRACTED_ROOT`
2. `./extracted_disc3_v2`
3. `extracted_disc3_v2`

Important native files are:

| Source | What it supplies |
| --- | --- |
| `data/MOTION/MOTION.BIN` | Global animation registry used by Ryo, paired throw victims, reactions, and many other characters. It contains 1,559 named sequences in the retained extraction. |
| `data/SCENE/03/MFBT/M_FGT1.BIN` | MFBT-specific fighting bank: 513 named sequences, of which 512 decode completely. This supplies Chai's stance, guard, attacks, reactions, and the matching Takkule victim clip. |
| `data/SCENE/03/MFBT/EN_RYOU.BIN` | Ryo's 7,596-byte big-endian `FIGHT` action program, command records, metadata, and continuation graph. |
| `data/SCENE/03/MFBT/EN_*.BIN` | Twenty enemy/controller battle programs, including common behavior and MFBT fighter variants. |
| `data/SCENE/03/MFBT/MAPINFO.BIN` | Native arena placement data. Ryo's retained `CHRS AKIR` spawn becomes `(-30.709999084472656, 0, 103.22000122070312)` after the browser's mirrored-X conversion. |
| `data/SCENE/03/SOUND/BATTLE_1.SND` | Native DTPK combat sound bank. Its sequencer, playback-descriptor, and sample tables supply the command groups, track-to-playback mapping, sample IDs, rates, and raw track volume bytes used by motion sound cues. |
| `BATTLE70.AFS` | 124 entries representing 62 character model/texture pairs for the original 70-man battle content. |
| `WAZA.FON` and its in-memory strings | The original move-scroll glyph vocabulary. The current extractor reads the already resolved strings and pointer tables from RAM rather than parsing the font file itself. |

The browser build publishes the two required motion banks as
`/motion/MOTION.BIN` and `/motion/M_FGT1.BIN`. It parses only named sequences
needed by the current character and combat configuration. Expanding all
1,559 global sequences into JavaScript curves at once previously consumed
over a gigabyte of heap.

### Captured Dreamcast RAM

`tools/gameplay/build_combat_evidence.mjs` currently uses:

```text
captures/pvr/20260728-181223-frame-78778/ram.bin
```

The capture root can be overridden with `SHENMUE_CAPTURE_ROOT`. Dreamcast RAM
is based at runtime address `0x0c000000`, so a file offset is converted to a
runtime pointer by adding that base.

That capture contains the fully resolved English and Japanese move-name
pointers, English descriptions, move records, displayed command strings,
compact command records, native move definitions, and a runtime-wrapped copy
of `EN_RYOU.BIN`. The wrapped `FIGHT` object has a 0x34-byte runtime prefix;
its payload is byte-identical to the disc file.

### SH-4 executable analysis

Ghidra supplied semantics that static data alone could not:

- `0x0c1b1dd4`: resolves a one-based category and move index through the
  native move-definition tables, selecting the expert motion when
  proficiency is greater than `0x37`.
- `0x0c194bc6`: Ryo action-VM interpreter.
- `0x0c29d600`: 93-entry Ryo action opcode handler table.
- `0x0c1add90`: enemy `EN_*.BIN` interpreter.
- `0x0c29f658`: enemy opcode handler table.
- `0x0c1ad582`: motion-metadata opcode `0x02`; copies three phase-frame
  halfwords to fighter offsets `+0x294`, `+0x296`, and `+0x298`.
- `0x0c1ad670`: motion-metadata opcode `0x04`; copies attack class,
  proficiency selector, and base damage to `+0x2ac..+0x2ae`.
- `0x0c1ad0e0`: scales authored phase values using the float at fighter
  `+0x26c`.
- `0x0c1aaf7a`: compares the current animation frame with the three phase
  fields.
- `0x0c1915ce`: evaluates attack class and damage inputs.
- `0x0c192310`: applies the result to the defender's packed HP at `+0x35c`.
- `0x0c1ae042`: confirms enemy opcode `0x05` as an eight-byte motion request.
- `0x0c17a920`: downstream AICA/mixer parameter dispatch reached by DTPK
  commands. Its high-byte routing changes playback parameters; it is not a
  table that assigns sounds to motions.

`tools/ghidra/ExportFunctionPointerTable.java` reads a pointer table,
disassembles missing targets, and decompiles every unique handler while
annotating the indices that use it.
`tools/ghidra/ExportPointerValueReferenceFunctions.java` searches for
little-endian pointer literals and decompiles every containing function. The
second script matters on SH-4 because a global address is commonly loaded
through a nearby PC-relative literal pool rather than an ordinary absolute
reference.

### Runtime and implementation files

| File | Responsibility |
| --- | --- |
| `src/MotnLoader.js` | Parses MOTN/MOTION sequence tables, channel data, action metadata, frames, durations, and root-motion classification. |
| `src/FightBytecode.js` | Parses the `FIGHT` header, four sections, entry dispatch, command records, aligned motion requests, and conservative action paths. |
| `src/MartialArtsCombat.js` | The deterministic combat kernel, all 51 move definitions, native strings and staged follow-ups, hit logic, defeat, and recreated enemy AI. It has no Babylon dependency. |
| `play/combat/CombatInput.js` | Converts physical keyboard timing into native command tokens and simultaneous `plus` chords. |
| `play/combat/CombatRootMotion.js` | Converts authored local root displacement into world X/Z motion at the actor's captured yaw. |
| `play/combat/CombatEncounterRuntime.js` | Bridges simulation events to player/enemy actors, animations, placement, HUD state, reactions, and rematches. |
| `play/audio/CombatSounds.js` | Runs per-actor native motion cue timelines at 30 Hz and plays reconstructed `BATTLE_1` command assets through the shared audio preferences. |
| `play/data/native-combat-sound-cues.js` | Generated motion-name-to-frame/cue map restricted to playable commands declared by `BATTLE_1.SND`. |
| `play/characters/AnimationStateMachine.js` | Builds clips from the two motion banks, routes matrices to the character rig, blends one-shots, holds knockdown poses, and transitions defeat into a looping down pose. |
| `play/PlayApplication.js` | Composes arena loading, Ryo and Chai, motion banks, actor adapters, collider synchronization, and the combat HUD. |
| `play/config/worlds.js` | Defines the `mfbt`/Combat Practice travel destination and its practice-adjusted spawn. |
| `tools/gameplay/build_combat_evidence.mjs` | Joins RAM move data, global and MFBT motion data, native phase/damage records, paired families, and enemy file inventory. |
| `tools/gameplay/dump_enemy_battle_bins.mjs` | Parses all enemy battle headers, dispatch tables, section boundaries, self-labels, and conservative motion candidates. |
| `tools/gameplay/extract_fight_bytecode.mjs` | Parses `EN_RYOU.BIN`, resolves global motions, and emits verified string paths and staged move evidence. |
| `tools/audio/build_combat_audio_pack.mjs` | Reconstructs every playable command through the native DTPK track → playback descriptor → sample/rate chain, then emits browser-ready WebM/Opus assets plus provenance. |
| `tools/audio/build_native_combat_sound_cues.mjs` | Joins MOTION/MFBT frame events to valid group/track records from `BATTLE_1.SND`. |

## Current playable implementation

Choose **Travel To... → Combat Practice** in the Play Online view. This loads
Shenmue's `MFBT` 70-man battle arena and spawns Chai beside Ryo. Combat is
only active on that map; travel elsewhere to leave the fight.

The runtime uses a deterministic 30 Hz combat simulation with startup,
active, and recovery phases; facing and range checks; one hit per action;
guard stun; hit stun; knockdowns; defeat; a 12-token buffered command
matcher; and a range-aware enemy AI. Combat locomotion is locked while Ryo
is attacking or reacting. Between actions, combat-control movement is
target-relative: Ryo continuously faces Chai, W/S advance and retreat, and
A/D strafe around him. These directions use the extracted
`YKI_AKI_KAMAE1_WALK_F/L/R` footwork, with the forward clip played backward
for retreat. Holding Shift dashes in any movement direction, and a minimum
combatant-radius separation prevents the fighters from walking through one
another. Free Quest movement remains camera-relative when combat controls
are toggled off. Buffered moves begin on the outgoing move's final tick and
the animation state machine blends directly between the two authored poses.
Rapid attack strings use an earlier cancel window: the incoming command
replaces the outgoing action with its dedicated transition clip before
ordinary recovery completes.

All 51 moves from the native move catalogue are playable:

- `W` / `S`: directional command components
- `Shift`: running/L-trigger modifier
- `I`: guard/Y-button modifier and held guard
- `J`: hand
- `K`: leg
- `L`: throw
- `X`: toggle between Free Battle controls and ordinary Free Quest controls

Press attack buttons within 75 ms for simultaneous commands such as Big
Wheel (`J` + `K`). Tap them sequentially for commands such as Swallow Flip
(`S`, `J`, `K`). The top-center command display reflects the simulation's
accepted command buffer, adding each direction or attack as it is accepted
and showing the human-readable name once a move or multi-hit string resolves.
Its visible history is capped from the extracted command catalogue: Tiger
Flurry is the longest real input at eight grouped key presses, so excess
input rolls through an eight-group window instead of widening the HUD.
Only prefixes still accepted by the move/string matcher enter that display;
an incompatible extra key does not alter the visible combination. While a
prefix can still extend into a longer native string the panel retains its
normal styling. A completed string or an action with no remaining valid
extension locks the panel green and holds its resolved move label through
the action's complete simulation/animation lifetime. The panel returns to
its normal empty input state when that action releases control.
The always-open, internally scrolling **All Combinations** pane in the
top-left HUD lists all 51 learned techniques plus the 10 extracted multi-hit
strings. Four native command pairs are genuinely identical; click the desired
technique name in that pane to choose which learned variant that command
should play.

Two circular health gauges flank the top-center command display. They use
Shenmue's exact `ENERGY.SPR` textures: the `bgdragon` medallion and the
`tama12_G`, `tama12_R`, `tama12_Y`, and `tama12_K` orb states. The current
browser layout maps the simulation's 20 HP to 20 evenly spaced perimeter
orbs: Ryo is green on the left, Chai is red on the right, yellow represents
a fractional boundary orb, and black represents depleted health. Mirroring
an enemy gauge and using 20 evenly spaced positions are recreation UI
choices, not yet recovered original layout data; Shenmue's ordinary Free
Battle HUD exposes Ryo's circular health gauge.

Ryo's moves use their exact global `MOTION.BIN` sequences, including all 18
high-proficiency variants. Chai's attacks, both battle stances, guard, and
ordinary reactions use `M_FGT1.BIN`. The 14 throws use paired global victim
sequences. Traveling one-shots apply their authored horizontal root
trajectory to the actor and the player controller collider; contextual
placement rebases that trajectory instead of snapping it back. Shadow Step
is treated as the non-damaging evasive maneuver
described by the native catalogue: it moves Ryo behind Chai without applying
damage, hit stun, or a hit reaction.

Proactive throws now play the native acquisition before the selected paired
throw. A nearby target uses the 26-frame `AKI_AKI_TUKAMI_NG` clip and its
0.400-unit authored approach; a farther target uses the 26-frame
`AKI_AKI_TUKAMI_NG_LONG` clip and its 0.820-unit approach. Ryo faces the
target before root-motion capture, and the selected front/side/rear throw
only begins if the acquisition finishes in range. A failed grab returns to
stance without playing a victim clip. Incoming-strike counters retain their
own authored intercepts and do not use this proactive grab prelude.
For paired throws and counters, the attacker and victim clips now begin on
the same simulation tick. The active hit applies damage without restarting
the victim clip, so both authored sides remain on the same frame timeline
through the interaction and recover together. The victim's simulation action
and buffered commands are also cancelled at that start tick, preventing enemy
AI movement or an attack from breaking the paired animation before its damage
frame. Once that pair has acquired its target, the target remains
authoritative through the damage frame; independent actor/victim root
trajectories cannot turn a visibly connected throw into a later range miss.

The ten built-in attack strings are recognized, including eight successive
hand attacks, the three-kick series, mixed hand/kick branches, and the
directional Katana Mist/Against Cascade branches. Every stage now follows
the exact `EN_RYOU.BIN` action-VM motion request rather than being inferred
from names containing `COMBO` or `_CMB`. Native Tiger Flurry is:

`BATTLE_PANCH_JAB` → `COMBO_JAB_BDY` →
`DMY_AKI_AKI_URAKEN_ROLL_TOP` → `BATTLE_PNC_APR2` →
`DMY_AKI_AKI_BATTLE_PNC_FUK` → `DMY_AKI_AKI_ELBOW` →
`DMY_AKI_AKI_BATTLE_PANCH_STR` → `DMY_AKI_AKI_RIMONT_MID`.

The `DMY` motions are complete, playable global sequences, not missing-data
markers. Tiger Maelstrom is jab → Crescent Kick → `COMBO_MAWA_2` →
`COMBO_MAWA_3`. The Reaper uses low kick → the same two `MAWA`
continuations, while ordinary J-J-K ends in `BATTLE_KICK_SID`. Katana Rush
and Flying Knee share `COMBO_BDY_ELB` before branching to
`CHP_NUKE_MID` or `KICK_KERIAGE`. Generated evidence records the terminal
offset, registered motion ID, flag bits, name, and duration for all ten
complete paths.

Arm Break Fire now uses its complete three-stage native sequence. Select it
in the Move Scroll, enter `W`, `S`, `S`, `L`, then press `J`, followed by
`J` + `K`. The HUD displays the continuation as
`W S S L → J → J + K`. Its `SP1_ELB`, `SP2_WAK`, and `SP3_GJJ` attacker
clips are synchronized with the corresponding three `NGR` victim clips.
Follow-ups are accepted while the outgoing stage is playing and replace both
participants' one-shots at the stage boundary. They only continue after the
initial throw connects; a missed Arm Break Fire ends normally.

Tornado Kick is also a staged move now. `W W K` immediately plays the
40-frame `AKI_AKI_BAT_KICK_NIREN1_TOP` entry; pressing the second `K`
during it changes directly into the 64-frame catalogue-primary
`AKI_AKI_BAT_KICK_NIREN1_TOP_MK` finisher. A rapid `W W K K` batch queues
the same transition. The first clip's final authored pose and the finisher's
first pose have a normalized matrix difference of only `0.022`, confirming
the pose-continuous boundary that was previously skipped.

Pit Blow accepts its native additional `J` only at proficiency 56 or above.
Its ordinary and expert openings use `KONGO_TYUKEN_Y_MID` and
`KONGO_TYUKEN_MID`; the continuation uses the 56-frame
`KONGO_TYUKEN_C_MID` motion requested by `EN_RYOU.BIN` at `0x0884`.
The Move Scroll displays the playable chain as `W J → J`.

Swallow Flip is now a counter rather than a proactive throw. Enter
`S J K` while Chai has a connecting strike in startup or its active window.
Ryo intercepts it with `AKI_AKI_NGS_INASI`, automatically continues into
the catalogue-primary `AKI_AKI_NGS_ENSEI_MK` flip and its paired
`YKI_AKI_NGR_ENSEI` victim motion, and accepts an optional `J` for the
paired 38-frame `ENSEI_PNC` ground strike. The intercepted action is locked
to Chai, preventing its hit from passing through the counter on the same
simulation tick. The equally paired `ENSEI_KKT` actor/victim alternative is
extracted but remains disabled until its exact native branch condition is
recovered.

Cross Charge also uses the incoming-strike counter window. Its native
catalogue text explicitly describes a diagonal evasion followed by an elbow
strike, and the complete 55-frame `AKI_AKI_NGS_FROU` actor clip is paired
with `YKI_AKI_NGR_FROU`. A buffered `W W I + L` waits briefly for a
connecting incoming strike instead of degrading into a simpler suffix move.

Shadow Step and Shadow Blade now share the incoming-strike counter window,
matching both the native move text and the tutorial's oncoming-blow
description. Shadow Step locks that strike, moves behind the attacker, and
does no damage; Shadow Blade applies the paired neck-strike reaction.
Shadow Blade remains a complete command-selected animation rather than a
second clip appended after Shadow Step. The 43-frame `NGS_MRK1_MK` motion
starts in exactly the same neutral authored pose as `NGS_MRK1` (normalized
matrix RMS `0.000`) and contains essentially the same full travel distance.
The command matcher therefore delays Shadow Step briefly for its immediate
`J` extension, then plays only the complete Shadow Blade clip; playing both
clips serially would duplicate the evasive step.

## Canonical move catalogue

The original catalogue contains 19 hand moves, 18 leg moves, and 14 throws
or special actions. The names below are the English strings found in RAM;
unusual spacing such as `TwinHandWaves` and `DarksideHazuki` is present in
that source. `W` and `S` are the original vertical directional command
tokens, not left/right directions.

| Category | Native English name | Browser command |
| --- | --- | --- |
| Hand | Tiger Knuckle | `J` |
| Hand | Elbow Slam | `W J` |
| Hand | Twist Knuckle | `S J` |
| Hand | Elbow Assault | `W W J` |
| Hand | Upper Knuckle | `S S J` |
| Hand | Sleeve Strike | `W S J` |
| Hand | Rain Thrust | `S W J` |
| Hand | Big Wheel | `J + K` |
| Hand | TwinHandWaves | `W J + K` |
| Hand | Backfist Willow | `S J + K` |
| Hand | AvalancheLance | `W W J + K` |
| Hand | KatanaMistSlash | `S S J + K` |
| Hand | Mistral Flash | `Shift J` |
| Hand | Pit Blow | `W J`, then expert continuation `J` |
| Hand | Double Blow | `W J + K` |
| Hand | Swallow Flip | `S J K`, optional ground strike `J` |
| Hand | Rising Flash | `W S S J` |
| Hand | Twin Blades | `S W W J` |
| Hand | Stab Armor | `W S S J + K` |
| Leg | Crescent Kick | `K` |
| Leg | Trample Kick | `W K` |
| Leg | SideReaperKick | `S K` |
| Leg | AgainstCascade | `W W K` |
| Leg | Surplice Slash | `S S K` |
| Leg | Thunder Kick | `W S K` |
| Leg | HoldAgainstLeg | `S W K` |
| Leg | Brutal Tiger | `W S J + K` |
| Leg | Dark Moon | `S W J + K` |
| Leg | Cyclone Kick | `Shift K` |
| Leg | Windmill | `Shift J + K` |
| Leg | Swallow Dive | `S K` |
| Leg | Tornado Kick | `W W K K` |
| Leg | Nothing Skill | `S W K` |
| Leg | Crawl Cyclone | `W S S K` |
| Leg | Mud Spider | `S W W K` |
| Leg | TwinSwallowLeap | `S W W J + K` |
| Leg | Shadow Reaper | `Shift I + K` |
| Throw | Overthrow | `L` from the front |
| Throw | Sweep Throw | `W L` |
| Throw | Vortex Throw | `S L` |
| Throw | Mist Reaper | `W W L` |
| Throw | Demon Drop | `S S L` |
| Throw | Shoulder Buster | `W S L` |
| Throw | Tengu Drop | `S W L` |
| Throw | DarksideHazuki | `L` from the side |
| Throw | BackTwistDrop | `L` from the rear |
| Throw | Shadow Step | `W I + L` against an incoming strike |
| Throw | Arm Break Fire | `W S S L`, then `J`, then `J + K` |
| Throw | Tiger Storm | `S W W L L` |
| Throw | Shadow Blade | `W I + L J` against an incoming strike |
| Throw | Cross Charge | `W W I + L` against an incoming strike |

The complete per-move record is in
`tools/evidence/combat-motion-manifest.json` under `canonicalMoves`. Each
entry retains:

- native and category index;
- English name, description, and runtime pointers;
- Japanese-name pointer;
- displayed glyph bytes and compact seven-byte engine command;
- native move code and both definition flag words;
- normal and expert motion IDs, names, duration, byte range, and completeness;
- metadata offset, phase frames, raw opcode bytes, attack class,
  proficiency selector, and base damage;
- correlated victim motions where applicable.

There are 18 expert animation alternatives. The executable condition is
strictly `proficiency > 0x37`, so the first qualifying value is 56. Combat
Practice currently gives Ryo proficiency 100 to expose those variants.

Four native commands are shared by multiple learned moves:

- `W J`: Elbow Slam / Pit Blow
- `W J + K`: TwinHandWaves / Double Blow
- `S K`: SideReaperKick / Swallow Dive
- `S W K`: HoldAgainstLeg / Nothing Skill

The Move Scroll provides an explicit preference for these cases. This is not
evidence that Shenmue's original learned-move preference implementation has
been reconstructed.

## How the motion data works in this recreation

### Motion banks and naming

Ryo's catalogue does **not** use same-named sequences from `M_FGT1.BIN`.
Function `0x0c1b1dd4` resolves every catalogue row to a registered ID in the
global `MOTION.BIN`; the sequence index is the one-based motion ID minus one.
The low 15 bits are the registered ID. Bit 15 and the upper halfword are
request flags and must not be folded into the sequence number.

Useful naming tendencies are:

- `AKI_AKI_*`: Ryo/AKIR-side authored motion.
- `YKI_AKI_*`: the other participant or a motion authored against AKIR.
- `NGS`, `NAGE`: throwing/initiating side of paired actions.
- `NGR`, `NAGERARE`: receiving/thrown side.
- `_S1`: a high-proficiency or alternate form in the catalogue mappings.
- `_MK`: often a complete/connected variant, but its semantics must be
  confirmed from tables or bytecode; the suffix alone is not proof.
- `DMY_*`: real, complete global sequences. `DMY` is not a missing-animation
  marker.

Names are evidence for finding candidate pairs, not enough on their own to
prove behavior. The implementation also checks duration, complete decoding,
bytecode requests, pose boundaries, and in important cases runtime playback.

### Frame evaluation and retargeting

`MotnLoader` expands a selected sequence into per-frame skeletal transforms.
`AnimationStateMachine` routes the Ryo-authored matrices by render key and
retargets them through the loaded character's bind matrices. Chai has his own
retarget map, so MFBT clips can drive the Chai model without assuming the
model and animation files share identical node instances.

One-shots retain the last routed pose when requested. This matters for
knockdowns and defeat: releasing the state machine to stance before the
simulation has recovered causes visible snapping or alternating frames.
Defeat now plays the fall, then loops global motion
`YKI_AKI_DOWN_SID_L_LP` until a new attack explicitly resets the bout.

### Root motion

Horizontal root travel is handled separately from ordinary skeletal pose.
For a traveling clip, the first sampled root translation becomes the local
origin. Each later delta is rotated by the actor yaw:

```text
right   = localX - initialLocalX
forward = -(localZ - initialLocalZ)

worldX = originX + right*cos(yaw) + forward*sin(yaw)
worldZ = originZ - right*sin(yaw) + forward*cos(yaw)
```

The actor root and Ryo's physics collider are updated together. Starting a
new one-shot, placing an actor contextually, or snapping a paired root calls
`rebaseOneShotRootMotion()` so an old local origin cannot pull the character
back to a previous world position.

Not every horizontal root channel should be promoted to world travel.
`MotnLoader` classifies stable offsets as pose data and traveling curves as
root motion. That distinction is essential for paired moves.

### Paired animation lessons

Paired attacker and victim clips are authored in a common facing
orientation. The receiving actor therefore adopts the attacker's yaw rather
than looking back at the attacker. Making both actors continually face one
another reverses victim travel and caused Overthrow to animate away from
Ryo.

Facing is locked for the duration of the pair. During Overthrow the victim
crosses over Ryo's shoulder, so ordinary target-tracking would flip Ryo
halfway through the animation. The completed world direction is handed back
to the stance only after the final, non-continued paired stage. Continued
Arm Break Fire stages preserve the shared orientation between clips.
That facing handoff is atomic: applying the final world yaw while blending
from a clip that still contains its authored body turn would briefly apply
the rotation twice, producing a wrong-way snap followed by a corrective
spin.

World-root spacing is inferred from the active clips rather than a move-name
exception:

- If both active clips classify their horizontal root channels as `pose`,
  those channels retain authored body offsets inside their skeletal matrices.
  The two actor world roots therefore use one shared X/Z origin.
- If either clip classifies as `travel`, its horizontal channel is extracted
  from the pose and rebased against that participant's world root. The
  existing physical root separation is preserved so the extracted trajectory
  has the correct starting point.
- A new synchronized follow-up replaces both clips without independently
  repositioning either participant, preserving the coordinate frame already
  established by the pair.

For example, Overthrow's receiver sequence `YKI_AKI_NGR_SEOI` classifies as
travel. Its initial local Z is removed when root motion is rebased, so the
existing combatant world gap supplies the initial separation. Chai's
116-frame `YKI_AKI_NGS_TAKKULE` and Ryo's 122-frame
`AKI_AKI_NGR_TAKKULE` both classify as pose. The receiver already starts
around local Z `-1.21`, while Chai begins around local Z `0`; a second world
gap duplicated that distance and made Chai punch 0.5–1 unit beyond Ryo's
head. The general pose/pose rule instead selects a shared origin.

A terminal pair remains simulation-owned until the longer selected side has
finished. This uses the actual variant duration: Chai's Takkule actor side is
116 frames rather than Shoulder Buster's unrelated 81-frame Ryo duration,
and its receiver side is 122. Chai therefore cannot resume AI retreat,
turning, or another attack during Ryo's kick-off. A queued authored
continuation is different: it replaces both one-shots at the actor-side
boundary, matching the overlapping Arm Break Fire data.

Both sides hold their last frame until the pair owner or next stage releases
them. When a shared pose-root participant leaves its clip, the final local
root offset is rotated into world space and applied to the actor root (and
Ryo's collider) before returning to stance. That handoff is atomic because
blending from the old pose after moving the world root would temporarily
apply the same offset twice. It preserves the final visible separation
instead of snapping both fighters back onto the shared origin.
Travel clips have already applied their trajectory to world space and do not
receive this handoff a second time.

Chai's Takkule attack originally used Ryo's unrelated
`YKI_AKI_NGR_WUDE1` receiver. The matching MFBT receiver is
`AKI_AKI_NGR_TAKKULE`. Combat Practice now uses that clip, its 122-frame
duration, common yaw, automatically detected shared world origin, and
pose-to-world release handoff for both enemy move IDs that select Takkule.

The active damage frame does not restart a receiver clip. Both one-shots
start together at acquisition and remain synchronized. Once a paired target
has been visibly acquired, that target remains authoritative through the hit
frame; a second range test would allow independent root curves to produce a
visually connected but mechanically missed throw.

## Native combat sound system

Combat sounds are selected by animation metadata rather than by browser move
IDs or a hand-authored move-to-sound table. The retained action metadata
contains aligned eight-byte timeline events:

```text
FF FF 04 05 AB GG TT 00
|frame|          |      |
 little-endian    DTPK command
```

`GG` is the DTPK sequencer-group suffix and `TT` is its zero-based track.
Tiger Knuckle contains `03 00 04 05 AB 76 19 00`, so at motion frame 3 it
issues `AB761900`. Crescent Kick issues `AB761A00` at frame 5, and Overthrow
issues `AB761B00` at frame 5. The parser retains the raw bytes, frame,
operation bytes, group, track, and full command instead of reducing the
event to a guessed effect label.

The command layout is independently confirmed by the native DTPK protocol:
the driver registers a bank with `A0001100 | bank`, and sequence requests
encode the bank's group and track as `AB GG TT 00`. `BATTLE_1.SND` declares
exactly two group descriptors, `AB76` and `AB77`. They expose 83 slots: 70
playable track compositions and 13 native null/event slots. Generated cues
are accepted only when their exact group/track is one of those 70 playable
records; a byte pattern that merely begins with `AB` is not promoted.

The bank separates playback in three native layers:

```text
AB group/track command
    -> track composition (playback/SPD ID and raw volume)
    -> 64-byte playback descriptor (sample ID and composite AICA rate)
    -> sample payload
```

This indirection is significant. The bank has 70 playback descriptors but
only 67 unique sample payloads. Three payloads are intentionally reused by
different playback descriptors at different rates. A sample dumper's chosen
filename therefore cannot be treated as the command mapping. The pack
builder parses all three native tables, uses decoded PCM only as the sample
payload, and applies the rate from each command's own playback descriptor.
For example, `AB762100` selects playback `0x17` and reuses sample `0x37` at
its own authored rate rather than borrowing the first use of that sample.

The checked-in pack is under `public/audio/combat/`.
`manifest.json` records the original bank hash, pinned DTPKDump
repository/commit, groups and null tracks, composition bytes, playback ID,
sample ID, raw DTPK rate, normalized sample rate, raw track volume, output
hash, decoder normalization, and WebM/Opus encoding settings. DTPKDump's WAV writer uses Python
`array('l')`; on 64-bit Linux that inserts three four-byte paddings in the
RIFF header. The builder recognizes that exact layout, removes the paddings,
repairs RIFF/PCM lengths and rates, and rejects unfamiliar layouts. The
normalized native PCM is then encoded as 48 kbps variable-rate Opus in a
WebM container, using the low-delay application mode and 10 ms frames.

`CombatSounds` starts a separate timeline for each fighter whenever the same
event that starts or replaces an animation one-shot is processed. This
covers Ryo and Chai attacks, string stages, grab acquisition, staged
follow-ups, paired victim clips, reactions, guards, falls, and Takkule's
synchronized receiver. Timelines advance at the native 30 Hz motion rate and
fire each cue once when its authored frame is crossed. Replacing a one-shot
replaces that actor's timeline; recovery stops it; bout reset or deactivation
stops all active audio. Playback respects master mute, effects mute, overall
volume, and effects volume.

Track volume bytes are preserved as source evidence but are not converted
into an extra browser gain. The exact AICA/DTPK attenuation curve has not
been proved, so applying a convenient linear interpretation would be tuning,
not native reconstruction. Sample selection, pitch/rate, and cue timing are
native; the project's existing effects gain remains the only recreated
output-level adjustment.

## Browser combat architecture

The implementation deliberately separates deterministic rules from rendering:

```text
keyboard events
    -> CombatInput native tokens
    -> MartialArtsCombat fixed 30 Hz simulation
    -> semantic events (move-started, hit, guarded, recovered, ...)
    -> CombatEncounterRuntime
    -> AnimationStateMachine + actor roots + Ryo collider + HUD
```

`MartialArtsCombat` owns health, commands, actions, startup/active/recovery
ticks, stun, knockdown, guard, buffered continuations, target acquisition,
and emitted events. It can be tested without a scene or clock.

`CombatEncounterRuntime` synchronizes actor X/Z/yaw into combatants before
each update and translates simulation events back into visual work. It also
locks player locomotion during an action, reaction, or defeat; prevents time
spent loading or in a suspended tab from replaying as AI attacks; and delays
Chai's offense until Ryo establishes the first exchange.

Input details:

- The simulation runs at 30 ticks per second.
- A command is committed after three ticks.
- Modifier continuations receive four ticks.
- The command buffer retains twelve tokens/ticks of history as configured by
  the combat kernel.
- `J`, `K`, and `L` presses within 75 ms form a simultaneous chord; two
  different buttons insert `plus`, while repeating one produces a sequential
  repeated attack.
- A following attack within 250 ms is emitted as a sequential component.
- Held `Shift` prefixes `run`; held `I` prefixes `guard, plus` and also
  supplies continuous guard state.
- While Free Battle controls are active, holding `Shift` dashes and supplies
  the native L-trigger running-move modifier. It never toggles or persists a
  run state in combat. Pressing `X` pauses the encounter and restores normal
  Free Quest locomotion; pressing `X` again resumes Free Battle controls
  without leaving MFBT.
- Capturing keyboard events avoids Babylon canvas propagation issues, while
  editable inputs and repeated browser keydown events are ignored.

The recreated Chai AI has a preferred range of 1.1, approaches beyond 1.55,
retreats inside 0.65, and currently chooses among Tiger Knuckle, Crescent
Kick, and the Takkule/Shoulder Buster action. These values and selection
probabilities are project tuning, not decoded original Chai AI. Chai's
selected motion overrides are native MFBT sequences, but the decision policy
is not yet the original `EN_*.BIN` program.

Combat is scoped to the `mfbt` world. Traveling to Combat Practice loads the
four retained MFBT map layers, enables Chai, positions him beside Ryo, shows
the fixed-title top-left combat HUD and its scrolling combination list,
enables the top-center live command display, and changes the bottom-right
help to the combat controls. `X` switches those controls and overlays between
the original manual's **Free Battle** and **Free Quest** modes while keeping
Chai and the MFBT map loaded. Traveling elsewhere deactivates the encounter,
hides Chai, and hides both combat overlays.

`tools/assets/extract_energy_sprites.py` reproducibly converts each `TEXN/PVRT`
record in the original `SPRITE/ENERGY.SPR` into the PNG files under
`play/assets/combat/energy`. `ENERGY.SPR` itself contains only the eight
texture records and no screen positions or health update program; those
parts of the original implementation live in `1ST_READ.BIN`.

## What is extracted and what is inferred

The following facts come directly from Shenmue Disc 3 or the captured game
RAM:

- `M_FGT1.BIN` contains 513 named fighting sequences; 512 decode completely
  with the repository's MOTN parser.
- The RAM move-list records contain 51 canonical English move names,
  Japanese-name pointers, category records, command indices, and command
  glyph strings.
- All eight compact command opcodes have been mapped to hand, leg, forward,
  back, running modifier, throw, guard modifier, and simultaneous input.
- The two display-only positional glyphs select side and rear throw variants.
- Executable function `0x0c1b1dd4` resolves each move's normal and
  high-proficiency global motion ID and confirms the native proficiency
  threshold (`> 0x37`).
- `MFBT` contains 20 `EN_*.BIN` enemy battle programs.
- Each enemy program has a big-endian header with four section offsets and a
  dispatch table. Dispatch targets are relative to the first section.
  Opcode `0x0f` frequently embeds a self-identifying file offset.
- Executable function `0x0c1add90` is the per-fighter EN bytecode
  interpreter. Its program counter is stored at combatant offset `0x310`;
  it reads the second byte of each in-memory halfword (the opcode byte in
  the file's big-endian instruction word) and dispatches through the
  handler table at `0x0c29f658`.
- Opcode `0x05` is eight bytes and advances the program counter by eight
  after applying its following 32-bit motion request. Opcodes `0x0f` and
  `0x10` advance by four, while `0x12`, `0x1d`, `0x20`, and `0x2b`
  advance by eight. Stateful odd opcodes share pause handlers and are
  updated by paired state routines on following ticks.
- `EN_RYOU.BIN` is a separate 7,596-byte big-endian `FIGHT` payload. Its
  section offsets are `[0x14, 0x17f8, 0x1bbc, 0x1d8a]`: action script,
  48 twenty-byte command records plus terminator, metadata, and trailing
  data. The runtime prepends a 0x34-byte wrapper; the remaining payload is
  byte-identical to the disc file.
- Ryo's action VM dispatches through the 93-entry handler table at
  `0x0c29d600` from `0x0c194bc6`. This is distinct from the enemy-program
  interpreter above. In the action VM, opcode `0x05` requests a motion,
  `0x0d` installs the post-motion continuation, `0x0e` selects an input
  branch, and `0x10` ends the current path.
- Action opcode `0x0f` pushes a 24-byte alternate/fallback continuation
  frame and then advances by four; it is not itself a conditional jump.
  Opcode `0x48` performs the following command-history match and consumes
  eight bytes. Its first halfword operand is the required native input mask
  and its second is the history-match parameter. At file `0x0468` those are
  `0x0020, 0x3000`; at `0x04e0` they are `0x0010, 0x3000`. This explains why
  a direction-modified J-J-W-J path reaches `COMBO_BDY_ELB`, while an
  ordinary third J falls back into Tiger Flurry's `DMY_URAKEN` branch.
- Motion request `0x8364` proved that bit 15 belongs to the encoded request,
  not the registered motion number. Masking it yields global motion
  `0x0364`, `AKI_AKI_KICK_BACKROLL_JUMP`. Six previously skipped flagged
  requests are now resolved. Instruction-boundary filtering also removes a
  false `ERROR_1` request at file `0x055c`, which is really the payload of
  the preceding eight-byte opcode `0x0e`; the corrected action inventory is
  154 requests.
- Dynamic Dreamcast traces establish the base requests: X reaches Tiger
  Knuckle at file `0x03bc`, A reaches Crescent Kick at `0x0928`, X+A reaches
  expert Big Wheel at `0x11c8`, and B selects a grab-acquisition motion at
  `0x0e58` or `0x0e64`.
- A longer fighter-instance trace identifies the action's two inclusive hit
  frame halfwords at Ryo offset `+0x294`. Tiger Knuckle stores
  `0x00050004` (frames 4 through 5); Crescent Kick stores `0x00090007`
  (frames 7 through 9). Tiger Knuckle connects during that capture and the
  defender's packed maximum/current HP word at `+0x35c` changes from
  `0x00780078` to `0x00780073`, proving five damage. Crescent Kick misses in
  the captured geometry, so its damage remains deliberately unclaimed.
  The compact trace result is preserved in
  `tools/evidence/native-hit-window-trace.json`.
- The executable explains where those fields originate. The motion-metadata
  dispatcher table at `0x0c29f5e4` sends opcode `0x02` to
  `0x0c1ad582`; that handler reads three halfwords from the metadata stream
  and writes them to fighter offsets `+0x294`, `+0x296`, and `+0x298`.
  `0x0c1aaf7a` compares the current animation frame against those values to
  advance the attack phases. The second word of each global `MOTION.BIN`
  sequence-table entry identifies its metadata stream, and 44 catalogue
  primary motions contain a direct opcode-`0x02` record at metadata `+0x0c`.
  This recovers three authored phase frames for every ordinary hand/leg
  strike (32 moves) and twelve paired/counter throws. The 32 direct strike
  windows now drive the recreation instead of duration-percentage guesses.
- `0x0c1ad0e0` scales the three phase values using the float at fighter
  `+0x26c`. The arena capture proves Crescent Kick's `1.111111` scale:
  authored `6/8/22` becomes runtime `7/9/24`. The recreation preserves this
  observed runtime override while using the authored 1.0x values for direct
  moves whose proficiency/speed variant has not yet been traced.
- Double Blow and Dark Moon place the same adjacent opcode-`0x02`/`0x04`
  pair after a leading setup/padding record rather than directly at metadata
  `+0x0c`. Their embedded records supply `7/9/22` with base damage 30 and
  `14/16/48` with base damage 25 respectively. The loader records these
  separately so staged streams are not misreported as direct entries.
- The opcode immediately following those direct phase records is `0x04`.
  Its handler at `0x0c1ad670` copies the first three payload bytes into
  fighter `+0x2ac`, `+0x2ad`, and `+0x2ae`. The hit evaluator
  `0x0c1915ce` indexes an attack-class table with `+0x2ac`, passes `+0x2ad`
  through a move-scaling helper, and starts its damage calculation from
  `+0x2ae`; `0x0c192310` applies the resulting value to the defender's
  packed HP at `+0x35c`. The manifest now preserves all 20 raw opcode bytes
  plus the decoded attack-class, proficiency selector, and authored base
  damage. All 32 direct strikes use that authored base damage. Tiger Knuckle
  retains its observed arena result of five damage (authored base four after
  runtime proficiency/class scaling).
- The B paths request `AKI_AKI_TUKAMI_NG` or
  `AKI_AKI_TUKAMI_NG_LONG` before a catalogue throw. Both acquisition clips
  are now implemented. Action opcode `0x1b` at file `0x0e4c` compares the
  opponent-distance field with 16.16 fixed-point `0x00016666`, or
  `1.399993896484375` units. A smaller distance selects the short grab and
  the stacked fallback selects the long grab. Range is validated again at
  the continuation.
- `EN_RYOU.BIN` requests Arm Break Fire's second actor stage
  `AKI_AKI_NGS_SP2_WAK` at bytecode offset `0x0c14` and its third stage
  `AKI_AKI_NGS_SP3_GJJ` at `0x0c48`. Global `MOTION.BIN` contains their
  exact `YKI_AKI_NGR_SP2_WAK` and `YKI_AKI_NGR_SP3_GJJ` victim counterparts.
  The original move definition's flag pair is `[8192, 0]`.
- Global `MOTION.BIN` contains Tornado Kick's 40-frame `NIREN1_TOP` entry,
  64-frame catalogue-primary `_MK` continuation, and 41-frame
  `NIREN2_TOP` alternate. `EN_RYOU.BIN` requests that alternate at bytecode
  offset `0x075c`; its exact hit/miss condition is still under investigation.
- `EN_RYOU.BIN` requests Swallow Flip's `AKI_AKI_NGS_INASI` intercept at
  `0x036c` and its `YKI_AKI_NGR_ENSEI` victim motion at `0x0344`. The global
  bank contains exact `INASI`, `ENSEI_PNC`, and `ENSEI_KKT` actor/victim
  families; the RAM catalogue selects `AKI_AKI_NGS_ENSEI_MK` as the move's
  primary animation. Original battle-guide input corroborates the incoming
  attack condition and optional final hand strike.
- `BATTLE70.AFS` has 124 entries: 62 character model/texture pairs.

All 32 direct primary strike windows and base-damage values now come from
native action metadata, as do the two embedded Double Blow and Dark Moon
records. Three nested hand/leg actions still use their explicit staged
recreation timing and tuned damage. The native proficiency/class
multipliers are proven but not yet fully reconstructed, so only Tiger
Knuckle has an observed scaled result. Ranges and hit arcs also remain tuned.
Animation duration alone does not prove a native hit frame. Throw victim
pairings are complete NGS/NAGE-to-NGR sequence-family correlations; their
battle-controller call sites have not yet been dynamically confirmed. All
ten advertised string animation paths are now joined to their action-VM
requests.

## Reproducing the evidence

Install the repository dependencies, make the extracted Disc 3 tree and RAM
capture available at one of the paths listed above, then run:

```sh
npm install
npm run extract:combat-evidence
```

The npm command is intentionally a composition of four ordinary tools:

```sh
node tools/gameplay/build_combat_evidence.mjs
node tools/audio/build_native_combat_sound_cues.mjs
node tools/gameplay/dump_enemy_battle_bins.mjs
node tools/gameplay/extract_fight_bytecode.mjs
```

The original health textures can be regenerated separately with:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m tools.assets.extract_energy_sprites \
  extracted_disc3_v2/data/SPRITE/ENERGY.SPR \
  play/assets/combat/energy
```

The first and third tools accept an optional output path. The enemy dumper
accepts an optional source directory followed by an optional output path.
The scripts hash their principal inputs so evidence from a different disc
revision or extraction is detectable.

This generates:

- `tools/evidence/combat-motion-manifest.json`
- `play/data/native-combat-sound-cues.js`
- `tools/evidence/enemy-battle-manifest.json`
- `tools/evidence/ryo-fight-bytecode.json`

The first file inventories the fight motion bank, 51 RAM move-list records,
raw command strings, the confirmed multi-stage motion families, and enemy
files. The second parses the enemy-program
headers, dispatch tables, sections, self-labels, and conservative motion-ID
candidates. The third parses Ryo's `FIGHT` sections and command records,
resolves 154 action motion requests against global `MOTION.BIN`, and records
the verified animation path for every built-in string.

The extraction joins data in this order:

1. Find stable ASCII anchors such as `Tiger Knuckle`, `Crescent Kick`,
   `Overthrow`, and the first move description in the RAM image.
2. Scan the bounded regions between those anchors for the 51 English names
   and 51 descriptions.
3. Read the three category-specific tables of 12-byte move records. Each
   record contains a Japanese-name pointer, English-name pointer, and command
   index.
4. Follow the WAZA display-pointer tables and decode their byte pairs into
   direction, hand, leg, run, guard, throw, and plus glyphs.
5. Read the parallel seven-byte compact command records: one token-count byte
   followed by up to six opcodes.
6. Use the move-definition pointer table at RAM offset `0x29fd4c` and the
   category tables selected by `0x0c1b1dd4`. Each 12-byte definition supplies
   flags, normal and expert global motion IDs, and the native move code.
7. Resolve those one-based IDs against `MOTION.BIN`, retaining names,
   durations, byte ranges, completeness, action-metadata offsets, and hashes.
8. Parse motion metadata. A direct `0x02` record yields the three authored
   phase frames; its neighboring `0x04` yields attack class, proficiency
   selector, and base damage. Embedded records are labeled separately.
   Independently retain aligned `frame, 04, 05, AB, group, track, 00` sound
   events up to the exact metadata-stream boundary.
9. Parse `EN_RYOU.BIN` and resolve aligned opcode-`0x05` requests against the
   same global registry. Trace only paths whose opcode sizes and continuation
   semantics are known.
10. Join paired actor/receiver families and staged moves, preserving whether
    each relationship was table-derived, bytecode-confirmed, externally
    corroborated, or only sequence-family correlated.
11. Parse every `EN_*.BIN` conservatively. Candidate-looking words are not
    promoted to proven instructions unless an opcode boundary or native
    handler establishes that interpretation.
12. Read the valid group/track compositions from `BATTLE_1.SND` and discard
    motion byte patterns that do not resolve to one of its playable commands.

To reproduce the audio pack, decode the native bank with the pinned DTPKDump
commit recorded in `public/audio/combat/manifest.json`, then pass that output
directory to:

```sh
npm run build:combat-audio -- /path/to/BATTLE_1-wav-output
npm run build:combat-audio-cues
```

The first command does not trust the decoder's group/track filenames as the
mapping authority. It uses the original `BATTLE_1.SND` tables and verifies
that every referenced sample payload exists.

Useful inspection commands include:

```sh
jq '.canonicalMoves[] | {
  name, category, commandTokens, primaryMotion, highProficiencyMotion
}' tools/evidence/combat-motion-manifest.json

jq '.verifiedStrings' tools/evidence/ryo-fight-bytecode.json

jq '.totals, (.files[] | select(.file == "EN_RYOU.BIN"))' \
  tools/evidence/enemy-battle-manifest.json
```

`tools/evidence/native-combat-string-functions.c` is the result of a Ghidra
string-reference probe against the imported SH-4 executable. The diagnostic
strings (`Set Hit Frame 1`, `Set Attack Motion`, and related timing messages)
are present, but have no ordinary absolute references in Ghidra.
`tools/ghidra/ExportFunctionPointerTable.java` exports indexed function
tables and decompiles each unique target; it is used on the recovered EN
handler table to continue mapping native branch semantics.

For the Ryo VM, run the pointer-table script against `0x0c29d600` with 93
entries and stride four. For any newly discovered runtime field or global,
run `ExportPointerValueReferenceFunctions.java` with the 32-bit address, then
inspect both the literal-pool references and all containing functions. Do
not rely on Ghidra's ordinary string-reference list alone on SH-4.

Dynamic validation used the instrumented Flycast checkout identified by
`FLYCAST_ROOT`. The retained hit-window trace records
Ryo's fighter base `0x8cabfba0`, the struck fighter base `0x8cac1160`,
hit-frame words at `+0x294`, and packed health at `+0x35c`. Values were
sampled repeatedly across host VBlank boundaries while issuing a known
attack. A field was recorded only when it remained stable for the action and
changed in the expected phase. Crescent Kick's miss is deliberately retained
as a miss; the code does not invent a damage observation from it.

When adding new dynamic evidence, preserve the game/disc revision, scene,
save-state, emulator path, combatant bases, field offsets, raw before/after
words, decoded interpretation, and whether the attack hit or missed. A
compact checked-in JSON result is preferable to an undocumented value in the
runtime.

## Value of the downloaded “Shenmue Online” folder

An optional local mirror of a prior Shenmue Online web build contains 4,944
staged public assets. It provides a convenient local
model and texture source for offline browser validation. It does not contain
`M_FGT1.BIN`, `EN_*.BIN`, `BATTLE70`, or `WAZA.FON`, and its JavaScript build
does not contain a combat implementation. It is supporting material, not the
source of native battle rules.

## Validation

Run the complete repository suite and production build with:

```sh
npm test
npm run build
```

During combat work, the fast focused suite is:

```sh
node --test \
  tests/CombatAnimationPlayback.test.js \
  tests/CombatEncounterRuntime.test.js \
  tests/CombatEvidence.test.js \
  tests/CombatSounds.test.js \
  tests/CombatInput.test.js \
  tests/CombatRootMotion.test.js \
  tests/EnemyBattleEvidence.test.js \
  tests/FightBytecode.test.js \
  tests/MartialArtsCombat.test.js
```

The combat kernel, physical-key input adapter, encounter adapter, animation
one-shots, string cancels, evidence manifests, and controller movement
override have automated tests. An exhaustive keyboard-timing test drives
every native command through `CombatInput` and proves that all 51 intended
move IDs resolve. A playback audit parses every normal Ryo clip, every expert
variant, all throw-victim clips, and every configured Chai battle clip,
evaluates every playback frame, and rejects missing, unstable, or non-finite
skeletal matrices. The same audit covers every dedicated string-transition
clip, and a generated-evidence test compares every configured stage of all
ten strings with its exact `EN_RYOU` terminal request. A grammar test then
drives all ten full inputs through every expected stage.
The audit also decodes both Arm Break Fire continuation pairs, verifies their
durations against the regenerated evidence manifest, drives both inputs
through the combat kernel, and proves that a miss cannot enter the connected
continuation.
The sound audit proves that all 70 playable DTPK commands are reconstructed,
that the source bank contains 70 playback descriptors but 67 unique samples,
and that every generated motion cue resolves to a checked-in WebM/Opus asset.
Timeline tests prove exact 30 Hz frame crossings, single firing,
preference/mute behavior, and stale-cue cancellation.

Encounter tests cover activation, actor placement, animation events, paired
facing, final throw-facing handoff, held receiver poses, rematch reset,
loading-time clamping, movement lock, guard, AI delay, and Chai's matching
Takkule receiver/shared-origin placement. Root-motion tests cover forward
axis conversion, rebasing, and a victim crossing over the thrower's
shoulder.

Headless browser runs selected **Travel To... → Combat Practice**, loaded all
four `MFBT` arena map layers at the extracted Ryo spawn, and physically
verified Ryo animation for base J/K/L moves, Big Wheel, Mistral Flash, and
Shadow Blade. A current Chromium run also captured Tiger Knuckle at its
intermediate authored poses on the live port-5174 build. The production
bundle contains both `MOTION.BIN` and `M_FGT1.BIN`.

## Known gaps and next reverse-engineering targets

The following are not yet exact Shenmue behavior:

- Native range fields, hit volumes/arcs, vertical checks, collision response,
  and crowd interaction.
- The complete proficiency, attack-class, defense, and damage formula. Tiger
  Knuckle is the only dynamically observed final damage result.
- Nested metadata phase streams for the remaining staged attacks,
  multi-impact events, throw damage, guard consequences, and special-action
  damage.
- Original cancel windows and all miss/hit branches outside the ten verified
  strings and specifically implemented staged moves.
- Full meanings of the 48 twenty-byte Ryo command records and both native
  definition flag words.
- Complete semantics for the 93 Ryo action opcodes and the enemy VM handler
  set.
- Chai's original decision program, timing, movement, move weights, and
  difficulty/proficiency behavior. The current AI is intentionally small and
  tuned for practice.
- Dynamic battle-controller confirmation for every correlated NGS/NAGE to
  NGR/NAGERARE victim pairing.
- The exact branch that selects Swallow Flip's extracted `ENSEI_KKT`
  actor/victim alternative.
- The condition selecting Tornado Kick's extracted 41-frame `NIREN2_TOP`
  alternate.
- Native recovery/get-up selection after each knockdown and defeat
  orientation.
- The exact AICA/DTPK attenuation conversion for raw per-track volume bytes.
  They are preserved in the audio manifest but deliberately not approximated
  with a linear gain.
- Multi-opponent rules required for a faithful 70-man encounter. Combat
  Practice deliberately spawns only Chai.

A productive next pass should start with a dynamic trace, not visual tuning:
choose one unknown field or branch, capture raw state across exact frames,
find its writers/readers through SH-4 literal pools and handler tables, add
the smallest parser change that preserves raw bytes, regenerate evidence,
then update the deterministic kernel with a regression test. Keep correlated
animation pairings and recreated gameplay constants clearly labeled until a
native call site or runtime trace upgrades their confidence.
