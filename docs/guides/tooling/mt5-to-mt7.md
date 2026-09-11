# Experimental MT5 → MT7 conversion

This first pass converts **static MT5 geometry to a Dreamcast MT7 using a native
MT7 template**. It is not a general MT7 exporter, a character converter, or a
validated game-import pipeline. The target is Dreamcast, not Xbox/PC HD.

## Run

```sh
node tools/assets/convert_mt5_to_mt7.mjs /path/to/model.MT5 \
  .disc-work/conversion/model.MT7 --template /path/to/native-model.MT7
```

The template must have the same hierarchy topology and mesh ownership, and
embedded textures matching the source by eight-byte ID **and exact PVRT bytes**.
An equivalent item present in both games is a useful starting point. Source
vertices, UVs, strip lengths, and transforms can differ; triangle topology does
not need to match the template. Neither input is modified. Existing outputs and
reports are refused, including attempts to overwrite the inputs.

Outputs:

- `model.MT7`: source geometry and transforms in a rebuilt MT7 container.
- `model.MT7.json`: input/output SHA-256 hashes, counts, conversion mode, and
  explicit limitations. Parser validation happens before either file is written.

Example with locally extracted Big Philip files:

```sh
node tools/assets/convert_mt5_to_mt7.mjs \
  extracted_disc3_v2/data/MODEL/ITEM/GACO1IRG.MT5 \
  .disc-work/conversion/big-philip.MT7 \
  --template .disc-work/shenmue2-models/models/S2DC_D1_GLOBAL_ITEM_GACO1IRI.MT7
```

Little Philip uses `GACOKIRG.MT5` and `GACOKIRI.MT7` instead. These paths are
examples of local disc extraction output, not files included in the repository.

## What is translated and what is inherited

`tools/assets/mt5_to_mt7.js` reuses `Mt5Loader.readModel/readPolygons` with strict
export validation. It consumes **raw source-space** vertices, normals, UVs, and
signed strips, not browser meshes with reflected coordinates or rendering fixes.
It rebuilds node/mesh pointers and mesh bounds and preserves source transforms.

The native template supplies its signature, node IDs, mesh flags, texture table,
TXT7 texture data, and 80-byte material headers. Materials are selected within
each template node by texture ID; ambiguous matches are rejected. This is an
explicit template material policy, **not a complete translation of MT5 draw
state**. Native IDs are not inferred from MT5 flags. Source and template mirror
flags must match.

Output uses full 32-byte vertex records, adopting the first full-record strip
opcode from the corresponding donor material. The two control bits in the
float V word are cleared. Pointer alignment, opcode variants, those control
bits, and other native header/runtime requirements still need original-game
execution validation. Passing our reader is not proof of that compatibility.

Currently rejected: character controller hierarchies, parent-vertex references,
external NAME/PKF textures, non-UV/environment-mapped polygons, vertex colors or
material tints, unsupported stream commands, incompatible template structures,
and FACE/CLSG or other trailing sections. No animation or gameplay data is ported.
Do not use this to replace a character and expect its original moveset to work.

## Evidence and checks

Layouts follow the existing MT5 runtime reader and `src/Mt7Parser.js`, whose
provenance and remaining gaps are described in
[Shenmue II models](../shenmue2-models.md). Native opaque fields are supplied by
the user's template; the tests contain authored synthetic data, not retail bytes.

```sh
node --test tests/Mt5ToMt7.test.js tests/Mt5Loader.test.js tests/Mt7Parser.test.js
```

Tests cover deterministic conversion, relocated hierarchy pointers, source-space
coordinates, UVs, winding, texture preservation, malformed/unsupported input,
and CLI overwrite protection. Optional local retail checks cover Big Philip and
Little Philip: each output has 464 triangles, 242 unique positions matching its
native counterpart within source float precision, and identical texture bytes.
The original games use different strip ordering; matching those counts is not
claimed as byte-identical or triangle-for-triangle native serialization.

A local Chromium comparison also rendered converted Big Philip and the native
Shenmue II item side by side with the real `Mt7Loader` and decoded PVR texture.
Both were visible and textured; shading differences remain, so this is not a
pixel-identical comparison. This browser check does not validate native-game
execution of the emitted binary.

**Next step:** validate one converted static item in an isolated copy of the
original game or emulator, then recover native stream/header requirements before
expanding the supported subset or removing the template requirement.
