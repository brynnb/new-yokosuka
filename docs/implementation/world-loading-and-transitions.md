# World loading and transitions

This document is the canonical architecture guide for how `/play` identifies,
loads, changes, and unloads worlds. It describes the implementation on `main`.
The detailed reverse-engineering reports linked throughout this guide remain
the sources for native evidence; they are not separate descriptions of the
application lifecycle.

World time and visual variants are documented separately in
[`world-time-and-variants.md`](world-time-and-variants.md). Multiplayer room
and persistence behavior belongs in
[`multiplayer-server.md`](multiplayer-server.md).

## World identity

The browser does not use one identifier for every concern. A world entry in
`play/config/worlds.js` can contain several identities:

| Field | Meaning |
| --- | --- |
| `id` | Stable browser, saved-location, transition, and multiplayer room ID |
| `nativeArea` | Original four-character map identity used by dialogue, native layers, collision lookup, and evidence |
| `prefix` | Extracted asset namespace passed to the scene loader |
| `includeFile` | Exact predicate selecting resident geometry inside that namespace |
| `collisionArea` | Optional native collision and footstep area override when geometry is reused |
| `assetArea` | Present on generated interiors and JHD0, but currently not consumed by the runtime |

These fields must not be collapsed. For example, browser world `ma00` is a
forklift playground with native identity `MA00`, but it deliberately loads
`S2_MFSY` harbor geometry and uses `MFSY` collision and footstep data. The
`arcade` world loads the Disc 3 `S3_DGCT` assets, while generated world `dgct`
represents the native Disc 1 interior. Both have native identity `DGCT`, but
they are different browser worlds.

The prefix currently also implies the Shenmue I disc for native collision
selection through the pattern `S1_`, `S2_`, or `S3_`. That is a convention in
`NativeWorldCollision.js`, not a general game/disc model.

## Current browser catalog

`WORLDS` combines explicit Shenmue I worlds, generated supported interiors,
Shenmue II traversal and exploration records from all four discs, and a custom
GLB world. The registry is authoritative; the generated
[area/world reference](../reference/areas-and-worlds.generated.md) supplies the
readable inventory. Do not maintain a second world count or copied ID list here.

The loader distinguishes `assetFormat: "MT7"`, `assetFormat: "GLB"`, and the
default MT5 path. Shenmue II exploration records come from
`play/data/shenmue2-exploration-worlds.json`; its traversal definitions join
`src/Shenmue2BoundaryTransitionData.js` through the world registry.

Generated interiors derive their label, asset prefix, native entry spawn,
return door, collision identity, and placement metadata from the generated
transition data. They are not a manually duplicated list of store rooms.

Membership in `WORLDS` means the browser can resolve and attempt to load the
world. It does not mean that the world appears in the sidebar, has scheduled
actors, has every scripted interaction, or has a reachable player transition.
The transition registry also contains exact routes whose source worlds are not
yet present in `WORLDS`; those records remain dormant evidence rather than
creating incomplete worlds automatically.

## Configuration contract

Every loadable world requires:

- a stable `id`, display labels, and `nativeArea`;
- a default browser `spawn` and `yaw`;
- a placement array, even when empty.

Asset selection depends on the loader: MT5 worlds use `prefix` and `includeFile`;
MT7 worlds select reviewed catalog records through `Shenmue2SceneRecords.js`;
GLB worlds declare `assetUrl` and optional asset scale. Do not require an MT5
filename predicate to make an MT7 or GLB world loadable.

Optional fields enable additional behavior:

- `interior`, `dynamicTimeOfDay`, and `fixedTimeOfDayIndex` control lighting;
- `timedMapLayers` selects paired resident day/evening geometry when no exact
  native layer program exists;
- `waterHeight` creates the shared water surface;
- `terrainMaxHeight` restricts terrain ray selection, currently for JOMO;
- `vehicle`, forklift spawn data, and cargo data enable forklift worlds;
- `collisionArea`, `collisionDisc`, and `nativeCollisionField` select a native
  collision variant independently of the displayed asset prefix.

Map resource selection is intentionally area-specific. Numbered `MAP` files
can mean time/weather alternatives in one area and spatial tiles in another.
`src/WorldMapFiles.js` therefore uses reviewed allowlists or predicates instead
of a universal “load every MAP number” rule. Examples include excluding
Dobuita's unresolved holiday layers, loading both members of neighborhood and
harbor day/evening pairs, and treating all MKSG numbered maps as spatial parts
of one world.

## Load lifecycle

`WorldRuntime` owns world selection and readiness. `WorldSessionRuntime` owns
cancellation and transaction ordering, while `PlayWorldLifecycle` supplies
world-specific setup, teardown, and travel integration. `PlayApplication`
connects those owners.
`WorldLoader` supplies gameplay placements, actors and collision around the
shared MT5/MT7 scene loader in `src/rendering/SceneAssets.js`.
`src/catalog.js` is the asset viewer's catalog and camera/UI adapter.

The normal cross-world sequence is:

1. Leave the current multiplayer room, clear remote players, lock the world
   transaction, and show the destination loading screen.
2. Stop or clear world-scoped runtime state: dialogue, interactions, scheduled
   actors, vehicles and cargo, pool/combat state, debug views, arcade fixtures,
   sounds, and water.
3. Load the destination's scheduled-actor browser shard. Start player, placement,
   current NPC, and collision downloads ahead of their ordered assembly stages.
4. Dispatch geometry loading by `assetFormat`: the MT5 path selects filenames
   from `models.json` using `prefix` plus `includeFile`; the MT7 path selects
   reviewed records from the Shenmue II catalog; the GLB path loads its declared
   asset container. MT5 and MT7 share scene-resource ownership and cancellation.
5. Run any area-specific pre-placement hook.
6. Instantiate the world's placement manifest, register object behaviors and
   transitions, and require the placement audit to succeed.
7. Run any area-specific post-placement hook and load scheduled-actor render
   assets for residents currently present, static residents, and script-owned
   actors. Other residents hydrate when authoritative presence arrives.
8. Load the active native collision shard. Prepare visual terrain metadata and
   build native horizontal collision when a definition exists.
9. Commit the active world, apply map-layer state, create water and interaction
   anchors, load vehicle/cargo assets when requested, and switch world-scoped
   UI, lighting, music, and audio.
10. Ensure the playable character runtime exists, reset the controller at the
    transition entry or world default, restore camera/control state, publish a
    new presence, and finish the loading presentation.

The scene loader disposes the previous geometry and clears its texture and
material object caches before attaching the next scene. Immutable CPU-side
asset data can survive that disposal. The higher-level runtime
clears systems whose state is not owned by those Babylon roots.

### Download reuse and optional preparation

`src/AssetCache.js` coalesces binary asset requests across consumers, runs at
most four downloads at once, retries a transient failure once, and bounds each
attempt to 30 seconds. One cancelled subscriber does not cancel another's
request; the last subscriber cancels the underlying fetch. Failed responses and
HTML fallbacks are not retained. Mutable JSON catalogs still use normal HTTP
freshness rather than the binary cache.

The binary LRU retains at most 64 MiB, and the decoded-texture LRU at most
32 MiB. These are retention limits, not total browser-memory limits: active
scenes and motion banks can hold their own references. Texture decoding reuses
CPU pixels but supplies each Babylon texture a mutable copy. No GPU resources,
actor transforms, or animation state are shared between visits.

Scheduled actors initially instantiate only the selected model for current
authoritative residents. Static and script-owned actors keep their existing
readiness guarantees. Later arrivals and model changes use a serialized,
cancellable assembly queue; stale models stay disabled while their replacement
loads. Only residents seen during this visit prefetch their alternate model
bytes, at lower priority. Native activity actors remain ready synchronously
because native event transactions cannot wait for model downloads.

`PlayerMotionLibrary` keeps source motion banks compact and decodes individual
sequences on demand. `AnimationStateMachine` prepares basic movement up front;
optional clips and complete emote phase groups are built once when needed.
Combat's bank and opponent are prepared when entering `mfbt`, with combat clip
baking split across browser yields under the loading cover. Forklift worlds
prepare their driver bank before mode binding. Small interaction-bank bytes
remain available across worlds for synchronous native events and network
emotes, but their sequence decoding and clip baking are deferred.

Pool shaders and ball lighting start when pool equipment is bound, not when
the application constructs its pool coordinator. The cushion image is decoded
when a pool game starts. Leaving a room invalidates pending shader bindings.

Prefetch only performs independent reads: scene geometry, placement attachment,
NPC assembly, collision, lighting, and player readiness still commit in their
established order. Failures and cancellation must be observed before revealing
the destination. Test this ordering and stale-completion cleanup when changing
the pipeline.

### Loading responsiveness

`PlayLoopRuntime` skips scene rendering while `WorldRuntime.ready` is false.
The HTML loading screen owns presentation during assembly; rendering partial
geometry behind it repeatedly traverses meshes and compiles intermediate
material configurations. The loop keeps its clock current and discards pending
interpolation steps so loading time does not become a simulation catch-up burst.
After readiness, `LoadingScreen.finish` waits through a paint before revealing
the canvas. This is a presentation boundary, not a guarantee that every shader
for an off-camera object has compiled.

Shared `NativeSceneLighting.create` is asynchronous. Both `/play` and the asset
viewer await its bounded material batches; cancellation or clearing prevents
an old batch from modifying a replacement scene. Babylon's light-budget setter
already invalidates submeshes. Do not add unconditional `unfreeze` or a second
`markAsDirty`: each can scan the entire scene for every material. Keep geometry
disposal before light disposal for the same reason.

For profiling, measure asset loading, lighting preparation, player setup, and
the first rendered frames separately. Include long main-thread tasks as well
as total duration. Use one bounded browser capture and close its owned browser
afterward; software-rendered headless timings are diagnostic comparisons, not
representative production GPU benchmarks.

### Cancellation and repeated selection

Only one world transaction may commit at a time. A newer request aborts the
active `AbortController`, increments `state.currentLoadId`, and replaces any
older queued request. Both the high-level loader and individual scene-file
loads check these guards so a late asset response cannot attach stale geometry
after a newer selection wins.

Selecting the already active world does not reload its assets. It resets the
player to that world's default spawn while preserving captured controller
state. A same-world selection is rejected while a door transition is pending,
because the door must finish its authored operation first.

## Scene geometry and placement

Resident scene geometry and placed objects are separate inputs:

- `loadScene` loads reviewed world `MAP` roots from the global model catalog.
- `PlacementRuntime` loads distinct models named by a generated or reviewed
  placement manifest, creates one instance per transform, and registers its
  interaction behavior.
- scheduled residents are loaded from separate per-world shards and receive
  their authoritative position and activity state from the server.
- room-owned actors with no daily schedule are loaded from the reviewed native
  room-actor registry. They use their source-backed room transform locally;
  the DURN fortune teller is the current example.
- conditional story and cameo actors belong to the native event runtime rather
  than either resident source. They must not be made permanently visible merely
  because a room script references them.
- invisible browser interaction anchors exist only for systems such as arcade
  cabinets and the MJQ pool table whose pick volume is not a placed native
  runtime object.

Placement loading groups records by model and processes up to six model groups
concurrently. Each root retains the source placement record and filename.
After behavior registration, `RuntimePlacementAudit` verifies that every
required record produced an instance; a partial placement load fails the world
transaction rather than silently omitting objects.

The manifests combine several evidence families depending on the area:

- settled Dreamcast RAM `TASK`/HMDL transforms;
- static MAPINFO door or character records;
- statically recovered script branch tables;
- narrowly identified browser-authored reconstruction fixtures.

Those provenance distinctions remain in the manifests and evidence reports.
The runtime consumes the reviewed result; it does not infer placements from
model names or proximity while loading.

See the focused evidence guides for
[runtime RAM placement](../research/shenmue1/runtime-object-placement.md),
[Dobuita placement](../research/shenmue1/d000-object-placement.md), and
[BETD placement](../research/shenmue1/betd-object-placement.md).

## Terrain and collision

The playable controller uses a hybrid collision model:

- enabled visual MAP triangles supply ground height, slopes, steps, terrain
  picking, and camera blockers;
- Shenmue I `COLS/COLI` records supply authoritative horizontal boundaries;
- placed runtime objects can act as visual colliders when native horizontal
  collision is unavailable;
- native door-code boundaries follow or disable with their matched door;
- code-10 stair handoff records are retained for debugging but do not block;
- development collision tools operate on the same attached metadata.

When a native collision definition exists, `prepareWorldCollision` avoids
also treating the full visual scene as a blanket horizontal blocker. Without
one, reviewed visual-map and placement rules provide the fallback collision.
In both cases, visual geometry remains pickable for terrain queries.

`NativeWorldCollision.js` resolves a shard by `collisionArea || nativeArea`, a
disc variant by explicit `collisionDisc` or the asset prefix, and a field by
`nativeCollisionField` or the shard's default field. The normal free-roam
field is `0000`; alternate field semantics are not inferred from their number.

The exact extraction formats, swept-boundary behavior, penetration recovery,
door binding, `/stuck` policy, and incoming Shenmue II FLDD design are in
[`native-world-collision.md`](../research/shenmue1/native-world-collision.md).

## Time-controlled resident layers

Time and weather alternatives are loaded as resident geometry so changing the
clock does not reload the world. `WorldMapLayerState` maps loaded numbered MAP
roots to either:

- exact area rules generated in `play/data/native-map-layer-states.json`; or
- a reviewed `timedMapLayers` day/evening pairing from the world definition.

The manager enables or disables roots when the authoritative game minute
changes. It does not reinterpret MKSG's spatial tiles or other uncontrolled
numbered layers as time variants. See
[`world-time-and-variants.md`](world-time-and-variants.md) for the clock and
lighting contract.

## Transition model

A playable transition needs two independently established sides:

1. a physical source that the player can click or cross; and
2. a destination browser world with an entry position and facing.

An extracted operation `0x0030(scene, area, entry)` proves a native destination
request. It does not by itself prove which visible door, event region, story
branch, or state predicate invokes it. The browser does not turn the larger
all-disc destination catalog into portals by proximity.

### Door transitions

`src/MapTransitions.js` currently retains 55 door-route records. A route is
matched by source browser world and either:

- an exact logical door selector; or
- an object tag plus model name, allowing only the game-disc prefix to differ
  when the native area/model stem is otherwise the same.

All retained route sources and destinations now have browser world definitions.
The formerly missing `jabe`, `mkyu`, and `ms8s` interiors use their extracted
map layers, native collision areas, default player placements, and exact return
doors. Their reverse browser edges are scoped to the corresponding exterior
static doors instead of exposing nearby or visually similar doors.

At interaction time, `TravelTransitions.beginDoor` captures the player's
controller state, locks movement, closes a door that was already open, and
starts its reconstructed opening. The world switch begins only after the door
reports its fully open pose. Unknown or unproven doors remain ordinary,
explicitly locked, or noninteractive according to their placement behavior.

### Boundary transitions

`src/BoundaryTransitions.js` currently exposes eight walk-over routes:

- seven supported native event-volume routes with exact destination entries;
- one measured directional Sakuragaoka dirt-path fallback, retained because
  the decoded native volume does not align with the rendered threshold.

Native volumes are browser-space parallelograms derived from MAPINFO event
records. The detector triggers on first entry or on a movement segment that
crosses the volume, preventing high-speed tunnelling. It tracks which volumes
already contain the player so spawning inside one does not immediately bounce
them back.

The measured fallback is directional: the player must approach, cross the
finite portal span, and remain inside its vertical tolerance. This prevents a
nearby crossing in the opposite direction from firing the route.

### Object and direct travel

The one current object route is Dobuita's captured bus to a browser-selected
harbor position. Its source placement is exact, but its destination is labeled
as browser-authored rather than a proven native entry.

The sidebar calls the same `selectWorld` transaction without transition
evidence and therefore uses the world's default spawn. It is a development and
exploration facility, not proof of native adjacency.

Sidebar destinations marked as interiors are listed explicitly in
`play/config/world-access-policy.json` and remain accessible 24 hours a day.
That reviewed list currently contains Hazuki Residence Interior, Cinema, You
Arcade, and MJQ Jazz Bar. It is projected into the browser/server timed-access
manifest so future public-hours rules cannot accidentally close development
travel to those worlds. The override authorizes access; it does not create new
native door associations or modify visual shop state.

### Handoff behavior

Door and boundary handoffs preserve run/autorun, no-clip where development
allows it, camera perspective, and third-person distance. The destination
transition spawn overrides the world's default spawn. The boundary detector is
reset at the new position so the arrival point cannot immediately retrigger a
volume.

See [`map-transition-trace.md`](../research/shenmue1/map-transition-trace.md) for the
native request structure, all-disc extraction, physical-source joins, exact
entry evidence, and explicitly reconstructed reverse edges.

## Saved location and multiplayer

At startup, the saved server character world and transform are the sole source
of truth when the world ID exists in `WORLDS`; otherwise the browser falls back
to `exterior`. Player location and camera state are not stored in local storage.
This keeps the character-selection location and the world loaded after entry
consistent with the same server character record.

The multiplayer server independently validates world IDs before accepting
presence. Its local source now accepts the previously listed storefront IDs
such as `daza`, `dbhb`, and `drht`, as well as generated Shenmue II exploration
worlds. Do not use the retired 25-of-34 inventory to decide whether a room is
online. Inspect the standalone server's `internal/realtime/hub.go` and generated
`shenmue2_exploration_worlds.json` when adding or changing a world.

Run `node scripts/check-server-contract.mjs` against the intended server checkout
to verify the shared contracts, including Shenmue II exploration IDs. This does
not audit every explicit browser-world alias or prove the deployed server is at
that revision. Test the actual room join and saved-location behavior before release.

The normal browser handoff sends `leave_world`, loads locally, and then joins
the destination with its first accepted presence. The destination on-foot
location is picked up by the server's two-second persistence loop; the normal
handoff does not synchronously commit it. A direct presence change between
rooms without a preceding leave does trigger an immediate flush. Vehicle
transforms are never used as the character's durable respawn. See
[`multiplayer-server.md`](multiplayer-server.md) for the full authority and
persistence boundary.

## Code and data ownership

- `play/config/worlds.js`: browser world registry and generated Dobuita
  interiors.
- `src/WorldMapFiles.js`: reviewed resident MAP-file selection.
- `play/world/WorldLoader.js`: reusable world asset, placement, actor, and
  collision load sequence.
- `src/rendering/SceneAssets.js`: shared MT5/MT7 loading and cancellation.
- `src/rendering/SceneResources.js`: common loader configuration, materials,
  static freezing and geometry/cache disposal.
- `play/world/WorldSessionRuntime.js`: transaction ordering and cancellation.
- `play/PlayApplication.js`: world-specific integration.
- `play/world/PlacementRuntime.js`: placed object instantiation, behavior
  registration, and audit.
- `play/world/WorldCollision.js` and `NativeWorldCollision.js`: visual terrain
  and native boundary setup.
- `src/rendering/WorldMapLayerState.js`: resident time-layer switching in both
  applications.
- `src/MapTransitions.js`: door and object transition registry.
- `src/BoundaryTransitions.js`: walk-over transition registry and detector.
- `play/world/TravelTransitions.js`: movement lock, door completion, and world
  handoff.
- `play/data/native-map-transitions.json`: generated browser transition and
  entry evidence.
- `play/data/*-runtime-placements.json`: reviewed placed-object manifests.
- standalone server `internal/realtime/hub.go`: multiplayer world allowlist and room
  changes.

## Adding or changing a world

1. Establish a distinct browser ID, native game/area identity, asset source,
   and collision source. Do not assume they are the same.
2. Add or generate the `WORLDS` definition with an explicit reviewed MAP-file
   predicate, spawn, and placement manifest.
3. Add the same browser ID to the multiplayer server contract or explicitly
   document why the world is offline-only.
4. Generate and review placements; keep scheduled actors separate from static
   scene objects.
5. Select native collision by game, disc/variant, area, and field. Verify visual
   terrain independently.
6. Add a transition only when its physical source and destination entry have
   the required evidence. Label browser-authored handoffs as such.
7. Define time, audio, water, vehicle, interaction, and special gameplay policy
   explicitly rather than branching only on a filename.
8. Extend world, placement, collision, transition, and persistence tests before
   exposing the route.

## Shenmue II integration boundary

Shenmue II support changes more than the model extension. Its assets use
namespaces such as `S2DC_D1_WTA0_...`, MT7/MAPM/PROP scene records, and FLDD
collision faces. Keep these integration boundaries explicit:

- MT5 filename predicates are not MT7 scene-composition rules.
- A four-character native area is not a globally unique browser world ID.
- Shenmue I placed-object manifests are not the MT7 PROP hierarchy.
- Collision selection must retain its game and exact disc/field evidence.
- Browser registration and server acceptance are separate contracts.

Playable Shenmue II worlds are already integrated. `WorldLoader.loadShenmue2Scene`
uses `fetchShenmue2Catalog`, `shenmue2WorldSceneRecords`, and `loadMt7Scene`;
it does not run the MT5 catalog path. Generated worlds retain their native disc,
area, scene composition, arrival, and collision selection. See the
[Shenmue II workflow](../guides/shenmue2-models.md) for the producing pipeline.

Do not infer game identity from `S1_`/`S2_` alone: those digits mean discs in the
Shenmue I namespace, whereas `S2DC` identifies Shenmue II Dreamcast. Share the
scene-loading transaction without treating different games' native rules as
interchangeable.

Shenmue II time, transition, spawn, layer, and persistence semantics should
remain game-specific until their native behavior is established. Sharing the
transaction and lifecycle machinery is appropriate; silently sharing Shenmue I
world rules is not.

## Verification

The principal checks are:

```sh
node --test \
  tests/WorldLoader.test.js \
  tests/WorldMapFiles.test.js \
  tests/WorldMapLayerState.test.js \
  tests/WorldCollision.test.js \
  tests/NativeWorldCollision.test.js \
  tests/PlacementRuntime.test.js \
  tests/RuntimePlacementAudit.test.js \
  tests/MapTransitions.test.js \
  tests/MapTransitionCatalog.test.js \
  tests/MapTransitionCoverage.test.js \
  tests/MapTransitionObjects.test.js \
  tests/NativeMapTransitions.test.js \
  tests/BoundaryTransitions.test.js \
  tests/TravelTransitions.test.js \
  tests/MapEntryPoints.test.js \
  tests/PlayerPortalInventory.test.js
```

Additional per-area placement and completeness tests should run whenever their
world definitions or generated manifests change.
