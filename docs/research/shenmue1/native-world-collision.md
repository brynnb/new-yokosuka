# Native world collision

This document owns the collision extraction, semantics, and focused runtime
details. See
[World loading and transitions](../../implementation/world-loading-and-transitions.md)
for how collision selection fits the complete `/play` world lifecycle.

## Source

Shenmue I stores horizontal world boundaries in each area's
`MAPINFO.BIN`, under:

```text
COLS
  0000
    COLI
```

Some large areas contain additional numbered fields such as `0001` and
`0003`. The browser catalog preserves every field, but free-roam worlds use
the native main field `0000` unless a world explicitly selects another one.
This prevents upper-floor or alternate-field boundaries from being projected
through every height at once.

`COLI` is not the terrain-height system. Visual MAP geometry remains the
source for floor, slope, and step ray queries. It is no longer treated as a
blanket horizontal blocker when native `COLI` exists.

## Extraction

Run:

```bash
npm run extract:native-world-collisions
```

The extractor reads all three Shenmue I disc trees and writes generated,
area-sharded data beneath:

```text
public/data/native-collisions/
```

Equivalent collision definitions repeated across discs are deduplicated.
Each shard retains its MAPINFO hashes, source paths, numbered fields, record
offsets, native codes, shape types, and exact native coordinates.

Supported authored shapes are:

- type 1: arbitrary segment
- type 2: open connected wall chain
- type 3: circle encoded as radius followed by center X/Z
- type 4: triangular boundary
- type 5: origin plus two edge vectors forming a parallelogram
- type 6: polygon boundary

Browser horizontal coordinates are `[-nativeX, -nativeZ]`, matching the
coordinate conversion proven by the native event-volume query.

## Runtime

`play/world/NativeWorldCollision.js` loads only the active area's shard. It
groups boundaries by numbered field, COLI section, and native record code,
then creates invisible, double-sided Babylon wall geometry. Grouping keeps
the native codes independently addressable for future door/state-controlled
collision changes without creating one mesh per record.

The collision debugger renders these native walls in a dedicated bright
magenta color, distinct from visual terrain and runtime object colliders.

### Terrain height and slope sampling

The player obtains floor height from a downward ray into enabled visual MAP
geometry. Walkability is evaluated from the picked triangle's geometric face
normal, not its interpolated render normals. This distinction matters on
stairs: MT5 meshes smooth vertex normals across horizontal treads and vertical
risers for lighting, so an interpolated normal near the side of a tread can
incorrectly describe a flat surface as a steep slope. Using the geometric face
normal keeps the entire authored tread walkable while preserving the original
smoothed normals for rendering.

### Penetration recovery

Babylon's ellipsoid resolver normally prevents the player from entering a
wall, but a cylinder already overlapping a double-sided boundary can be
treated as colliding in both directions. Native COLI therefore has an explicit
escape rule based on its exact authored 2D segments. If the player is already
inside one or more boundaries, a blocked movement may bypass Babylon's result
only when it increases clearance from every current contact and the player's
center does not cross any contacted segment. The complete swept cylinder is
checked against every active native segment on every movement, including
high-speed movement which ends clear on the opposite side. This prevents both
crossing a second wall and tunnelling completely through the current wall. It
does not turn off a collision mesh, teleport the player, or contain
map-specific positions.

### Player `/stuck` recovery

The chat `/stuck` command is a separate, explicit recovery action. The
controller remembers a short history of grounded positions whose full player
radius clears every active native boundary. If the current cylinder overlaps
a boundary, the command first searches expanding eight-centimetre rings for
the nearest position that has walkable terrain, enough headroom, full radial
clearance, and a path that does not cross another boundary. Candidate order is
biased toward the last known safe position rather than an arbitrary side of
the wall.

If no nearby candidate passes all checks, recovery uses the newest still-valid
position in the current world's safe history. The world's authored spawn is
the final fallback. Successful recovery immediately publishes the corrected
position to multiplayer peers. The command never enables no-clip; production
clients cannot enable the local-development no-clip mode.

## Code 10 stair-flight boundaries

Every extracted code `10` record is a type-1 line segment. Picker-verified
examples consistently place these segments across the ends of stair flights,
not along their blocking side walls. A two-flight, 90-degree staircase in
Yamanose is bounded by four code-10 segments: one at the bottom and top of
each flight, with the second pair rotated 90 degrees. The Hazuki dojo stairs
and other Yamanose stairs use the same paired pattern.

These records therefore represent non-solid stair/elevation handoff
boundaries. Treating them as the same double-sided vertical walls used for
ordinary `COLI` records prevented the player from entering or leaving every
stair flight. The browser now retains code-10 records and their exact metadata
but marks their generated meshes as `stair-boundary` and disables physical
collision on them globally. Visual MAP geometry remains responsible for the
actual stair surface and player height.

Code-10 meshes remain visible in collision debug mode, in cyan rather than
the magenta used for blocking native collision, and remain selectable by the
collision picker. This preserves the authored data for the future robust
step: tracing and reproducing any original stair-entry, stair-exit, animation,
or collision-field handoff performed when these boundaries are crossed.

Numbered fields such as `0000` and `0001` are not treated as ascending and
descending directions. Complete multi-flight staircases can have all their
code-10 boundaries in `0000`, while some identical code-10 segments occur in
both fields with the same coordinates and endpoint order. The fields are
alternate collision sets whose exact selection rules still require an engine
trace.

## Door-controlled records

Native door boundaries use the `100`–`199` COLI code namespace. At runtime,
each placed door is associated with the authored boundary segment at its
captured position. Opening that door disables only its matching segment or
segments. Ordinary boundaries—including nonzero furniture records—remain
active, and an open door elsewhere in the area cannot disable them.

## Known boundary

MJQ's `DJAZ` record at COLI-relative offset `0x2c8` contains the segment that
crosses browser coordinate `(-4.5, -6.324994416)`. This matches the observed
movement stop in MJQ and confirms it is an authored Shenmue boundary rather
than transformed visual geometry.

## Remaining native semantics

Record codes are retained exactly. Code `10` has the evidence-backed
nonblocking stair-boundary treatment described above, and per-door collision
is implemented for the native door-code namespace. Meanings for other
scripted code changes remain unresolved and are not guessed. The authored
main-field boundaries otherwise load in their default blocking state.

## Shenmue II FLDD integration

Shenmue II replaces the Shenmue I `COLS/COLI` segment records with an `FLDD`
field containing indexed quadrilateral faces. The extractor preserves all
four attribute words and all four vertex indices for every face. Runtime code
does not treat that full mesh as a blanket Babylon collider.

Instead, FLDD faces enter the same `/play` behavior model used above:

- visual MT7 MAP geometry remains the terrain-height and slope source;
- predominantly horizontal FLDD faces are retained as nonblocking
  `terrain-surface` reference geometry;
- FLDD faces whose first preserved native word is exactly `10` are retained
  as nonblocking `stair-boundary` geometry;
- short vertical FLDD faces no taller than the controller's 0.32-unit step-up
  allowance are retained as nonblocking `step-riser` geometry; these are the
  individual risers between walkable stair treads, not full-height walls;
- remaining wall and steep-boundary faces use `blocking` behavior.

Picker inspection across the Disc 1 areas identifies code-10 faces as the
thin authored strips at staircase/elevation handoffs and doorway thresholds.
This matches the proven non-solid role of Shenmue I code-10 records. The
separate step-riser rule is geometry-based because S2 uses several native
flag values for the same short-riser topology. It keeps the original face and
attributes selectable in collision debug mode while allowing visual MT7
terrain sampling to perform the actual step-up. The broader meaning of each
FLDD attribute bit remains unresolved and is not
named or used speculatively.

Blocking vertical FLDD quads also expose their two-dimensional browser-space
segments. This lets Shenmue II use the same swept movement, penetration
escape, and `/stuck` clearance rules as Shenmue I instead of relying solely
on Babylon's triangle response.
