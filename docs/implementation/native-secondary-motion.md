# Native MT5 Secondary Motion

## Scope

Shenmue does not store every moving character surface in MOTN body-animation
channels. Hair, garment pieces, and some attachments can instead be authored as
special MT5 hierarchy nodes and evaluated by the native `OSAG` subsystem after
the ordinary body pose.

The browser implementation follows that ownership boundary. It is a reusable
character-presentation subsystem, not an OP00 timeline correction:

- `play/characters/NativeSecondaryMotionProfiles.js` owns model-family tuning
  and the set of characterized native node types.
- `play/characters/NativeSecondaryMotionRuntime.js` discovers special MT5
  chains, keeps their persistent solver state, and produces node-addressed
  render matrices.
- `play/characters/NativeArticulatedSurfaceMotion.js` translates the cyclic
  type-`0x81` angular records used by sleeves and other constrained surfaces.
- `play/characters/NativeSecondaryMotionCollision.js` reconstructs the
  animated native body proxy and applies the native ordered collision
  projection.
- `play/data/native-secondary-motion-collision.web.js` is generated metadata;
  it is never a duplicate model asset.
- `play/events/NativeAseqPresentationRuntime.js` establishes update order and
  lifecycle ownership.
- `src/Mt5Loader.js` applies already-resolved node matrices to either the GPU
  or CPU character renderer. It contains no cutscene or character policy.

`play.js` only constructs the higher-level cutscene director. It does not know
about Lan Di, ponytails, OSAG node types, or solver coefficients.

## Evidence

The current vertical slice is backed by these native facts:

- The executable contains the exact `OSAG` record tag and an actor-linked
  OSAG list. Operation `0x0132` mutates its node state and actor control flag;
  see `tools/evidence/actor-osag-operation-evidence.json`.
- The OSAG update dispatcher at `0x0c132a58` dispatches special MT5 node types
  `0x78` through `0x8d` to distinct handlers.
- Type `0x78` reaches the articulated-chain handler at `0x0c132e14`.
- That handler has a model-family-specific `KOK` path.
- `KOK_M.MT5`/`KOK_M.CHRM` contains one continuous fourteen-node `0x78`
  hierarchy beneath its head. Every native record owns a rendered node origin
  and a separate following endpoint, so fourteen matrices require fifteen
  solver points. Each child position supplies the source length for its
  preceding record; the tail reuses its own source vector.
- OP00's KOK body motions use ordinary humanoid controller channels and do not
  contain independent curves for those fourteen nodes.
- `FUN_0c132058` builds a 28-point humanoid collision descriptor from an
  executable-owned controller-type table and the model's four-byte-per-point
  profile. The KOK profile is at `0x0c297f98`; signed XYZ/radius bytes are
  scaled by the executable's `0.01` literal.
- The live KOK actor selects that exact profile. A read-only Flycast trace
  confirms that each point is transformed by the same complete MOMT
  controller array retained by `ScheduledActorMotionRuntime`.
- `FUN_0c094934` tests twelve authored variable-radius spans in a fixed order.
  It calls `FUN_0c094b78` for successive polyline projection and
  `FUN_0c094b34` for the OSAG-node-radius correction. These are not independent
  capsules or bounds inferred from rendered polygons.
- The node radius is the length of the special MT5 node's authored local
  vector multiplied by the KOK handler's mode coefficient. The coefficient
  values and branches come from `FUN_0c132e14`, not visual tuning. The same
  value is the record's solved segment length; constraining to the shorter raw
  MT5 spacing while colliding with the scaled radius makes the two native
  operations fight.
- The KOK path retains `0.6` of the prior endpoint displacement. Its per-frame
  downward step is `0.025` for modes 0/1 and 4+, `0.035` for mode 2, and
  `0.03` for mode 3. These constants are not a positional return spring.
- Collision clearance is also mode-owned: KOK mode zero uses `0.015`; the
  remaining chain modes use `0.01`. Runtime parameters therefore stay
  per-node rather than being flattened into an actor-wide approximation.
- Node type `0x81` is a separate articulated-surface handler at
  `FUN_0c135bec`, not another entry into the type-`0x78` body-collision
  dispatcher. `MGR_M` contains two four-record `0x81` chains rooted beneath
  the arm hierarchies; these are Shenhua's sleeves, not her ponytail.
- The type-`0x81` helper closure contains no reference to the type-`0x78`
  collision routine at `0x0c094934`. A live OP02 trace likewise observed
  seven persistent OSAG records across modes 0–3 without a body-collision
  dispatch. Generating guessed forearm capsules for these records would
  therefore contradict the original runtime.
- The executable instead proves a cyclic angular surface response: an
  activation threshold of `0.000001`, owner-motion scale `30`, MGR angular
  scales `2` and `3`, amplitude approach step `0.2`, phase steps `-15°` and
  `+10°`, and fixed-turn scale `8192`. The live records settle both angular
  amplitudes at `1.5°` with `-1.5°` biases, producing a constrained
  `-3°..0°` bend on each axis rather than a free cloth endpoint.

This proves that Lan Di's hair is procedural secondary motion rather than an
omitted, hand-keyed AUTH or MOTN clip.

## Runtime contract

At each native 30 Hz presentation frame:

1. AUTH actor placement is applied.
2. The ordinary body MOTN pose is applied.
3. Detailed face and hand presentation is applied.
4. Secondary motion reads the resulting body/head matrices.
5. The solver advances persistent world-space endpoints.
6. Records are resolved root-to-tip. Each mode-scaled segment constraint is
   followed by its endpoint collision, so a corrected endpoint immediately
   becomes the following record's origin.
7. The current animated 28-point body descriptor is built from controller
   matrices. Every special point is projected through the twelve native spans
   in authored order, including native clearance and node-radius correction.
8. Only the special nodes are replaced in a complete node-addressed matrix
   map, which is uploaded once to the character skeleton.
9. The camera pose is applied.

World-space integration is intentional. It lets actor translation and rotation
produce inertia instead of reacting only to local head animation. Results are
converted back to MT5 source space before being sent to the character renderer.
Native contact correction writes the current OSAG endpoint at record offset
`+0x68`; the segment origin at `+0x50` remains unchanged and participates in
the next inertia calculation. `FUN_0c094b34` receives that origin as its first
vector and the projected endpoint as its second, then writes
`origin + normalize(projected surface - origin) * segment length`.
The operand roles matter, particularly where several ordered torso spans
overlap.
Large discontinuities reset the chain to its authored pose, preventing a seek,
teleport, or unrelated scene placement from pulling hair across the map.

The state survives normal AUTH activity boundaries, so camera cuts do not
restart the simulation. A program reset or seek rebuild clears it
deterministically.
Releasing presentation restores the ordinary body matrices, preventing the
last cinematic hair pose from leaking into gameplay.

## Current fidelity boundary

Node type `0x78` has the complete executable-backed collision path. Type
`0x81` now has a separate cyclic articulated-surface solver: it approaches the
captured amplitudes, advances both native phase channels, adds their native
bias, quantizes through the fixed-turn representation, and resolves every
surface segment from its parent. It never enters the type-`0x78` collision
path. This keeps Shenhua's sleeves attached to their authored arm hierarchy
without fabricated forearm bubbles. The remaining type-`0x81` fidelity gap is
the handler's model-specific owner-motion modulation before those shared
oscillator helpers; the OP02 steady-wind state is backed by the captured MGR
records. Type `0x79` remains a preliminary reconstruction rather than a
field-for-field translation.

The KOK collision path is a direct high-level translation of its SH-4 builder,
span dispatcher, projection primitive, and correction primitive. Its metadata
is regenerated by:

```sh
python3 -m tools.animation.extract_secondary_motion_collision_evidence
```

The extractor requires the supported `1ST_READ.BIN` SHA-256, verifies native
call targets and literals, and hash-pins every translated code range. For a
different executable revision or a newly supported model family, use
`tools/emulator/capture_shenmue1_secondary_motion_collision.py` as a read-only runtime
cross-check and then extend the executable-backed profile extraction.

The complete field-by-field motion integrator before collision has not yet
been proven. The current implementation reconstructs its observed structure:
persistent inertia, the executable-backed KOK per-mode downward steps and
segment scales, length constraints, angular constraints, and discontinuity
reset. Coefficient changes belong in the model-family profile and require
native capture or further executable evidence; they must never be introduced
as cutscene-ID conditionals.

The type-`0x81` classification and constants are regenerated independently:

```sh
python3 -m tools.animation.extract_secondary_motion_handler_evidence
```

That extractor hash-pins the supported executable, handler, and complete
helper closure, verifies the MGR branch and literals, and proves that the
type-`0x78` collision target is absent. The companion read-only runtime tool,
`tools/emulator/capture_shenmue1_secondary_motion_runtime.py`, records the actual SH-4
argument contract: `r4` is the persistent OSAG record, `r5` is the special MT5
render node, `r6` is the runtime mode, and `r7` is the matrix callback/context.

## Adding another native behavior

Before enabling another special node type:

1. Identify its exact OSAG dispatcher target and hash-pin the relevant code.
2. Inventory matching nodes across canonical MT5 character models.
3. Establish whether it is a chain, point attachment, cloth panel, or another
   structure from hierarchy and runtime evidence.
4. Implement a behavior handler selected by node type.
5. Put proven family-specific tuning in the profile resolver using native model
   identity, never actor tag, map ID, or cutscene ID.
6. Test discovery against a canonical model, fixed-step determinism, constraint
   preservation, discontinuity reset, cleanup, and renderer upload.
7. Validate at least one native capture containing substantial source motion.

This extension path allows the same subsystem to serve scripted scenes,
ordinary NPCs, and player models when their presentation loops adopt it.
