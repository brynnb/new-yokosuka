# Prepared scenery experiment

This local Dobuita experiment compiles decoded map scenery and audited fixed
placements into a ready-to-render bundle. It does not change `/play`, publish
assets, or connect to the game server.
The purpose is to test whether fewer independently drawn pieces reduce CPU work
without changing the scene's appearance.

## Run and compare

Install the normal client dependencies and configure
[runtime assets](../runtime-assets.md), then run from the repository root:

```sh
npm run lab:scenery
```

Open <http://127.0.0.1:5190/tools/assets/scenery-bundle-lab.html>.
Use `SCENERY_LAB_PORT` to select a different port if necessary. This separate
loopback server does not replace an existing game or Vite process.

1. Click **Build bundle** once. This uses the normal model decoder and saves
   `.disc-work/scenery-bundle/world.json` and `world.bin` locally (Git-ignored).
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
  alpha-aware mipmaps and alpha-to-coverage are preserved.
- Audited fixed placements form a separate permanent layer. Compatible pieces
  can combine across those object roots, but retain their non-terrain collision
  roles and per-face placement/model identity. Ordinary gameplay batching still
  excludes every runtime placement; only this compiler grants explicit approval.
- Original face ranges and picking bounds survive batching. Geometry is flattened
  for rendering, not for interactive model-hierarchy inspection.
- Loading the bundle uploads ready geometry and textures. It does not parse MT5
  models or merge meshes again. A schema and binary SHA-256 detect stale/mixed or
  corrupted output. Input model/texture-pack hashes are recorded in the manifest.

The compiler mutates a disposable source scene. It is not a generic scene saver.
WebGL 2 is required for the texture-array path; WebGPU is not implemented.
Unsupported materials, animated geometry, and nonstandard vertex buffers fail
explicitly. Per-texture variant ownership is not supported by this lab.

## Placement ownership audit

The policy is intentionally narrower than "not moving right now." It checks the
current placement manifest, behavior registry, travel routes, scheduled-object
catalog, and the existing source-backed passive-fixture evidence. It covers all
154 Dobuita placements, plus the 16 separately scheduled shutters:

| Ownership | Treatment |
| --- | --- |
| 55 MAPINFO type-1 doorway/collision proxies | Include as fixed scenery, preserving collision roles |
| HDCA, the parked pink van | Include: passive, root-only geometry; three matching native captures and only one initial enable call |
| 65 type-2 door leaves | Keep under the door interaction owner |
| 13 BN shop-decoration records | Keep separate: the native shutter table pairs these with BS objects; no direct transform call is not proof of independent visibility |
| 20 other props | Keep separate: interactions, animation, state, or travel ownership |
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
Experimental schema v2 replaces the earlier map-only bundle; rebuild it once.

## Rendered evidence

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

## Boundary before gameplay adoption

This proves a useful scenery-rendering reduction, **not** a full-game FPS result.
The lab excludes NPCs, player animation, the 98 retained runtime props/doors,
16 scheduled shutters, scripts, audio, multiplayer, weather effects, and holiday
placements. Their ownership must remain separate when integrating a bundle;
they must not be baked into static scenery.
In particular, this does not prove door interactions or character movement.

The next integration should be an opt-in Dobuita loader using this bundle for
static map roots and approved fixed placements, filtering those exact placement
IDs from the ordinary loader to avoid drawing them twice. Retain the existing
owners for everything else. Verify
real gameplay, loading cancellation/cleanup, cache versioning, lighting, travel,
interactions, and low-end hardware before changing the default loader. Keep the
original parser for individual-model inspection and producing bundles. A robust
cross-device bundle format and publication pipeline are separate follow-up work.

Focused automated checks:

```sh
npm test -- tests/PreparedSceneryBundle.test.js tests/StaticWorldBatching.test.js tests/PvrMipmaps.test.js tests/SceneAssets.test.js tests/SceneryPlacementPolicy.test.js tests/PlacementRuntime.test.js
```

These cover resource deduplication, reproducible fixture output, independent
layers, ground picks, transparent ordering, corrupt input, mid-load cancellation,
failure cleanup, conservative placement admission, cross-object batching with
source identity, and empty model hierarchy disposal. The last issue was found
during this experiment: an empty Dobuita model previously left unowned invisible
hierarchy nodes in the scene even though the loader returned no model.
