# Prepared scenery experiment

This local Dobuita experiment compiles decoded scenery into a ready-to-render
bundle. It does not change `/play`, publish assets, or connect to the game server.
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
5. **Compare 18 views** sequentially checks three camera positions at day,
   evening, and night in summer and winter. It reports RGB differences and 143
   vertical ground rays per case, plus three-second daytime timing samples.
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
- Original face ranges and picking bounds survive batching. Geometry is flattened
  for rendering, not for interactive model-hierarchy inspection.
- Loading the bundle uploads ready geometry and textures. It does not parse MT5
  models or merge meshes again. A schema and binary SHA-256 detect stale/mixed or
  corrupted output. Input model/texture-pack hashes are recorded in the manifest.

The compiler mutates a disposable source scene. It is not a generic scene saver.
WebGL 2 is required for the texture-array path; WebGPU is not implemented.
Unsupported materials, animated geometry, and nonstandard vertex buffers fail
explicitly. Per-texture variant ownership is not supported by this lab.

## Initial rendered evidence

Local Chromium development run, 1440×900 viewport and 1440×770 canvas, standard
resolution, MSAA 4×, native Dobuita point lights, no NPCs or gameplay. Original
means the existing runtime's static batching, not an artificially unoptimized
baseline. Mean CPU timings are short samples and depend on hardware/load.

| Fixed view | Original CPU ms/frame | Bundle CPU ms/frame | Original draws | Bundle draws |
| --- | ---: | ---: | ---: | ---: |
| Along the street | 4.30 | 1.55 | 1,032 | 413 |
| Opposite direction | 1.36 | 0.73 | 235 | 88 |
| Overview | 2.19 | 1.90 | 429 | 134 |

An additional alternating bundle/original/bundle/original run at a nearby fixed
position measured 1.16–1.31 ms versus 3.58–4.54 ms. Warm local load time was
437–453 ms for the bundle versus 1,212–1,263 ms for the original path; this
does not measure internet transfer time. Both paths returned to baseline
mesh/material/texture counts after each load/unload cycle in this lab.
Timing varied between runs (especially the overview); draw counts were stable
at each fixed position. Do not extrapolate these short samples to every machine.

Across all included resident layers, 4,269 source meshes become 517 bundle meshes
(the existing runtime batching produces about 2,004). The bundle has 236 unique
decoded textures and 12 texture-array groups. Output is approximately 33 MiB
uncompressed, including the manifest; it is not yet a download-size optimization.

The 18 rendered pairs had at most 17 pixels out of 1,108,800 with a channel
difference greater than 8/255. Mean channel differences were below 0.001/255.
All sampled ground hit/miss results and heights agreed within 0.0001 world units
(120 hits and 23 misses per case).
These are bounded checks, not proof covering every position or device.

## Boundary before gameplay adoption

This proves a useful scenery-rendering reduction, **not** a full-game FPS result.
The lab excludes NPCs, player animation, runtime props, doors, scripts, audio,
multiplayer, weather effects, and holiday placements. Their ownership must remain
separate when integrating a bundle; they must not be baked into static scenery.
In particular, this does not prove door interactions or character movement.

The next integration should be an opt-in Dobuita loader using this bundle for
static map roots while retaining the existing owners for everything else. Verify
real gameplay, loading cancellation/cleanup, cache versioning, lighting, travel,
interactions, and low-end hardware before changing the default loader. Keep the
original parser for individual-model inspection and producing bundles. A robust
cross-device bundle format and publication pipeline are separate follow-up work.

Focused automated checks:

```sh
npm test -- tests/PreparedSceneryBundle.test.js tests/StaticWorldBatching.test.js tests/PvrMipmaps.test.js tests/SceneAssets.test.js
```

These cover resource deduplication, reproducible fixture output, independent
layers, ground picks, transparent ordering, corrupt input, mid-load cancellation,
failure cleanup, and empty model hierarchy disposal. The last issue was found
during this experiment: an empty Dobuita model previously left unowned invisible
hierarchy nodes in the scene even though the loader returned no model.
