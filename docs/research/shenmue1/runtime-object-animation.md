# Runtime Object Animation from Dreamcast RAM

This note documents the first interactive object animation recovered from
Shenmue's runtime: the upper small drawer in the Hazuki Residence wardrobe.
It builds on the model/HMDL/TASK ownership method in
[Runtime Object Placement from Dreamcast RAM](runtime-object-placement.md).

## Reference experiment

Flycast save-state slot 1 (internal index 0) placed Ryo in front of the
wardrobe with the upper small drawer focused. The passive Lua probe:

1. loaded the save state;
2. recorded 60 untouched VBlanks;
3. pressed Dreamcast A for three VBlanks;
4. recorded through the completed opening;
5. pressed Dreamcast B after an open pause;
6. recorded through the completed closing;
7. saved synchronized full-RAM/PVR checkpoints.

The complete word recording is:

```text
captures/objects/drawer-open-1784865219.csv
```

The recorder implementation and request command are:

```text
tools/emulator/ryo_hallway_probe.lua
tools/emulator/request_drawer_recording.sh
```

## Identified object

The focused object was the top `S1_JOMO_TANM4W3G.MT5` small drawer:

```text
Runtime HRCM:  0x8c7acf80
Runtime HMDL:  0x8c811040
Runtime TASK:  0x8c810c40
Closed TASK:   [18.0189991, 1.50999999, 2.440000057]
```

Only four words changed in the monitored wardrobe region during opening. The
two animation-relevant changes were:

```text
0x8c810c70  TASK + 0x30, position Z
0x8c8110a8  HMDL child node + 0x08, rotation X
```

The other two changed words were state flags belonging to neighboring task
records and did not describe drawer geometry.

## Handle animation

The drawer's child render node has signed fixed-turn rotation X at
`0x8c8110a8`.

```text
Experiment frame 122:  0xffffe000  = -45 degrees
Experiment frame 124:  0xffffc000  = -90 degrees
Experiment frame 182:  0x00000000  =   0 degrees
```

The handle therefore turns to −45°, then −90°, remains there while the drawer
moves, and resets one 30 Hz game tick after the drawer reaches its endpoint.

Closing did not animate this handle node.

## Drawer translation

The drawer itself does not use a separate skeletal curve. Shenmue updates the
outer TASK's Z position:

```text
Closed Z:    2.440000057
Open Z:      2.866000175
Travel:      0.426000118
Changed axis: runtime/world +Z
```

The values update every other VBlank, confirming a 30 Hz object animation
rate while Flycast presents at 60 VBlanks per second.

Normalized opening samples:

```text
0
0.023857522
0.059111001
0.105120177
0.161030998
0.225777854
0.298080227
0.376444363
0.459164393
0.544320099
0.622364664
0.693298089
0.757119815
0.813830960
0.863430966
0.901990962
0.931431171
0.953458020
0.969564702
0.981031177
0.988924733
0.994097743
0.997191027
0.998631052
1
```

Closing uses these exact samples in reverse. No fitted easing equation or
visual estimate is necessary.

## Second data point: wardrobe double doors

A second save-state capture focused the double doors from
`S1_JOMO_TANM402G.MT5`:

```text
captures/objects/drawer-open-1784865666.csv
```

Despite the recorder's original drawer-specific filename, this capture is of
the doors. Their runtime ownership records are:

```text
Runtime HRCM:  0x8c7ac6c0
Runtime HMDL:  0x8c812c00
Runtime TASK:  0x8c812800
Closed TASK:   [18.5849991, 0.639999986, 2.420000076]
Render node:   0x8c812c20 (TASK + 0x60)
Callback:      0x0c2de638 (TASK + 0x64)
```

Only two words changed anywhere in the monitored `0x8c810000`–`0x8c812fff`
region. They are the Y rotations of the two door-leaf HMDL nodes:

```text
0x8c812c6c  first leaf rotation Y
0x8c812cec  second leaf rotation Y
```

The leaves rotate symmetrically from zero to `+0x4e38` and `-0x4e38`,
respectively. In signed fixed-turn units this is approximately `+109.995°`
and `-109.995°`. Opening begins at experiment frame 133 and reaches its
endpoint at frame 179, updating every other VBlank. Closing begins at frame
317 and returns exactly to zero at frame 363.

Most importantly, `TASK + 0x64` remains `0x0c2de638` while closed, throughout
both animations, and while open. The small drawers, wide drawers, and double
doors also carry this same value in their idle TASK records. It therefore
cannot identify a specific sliding-drawer animation. The animation-specific
selection and parameters must be reached through another controller/script
record or through callers of this shared task callback.

## Third data point: interior sliding door

A one-shot capture pressed A at an interior sliding door and deliberately sent
no later close/back input, because Ryo walks through this doorway as part of
the interaction:

```text
captures/objects/object-once-1784866070.csv
```

The full-RAM ownership scan identifies the door as:

```text
Source model:  S1_JOMO_DR15_028.MT5
Runtime HRCM:  0x8c6819c0
Runtime HMDL:  0x8c933e00
Runtime TASK:  0x8c661fc0
Closed TASK:   [15.3450003, 0, -0.0183000006]
Render node:   0x8c933e20 (TASK + 0x60)
Callback:      0 (TASK + 0x64)
```

This door does not move its outer TASK. It translates an HMDL child node:

```text
0x8c933e80  HMDL child node + 0x20, position X
Closed:     0
Open:       0.75
Travel:     0.75
```

The child begins moving at experiment frame 117, reaches exactly `0.75` at
frame 153, and remains there through the end of the one-shot recording.
Updates occur every other VBlank. Normalized 30 Hz samples are:

```text
0
0.031481984
0.075010518
0.128172914
0.188558122
0.253758311
0.321355919
0.388943156
0.454107285
0.514471491
0.569939097
0.623657425
0.678003947
0.732330640
0.785618464
0.836852312
0.885018428
0.929099878
0.968084733
1
```

This is stronger evidence that `TASK + 0x64` is not the object-animation
selector: the sliding door animates with that field set to null, while the
wardrobe drawer and hinged doors animate with `0x0c2de638`. A controller
external to these placement TASKs can therefore animate either the TASK
transform or an HMDL child transform.

## Sliding-door writer and script call chain

Flycast was rerun in SH-4 interpreter mode with an FPU write watch on the
sliding-door field `0x8c933e80`. The complete instruction/register trace is:

```text
captures/analysis/sliding-door-write-fpu.csv
```

All 46 observed writes came from:

```text
PC 0x0c158260: fmov fr3,@(r0,r4)
r0: 0x20
r4: 0x0c933e60
destination: 0x0c933e80
```

This instruction is inside the generic handler beginning at `0x0c15820a`.
The handler resolves a named object and HMDL node, examines an operation mode,
and then sets or adds an XYZ vector at node offsets `+0x20`, `+0x24`, and
`+0x28`.

At the first nonzero sliding-door write, the handler's input descriptor was
at `0x0c4986f0`:

```text
Offset  Value        Meaning
+0x00   "dor8"       script object identifier
+0x04   7            HMDL node selector
+0x08   0x0c498794   pointer to the current XYZ vector
+0x0c   0            optional rotation-vector pointer
+0x10   0            operation mode: set
```

The saved SH-4 stack and disassembly recover the complete dispatch path:

```text
room script at 0x0c3ce3c8
  constructs {"dor8", node 7, vector, 0, mode 0}
  calls engine operation ID 0x00c9 at 0x0c3ce3e6
    -> wrapper 0x0c0bb69c
    -> dispatcher 0x0c0bb6fe
    -> table 0x0c29a9e0[0x00c9]
    -> generic HMDL transform handler 0x0c15820a
    -> position-X write 0x0c158260
```

The room-script code is not generated only at runtime. The 1024 bytes at
runtime `0x0c3ce000` match JOMO `MAPINFO.BIN` exactly at file offset `0x88c0`.
The traced call site maps to file offset `0x8ca6`. The same file contains two
complete `dor0` through `dor9` identifier tables at offsets `0x4f9c4` and
`0x5062c`.

Consequently there is no per-door callback attached to `dor8`. JOMO's native
room script directly issues generic engine operation `0x00c9` every 30 Hz
tick with the current interpolated vector. Any higher-level callback belongs
to the room-script scheduler, not to the individual door. This also supplies
the scalable extraction route: inspect `MAPINFO.BIN` scripts for object tags
and transform-operation calls rather than interacting with every object.

## Interaction timing versus object timing

In the captured game interaction:

- A was pressed at experiment frames 61–63.
- The handle first moved at frame 122.
- The drawer first translated at frame 134.
- Opening completed at frame 180.
- B was pressed at frames 241–243.
- Closing translation began at frame 284.
- Closing completed at frame 330.

The long delays before handle/translation movement belong to Ryo's interaction
animation and interaction-camera sequence. The extracted object-local
animation is approximately one second:

```text
tick 0:      handle at 0°
tick 1:      handle at −45°
tick 2:      handle at −90°
tick 6:      drawer translation begins
ticks 6–30:  captured translation samples
tick 31:     handle resets to 0°
```

The browser currently starts this object-local sequence immediately on click
because it does not yet play Ryo's reach/pull character animation.

## Browser implementation

`src/RuntimeObjectAnimation.js` contains the captured samples and pure
open/close evaluators. `play/PlayApplication.js` recognizes placed
`S1_JOMO_TANM4W3G.MT5` roots, leaves their world matrices unfrozen, identifies
the `0xfe` handle node, and applies:

```text
root translation = captured 0.426000118 travel along local drawer-forward
handle rotation  = captured X rotation
```

Local drawer-forward is transformed through the placement rotation, allowing
the same captured behavior to work on both wardrobe orientations.

Left-clicking a nearby small drawer toggles it. Opening uses the measured
handle and translation sequence; closing uses the measured reversed
translation sequence.

The browser now applies the same recovered object system across the active
JOMO tag registry:

- `TANM4W3G` and `TANM4W4G` wardrobe drawers;
- `DESM402G` and `DESM403G` desk drawers;
- `BUTM401G` and `BUTM403G` cabinet drawers;
- `TANM402G` and `BUTM402G` paired hinged doors;
- seven placed `DR15/DR23` sliding-door instances;
- two placed `DR01_015` Western swing-door instances;
- the `TOKE` alarm clock.

The sliding room doors use the exact 20-sample, 30 Hz `dor8` curve and
0.75-unit source-X endpoint. `DR01_015` is classified separately because its
single 0.9-unit leaf is authored entirely to one side of its edge pivot; it
swings through the captured placement angle of approximately 79.9 degrees.
One runtime instance was captured open and retains that initial state.
Paired cabinet doors use the exact 25-sample fixed-turn recording ending at
`+/-0x4e38` (approximately 110 degrees).
`src/JomoObjectRegistry.js` keeps these behavior classifications separate
from rendering code.

Every one of the 146 active placements also carries its recovered
four-character object tag in
`play/data/jomo-runtime-placements.json`. Unclassified tags remain inert:
the common TASK callback is shared by animated and non-animated pieces, so
assigning behavior from that pointer alone would be guesswork.

## Static extraction proof: JOMO alarm clock

The next object was selected and decoded without positioning Ryo in front of
it, loading a save state, pressing A, or recording its RAM while it moved.
The source was the Disc 1 JOMO `MAPINFO.BIN` already extracted at:

```text
.disc-work/exact/jomo/MAPINFO.BIN
```

The reusable scanner is:

```text
tools/scripting/extract_sh4_object_transforms.py \
  .disc-work/exact/jomo/MAPINFO.BIN \
  --object TOKE \
  --json
```

`TOKE` is the room-script identifier for the clock (`tokei`). The placed
model is `S1_JOMO_CLKS501G.MT5`. An independent parse of that MT5 confirms
six HMDL nodes. The script's `0x98` target is the 92-vertex clock-body/bell
piece, and `0x99` is its 11-vertex striker. The actual clock hands are the
four-vertex nodes `0x96` and `0x97`; this routine is therefore the alarm
ring/shake animation, not time-of-day hand positioning.

The first statically decoded routine begins at file offset `0x5a978`. Its
important operation `0x00c9` calls are:

```text
0x5a9a8  TOKE node 0x98  set position
0x5a9cc  TOKE node 0x99  set rotation
0x5aa72  TOKE node 0x98  add one shake direction
0x5aa96  TOKE node 0x99  add one striker direction
0x5aade  TOKE node 0x98  add the opposite shake direction
0x5ab02  TOKE node 0x99  add the opposite striker direction
```

The SCN3 header puts its mutable static-data image at file offset `0x8fd9c`.
The constant vectors establish:

```text
body initial Z:       +0.005
body alternating leg: -0.010
striker initial Y:    -364 fixed turns = -1.99951171875 degrees
striker return leg:   +364 fixed turns = +1.99951171875 degrees
```

The complementary branch returns to the initial pose. Its vector storage is
mutable and is initialized by surrounding room code, so the scanner reports
the file's initial words rather than pretending they are immutable constants.

The coroutine counter is compared with `0xa7`, accepting states `0..167`.
Its low bit selects exactly one of the two opposing transform branches.
Consequently the object alternates for 168 updates at the game's 30 Hz object
rate: 5.6 seconds.

`src/RuntimeObjectAnimation.js` implements that discrete evaluator.
`play/PlayApplication.js` registers the placed `CLKS501G` node keys and starts the alarm
when the nearby clock is left-clicked. This is the first browser object
animation sourced from static script disassembly rather than an animation
recording. It has not been checked against a new emulator capture; that
remains an optional independent validation rather than an extraction input.

### Corrected `0x00c9` descriptor

Disassembling the complete generic handler at `0x0c15820a` refines the
earlier descriptor interpretation:

```text
+0x00  four-character object tag
+0x04  HMDL node key
+0x08  optional float XYZ position-vector pointer
+0x0c  optional signed fixed-turn XYZ rotation-vector pointer
+0x10  mode: 0=set, 1=add, 2=read, 3=set scale for the position channel
```

The handler independently processes non-null position and rotation pointers.
This explains both the captured sliding door (position only) and the clock
striker (rotation only) without object-specific engine callbacks.

## Repeatable method for another object

1. Resolve its HRCM, HMDL, and TASK through `TASK + 0x60`.
2. Record the object's HMDL nodes and TASK before, during, and after input.
3. Diff exact 32-bit words, not screenshots.
4. Interpret changed node rotation, scale, and translation fields.
5. Record every 30 Hz sample rather than fitting a guessed curve.
6. Capture the reverse interaction separately.
7. Keep character-interaction delay separate from object-local timing.
8. Add a pure evaluator and endpoint/timing tests before wiring rendering.
