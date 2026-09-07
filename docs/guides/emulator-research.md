# Emulator Research Guide

This document is the operational guide for using the project's instrumented
Flycast build to investigate the original Dreamcast versions of *Shenmue* and
*Shenmue II*. It is written for a new researcher or LLM with no conversation
context. Procedures shared by both games are documented once; game-specific
addresses, formats, tools, and static-analysis projects are labeled explicitly.

The emulator is useful for more than visual comparison. The current tooling can:

- load existing Flycast save states;
- send deterministic controller input;
- capture synchronized main RAM, video RAM, PowerVR state, and draw commands;
- read selected RAM regions on every VBlank;
- write 32-bit values to live Dreamcast memory;
- request native area transitions by editing the game's own transition record;
- trace the SH-4 instructions that read or write a selected address range;
- record registers at selected functions or indirect calls;
- use live values to anchor static analysis in the existing Ghidra project.

The guiding rule is: **use the emulator to collect evidence, then reproduce the
game's data and rules—not the incidental address from one capture**. Most heap,
TASK, controller, and scene-context addresses can change after loading a room or
state.

## Repository and emulator layout

Set `PROJECT_ROOT`, `FLYCAST_ROOT`, and `SHENMUE_DISC_ROOT` for the local
checkouts and disc images. The expected layout is:

```text
$PROJECT_ROOT/                              this repository
$FLYCAST_ROOT/                              instrumented Flycast checkout
$SHENMUE_DISC_ROOT/Disc N/*.cue             local disc images
.disc-work/shenmue2-disc1-image/*.cue      current local Shenmue II disc image
.flycast-pvr/config/flycast/                isolated Flycast configuration
.flycast-pvr/data/flycast/                  VMU data and save states
.flycast-pvr/control/                       file-based commands to running Flycast
captures/pvr/                               synchronized RAM/PVR captures
captures/skeleton/                          per-VBlank controller/matrix recordings
captures/objects/                           per-VBlank object-region recordings
captures/boundary/                          boundary/event recordings
captures/race/                              forklift route recordings
captures/analysis/                          retained instruction traces and analyses
.disc-work/ghidra-sh4/ShenmueSH4.gpr        local Ghidra project
.disc-work/ghidra-sh4/exports/              retained Ghidra exports
.disc-work/ghidra-s2-sh4/Shenmue2SH4.gpr    Shenmue II Ghidra project
.disc-work/ghidra-s2-sh4/exports/           Shenmue II Ghidra exports
```

`captures/` and `.disc-work/` are local research artifacts and may not exist in
a clean checkout. Do not make production code depend on them. Distilled,
reproducible conclusions belong in `tools/evidence/`, generated browser data,
tests, and the relevant documentation.

The Flycast checkout contains intentional project-specific commits, including:

- `431ab0c7f` — synchronized PVR, VRAM, and RAM capture;
- `d1f0d31d8` — address-filtered SH-4 memory traces;
- `75df66041` — exact trace timing and FPU state improvements.

The checkout may also contain uncommitted experiments. Inspect it before
rebuilding; do not reset or clean it casually:

```bash
git -C "$FLYCAST_ROOT" status --short
git -C "$FLYCAST_ROOT" log -5 --oneline
```

The existing build is a Release/Ninja build with GDB support enabled. If it
must be rebuilt, preserve the current checkout first, then use its existing
configuration:

```bash
cmake -S "$FLYCAST_ROOT" \
  -B "$FLYCAST_ROOT/build" \
  -G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_GDB_SERVER=ON
cmake --build "$FLYCAST_ROOT/build"
```

## Starting the instrumented emulator

### What “open/launch the emulator” means in this project

When the user asks to open or launch the emulator, launch *Shenmue* through
this repository's wrapper. Do not start the Flycast executable by itself and
do not leave the user at Flycast's game-selection menu. A direct launch uses
the ordinary `~/.config/flycast` and `~/.local/share/flycast` profile, so the
project's save states, VMU, Lua bridge, and capture controls will appear to be
missing.

The normal Disc 1 command is:

```bash
tools/emulator/run_flycast_pvr_capture.sh 1
```

Use the disc number implied by the request or current investigation; default
to Disc 1 only when no other disc is indicated. The wrapper preserves the
selected save-state slot from `.flycast-pvr/config/flycast/emu.cfg`, and with
automatic state loading enabled it resumes that slot on launch. If a specific
displayed slot is requested, remember that Flycast's stored/internal slot is
one lower (displayed slot 4 is `Dreamcast.SavestateSlot = 3`). Verify the boot
log names the expected state file before beginning an experiment.

From this repository:

```bash
tools/emulator/run_flycast_pvr_capture.sh 1
```

Replace `1` with `2` or `3` for another disc. The launcher:

- starts the instrumented binary rather than a system Flycast;
- uses the isolated `.flycast-pvr` config/data directories;
- installs `tools/emulator/ryo_hallway_probe.lua` as Flycast's Lua bridge;
- exports the request and output paths used by the helper scripts;
- disables threaded rendering so frame and memory evidence remain synchronized.

Override the default locations only when necessary:

```bash
FLYCAST_CAPTURE_ROOT=/path/to/flycast \
SHENMUE_DISC_ROOT=/path/to/Shenmue-USA \
tools/emulator/run_flycast_pvr_capture.sh 1
```

The positional disc number selects the default *Shenmue I* cue. For *Shenmue
II*, pass the exact cue with `SHENMUE_CUE`; the rest of the capture, Lua, input,
save-state, and trace machinery is shared:

```bash
SHENMUE_CUE="$PWD/.disc-work/shenmue2-disc1-image/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).cue" \
tools/emulator/run_flycast_pvr_capture.sh 1
```

The trailing `1` is still required by the launcher's interface but does not
override `SHENMUE_CUE`. Do not point `SHENMUE_DISC_ROOT` at a Shenmue II folder
and assume its filenames match the Shenmue I convention.

On hosts where this checkout's Flycast binary needs the locally retained audio
compatibility libraries, prefix the launch with:

```bash
LD_LIBRARY_PATH="$PWD/.disc-work/flycast-runtime/local-lib" \
SHENMUE_CUE=".../Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).cue" \
tools/emulator/run_flycast_pvr_capture.sh 1
```

Use that library override only when the ordinary launch reports a missing
shared library; it is a host dependency workaround, not a game-format
difference.

For SH-4 instruction tracing, the interpreter is mandatory:

```bash
FLYCAST_FORCE_INTERPRETER=1 tools/emulator/run_flycast_pvr_capture.sh 1
```

Interpreter mode is dramatically slower. Use the normal dynarec build for
playing, save-state preparation, Lua memory sampling, and full RAM capture.
Use interpreter mode only after narrowing the address or code range to trace.

The Lua bridge polls `.flycast-pvr/control` every 30 VBlanks. A request may
therefore take roughly half a second to start. Submit one recording experiment
at a time. Repeated memory writes may run concurrently, but overlapping
experiments make evidence harder to interpret.

## Save states and VMU saves

Flycast save states and Shenmue VMU saves are different:

- a **save state** freezes emulator/runtime state and is ideal for repeatable
  experiments;
- a **VMU save** is the game's durable save data and can be loaded normally by
  the game, but does not preserve an exact runtime moment.

The isolated Flycast data directory contains files such as:

```text
.flycast-pvr/data/flycast/Shenmue (USA) (Disc 1).state
.flycast-pvr/data/flycast/Shenmue (USA) (Disc 1)_1.state
.flycast-pvr/data/flycast/MK-51059_vmu_save_A1.bin
.flycast-pvr/data/flycast/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).state
```

State files are per disc. In the Lua API, displayed save-state slot 1 is
internal index `0`; displayed slot 2 is index `1`, and so on. Existing helper
scripts that say “slot 1” intentionally call:

```lua
flycast.emulator.loadState(0)
```

Create/save states through Flycast's UI. The current bridge automates loading,
not saving. Before destructive memory experiments, copy the relevant state and
VMU file into a dated backup directory. Never assume a slot still contains the
scene described in an old conversation; slots are mutable and disc-specific.

Every retained state should be accompanied by:

- disc and game revision;
- displayed slot and state filename;
- SHA-256 of the state file;
- area, in-game date/time, nearby actor/object, and player orientation;
- a screenshot or short human description;
- the experimental purpose.

Some older backups are under `.disc-work/saves/`, but their filenames are
research hints, not a canonical slot catalog.

### Extracting RAM from a Flycast save state offline

For Shenmue II animation research, a saved Flycast state can be turned into a
16 MiB RAM dump without launching or executing the emulator:

```bash
node tools/emulator/extract_flycast_savestate_ram.mjs \
  --state ".flycast-pvr/data/flycast/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).state" \
  --reference-ram captures/pvr/KNOWN-DISC1-FRAME/ram.bin \
  --out captures/pvr/SAVE-DESCRIPTION/ram.bin
```

The tool validates the `FLYSAVE1` header, decompresses every `#RZIPv1#` chunk,
and locates the serialized Dreamcast RAM by matching many static Disc 1
executable windows from a known synchronized RAM capture. It writes a
`savestate-ram.json` manifest with source hashes, payload offset, and the
number of matching windows. The reference locates the RAM block; every byte in
the emitted dump comes from the save state.

This is useful for recovering actor/controller inventories from an otherwise
idle emulator, but it is not frame-synchronized evidence. Saving can stop the
SH-4 between related writes, so a solver input may belong to the update after
the renderer matrix beside it. Use these dumps to discover candidates. Require
a completed PowerVR-frame capture before treating a small isolated mismatch as
a new animation rule.

## Manual and automated controller input

Use the emulator normally when human timing or scene navigation is useful.
Use the input-pulse helper when an experiment must be reproducible:

```bash
tools/emulator/request_input_pulse.sh \
  [port] [button-mask] [frames] [load-state-index] \
  [axis-x] [axis-y] [left-trigger] [right-trigger]
```

Examples:

```bash
# Press D-pad Up on port 1 for 30 VBlanks in the current state.
tools/emulator/request_input_pulse.sh 1 0x10 30 -1

# Load displayed slot 1 (internal index 0), wait 60 VBlanks, then press A.
tools/emulator/request_input_pulse.sh 1 0x4 3 0

# Press B in the current state.
tools/emulator/request_input_pulse.sh 1 0x2 3 -1
```

Button bits already verified by this repository are:

| Input | Mask |
| --- | ---: |
| Dreamcast A | `0x04` |
| Dreamcast B | `0x02` |
| D-pad Up | `0x10` |

Do not invent the remaining masks. Verify them against Flycast input code or a
controlled experiment before adding them here. Axis indices used by the bridge
are 1/2 for X/Y and 5/6 for the left/right triggers. The helper releases all
requested input after the pulse and waits another 15 VBlanks before finishing.

When a state is loaded by the helper, input begins after 60 VBlanks so the game
can settle. With `-1`, input begins immediately in the current runtime state.

## Capturing synchronized RAM and PowerVR state

With Shenmue running, request a capture from another terminal:

```bash
tools/emulator/request_pvr_capture.sh
```

The helper finds the newest running Shenmue Flycast process and sends
`SIGUSR1`. Flycast captures the next render frame into:

```text
captures/pvr/YYYYMMDD-HHMMSS-frame-N/
  frame.json
  pvr-registers.bin
  ram.bin
  ta-commands-pass-0.bin
  vram.bin
```

There may be more than one `ta-commands-pass-N.bin`. The important properties
are:

- `ram.bin` is the complete 16 MiB Dreamcast main RAM image;
- `vram.bin` is the complete 8 MiB video RAM image;
- `frame.json`, PVR registers, and TA command streams describe the same frame.

Inspect the latest capture, or a named capture, with:

```bash
node tools/emulator/inspect_pvr_capture.js
node tools/emulator/inspect_pvr_capture.js captures/pvr/YYYYMMDD-HHMMSS-frame-N
```

This reports draw counts, render passes, textures, primitive restarts, and the
files present. A RAM capture is the preferred starting point for placements,
live actor/controller structures, pointers, current state, and before/after
comparisons. PVR/VRAM data is valuable when the question is what was actually
drawn, which texture was bound, or how a geometry stream reached the screen.

### Unattended Shenmue II actor capture

When an animation fixture needs an actor that appears only at a particular
native time or story state, start from one synchronized capture of the loaded
area and arm the exact actor watcher:

```bash
tools/emulator/request_flycast_frame_capture.sh 1 1
```

This asks the Lua bridge for a synchronized PVR/RAM capture without requiring
an actor address in advance. It is the safe way to obtain the current baseline
after loading a state, changing time, or crossing an area boundary. The two
optional arguments are capture count and VBlank spacing. The request path can
be overridden with `FLYCAST_FRAME_CAPTURE_REQUEST`, which is useful when an
isolated Flycast instance has its own capture directory and control files.

After that capture completes, use its `ram.bin` to arm the exact watcher:

```bash
npm run capture:shenmue2-animation-actor -- \
  captures/pvr/BASELINE/ram.bin 04F_ \
  --captures 12 --spacing 12 --timeout 216000
```

The Node helper finds aligned occurrences of the exact four-byte actor code in
the capture-local runtime heap. The Lua bridge does not assume that any one
occurrence is an actor. It waits until one candidate has the same compact
controller pointer at native ordinary-actor offsets `+0x08` and `+0x24`, then
validates the five-slot controller layout before requesting PowerVR frames.
It revalidates the actor-to-controller link for every frame in the series.
Static name tables, event bytes, stale pointers, and merely loading the model
therefore cannot trigger a capture.

Addresses remain valid only while the area allocation represented by the
baseline RAM is live. Generate a new request after an area transition or state
reload; never derive a watcher from an older capture merely because the actor
code and area are the same. Submitting another request replaces an active watcher. `--timeout` is
measured in VBlanks; the default `216000` is approximately one hour at 60 Hz.
The synchronized outputs still pass through the normal binding extractor and
strict corpus refresh before becoming animation evidence.

### Deterministic multi-frame Ryo probe

For the existing Ryo hallway experiment:

```bash
tools/emulator/request_ryo_hallway_probe.sh
```

It captures idle at experiment frame 60, presses forward at 90, captures at
98/120/150, releases at 180, and captures the stopped state at 210. The five
`ram.bin` files can be searched together:

```bash
node tools/animation/find_runtime_bone_matrices.js \
  IDLE/ram.bin WALK_START/ram.bin WALK_MID/ram.bin \
  WALK_LATE/ram.bin STOPPED/ram.bin > .disc-work/matrix-candidates.json
```

The hard-coded addresses and timings in this probe came from a specific saved
scene. Treat it as a pattern for new probes, not a universal Ryo address map.

## Dreamcast RAM address conventions

Main RAM is 16 MiB. A byte at file offset `N` in `ram.bin` corresponds to the
Dreamcast main-RAM address:

```text
0x8c000000 + N
```

Shenmue and the SH-4 also commonly use the cached `0x0c......` alias. In this
project, normalize either alias to a RAM-file offset with:

```text
offset = address & 0x00ffffff
```

Always bounds-check the result against `ram.bin.length`. For instruction trace
filters the instrumented Flycast normalizes through the SH-4 physical-address
mask (`& 0x1fffffff`), so either cached alias can match.

Data is little-endian:

- `u16`, `u32`, pointers, and IEEE-754 `float32` use little-endian byte order;
- a four-character area ID is a raw four-byte word;
- many native angles are signed 16-bit fixed turns:
  `degrees = int16(raw & 0xffff) * 360 / 65536`.

Example Node inspection:

```bash
node --input-type=module - captures/pvr/CAPTURE/ram.bin 0x8c3c5230 <<'EOF'
import fs from 'node:fs';
const [file, addressText] = process.argv.slice(2);
const ram = fs.readFileSync(file);
const address = Number(addressText);
const offset = address & 0x00ffffff;
if (offset < 0 || offset + 4 > ram.length) throw new Error('outside main RAM');
console.log({
  address: `0x${address.toString(16)}`,
  offset: `0x${offset.toString(16)}`,
  u32: `0x${ram.readUInt32LE(offset).toString(16).padStart(8, '0')}`,
  i32: ram.readInt32LE(offset),
  f32: ram.readFloatLE(offset),
  ascii: ram.subarray(offset, offset + 4).toString('latin1'),
});
EOF
```

Do not confuse `1ST_READ.BIN` file offsets with RAM offsets. The main
executable is normally analyzed at runtime base `0x0c010000`; relocatable room
programs, archives, and heap objects require their own proven mapping.

## Looking for structures in a RAM dump

There is currently no generic shell command that prints an arbitrary word from
the running process. For a one-time read, request a synchronized capture and
inspect `ram.bin`. For a value that must be observed continuously, add a narrow
Lua recorder using `flycast.memory.readTable32(address, wordCount)`, following
the existing bridge patterns below. This makes timing and provenance explicit
instead of silently sampling an unrelated host-process address.

Use the narrowest evidence available:

1. Capture a stable baseline.
2. Change exactly one input, state, object, or animation phase.
3. Capture again at known times.
4. Compare words in a plausible region before searching all 16 MiB.
5. Interpret candidates as integers, floats, pointers, and fixed turns.
6. Follow pointers and validate structure stride/signatures.
7. Repeat from another state or reload to distinguish structure offsets from
   accidental heap addresses.
8. Find the code that reads/writes the field with an instruction trace.
9. Reconcile that code with Ghidra and original disc data.

Useful existing extractors include:

```bash
# Find instantiated model/HMDL/TASK transforms for named models.
node tools/worlds/extract_runtime_placements.js CAPTURE_DIR MODEL.MT5

# Scan a catalog prefix and emit machine-readable placement evidence.
node tools/worlds/extract_runtime_placements.js CAPTURE_DIR \
  --catalog-prefix S1_JOMO_ --json --out .disc-work/placements.json

# Join four-character TASK tags to exact unpacked source models.
node tools/worlds/extract_tagged_runtime_objects.js \
  CAPTURE_DIR UNPACKED_MODEL_DIR --out .disc-work/tagged-objects.json

# Discover live scheduled actors and preserve controllers/final matrices.
node tools/actors/extract_npc_runtime_controllers.js \
  CAPTURE_DIR/ram.bin [ACTOR_CODE ...] --out .disc-work/controllers.json

# Discover Shenmue II compact controllers and native MDC7 render bindings.
node tools/actors/extract_shenmue2_runtime_controller_bindings.js \
  CAPTURE_DIR/ram.bin [--motion-id 0xf03e] \
  --out .disc-work/s2-controller-bindings.json
```

`tools/README.md` documents additional actor/controller generators.
`docs/research/shenmue1/runtime-object-placement.md` and
`docs/research/shenmue1/runtime-object-animation.md` show complete examples of turning RAM
evidence into browser behavior.

Raw byte searches are still useful. Search for exact four-character tags,
little-endian pointers, model headers, or known floats rather than visually
similar values. A runtime pointer's byte sequence can be created with
`Buffer.writeUInt32LE`. Never conclude ownership from proximity alone; follow
the actual pointers.

## Recording a small RAM region over time

Full-frame captures are ideal checkpoints, but a changing object or controller
is easier to understand as a per-VBlank table.

### Generic one-shot interaction recorder

```bash
tools/emulator/request_object_once_recording.sh \
  [memory-base=0x8c810000] [byte-count=0x3000] [reload-slot-1=1]
```

Examples:

```bash
# Load displayed slot 1/internal index 0, monitor 0x3000 bytes, press A.
tools/emulator/request_object_once_recording.sh 0x8c810000 0x3000 1

# Record the current emulator state without loading a state.
tools/emulator/request_object_once_recording.sh 0x8c900000 0x1000 0
```

Despite the historical third argument name, it is a boolean: nonzero always
loads internal state index 0; zero keeps the current state. Output is written
to `captures/objects/object-once-*.csv`. The recorder also requests full RAM
captures at selected frames.

### Wardrobe drawer reference experiment

```bash
tools/emulator/request_drawer_recording.sh
```

This always loads displayed slot 1/internal index 0, records the established
wardrobe region, presses A to open, presses B to close, and emits
`captures/objects/drawer-open-*.csv`. Its exact findings are documented in
`docs/research/shenmue1/runtime-object-animation.md`.

### Ryo controller and matrix streams

```bash
tools/emulator/request_ryo_matrix_recording.sh short-step
tools/emulator/request_ryo_matrix_recording.sh long-walk
```

These record 37 matrices at `0x8cc06e80` (stride `0x40`) and 37 control
records at `0x8cc05820` (stride `0x48`) to `captures/skeleton/`. Those bases
belong to the reference state; rediscover them before using the recorder in a
different scene or build.

### Specialized retained recorders

```bash
tools/emulator/request_boundary_transition_recording.sh [frames]
tools/emulator/request_race_route_recording.sh
```

The boundary recorder is a read-only JD00 probe with hard-coded JD00 actor,
event, selector, and field-manager addresses. The race recorder loads Disc 3
displayed slot 1/internal index 0 and samples five hard-coded forklift TASKs
at 10 Hz for six minutes. They are examples of precise bespoke probes, not
generic current-scene analyzers.

To create a new recorder, extend `tools/emulator/ryo_hallway_probe.lua` and add a small
request script. Preserve raw words in the output, include base/stride/count
metadata, sample on VBlank, and capture full RAM at important transitions.

## Writing live memory

The bridge accepts address/value pairs and performs 32-bit writes:

```bash
tools/emulator/request_memory_writes.sh ADDRESS VALUE [ADDRESS VALUE ...]
```

Repeat writes across several VBlanks when the game immediately refreshes a
field:

```bash
FLYCAST_MEMORY_WRITE_FRAMES=3 \
  tools/emulator/request_memory_writes.sh 0x8c123456 0x00000001
```

Values are raw unsigned 32-bit words. Encode floats as their IEEE-754 bits:

```bash
node -e "const b=Buffer.alloc(4); b.writeFloatLE(12.5); console.log('0x'+b.readUInt32LE().toString(16))"
```

The Lua bridge applies the listed writes in order during VBlank. For a
multi-field command, write payload fields first and the trigger/ready flag
last. Begin from a backed-up save state and use the smallest repeat count.

### Moving an actor experimentally

Many Shenmue TASK transforms store position at `TASK + 0x28`, `+0x2c`, and
`+0x30` as float32 X/Y/Z. This is not permission to assume every selected
pointer is a TASK. First prove the TASK address in the current capture by its
owner/render pointers and structure fields, then write float bits to those
offsets. The game may overwrite them on its next scheduler update, and a
character may have controller/root fields that also need to remain coherent.

Use position writes for short experiments—placing Ryo beside an object,
testing a trigger, or identifying an actor—not as the production placement
source. Production behavior should use extracted spawn/schedule/transition
data.

## Native area/zone transitions through RAM

The game has a scene-context transition request:

| Context offset | Meaning |
| --- | --- |
| `+0xcc` | trigger; bit 0 requests the transition |
| `+0xd0` | four-byte destination area ID |
| `+0xd4` | scene/disc ID |
| `+0xd8` | destination entry ID |
| `+0xdc` | request mode; observed normal value `7` |

In one Disc 1 JOMO capture, the context was `0x8c3c5160`, making the request
block `0x8c3c522c`. Writing `D000`, scene 1, an entry, mode 7, and trigger 1
caused the game's native Dobuita loading transition. This is verified in
`docs/research/shenmue1/d000-object-placement.md`.

**Do not reuse `0x8c3c522c` globally.** The request belongs to the current
scene context. Settled Disc 2 MFSY/MKSG captures used a different context.
The native lookup is:

```text
owner   = read32(0x0c217488)
context = read32(owner + 0x3c)
request = context + 0xcc
```

Resolve it from a fresh capture of the currently running scene:

```bash
node --input-type=module - captures/pvr/CAPTURE/ram.bin <<'EOF'
import fs from 'node:fs';
const ram = fs.readFileSync(process.argv[2]);
const read32 = (address) => {
  const offset = address & 0x00ffffff;
  if (offset < 0 || offset + 4 > ram.length) {
    throw new Error(`outside RAM: 0x${address.toString(16)}`);
  }
  return ram.readUInt32LE(offset);
};
const owner = read32(0x0c217488);
const context = read32(owner + 0x3c);
console.log({
  owner: `0x${owner.toString(16)}`,
  context: `0x${context.toString(16)}`,
  request: `0x${(context + 0xcc).toString(16)}`,
});
EOF
```

Validate that all pointers normalize inside the 16 MiB RAM image and inspect
the existing area/scene/entry/mode fields before writing. If the room changed
after the capture, capture and resolve again.

Four-character area IDs must be packed as little-endian words. For example,
the bytes for `D000` are `44 30 30 30`, hence word `0x30303044`. Generate a
word rather than hand-packing it:

```bash
node -e "const b=Buffer.from('D000'); console.log('0x'+b.readUInt32LE().toString(16))"
```

After resolving `REQUEST` for the current scene, a native transition request
has this form:

```bash
FLYCAST_MEMORY_WRITE_FRAMES=2 tools/emulator/request_memory_writes.sh \
  $((REQUEST + 0x04)) 0x30303044 \
  $((REQUEST + 0x08)) 1 \
  $((REQUEST + 0x0c)) 2 \
  $((REQUEST + 0x10)) 7 \
  "$REQUEST" 1
```

Here the example destination is `D000`, scene 1, entry 2. Confirm a tuple in
`tools/evidence/map-transition-catalog.json` or the source `MAPINFO.BIN`
before issuing it. Area, scene, and entry are separate fields; an area name
alone is not a complete destination.

The robust way to automate arbitrary warps is to add a Lua request that
follows the owner/context pointer chain immediately before writing. A shell
script based on a previously captured request address always has a race across
room changes.

See `docs/research/shenmue1/map-transition-trace.md` for the recovered native operation,
entry evidence, and limitations of associating transition tuples with
physical doors.

## Finding the code that reads or writes a field

Once an address range is known, restart Flycast in interpreter mode with a
narrow trace configured **before launch**. Trace configuration is initialized
once per process; changing environment variables on an already running
process has no effect.

### General integer/load-store traces

```bash
FLYCAST_FORCE_INTERPRETER=1 \
FLYCAST_SH4_WRITE_TRACE_START=0x8c933e80 \
FLYCAST_SH4_WRITE_TRACE_END=0x8c933e84 \
FLYCAST_SH4_WRITE_TRACE_LIMIT=10000 \
FLYCAST_SH4_WRITE_TRACE_OUTPUT="$PWD/captures/analysis/example-write.csv" \
tools/emulator/run_flycast_pvr_capture.sh 1
```

Available variable families are:

```text
FLYCAST_SH4_READ_TRACE_START / END / LIMIT / OUTPUT
FLYCAST_SH4_READ_TRACE_PC_START / PC_END

FLYCAST_SH4_WRITE_TRACE_START / END / LIMIT / OUTPUT
FLYCAST_SH4_WRITE_TRACE_PC_START / PC_END
```

Ranges are half-open: `START <= address < END`. Optional PC filters are also
half-open. CSV rows include PC, address, width, raw value, PR, FPUL, and all
16 general registers.

### FPU memory traces

Animation matrices and float transforms often use FPU load/store opcodes,
which have separate trace hooks:

```text
FLYCAST_SH4_FPU_READ_TRACE_START / END / LIMIT / OUTPUT
FLYCAST_SH4_FPU_READ_TRACE_PC_START / PC_END

FLYCAST_SH4_FPU_WRITE_TRACE_START / END / LIMIT / OUTPUT
FLYCAST_SH4_FPU_WRITE_TRACE_PC_START / PC_END
```

Use both general and FPU write traces if the responsible opcode class is not
known. `captures/analysis/sliding-door-write-fpu.csv` and the analysis in
`docs/research/shenmue1/runtime-object-animation.md` are a successful reference: tracing
one moving transform exposed the exact writer, registers, script descriptor,
engine operation, and corresponding `MAPINFO.BIN` call site.

### Shenmue II compact NPC controller traces

Shenmue II NPC animation is materially different from Shenmue I's MOMT/HRCM
runtime. Its compact `.MOT` sequence has 69 curves: root XYZ followed by 22
rotation triplets. Those 22 rotations are not a flat MT7-node array. Native
descriptor code partitions them into five solver slots, and the solvers produce
the matrices consumed by MDC7 render records.

The currently proven compact-controller layout is:

| Controller-relative offset | Meaning |
| --- | --- |
| `+0x08` | root matrix and slot 0 solver structure |
| `+0xe18` | slot 1 solver structure |
| `+0x11a8` | slot 2 solver structure |
| `+0x1578` | slot 3 solver structure |
| `+0x1af8` | slot 4 solver structure |
| `+0x23c0` | five slot flags |
| `+0x2400` | five current motion IDs (`u16`) |
| `+0x240a` | five requested motion IDs (`u16`) |
| `0x2440` | observed compact-controller allocation size |

For the audited ordinary walking controllers, slots 0 through 4 consume these
controller-index groups respectively:

```text
0..7, 8..10, 11..13, 14..17, 18..21
```

Do not turn those ranges into `MT7 node ID == controller index`. A live f03e
walker produced 19 renderer-consumed matrices distributed as 7/1/1/5/5 across
the five slots. Three audited pedestrian families used the same set of
controller-relative output offsets, while their runtime model/render ordering
differed. This proves a shared native solver layout plus model-specific render
binding. It does not prove that a render-record ordinal is a bone index.

The shared output-offset set observed in those three families was:

| Solver slot | Renderer-consumed controller-relative matrix offsets |
| ---: | --- |
| 0 | `+0x3e0`, `+0x620`, `+0x660`, `+0x760`, `+0xb10`, `+0xb50`, `+0xc50` |
| 1 | `+0x1168` |
| 2 | `+0x1508` |
| 3 | `+0x1690`, `+0x18c8`, `+0x1908`, `+0x1980`, `+0x1a80` |
| 4 | `+0x1c10`, `+0x1e48`, `+0x1e88`, `+0x1f00`, `+0x2000` |

Retain this as a cross-family hypothesis until additional controller classes
have been audited; the extractor discovers and reports the live set rather
than requiring these offsets.

Start with a settled full-RAM capture and discover controllers rather than
copying a heap address:

```bash
node tools/actors/extract_shenmue2_runtime_controller_bindings.js \
  captures/pvr/CAPTURE/ram.bin --motion-id 0xf03e \
  --out .disc-work/s2-f03e-runtime-bindings.json
```

The extractor validates the five motion slots and affine root matrix, follows
MDC7 binding pointers into the adjacent compact controller, and labels every
bound matrix with its owning solver slot. MDC7 occurrences may be model-node
records or embedded geometry/render records. Treat its reported record order as
a comparison join only, not a one-record-per-bone skeleton.

Once the controller base has been rediscovered in the state that will be
traced, restart Flycast in interpreter mode. This is the successful pattern
used for the f03e controller at capture-local base `0x8c7e66e8`:

```bash
mkdir -p captures/analysis
LD_LIBRARY_PATH="$PWD/.disc-work/flycast-runtime/local-lib" \
FLYCAST_FORCE_INTERPRETER=1 \
FLYCAST_SH4_WRITE_TRACE_START=0x8c7e66e8 \
FLYCAST_SH4_WRITE_TRACE_END=0x8c7e8b28 \
FLYCAST_SH4_WRITE_TRACE_PC_START=0x8c040000 \
FLYCAST_SH4_WRITE_TRACE_PC_END=0x8c1e1000 \
FLYCAST_SH4_WRITE_TRACE_LIMIT=250000 \
FLYCAST_SH4_WRITE_TRACE_OUTPUT="$PWD/captures/analysis/s2-controller-write.csv" \
FLYCAST_SH4_FPU_WRITE_TRACE_START=0x8c7e66e8 \
FLYCAST_SH4_FPU_WRITE_TRACE_END=0x8c7e8b28 \
FLYCAST_SH4_FPU_WRITE_TRACE_PC_START=0x8c040000 \
FLYCAST_SH4_FPU_WRITE_TRACE_PC_END=0x8c1e1000 \
FLYCAST_SH4_FPU_WRITE_TRACE_LIMIT=250000 \
FLYCAST_SH4_FPU_WRITE_TRACE_OUTPUT="$PWD/captures/analysis/s2-controller-write-fpu.csv" \
SHENMUE_CUE="$PWD/.disc-work/shenmue2-disc1-image/Shenmue II (Europe) (En,Fr,De,Es) (Disc 1).cue" \
tools/emulator/run_flycast_pvr_capture.sh 1
```

All addresses in that example are capture- and executable-revision-specific.
The important reusable choices are the controller-relative address range, both
general and FPU hooks, and a PC range wide enough to include the low-level
matrix helpers. An earlier `0x8c1c0000..0x8c1e1000` PC filter captured curve
working fields but missed final matrix stores performed around `0x8c04f320`.
The wider filter showed `0x8c04f320` copying all 19 post-solver matrices and
the return address (`PR`) identifying each owning solver call site.

After Flycast boots, load the displayed state slot using its zero-based Lua
index and allow normal gameplay to run long enough to include several motion
frames:

```bash
# Load displayed slot 1/internal index 0, with no held buttons.
tools/emulator/request_input_pulse.sh 1 0 0 0
```

Re-run the binding extractor against a synchronized capture after every state
load or restart. The known controller base above is evidence for one run, not a
stable Shenmue II global.

### Function and dispatch traces

The instrumented interpreter also supports opt-in traces for:

```text
FLYCAST_SH4_ENTRY_TRACE_OUTPUT
FLYCAST_SH4_ENTRY_TRACE_PC
FLYCAST_SH4_ENTRY_TRACE_PC2
FLYCAST_SH4_ENTRY_TRACE_PC3
FLYCAST_SH4_ENTRY_TRACE_LIMIT

FLYCAST_SH4_CALL_TRACE_OUTPUT
FLYCAST_SH4_CALL_TRACE_PC_START
FLYCAST_SH4_CALL_TRACE_PC_END
FLYCAST_SH4_CALL_TRACE_LIMIT
FLYCAST_SH4_CALL_TRACE_ALL_C9

FLYCAST_SH4_JSR_TRACE_OUTPUT
FLYCAST_SH4_JSR_TRACE_PC_START
FLYCAST_SH4_JSR_TRACE_PC_END
FLYCAST_SH4_JSR_TRACE_LIMIT
```

Entry traces record cycle time, PC, PR, all registers, and memory near r13,
r14, and r15. Call traces target Shenmue's room-script dispatch pattern.
Indirect-JSR traces expose runtime call targets that static cross-references
cannot see. These hooks are specialized; inspect the corresponding committed
Flycast source before relying on column semantics.

Choose the trace from what is already known:

- use an **address read/write trace** when a runtime field is known but its
  producer or consumer is not;
- use an **entry trace** when a semantic engine entry point is known but the
  event data and owning object are not;
- use a **call trace** when following generated room-script operations;
- use an **indirect-JSR trace** when the caller is known but its runtime target
  is hidden behind a function pointer.

Do not begin with a broad memory trace merely because the final data address is
unknown. For door and drawer audio, tracing the already identified typed-command
dispatcher produced a few meaningful rows where a broad RAM scan would have
produced noise.

### Synchronized semantic-event traces

An entry trace is most useful when its rows are synchronized to a controlled,
visible interaction. The `cycles` column is the SH-4 scheduler time at the
traced instruction; it is a stronger ordering key than host wall-clock time,
audio playback time, or an estimated video frame. Use it to order closely
spaced events, then assign meaning from the exact game state and input phase.

For example, this starts the entry trace used as the anchor for JOMO typed
sound commands:

```bash
mkdir -p captures/analysis
FLYCAST_FORCE_INTERPRETER=1 \
FLYCAST_SH4_ENTRY_TRACE_PC=0x0c17a91c \
FLYCAST_SH4_ENTRY_TRACE_LIMIT=1000 \
FLYCAST_SH4_ENTRY_TRACE_OUTPUT="$PWD/captures/analysis/jomo-dispatch.csv" \
tools/emulator/run_flycast_pvr_capture.sh 1
```

The PC is revision-specific. Recover or verify it against the executable being
run rather than copying it to a different game revision.

A reliable event experiment is:

1. Prepare a save state immediately before the interaction, with the target
   already in focus when possible.
2. Identify the narrowest semantic entry point statically, such as a typed
   command dispatcher, fighter action interpreter, or sound-object updater.
3. Restart Flycast in interpreter mode with the entry trace configured before
   launch. Load the state only after the emulator has booted; allow the normal
   post-load settling interval before sending input.
4. Perform a scripted input sequence and retain the exact visible state at each
   input: for example `closed -> opening -> open -> closing -> closed`.
5. Normalize the small set of relevant trace rows, preserving cycle, PC, PR,
   command/value registers, and any pointed-to words needed to decode them.
6. Repeat the complete cycle. A second opening after one closing distinguishes
   an open/close pair from unrelated one-shot events much more convincingly
   than one observation.
7. If the event came from a table or controller, make a second narrowly targeted
   trace at the producer/consumer. Prove the row index, column, object base, and
   resulting value rather than inferring them from adjacency.

The JOMO door investigation is the reference pattern. Three dispatcher entries
proved `AB02:2` at opening, `AB02:3` at closing, and `AB02:2` at the next
opening. A separate controller trace proved that the selected model/audio row
read columns 2 and 3 for those commands. The JOMO drawer experiment similarly
separated opening start, closing start, and closing impact by scheduler cycle.
See `docs/research/shenmue1/native-world-audio.md` and the compact evidence CSVs it names.

Save-state reloads make the *gameplay state* repeatable, but do not make raw
heap addresses portable evidence. Re-resolve and sanity-check actor, TASK,
controller, and context pointers after every state load and every emulator
restart. Prefer structure-relative offsets and source-table indices in the
retained result. A trace row whose pointers do not fall in expected RAM or whose
object tag/model no longer matches should be rejected, not reinterpreted.

Trace narrowly. Broad RAM read traces can produce hundreds of megabytes in
seconds and reduce the emulator to unusable speed. A good sequence is:

1. identify one field with before/after capture or region recording;
2. trace only its 4–64-byte address range;
3. use the observed PC as a tighter filter on the next run;
4. trace the function entry/indirect calls only after the writer is known;
5. stop as soon as the relevant event finishes.

## GDB and Ghidra

The Flycast build has `ENABLE_GDB_SERVER=ON`. Flycast's Debug settings can
enable its GDB server, select the port, and optionally wait for a connection.
Connecting disables the dynarec and is expensive. Prefer the CSV trace hooks
for a known address; use GDB when interactive breakpoints, watchpoints,
register inspection, or single-stepping are actually needed.

### Isolated read-only GDB validation

Use a separate validation profile for debugger-assisted checks. Copy the
required save state and VMU files into that profile, disable Flycast autosave,
and refuse to overwrite a differing copy. This prevents a read-only research
session from quietly changing the normal emulator profile or its evidence
inputs. The dialogue-event tooling uses this pattern in
`tools/emulator/run_dialogue_emulator_validation.sh`; its Lua control bridge accepts only
ordinary controller input, state loads, and a clean emulator-exit request.

Launch with `Debug.GDBWaitForConnection=no`. In this Flycast build, startup
wait can leave the guest stranded after a bounded debugger session detaches.
Repeated detach/reattach cycles are also unreliable, so keep one observation
connection open across a natural gameplay route when practical. Always stop
the emulator cleanly when the bounded observation is complete, and verify that
no second validation instance remains before starting another experiment.
The remote handshake is an explicit `?` status query followed by `c`; do not
wait for an unsolicited stop packet when attaching.

For read-only validation:

1. Visually or structurally confirm the loaded area, story state, time, and
   nearby objects; do not trust an old slot description by itself.
2. Record the isolated profile, disc, displayed and zero-based state indices,
   emulator/executable/state/VMU SHA-256 values, GDB port, guest address,
   access width, and raw value.
3. Read guest memory or registers only. Do not write RAM, change registers,
   redirect the PC, or invoke a native handler artificially.
4. Drive any behavioral route with ordinary controller input and preserve the
   exact bounded input sequence.
5. Distinguish a live observation from a semantic conclusion. For example, a
   byte observed as zero in one D000 state corroborates that state and address;
   it does not prove the byte is always zero or assign a gameplay name to it.
6. Join the observation back to static executable or room-script ownership
   before implementing behavior. Preserve negative route evidence as bounded
   absence, never as proof that an operation cannot occur.

Keep three claims separate in retained evidence:

- matching a live operation table or executable byte range proves **live-image
  identity**, not execution of an authored route;
- a naturally reached breakpoint with captured arguments, before/after words,
  and result is **behavioral evidence** for that bounded state;
- no breakpoint hit during a documented route is **negative route evidence**,
  not proof that the handler is unused generally.

Dreamcast RAM data can be read through either the `0x0c...` P0 or `0x8c...` P1
alias after normalizing the address. Software breakpoints are different:
Flycast keys them by the exact executing PC, and Shenmue's RAM code normally
executes through the cached P1 `0x8c...` mirror even when static evidence names
the P0 `0x0c...` address. Arm the P1 mirror, but report both the static P0
address and armed P1 address in retained evidence. Verify that both aliases
read the same bytes before treating them as mirrors. A P0 breakpoint on code
executing through P1 can freeze at an aliased trap without yielding a usable
handler observation.

This GDB server also needs explicit breakpoint step-over handling. When a
breakpoint stops, remove that exact P1 breakpoint, single-step once, discard
any duplicate stop packet, then reinstall it before continuing. Otherwise a
trace can repeatedly capture the same instruction and falsely look like a
sequence of native calls. A continue request may return its positive ACK
before the stop packet, or a fast stop may arrive first; the client must accept
both orderings. `tools/emulator/flycast_gdb_remote.py` implements these
protocol details. Resume the guest or request a clean emulator exit in a
`finally` path so a failed observer does not leave the process paused with
breakpoints installed.

For Shenmue II animation callbacks, use the repository's bounded wrapper:

```bash
tools/emulator/run_shenmue2_pelvis_callback_capture.sh
```

It copies displayed save slot 2 into an isolated profile by default, disables
autosave and the dynarec, opens GDB on port 3264, observes natural
`0x8c0e7f00` executions, and exits the isolated emulator cleanly. It never
attaches to or changes the normal interactive Flycast process. The observer
records the exact actor/controller binding, callback context, all three
installed curve descriptors, blend/mode branch, actor root, and the same-cycle
`+0x230` primary matrix. Context word 3 is retained as the four-vector
direction/up structure consumed by `FUN_8c1d53a0`, together with the live
frame/end-frame globals. Fixed-axis observations keep it as discovery data; a
strict mode-1 fixture requires all four finite vectors and a positive end
frame. Override the state, count, controller, or output with
the `FLYCAST_S2_VALIDATION_*` environment variables in the runner. The actor
resolver requires the native ordinary-record invariant: the exact four-byte
actor code and equal controller pointers at `+0x08/+0x24`.

The research Flycast can additionally use its opt-in
`FLYCAST_SH4_ENTRY_TRACE_*` variables to record exact PCs with general, FR, and
XF registers. The three paired PC/PR filters are important: matrix helpers are
shared by much of the engine, so filtering only their entry addresses fills a
trace before the animation callback executes. For the pelvis callback, useful
natural points are callback entry `0x8c0e7f00`, second evaluator return
`0x8c0e7fbe`, and primary-save continuation `0x8c1d1932`. Repeated rows at an
armed software breakpoint are debugger trap/reinsert observations and must be
deduplicated by cycle, PC, and controller before analysis.

### Naturally reached handler validation

When static analysis has already identified an operation handler, validate it
by observing the game reach that handler through ordinary play. Do not redirect
the PC, synthesize its argument array, or call it from the debugger. A useful
bounded observation records:

1. the exact authored route and ordinary controller inputs that led to the hit;
2. the handler's static P0 address and armed P1 breakpoint address;
3. argument registers and every pointed-to argument word at entry;
4. relevant object, controller, or result-slot words before execution;
5. the return value and the same words after the natural return; and
6. the executable and room-data offsets that statically own the handler and
   call site.

For a function with several outcomes, obtain both a true and false observation
when natural gameplay permits it. The spatial-bounds validation evidence is the
reference: two naturally reached calls retain the actor position, both authored
vectors, normalized X/Z bounds, result-slot address, and native result
representation. It does not generalize the unobserved optional-translation
route.

Break at the narrowest points needed to capture the contract. Entry plus a
known return/result-writer is usually more informative than single-stepping the
whole function. If a helper consumes a temporary flag before its epilogue,
capture both the helper-return boundary and the epilogue; a final-state-only
sample can otherwise hide the ordering that the browser runtime must preserve.

### Temporal read-only sampling

Some questions concern a value changing under the normal scheduler rather than
one handler invocation. Keep one GDB connection open, read a small proven
region, resume natural guest execution for a bounded interval, stop, and read
again. Preserve the raw series and sampling method. This established, for
example, that a live MOMT base advanced and wrapped while its control word
remained constant.

Debugger sampling is not automatically VBlank- or frame-exact. Unless each
sample is anchored to an instrumented cycle, VBlank callback, or known
breakpoint, use it to prove observed change/stability and ordering only—not an
exact update rate. Recover the update formula and ownership statically or with
a narrow writer trace before implementing it.

Likewise, two live representations of a position can differ slightly because
they were copied at different scheduler phases. Retain both raw float words and
their numeric delta. Do not require byte equality or replace one with the other
until static ownership proves whether the field is a snapshot, target, or
authoritative actor transform.

The existing static-analysis projects are:

```text
.disc-work/ghidra-sh4/ShenmueSH4.gpr       Shenmue I
.disc-work/ghidra-s2-sh4/Shenmue2SH4.gpr  Shenmue II Dreamcast
```

Each analyzes its game's `1ST_READ.BIN` as little-endian SH-4 at its runtime
address. Do not use Shenmue I function addresses, symbols, or global-pointer
chains against Shenmue II merely because both executables use the same engine
lineage. The scripts in `tools/ghidra/` export functions, listings, pointer
references, function tables, symbols, and memory ranges. Notable
general-purpose scripts include:

```text
ExportFunctionsAtAddresses.java
ExportFunctionPointerTable.java
ExportPointerValueReferenceFunctions.java
ExportLiteralValueReferences.java
ExportListingRange.java
ExportMemoryRange.java
```

Script arguments differ; read the selected script's `getScriptArgs()` handling
before invoking it. Keep generated exports under the matching project's
`exports/` directory, then distill stable evidence into the repo. The Shenmue
II compact-motion work has used `.disc-work/ghidra-s2-sh4/ExportListingRange.java`
and the local JDK at `.disc-work/jdk21`; these are local research inputs and are
not production dependencies.

Live and static analysis answer different questions:

- RAM says which object/controller/value is active now;
- an address trace says which instruction changed or consumed it;
- Ghidra explains the surrounding function and pointer/data flow;
- disc archives and room bytecode identify the authored data behind it;
- multiple states prove whether the rule generalizes.

Do not implement a visual heuristic when this chain can recover the native
rule.

## Recommended investigation recipes

### Unknown object placement

1. Enter the target area and capture RAM.
2. Run `extract_runtime_placements.js` for the model or catalog prefix.
3. Follow TASK/HMDL/HRCM pointers; do not match by nearby bytes alone.
4. Capture alternate time/story states only for conditional objects.
5. Build a manifest with source hashes and capture provenance.

Reference: `docs/research/shenmue1/runtime-object-placement.md`.

### Unknown object animation

1. Make a save state immediately before interaction.
2. Identify the object's TASK/HMDL memory region.
3. Use the generic one-shot recorder and deterministic A input.
4. Find changing words and decode them as transforms/state.
5. FPU/general-write trace the exact changing addresses.
6. Map the writer back to room bytecode or authored animation data.

Reference: `docs/research/shenmue1/runtime-object-animation.md`.

### NPC skeleton, motion, or controller issue

For Shenmue I:

1. Capture the actor while the bad motion is active.
2. Run `extract_npc_runtime_controllers.js ACTOR_CODE`.
3. Preserve the selected runtime model, source family, target family, control
   records, matrix pointers, motion request, and frame.
4. Compare against the model's authored IMGM family and registered motion-bank
   range; never substitute Ryo's skeleton because it looks close.
5. Use an address/read trace only when the constructor/selector rule remains
   unknown.

For Shenmue II:

1. Capture the moving actor and run
   `extract_shenmue2_runtime_controller_bindings.js` on `ram.bin`.
2. Preserve the compact-controller base, five current motion IDs, root matrix,
   renderer-consumed matrix offsets, solver-slot labels, and runtime model
   record order.
3. Repeat with multiple model families. Separate shared solver output offsets
   from model-specific MDC7 binding order.
4. Trace the whole `0x2440` controller allocation with both general and FPU
   writes, using a PC range that includes `0x8c04...` matrix helpers as well as
   the `0x8c1c...`/`0x8c1d...` solver code.
5. Join writer `PR` values to the Shenmue II Ghidra project and compact `.MOT`
   source. Do not recreate a flat 22-node controller from MT7 preorder or node
   IDs.

Reference: the NPC sections of `tools/README.md` and
`docs/research/shenmue1/file-formats.md`, plus the Shenmue II controller-trace section above.

### Door or map transition

1. Record a normal click/transition when possible.
2. Watch the current transition record and capture when it changes.
3. Verify area, scene, entry, mode, and trigger together.
4. Join the observed tuple to the static transition catalog.
5. Keep “destination tuple proven” separate from “this physical door selects
   it”; the latter may require a click capture or exact controller binding.

Reference: `docs/research/shenmue1/map-transition-trace.md`.

### Native sound for an interaction

The emulator should establish **when and why** a native sound command is
issued. Static sound-bank parsing should establish **which sample and playback
parameters** that command selects. Neither half is sufficient by itself.

1. Find the interaction's room operation or controller statically. Operation
   `0x006c` and the typed-command dispatcher are common anchors, but do not
   assume every audio route uses them.
2. Entry-trace the narrow dispatcher or low-level sound-object update while
   replaying a deterministic interaction from a save state.
3. Record a complete state cycle and align each command to a visible phase by
   scheduler cycle. Retain quiet phases and missing calls as negative evidence.
4. Preserve the full typed command in little-endian form. A byte sequence is
   not a globally unique sound ID.
5. Prove the active location, common, AUTH, vehicle, or other sound bank from
   the room's load/resource path. Resolve the command only inside the proven
   bank or an independently proven shared bank.
6. Follow the bank's command/track record through playback descriptor, sample,
   native rate, gain, and loop span. Package the decoded asset without replacing
   these source identifiers.
7. If the event selects a model-owned table row, trace that selector/dataflow
   separately. Nearby literals, adjacent commands, and plausible auditioning
   are useful leads, not semantic proof.

Command and bank form the identity. The same command bytes can select different
samples in different banks, while a zero-volume command can be an authored stop
mate rather than a missing sound. Preserve unresolved and ambiguous joins
instead of choosing the nicest-sounding candidate. `docs/research/shenmue1/native-world-audio.md`
contains the proven JOMO door/drawer and forklift examples.

### Combat action, hit window, or damage field

Combat fields change on action-VM ticks and animation frames, so a single
before/after capture is often too coarse:

1. Reload a pre-fight save state and resolve both fighter instances anew.
2. Record a small region around each fighter on every VBlank while issuing one
   known attack. Preserve fighter bases, offsets, input, geometry, and whether
   the attack visibly connected.
3. Look for fields that remain stable throughout the action or change at a
   plausible phase boundary. Decode packed halfwords both ways before naming
   them.
4. Repeat the same move from a connecting and non-connecting geometry. A miss
   is a valuable counterexample and must not be assigned inferred damage.
5. Address-trace the candidate field to its writer/reader, then use Ghidra to
   connect the instruction to the action VM or motion-metadata handler.
6. Test inclusivity at both boundaries. The recovered Ryo hit windows are
   inclusive frame ranges; silently converting them to half-open ranges changes
   gameplay.

The retained reference is `tools/evidence/native-hit-window-trace.json`,
described in `docs/research/shenmue1/martial-arts-combat.md`. It proves hit-window offsets
and one observed damage result while deliberately leaving a missed kick's
damage unresolved.

### Discovering an unknown field

1. Start from two synchronized captures with one controlled difference.
2. Narrow candidate addresses by data type and expected change timing.
3. Repeat from the same state to reject noise.
4. Trace reads/writes to the narrow candidate range.
5. Use PR/registers to recover the object base and caller.
6. Export the containing function and pointer references from Ghidra.
7. Validate in a second scene/actor before declaring a general structure
   offset.

## Evidence and reproducibility standard

Every checked-in conclusion derived from the emulator should retain:

- game region/revision and disc;
- emulator binary, disc image, executable, save-state, and relevant VMU hashes;
- isolated profile, autosave setting, debugger port, and whether guest writes
  or artificial handler calls occurred;
- area and game state/time;
- save-state identity and whether it was reloaded;
- exact natural route and bounded controller-input sequence;
- RAM/capture path and SHA-256;
- exact command and environment variables;
- runtime addresses **and** normalized offsets;
- raw arguments, before/after words, result slots, and return values;
- decoding method and units;
- instruction PC/caller when traced;
- matching static file, offset, and hash when available;
- what is exact, inferred, topology-derived, or still unknown.

Prefer a small JSON evidence file plus a deterministic extractor over a prose
claim that cannot be regenerated. Preserve counterexamples. If a field works
for one actor or room only, label it accordingly.

## Safety and common failure modes

- **Wrong process:** `request_pvr_capture.sh` selects the newest matching
  Shenmue Flycast process. Avoid running multiple instrumented instances.
- **Wrong game executable:** Shenmue I and II use separate save states, static
  projects, addresses, controller formats, and executable revisions. Record the
  cue and game ID before applying any address-derived conclusion.
- **Wrong disc slot:** save states are per disc, and Lua indices are zero-based.
- **Stale address:** heap/TASK/controller/context pointers may move after any
  room or state load. Resolve them again.
- **Wrong alias:** normalize `0x8c...` and `0x0c...` pointers before indexing a
  16 MiB dump.
- **Wrong endian:** area IDs, pointers, floats, and integer fields are
  little-endian.
- **Trigger written first:** write payload fields first and trigger last.
- **Game overwrites edit:** use a very small repeated-write window only when
  necessary; persistent brute-force writes can hide the real rule.
- **Trace is empty:** tracing must use interpreter mode, environment variables
  must exist before launch, and ranges are half-open.
- **S2 matrix trace is incomplete:** compact-curve work occurs in the
  `0x8c1c...`/`0x8c1d...` region, but final matrices are copied by lower helpers
  around `0x8c04f320`. A solver-only PC filter can silently omit the values the
  renderer actually consumes.
- **S2 MDC7 record mistaken for a bone:** runtime MDC7 occurrences include both
  model-node and geometry/render records. Record order and MT7 preorder are not
  compact-controller indices.
- **Trace is enormous:** narrow both address and PC ranges and set a low limit.
- **Right event, wrong meaning:** one command occurrence does not prove phase
  semantics. Record a full open/close/open or start/stop/start cycle and align
  rows by scheduler cycle.
- **Right command, wrong sound:** command bytes are bank-scoped. Prove the
  active bank and its playback/sample join before assigning or exporting audio.
- **Audition mistaken for a mapping:** acoustic similarity can prioritize the
  next experiment, but it cannot replace a dispatcher/controller trace or
  authored dataflow.
- **Stale pointer after state reload:** deterministic gameplay state does not
  guarantee reusable heap addresses. Re-resolve bases after every reload.
- **Host timing mistaken for game timing:** use trace `cycles` and controlled
  input phases, not when the host speaker or display appeared to react.
- **Debugger samples mistaken for exact ticks:** an unanchored read/resume/read
  series proves bounded change or stability, not a per-frame update rate.
- **Copied position mistaken for canonical position:** scheduler-phase copies
  can differ by small float deltas. Preserve both words and prove ownership.
- **Lua request appears ignored:** polling takes up to 30 VBlanks, another
  recorder may be active, or the helper's hard-coded scene addresses are stale.
- **Capture is not a save state:** `ram.bin` cannot be loaded as a Flycast state.
- **Visual match mistaken for proof:** validate pointers, script/data ownership,
  and at least one independent state.
- **Dirty Flycast checkout:** do not reset it; inspect and preserve experimental
  patches before rebuilding.

## Primary reference files

Start with these rather than searching the entire repository:

```text
tools/emulator/run_flycast_pvr_capture.sh
tools/emulator/ryo_hallway_probe.lua
tools/emulator/request_pvr_capture.sh
tools/emulator/request_input_pulse.sh
tools/emulator/request_memory_writes.sh
tools/emulator/request_object_once_recording.sh
tools/emulator/request_ryo_matrix_recording.sh
tools/emulator/inspect_pvr_capture.js
tools/worlds/extract_runtime_placements.js
tools/worlds/extract_tagged_runtime_objects.js
tools/actors/extract_npc_runtime_controllers.js
tools/actors/extract_shenmue2_runtime_controller_bindings.js
docs/research/shenmue1/runtime-object-placement.md
docs/research/shenmue1/runtime-object-animation.md
docs/research/shenmue1/map-transition-trace.md
docs/research/shenmue1/d000-object-placement.md
docs/research/shenmue1/martial-arts-combat.md
tools/README.md
docs/research/shenmue1/file-formats.md
```

When adding a new capability, update this guide, keep the generic Lua bridge
small, put domain-specific analysis in its own tool, and document which parts
are reusable versus tied to one save state.

## Runtime PowerVR Capture

The local instrumented Flycast checkout at `../flycast-pvr-capture` captures the original runtime data sent through the emulated Dreamcast Tile Accelerator. This is independent ground truth for checking the static MT5 extractor. Each capture contains:

- Raw TA command buffers for every render pass
- Decoded positions, UVs, indices, polygon lists, ordering, and render-state words
- Texture VRAM addresses, dimensions, formats, and the complete 8 MiB VRAM image
- The complete PVR register image, including palette RAM

### run_flycast_pvr_capture.sh
Starts Disc 1 or Disc 2 with Vulkan and an isolated profile.
- **Usage**: `tools/emulator/run_flycast_pvr_capture.sh 1`
- **Usage**: `tools/emulator/run_flycast_pvr_capture.sh 2`
- Press **F12** on the desired frame to save the normal screenshot and the PowerVR capture together.

### request_pvr_capture.sh
Requests the next non-render-to-texture frame from a running instrumented Flycast via `SIGUSR1`. This avoids keyboard-focus issues.
- **Usage**: `tools/emulator/request_pvr_capture.sh`

### extract_flycast_savestate_ram.mjs
Decompresses a `FLYSAVE1`/`#RZIPv1#` state and extracts its serialized 16 MiB
Dreamcast RAM without executing Flycast. A known synchronized RAM capture is
required to identify the RAM block from multiple static executable windows.
Offline state RAM is useful for discovery but is not guaranteed to stop at a
completed game frame.
- **Usage**: `node tools/emulator/extract_flycast_savestate_ram.mjs --state GAME.state --reference-ram captures/pvr/KNOWN/ram.bin --out captures/pvr/SAVE/ram.bin`

### inspect_pvr_capture.js
Validates capture file sizes, vertex/index references, polygon ranges, and texture usage, then emits a deterministic JSON summary. With no argument it selects the newest capture.
- **Usage**: `node tools/emulator/inspect_pvr_capture.js`
- **Usage**: `node tools/emulator/inspect_pvr_capture.js captures/pvr/20260722-222007-frame-256`

### verify_ryo_head_runtime.js
Performs the nonvisual Ryo-specific check against an instrumented Flycast
capture. It proves that the extracted 256x128 ARGB1555 payload is
byte-identical to VRAM, decodes the runtime TSP clamp/flip/alpha state, and
asserts the browser loader's native-UV, clamp-to-edge, alpha-test, and
Dreamcast `TWIDDLED_RECT` Morton-axis contract.
- **Usage**: `node tools/animation/verify_ryo_head_runtime.js captures/pvr/20260722-223647-frame-27245`

### compare_ryo_runtime_uv.js
Parses the raw 32-byte Tile Accelerator commands before Flycast clips or sorts
them, isolates strips using Ryo's captured atlas address, aligns those strips
against candidate MT5 body/FACE resources, and exhaustively ranks UV basis,
rotation, reflection, and axis-swap hypotheses. The close-up capture selects
native/identity FACE UVs: 369 of 429 aligned corners are byte-quantized exact
matches, with zero median error.
- **Usage**: `node tools/animation/compare_ryo_runtime_uv.js captures/pvr/20260722-223647-frame-27245 .disc-work/scene01-models/YKB_F.MT5`
- **All variants**: `node tools/animation/compare_ryo_runtime_uv.js captures/pvr/20260722-223647-frame-27245 .disc-work/scene01-models/*.MT5`
