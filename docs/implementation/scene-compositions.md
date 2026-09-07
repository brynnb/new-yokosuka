# Scene compositions

`/play` builds outdoor scenes from a small, curated catalog instead of
reconstructing the Dreamcast room-loader state on every entry. The catalog is
[`src/data/scene-compositions.json`](../../src/data/scene-compositions.json), and
[`src/SceneCompositions.js`](../../src/SceneCompositions.js) is its shared
resolver.

This is metadata, not an asset pack. A composition contains canonical model
filenames and environment rules. Models and texture packs continue to be
loaded from their existing browser asset locations, so using one model in
several scenes does not copy its binary.

## Why this layer exists

The native game splits a visible room across MAP resources, variant layers,
room scripts, and event-specific packages. Archive membership is useful
provenance, but it is not by itself a reliable browser render plan. In
particular, a cutscene package may contain compiled copies of ordinary area
geometry whose textures or layer-registration semantics cannot yet be mapped
exactly.

There are only a few outdoor environment families in the current game. A
reviewable composition table is therefore preferable to scattering filename
filters and season rules through the viewer, world loader, and cutscene code.

The catalog currently defines six families:

- Hazuki Residence Grounds;
- Yamanose;
- Sakuragaoka;
- Dobuita;
- New Yokosuka Harbor; and
- Old Warehouse District.

## Data model

An environment `source` declares:

- its canonical model prefix;
- always-present base assets;
- assets kept resident by live gameplay;
- mutually exclusive time, season, and weather groups;
- permanently excluded or unresolved layers; and
- a provenance note when selection required interpretation.

A named `scene` selects one source, fixes or inherits an environment context,
and adds event-only overlays. The resolver returns an exact set of canonical
filenames plus the source's visibility profile. It supports two loading modes:

- live worlds load the declared resident set, allowing time, season, and
  weather to change without a room reload;
- fixed scenes load only the selected member of each variant group.

The same source groups also derive the compatibility data used by model
visibility, world filename filters, and timed map layers. Those systems no
longer maintain independent copies of the same MAP-number tables.

Runtime visibility is the intersection of separate owners:

```text
composition selection
  + time / season / weather variant
  + native room or per-shot state
  + explicit browser cutaway
  = visible model
```

No general environment update should enable an unrelated native-hidden or
cutaway-hidden root.

## OP00 introduction

`op00-introduction` belongs to its own `op00-cinematic` family. It fixes the
context to daytime, winter, and snow. Although OP00 is an instanced stage, it
has outdoor sky exposure and therefore uses the grey `air07.png` winter sky,
winter clear color, and snow precipitation used by `/play` weather.

The resident environment is the self-contained native OP00 stage:

```text
OMO, JIMENHAL, NAIB, NIWAKAL, OMADO, OOSAKI, JYUU
```

Residency is not visibility. `JIMENHAL` is the shared foundation and directly
requests the `snow_b` surface. `NIWAKAL` requests no snow surface and duplicates
hundreds of `JIMENHAL` triangles at the same world coordinates. The shared
browser composition therefore treats `NIWAKAL` as the warm-season yard layer:
summer enables it and suppresses `snow_b`; winter suppresses it and enables
`snow_b`. The fixed OP00 introduction consequently renders six environment
roots, while all seven remain available as individually inspectable source
assets.

`OP99.AFS` pairs PAKF texture entry 26 with the entry-27
`JIMENHAL/NAIB/NIWAKAL/OMADO` package, entry 28 with `OOSAKI`, and entry 30
with `JYUU`. Those packages contain the opening's authored foliage,
snow-patched ground, and winter surfaces. They are flattened without
payload changes into `S1_OP00_textures.bin`; `JIMENHAL` even requests the
external texture ID `snow_b` directly. OP00 does not name BETD or JHD0 and has
no alternate seasonal texture-pack instruction. The fixed winter context
therefore controls sky and precipitation, while the native OP00
geometry/texture pairing supplies the snow-covered stage.

Authored objects add the gates, residence doors, black car, broken sign, and
Dragon Mirror. `OMADO` remains loaded so the cutscene cutaway owner can control
it. Do not add BETD or JHD0 map roots to this composition: they are separate
world coordinate systems and introduce replacement geometry rather than an
OP00 seasonal texture swap.

## Adding or correcting a scene

1. Identify the normal environment family and the best validated source.
2. Record base, resident, and variant model roots in the catalog.
3. Add only genuinely event-specific architecture or props as scene overlays.
4. Keep excluded native resources in provenance metadata; do not delete or
   duplicate binaries to make the render plan simpler.
5. Add resolver tests proving that each fixed group selects exactly one member
   and that known conflicting roots are absent.
6. Keep native per-shot visibility and object lifecycle data in the cutscene
   package. Composition metadata is not a substitute for timeline state.

When better native evidence changes a decision, update the catalog and its
provenance note. Callers should depend on the composition ID, not reproduce its
filename list.
