# Shenmue II Dreamcast models

The Shenmue II Dreamcast model path is deliberately separate from the
Shenmue I `public/models` rebuild. It never deletes or replaces viewer assets.

## Disc staging (1–4)

Use each disc's GDI descriptor with its original referenced track files.
For example, for Disc 2:

```bash
python3 -m tools.assets.gditools3 -i /path/to/disc-2.gdi \
  -o .disc-work/shenmue2-disc2-extracted --extract-all --silent

python3 -m tools.assets.extract_shenmue2_models \
  --disc-root .disc-work/shenmue2-disc2-extracted \
  --out .disc-work/shenmue2-disc2-models --namespace S2DC_D2
```

Repeat with the matching disc number and namespace for Discs 1, 3 and 4.
All scenario directories under `data/SCENE` are discovered automatically.
Disc, scenario, area, archive and original member index remain separate
metadata. Repeated member names within an archive receive an `_ENTRYnnnn`
suffix so distinct source models cannot overwrite each other.

Combine the staged discs into one local library:

```bash
python3 -m tools.assets.merge_shenmue2_models \
  .disc-work/shenmue2-disc1-models \
  .disc-work/shenmue2-disc2-models \
  .disc-work/shenmue2-disc3-models \
  .disc-work/shenmue2-disc4-models \
  --out .disc-work/shenmue2-models
```

The merger checks file hashes, sizes, texture-pack ownership and filename
collisions before replacing its output. Input directories are preserved.
Disc-specific copies are intentionally retained, even when their bytes match.

Add original entrance candidates to each staged catalog before merging, or to
the combined catalog afterward:

```bash
node tools/worlds/build_shenmue2_viewpoints.mjs \
  .disc-work/shenmue2-disc2-extracted .disc-work/shenmue2-models
```

The inspected European Discs 2–4 carry byte-identical numbered area tables for
all four scenarios. The tool selects `AREATBL<scenario>.BIN`, retains reciprocal
destination-entry candidates with record offsets and source hashes, and omits
areas without those tables. Re-run after staging, which rebuilds the catalogs.
It does not treat an outgoing route's coordinates as its destination's spawn:
area ownership is not explicit in these records, so candidates still require
geometry validation in the viewer.

The command writes:

- `models/*.MT7`: model members with archive and area names retained;
- `textures/*.bin`: companion PKF textures in authored TEXN order;
- `models.json`: source/member paths, hashes, signatures, model kinds, and
  texture-pack ownership.
- `viewer-models.json`: the sanitized browser/deployment catalog without local
  source paths or forensic-only hashes.

Unlike `tools/assets/sync_models.py`, this path preserves the real MT7 extension and
does not mislabel `MDL7`, `MDO7`, `MDP7`, or `MDC7` resources as MT5.

Loose models anywhere under `data` and the `CHRM`, `MAPM`, and `PROP` members
in PKS archives are included. This covers shared `MISC` resources as well as
scene archives. Loose `.MT7` files are transparently gzip-decoded when needed;
the staged bytes always begin with their real `MD*7` signature. Embedded
`TXT7`/`PVRT` sections remain inside their source models and are indexed by
`src/Mt7Parser.js`.

## Geometry audit and OBJ export

Audit every staged model:

```bash
node tools/assets/audit_mt7_models.js \
  .disc-work/shenmue2-disc1-models/models \
  --out .disc-work/shenmue2-disc1-models/mt7-audit.json
```

Audit node-to-texture binding and decode every external and embedded PVR:

```bash
node tools/assets/audit_mt7_textures.js \
  .disc-work/shenmue2-disc1-models \
  --out .disc-work/shenmue2-disc1-models/mt7-texture-audit.json
```

Exercise the actual Babylon viewer loader against a complete scene, prop,
character, and loose-model representative:

```bash
node tools/assets/validate_mt7_viewer.js .disc-work/shenmue2-disc1-models
```

Export one model without Blender, Wine, or an emulator:

```bash
node tools/assets/export_mt7_obj.js \
  .disc-work/shenmue2-disc1-models/models/S2DC_D1_WTA0_MPK00_MAP.MT7 \
  .disc-work/wta0-map.obj
```

MT7 `MAPM` materials retain authored lighting normals: Babylon's
`twoSidedLighting` is disabled for maps, independent of native culling mode.
The viewer and `/play` pass the extracted asset kind to the shared loader.
Character/prop back-face lighting remains separate. This preserves the map
lighting correction from `35badb66` without undoing the character treatment
added by `c0ec18ee6`; no per-disc conversion or map override is needed.

The parser handles:

- the four Dreamcast MT7 container signatures;
- texture metadata and embedded TXT7 sections;
- absolute parent/child/sibling node pointers;
- fixed-turn node rotations and hierarchical transforms;
- the same source-to-Babylon X reflection used by the MT5 path, applied to
  positions, normals, node translations, rotations, and strip winding;
- repeated 80-byte material headers and their independently sized vertex
  streams, terminated by the mesh's zero control word and total-vertex count;
- mesh texture indices stored at material-header offset `+0x20` (or `+0x38`
  from the start of the mesh for the first group), addressing
  the model-local texture table and its authored eight-byte IDs;
- the common 32-byte position/normal/UV records;
- compact 8-byte records whose signed second word references an earlier
  complete position/normal/UV vertex and whose `0x5f` first word retains the
  compact-record control value;
- strip triangulation, explicit `0x69`/`0x6a` triangle lists, and the winding
  bit carried by the batch type;
- strip-control bits stored in the low bits of the authored V word;
- format-aware PVR coordinate axes: ordinary twiddled textures use the
  viewer's V/U convention while `TWIDDLED_RECT` (`0x0d`) retains native U/V,
  matching byte-identical MT5/MT7 item pairs.

The coordinate rule has a cross-game oracle in the collection items. Disc 1
contains 167 global `ITEM/*I.MT7` models with a same-code Shenmue I
`ITEM/*G.MT5` counterpart; 113 pairs retain byte-identical complete PVR
payload lists. Comparing the authored UV sets selects unchanged raw MT5/MT7
U/V for 159 of the 167 pairs (the remaining partial or materially revised
models are not reliable global-set comparisons). Big Philip and Little Philip
are especially exact: each version has 242 unique positions and 464 triangles,
uses a byte-identical 256-by-256 PVR, and its MT7 UVs match the corresponding
MT5 raw UVs within the formats' quantization error. The visible difference was
therefore in the viewer conversion, not the models or textures: common
twiddled/VQ PVR data needs V/U, while format `0x0d` stays U/V. Sampler address
axes must be swapped with the coordinates as well.

The geometry reflection is the other half of this browser-space conversion.
`JUKW101G.CHRM` retains the You Arcade jukebox's authored geometry, UV ranges,
and mirror sampler states, but an MT7-only omission originally left its source
X coordinates unreflected. Asymmetric cabinet artwork consequently appeared
backward even though its UVs were valid. Reflecting the complete MT7 hierarchy
and winding exactly as the MT5 loader does corrects the jukebox and every other
MT7 model without a filename-specific texture override.

The exhaustive Disc 1 texture audit accounts for all 105,248 authored material
groups: 103,129 bind to a static disc texture and 2,119 carry the authored
`0xffffffff` no-texture sentinel. It reports zero missing bindings and
decodes all 14,775 external PKF textures and all 2,900 embedded TXT7 textures.
Scene texture slots come from the mesh material header and address each model's
local texture table. The table's authored eight-byte texture ID is then joined
to the companion PKF; PKF order is archive-wide and cannot be used as the
model-local texture index. A loose model whose declared core exactly matches
one archive model can inherit that archive's pack only when the match is
unambiguous.

Some texture-enabled groups use the no-table sentinel and instead address an
8-by-8 texture at Dreamcast VRAM address zero. The running game populates that
slot, so a companion PKF cannot resolve it. These groups can appear alongside
ordinary table-backed materials in the same model. The parser retains them as
`runtime-vram` geometry, including their vertices and PowerVR state. Models
made entirely from these groups are classified as
`runtime-textured-auxiliary` and Asset Viewer hides them by default rather
than displaying a fabricated white material. `WK09/MPK00/MAP04.MAPM` is one
such model. Its exact shadow, masking, or other auxiliary role remains a
runtime-research question; the classification deliberately does not guess.
Mixed models, such as `WN00/WNC0/MAP.MAPM`, keep rendering their ordinary
materials while hiding only the runtime-textured auxiliary groups.

MT7 PowerVR color-format 1 uses a compact lit vertex layout: a signed-byte
XYZ normal followed by packed ARGB base and offset colors. Decoding those
words as three float normals produced NaNs and made the authored harbor water
render black. The loader now decodes and uploads both the packed normal and
base color. Materials using the audited native ocean texture ID
`ea96c0718630305f` are classified as `water`, including water batches embedded
in otherwise mixed MAP models. They remain visible but are explicitly marked
non-terrain, non-colliding, and non-camera-blocking in `/play`.

On the audited European Disc 1, this stages 2,468 models: 1,454 scene/archive
models, nine shared archive models, and 1,005 loose models. Its 48,006 mesh
nodes contain 105,248 material groups; 18,412 nodes contain more than one.
The initial reader silently stopped after every node's first group. Parsing to
the explicit mesh terminator recovers another 333,245 strips, 1,598,129 vertex
records, and 931,639 triangles. For example, `GACO1KOI.MT7` grows from its two
container end faces to all 10 strips/40 authored vertices/20 triangles, exactly
matching Shenmue I's `GACO1KOG.MT5` container geometry.

103,125 material groups (97.98%) currently decode completely. Unsupported or
not-yet-understood vertex streams remain isolated to their independently sized
material group, so a bad group no longer hides later supported geometry in the
same node. Dreamcast vertex types `0x69` and `0x6a` are explicit triangle
lists: their header count is a triangle count followed by three ordinary
full/reference vertex records per triangle. This differs from the strip types,
whose count is the number of vertex records. Treating `0x69`/`0x6a` as an
unsupported strip command dropped the terminal face polygons from many retail
characters. `KP5_L` is the exact cross-platform oracle: its terminal `0x6a`
count of eight supplies the eight head triangles missing from the old decoder,
bringing the Dreamcast head to the Xbox conversion's exact 261 triangles.
The remaining 2,123 groups (2.02%) are reported as unclassified vertex
streams, not assumed to be triangle strips. The warning records the first
unhandled command word; the most frequent are `0x01`, `0x00`, `0x21`, `0x31`,
`0x7f`, and `0x39`, but those values are not promoted to format names until
their count and record layout are independently proven. Another 340 groups
currently stop on an invalid count, size mismatch, or bounds violation. Each
material group is explicitly sized, so these failures remain isolated and do
not prevent later material groups in the same mesh from loading.

## How the emulator helps

The instrumented Flycast workflow in
`docs/guides/emulator-research.md` is useful as independent ground truth,
not as an extraction dependency. A synchronized Shenmue II PVR capture can:

1. expose the final TA vertices, normals, UVs, winding, and texture state for a
   model containing an unresolved vertex batch;
2. let us align those emitted records to exact MT7 byte offsets;
3. locate the live MT7/XB reader in RAM and narrowly trace its source reads;
4. validate external texture-slot selection against captured VRAM.

The production parser should continue to work exclusively from disc files.
Runtime addresses and decoded TA data are evidence for the format, never
inputs required by the extractor. This follows the repository rule: use the
emulator to collect evidence, then reproduce the authored data and rules.

The initial static layout was cross-checked against the MIT-licensed
ShenmueDKSharp MT7 node definitions and the original
`mt5_extraction_tools/src/mt7` research implementation. Neither older mesh
reader completely handles the Dreamcast relative-reference stream, so the
parser here validates every pointer and record boundary across the full disc
corpus.

## Asset viewer

Vite prefers the combined `.disc-work/shenmue2-models` library, falling back
to `.disc-work/shenmue2-disc1-models` when only Disc 1 is staged. The development
server exposes the library through a dedicated local `/shenmue2/` route.
Open `/asset-viewer/?game=shenmue2`. The sidebar groups locations by disc and
region, keeping separate scenarios and archives distinct. **Load Area** loads
the area's `MPK00` archive when it contains environment geometry; otherwise
select an individual archive to
avoid superimposing alternative scenes. The viewer uses
`src/Mt7Loader.js` to display the supported MT7 geometry and PVR textures.
Shenmue I's catalog and `/models` route are unchanged.

For example, Shenhua's House (`Disc 4 → Guilin → KSH1`) keeps its environment
in `MPK01`: expand the location and use that archive's **Load All** button.
Its `MPK00` contains objects, while nested `MAP_*` archives include separate
scenes. The viewer does not infer a complete game-state composition from those
archive names.

For archive-group loads, the viewer checks entrance candidates against the
`MAPM` environment layers. A candidate must lie inside a compact environment
(at most 60 world units across its bounding-box diagonal), have a nearby floor
and ceiling, and have clear space at eye height. The camera starts 1.6 units
above the floor along the authored heading. These conservative distances are
viewer heuristics, not recovered Dreamcast camera settings. Large background
layers cannot determine the room bounds. Unverified entrances retain overview
framing; this is not a claim of universal interior coverage.

**Overview** frames all loaded geometry. **Interior view** returns to the
validated entrance and is disabled when none is available. Individual model
inspection keeps its normal object framing. This feature currently uses the
Shenmue II catalog; it does not change Shenmue I or `/play` cameras.

The European four-disc library contains 9,842 models: 2,468 from Disc 1,
2,718 from Disc 2, 2,336 from Disc 3 and 2,320 from Disc 4. These counts include
shared and loose models, not just maps. Disc 2 adds locations such as Beverly
Hills Wharf; Disc 3 includes Kowloon, and Disc 4 includes Guilin.
Full geometry audits of Discs 2–4 report no whole-file parse failures, but
approximately 2% of material groups remain unsupported or only partly decoded.
Their texture audits report no missing bindings or texture-decoding failures;
runtime-VRAM auxiliary groups retain the limitations described above.

The asset viewer exposes the full extracted library. `/play` additionally has
98 later-disc **exploration** destinations grouped by disc (43 on Disc 2,
35 on Disc 3 and 20 on Disc 4). They use distinct world IDs such as
`s2d3q100` so repeated areas cannot overwrite Disc 1 or each other.
These are map exploration, not a full Shenmue II story implementation: use the
travel menu to change areas. Later-disc door/boundary routing, story scripts,
NPC schedules, conversations and special gameplay are not implemented here.
Extraction does not publish anything; original disc/model binaries remain in
ignored `.disc-work` storage.

Generate collision variants and the grounded exploration catalog:

```bash
for disc in 2 3 4; do
  SHENMUE2_DISC="$disc" \
  SHENMUE2_DISC_EXTRACTED_ROOT=".disc-work/shenmue2-disc${disc}-extracted" \
    node tools/worlds/build_shenmue2_world_collision_catalog.mjs
done
node tools/worlds/build_shenmue2_play_worlds.mjs \
  .disc-work/shenmue2-models public/data/native-collisions \
  play/data/shenmue2-exploration-worlds.json ../new-yokosuka-server
node tools/reference/generate_identifier_area_reference.mjs
node scripts/check-server-contract.mjs
```

Build entrance candidates as described above before generating playable worlds.
The final optional argument updates the separate server's explicit world-ID
allowlist; rebuild that server before joining the new worlds. Collision export
merges disc variants rather than replacing Disc 1. Exploration worlds require
their exact disc variant and fail loading instead of silently using another
disc's collision mesh.

Starting poses come from local FLDD exit controls or reciprocal AREATBL entry
candidates, validated against walkable native collision faces. Grounding may
adjust Y but does not invent X/Z or headings. `MPK00` supplies the environment
when available; otherwise `MPK01` can supply it alongside `MPK00` props.
Nested alternate/cutscene archives are excluded from these default compositions.
The catalog records exclusions and reasons: 64 other extracted scenes currently
lack a primary environment, matching collision, or a grounded authored entry.
For example, Stone Pit (`KES1`) remains viewer-only pending arrival evidence.
These checks prove data consistency, not complete visual/gameplay fidelity.

The `/play` travel catalog includes supported exploration worlds from all four
discs, not only the original Disc 1 outdoor set. Generated records choose the
reviewed primary environment composition described above, sharing its extracted
PKF texture pack. `PROP` model hierarchies retain the game's authored
world transforms and supply the placed static scene objects without an
emulator or hand-authored coordinates. They remain separate from terrain
batching so future door and object behaviors can target their original nodes;
FLDD remains the authoritative collision source. Standalone event copies are
intentionally excluded.

A model can be opened directly for repeatable renderer checks:

```text
/asset-viewer/?game=shenmue2&model=S2DC_D1_WTA0_MPK00_MAP03.MT7
```

To use a staging directory elsewhere, start Vite with
`SHENMUE2_MODEL_PATH=/absolute/path/to/staged-output`. Extracted binaries stay
out of production bundles. Validate and publish that staging directory with
the shared Shenmue asset uploader:

```bash
npm run upload:assets -- \
  --game s2 \
  --s2-root /absolute/path/to/staged-output \
  --dry-run

# Remove --dry-run after reviewing the object count and destination.
```

The deployment catalog is `viewer-models.json`; the uploader publishes it as
`shenmue/shenmue2/models.json` only after all files below
`shenmue/shenmue2/models/` and `shenmue/shenmue2/textures/` succeed.
