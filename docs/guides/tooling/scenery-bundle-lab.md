# Prepared scenery

The local build tool compiles decoded Shenmue I and II map scenery into ready-to-render
bundles, with reusable rigid models for supported doors and vending machines.
Dobuita additionally includes its audited fixed placements. Local `/play/` uses
available bundles by default; production uses the build-pinned R2 catalog.
The build command does not publish assets. Registration and publication are
documented in [runtime assets](../runtime-assets.md).
The purpose is to test whether fewer independently drawn pieces reduce CPU work
without changing the scene's appearance.

## Test in the actual game

Run `npm run dev:all`, then build the bundles from a second terminal:

```sh
npm run build:scenery -- --all
```

This command uses the normal decoders with Babylon's non-rendering `NullEngine`;
it does not open a browser. It reads assets from the running local Vite server.
Set `SCENERY_ASSET_ORIGIN` if that server uses a port other than 5173.
Output goes to `.disc-work/scenery-bundle/<world>/world.json` and `world.bin`
(Git-ignored). For one zone, use `npm run build:scenery -- mfsy`; no argument
builds Dobuita. The bulk builder uses isolated processes with a 1 GiB Node heap
ceiling each, selecting 2, 4 or 6 workers from current CPU utilization. Use
`--shenmue1` or `--shenmue2` instead of `--all` to rebuild one game's zones. Tests
remain serial and memory-limited through the usual test launcher.

Then open <http://127.0.0.1:5173/play/> (use your configured Vite
port). Travel normally between the supported zones below. Their maps
load from the corresponding bundle. Supported doors and vending machines instantiate
prepared model templates, retaining independent pivots, picking and gameplay
state. NPCs, shutters, interactions, vehicles and unsupported worlds keep their normal gameplay
owners. No URL parameter is required. Use `?scenery=original` only when comparing
against the ordinary asset loader. Development reads editable local bundles;
production reads immutable R2 versions. Production ownership checks use the
registered policy hashes and never request development-only tooling files.
If a supported world's manifest returns 404, the game reports the missing bundle
in the console and loads original assets. Other request failures, stale or malformed
manifests, and missing binary payloads remain errors; they never silently fall back.
Travel releases the bundle's geometry, materials, and textures normally.
Changed placement or schedule inputs require rebuilding rather than silently
loading a stale bundle. The dev server reads the ignored bundle directly;
production builds include only the small version catalog, not extracted bundles.

## Zone coverage

The shared preparation plan uses the game's existing world definitions,
composition layers and model catalog. A changed filename selection, variant
profile, collision identity or placement record rejects the stale bundle.
Harbor and Forklift Playground share one bundle after their contracts are
verified identical; their player spawns and gameplay modes stay separate.

| Zone | Build key | Decoded scenery meshes | Prepared scenery meshes |
| --- | --- | ---: | ---: |
| Dobuita | `dobuita` | 4,335 | 524 |
| Hazuki Residence Grounds | `exterior` | 1,540 | 136 |
| Hazuki Residence Interior | `interior` | 631 | 176 |
| You Arcade | `arcade` | 768 | 176 |
| Yamanose | `yamanose` | 1,360 | 222 |
| Sakuragaoka | `sakuragaoka` | 2,213 | 567 |
| New Yokosuka Harbor / Forklift Playground | `mfsy` | 4,056 | 690 |
| Old Warehouse District | `mksg` | 1,612 | 222 |
| Old Warehouse No. 8 | `ms08` | 707 | 72 |
| Combat Practice | `mfbt` | 785 | 164 |
| Forklift Races | `ma00race` | 4,165 | 843 |
| Opening Vision — Shenhua and the Hawk | `op02` | 413 | 187 |
| Introduction — murder, mail, dream/awakening | `op00` | 1,336 | 342 |

These counts include inactive resident layers, not only pieces visible in one
frame. They compare decoded source parts with offline batching, not measured
FPS or the already-batched ordinary game's draw count. Original collision
rules and time/season/weather selection remain authoritative. Only Dobuita's
fixed-prop audit grants permission to bake placements into the map; elsewhere
placements remain independently owned even when their models are prepared.

Unreviewed Shenmue I interiors with interactive resident geometry and other
cutscene-only stages remain on their original loaders. Their effects and ownership need a
separate audit before admitting them, not merely another filename allowlist.

### Shenmue II

All 134 MT7 destinations registered in `/play/` across Discs 1–4 are supported.
Their source selection is the same `shenmue2WorldSceneRecords` used by the ordinary
loader: 789 MAPM/PROP model records, including 184 prop hierarchies. Disc variants
and multi-pack scenes such as Shenhua's House remain distinct. Build a single
zone with its world ID, for example `npm run build:scenery -- s2d4qgbt`.

Static MAPM geometry uses the shared texture deduplication/array and spatial
batching compiler. PROP retains native node offsets, parent transforms and door
pivots; its parts are not baked into streets. The ordinary door interaction and
FLDD collision owners still run after loading. Day/evening/night roots remain
independent under `WorldMapLayerState`. Animated water/fountain layers retain
their source UV-scroll definitions and separate mutable texture samplers, with
disposal tied to their root. MT7's material, two-sided normal and alpha-test
policies are preserved rather than replaced with MT5's alpha-to-coverage policy.

Examples of decoded source pieces versus prepared meshes (not FPS or runtime
draw-call comparisons): Bar Swing (Disc 1), 5,123 → 769; Worker's Pier,
21,708 → 2,548. PROP hierarchy meshes are included in both totals.

Run `npm run test:scenery -- --shenmue2` for serial source/bundle geometry,
layer, ground-support, native-door and scrolling-texture comparisons. For the
actual-game smoke test across all four discs, add
`PLAYWRIGHT_PREPARED_GAME=shenmue2` to the browser command below. The separate
`tests/e2e/prepared-shenmue2-rendering.spec.js` compares matched source/bundle
frames, including opposite camera views and evening layers. Both browser tests
require `PLAYWRIGHT_PREPARED_SCENERY=true` and local bundles.

This prepares scenery only: it does not add NPC/story/door coverage to later
discs where gameplay has not implemented those systems. The asset viewer still
uses original models to preserve individual-part inspection.

The full 134-zone source/bundle check passes geometry, layer, ownership and
cleanup comparisons, including all 17 registered doors and six animated map
layers. It reports these existing source-world issues separately (bundling does
not change their spawn or collision data):

- `s2aka3`, Fortune's Pier Free Stay Lodge: configured spawn `(0, 0, 0)` has no ground support.
- `s2wes1`, Slot House W: configured spawn `(-116.700, 100.800, -117.700)` has no ground support.
- `s2d3qbaa`, Great View Herbs: configured spawn `(-208.200, 103.600, 197.300)` overlaps native walls.

The validator requires matching source/bundle support and wall clearance even
for these records; it does not claim their source spawn is valid. Float32-baked
geometry comparisons allow eight float32 steps at the coordinate's magnitude,
with a minimum tolerance of 0.0001 units. This accounts for rounding when
flattening large MT7 coordinates, not missing hits or changed layer ownership.

Hardware-rendered Chromium checks also pass for Bar Swing (Discs 1 and 2),
Worker's Pier, Golden Quarter, Thousand White Quarter, Blue Dragon Garden and
Shenhua's House. Actual `/play/` travel and original-loader fallback were tested
with mocked account/network services. A separate 21-view comparison uses fixed
cameras, time layers and water clocks; mean channel differences on 64×64 frame
samples ranged from 0.003 to 0.740 on a 0–255 scale. These are close rendered
comparisons, not pixel-identical output or a measured FPS gain. The rebuilt
Shenmue I interior/arcade/combat/forklift browser smoke test passes as well.

### Interiors and activity areas

Hazuki's interior uses prepared map geometry while furniture, drawers, doors,
household interactions and actors retain their normal placement/script owners.
Rebuild it with `npm run build:scenery -- interior`.

You Arcade uses the same compiler, with explicit runtime-owned surface selectors
derived from its existing fixture definitions. Signs, posters and replaced screen
faces retain their original mesh names, face numbers, UVs and ordinary materials.
The jukebox's source map retains its native node hierarchy. Surrounding static
scenery can still combine; the attract videos, score displays, lights, moving
parts and playable arcade games are created normally after loading. A missing
fixture selector fails the build instead of silently dropping the fixture.
Rebuild it with `npm run build:scenery -- arcade`.

Combat Practice (`mfbt`), Forklift Playground (`ma00`, using the `mfsy` harbor
bundle), and Forklift Races (`ma00race`, using its separate race-course bundle)
already use the shared prepared loader. The bundles contain their scenery, not
the fighters, forklifts, cargo, race logic or input handling.

The source/bundle validator checks all five worlds, including their ground and
controller support, travel-spawn wall clearance, environment variants and cleanup.
For the arcade it additionally compares all 22 selected fixture meshes' geometry,
UVs, transforms and face indices, and exercises the real screen suppression and
native jukebox selection (1,250 retained triangles). These are headless checks;
they do not by themselves demonstrate rendered correctness or higher FPS.

The opt-in browser smoke test travels through all five worlds in the actual
application, verifies successful bundle requests and floor positions, captures
rendered views, and checks the arcade screens and combat mode. Account HTTP and
multiplayer transport are mocked; vehicle snapshots use the existing authored
spawn records. This checks vehicle loading alongside the scenery, not a complete
online race or combat encounter. With the bundles built and Vite running:

```sh
PLAYWRIGHT_PREPARED_SCENERY=true E2E_APP_URL=http://127.0.0.1:5173 \
  PLAYWRIGHT_SKIP_WEB_SERVER=true node scripts/testing/run-tests.mjs playwright \
  tests/e2e/prepared-scenery.spec.js --project=chromium
```

This smoke test passed on hardware-rendered Chromium, together with the arcade's
prepared-door geometry, independent opening and cleanup check. It does not
measure FPS, video decoding cost, or character-animation performance.

### Intro cutscenes

Default local prepared loading also covers all four new-character opening
scenes. `op02` supplies Shenhua and the hawk; the murder, mail and awakening
scenes share `op00`. No separate cutscene renderer or playback implementation
is introduced. For a focused rebuild, use `npm run build:scenery -- op00` and
`npm run build:scenery -- op02`.

Playback and preparation share `IntroductionEnvironments.js`, which consumes the
existing generated packages. Resident scene objects, attached props and
native-node geometry masks retain their original transform hierarchy and node
addresses. Whole-map visibility remains independently controlled. The shared
variant owner marks individual seasonal surfaces as unbatchable, so OP00's snow
can still switch without retaining hundreds of separate ordinary ground pieces.
Characters, motion, faces, package-created effects, cameras and audio keep their
normal loaders and owners. These bundles speed up environment preparation and
reduce scenery submissions; they do not eliminate actor preparation costs.

## Optional scenery-only comparison lab

Install the normal client dependencies and configure
[runtime assets](../runtime-assets.md), then run from the repository root:

```sh
npm run lab:scenery
```

Open <http://127.0.0.1:5190/tools/assets/scenery-bundle-lab.html>.
Use `SCENERY_LAB_PORT` to select a different port if necessary. This separate
loopback server does not replace an existing game or Vite process.

1. Click **Build bundle** once. This Dobuita-only lab uses the normal model decoder and saves
   `.disc-work/scenery-bundle/dobuita/world.json` and `world.bin` locally (Git-ignored).
2. Switch between **Load original** and **Load bundle**. Both use the same camera,
   normal lighting/material pipeline, time/season rules, and ground-picking index.
3. Use the view dropdown or WASD and mouse to inspect. Change time and season
   to check window lighting and snow.
4. **Measure 5 seconds** reports CPU time spent inside `scene.render()` and draw
   operations. It is not GPU time or a full-game FPS benchmark.
5. **Compare 24 views** sequentially checks four camera positions at day,
   evening, and night in summer and winter. It reports RGB differences and 143
   vertical ground rays per case, 336 rays through the fixed objects, and
   three-second daytime timing samples.
   Pixel comparisons allow inspection of differences; they are not an automatic
   claim of perfect visual equivalence. Results appear below the canvas and in
   the browser console. Keep the window modest: snapshots have a 128 MiB limit.

Close the page when finished to stop rendering, and Ctrl-C the tool's terminal
to stop its server. The tool disables hot reload; restart it after code changes.
Only one scene and one test workload run at a time.

## What changes in the bundle

- Equal decoded textures and material settings share resources.
- Compatible opaque textures become layers in texture arrays. Each layer keeps
  its own repeating edges and mipmaps; a naive texture atlas would bleed into
  neighboring pictures on repeating walls and roofs.
- The existing static-world batcher combines compatible scenery in 128-unit
  spatial cells, rather than the normal 32-unit cells. Normal gameplay retains
  its existing default. Larger cells trade some fine-grained culling for fewer
  draw submissions; this is a prototype choice, not a universal tuning result.
- Whole model roots remain independent: day/night windows, seasonal roads, and
  background layers continue to use the shared variant system. Transparent
  surfaces retain ordinary materials and their separate mesh ordering. Native
  alpha-aware mipmaps and alpha-to-coverage use the destination engine's MSAA
  setting, not the offline compiler's framebuffer settings.
- Audited fixed placements form a separate permanent layer. Compatible pieces
  can combine across those object roots, but retain their non-terrain collision
  roles and per-face placement/model identity. Ordinary gameplay batching still
  excludes every runtime placement; only this compiler grants explicit approval.
- Original face ranges and picking bounds survive batching. Geometry is flattened
  for rendering, not for interactive model-hierarchy inspection.
- Rigid templates keep their original hierarchy and native render keys. Repeated
  copies share geometry, textures and materials, but never their transforms or
  interaction state. Door leaves are not merged into buildings. The normal
  placement owner registers doors and vending machines without parsing those
  models again; it also skips their redundant raw-asset prefetches.
- Loading the bundle uploads ready geometry and textures. It does not parse MT5/MT7
  models or merge meshes again. A schema and binary SHA-256 detect stale/mixed or
  corrupted output. Input model/texture-pack hashes are recorded in the manifest.

The compiler mutates a disposable source scene. It is not a generic scene saver.
WebGL 2 is required for the texture-array path; WebGPU is not implemented.
Unsupported materials, animated geometry, and nonstandard vertex buffers fail
explicitly. Per-texture variant surfaces remain separate under the shared
variant owner; they are not merged with the permanent surfaces around them.

## Placement ownership audit

The policy is intentionally narrower than "not moving right now." It checks the
current placement manifest, behavior registry, travel routes, scheduled-object
catalog, and the existing source-backed passive-fixture evidence. It covers all
154 Dobuita placements, plus the 16 separately scheduled shutters:

| Ownership | Treatment |
| --- | --- |
| 55 MAPINFO type-1 doorway/collision proxies | Include as fixed scenery, preserving collision roles |
| HDCA, the parked pink van | Include: passive, root-only geometry; three matching native captures and only one initial enable call |
| 65 type-2 door leaves | Use prepared templates; keep under the door interaction owner |
| 13 BN shop-decoration records | Keep separate: the native shutter table pairs these with BS objects; no direct transform call is not proof of independent visibility |
| 5 vending machines | Use prepared templates; keep under the vending interaction owner |
| 15 other props | Keep separate: interactions, animation, state, or travel ownership |
| 16 scheduled BS shutters | Keep under the clock/schedule owner |

In particular, CAR7 has `behavior.kind: "none"` but `stateDependent: true` and
`inactiveBelowMap: true`; it must not be admitted as permanent scenery. WAGK has
a fixed transform but script-controlled visibility. New/unreviewed records are
retained rather than guessed static. The lab omits retained objects in **both**
comparison paths; it does not emulate their gameplay systems.

Sources and producing tools:

- [Placement provenance](../../research/shenmue1/d000-object-placement.md) and
  [placement manifest](../../../play/data/d000-runtime-placements.json).
- [Current scheduled-object catalog](../../../play/data/shenmue1-scheduled-scene-objects.json),
  consumed through the same catalog reader as gameplay.
- [Passive-fixture evidence](../../../tools/evidence/d000-static-fixtures.json),
  produced by [the native fixture audit](../../../tools/worlds/audit_d000_static_fixtures.js).

The bundle records every included/excluded placement and its reason, plus hashes
of policy input files and decoded model/texture inputs. Changes to placement or
ownership evidence make the lab reject stale output and ask for a rebuild.
Experimental schema v5 adds native MT7 prop-node identity and map-effect ownership
to the existing controlled hierarchies and normal-transform preservation. Rebuild older
bundles with `npm run build:scenery -- --all`.
Admission requires all placements of a model to use the same source/texture
identity and a supported rigid owner. Authored animation, scripts, hidden-state
records, characters, and unreviewed owners are not assumed safe for sharing.

## Prepared-model checks

With the local asset server running and the bundle built:

```sh
npm run test:scenery-models
```

Pass a build key to check another world, or `-- --all` to check them serially.
The validator also loads required non-prepared dependencies through the ordinary
placement path, such as Sakuragaoka's separate vending-machine bin.

This sequential, non-rendering check loads all 35 original models and compares
their vertex buffers, native render keys and world transforms with all 70
prepared placements, plus decoded texture pixels, sampler and surface settings.
It exercises the actual placement registration and door
pose methods, checks that opening each door leaves other copies unchanged, and
checks cleanup against baseline resource counts.

The current Dobuita output replaces 407 per-placement geometry copies with 257
shared geometries. The scenery portion remains 524 meshes; templates add about
1 MiB of binary data, bringing the binary to 32,159,528 bytes and the shared
texture catalog to 259 entries. This is a loading/memory improvement, not mesh
instancing or a claim of fewer door draw calls. These checks passed, along with
focused cancellation and failure-cleanup tests. Dobuita's v3 gameplay was
subsequently checked by the user. Current interior/activity rendered coverage is
described above; the headless checks do not establish visual parity in every zone.

For all prepared map geometry and environment variants, run:

```sh
npm run test:scenery -- --all
```

This reads the served bundles through the actual gameplay preparation plan,
compares root/triangle counts against freshly decoded source assets, and checks
81 ground rays for six time/season/weather cases per bundle. It also runs the
player controller's actual terrain-support queries at those points, requires
walkable ground at each travel spawn, checks native wall clearance at the spawn,
and checks resource cleanup. Matching ray hits alone cannot establish that an
arrival is safe: both loaders previously agreed that MKSG's old travel point
had no floor. Its exploration spawn now uses a verified native player pose near
the entrance (see [capture provenance](../../../tools/evidence/mksg-warehouse-door-transitions.json)).

For cinematic worlds, authored camera/actor entry positions are not travel
spawns, so the spawn-ground and wall-clearance requirements do not apply. The
same geometry/normal and variant comparisons still run, plus real map-layer and
node-mask ownership, resident scene-object movement/cancellation, and attachment
registration checks for all four intro packages. These are headless checks, not
proof of visual equivalence, complete playback, or an FPS improvement. A fresh
rendered intro pass remains the final verification step.
NullEngine cannot render texture-array shaders, so this check
uses ordinary materials over the unchanged geometry for picking and visibility
only; it is not visual or FPS proof. The template check separately compares
original texture pixels and surface settings. Expanding coverage exposed unused
MT5 pack textures and materials from discarded surfaces; the shared decoder now
releases those allocations while preserving every live or disabled surface.
All nine unique bundles passed these checks: 4,374 ground samples across 54
environment cases, plus 103 prepared placements (91 doors and 12 vending
machines). Harbor's playground alias reuses its verified bundle rather than
being counted again. Focused tests also cover loading alpha surfaces with and
without MSAA, independently of the compiler's settings.

## Earlier scenery-only rendered evidence (v2)

Local Chromium development run, 1440×900 viewport and 1440×770 canvas, standard
resolution, MSAA 4×, native Dobuita point lights, no NPCs or gameplay. Original
means the existing runtime's static batching, not an artificially unoptimized
baseline. Mean CPU timings are short samples and depend on hardware/load.

| Fixed view | Original CPU ms/frame | Bundle CPU ms/frame | Original draws | Bundle draws |
| --- | ---: | ---: | ---: | ---: |
| Along the street | 3.36 | 1.09 | 1,071 | 421 |
| Opposite direction | 0.99 | 0.45 | 237 | 89 |
| Overview | 1.66 | 0.58 | 452 | 142 |
| Parked van | 2.84 | 0.96 | 1,010 | 393 |

These compare the full scenery bundle against the original path with the same
56 fixed placements. They do not isolate the incremental benefit of adding props
to the previously tested map-only bundle. A previous run of the same street view
measured 3.27 versus 1.04 ms. Do not extrapolate short samples to every machine.

Across all included resident layers, 4,335 source meshes become 524 bundle meshes.
The newly included placements contribute 66 source meshes, reduced to 7. The
bundle has 246 unique decoded textures and 12 texture-array groups. Output is
approximately 33 MiB uncompressed, including the manifest; it is not yet a
download-size optimization. Two real builds produced identical binary and manifest
bytes. Both loading paths and compilation returned to baseline mesh, transform,
material, and texture counts after cleanup. An observed warm local load took
1,371 ms for the original path and 442 ms for the bundle; this single observation
does not measure internet transfer time.

The 24 rendered pairs had at most 17 pixels out of 1,108,800 with a channel
difference greater than 8/255. Mean channel differences were below 0.001/255.
All sampled ground hit/miss results and heights agreed within 0.0001 world units
(120 hits and 23 misses per case). All 336 fixed-object rays matched in distance
and original placement identity. This includes the nonuniform scales in the
MAPINFO proxy records; these objects are not incorrectly converted into terrain.
These are bounded checks, not proof covering every position or device.

## Boundaries before wider rollout

This proves a useful scenery-rendering reduction, **not** a full-game FPS result.
The lab excludes NPCs, player animation, the 98 retained runtime props/doors,
16 scheduled shutters, scripts, audio, multiplayer, weather effects, and holiday
placements. Their ownership must remain separate when integrating a bundle;
they must not be baked into static scenery.
In particular, this does not prove door interactions or character movement.

The default local Dobuita loader is integrated and filters the approved fixed-placement
IDs from the ordinary loader to avoid drawing them twice. The v3 loader also
prepares 70 of the 98 retained placements; the other 28 and all 16 scheduled
shutters still use their original asset path. Existing gameplay owners remain
authoritative throughout. Verify
real gameplay, loading cancellation/cleanup, cache versioning, lighting, travel,
interactions, and low-end hardware before making bundles the production default. Keep the
original parser for individual-model inspection and producing bundles. A robust
cross-device bundle format and publication pipeline are separate follow-up work.

Focused automated checks:

```sh
npm test -- tests/PreparedSceneryBundle.test.js tests/PreparedSceneryRuntime.test.js tests/StaticWorldBatching.test.js tests/PvrMipmaps.test.js tests/SceneAssets.test.js tests/SceneryPlacementPolicy.test.js tests/PlacementRuntime.test.js tests/DoorInteractions.test.js
```

These cover resource deduplication, reproducible fixture output, independent
layers, ground picks, transparent ordering, corrupt input, mid-load cancellation,
failure cleanup, conservative placement admission, cross-object batching with
source identity, and empty model hierarchy disposal. The last issue was found
during this experiment: an empty Dobuita model previously left unowned invisible
hierarchy nodes in the scene even though the loader returned no model.
